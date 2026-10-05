<script setup lang="ts">
/**
 * 部門權限(Gateway PRD §8.3.4 v0.12):直接把選單 / Tab / 按鈕權限授予部門,不必建角色或規則;應用選「API 權限」可授予純 API 權限(含寫入)。
 *   左:部門樹(只列開放的公司;● = 此應用直接設定的權限數)
 *   右:權限樹 × 職級門檻(全員 / 課級 / 理級 / 處級以上)。◐ = 自上層部門繼承(含下層),不能在此取消;
 *       「含」= 已由較寬的門檻涵蓋。
 *   資料:GET /api/admin/departments、/api/admin/job-tiers、/api/admin/dept-permissions[/:deptCode]?app=
 *   設定:PUT /api/admin/dept-permissions/:deptCode(取代此部門在此應用的權限;儲存時自動補上層)。寫入需 gw.admin.rbac.write,
 *        變更後所有使用者下次請求重新計算權限。
 */
import { computed, ref, watch } from 'vue';
import { rbac, type DeptNode } from '@/api/admin';
import { can, GW } from '@/api/auth';
import { describeError } from '@/api/http';
import { isGroup, KIND, useAppPermTree, type FlatPerm } from '@/composables/appPermTree';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const { apps, app, appOptions, tree, flat } = useAppPermTree();
const tiers = useAsync(() => rbac.jobTiers());
const tierList = computed(() => tiers.data.value?.items ?? []);
const depts = useAsync(() => rbac.departments());
const counts = useAsync(() => rbac.deptPermissionCounts(app.value), { immediate: false });
const countOf = computed(() => new Map((counts.data.value?.items ?? []).map((c) => [c.deptCode, c.count])));

// ---- 部門樹 ----
const company = ref('');
const q = ref('');
const expanded = ref<Set<string>>(new Set());
const companies = computed(() => [
  { label: '全部公司', value: '' },
  // 只列有部門的公司(LOS 名稱如「碩禾」在部門樹以 BPM 名稱「碩禾電子材料」出現)
  ...(depts.data.value?.companies ?? [])
    .filter((c) => (depts.data.value?.items ?? []).some((d) => d.companyId === c.companyId))
    .map((c) => ({ label: c.name, value: String(c.companyId) })),
]);
const roots = computed(() => (depts.data.value?.items ?? []).filter((d) => !company.value || String(d.companyId) === company.value));
function matches(n: DeptNode, k: string): boolean {
  return n.name.toLowerCase().includes(k) || n.deptCode.toLowerCase().includes(k) || n.children.some((c) => matches(c, k));
}
type DeptRow = { node: DeptNode; depth: number; open: boolean };
const deptRows = computed<DeptRow[]>(() => {
  const k = q.value.trim().toLowerCase();
  const out: DeptRow[] = [];
  const walk = (list: DeptNode[], depth: number) => {
    for (const n of list) {
      if (k && !matches(n, k)) continue;
      const open = !!k || expanded.value.has(n.deptCode);
      out.push({ node: n, depth, open });
      if (open) walk(n.children, depth + 1);
    }
  };
  walk(roots.value, 0);
  return out;
});
function toggleOpen(code: string) {
  const s = new Set(expanded.value);
  if (s.has(code)) s.delete(code);
  else s.add(code);
  expanded.value = s;
}
watch(roots, (r) => {
  if (!expanded.value.size) expanded.value = new Set(r.map((d) => d.deptCode));
});

// ---- 選取部門的權限 ----
const selected = ref<DeptNode | null>(null);
const detail = useAsync(() => rbac.deptPermissions(selected.value!.deptCode, app.value), { immediate: false });
watch(app, (v) => {
  if (!v) return;
  counts.reload();
  if (selected.value) detail.reload();
});
function select(n: DeptNode) {
  if (editing.value) return;
  selected.value = n;
  detail.reload();
}

const key = (code: string, tier: string) => `${code}|${tier}`;
const direct = computed(() => new Set((detail.data.value?.direct ?? []).map((d) => key(d.code, d.jobTier))));
const inherited = computed(() => {
  const m = new Map<string, string>();
  for (const i of detail.data.value?.inherited ?? []) m.set(key(i.code, i.jobTier), i.fromName);
  return m;
});

