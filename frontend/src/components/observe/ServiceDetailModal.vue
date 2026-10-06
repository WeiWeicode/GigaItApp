<script setup lang="ts">
/** 服務詳情:概況 / 紀錄 / 錯誤 / 相依(GET /api/observe/services/:id);點紀錄看明細 */
import { computed, ref, watch } from 'vue';
import { describeError } from '@/api/http';
import { fmtTime, fromNow } from '@/api/format';
import { HEALTH, observe, TYPE_LABEL, type LogSummary, type ServiceDetail } from '@/api/observe';
import { fmtMs, statusTone } from '@/composables/observe';
import LogDetailModal from './LogDetailModal.vue';

const props = defineProps<{ serviceId: string | null }>();
const emit = defineEmits<{ close: []; select: [id: string]; trace: [traceId: string] }>();

const open = computed({ get: () => !!props.serviceId, set: (v) => !v && emit('close') });
const tab = ref('summary');
const detail = ref<ServiceDetail | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
const log = ref<LogSummary | null>(null);

async function load(id: string) {
  loading.value = true;
  error.value = null;
  try {
    detail.value = await observe.service(id);
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}
watch(
  () => props.serviceId,
  (id) => {
    detail.value = null;
    tab.value = 'summary';
    if (id) void load(id);
  },
  { immediate: true },
);

const health = computed(() => detail.value?.health);
const tabs = computed(() => [
  { label: '概況', value: 'summary' },
  { label: '紀錄', value: 'logs', count: detail.value?.recentLogs.length },
  { label: '錯誤', value: 'errors', count: detail.value?.recentErrors.length },
  { label: '相依', value: 'deps' },
]);
function uptime(sec: number | null | undefined): string {
  if (!sec) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return d ? `${d} 天 ${h} 小時` : `${h} 小時 ${Math.floor((sec % 3600) / 60)} 分`;
}
const COLS = [
  { key: 'ts', label: '時間', width: '150px' },
  { key: 'method', label: '方法', width: '76px' },
  { key: 'path', label: '路徑' },
  { key: 'status', label: '狀態', width: '72px' },
  { key: 'durationMs', label: '耗時', width: '80px', align: 'right' as const },
];
</script>

<template>
  <GModal v-model:open="open" :title="detail?.name ?? serviceId ?? ''" :subtitle="serviceId ?? ''" icon="server" width="820px">
    <GSkeleton v-if="loading && !detail" :lines="10" />
    <GEmpty v-else-if="error" tone="danger" icon="alert" title="無法取得服務詳情" :description="describeError(error)"
      ><GButton icon="refresh" @click="serviceId && load(serviceId)">重試</GButton></GEmpty
    >
    <div v-else-if="detail && health" class="stack" style="--gap: 16px">
      <div class="row" style="--gap: 8px">
        <GBadge :tone="HEALTH[health.status].tone" dot>{{ HEALTH[health.status].label }}</GBadge>
        <span v-if="health.since" class="faint small">自 {{ fmtTime(health.since) }} 起</span>
        <span class="spacer" />
        <GButton size="sm" variant="ghost" icon="refresh" :loading="loading" @click="load(detail.id)">重新整理</GButton>
      </div>
      <GTabs v-model="tab" :items="tabs" />

      <dl v-if="tab === 'summary'" class="kv">
        <dt>服務代碼</dt>
        <dd>
          <code>{{ detail.id }}</code>
        </dd>
        <dt>類型</dt>
        <dd>{{ TYPE_LABEL[detail.type] ?? detail.type }} / {{ detail.layer }}</dd>
        <dt>生命週期</dt>
        <dd>
          <GBadge :tone="detail.lifecycle === 'planned' ? 'neutral' : 'success'">{{ detail.lifecycle === 'planned' ? '規劃中' : '運作中' }}</GBadge>
        </dd>
        <dt>說明</dt>
        <dd>{{ detail.description || '—' }}</dd>
        <dt>技術棧</dt>
        <dd class="row" style="--gap: 4px">
          <GBadge v-for="s in detail.stack" :key="s" tone="neutral" variant="outline">{{ s }}</GBadge>
        </dd>
        <dt>負責</dt>
        <dd>{{ detail.team || '—' }} / {{ detail.owner || '—' }}</dd>
        <dt>Repo</dt>
        <dd>
          <code class="small">{{ detail.links.repo ?? '—' }}</code>
        </dd>
        <dt>版本</dt>
        <dd>{{ health.version ?? '—' }}</dd>
        <dt>運作時間</dt>
        <dd>{{ uptime(health.uptimeSec) }}</dd>
        <dt>最後心跳</dt>
        <dd>
          {{ health.lastHeartbeatAt ? fromNow(health.lastHeartbeatAt) : '—' }}
          <span v-if="health.lastHeartbeatAt" class="faint small">({{ fmtTime(health.lastHeartbeatAt) }})</span>
        </dd>
        <dt>最後探測成功</dt>
        <dd>{{ health.lastProbeOkAt ? fromNow(health.lastProbeOkAt) : detail.monitor.enabled ? '—' : '未啟用探測' }}</dd>
        <dt>近 1 小時</dt>
        <dd>{{ health.stats1h.total }} 次請求 / {{ health.stats1h.error }} 錯誤 / 平均 {{ fmtMs(health.stats1h.avgMs) }}</dd>
        <dt>近 5 分鐘錯誤率</dt>
        <dd>{{ (health.stats5m.errorRate * 100).toFixed(1) }}%</dd>
        <template v-if="health.deps.length">
          <dt>相依服務</dt>
          <dd class="row" style="--gap: 4px">
            <GBadge v-for="d in health.deps" :key="d.name" :tone="d.ok ? 'success' : 'danger'" dot
              >{{ d.name }}{{ d.latencyMs !== null ? ` ${d.latencyMs} ms` : '' }}</GBadge
            >
          </dd>
        </template>
      </dl>

      <GTable
        v-else-if="tab === 'logs' || tab === 'errors'"
        :rows="tab === 'logs' ? detail.recentLogs : detail.recentErrors"
        row-key="id"
        :page-size="10"
        dense
        clickable
        :empty-title="tab === 'logs' ? '近 24 小時沒有紀錄' : '近 24 小時沒有錯誤'"
        :columns="COLS"
        @row-click="(r: LogSummary) => (log = r)"
      >
        <template #cell-ts="{ row }"
          ><span class="small nowrap">{{ fmtTime(row.ts) }}</span></template
        >
        <template #cell-method="{ row }"
          ><GBadge tone="neutral" variant="outline" mono>{{ row.method }}</GBadge></template
        >
        <template #cell-path="{ row }">
          <div class="cell-path">
            <code class="small">{{ row.path }}</code>
            <span v-if="row.errorMessage" class="err xs ellipsis">{{ row.errorMessage }}</span>
          </div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="statusTone(row.status)" mono>{{ row.status || '—' }}</GBadge></template
        >
        <template #cell-durationMs="{ row }"
          ><span class="small">{{ fmtMs(row.durationMs) }}</span></template
        >
      </GTable>

      <div v-else class="grid grid-2">
        <GCard title="上游(呼叫本服務)" icon="arrow-right" padding="sm">
          <ul class="deps">
            <li v-for="d in detail.dependencies.upstream" :key="d.id">
              <GBadge :tone="HEALTH[d.status].tone" dot>{{ HEALTH[d.status].label }}</GBadge>
              <button type="button" class="link mono" @click="emit('select', d.id)">{{ d.id }}</button>
              <span class="faint xs">{{ d.label }}</span>
            </li>
            <li v-if="!detail.dependencies.upstream.length" class="faint small">無</li>
          </ul>
        </GCard>
        <GCard title="下游(本服務呼叫)" icon="arrow-right" padding="sm">
          <ul class="deps">
            <li v-for="d in detail.dependencies.downstream" :key="d.id">
              <GBadge :tone="HEALTH[d.status].tone" dot>{{ HEALTH[d.status].label }}</GBadge>
              <button type="button" class="link mono" @click="emit('select', d.id)">{{ d.id }}</button>
              <span class="faint xs">{{ d.label }}</span>
            </li>
            <li v-if="!detail.dependencies.downstream.length" class="faint small">無</li>
          </ul>
        </GCard>
      </div>
    </div>
    <LogDetailModal :log="log" @close="log = null" @trace="(t) => ((log = null), emit('trace', t))" />
  </GModal>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 120px 1fr;
  gap: 10px 12px;
  margin: 0;
}
.kv dt {
  color: var(--text-3);
  font-size: var(--fs-sm);
}
.kv dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}
.cell-path {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.err {
  color: var(--c-danger);
}
.deps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.deps li {
  display: flex;
  align-items: center;
  gap: 8px;
}
.link {
  background: none;
  border: 0;
  padding: 0;
  color: var(--c-primary);
  cursor: pointer;
  font-size: var(--fs-sm);
}
.link:hover {
  text-decoration: underline;
}
</style>
