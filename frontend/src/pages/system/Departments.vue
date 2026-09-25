<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { describeError, http } from '@/api/http';
import type { Department, LevelCode, UserRow } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

type DeptRow = Department & { leadName: string | null; memberCount: number; byLevel: Record<LevelCode, number> };
const { data, error, reload } = useAsync(() => http.get<{ items: DeptRow[] }>('/departments'));

const LEVELS: { code: LevelCode; name: string; tone: string }[] = [
  { code: 'manager', name: '主管', tone: 'violet' },
  { code: 'senior', name: '高級工程師', tone: 'primary' },
  { code: 'engineer', name: '一般工程師', tone: 'cyan' },
  { code: 'admin', name: '系統管理員', tone: 'danger' },
];
const DEPT_ICON: Record<string, string> = { NET: 'wifi', SYS: 'server', DEV: 'code', SEC: 'shield' };
const TONES = ['primary', 'cyan', 'violet', 'success', 'warning', 'info'];

const open = ref(false);
const editing = ref<DeptRow | null>(null);
const form = reactive({ code: '', name: '', description: '', leadEmployeeNo: '' });
const saving = ref(false);
// 主管候選人:打開對話框時才查詢(編輯時只查該部門成員),不在進頁時載入全部人員
const leads = ref<UserRow[]>([]);
const leadsLoading = ref(false);
const leadOptions = computed(() => leads.value.map((u) => ({ label: `${u.name}(${u.employeeNo})`, value: u.employeeNo })));
async function loadLeads(dept?: string) {
  leadsLoading.value = true;
  try {
    leads.value = (await http.get<{ items: UserRow[] }>('/users', { query: { dept, pageSize: 100 } })).items;
  } catch (e) {
    leads.value = [];
    toast.fromError(e, '無法載入主管候選人');
  } finally {
    leadsLoading.value = false;
  }
}
function openCreate() {
  editing.value = null;
  Object.assign(form, { code: '', name: '', description: '', leadEmployeeNo: '' });
  open.value = true;
  void loadLeads();
}
function openEdit(d: DeptRow) {
  editing.value = d;
  Object.assign(form, { code: d.code, name: d.name, description: d.description, leadEmployeeNo: d.leadEmployeeNo ?? '' });
  open.value = true;
  void loadLeads(d.code);
}
async function save() {
  saving.value = true;
  const body = { name: form.name, description: form.description, leadEmployeeNo: form.leadEmployeeNo || null };
  try {
    if (editing.value) await http.patch(`/departments/${editing.value.code}`, body);
    else await http.post('/departments', { ...body, code: form.code.toUpperCase() });
    toast.success(editing.value ? '已更新部門' : '已新增部門');
    open.value = false;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton v-can="'sys.dept.edit'" variant="primary" icon="plus" @click="openCreate">新增部門</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="building" title="無法載入部門" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>
    <div v-else class="grid grid-auto" style="--min: 300px; --gap: 16px">
      <template v-if="data">
        <GCard v-for="(d, i) in data.items" :key="d.code" :tone="TONES[i % TONES.length]" glow>
          <div class="head">
            <span class="ic"><GIcon :name="DEPT_ICON[d.code] ?? 'building'" :size="22" /></span>
            <div class="t">
              <h3>{{ d.name }}</h3>
              <span class="faint xs mono">{{ d.code }}</span>
            </div>
            <span class="spacer" />
            <GButton v-can="'sys.dept.edit'" size="sm" variant="ghost" icon="edit" square aria-label="編輯部門" @click="openEdit(d)" />
          </div>
          <p class="muted small desc">{{ d.description || '—' }}</p>
          <div class="lead">
            <GAvatar v-if="d.leadName" :name="d.leadName" :size="30" />
            <span v-else class="empty-av"><GIcon name="user" :size="14" /></span>
            <div>
              <div class="faint xs">部門主管</div>
              <strong class="small">{{ d.leadName ?? '未指定' }}</strong>
            </div>
            <span class="spacer" />
            <div class="count">
              <b class="num">{{ d.memberCount }}</b>
              <span class="faint xs">位成員</span>
            </div>
          </div>
          <GProgress
            :segments="LEVELS.map((l) => ({ value: d.byLevel[l.code] ?? 0, tone: l.tone, label: `${l.name} ${d.byLevel[l.code] ?? 0}` }))"
            :height="8"
          />
          <div class="row levels" style="--gap: 10px">
            <span v-for="l in LEVELS.filter((x) => d.byLevel[x.code])" :key="l.code" class="lv" :class="`tone-${l.tone}`"
              ><i />{{ l.name }} {{ d.byLevel[l.code] }}</span
            >
          </div>
        </GCard>
      </template>
      <template v-else>
        <GCard v-for="i in 4" :key="i"><GSkeleton :lines="5" /></GCard>
      </template>
    </div>

    <GModal v-model:open="open" :title="editing ? `編輯 ${editing.name}` : '新增部門'" icon="building" width="480px">
      <form id="dept-form" class="stack" style="--gap: 14px" @submit.prevent="save">
        <GInput v-model="form.code" label="部門代碼" :disabled="!!editing" required hint="大寫英數,2–10 碼,例:OPS" />
        <GInput v-model="form.name" label="名稱" required />
        <GInput v-model="form.description" label="說明" />
        <GSelect v-model="form.leadEmployeeNo" label="部門主管" :options="leadOptions" :placeholder="leadsLoading ? '載入中…' : '(未指定)'" />
      </form>
      <template #footer>
        <GButton variant="ghost" @click="open = false">取消</GButton>
        <GButton variant="primary" type="submit" form="dept-form" :loading="saving">儲存</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ic {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  border-radius: 14px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) calc(var(--tone-bg-alpha) * 100%), transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 25%, transparent);
}
.t h3 {
  font-size: var(--fs-lg);
}
.desc {
  margin: 12px 0 16px;
  min-height: 1.5em;
}
.lead {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  margin-bottom: 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.empty-av {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 30%;
  border: 1px dashed var(--line-strong);
  color: var(--text-3);
}
.count {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.1;
}
.count b {
  font-size: var(--fs-xl);
}
.levels {
  margin-top: 10px;
}
.lv {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.lv i {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: var(--tone);
}
</style>
