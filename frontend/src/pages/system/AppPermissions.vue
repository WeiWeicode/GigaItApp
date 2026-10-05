<script setup lang="ts">
/**
 * 角色權限(giga-Portal PRD I4、Gateway PRD §8.3.2、§8.3.4):選一個應用,以樹狀「應用 → 目錄 → 選單 → Tab → 按鈕」× 角色矩陣檢視與設定;
 *   每列標示綁定的 API(授予節點即一併取得)。應用選「未綁定畫面的 API」可設定沒有綁到畫面的 API 權限(系統用 / 特殊用途)。
 *   資料:GET /api/admin/apps、/api/admin/permissions?tree=1&app=、角色與角色權限(composables/bffRbac)
 *   設定:點角色欄的「編輯」勾選後儲存(PUT /api/admin/roles/:role/permissions,會保留該角色在其他應用的權限)。寫入需 gw.admin.rbac.write。
 *   新增 / 改名 / 排序選單、Tab、按鈕在「系統管理 › 選單管理」。
 * 應用與其畫面權限由各應用的 gateway-rbac.yaml(CLI apply)首次登記;API 權限由後端 OpenAPI x-permissions 註冊,在選單管理綁到畫面節點。
 */
import { computed, ref } from 'vue';
import { rbac } from '@/api/admin';
import { can, UI } from '@/api/auth';
import { describeError } from '@/api/http';
import { KIND, tabsUnder, useAppPermTree, type FlatPerm } from '@/composables/appPermTree';
import { useBffRbac } from '@/composables/bffRbac';
import { confirm, toast } from '@/ui';

const { apps, app, appOptions, tree, flat } = useAppPermTree();
const { data, grants, reload } = useBffRbac();
const roles = computed(() => data.value?.roles ?? []);
/** 畫面節點綁定的 API 權限(選單管理設定;授予節點即一併取得) */
const includesOf = computed(() => new Map((data.value?.permissions ?? []).map((p) => [p.code, p.includes ?? []])));
type Flat = FlatPerm;

// ---- 編輯某角色在此應用的權限 ----
const editing = ref<string | null>(null);
const draft = ref<Set<string>>(new Set());
const saving = ref(false);
function startEdit(role: string) {
  editing.value = role;
  draft.value = new Set(grants.value.get(role) ?? []);
}
/** 勾選時一併勾選上層(略過目錄)與選單底下的 Tab;取消時一併取消下層 */
function toggle(f: Flat, on: boolean) {
  const s = new Set(draft.value);
  if (on) [f.node.code, ...f.ancestors, ...(f.node.kind === 'menu' ? tabsUnder(f.node) : [])].forEach((c) => s.add(c));
  else [f.node.code, ...f.descendants].forEach((c) => s.delete(c));
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
    title: `儲存「${roles.value.find((r) => r.code === role)?.name}」的權限?`,
    message: `新增 ${diff.value.add} 項、移除 ${diff.value.remove} 項(只影響此應用)。擁有此角色的使用者下次請求即生效。`,
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    await rbac.setRolePermissions(role, [...draft.value]);
    toast.success('已儲存角色權限');
    editing.value = null;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
const has = (role: string, code: string) => (editing.value === role ? draft.value.has(code) : !!grants.value.get(role)?.has(code));
const countIn = (role: string) => flat.value.filter((f) => has(role, f.node.code)).length;

const canWrite = computed(() => can(UI.roleRolePermEdit));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <template v-if="editing">
        <GBadge tone="warning" icon="edit">編輯中:+{{ diff.add }} / −{{ diff.remove }}</GBadge>
        <GButton variant="ghost" @click="editing = null">取消</GButton>
        <GButton variant="primary" icon="save" :loading="saving" @click="save">儲存</GButton>
      </template>
      <template v-else>
        <GButton icon="refresh" @click="(tree.reload(), reload())">重新整理</GButton>
      </template>
    </Teleport>

    <GCard padding="sm">
      <div class="row">
        <span class="muted small">應用</span>
        <GSelect v-model="app" :options="appOptions" icon="apps" :disabled="!!editing" />
        <span class="spacer" />
        <span class="faint xs">勾選子項會自動勾選上層;取消上層會一併取消子項 · 新增或改名請到<RouterLink to="/system/menus">選單管理</RouterLink></span>
      </div>
    </GCard>

    <GCard v-if="apps.error.value || tree.error.value">
      <GEmpty tone="danger" icon="key" title="無法載入權限" :description="describeError(apps.error.value ?? tree.error.value)" />
    </GCard>
    <GCard v-else padding="none">
      <GSkeleton v-if="!tree.data.value || !data" :lines="10" style="padding: 20px" />
      <GEmpty v-else-if="!flat.length" compact title="此應用尚未登記權限" />
      <div v-else class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="corner">權限 \ 角色</th>
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
          <tbody>
            <tr v-for="f in flat" :key="f.node.code">
              <th class="perm" :style="{ '--depth': f.depth }">
                <div class="pl">
                  <GBadge :tone="KIND[f.node.kind]?.tone ?? 'neutral'" variant="outline">{{ KIND[f.node.kind]?.label ?? f.node.kind }}</GBadge>
                  <div class="pn">
                    <span>{{ f.node.name }}</span>
                    <code>{{ f.node.code }}</code>
                    <span v-if="includesOf.get(f.node.code)?.length" class="api-chips" title="綁定的 API:授予此項即一併取得">
                      <GBadge v-for="c in includesOf.get(f.node.code)" :key="c" tone="neutral">{{ c }}</GBadge>
                    </span>
                  </div>
                </div>
              </th>
              <td v-for="r in roles" :key="r.code" class="cell" :class="{ editing: editing === r.code }">
                <span v-if="f.node.kind === 'group'" class="faint xs" title="選單目錄只用來分組,不需授予">—</span>
                <GCheckbox
                  v-else-if="editing === r.code"
                  :model-value="draft.has(f.node.code)"
                  :aria-label="`${r.name} ${f.node.name}`"
                  @update:model-value="toggle(f, $event)"
                />
                <span v-else-if="has(r.code, f.node.code)" class="yes"><GIcon name="check" :size="14" :stroke="3" /></span>
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
.api-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 3px;
}
.api-chips :deep(.g-badge) {
  font-size: 10px;
  padding: 0 6px;
  opacity: 0.8;
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 300px);
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
.perm {
  position: sticky;
  left: 0;
  z-index: 1;
  background: var(--glass-strong);
  backdrop-filter: blur(12px);
  padding: 6px 12px 6px calc(12px + var(--depth) * 20px);
  text-align: left;
  font-weight: 400;
}
.pl {
  display: flex;
  align-items: center;
  gap: 8px;
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
