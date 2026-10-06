<script setup lang="ts">
/**
 * 架構觀測 › 架構圖(Gateway MONITORING-PLAN W9-10):GET /api/observe/topology,每 15 秒更新。
 * 依分層(展示 / 接入 API / 核心服務 / 資料 / 維運)排列服務,連線為呼叫關係;滑鼠移到節點亮出相連的服務,點擊看詳情。
 * 節點顯示近 1 小時請求數、錯誤數與平均耗時;規劃中的服務以虛線表示。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { describeError } from '@/api/http';
import { HEALTH, LAYERS, notConnected, observe, TYPE_LABEL, type HealthStatus, type ObserveService } from '@/api/observe';
import ServiceDetailModal from '@/components/observe/ServiceDetailModal.vue';
import { fmtClock, fmtMs, usePolling } from '@/composables/observe';
import { useAsync } from '@/composables/useAsync';

const router = useRouter();
const { data, error, loading, reload } = useAsync(() => observe.topology());
const { lastAt } = usePolling(reload);

const q = ref('');
const statusFilter = ref<HealthStatus | ''>('');
const selected = ref<string | null>(null);

const counts = computed(() => {
  const c: Record<HealthStatus, number> = { healthy: 0, degraded: 0, down: 0, unknown: 0 };
  for (const s of data.value?.services ?? []) if (s.lifecycle !== 'planned') c[s.health.status]++;
  return c;
});
const matches = (s: ObserveService) => {
  const k = q.value.trim().toLowerCase();
  const hitQ = !k || [s.id, s.name, ...s.stack].some((v) => v.toLowerCase().includes(k));
  return hitQ && (!statusFilter.value || s.health.status === statusFilter.value);
};

// ---- 版面 ----
const NODE_W = 200;
const NODE_H = 86;
const GAP_X = 28;
const GAP_Y = 20;
const BAND_PAD = 18;
const TITLE_H = 30;

const el = ref<HTMLElement>();
const width = ref(1000);
let ro: ResizeObserver | null = null;
onMounted(() => {
  ro = new ResizeObserver(([e]) => {
    const w = Math.max(NODE_W + 40, Math.floor(e!.contentRect.width));
    if (Math.abs(w - width.value) > 1) width.value = w;
  });
  if (el.value) ro.observe(el.value);
});
onBeforeUnmount(() => ro?.disconnect());

type Placed = ObserveService & { x: number; y: number };
const layout = computed(() => {
  const services = data.value?.services ?? [];
  const perRow = Math.max(1, Math.floor((width.value - 2 * BAND_PAD + GAP_X) / (NODE_W + GAP_X)));
  const bands: { key: string; label: string; icon: string; y: number; h: number; count: number }[] = [];
  const nodes: Placed[] = [];
  let y = 0;
  const known = new Set(LAYERS.map((l) => l.key));
  const layers = [...LAYERS, ...[...new Set(services.map((s) => s.layer))].filter((l) => !known.has(l)).map((l) => ({ key: l, label: l, icon: 'layers' }))];
  for (const layer of layers) {
    const list = services.filter((s) => s.layer === layer.key);
    if (!list.length) continue;
    const rows = Math.ceil(list.length / perRow);
    const h = TITLE_H + rows * NODE_H + (rows - 1) * GAP_Y + BAND_PAD;
    list.forEach((s, i) => {
      const row = Math.floor(i / perRow);
      const inRow = Math.min(perRow, list.length - row * perRow);
      const rowW = inRow * NODE_W + (inRow - 1) * GAP_X;
      const x0 = (width.value - rowW) / 2;
      nodes.push({ ...s, x: x0 + (i % perRow) * (NODE_W + GAP_X), y: y + TITLE_H + row * (NODE_H + GAP_Y) });
    });
    bands.push({ ...layer, y, h, count: list.length });
    y += h + 16;
  }
  return { nodes, bands, height: Math.max(y, 200), byId: new Map(nodes.map((n) => [n.id, n])) };
});

const edges = computed(() => (data.value?.edges ?? []).filter((e) => layout.value.byId.has(e.from) && layout.value.byId.has(e.to)));

/** 下層:底邊 → 頂邊;同層:右邊 → 左邊;上層:頂邊 → 底邊 */
function edgeGeom(e: { from: string; to: string }) {
  const a = layout.value.byId.get(e.from)!;
  const b = layout.value.byId.get(e.to)!;
  if (Math.abs(a.y - b.y) < 1) {
    const [l, r] = a.x < b.x ? [a, b] : [b, a];
    const x1 = l.x + NODE_W;
    const x2 = r.x;
    const y1 = l.y + NODE_H / 2;
    return { d: `M${x1},${y1} L${x2},${y1}`, mx: (x1 + x2) / 2, my: y1 - 4 };
  }
  const down = b.y > a.y;
  const x1 = a.x + NODE_W / 2;
  const y1 = down ? a.y + NODE_H : a.y;
  const x2 = b.x + NODE_W / 2;
  const y2 = down ? b.y : b.y + NODE_H;
  const my = (y1 + y2) / 2;
  return { d: `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`, mx: (x1 + x2) / 2, my };
}

