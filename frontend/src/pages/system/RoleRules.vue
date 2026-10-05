<script setup lang="ts">
/**
 * 角色與指派規則(giga-Portal PRD I4、Gateway PRD §8.3.1、§8.7):
 *   角色:新增 / 改名 / 刪除(內建角色不可刪)
 *   指派規則:依公司、部門(可含下層)、職級、職稱自動指派角色(至少一個條件;寫入後全體使用者權限版本遞增)
 *   AD 群組對應:群組 DN 清單整組取代(角色所含權限須是操作人本身具備的;gw-super-admin 不開放以 API 修改)
 * 讀取需 gw.admin.rbac.read,寫入需 gw.admin.rbac.write。
 */
import { computed, reactive, ref, watch } from 'vue';
import { rbac, type Role, type RoleRule } from '@/api/admin';
import { can, UI } from '@/api/auth';
import { describeError } from '@/api/http';
import { fromNow } from '@/api/format';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const roles = useAsync(() => rbac.roles());
const depts = useAsync(() => rbac.departments());
const selectedCode = ref('');
const selected = computed(() => roles.data.value?.items.find((r) => r.code === selectedCode.value) ?? null);
watch(
  () => roles.data.value,
  (d) => {
    if (!selectedCode.value && d?.items.length) selectedCode.value = d.items.find((r) => r.code === 'it-admin')?.code ?? d.items[0]!.code;
  },
);
const canWrite = computed(() => can(UI.roleRulesEdit));
const companyName = (id: number | null) => (id === null ? null : (depts.data.value?.companies.find((c) => c.companyId === id)?.name ?? `#${id}`));
const companyOptions = computed(() => [
  { label: '不限公司', value: '' },
  ...(depts.data.value?.companies ?? []).map((c) => ({ label: c.name, value: String(c.companyId) })),
]);

// ---- 規則與 AD 群組(選角色時載入) ----
const rules = useAsync(() => rbac.rules(selectedCode.value), { immediate: false });
const groups = useAsync(() => rbac.adGroups(selectedCode.value), { immediate: false });
watch(selectedCode, (c) => {
  if (!c) return;
  void rules.reload();
  void groups.reload();
});

function ruleText(x: RoleRule): string {
  return (
    [
      companyName(x.companyId),
      x.deptCode ? `部門 ${x.deptCode}${x.includeSubDepts ? '(含下層)' : ''}` : null,
      x.jobLevels?.length ? `職級 ${x.jobLevels.join('、')}` : null,
      x.title ? `職稱「${x.title}」` : null,
    ]
      .filter(Boolean)
      .join(' 且 ') || '(無條件)'
  );
}

// ---- 角色新增 / 編輯 / 刪除 ----
const roleOpen = ref(false);
const roleEditing = ref<Role | null>(null);
const roleForm = reactive({ code: '', name: '', description: '' });
const busy = ref(false);
function openRole(r?: Role) {
  roleEditing.value = r ?? null;
  Object.assign(roleForm, { code: r?.code ?? '', name: r?.name ?? '', description: r?.description ?? '' });
  roleOpen.value = true;
}
async function saveRole() {
  busy.value = true;
  try {
    if (roleEditing.value)
      await rbac.updateRole(roleEditing.value.code, roleEditing.value.rowVer, { name: roleForm.name.trim(), description: roleForm.description.trim() || null });
    else {
      await rbac.createRole({ code: roleForm.code.trim(), name: roleForm.name.trim(), description: roleForm.description.trim() || null });
      selectedCode.value = roleForm.code.trim();
    }
    toast.success(roleEditing.value ? '已更新角色' : '已新增角色', roleEditing.value ? undefined : '到「應用權限」勾選此角色的權限');
    roleOpen.value = false;
    await roles.reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    busy.value = false;
  }
}
async function deleteRole(r: Role) {
  const ok = await confirm({
    title: `刪除角色 ${r.name}(${r.code})?`,
    message: '會一併移除其權限、指派規則、AD 群組、公司與個別指派,擁有此角色的使用者立即失去對應權限。',
    tone: 'danger',
    confirmText: '刪除',
  });
  if (!ok) return;
  try {
    await rbac.deleteRole(r.code, r.rowVer);
    toast.success('已刪除角色');
    selectedCode.value = '';
    await roles.reload();
  } catch (e) {
    toast.fromError(e, '刪除失敗');
  }
}

