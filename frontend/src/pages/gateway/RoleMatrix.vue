<script setup lang="ts">
/**
 * BFF 角色 × 權限矩陣:點角色欄位的「編輯」進入設定模式(PUT /api/admin/roles/:role/permissions,需 gw.admin.rbac.write)。
 * 內建超級管理員 gw-super-admin 不開放以 API 修改(Gateway PRD §8.7);寫入會遞增全體使用者權限版本,下次請求即生效。
 */
import { computed, ref } from 'vue';
import { rbac } from '@/api/admin';
import { GW } from '@/api/auth';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';
import { confirm, toast } from '@/ui';

const { data, loading, error, grants, bySystem, reload } = useBffRbac();

const system = ref('');
const systems = computed(() => [{ label: '全部', value: '' }, ...bySystem.value.map((g) => ({ label: g.system, value: g.system }))]);
const groups = computed(() => bySystem.value.filter((g) => !system.value || g.system === system.value));
const roles = computed(() => data.value?.roles ?? []);

const hoverRole = ref<string | null>(null);
const hoverPerm = ref<string | null>(null);

// ---- 編輯 ----
const editing = ref<string | null>(null);
const draft = ref<Set<string>>(new Set());
const saving = ref(false);
function startEdit(role: string) {
  editing.value = role;
  draft.value = new Set(grants.value.get(role) ?? []);
}
function toggle(perm: string, on: boolean) {
  const s = new Set(draft.value);
  if (on) s.add(perm);
  else s.delete(perm);
  draft.value = s;
}
const diff = computed(() => {
  if (!editing.value) return { add: [], remove: [] };
  const cur = grants.value.get(editing.value) ?? new Set<string>();
  return { add: [...draft.value].filter((p) => !cur.has(p)), remove: [...cur].filter((p) => !draft.value.has(p)) };
});
async function save() {
  const role = editing.value!;
  const ok = await confirm({
    title: `儲存「${roles.value.find((r) => r.code === role)?.name}」的權限?`,
    message: `新增 ${diff.value.add.length} 項、移除 ${diff.value.remove.length} 項。擁有此角色的使用者在下次請求時生效。`,
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    await rbac.setRolePermissions(role, [...draft.value]);
    toast.success('已儲存角色權限', '擁有此角色的使用者下次請求即生效');
    editing.value = null;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
const has = (role: string, perm: string) => (editing.value === role ? draft.value.has(perm) : !!grants.value.get(role)?.has(perm));
const roleCount = (role: string) => (editing.value === role ? draft.value.size : (grants.value.get(role)?.size ?? 0));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="shield" title="無法取得 BFF 權限" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <GCard padding="sm">
        <div class="row">
          <span class="muted small">系統</span>
          <GSegmented v-model="system" :options="systems" size="sm" />
          <span class="spacer" />
          <span class="legend"><i class="on" /> 擁有 <i /> 未擁有</span>
        </div>
      </GCard>

      <GCard padding="none">
        <GSkeleton v-if="!data" :lines="10" style="padding: 20px" />
        <div v-else class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="corner">權限 \ 角色</th>
                <th
                  v-for="r in roles"
                  :key="r.code"
                  class="role"
                  :class="{ hl: hoverRole === r.code, editing: editing === r.code }"
                  @mouseenter="hoverRole = r.code"
                  @mouseleave="hoverRole = null"
                >
                  <div class="role-head" :title="r.description ?? ''">
                    <strong>{{ r.name }}</strong>
                    <code>{{ r.code }}</code>
                    <span class="row" style="--gap: 4px; justify-content: center">
                      <GBadge v-if="r.isSystem" tone="danger">內建</GBadge>
                      <GBadge tone="primary">{{ roleCount(r.code) }}</GBadge>
                    </span>
                    <GButton
                      v-if="!editing && r.code !== 'gw-super-admin'"
                      v-can="GW.rbacWrite"
                      size="sm"
                      variant="ghost"
                      icon="edit"
                      @click="startEdit(r.code)"
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
                  <span class="faint xs">{{ g.perms.length }} 項權限</span>
                </td>
              </tr>
              <tr v-for="p in g.perms" :key="p.code" :class="{ hl: hoverPerm === p.code }" @mouseenter="hoverPerm = p.code" @mouseleave="hoverPerm = null">
                <th class="perm">
                  <div class="pl">
                    <span>{{ p.name }}</span>
                    <code>{{ p.code }}</code>
                  </div>
                </th>
                <td v-for="r in roles" :key="r.code" class="cell" :class="{ hl: hoverRole === r.code, editing: editing === r.code }">
                  <GCheckbox
                    v-if="editing === r.code"
                    :model-value="draft.has(p.code)"
                    :aria-label="`${r.name} ${p.name}`"
                    @update:model-value="toggle(p.code, $event)"
                  />
                  <span v-else-if="has(r.code, p.code)" class="yes" :title="`${r.name} 擁有 ${p.code}`"><GIcon name="check" :size="14" :stroke="3" /></span>
                  <span v-else class="no" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GCard>
    </template>

    <Transition name="page">
      <div v-if="editing" class="savebar glass glass-edge">
        <GIcon name="edit" />
        <span
          >正在編輯 <b>{{ roles.find((r) => r.code === editing)?.name }}</b></span
        >
        <GBadge tone="success">+{{ diff.add.length }}</GBadge>
        <GBadge tone="danger">−{{ diff.remove.length }}</GBadge>
        <span class="spacer" />
        <GButton variant="ghost" @click="editing = null">取消</GButton>
        <GButton variant="primary" icon="save" :loading="saving" :disabled="!diff.add.length && !diff.remove.length" @click="save">儲存</GButton>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.legend i {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px dashed var(--line-strong);
}
.legend i.on {
  background: var(--grad-brand);
  border: 0;
  margin-left: 6px;
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 300px);
  min-height: 300px;
}
.matrix {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: var(--fs-sm);
}
.matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--line);
}
.corner {
  left: 0;
  z-index: 3 !important;
  min-width: 240px;
  text-align: left;
  padding: 12px 16px;
  font-size: var(--fs-xs);
  color: var(--text-3);
  font-weight: 700;
}
.role {
  min-width: 118px;
  padding: 10px 8px;
  vertical-align: bottom;
  transition: background var(--dur);
}
.role-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.role-head code {
  font-size: 11px;
  color: var(--text-3);
}
.perm {
  position: sticky;
  left: 0;
  z-index: 1;
  text-align: left;
  font-weight: 500;
  padding: 8px 16px;
  background: var(--glass-strong);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.pl {
  display: flex;
  flex-direction: column;
}
.perm code {
  font-size: 11px;
  color: var(--text-3);
}
.group td {
  padding: 14px 16px 6px;
  display: table-cell;
}
.group td > * {
  margin-right: 8px;
}
.cell {
  text-align: center;
  padding: 6px;
  border-bottom: 1px solid var(--line);
  transition: background var(--dur);
}
tr.hl .cell,
.cell.hl,
.role.hl {
  background: color-mix(in srgb, var(--c-primary) 7%, transparent);
}
tr.hl .perm {
  color: var(--c-primary);
}
.cell.editing,
.role.editing {
  background: color-mix(in srgb, var(--c-warning) 10%, transparent);
}
.yes {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 4px 12px rgb(99 102 241 / 0.35);
}
.no {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px dashed var(--line-strong);
}
.savebar {
  position: sticky;
  bottom: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--glass-strong);
  box-shadow: var(--shadow-lg);
}
</style>