const hover = ref<string | null>(null);
const lit = computed(() => {
  const f = hover.value;
  if (!f) return null;
  const set = new Set([f]);
  for (const e of edges.value) {
    if (e.from === f) set.add(e.to);
    if (e.to === f) set.add(e.from);
  }
  return set;
});
const dim = (id: string) => {
  const n = layout.value.byId.get(id);
  return (lit.value && !lit.value.has(id)) || (n && !matches(n));
};

const STATUS_CHIPS: HealthStatus[] = ['healthy', 'degraded', 'down', 'unknown'];
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="toolbar">
        <button
          v-for="s in STATUS_CHIPS"
          :key="s"
          type="button"
          class="chip"
          :class="[`tone-${HEALTH[s].tone}`, { on: statusFilter === s }]"
          @click="statusFilter = statusFilter === s ? '' : s"
        >
          <i class="dot" />{{ HEALTH[s].label }} <b class="num">{{ counts[s] }}</b>
        </button>
        <GInput v-model="q" icon="search" placeholder="搜尋服務名稱、代號、技術棧…" clearable class="grow" size="md" />
        <span class="faint xs nowrap"><i class="live" /> 即時更新 · {{ fmtClock(lastAt) }}</span>
      </div>
      <div v-if="data?.unregistered.length" class="row unreg">
        <GIcon name="alert-circle" :size="14" />
        <span class="small">有服務在回報但未登錄到架構圖:</span>
        <code v-for="u in data.unregistered" :key="u" class="small">{{ u }}</code>
      </div>
    </GCard>

    <GCard v-if="error && !data">
      <GEmpty v-if="notConnected(error)" icon="workflow" title="觀測服務尚未接入" description="Gateway 尚未發佈 /api/observe/* 路由(giga-observe 部署後由 IT 匯入並發佈)" />
      <GEmpty v-else tone="danger" icon="workflow" title="無法取得架構圖" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="md">
      <div ref="el" class="map" :style="{ height: `${layout.height}px` }">
        <GSkeleton v-if="!data" :lines="12" />
        <template v-else>
          <div v-for="b in layout.bands" :key="b.key" class="band" :style="{ top: `${b.y}px`, height: `${b.h}px` }">
            <span class="band-title"><GIcon :name="b.icon" :size="14" /> {{ b.label }} <span class="faint">{{ b.count }}</span></span>
          </div>
          <svg class="edges" :width="width" :height="layout.height" aria-hidden="true">
            <g v-for="e in edges" :key="`${e.from}>${e.to}`" :class="{ on: lit && lit.has(e.from) && lit.has(e.to), off: lit && !(lit.has(e.from) && lit.has(e.to)) }">
              <path :d="edgeGeom(e).d" />
              <text v-if="e.label" :x="edgeGeom(e).mx" :y="edgeGeom(e).my" text-anchor="middle">{{ e.label }}</text>
            </g>
          </svg>
          <button
            v-for="n in layout.nodes"
            :key="n.id"
            type="button"
            class="node"
            :class="[`tone-${HEALTH[n.health.status].tone}`, { planned: n.lifecycle === 'planned', off: dim(n.id), on: lit?.has(n.id) }]"
            :style="{ left: `${n.x}px`, top: `${n.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px` }"
            :title="`${n.name}(${n.id})\n${HEALTH[n.health.status].label}`"
            @mouseenter="hover = n.id"
            @mouseleave="hover = null"
            @click="selected = n.id"
          >
            <span class="head">
              <i class="dot" />
              <b class="ellipsis">{{ n.name }}</b>
            </span>
            <span class="tags">
              <span class="tag">{{ TYPE_LABEL[n.type] ?? n.type }}</span>
              <span class="tag mono ellipsis">{{ n.id }}</span>
            </span>
            <span class="metrics">
              <template v-if="n.lifecycle === 'planned'"><span class="faint">規劃中</span></template>
              <template v-else>
                <span>{{ n.health.stats1h.total }} 次</span>
                <span :class="{ err: n.health.stats1h.error > 0 }">{{ n.health.stats1h.error }} 錯誤</span>
                <span class="spacer" />
                <span class="faint">{{ n.health.stats1h.total ? fmtMs(n.health.stats1h.avgMs) : '—' }}</span>
              </template>
            </span>
          </button>
          <GEmpty v-if="!layout.nodes.length" icon="workflow" title="架構圖沒有服務" description="giga-observe 的 topology.json 尚未登錄服務" />
        </template>
      </div>
    </GCard>

    <ServiceDetailModal
      :service-id="selected"
      @close="selected = null"
      @select="(id) => (selected = id)"
      @trace="(t) => router.push({ path: '/gateway/observe/logs', query: { traceId: t } })"
    />
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.grow {
  flex: 1 1 240px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--tone) 30%, transparent);
  background: color-mix(in srgb, var(--tone) 8%, transparent);
  color: var(--text);
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: background var(--dur) var(--ease);
}
.chip.on {
  background: color-mix(in srgb, var(--tone) 22%, transparent);
  border-color: var(--tone);
}
.chip .dot,
.node .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--tone);
  flex: none;
}
.live {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c-success);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--c-success) 25%, transparent);
  margin-right: 2px;
}
.unreg {
  --gap: 6px;
  margin-top: 8px;
  color: var(--c-warning);
}
.map {
  position: relative;
  min-height: 200px;
}
.band {
  position: absolute;
  left: 0;
  right: 0;
  border-radius: var(--radius-md);
  border: 1px dashed var(--line);
  background: color-mix(in srgb, var(--glass-soft) 60%, transparent);
}
.band-title {
  position: absolute;
  top: 7px;
  left: 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-2);
  letter-spacing: 0.04em;
}
.edges {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: visible;
}
.edges path {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 1.3;
  transition:
    stroke var(--dur),
    opacity var(--dur);
}
.edges text {
  font-size: 10px;
  fill: var(--text-3);
  paint-order: stroke;
  stroke: var(--bg);
  stroke-width: 3px;
}
.edges g.on path {
  stroke: var(--c-primary);
  stroke-width: 2;
}
.edges g.off {
  opacity: 0.15;
}
/* 不透明底:連線從節點後方經過,不會穿過卡片內容 */
.node::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  border-radius: inherit;
  background: var(--bg);
}
.node {
  position: absolute;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 10px 14px;
  text-align: left;
  border-radius: var(--radius-md);
  border: 1px solid var(--glass-border);
  border-left: 3px solid var(--tone);
  background: var(--glass-strong);
  backdrop-filter: blur(var(--glass-blur));
  color: var(--text);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition:
    opacity var(--dur),
    box-shadow var(--dur),
    transform var(--dur) var(--ease);
}
.node:hover,
.node.on {
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--tone) 45%, transparent), var(--shadow-md);
  transform: translateY(-1px);
}
.node.off {
  opacity: 0.3;
}
.node.planned {
  border-style: dashed;
  border-left-style: dashed;
  opacity: 0.75;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: var(--fs-sm);
}
.tags {
  display: flex;
  gap: 4px;
  min-width: 0;
}
.tag {
  padding: 1px 6px;
  border-radius: var(--radius-xs);
  background: var(--glass-soft);
  border: 1px solid var(--line);
  font-size: 10.5px;
  color: var(--text-2);
  max-width: 140px;
}
.metrics {
  display: flex;
  gap: 8px;
  font-size: var(--fs-xs);
  color: var(--text-2);
}
.metrics .err {
  color: var(--c-danger);
  font-weight: 600;
}
</style>
