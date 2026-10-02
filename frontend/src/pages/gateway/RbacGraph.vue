<script setup lang="ts">
/**
 * 權限關係圖:角色 → 權限 → API 路由。滑鼠移到任一節點,會亮出上下游整條路徑;點擊可固定。
 * 只畫「需權限」的路由(公開 / 登入即可的路由不經角色控管)。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { gw } from '@/api/admin';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';
import { useAsync } from '@/composables/useAsync';

const { data: rbac, error, grants, bySystem, reload } = useBffRbac();
// 關係圖只畫「需權限」且未停用的路由(BFF 每頁上限 200 支,超過時畫面會提示)
const routes = useAsync(() => gw.routes({ status: 'draft,published,deprecated', page: 1, pageSize: 200 }));

const system = ref('');
const systems = computed(() => [{ label: '全部', value: '' }, ...bySystem.value.map((g) => ({ label: g.system, value: g.system }))]);

const NODE_H = 40;
const GAP = 8;
const TOP = 36;

const el = ref<HTMLElement>();
const width = ref(900);
let ro: ResizeObserver | null = null;
onMounted(() => {
  // 取整數並忽略 1px 內的變化,避免捲軸出現 / 消失造成的寬度抖動反覆觸發重排
  ro = new ResizeObserver(([e]) => {
    const w = Math.max(640, Math.floor(e!.contentRect.width));
    if (Math.abs(w - width.value) > 1) width.value = w;
  });
  if (el.value) ro.observe(el.value);
});
onBeforeUnmount(() => ro?.disconnect());

/** 左右各留 EDGE 空間,節點的高亮外框 / 陰影不會超出容器而產生水平捲軸(超出會讓版面反覆重排、左右閃動) */
const EDGE = 8;
const colW = computed(() => Math.min(260, (width.value - 2 * EDGE - 160) / 3));
const colX = computed(() => [EDGE, (width.value - colW.value) / 2, width.value - EDGE - colW.value]);

type Node = { id: string; col: 0 | 1 | 2; label: string; sub: string; y: number };

const graph = computed(() => {
  const allPerms = (rbac.value?.permissions ?? []).filter((p) => !system.value || p.systemCode === system.value);
  const permSet = new Set(allPerms.map((p) => p.code));
  const roles = (rbac.value?.roles ?? []).filter((r) => [...(grants.value.get(r.code) ?? [])].some((p) => permSet.has(p)));
  // 依連線的平均位置排序(barycenter),減少線條交錯:權限跟著角色、路由跟著權限
  const roleIdx = new Map(roles.map((r, i) => [r.code, i]));
  const center = (p: string) => {
    const idx = roles.filter((r) => grants.value.get(r.code)?.has(p)).map((r) => roleIdx.get(r.code)!);
    return idx.length ? idx.reduce((s, i) => s + i, 0) / idx.length : roles.length;
  };
  const perms = [...allPerms].sort((a, b) => center(a.code) - center(b.code) || a.code.localeCompare(b.code));
  const permIdx = new Map(perms.map((p, i) => [p.code, i]));
  const rts = (routes.data.value?.items ?? [])
    .filter((r) => r.authMode === 'permission' && r.permissionCode && permSet.has(r.permissionCode))
    .sort((a, b) => permIdx.get(a.permissionCode!)! - permIdx.get(b.permissionCode!)! || a.publicPath.localeCompare(b.publicPath));

  const edges: { from: string; to: string }[] = [];
  for (const r of roles) for (const p of grants.value.get(r.code) ?? []) if (permSet.has(p)) edges.push({ from: `r:${r.code}`, to: `p:${p}` });
  for (const rt of rts) edges.push({ from: `p:${rt.permissionCode}`, to: `a:${rt.routeCode}` });

  const place = <T,>(items: T[], col: 0 | 1 | 2, f: (x: T) => Omit<Node, 'col' | 'y'>) => items.map((x, i) => ({ ...f(x), col, y: TOP + i * (NODE_H + GAP) }));
  // 路由盡量與所屬權限同高(不重疊)
  let nextY = TOP;
  const routeNodes: Node[] = rts.map((r) => {
    const y = Math.max(nextY, TOP + permIdx.get(r.permissionCode!)! * (NODE_H + GAP));
    nextY = y + NODE_H + GAP;
    return { id: `a:${r.routeCode}`, col: 2, label: `${r.method} ${r.publicPath}`, sub: r.name, y };
  });
  const nodes: Node[] = [
    ...place(roles, 0, (r) => ({ id: `r:${r.code}`, label: r.name, sub: r.code })),
    ...place(perms, 1, (p) => ({ id: `p:${p.code}`, label: p.name, sub: p.code })),
    ...routeNodes,
  ];
  const height = Math.max(TOP + Math.max(roles.length, perms.length, 1) * (NODE_H + GAP), nextY) + 10;
  return { nodes, edges, height, byId: new Map(nodes.map((n) => [n.id, n])), counts: [roles.length, perms.length, rts.length] };
});

const hover = ref<string | null>(null);
const pinned = ref<string | null>(null);
const focus = computed(() => pinned.value ?? hover.value);

