<script setup lang="ts">
/**
 * 架構觀測 › 紀錄:GET /api/observe/logs(後端篩選,cursor 分頁「載入更多」)。
 * 以 Request ID(X-Request-Id)查詢可串起同一請求在 Nginx → BFF → 後端 → 前端的所有紀錄。點一列看明細。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { describeError } from '@/api/http';
import { fmtTime } from '@/api/format';
import { notConnected, observe, type LogSummary } from '@/api/observe';
import LogDetailModal from '@/components/observe/LogDetailModal.vue';
import { fmtMs, statusTone } from '@/composables/observe';
import { useAsync } from '@/composables/useAsync';

const route = useRoute();
const RANGES: Record<string, number> = { '1h': 1, '24h': 24, '7d': 168 };
const filters = reactive({
  serviceId: typeof route.query.serviceId === 'string' ? route.query.serviceId : '',
  range: '1h',
  level: '',
  status: '',
  path: '',
  traceId: typeof route.query.traceId === 'string' ? route.query.traceId : '',
});
watch(
  () => route.query.traceId,
  (t) => typeof t === 'string' && (filters.traceId = t),
);

const topo = useAsync(() => observe.topology());
const serviceOptions = computed(() => (topo.data.value?.services ?? []).map((s) => ({ label: `${s.name}(${s.id})`, value: s.id })));

const items = ref<LogSummary[]>([]);
const cursor = ref<string | null>(null);
const hasMore = ref(false);
const loading = ref(false);
const error = ref<unknown>(null);

function query(more: boolean) {
  // 以 Request ID 查詢時放寬到 7 天
  const hours = filters.traceId ? 168 : RANGES[filters.range]!;
  return {
    serviceId: filters.serviceId,
    from: new Date(Date.now() - hours * 3600_000).toISOString(),
    level: filters.level,
    status: filters.status.trim(),
    path: filters.path.trim(),
    traceId: filters.traceId.trim(),
    limit: 50,
    cursor: more ? cursor.value : undefined,
  };
}

let seq = 0;
async function load(more = false) {
  const my = ++seq;
  loading.value = true;
  error.value = null;
  try {
    const r = await observe.logs(query(more));
    if (my !== seq) return;
    items.value = more ? [...items.value, ...r.items] : r.items;
    cursor.value = r.nextCursor;
    hasMore.value = r.hasMore;
  } catch (e) {
    if (my === seq) error.value = e;
  } finally {
    if (my === seq) loading.value = false;
  }
}
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => ({ ...filters }),
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => load(false), 300);
  },
  { immediate: true },
);

const selected = ref<LogSummary | null>(null);
const KIND: Record<string, string> = { http: 'API', job: '排程', web: '前端' };
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="load(false)">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GSelect v-model="filters.serviceId" :options="serviceOptions" placeholder="全部服務" icon="server" />
        <GSegmented
          v-model="filters.range"
          size="sm"
          :options="[
            { label: '近 1 小時', value: '1h' },
            { label: '近 24 小時', value: '24h' },
            { label: '近 7 天', value: '7d' },
          ]"
        />
        <GSegmented
          v-model="filters.level"
          size="sm"
          :options="[
            { label: '全部', value: '' },
            { label: '錯誤', value: 'error' },
            { label: '警告', value: 'warn' },
          ]"
        />
        <GInput v-model="filters.status" placeholder="狀態碼 500 或 5xx" clearable class="w-status" />
        <GInput v-model="filters.path" icon="route" placeholder="路徑關鍵字" clearable class="grow" />
        <GInput v-model="filters.traceId" icon="hash" placeholder="Request ID" clearable class="grow" />
      </div>
    </GCard>

    <GCard v-if="error && !items.length">
      <GEmpty v-if="notConnected(error)" icon="list" title="觀測服務尚未接入" description="Gateway 尚未發佈 /api/observe/* 路由" />
      <GEmpty v-else tone="danger" icon="list" title="無法取得紀錄" :description="describeError(error)"
        ><GButton icon="refresh" @click="load(false)">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="請求紀錄" :subtitle="`${items.length} 筆${hasMore ? '(還有更多)' : ''}`" icon="list">
      <GTable
        :loading="loading && !items.length"
        :rows="items"
        row-key="id"
        :page-size="0"
        clickable
        :empty-title="filters.traceId ? '找不到這個 Request ID 的紀錄' : '沒有符合條件的紀錄'"
        :columns="[
          { key: 'ts', label: '時間', width: '160px' },
          { key: 'serviceId', label: '服務', width: '130px' },
          { key: 'method', label: '方法', width: '80px' },
          { key: 'path', label: '路徑' },
          { key: 'status', label: '狀態', width: '80px' },
          { key: 'durationMs', label: '耗時', width: '84px', align: 'right' },
          { key: 'userId', label: '使用者', width: '110px', hideSm: true },
        ]"
        @row-click="(r: LogSummary) => (selected = r)"
      >
        <template #cell-ts="{ row }"
          ><span class="small nowrap">{{ fmtTime(row.ts) }}</span></template
        >
        <template #cell-serviceId="{ row }">
          <div class="svc">
            <code class="small">{{ row.serviceId }}</code>
            <span v-if="row.kind !== 'http'" class="faint xs">{{ KIND[row.kind] }}</span>
          </div>
        </template>
        <template #cell-method="{ row }"
          ><GBadge tone="neutral" variant="outline" mono>{{ row.method }}</GBadge></template
        >
        <template #cell-path="{ row }">
          <div class="svc">
            <code class="small ellipsis">{{ row.path }}</code>
            <span v-if="row.errorMessage" class="err xs ellipsis">{{ row.errorMessage }}</span>
            <span v-else-if="row.meta?.upstream" class="faint xs">→ {{ row.meta.upstream }}</span>
          </div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="statusTone(row.status)" mono>{{ row.status || '—' }}</GBadge></template
        >
        <template #cell-durationMs="{ row }"
          ><span class="small">{{ fmtMs(row.durationMs) }}</span></template
        >
        <template #cell-userId="{ row }"
          ><span class="small">{{ row.userId ?? '—' }}</span></template
        >
      </GTable>
      <template v-if="hasMore" #footer>
        <div class="more"><GButton :loading="loading" icon="chevron-down" @click="load(true)">載入更多</GButton></div>
      </template>
    </GCard>

    <LogDetailModal :log="selected" @close="selected = null" @trace="(t) => ((selected = null), (filters.traceId = t))" />
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
  flex: 1 1 200px;
}
.w-status {
  width: 170px;
}
.svc {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.err {
  color: var(--c-danger);
}
.more {
  display: flex;
  justify-content: center;
}
</style>
