<script setup lang="ts">
/**
 * 個人權限(Gateway PRD §8.3.4 v0.12):查一個人在某應用「有什麼權限、從哪裡來」,並直接加給個人權限(預設永久,可設到期日)。
 *   資料:GET /api/admin/users(搜尋)、/api/admin/users/:id/effective-permissions(有效權限與來源:角色 / 部門 / 個人)、
 *        /api/admin/user-permissions/:id?app=(個人權限)
 *   設定:PUT /api/admin/user-permissions/:id(取代此人在此應用的個人權限;儲存時自動補上層)。寫入需 gw.admin.rbac.write,
 *        只重新計算此人的權限。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { rbac, users, type EffectivePermissions, type UserRow } from '@/api/admin';
import { can, GW } from '@/api/auth';
import { describeError } from '@/api/http';
import { isGroup, KIND, useAppPermTree, type FlatPerm } from '@/composables/appPermTree';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const route = useRoute();
const { apps, app, appOptions, tree, flat } = useAppPermTree();
const tiers = useAsync(() => rbac.jobTiers());
const tierName = computed(() => new Map((tiers.data.value?.items ?? []).map((t) => [t.code, t.name])));
const depts = useAsync(() => rbac.departments());
const deptName = computed(() => {
  const m = new Map<string, string>();
  const walk = (l: { deptCode: string; name: string; children: typeof l }[]) => l.forEach((d) => (m.set(d.deptCode, d.name), walk(d.children)));
  walk(depts.data.value?.items ?? []);
  return m;
});

// ---- 搜尋人員 ----
const q = ref(typeof route.query.emp === 'string' ? route.query.emp : '');
const results = ref<UserRow[]>([]);
const searching = ref(false);
async function search() {
  const k = q.value.trim();
  if (!k) return;
  searching.value = true;
  try {
    const r = await users.list({ q: k, page: 1, pageSize: 20 });
    results.value = r.items;
    if (r.items.length === 1) pick(r.items[0]!);
  } catch (e) {
    toast.fromError(e, '搜尋失敗');
  } finally {
    searching.value = false;
  }
}

const userId = ref<number | null>(null);
const effective = ref<EffectivePermissions | null>(null);
const personal = useAsync(() => rbac.userPermissions(userId.value!, app.value), { immediate: false });
const loadError = ref<Error | null>(null);
async function loadEffective() {
  if (userId.value === null) return;
  try {
    effective.value = await users.effective(userId.value);
  } catch (e) {
    loadError.value = e as Error;
  }
}
function pick(u: UserRow) {
  if (editing.value) return;
  results.value = [];
  userId.value = u.userId;
  loadError.value = null;
  effective.value = null;
  void loadEffective();
  personal.reload();
}
watch(app, (v) => v && userId.value !== null && personal.reload());
if (q.value) void search();

const eff = computed(() => new Map((effective.value?.permissions ?? []).map((p) => [p.code, p])));
const mine = computed(() => new Map((personal.data.value?.grants ?? []).map((g) => [g.code, g])));
type Source = { label: string; tone: string; title?: string };
function sources(code: string): Source[] {
  const p = eff.value.get(code);
  if (!p) return [];
  const out: Source[] = [];
  for (const r of p.grantedBy ?? []) out.push({ label: `角色 ${r}`, tone: 'primary' });
  for (const d of p.depts ?? [])
    out.push({
      label: `部門 ${deptName.value.get(d.deptCode) ?? d.deptCode}(${tierName.value.get(d.jobTier) ?? d.jobTier})`,
      tone: 'info',
      title: d.includeSubDepts ? `${d.deptCode},含下層部門` : d.deptCode,
    });
  if (p.personal) out.push({ label: '個人', tone: 'violet', title: p.personal.validTo ? `到期 ${dateOf(p.personal.validTo)}` : '永久' });
  return out;
}
const dateOf = (iso: string) => iso.slice(0, 10);

// ---- 編輯個人權限 ----
const editing = ref(false);
/** code → 到期日(yyyy-mm-dd,空字串 = 永久) */
const draft = reactive(new Map<string, { validTo: string; reason: string | null }>());
const saving = ref(false);
/** 本次編輯自動補上的上層:到期日跟著下層走(取最晚者,任一永久 = 永久) */
const autoAdded = new Set<string>();
function startEdit() {
  draft.clear();
  autoAdded.clear();
  for (const g of personal.data.value?.grants ?? []) draft.set(g.code, { validTo: g.validTo ? dateOf(g.validTo) : '', reason: g.reason });
  editing.value = true;
}
/** 勾選子項時一併勾選上層;取消上層時一併取消子項 */
function toggle(f: FlatPerm, on: boolean) {
  if (on) {
    draft.set(f.node.code, draft.get(f.node.code) ?? { validTo: '', reason: null });
    autoAdded.delete(f.node.code);
    for (const a of f.ancestors)
      if (!draft.has(a)) {
        draft.set(a, { validTo: '', reason: null });
        autoAdded.add(a);
      }
  } else
    [f.node.code, ...f.descendants].forEach((c) => {
      draft.delete(c);
      autoAdded.delete(c);
    });
  syncAncestors(f);
}
function syncAncestors(f: FlatPerm) {
  const byCode = new Map(flat.value.map((x) => [x.node.code, x]));
  for (const a of [...f.ancestors].reverse()) {
    if (!autoAdded.has(a) || !draft.has(a)) continue;
    const dates = byCode
      .get(a)!
      .descendants.filter((c) => draft.has(c) && !autoAdded.has(c))
      .map((c) => draft.get(c)!.validTo);
    draft.get(a)!.validTo = !dates.length || dates.includes('') ? '' : dates.sort().at(-1)!;
  }
}
const diff = computed(() => {
  const cur = mine.value;
  return { add: [...draft.keys()].filter((c) => !cur.has(c)).length, remove: [...cur.keys()].filter((c) => !draft.has(c)).length };
});
const today = new Date().toISOString().slice(0, 10);
async function save() {
  const u = personal.data.value!.user;
  const ok = await confirm({
    title: `儲存「${u.displayName}」的個人權限?`,
    message: `新增 ${diff.value.add} 項、移除 ${diff.value.remove} 項(只影響此應用)。此人下次請求即重新計算權限。`,
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    await rbac.setUserPermissions(u.userId, {
      app: app.value,
      // 到期日當天結束前有效
      grants: [...draft].map(([code, v]) => ({ code, validTo: v.validTo ? new Date(`${v.validTo}T23:59:59`).toISOString() : null, reason: v.reason })),
    });
    toast.success('已儲存個人權限');
    editing.value = false;
    await Promise.all([personal.reload(), loadEffective()]);
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
const canWrite = computed(() => can(GW.rbacWrite));
const pageError = computed(() => apps.error.value ?? tree.error.value ?? loadError.value ?? personal.error.value);
const u = computed(() => personal.data.value?.user ?? null);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <template v-if="editing">
        <GBadge tone="warning" icon="edit">編輯中:+{{ diff.add }} / −{{ diff.remove }}</GBadge>
        <GButton variant="ghost" @click="editing = false">取消</GButton>
        <GButton variant="primary" icon="save" :loading="saving" @click="save">儲存</GButton>
      </template>
      <GButton v-else icon="refresh" :disabled="userId === null" @click="(personal.reload(), loadEffective())">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <form class="row search" @submit.prevent="search">
        <GInput v-model="q" icon="search" placeholder="工號 / 姓名 / Email" clearable class="grow" :disabled="editing" />
        <GButton type="submit" :loading="searching" :disabled="editing">搜尋</GButton>
        <span class="muted small">應用</span>
        <GSelect v-model="app" :options="appOptions" icon="apps" :disabled="editing" />
      </form>
      <ul v-if="results.length > 1" class="results">
        <li v-for="r in results" :key="r.userId" @click="pick(r)">
          <strong>{{ r.displayName }}</strong>
          <code>{{ r.employeeNo }}</code>
          <span class="muted small">{{ r.department ?? '—' }} · {{ r.title ?? '—' }}</span>
        </li>
      </ul>
      <p v-else-if="!searching && q && results.length === 0 && userId === null" class="faint xs" style="margin: 8px 0 0">輸入後按搜尋</p>
    </GCard>

    <GCard v-if="pageError">
      <GEmpty tone="danger" icon="key" title="無法載入個人權限" :description="describeError(pageError)" />
    </GCard>
    <GCard v-else-if="userId === null">
      <GEmpty icon="user" title="搜尋並選擇人員" description="可看到此人在所選應用的有效權限與來源(角色 / 部門 / 個人),並直接加給個人權限" />
    </GCard>
    <GCard v-else padding="none">
      <div v-if="u" class="perm-head">
        <div class="ph-title">
          <strong>{{ u.displayName }}</strong>
          <code>{{ u.employeeNo }}</code>
          <span class="muted small">{{ u.department ?? '—' }} · {{ u.title ?? '—' }} · 職級 {{ u.jobLevel ?? '—' }}</span>
        </div>
        <span class="spacer" />
        <GButton v-if="canWrite && !editing" size="sm" variant="primary" icon="edit" :disabled="!flat.length" @click="startEdit">編輯個人權限</GButton>
      </div>
      <GSkeleton v-if="!personal.data.value || !effective || !tree.data.value" :lines="10" style="padding: 20px" />
      <GEmpty v-else-if="!flat.length" compact title="此應用尚未登記權限" />
      <div v-else class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="corner">權限</th>
              <th class="col">目前有效</th>
              <th class="col src">來源</th>
              <th class="col" :class="{ editing }">個人權限</th>
              <th class="col" :class="{ editing }">到期日</th>
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
                </div>
              </th>
              <td class="cell">
                <span v-if="eff.has(f.node.code)" class="yes"><GIcon name="check" :size="14" :stroke="3" /></span>
                <span v-else class="no" />
              </td>
              <td class="cell src">
                <GBadge v-for="(s, i) in sources(f.node.code)" :key="i" :tone="s.tone" :title="s.title">{{ s.label }}</GBadge>
              </td>
              <td class="cell" :class="{ editing }">
                <span v-if="isGroup(f.node)" class="faint xs" title="選單目錄只用來分組,不需授予">—</span>
                <GCheckbox
                  v-else-if="editing"
                  :model-value="draft.has(f.node.code)"
                  :aria-label="`個人權限 ${f.node.name}`"
                  @update:model-value="toggle(f, $event)"
                />
                <span v-else-if="mine.has(f.node.code)" class="yes personal"><GIcon name="check" :size="14" :stroke="3" /></span>
                <span v-else class="no" />
              </td>
              <td class="cell" :class="{ editing }">
                <template v-if="editing">
                  <input
                    v-if="draft.has(f.node.code)"
                    v-model="draft.get(f.node.code)!.validTo"
                    type="date"
                    @change="syncAncestors(f)"
                    class="date"
                    :min="today"
                    :aria-label="`${f.node.name} 到期日(空白 = 永久)`"
                    title="空白 = 永久"
                  />
                </template>
                <span v-else-if="mine.has(f.node.code)" class="small">{{
                  mine.get(f.node.code)!.validTo ? dateOf(mine.get(f.node.code)!.validTo!) : '永久'
                }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </GCard>
  </div>
</template>

<style scoped>
.search {
  flex-wrap: wrap;
}
.results {
  list-style: none;
  margin: 8px 0 0;
  padding: 4px;
  border-top: 1px solid var(--line);
  max-height: 280px;
  overflow: auto;
}
.results li {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
}
.results li:hover {
  background: var(--glass);
}
.results code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.perm-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--line);
}
.ph-title {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 8px;
}
.ph-title code {
  font-size: var(--fs-xs);
  color: var(--text-3);
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
.col {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--glass-strong);
  backdrop-filter: blur(12px);
  padding: 12px 8px;
  white-space: nowrap;
}
.corner {
  left: 0;
  z-index: 3;
  min-width: 280px;
  padding: 12px 16px;
  text-align: left;
  color: var(--text-3);
  font-weight: 600;
}
.col.src {
  min-width: 240px;
  text-align: left;
}
.col.editing,
.cell.editing {
  background: color-mix(in srgb, var(--c-warning) 10%, transparent);
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
  padding: 6px 8px;
}
.cell.src {
  text-align: left;
}
.cell.src :deep(.g-badge) {
  margin: 2px 4px 2px 0;
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
.yes.personal {
  color: var(--c-violet, var(--c-primary));
  background: color-mix(in srgb, var(--c-violet, var(--c-primary)) 16%, transparent);
}
.no {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}
.date {
  font: inherit;
  font-size: var(--fs-sm);
  padding: 4px 6px;
  border: 1px solid var(--line-strong);
  border-radius: 6px;
  background: var(--glass);
  color: var(--text-1);
}
</style>