// ---- 規則新增 / 編輯 / 刪除 ----
const ruleOpen = ref(false);
const ruleEditing = ref<RoleRule | null>(null);
const ruleForm = reactive({ companyId: '', deptCode: '', includeSubDepts: true, jobLevels: '', title: '', description: '', isEnabled: true });
function openRule(x?: RoleRule) {
  ruleEditing.value = x ?? null;
  Object.assign(ruleForm, {
    companyId: x?.companyId ? String(x.companyId) : '',
    deptCode: x?.deptCode ?? '',
    includeSubDepts: x?.includeSubDepts ?? true,
    jobLevels: x?.jobLevels?.join(',') ?? '',
    title: x?.title ?? '',
    description: x?.description ?? '',
    isEnabled: x?.isEnabled ?? true,
  });
  ruleOpen.value = true;
}
async function saveRule() {
  const body = {
    companyId: ruleForm.companyId ? Number(ruleForm.companyId) : null,
    deptCode: ruleForm.deptCode.trim() || null,
    includeSubDepts: ruleForm.includeSubDepts,
    jobLevels: ruleForm.jobLevels
      .split(/[,、\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
    title: ruleForm.title.trim() || null,
    description: ruleForm.description.trim() || null,
    isEnabled: ruleForm.isEnabled,
  };
  busy.value = true;
  try {
    if (ruleEditing.value) await rbac.updateRule(selectedCode.value, ruleEditing.value.ruleId, body);
    else await rbac.createRule(selectedCode.value, body);
    toast.success('已儲存指派規則', '符合條件的使用者下次請求即生效');
    ruleOpen.value = false;
    await Promise.all([rules.reload(), roles.reload()]);
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    busy.value = false;
  }
}
async function deleteRule(x: RoleRule) {
  const ok = await confirm({ title: '刪除這條指派規則?', message: ruleText(x), tone: 'danger', confirmText: '刪除' });
  if (!ok) return;
  try {
    await rbac.deleteRule(selectedCode.value, x.ruleId);
    toast.success('已刪除規則');
    await Promise.all([rules.reload(), roles.reload()]);
  } catch (e) {
    toast.fromError(e, '刪除失敗');
  }
}

// ---- AD 群組 ----
const groupsOpen = ref(false);
const groupsText = ref('');
function openGroups() {
  groupsText.value = (groups.data.value?.items ?? []).map((g) => g.dn).join('\n');
  groupsOpen.value = true;
}
async function saveGroups() {
  busy.value = true;
  try {
    await rbac.setAdGroups(
      selectedCode.value,
      groupsText.value
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    toast.success('已更新 AD 群組對應');
    groupsOpen.value = false;
    await Promise.all([groups.reload(), roles.reload()]);
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="layout">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="roles.loading.value" @click="roles.reload">重新整理</GButton>
      <GButton v-if="canWrite" variant="primary" icon="plus" @click="openRole()">新增角色</GButton>
    </Teleport>

    <GCard class="picker" padding="none" title="角色" :subtitle="`${roles.data.value?.items.length ?? 0} 個`" icon="shield">
      <GEmpty v-if="roles.error.value" tone="danger" compact :description="describeError(roles.error.value)" />
      <GSkeleton v-else-if="!roles.data.value" :lines="8" style="padding: 12px" />
      <div v-else class="list">
        <button
          v-for="r in roles.data.value.items"
          :key="r.code"
          type="button"
          class="role-btn"
          :class="{ active: selectedCode === r.code }"
          @click="selectedCode = r.code"
        >
          <span class="row" style="--gap: 6px">
            <strong>{{ r.name }}</strong>
            <GBadge v-if="r.isSystem" tone="danger">內建</GBadge>
          </span>
          <code>{{ r.code }}</code>
          <span class="faint xs">{{ r.permissions }} 權限 · {{ r.rules }} 規則 · {{ r.adGroups }} AD 群組 · {{ r.companies }} 公司</span>
        </button>
      </div>
    </GCard>

    <div v-if="selected" class="stack" style="--gap: 16px">
      <GCard :title="selected.name" :subtitle="selected.code" icon="shield" tone="violet" glow>
        <template #actions>
          <GButton v-if="canWrite" size="sm" variant="ghost" icon="edit" @click="openRole(selected)">改名</GButton>
          <GButton v-if="canWrite && !selected.isSystem" size="sm" variant="ghost" icon="x-circle" @click="deleteRole(selected)">刪除</GButton>
        </template>
        <p class="muted small" style="margin: 0">{{ selected.description ?? '(無說明)' }}</p>
        <p v-if="selected.code === 'employee'" class="faint xs" style="margin: 8px 0 0">employee 為所有登入者的預設角色。</p>
      </GCard>

      <GCard title="指派規則" subtitle="符合任一條規則的人自動擁有此角色(規則內各條件需同時符合)" icon="workflow" padding="none">
        <template #actions>
          <GButton v-if="canWrite" size="sm" variant="primary" icon="plus" @click="openRule()">新增規則</GButton>
        </template>
        <GEmpty v-if="rules.error.value" tone="danger" compact :description="describeError(rules.error.value)" />
        <GSkeleton v-else-if="rules.loading.value && !rules.data.value" :lines="3" style="padding: 16px" />
        <GEmpty v-else-if="!rules.data.value?.items.length" compact icon="workflow" title="沒有指派規則" />
        <ul v-else class="rules">
          <li v-for="x in rules.data.value.items" :key="x.ruleId" :class="{ off: !x.isEnabled }">
            <GBadge tone="neutral">#{{ x.ruleId }}</GBadge>
            <div class="rule-body">
              <span>{{ ruleText(x) }}</span>
              <span class="faint xs">{{ x.description ?? '' }} · {{ x.updatedBy }} {{ fromNow(x.updatedAt) }}</span>
            </div>
            <GBadge v-if="!x.isEnabled" tone="neutral">停用</GBadge>
            <template v-if="canWrite">
              <GButton size="sm" variant="ghost" icon="edit" @click="openRule(x)" />
              <GButton size="sm" variant="ghost" icon="x" @click="deleteRule(x)" />
            </template>
          </li>
        </ul>
      </GCard>

      <GCard title="AD 群組對應" subtitle="AD 登入者屬於下列任一群組即擁有此角色" icon="users">
        <template #actions>
          <GButton v-if="canWrite && selected.code !== 'gw-super-admin'" size="sm" variant="ghost" icon="edit" @click="openGroups">編輯</GButton>
        </template>
        <GSkeleton v-if="groups.loading.value && !groups.data.value" :lines="2" />
        <div v-else class="row" style="--gap: 6px">
          <code v-for="g in groups.data.value?.items ?? []" :key="g.dn" class="chip" :title="g.dn">{{ g.dn.split(',')[0] }}</code>
          <span v-if="!groups.data.value?.items.length" class="faint small">沒有 AD 群組對應</span>
        </div>
      </GCard>
    </div>

    <GModal v-model:open="roleOpen" :title="roleEditing ? `編輯角色 ${roleEditing.code}` : '新增角色'" icon="shield">
      <form id="role-form" class="stack" style="--gap: 14px" @submit.prevent="saveRole">
        <GInput v-model="roleForm.code" label="角色代碼" placeholder="例:it-engineer" :disabled="!!roleEditing" required hint="小寫英數與 -,建立後不可改" />
        <GInput v-model="roleForm.name" label="名稱" required />
        <GTextarea v-model="roleForm.description" label="說明" :rows="2" />
      </form>
      <template #footer>
        <GButton variant="ghost" @click="roleOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="role-form" :loading="busy">儲存</GButton>
      </template>
    </GModal>

    <GModal v-model:open="ruleOpen" :title="ruleEditing ? `編輯規則 #${ruleEditing.ruleId}` : `新增指派規則 · ${selected?.name}`" icon="workflow" width="560px">
      <form id="rule-form" class="stack" style="--gap: 14px" @submit.prevent="saveRule">
        <GSelect v-model="ruleForm.companyId" label="公司" :options="companyOptions" icon="building" />
        <div class="grid" style="grid-template-columns: 1fr auto; --gap: 12px; align-items: end">
          <GInput v-model="ruleForm.deptCode" label="部門代碼" placeholder="例:S1800(見「人員與部門 › 部門」)" />
          <GSwitch v-model="ruleForm.includeSubDepts" label="含下層部門" />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GInput v-model="ruleForm.jobLevels" label="職級(多個以逗號分隔)" placeholder="例:3,4,5" />
          <GInput v-model="ruleForm.title" label="職稱" placeholder="選填" />
        </div>
        <GInput v-model="ruleForm.description" label="說明" placeholder="例:資訊部全體" />
        <GSwitch v-model="ruleForm.isEnabled" label="啟用" />
        <p class="faint xs" style="margin: 0">至少要有一個條件;各條件需同時符合。儲存後可到「權限試算」以工號驗證。</p>
      </form>
      <template #footer>
        <GButton variant="ghost" @click="ruleOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="rule-form" :loading="busy">儲存</GButton>
      </template>
    </GModal>

    <GModal v-model:open="groupsOpen" :title="`AD 群組對應 · ${selected?.name}`" icon="users" width="640px">
      <GTextarea v-model="groupsText" label="群組 DN(每行一個,整組取代)" mono :rows="6" placeholder="CN=GN-IT-Admins,OU=Groups,DC=gsmc,DC=com,DC=tw" />
      <template #footer>
        <GButton variant="ghost" @click="groupsOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" :loading="busy" @click="saveGroups">儲存</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.list {
  max-height: calc(100vh - 260px);
  overflow: auto;
  padding: 6px 8px 12px;
}
.role-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  width: 100%;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: none;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.role-btn code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.role-btn:hover {
  background: var(--glass-soft);
}
.role-btn.active {
  background: var(--glass-strong);
  border-color: color-mix(in srgb, var(--c-violet) 40%, transparent);
  box-shadow: var(--shadow-sm);
}
.rules {
  list-style: none;
  margin: 0;
  padding: 0;
}
.rules li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--line);
}
.rules li:last-child {
  border-bottom: 0;
}
.rules li.off {
  opacity: 0.6;
}
.rule-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.chip {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
</style>
