<script setup lang="ts">
/**
 * 架構觀測 › 流量與來源 IP:Nginx 每分鐘彙總(nginx-log-agent → giga-observe)、資安告警、來源 IP 排行、前端效能(Web Vitals p75)。
 * 來源 IP 排行由每分鐘前 20 名合併,為近似值;沒走 PROXY protocol 的連線來源會是 Docker 網段(告警會註明)。
 */
import { computed, ref, watch } from 'vue';
import { describeError } from '@/api/http';
import { fromNow } from '@/api/format';
import { notConnected, observe } from '@/api/observe';
import { fmtBytes, fmtMs, usePolling } from '@/composables/observe';
import { useAsync } from '@/composables/useAsync';
import { rate } from '@giganexus/web-kit';

const range = ref('24h');
const RANGE: Record<string, { hours: number; bucket: 'minute' | 'hour' }> = {
  '1h': { hours: 1, bucket: 'minute' },
  '24h': { hours: 24, bucket: 'hour' },
  '7d': { hours: 168, bucket: 'hour' },
};
const from = () => new Date(Date.now() - RANGE[range.value]!.hours * 3600_000).toISOString();

const traffic = useAsync(() => observe.traffic({ from: from(), bucket: RANGE[range.value]!.bucket }));
const ips = useAsync(() => observe.topIps({ from: from(), limit: 20 }));
const alerts = useAsync(() => observe.alerts());
const vitals = useAsync(() => observe.vitals(24));
const reloadAll = () => Promise.all([traffic.reload(), ips.reload(), alerts.reload(), vitals.reload()]);
watch(range, () => Promise.all([traffic.reload(), ips.reload()]));
usePolling(() => Promise.all([traffic.reload(), alerts.reload()]), 60_000);

const points = computed(() => traffic.data.value ?? []);
const fmtLabel = (iso: string) => {
  const d = new Date(iso);
  return range.value === '7d' ? `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}時` : d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });
};
const chart = computed(() => ({
  labels: points.value.map((p) => fmtLabel(p.ts)),
  series: [
    { name: '請求數', values: points.value.map((p) => p.total), color: 'var(--chart-1)' },
    { name: '4xx', values: points.value.map((p) => p.status4xx), color: 'var(--c-warning)', area: false },
    { name: '5xx', values: points.value.map((p) => p.status5xx), color: 'var(--c-danger)', area: false },
  ],
}));
const sum = (k: 'total' | 'status5xx' | 'unauthorized' | 'forbidden' | 'rateLimited' | 'bytes') => points.value.reduce((s, p) => s + p[k], 0);
const kpis = computed(() => [
  { label: '請求數', value: sum('total').toLocaleString(), icon: 'activity', tone: 'primary' },
  { label: '5xx', value: sum('status5xx').toLocaleString(), icon: 'x-circle', tone: 'danger' },
  { label: '401 / 403', value: (sum('unauthorized') + sum('forbidden')).toLocaleString(), icon: 'lock', tone: 'warning' },
  { label: '429 限流', value: sum('rateLimited').toLocaleString(), icon: 'gauge', tone: 'violet' },
  { label: '傳輸量', value: fmtBytes(sum('bytes')), icon: 'download', tone: 'cyan' },
]);

