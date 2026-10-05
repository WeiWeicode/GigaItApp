<script setup lang="ts">
/**
 * 部門樹(GET /api/admin/departments,Gateway PRD §8.7 v0.7):由 BPM OrganizationUnit / Organization 每小時同步(唯讀),
 * 人數為 Gateway 中啟用的使用者。點部門可到「人員」查看成員;指派規則以部門代碼(可含下層)設定角色。
 */
import { computed, ref, watch } from 'vue';
import { rbac, type DeptNode } from '@/api/admin';
import { describeError } from '@/api/http';
import { fmtTime } from '@/api/format';
import { useAsync } from '@/composables/useAsync';

const { data, loading, error, reload } = useAsync(() => rbac.departments());
const company = ref('');
const q = ref('');
const expanded = ref<Set<string>>(new Set());

const companies = computed(() => [
  { label: '全部公司', value: '' },
  // 只列有部門的公司(LOS 名稱如「碩禾」在部門樹以 BPM 名稱「碩禾電子材料」出現)
  ...(data.value?.companies ?? [])
    .filter((c) => (data.value?.items ?? []).some((d) => d.companyId === c.companyId))
    .map((c) => ({ label: c.name, value: String(c.companyId) })),
]);
const roots = computed(() => (data.value?.items ?? []).filter((d) => !company.value || String(d.companyId) === company.value));

/** 子樹總人數 */
function total(n: DeptNode): number {
  return n.userCount + n.children.reduce((s, c) => s + total(c), 0);
}
function matches(n: DeptNode, k: string): boolean {
  return n.name.toLowerCase().includes(k) || n.deptCode.toLowerCase().includes(k) || n.children.some((c) => matches(c, k));
}

type Row = { node: DeptNode; depth: number; open: boolean; total: number };
const rows = computed<Row[]>(() => {
  const k = q.value.trim().toLowerCase();
  const out: Row[] = [];
  const walk = (list: DeptNode[], depth: number) => {
    for (const n of list) {
      if (k && !matches(n, k)) continue;
      // 搜尋時自動展開符合的路徑
      const open = !!k || expanded.value.has(n.deptCode);
      out.push({ node: n, depth, open, total: total(n) });
      if (open) walk(n.children, depth + 1);
    }
  };
  walk(roots.value, 0);
  return out;
});

function toggle(code: string) {
  const s = new Set(expanded.value);
  if (s.has(code)) s.delete(code);
  else s.add(code);
  expanded.value = s;
}
// 預設展開第一層
watch(roots, (r) => {
  if (!expanded.value.size) expanded.value = new Set(r.map((d) => d.deptCode));
});
const deptCount = computed(() => {
  let n = 0;
  const walk = (l: DeptNode[]) => l.forEach((d) => (n++, walk(d.children)));
  walk(data.value?.items ?? []);
  return n;
});
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GBadge v-if="data?.syncedAt" tone="info" icon="clock">BPM 同步:{{ fmtTime(data.syncedAt) }}</GBadge>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="q" icon="search" placeholder="搜尋部門名稱或代碼" clearable class="grow" />
        <GSelect v-model="company" :options="companies" icon="building" />
        <GButton size="sm" variant="ghost" icon="minus" @click="expanded = new Set()">全部收合</GButton>
      </div>
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="building" title="無法載入部門" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="部門樹" :subtitle="`${deptCount} 個部門`" icon="building">
      <GSkeleton v-if="!data" :lines="10" style="padding: 20px" />
      <GEmpty v-else-if="!rows.length" compact title="沒有符合的部門" />
      <ul v-else class="tree">
        <li v-for="r in rows" :key="r.node.deptCode" :style="{ '--depth': r.depth }">
          <button
            type="button"
            class="twisty"
            :class="{ hidden: !r.node.children.length }"
            :aria-label="r.open ? '收合' : '展開'"
            :aria-expanded="r.open"
            @click="toggle(r.node.deptCode)"
          >
            <GIcon :name="r.open ? 'chevron-down' : 'chevron-right'" :size="15" />
          </button>
          <GIcon name="building" :size="15" class="faint" />
          <span class="name">{{ r.node.name }}</span>
          <code class="faint xs">{{ r.node.deptCode }}</code>
          <span class="spacer" />
          <GBadge v-if="r.node.children.length" tone="neutral" :title="'含下層'">{{ r.total }} 人(含下層)</GBadge>
          <GButton size="sm" variant="ghost" icon-right="chevron-right" @click="$router.push({ path: '/system/users', query: { dept: r.node.deptCode } })">
            {{ r.node.userCount }} 人
          </GButton>
        </li>
      </ul>
    </GCard>
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
.tree {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}
.tree li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 16px 4px calc(16px + var(--depth) * 22px);
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.tree li:last-child {
  border-bottom: 0;
}
.tree li:hover {
  background: var(--glass-soft);
}
.twisty {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 6px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.twisty.hidden {
  visibility: hidden;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
