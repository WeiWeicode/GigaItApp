<script setup lang="ts">
/**
 * 人員(Gateway 使用者,Gateway PRD §8.7、P2-3):GET /api/admin/users(後端搜尋、篩選、分頁)、明細、停用 / 啟用、強制登出、個別指派角色。
 * 人員資料由 BPM / LOS 每小時同步(W3-4.6b);本頁不新增人員(本機帳號由入口網自行註冊或 IT 代建)。
 * 寫入需 gw.admin.user.write;個別指派的角色所含權限須是操作人本身具備的,否則 BFF 回 403(防止提權)。
 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { can, GW, UI, useAuth } from '@/api/auth';
import { rbac, users, type UserDetail, type UserRow } from '@/api/admin';
import { describeError } from '@/api/http';
import { fmtTime, fromNow } from '@/api/format';
import { useAsync } from '@/composables/useAsync';
import { usePaged } from '@/composables/usePaged';
import { confirm, toast } from '@/ui';

const route = useRoute();
const { me } = useAuth();
const PAGE_SIZE = 12;
const filters = reactive({
  q: '',
  deptCode: typeof route.query.dept === 'string' ? route.query.dept : '',
  authType: '',
  disabled: '',
});
const list = usePaged<UserRow>(
  (page, pageSize) =>
    users.list({
      q: filters.q.trim() || undefined,
      deptCode: filters.deptCode || undefined,
      authType: filters.authType || undefined,
      disabled: filters.disabled === '' ? undefined : filters.disabled === '1',
      page,
      pageSize,
    }),
  { pageSize: PAGE_SIZE, watch: () => ({ ...filters }) },
);

const AUTH: Record<string, { label: string; tone: string }> = { ad: { label: 'AD', tone: 'primary' }, local: { label: '本機帳號', tone: 'cyan' } };
const EMPLOYMENT: Record<string, string> = { active: '在職', resigned: '離職' };
const LOCAL: Record<string, string> = { pending: '待審核', active: '已啟用', locked: '已鎖定', disabled: '已停用', invited: '待啟用' };
/** 按鈕權限:調整角色 / 強制登出 / 停用(各自綁定 gw.admin.user.write) */
const canRoles = computed(() => can(UI.userRoles));
const canRevoke = computed(() => can(UI.userRevoke));
const canDisable = computed(() => can(UI.userDisable));

// ---- 明細 ----
const detail = ref<UserDetail | null>(null);
const detailOpen = computed({ get: () => !!detail.value, set: (v) => !v && ((detail.value = null), (roleEdit.value = false)) });
const busy = ref(false);
async function openDetail(u: UserRow) {
  busy.value = true;
  try {
    detail.value = await users.get(u.userId);
  } catch (e) {
    toast.fromError(e, '無法取得人員明細');
  } finally {
    busy.value = false;
  }
}
const isSelf = computed(() => detail.value?.employeeNo === me.value?.user.employeeNo);

async function toggleDisable(u: UserDetail) {
  const disable = !u.isDisabled;
  const ok = await confirm({
    title: `${disable ? '停用' : '啟用'} ${u.displayName}(${u.employeeNo})?`,
    message: disable ? '停用後此帳號立即登出且無法登入任何應用。' : '啟用後可再次登入。',
    tone: disable ? 'danger' : 'primary',
    confirmText: disable ? '停用' : '啟用',
  });
  if (!ok) return;
  try {
    detail.value = await users.update(u.userId, u.rowVer, { isDisabled: disable });
    toast.success(disable ? '已停用' : '已啟用', `${u.displayName}(${u.employeeNo})`);
    await list.reload();
  } catch (e) {
    toast.fromError(e);
  }
}
async function revoke(u: UserDetail) {
  const ok = await confirm({ title: `強制登出 ${u.displayName}?`, message: '所有裝置上的登入會失效,需重新登入。', tone: 'danger', confirmText: '強制登出' });
  if (!ok) return;
  try {
    await users.revokeSessions(u.userId);
    detail.value = await users.get(u.userId);
    toast.success('已強制登出');
  } catch (e) {
    toast.fromError(e);
  }
}

