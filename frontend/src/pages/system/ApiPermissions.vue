<script setup lang="ts">
/**
 * 權限設定 › API 權限(Gateway PRD §8.3.2):沒有畫面的純 API 權限(kind = api,例如 gw.admin.*、bpm.approval.*)× 角色。
 *   畫面權限(應用 / 選單 / Tab / 按鈕)在「應用權限」設定;按鈕權限 = 對應的寫入 API 權限,兩邊是同一個代碼。
 *   設定:點角色欄的「編輯」勾選後儲存(PUT /api/admin/roles/:role/permissions,保留該角色的其他權限)。寫入需 gw.admin.rbac.write;
 *   gw-super-admin 不開放修改;新增或移除的權限須是操作人本身具備的(BFF 檢查)。
 */
import { computed, ref } from 'vue';
import { rbac } from '@/api/admin';
import { can, GW } from '@/api/auth';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';
import { confirm, toast } from '@/ui';

const { data, loading, error, grants, reload } = useBffRbac();
const roles = computed(() => data.value?.roles ?? []);

const q = ref('');
const system = ref('');
const apiPerms = computed(() => (data.value?.permissions ?? []).filter((p) => p.kind === 'api'));
const systems = computed(() => [
  { label: '全部', value: '' },
  ...[...new Set(apiPerms.value.map((p) => p.systemCode))].sort().map((s) => ({ label: s, value: s })),
]);
const groups = computed(() => {
  const k = q.value.trim().toLowerCase();
  const m = new Map<string, typeof apiPerms.value>();
  for (const p of apiPerms.value) {
    if (system.value && p.systemCode !== system.value) continue;
    if (k && !p.code.toLowerCase().includes(k) && !p.name.toLowerCase().includes(k)) continue;
    m.set(p.systemCode, [...(m.get(p.systemCode) ?? []), p]);
  }
  return [...m.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sys, perms]) => ({ system: sys, perms: perms.sort((a, b) => a.code.localeCompare(b.code)) }));
});
const apiCodes = computed(() => new Set(apiPerms.value.map((p) => p.code)));
/** API 權限 → 隨附它的選單名稱(「選單管理」設定;擁有選單即一併擁有) */
const includedBy = computed(() => {
  const m = new Map<string, string[]>();
  for (const p of data.value?.permissions ?? []) for (const c of p.includes ?? []) m.set(c, [...(m.get(c) ?? []), p.name]);
  return m;
});

