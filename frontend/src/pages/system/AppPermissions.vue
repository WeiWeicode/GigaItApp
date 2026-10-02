<script setup lang="ts">
/**
 * 應用權限(giga-Portal PRD I4、Gateway PRD §8.3.2):選一個應用,以樹狀「應用 → 選單 → Tab → 按鈕」× 角色矩陣檢視與設定。
 *   資料:GET /api/admin/apps、/api/admin/permissions?tree=1&app=、角色與角色權限(composables/bffRbac)
 *   設定:點角色欄的「編輯」勾選後儲存(PUT /api/admin/roles/:role/permissions,會保留該角色在其他應用的權限);
 *        新增選單 / Tab / 按鈕權限(POST /api/admin/permissions)。寫入需 gw.admin.rbac.write。
 * 應用與其 app 權限由各應用的 gateway-rbac.yaml(CLI apply)登記;按鈕權限通常等於 API 權限,由後端 OpenAPI x-permissions 匯入。
 */
import { computed, reactive, ref, watch } from 'vue';
import { rbac, type PermNode } from '@/api/admin';
import { can, GW } from '@/api/auth';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const apps = useAsync(() => rbac.apps());
const app = ref('');
watch(
  () => apps.data.value,
  (a) => {
    if (!app.value && a?.items[0]) app.value = a.items.find((x) => x.code === 'it')?.code ?? a.items[0].code;
  },
);
const appOptions = computed(() => (apps.data.value?.items ?? []).map((a) => ({ label: `${a.name}(${a.basePath})`, value: a.code })));
const tree = useAsync(() => rbac.permissionTree(app.value), { immediate: false });
watch(app, (v) => v && tree.reload());

const { data, grants, reload } = useBffRbac();
const roles = computed(() => data.value?.roles ?? []);

const KIND: Record<string, { label: string; tone: string }> = {
  app: { label: '應用', tone: 'success' },
  menu: { label: '選單', tone: 'primary' },
  tab: { label: 'Tab', tone: 'cyan' },
  button: { label: '按鈕', tone: 'violet' },
  api: { label: 'API', tone: 'neutral' },
};
type Flat = { node: PermNode; depth: number };
const flat = computed<Flat[]>(() => {
  const out: Flat[] = [];
  const walk = (l: PermNode[], d: number) => l.forEach((n) => (out.push({ node: n, depth: d }), walk(n.children, d + 1)));
  walk(tree.data.value?.items ?? [], 0);
  return out;
});

// ---- 編輯某角色在此應用的權限 ----
const editing = ref<string | null>(null);
const draft = ref<Set<string>>(new Set());
const saving = ref(false);
function startEdit(role: string) {
  editing.value = role;
  draft.value = new Set(grants.value.get(role) ?? []);
}
/** 勾選子項時一併勾選上層(沒有上層權限,選單 / Tab 不會顯示);取消上層時一併取消子項 */
function toggle(f: Flat, on: boolean) {
  const s = new Set(draft.value);
  const desc = (n: PermNode): string[] => [n.code, ...n.children.flatMap(desc)];
  if (on) {
    s.add(f.node.code);
    const i = flat.value.indexOf(f);
    let depth = f.depth;
    for (let j = i - 1; j >= 0 && depth > 0; j--)
      if (flat.value[j]!.depth < depth) {
        s.add(flat.value[j]!.node.code);
        depth = flat.value[j]!.depth;
      }
  } else desc(f.node).forEach((c) => s.delete(c));
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

// ---- 新增權限節點 ----
const addOpen = ref(false);
const form = reactive({ code: '', name: '', kind: 'menu', parentCode: '', sort: '' });
const adding = ref(false);
const parentOptions = computed(() => flat.value.map((f) => ({ label: `${'　'.repeat(f.depth)}${f.node.name}(${f.node.code})`, value: f.node.code })));
function openAdd(parent?: PermNode) {
  const p = parent ?? flat.value[0]?.node;
  const prefix = p ? p.code.split('.')[0] : app.value;
  Object.assign(form, { code: `${prefix}.`, name: '', kind: p?.kind === 'menu' ? 'button' : 'menu', parentCode: p?.code ?? '', sort: '' });
  addOpen.value = true;
}
async function add() {
  adding.value = true;
  try {
    await rbac.createPermission({
      code: form.code.trim(),
      name: form.name.trim(),
      kind: form.kind,
      parentCode: form.parentCode || null,
      sort: form.sort ? Number(form.sort) : null,
    });
    toast.success('已新增權限', form.code);
    addOpen.value = false;
    await Promise.all([tree.reload(), reload()]);
  } catch (e) {
    toast.fromError(e, '新增失敗');
  } finally {
    adding.value = false;
  }
}
const canWrite = computed(() => can(GW.rbacWrite));
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
        <GButton v-if="canWrite" variant="primary" icon="plus" :disabled="!flat.length" @click="openAdd()">新增權限</GButton>
      </template>
    </Teleport>

    <GCard padding="sm">
      <div class="row">
        <span class="muted small">應用</span>
        <GSelect v-model="app" :options="appOptions" icon="apps" :disabled="!!editing" />
        <span class="spacer" />
        <span class="faint xs">勾選子項會自動勾選上層;取消上層會一併取消子項</span>
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
                  </div>
                  <GButton v-if="canWrite && !editing" size="sm" variant="ghost" square icon="plus" title="新增下層權限" class="add" @click="openAdd(f.node)" />
                </div>
              </th>
              <td v-for="r in roles" :key="r.code" class="cell" :class="{ editing: editing === r.code }">
                <GCheckbox
                  v-if="editing === r.code"
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

    <GModal v-model:open="addOpen" title="新增權限" icon="key" width="520px">
      <form id="perm-form" class="stack" style="--gap: 14px" @submit.prevent="add">
        <GSelect v-model="form.parentCode" label="上層" :options="parentOptions" required />
        <div class="grid" style="grid-template-columns: 1fr 140px; --gap: 12px">
          <GInput v-model="form.code" label="權限代碼" placeholder="例:it.report.export" required hint="{系統}.{資源}.{動作},建立後不可改" />
          <GSelect
            v-model="form.kind"
            label="類型"
            :options="[
              { label: '選單', value: 'menu' },
              { label: 'Tab', value: 'tab' },
              { label: '按鈕', value: 'button' },
            ]"
          />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 120px; --gap: 12px">
          <GInput v-model="form.name" label="名稱" required />
          <GInput v-model="form.sort" label="排序" type="number" />
        </div>
        <p class="faint xs" style="margin: 0">新權限不會自動授予任何角色;建立後在矩陣中勾選。前端需以同一代碼控制選單 / Tab / 按鈕顯示才有作用。</p>
      </form>
      <template #footer>
        <GButton variant="ghost" @click="addOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="perm-form" :loading="adding">新增</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
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
.add {
  margin-left: auto;
  opacity: 0;
}
tr:hover .add {
  opacity: 1;
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