// ---- 個別指派角色(整組取代) ----
const roleEdit = ref(false);
const roleList = useAsync(() => rbac.roles(), { immediate: false });
const picked = ref<Set<string>>(new Set());
const reason = ref('');
async function startRoleEdit(u: UserDetail) {
  picked.value = new Set(u.roles.map((r) => r.code));
  reason.value = '';
  roleEdit.value = true;
  if (!roleList.data.value) await roleList.reload();
}
function togglePick(code: string, on: boolean) {
  const s = new Set(picked.value);
  if (on) s.add(code);
  else s.delete(code);
  picked.value = s;
}
async function saveRoles(u: UserDetail) {
  const keep = new Map(u.roles.map((r) => [r.code, r]));
  const roles = [...picked.value].map((code) => ({
    code,
    validTo: keep.get(code)?.validTo ?? null,
    reason: keep.get(code)?.reason ?? (reason.value.trim() || null),
  }));
  busy.value = true;
  try {
    detail.value = await users.update(u.userId, u.rowVer, { roles });
    roleEdit.value = false;
    toast.success('已更新個別指派角色', '該使用者下次請求即生效');
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="list.reload">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="搜尋工號、姓名、Email" clearable class="grow" />
        <GInput v-model="filters.deptCode" icon="building" placeholder="部門代碼" clearable style="width: 150px" />
        <GSegmented
          v-model="filters.authType"
          size="sm"
          :options="[
            { label: '全部', value: '' },
            { label: 'AD', value: 'ad' },
            { label: '本機帳號', value: 'local' },
          ]"
        />
        <GSegmented
          v-model="filters.disabled"
          size="sm"
          :options="[
            { label: '全部', value: '' },
            { label: '啟用中', value: '0' },
            { label: '已停用', value: '1' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="users" title="無法載入人員" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="人員" :subtitle="`${list.total.value.toLocaleString()} 人`" icon="users">
      <GTable
        v-model:page="list.page.value"
        :loading="(list.loading.value && !list.data.value) || busy"
        :rows="list.items.value"
        :total="list.total.value"
        row-key="userId"
        :page-size="PAGE_SIZE"
        clickable
        :columns="[
          { key: 'displayName', label: '人員' },
          { key: 'department', label: '部門' },
          { key: 'orgName', label: '公司', hideSm: true },
          { key: 'authType', label: '登入方式', hideSm: true },
          { key: 'isDisabled', label: '狀態' },
          { key: 'lastLoginAt', label: '最後登入', hideSm: true },
        ]"
        @row-click="openDetail"
      >
        <template #cell-displayName="{ row }">
          <div class="who">
            <GAvatar :name="row.displayName" :size="34" />
            <div>
              <strong>{{ row.displayName }}</strong>
              <div class="faint xs">
                <span class="mono">{{ row.employeeNo }}</span> · {{ row.title ?? '—' }}{{ row.jobLevel ? ` · 職級 ${row.jobLevel}` : '' }}
              </div>
            </div>
          </div>
        </template>
        <template #cell-department="{ row }">
          <span class="nowrap">{{ row.department ?? '—' }}</span>
          <div v-if="row.deptCode" class="faint xs mono">{{ row.deptCode }}</div>
        </template>
        <template #cell-orgName="{ row }"
          ><span class="nowrap small">{{ row.orgName ?? '—' }}</span></template
        >
        <template #cell-authType="{ row }">
          <GBadge v-if="row.authType" :tone="AUTH[row.authType]?.tone ?? 'neutral'">{{ AUTH[row.authType]?.label ?? row.authType }}</GBadge>
          <span v-else class="faint xs" title="人員同步建立,尚未登入過">尚未登入</span>
          <span v-if="row.localStatus && row.localStatus !== 'active'" class="faint xs"> {{ LOCAL[row.localStatus] ?? row.localStatus }}</span>
        </template>
        <template #cell-isDisabled="{ row }">
          <GBadge :tone="row.isDisabled ? 'danger' : 'success'" dot>{{ row.isDisabled ? '已停用' : '啟用中' }}</GBadge>
        </template>
        <template #cell-lastLoginAt="{ row }"
          ><span class="faint small nowrap">{{ fromNow(row.lastLoginAt) }}</span></template
        >
      </GTable>
    </GCard>

    <GModal v-model:open="detailOpen" :title="detail?.displayName" :subtitle="detail?.employeeNo" icon="user" width="620px">
      <div v-if="detail" class="stack" style="--gap: 16px">
        <dl class="kv">
          <dt>部門</dt>
          <dd>
            {{ detail.department ?? '—' }} <span class="faint mono xs">{{ detail.deptCode }}</span>
          </dd>
          <dt>職稱 / 職級</dt>
          <dd>{{ detail.title ?? '—' }} / {{ detail.jobLevel ?? '—' }}</dd>
          <dt>Email</dt>
          <dd>{{ detail.email ?? '—' }}</dd>
          <dt>登入方式</dt>
          <dd>
            {{ detail.authType ? (AUTH[detail.authType]?.label ?? detail.authType) : '尚未登入過' }}{{ detail.adDomain ? `(${detail.adDomain})` : '' }}
            <template v-if="detail.localAccount"> · 本機帳號 {{ LOCAL[detail.localAccount.status] ?? detail.localAccount.status }}</template>
          </dd>
          <dt>在職</dt>
          <dd>{{ detail.employmentStatus ? (EMPLOYMENT[detail.employmentStatus] ?? detail.employmentStatus) : '—' }}</dd>
          <dt>最後登入</dt>
          <dd>{{ fmtTime(detail.lastLoginAt) }} · 登入中裝置 {{ detail.sessions ?? '—' }}</dd>
          <dt>所屬公司</dt>
          <dd>
            <GBadge v-for="c in detail.companies" :key="c.companyId" :tone="c.isPrimary ? 'primary' : 'neutral'" :title="c.department ?? ''">
              {{ c.compName }}{{ c.isVirtual ? '(兼任)' : '' }}
            </GBadge>
            <span v-if="!detail.companies.length" class="faint">—</span>
          </dd>
          <dt>AD 群組</dt>
          <dd>
            <span v-if="!detail.adGroups.length" class="faint">—</span>
            <code v-for="g in detail.adGroups.slice(0, 6)" :key="g" class="chip">{{ g.split(',')[0] }}</code>
            <span v-if="detail.adGroups.length > 6" class="faint xs">…共 {{ detail.adGroups.length }} 個</span>
          </dd>
        </dl>

        <div class="box stack" style="--gap: 10px">
          <div class="row">
            <p class="faint xs strong" style="margin: 0">個別指派角色</p>
            <span class="spacer" />
            <GButton v-if="canRoles && !roleEdit" size="sm" variant="ghost" icon="edit" @click="startRoleEdit(detail)">調整</GButton>
          </div>
          <template v-if="!roleEdit">
            <div class="row" style="--gap: 6px">
              <GBadge
                v-for="r in detail.roles"
                :key="r.code"
                tone="violet"
                :title="[r.reason, r.validTo ? `至 ${r.validTo.slice(0, 10)}` : ''].filter(Boolean).join(' · ')"
              >
                {{ r.name }}
              </GBadge>
              <span v-if="!detail.roles.length" class="faint small">沒有個別指派(角色來自所有登入者、AD 群組、公司預設或指派規則)</span>
            </div>
          </template>
          <template v-else>
            <GSkeleton v-if="!roleList.data.value" :lines="3" />
            <div v-else class="picks">
              <GCheckbox
                v-for="r in roleList.data.value.items"
                :key="r.code"
                :model-value="picked.has(r.code)"
                :label="`${r.name}(${r.code})`"
                @update:model-value="togglePick(r.code, $event)"
              />
            </div>
            <GInput v-model="reason" label="新增角色的原因(選填)" placeholder="例:IT 管理系統管理員" />
            <div class="row" style="--gap: 8px; justify-content: flex-end">
              <GButton size="sm" variant="ghost" @click="roleEdit = false">取消</GButton>
              <GButton size="sm" variant="primary" icon="save" :loading="busy" @click="saveRoles(detail)">儲存</GButton>
            </div>
          </template>
        </div>
      </div>
      <template #footer>
        <GButton
          v-if="detail && $can(GW.rbacRead)"
          variant="ghost"
          icon="eye"
          @click="$router.push({ path: '/system/permissions/preview', query: { emp: detail.employeeNo } })"
        >
          有效權限
        </GButton>
        <span class="spacer" />
        <template v-if="detail && !isSelf">
          <GButton v-if="canRevoke" variant="ghost" icon="logout" @click="revoke(detail)">強制登出</GButton>
          <GButton
            v-if="canDisable"
            :variant="detail.isDisabled ? 'primary' : 'danger'"
            :icon="detail.isDisabled ? 'user-check' : 'user-x'"
            @click="toggleDisable(detail)"
          >
            {{ detail.isDisabled ? '啟用' : '停用' }}
          </GButton>
        </template>
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
.kv {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
.kv dt {
  color: var(--text-3);
}
.kv dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}
.chip {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.box {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.picks {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 8px;
  max-height: 220px;
  overflow: auto;
}
</style>