// ---- 編輯某角色的 API 權限(保留其他權限) ----
const editing = ref<string | null>(null);
const draft = ref<Set<string>>(new Set());
const saving = ref(false);
function startEdit(role: string) {
  editing.value = role;
  draft.value = new Set(grants.value.get(role) ?? []);
}
function toggle(code: string, on: boolean) {
  const s = new Set(draft.value);
  if (on) s.add(code);
  else s.delete(code);
  draft.value = s;
}
const diff = computed(() => {
  if (!editing.value) return { add: 0, remove: 0 };
  const cur = grants.value.get(editing.value) ?? new Set<string>();
  return { add: [...draft.value].filter((p) => !cur.has(p)).length, remove: [...cur].filter((p) => !draft.value.has(p)).length };
});
async function save() {
  const role = editing.value!;
  const ok = await confirm({
    title: `儲存「${roles.value.find((r) => r.code === role)?.name}」的 API 權限?`,
    message: `新增 ${diff.value.add} 項、移除 ${diff.value.remove} 項(只影響 API 權限,畫面權限不變)。擁有此角色的使用者下次請求即生效。`,
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    await rbac.setRolePermissions(role, [...draft.value]);
    toast.success('已儲存角色的 API 權限');
    editing.value = null;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
const has = (role: string, code: string) => (editing.value === role ? draft.value.has(code) : !!grants.value.get(role)?.has(code));
const countIn = (role: string) => [...((editing.value === role ? draft.value : grants.value.get(role)) ?? [])].filter((c) => apiCodes.value.has(c)).length;
const canWrite = computed(() => can(GW.rbacWrite));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <template v-if="editing">
        <GBadge tone="warning" icon="edit">編輯中:+{{ diff.add }} / −{{ diff.remove }}</GBadge>
        <GButton variant="ghost" @click="editing = null">取消</GButton>
        <GButton variant="primary" icon="save" :loading="saving" :disabled="!diff.add && !diff.remove" @click="save">儲存</GButton>
      </template>
      <GButton v-else icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="row filters">
        <GInput v-model="q" icon="search" placeholder="搜尋權限代碼或名稱" clearable class="grow" />
        <span class="muted small">系統</span>
        <GSegmented v-model="system" :options="systems" size="sm" />
      </div>
      <p class="faint xs" style="margin: 8px 0 0">
        只列沒有畫面的 API 權限(kind = api),此頁授予<b>角色</b>;要直接給部門或個人,請到「部門權限」「個人權限」把應用選為「API 權限」。選單 / Tab /
        按鈕在「應用權限」設定,按鈕權限與它呼叫的寫入 API 是同一個代碼。
      </p>
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="key" title="無法載入權限" :description="describeError(error)" />
    </GCard>
    <GCard v-else padding="none">
      <GSkeleton v-if="!data" :lines="10" style="padding: 20px" />
      <GEmpty v-else-if="!groups.length" compact title="沒有符合的 API 權限" />
      <div v-else class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="corner">API 權限 \ 角色</th>
              <th v-for="r in roles" :key="r.code" class="role" :class="{ editing: editing === r.code }">
                <div class="role-head" :title="r.description ?? ''">
                  <strong>{{ r.name }}</strong>
                  <code>{{ r.code }}</code>
                  <GBadge tone="primary">{{ countIn(r.code) }}</GBadge>
                  <GButton v-if="canWrite && !editing && r.code !== 'gw-super-admin'" size="sm" variant="ghost" icon="edit" @click="startEdit(r.code)"
                    >編輯</GButton
                  >
                </div>
              </th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.system">
            <tr class="group">
              <td :colspan="roles.length + 1">
                <GBadge tone="violet" icon="layers">{{ g.system }}</GBadge>
                <span class="faint xs">{{ g.perms.length }} 項</span>
              </td>
            </tr>
            <tr v-for="p in g.perms" :key="p.code">
              <th class="perm">
                <div class="pn">
                  <span>{{ p.name }}</span>
                  <code>{{ p.code }}</code>
                  <span v-if="includedBy.get(p.code)" class="faint xs" :title="'擁有這些選單的人也會取得此權限'"
                    >隨選單:{{ includedBy.get(p.code)!.join('、') }}</span
                  >
                </div>
              </th>
              <td v-for="r in roles" :key="r.code" class="cell" :class="{ editing: editing === r.code }">
                <GCheckbox
                  v-if="editing === r.code"
                  :model-value="draft.has(p.code)"
                  :aria-label="`${r.name} ${p.name}`"
                  @update:model-value="toggle(p.code, $event)"
                />
                <span v-else-if="has(r.code, p.code)" class="yes"><GIcon name="check" :size="14" :stroke="3" /></span>
                <span v-else class="no" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </GCard>
  </div>
</template>

<style scoped>
.filters {
  flex-wrap: wrap;
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 320px);
}
.matrix {
  border-collapse: separate;
  border-spacing: 0;
  min-width: 100%;
  font-size: var(--fs-sm);
}
.matrix th,
.matrix td {
  border-bottom: 1px solid var(--line);
}
.corner,
.role {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--glass-strong);
  backdrop-filter: blur(12px);
}
.corner {
  left: 0;
  z-index: 3;
  min-width: 300px;
  padding: 12px 16px;
  text-align: left;
  color: var(--text-3);
  font-weight: 600;
}
.role {
  min-width: 120px;
  padding: 10px 8px;
}
.role.editing,
.cell.editing {
  background: color-mix(in srgb, var(--c-warning) 10%, transparent);
}
.role-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.role-head code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.group td {
  padding: 10px 16px;
  background: var(--glass);
}
.perm {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--glass-strong);
  backdrop-filter: blur(12px);
  padding: 6px 16px;
  text-align: left;
  font-weight: 400;
}
.pn {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pn code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.cell {
  text-align: center;
  padding: 6px;
}
.yes {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--c-success);
  background: color-mix(in srgb, var(--c-success) 16%, transparent);
}
.no {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}
</style>