// ---- 編輯 ----
const editing = ref(false);
const draft = ref<Set<string>>(new Set());
const draftInclude = ref(true);
const saving = ref(false);
function startEdit() {
  draft.value = new Set(direct.value);
  draftInclude.value = detail.data.value?.includeSubDepts ?? true;
  editing.value = true;
}
/** 勾選子項時一併勾選同門檻的上層;取消上層時一併取消同門檻的子項 */
function toggle(f: FlatPerm, tier: string, on: boolean) {
  const s = new Set(draft.value);
  if (on) [f.node.code, ...f.ancestors].forEach((c) => s.add(key(c, tier)));
  else [f.node.code, ...f.descendants].forEach((c) => s.delete(key(c, tier)));
  draft.value = s;
}
const diff = computed(() => {
  const cur = direct.value;
  return {
    add: [...draft.value].filter((k) => !cur.has(k)).length,
    remove: [...cur].filter((k) => !draft.value.has(k)).length,
    include: (detail.data.value?.includeSubDepts ?? true) !== draftInclude.value,
  };
});
async function save() {
  const d = selected.value!;
  const ok = await confirm({
    title: `儲存「${d.name}」的部門權限?`,
    message: `新增 ${diff.value.add} 項、移除 ${diff.value.remove} 項(只影響此應用)${diff.value.include ? `,並改為${draftInclude.value ? '含' : '不含'}下層部門` : ''}。所有使用者下次請求即重新計算權限。`,
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    await rbac.setDeptPermissions(d.deptCode, {
      app: app.value,
      includeSubDepts: draftInclude.value,
      grants: [...draft.value].map((k) => {
        const [code, jobTier] = k.split('|') as [string, string];
        return { code, jobTier };
      }),
    });
    toast.success('已儲存部門權限');
    editing.value = false;
    await Promise.all([detail.reload(), counts.reload()]);
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}

type Cell = 'direct' | 'inherited' | 'implied' | 'none';
/** 格子狀態:較寬的門檻(陣列前面)已授予時,較窄的門檻視為已涵蓋 */
function cell(code: string, tierIdx: number): { state: Cell; title: string } {
  const t = tierList.value[tierIdx]!;
  const own = editing.value ? draft.value : direct.value;
  if (own.has(key(code, t.code))) return { state: 'direct', title: `${t.name}:此部門直接設定` };
  const from = inherited.value.get(key(code, t.code));
  if (from) return { state: 'inherited', title: `${t.name}:繼承自上層部門「${from}」` };
  for (let i = 0; i < tierIdx; i++) {
    const b = tierList.value[i]!;
    if (own.has(key(code, b.code)) || inherited.value.has(key(code, b.code))) return { state: 'implied', title: `已含於「${b.name}」` };
  }
  return { state: 'none', title: '' };
}
const canWrite = computed(() => can(GW.rbacWrite));
const loadError = computed(() => apps.error.value ?? tree.error.value ?? tiers.error.value ?? depts.error.value);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <template v-if="editing">
        <GBadge tone="warning" icon="edit">編輯中:+{{ diff.add }} / −{{ diff.remove }}</GBadge>
        <GButton variant="ghost" @click="editing = false">取消</GButton>
        <GButton variant="primary" icon="save" :loading="saving" @click="save">儲存</GButton>
      </template>
      <GButton v-else icon="refresh" @click="(depts.reload(), counts.reload(), selected && detail.reload())">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="row">
        <span class="muted small">應用</span>
        <GSelect v-model="app" :options="appOptions" icon="apps" :disabled="editing" />
        <span class="spacer" />
        <span class="faint xs">◐ 繼承自上層部門 · 「含」已由較寬的門檻涵蓋 · 勾選子項自動勾選上層</span>
      </div>
    </GCard>

    <GCard v-if="loadError">
      <GEmpty tone="danger" icon="key" title="無法載入部門權限" :description="describeError(loadError)" />
    </GCard>
    <div v-else class="layout">
      <GCard padding="none" class="dept-card">
        <div class="dept-filters">
          <GInput v-model="q" icon="search" placeholder="搜尋部門名稱或代碼" clearable />
          <GSelect v-model="company" :options="companies" icon="building" />
        </div>
        <GSkeleton v-if="!depts.data.value" :lines="10" style="padding: 16px" />
        <GEmpty v-else-if="!deptRows.length" compact title="沒有符合的部門" />
        <ul v-else class="dept-list" :class="{ locked: editing }">
          <li
            v-for="r in deptRows"
            :key="r.node.deptCode"
            class="dept"
            :class="{ active: selected?.deptCode === r.node.deptCode }"
            :style="{ '--depth': r.depth }"
            @click="select(r.node)"
          >
            <button v-if="r.node.children.length" type="button" class="chev" :aria-label="r.open ? '收合' : '展開'" @click.stop="toggleOpen(r.node.deptCode)">
              <GIcon :name="r.open ? 'chevron-down' : 'chevron-right'" :size="14" />
            </button>
            <span v-else class="chev" />
            <span class="dn">{{ r.node.name }}</span>
            <code class="dc">{{ r.node.deptCode }}</code>
            <GBadge v-if="countOf.get(r.node.deptCode)" tone="primary" class="cnt" :title="`此應用直接設定 ${countOf.get(r.node.deptCode)} 項權限`">
              ● {{ countOf.get(r.node.deptCode) }}
            </GBadge>
          </li>
        </ul>
      </GCard>

      <GCard padding="none" class="perm-card">
        <GEmpty v-if="!selected" icon="building" title="選擇左側部門" description="勾選後此部門(可含下層)的人員即擁有該選單 / Tab / 按鈕(或 API)權限" />
        <template v-else>
          <div class="perm-head">
            <div class="ph-title">
              <strong>{{ selected.name }}</strong>
              <code>{{ selected.deptCode }}</code>
            </div>
            <GCheckbox v-if="editing" v-model="draftInclude" label="含下層部門" />
            <GBadge v-else-if="detail.data.value" :tone="detail.data.value.includeSubDepts ? 'info' : 'neutral'">
              {{ detail.data.value.includeSubDepts ? '含下層部門' : '不含下層部門' }}
            </GBadge>
            <span class="spacer" />
            <GButton v-if="canWrite && !editing" size="sm" variant="primary" icon="edit" :disabled="!detail.data.value || !flat.length" @click="startEdit"
              >編輯</GButton
            >
          </div>
          <GEmpty v-if="detail.error.value" tone="danger" compact title="無法載入" :description="describeError(detail.error.value)" />
          <GSkeleton v-else-if="!detail.data.value || !tree.data.value" :lines="10" style="padding: 20px" />
          <GEmpty v-else-if="!flat.length" compact title="此應用尚未登記權限" />
          <div v-else class="matrix-wrap">
            <table class="matrix">
              <thead>
                <tr>
                  <th class="corner">權限 \ 職級</th>
                  <th v-for="t in tierList" :key="t.code" class="tier" :class="{ editing }">
                    <strong>{{ t.name }}</strong>
                    <span class="faint xs">{{ t.maxLevel === null ? '不限職級' : `職級 ≤ ${t.maxLevel}` }}</span>
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
                    </div>
                  </th>
                  <td v-for="(t, i) in tierList" :key="t.code" class="cell" :class="{ editing }" :title="cell(f.node.code, i).title">
                    <span v-if="isGroup(f.node)" class="faint xs" title="選單目錄只用來分組,不需授予">—</span>
                    <span v-else-if="cell(f.node.code, i).state === 'inherited'" class="inh">◐</span>
                    <GCheckbox
                      v-else-if="editing"
                      :model-value="draft.has(key(f.node.code, t.code))"
                      :aria-label="`${t.name} ${f.node.name}`"
                      @update:model-value="toggle(f, t.code, $event)"
                    />
                    <span v-else-if="cell(f.node.code, i).state === 'direct'" class="yes"><GIcon name="check" :size="14" :stroke="3" /></span>
                    <span v-else-if="cell(f.node.code, i).state === 'implied'" class="implied">含</span>
                    <span v-else class="no" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
      </GCard>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: minmax(260px, 340px) 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.dept-filters {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-bottom: 1px solid var(--line);
}
.dept-list {
  list-style: none;
  margin: 0;
  padding: 6px;
  max-height: calc(100vh - 340px);
  overflow: auto;
}
.dept-list.locked {
  opacity: 0.6;
  pointer-events: none;
}
.dept {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px 6px calc(8px + var(--depth) * 16px);
  border-radius: 8px;
  cursor: pointer;
  font-size: var(--fs-sm);
}
.dept:hover {
  background: var(--glass);
}
.dept.active {
  background: color-mix(in srgb, var(--c-primary) 14%, transparent);
  font-weight: 600;
}
.chev {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  flex: none;
  border: 0;
  background: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 0;
}
.dn {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dc {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.cnt {
  margin-left: auto;
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
  gap: 8px;
}
.ph-title code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 340px);
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
.tier {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--glass-strong);
  backdrop-filter: blur(12px);
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
.tier {
  min-width: 96px;
  padding: 10px 8px;
}
.tier strong {
  display: block;
}
.tier.editing,
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
.inh {
  color: var(--c-info);
  font-size: 16px;
  cursor: help;
}
.implied {
  font-size: var(--fs-xs);
  color: var(--text-3);
  cursor: help;
}
.no {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}
</style>