const security = computed(() => (alerts.data.value?.items ?? []).filter((a) => a.category === 'security'));
const VITAL_LABEL: Record<string, string> = { LCP: '最大內容繪製', INP: '互動延遲', CLS: '版面位移', FCP: '首次內容繪製', TTFB: '首位元組', load: '載入完成' };
const RATING = { good: { label: '良好', tone: 'success' }, 'needs-improvement': { label: '待改善', tone: 'warning' }, poor: { label: '差', tone: 'danger' } } as const;
const vitalRows = computed(() => (vitals.data.value ?? []).map((v) => ({ ...v, key: `${v.serviceId}|${v.name}`, rating: rate(v.name, v.p75) })));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GSegmented
        v-model="range"
        size="sm"
        :options="[
          { label: '近 1 小時', value: '1h' },
          { label: '近 24 小時', value: '24h' },
          { label: '近 7 天', value: '7d' },
        ]"
      />
      <GButton icon="refresh" :loading="traffic.loading.value" @click="reloadAll">重新整理</GButton>
    </Teleport>

    <GCard v-if="traffic.error.value && notConnected(traffic.error.value)">
      <GEmpty icon="globe" title="觀測服務尚未接入" description="Gateway 尚未發佈 /api/observe/* 路由" />
    </GCard>
    <template v-else>
      <div class="grid kpis">
        <GCard v-for="k in kpis" :key="k.label" :tone="k.tone" glow padding="sm">
          <div class="stat">
            <span class="ic"><GIcon :name="k.icon" :size="18" /></span>
            <div>
              <div class="num big">{{ traffic.data.value ? k.value : '—' }}</div>
              <div class="muted small">{{ k.label }}</div>
            </div>
          </div>
        </GCard>
      </div>

      <div class="grid grid-3">
        <GCard class="span-2" title="Nginx 流量" :subtitle="RANGE[range]!.bucket === 'minute' ? '每分鐘請求數與錯誤數' : '每小時請求數與錯誤數'" icon="activity">
          <GEmpty v-if="traffic.error.value" compact tone="danger" title="無法取得流量" :description="describeError(traffic.error.value)" />
          <GAreaChart v-else-if="points.length" :labels="chart.labels" :series="chart.series" :height="260" />
          <GEmpty v-else-if="traffic.data.value" compact icon="activity" title="這段期間沒有流量資料" description="nginx-log-agent 尚未回報,或 MONITOR_URL 未設定" />
          <GSkeleton v-else height="260px" />
        </GCard>
        <GCard title="資安告警" :subtitle="alerts.data.value ? `近 ${alerts.data.value.windowMin} 分鐘` : ''" icon="shield" tone="warning">
          <ul v-if="security.length" class="alerts">
            <li v-for="a in security" :key="a.id" :class="`tone-${a.severity === 'critical' ? 'danger' : 'warning'}`">
              <GIcon name="alert" :size="16" class="al-ic" />
              <div>
                <strong>{{ a.title }}</strong>
                <span class="small muted">{{ a.detail }}</span>
                <span class="faint xs">{{ fromNow(a.since) }}</span>
              </div>
            </li>
          </ul>
          <GEmpty v-else-if="alerts.data.value" compact icon="check-circle" tone="success" title="沒有資安告警" />
          <GSkeleton v-else :lines="4" />
        </GCard>
      </div>

      <div class="grid grid-2">
        <GCard padding="none" title="來源 IP 排行" subtitle="由每分鐘前 20 名合併,為近似值" icon="globe">
          <GTable
            :loading="!ips.data.value && !ips.error.value"
            :rows="ips.data.value ?? []"
            row-key="ip"
            :page-size="10"
            dense
            empty-title="沒有資料"
            :columns="[
              { key: 'ip', label: '來源 IP' },
              { key: 'count', label: '請求', align: 'right' },
              { key: 'errors', label: '5xx', align: 'right' },
              { key: 'denied', label: '被拒', align: 'right' },
              { key: 'lastSeen', label: '最後出現', hideSm: true },
            ]"
          >
            <template #cell-ip="{ row }"
              ><code class="small">{{ row.ip }}</code></template
            >
            <template #cell-count="{ row }"
              ><b class="num">{{ row.count.toLocaleString() }}</b></template
            >
            <template #cell-errors="{ row }"
              ><span :class="{ err: row.errors > 0 }">{{ row.errors }}</span></template
            >
            <template #cell-denied="{ row }"
              ><span :class="{ warn: row.denied > 0 }">{{ row.denied }}</span></template
            >
            <template #cell-lastSeen="{ row }"
              ><span class="small">{{ fromNow(row.lastSeen) }}</span></template
            >
          </GTable>
        </GCard>
        <GCard padding="none" title="前端效能" subtitle="近 24 小時 p75(抽樣 10%)" icon="gauge" tone="cyan">
          <GTable
            :loading="!vitals.data.value && !vitals.error.value"
            :rows="vitalRows"
            row-key="key"
            :page-size="10"
            dense
            empty-title="尚未收到前端效能資料"
            :columns="[
              { key: 'serviceId', label: '前端' },
              { key: 'name', label: '指標' },
              { key: 'p75', label: 'p75', align: 'right' },
              { key: 'rating', label: '評等' },
              { key: 'count', label: '樣本', align: 'right', hideSm: true },
            ]"
          >
            <template #cell-serviceId="{ row }"
              ><code class="small">{{ row.serviceId }}</code></template
            >
            <template #cell-name="{ row }">
              <span class="small"
                >{{ row.name }} <span class="faint">{{ VITAL_LABEL[row.name] ?? '' }}</span></span
              >
            </template>
            <template #cell-p75="{ row }"
              ><b class="num">{{ row.name === 'CLS' ? row.p75 : fmtMs(row.p75) }}</b></template
            >
            <template #cell-rating="{ row }">
              <GBadge v-if="row.rating" :tone="RATING[row.rating].tone" dot>{{ RATING[row.rating].label }}</GBadge>
            </template>
          </GTable>
        </GCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.kpis {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  --gap: 14px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ic {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--radius-sm);
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 12%, transparent);
}
.big {
  font-size: var(--fs-xl);
  font-weight: 750;
}
.alerts {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alerts li {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--tone) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 20%, transparent);
}
.alerts li > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.al-ic {
  color: var(--tone);
  margin-top: 2px;
  flex: none;
}
.err {
  color: var(--c-danger);
  font-weight: 600;
}
.warn {
  color: var(--c-warning);
  font-weight: 600;
}
</style>
