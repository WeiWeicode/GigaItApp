<script setup lang="ts">
/**
 * 人員清單:非系統管理員只看得到自己部門;寫入按鈕依權限顯示,後端另外檢查「只能管理同部門且職級較低者」。
 * 篩選與分頁由後端處理(每次只取一頁)。
 */
import { computed, reactive, ref } from 'vue';
import { useAuth } from '@/api/auth';
import { describeError, http } from '@/api/http';
import { fromNow, LEVEL_TONE } from '@/api/format';
import type { Department, Level, LevelCode, PagedResponse, UserRow } from '@/api/types';
import { usePaged } from '@/composables/usePaged';
import { confirm, toast } from '@/ui';

const { me } = useAuth();
type UserPage = PagedResponse<UserRow> & { scope: 'all' | 'dept'; levels: Level[]; departments: Department[] };
const PAGE_SIZE = 10;
const filters = reactive({ q: '', dept: '', level: '' });
const list = usePaged<UserRow, UserPage>((page, pageSize) => http.get<UserPage>('/users', { query: { ...filters, page, pageSize } }), {
  pageSize: PAGE_SIZE,
  watch: () => ({ ...filters }),
});
const { data, loading, error, reload } = list;

const deptName = (code: string) => data.value?.departments.find((d) => d.code === code)?.name ?? code;
const levelName = (code: string) => data.value?.levels.find((l) => l.code === code)?.name ?? code;
const deptOptions = computed(() => (data.value?.departments ?? []).map((d) => ({ label: d.name, value: d.code })));
const myRank = computed(() => me.value?.level.rank ?? 0);
/** 可指派的職級:比自己低(admin 全部) */
const levelOptions = computed(() =>
  (data.value?.levels ?? []).filter((l) => me.value?.level.code === 'admin' || l.rank < myRank.value).map((l) => ({ label: l.name, value: l.code })),
);
const canManage = (u: UserRow) => {
  if (!me.value || u.id === me.value.user.id) return false;
  if (me.value.level.code === 'admin') return true;
  const rank = data.value?.levels.find((l) => l.code === u.level)?.rank ?? 0;
  return u.deptCode === me.value.department?.code && rank < myRank.value;
};