/** 與焦點節點相連的所有節點(往上游與下游各走到底) */
const lit = computed(() => {
  const f = focus.value;
  if (!f) return null;
  const set = new Set([f]);
  const walk = (dir: 'up' | 'down', from: string) => {
    for (const e of graph.value.edges) {
      const [a, b] = dir === 'down' ? [e.from, e.to] : [e.to, e.from];
      if (a === from && !set.has(b)) {
        set.add(b);
        walk(dir, b);
      }
    }
  };
  walk('down', f);
  walk('up', f);
  return set;
});

function edgePath(e: { from: string; to: string }) {
  const a = graph.value.byId.get(e.from)!;
  const b = graph.value.byId.get(e.to)!;
  const x1 = colX.value[a.col]! + colW.value;
  const y1 = a.y + NODE_H / 2;
  const x2 = colX.value[b.col]!;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
}
const COL_TITLES = ['角色', '權限', 'API 路由'];
const COL_TONES = ['primary', 'violet', 'cyan'];
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" @click="(reload(), routes.reload())">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="row">
        <span class="muted small">系統</span>
        <GSegmented v-model="system" :options="systems" size="sm" />
        <span class="spacer" />
        <GBadge v-if="routes.data.value && routes.data.value.total > routes.data.value.items.length" tone="warning" icon="alert">
          需權限的路由共 {{ routes.data.value.total }} 支,圖上只顯示前 {{ routes.data.value.items.length }} 支,請依系統篩選
        </GBadge>
        <span class="faint xs"><GIcon name="info" :size="13" /> 移到節點上查看關聯,點擊固定 / 取消</span>
      </div>
    </GCard>

    <GCard v-if="error || routes.error.value">
      <GEmpty tone="danger" icon="graph" title="無法載入關係圖" :description="describeError(error ?? routes.error.value)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <GCard v-else padding="md">
      <div ref="el" class="graph" :style="{ height: `${graph.height}px` }" @click.self="pinned = null">
        <GSkeleton v-if="!rbac || !routes.data.value" :lines="12" />
        <template v-else>
          <div v-for="(t, i) in COL_TITLES" :key="t" class="col-title" :class="`tone-${COL_TONES[i]}`" :style="{ left: `${colX[i]}px`, width: `${colW}px` }">
            {{ t }} <span class="faint">{{ graph.counts[i] }}</span>
          </div>
          <svg class="edges" :width="width" :height="graph.height" aria-hidden="true">
            <defs>
              <linearGradient id="edge-grad" x1="0" x2="1">
                <stop offset="0" stop-color="var(--brand-1)" />
                <stop offset="1" stop-color="var(--brand-2)" />
              </linearGradient>
            </defs>
            <path
              v-for="e in graph.edges"
              :key="`${e.from}>${e.to}`"
              :d="edgePath(e)"
              :class="{ on: lit && lit.has(e.from) && lit.has(e.to), off: lit && !(lit.has(e.from) && lit.has(e.to)) }"
            />
          </svg>
          <button
            v-for="n in graph.nodes"
            :key="n.id"
            type="button"
            class="node"
            :class="[`tone-${COL_TONES[n.col]}`, { on: lit?.has(n.id), off: lit && !lit.has(n.id), pinned: pinned === n.id }]"
            :style="{ left: `${colX[n.col]}px`, top: `${n.y}px`, width: `${colW}px`, height: `${NODE_H}px` }"
            :title="`${n.label}\n${n.sub}`"
            @mouseenter="hover = n.id"
            @mouseleave="hover = null"
            @click="pinned = pinned === n.id ? null : n.id"
          >
            <i class="bar" />
            <span class="txt">
              <b class="ellipsis" :class="{ mono: n.col === 2 }">{{ n.label }}</b>
              <small class="ellipsis" :class="{ mono: n.col !== 2 }">{{ n.sub }}</small>
            </span>
          </button>
          <GEmpty v-if="!graph.nodes.length" title="此系統沒有權限資料" />
        </template>
      </div>
    </GCard>
  </div>
</template>

<style scoped>
.graph {
  position: relative;
  min-height: 300px;
  overflow-x: auto;
  overflow-y: hidden;
}
.col-title {
  position: absolute;
  top: 0;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--tone);
}
.edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.edges path {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 1.3;
  transition:
    stroke var(--dur),
    opacity var(--dur),
    stroke-width var(--dur);
}
.edges path.on {
  stroke: url(#edge-grad);
  stroke-width: 2.4;
  filter: drop-shadow(0 0 4px rgb(99 102 241 / 0.6));
}
.edges path.off {
  opacity: 0.12;
}
.node {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px 0 0;
  overflow: hidden;
  border-radius: 10px;
  border: 1px solid var(--glass-border-2);
  background: var(--glass-strong);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-sm);
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition:
    opacity var(--dur),
    box-shadow var(--dur),
    border-color var(--dur);
}
.node .bar {
  flex: none;
  width: 4px;
  align-self: stretch;
  background: var(--tone);
}
.node .txt {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.25;
}
.node b {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.node small {
  font-size: 11px;
  color: var(--text-3);
}
.node.on {
  border-color: color-mix(in srgb, var(--tone) 60%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--tone) 40%, transparent),
    0 6px 20px color-mix(in srgb, var(--tone) 30%, transparent);
}
.node.off {
  opacity: 0.3;
}
.node.pinned {
  background: color-mix(in srgb, var(--tone) 18%, var(--glass-strong));
}
</style>