// ---- 新增 / 編輯 ----
const formOpen = ref(false);
const editing = ref<UserRow | null>(null);
const form = reactive({ employeeNo: '', name: '', email: '', title: '', deptCode: '', level: 'engineer' as LevelCode });
const saving = ref(false);
function openCreate() {
  editing.value = null;
  Object.assign(form, { employeeNo: '', name: '', email: '', title: '', deptCode: me.value?.department?.code ?? '', level: 'engineer' });
  formOpen.value = true;
}
function openEdit(u: UserRow) {
  editing.value = u;
  Object.assign(form, { employeeNo: u.employeeNo, name: u.name, email: u.email ?? '', title: u.title ?? '', deptCode: u.deptCode, level: u.level });
  formOpen.value = true;
}
const tempPassword = ref<{ emp: string; password: string } | null>(null);
async function save() {
  saving.value = true;
  const body = { name: form.name, email: form.email || null, title: form.title || null, deptCode: form.deptCode, level: form.level };
  try {
    if (editing.value) {
      await http.patch(`/users/${editing.value.id}`, body);
      toast.success('已更新人員資料');
    } else {
      const r = await http.post<{ tempPassword: string }>('/users', { ...body, employeeNo: form.employeeNo });
      tempPassword.value = { emp: form.employeeNo, password: r.tempPassword };
    }
    formOpen.value = false;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}

async function toggleDisable(u: UserRow) {
  const disable = !u.isDisabled;
  const ok = await confirm({
    title: `${disable ? '停用' : '啟用'} ${u.name}(${u.employeeNo})?`,
    message: disable ? '停用後此帳號會立即登出且無法登入。' : '啟用後可再次登入。',
    tone: disable ? 'danger' : 'primary',
    confirmText: disable ? '停用' : '啟用',
  });
  if (!ok) return;
  try {
    await http.post(`/users/${u.id}/${disable ? 'disable' : 'enable'}`);
    toast.success(disable ? '已停用' : '已啟用', `${u.name}(${u.employeeNo})`);
    await reload();
  } catch (e) {
    toast.fromError(e);
  }
}

async function resetPassword(u: UserRow) {
  const ok = await confirm({ title: `重設 ${u.name} 的密碼?`, message: '會產生一組臨時密碼並登出此帳號的所有工作階段。', tone: 'danger', confirmText: '重設' });
  if (!ok) return;
  try {
    const r = await http.post<{ tempPassword: string }>(`/users/${u.id}/reset-password`);
    tempPassword.value = { emp: u.employeeNo, password: r.tempPassword };
  } catch (e) {
    toast.fromError(e);
  }
}
async function copyTemp() {
  await navigator.clipboard?.writeText(tempPassword.value!.password).catch(() => undefined);
  toast.success('已複製臨時密碼');
}
const tempOpen = computed({ get: () => !!tempPassword.value, set: (v) => !v && (tempPassword.value = null) });
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GBadge v-if="data" :tone="data.scope === 'all' ? 'success' : 'info'" icon="eye">{{
        data.scope === 'all' ? '可檢視全部部門' : `只顯示${deptName(me?.department?.code ?? '')}`
      }}</GBadge>
      <GButton v-can="'sys.user.create'" variant="primary" icon="user-plus" @click="openCreate">新增人員</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="搜尋工號、姓名、Email、職稱" clearable class="grow" />
        <GSelect v-if="data?.scope === 'all'" v-model="filters.dept" :options="deptOptions" placeholder="全部部門" icon="building" />
        <GSegmented
          v-model="filters.level"
          size="sm"
          :options="[{ label: '全部職級', value: '' }, ...(data?.levels ?? []).map((l) => ({ label: l.name, value: l.code }))]"
        />
      </div>
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="users" title="無法載入人員" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="人員" :subtitle="`${list.total.value} 人`" icon="users">
      <GTable
        v-model:page="list.page.value"
        :loading="loading && !data"
        :rows="list.items.value"
        :total="list.total.value"
        row-key="id"
        :page-size="PAGE_SIZE"
        :columns="[
          { key: 'name', label: '人員' },
          { key: 'deptCode', label: '部門' },
          { key: 'level', label: '職級' },
          { key: 'isDisabled', label: '狀態' },
          { key: 'lastLoginAt', label: '最後登入', hideSm: true },
          { key: 'actions', label: '', align: 'right' },
        ]"
      >
        <template #cell-name="{ row }">
          <div class="who">
            <GAvatar :name="row.name" :size="34" />
            <div>
              <strong>{{ row.name }}</strong>
              <div class="faint xs">
                <span class="mono">{{ row.employeeNo }}</span> · {{ row.title ?? '—' }}
              </div>
            </div>
          </div>
        </template>
        <template #cell-deptCode="{ row }"
          ><GBadge tone="neutral" icon="building">{{ deptName(row.deptCode) }}</GBadge></template
        >
        <template #cell-level="{ row }"
          ><GBadge :tone="LEVEL_TONE[row.level]">{{ levelName(row.level) }}</GBadge></template
        >
        <template #cell-isDisabled="{ row }">
          <GBadge :tone="row.isDisabled ? 'danger' : 'success'" dot>{{ row.isDisabled ? '已停用' : '啟用中' }}</GBadge>
        </template>
        <template #cell-lastLoginAt="{ row }"
          ><span class="faint small nowrap">{{ fromNow(row.lastLoginAt) }}</span></template
        >
        <template #cell-actions="{ row }">
          <div v-if="canManage(row)" class="acts">
            <GButton v-can="'sys.user.edit'" size="sm" variant="ghost" icon="edit" @click="openEdit(row)">編輯</GButton>
            <GButton v-can="'sys.user.reset-password'" size="sm" variant="ghost" icon="key" @click="resetPassword(row)">重設密碼</GButton>
            <GButton v-can="'sys.user.disable'" size="sm" variant="ghost" :icon="row.isDisabled ? 'user-check' : 'user-x'" @click="toggleDisable(row)">
              {{ row.isDisabled ? '啟用' : '停用' }}
            </GButton>
          </div>
          <span v-else-if="row.id === me?.user.id" class="faint xs">本人</span>
          <span v-else class="faint xs" title="只能管理同部門且職級較低的人員"><GIcon name="lock" :size="14" /></span>
        </template>
      </GTable>
    </GCard>

    <GModal v-model:open="formOpen" :title="editing ? `編輯 ${editing.name}` : '新增人員'" :icon="editing ? 'edit' : 'user-plus'" width="560px">
      <form id="user-form" class="grid grid-2" style="--gap: 14px" @submit.prevent="save">
        <GInput v-model="form.employeeNo" label="工號" :disabled="!!editing" required placeholder="例:S100050" />
        <GInput v-model="form.name" label="姓名" required />
        <GInput v-model="form.title" label="職稱" />
        <GInput v-model="form.email" label="Email" type="email" />
        <GSelect v-model="form.deptCode" label="部門" :options="deptOptions" :disabled="me?.level.code !== 'admin'" required />
        <GSelect v-model="form.level" label="職級" :options="levelOptions" required />
      </form>
      <p class="faint xs" style="margin: 12px 0 0">只能指派比自己低的職級;非系統管理員只能管理自己部門的人員。</p>
      <template #footer>
        <GButton variant="ghost" @click="formOpen = false">取消</GButton>
        <GButton variant="primary" type="submit" form="user-form" :loading="saving">{{ editing ? '儲存' : '建立' }}</GButton>
      </template>
    </GModal>

    <GModal v-model:open="tempOpen" title="臨時密碼" icon="key" tone="warning" width="440px" persistent>
      <p class="muted" style="margin-top: 0">
        請將 <b class="mono">{{ tempPassword?.emp }}</b> 的臨時密碼交給本人,登入後到右上角「變更密碼」。此密碼<b>只顯示這一次</b>。
      </p>
      <div class="temp">
        <code>{{ tempPassword?.password }}</code>
        <GButton size="sm" icon="check" @click="copyTemp">複製</GButton>
      </div>
      <template #footer>
        <GButton variant="primary" @click="tempPassword = null">我已記下</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.grow {
  flex: 1 1 260px;
}
.who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.acts {
  display: inline-flex;
  gap: 2px;
  flex-wrap: nowrap;
}
.temp {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px dashed var(--line-strong);
}
.temp code {
  flex: 1;
  font-size: var(--fs-xl);
  letter-spacing: 0.08em;
}
</style>
