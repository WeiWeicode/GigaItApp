<script setup lang="ts">
/**
 * 架構觀測 › 錯誤:GET /api/observe/errors(服務 + 方法 + 路徑樣板 + 狀態碼聚合);點一組看個別事件,再點事件看明細。
 * 5xx 與服務自報錯誤永久保存;4xx 只留 7 天(多為參數或權限問題)。
 */
import { computed, reactive, ref, watch } from 'vue';
import { describeError } from '@/api/http';
import { fmtTime, fromNow } from '@/api/format';
import { notConnected, observe, type ErrorGroup, type LogSummary } from '@/api/observe';
import LogDetailModal from '@/components/observe/LogDetailModal.vue';
import { fmtMs, statusTone } from '@/composables/observe';
import { useAsync } from '@/composables/useAsync';

const RANGES: Record<string, number> = { '24h': 24, '7d': 168, '30d': 720 };
const filters = reactive({ serviceId: '', range: '7d', status: '5xx', sort: 'count' });
const topo = useAsync(() => observe.topology());
const serviceOptions = computed(() => (topo.data.value?.services ?? []).map((s) => ({ label: `${s.name}(${s.id})`, value: s.id })));

const { data, loading, error, reload } = useAsync(() =>
  observe.errors({
    serviceId: filters.serviceId,
    from: new Date(Date.now() - RANGES[filters.range]! * 3600_000).toISOString(),
    status: filters.status,
    sort: filters.sort,
    limit: 100,
  }),
);
watch(() => ({ ...filters }), reload);

const group = ref<ErrorGroup | null>(null);
const events = ref<LogSummary[] | null>(null);
const eventsError = ref<unknown>(null);
const groupOpen = computed({ get: () => !!group.value, set: (v) => !v && (group.value = null) });
async function openGroup(g: ErrorGroup) {
  group.value = g;
  events.value = null;
  eventsError.value = null;
  try {
    events.value = await observe.errorEvents(g);
  } catch (e) {
    eventsError.value = e;
  }
}
const selected = ref<LogSummary | null>(null);
const total = computed(() => (data.value ?? []).reduce((s, g) => s + g.count, 0));
const rows = computed(() => (data.value ?? []).map((g) => ({ ...g, key: [g.serviceId, g.method, g.pathTemplate, g.status].join('|') })));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GSelect v-model="filters.serviceId" :options="serviceOptions" placeholder="全部服務" icon="server" />
        <GSegmented
          v-model="filters.range"
          size="sm"
          :options="[
            { label: '近 24 小時', value: '24h' },
            { label: '近 7 天', value: '7d' },
            { label: '近 30 天', value: '30d' },
          ]"
        />
        <GSegmented
          v-model="filters.status"
          size="sm"
          :options="[
            { label: '5xx 與自報錯誤', value: '5xx' },
            { label: '4xx', value: '4xx' },
            { label: '全部', value: '' },
          ]"
        />
        <span class="spacer" />
        <GSegmented
          v-model="filters.sort"
          size="sm"
          :options="[
            { label: '依次數', value: 'count' },
            { label: '依最近發生', value: 'latest' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="error && !data">
      <GEmpty v-if="notConnected(error)" icon="alert" title="觀測服務尚未接入" description="Gateway 尚未發佈 /api/observe/* 路由" />
      <GEmpty v-else tone="danger" icon="alert" title="無法取得錯誤" :description="describeError(error)"><GButton icon="refresh" @click="reload">重試</GButton></GEmpty>
    </GCard>
    <GCard v-else padding="none" title="錯誤 API" :subtitle="data ? `${data.length} 組 · 共 ${total} 次` : ''" icon="alert" tone="danger">
      <GTable
        :loading="loading && !data"
        :rows="rows"
        row-key="key"
        :page-size="15"
        clickable
        empty-title="這段期間沒有錯誤"
        :columns="[
          { key: 'serviceId', label: '服務', width: '130px' },
          { key: 'pathTemplate', label: 'API' },
          { key: 'status', label: '狀態', width: '76px' },
          { key: 'count', label: '次數', width: '76px', align: 'right' },
          { key: 'lastSeenAt', label: '最後發生', width: '120px' },
        ]"
        @row-click="openGroup"
      >
        <template #cell-serviceId="{ row }"
          ><code class="small">{{ row.serviceId }}</code></template
        >
        <template #cell-pathTemplate="{ row }">
          <div class="api">
            <span class="row" style="--gap: 6px"
              ><GBadge tone="neutral" variant="outline" mono>{{ row.method }}</GBadge><code class="small ellipsis">{{ row.pathTemplate }}</code></span
            >
            <span v-if="row.sampleErrorMessage" class="err xs ellipsis">{{ row.sampleErrorMessage }}</span>
          </div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="statusTone(row.status)" mono>{{ row.status || '—' }}</GBadge></template
        >
        <template #cell-count="{ row }"
          ><b class="num">{{ row.count }}</b></template
        >
        <template #cell-lastSeenAt="{ row }"
          ><span class="small" :title="fmtTime(row.lastSeenAt)">{{ fromNow(row.lastSeenAt) }}</span></template
        >
      </GTable>
    </GCard>

    <GModal v-model:open="groupOpen" :title="group ? `${group.method} ${group.pathTemplate}` : ''" :subtitle="group?.serviceId" icon="alert" tone="danger" width="760px">
      <div v-if="group" class="stack" style="--gap: 12px">
        <div class="row" style="--gap: 8px">
          <GBadge :tone="statusTone(group.status)" mono>{{ group.status || '—' }}</GBadge>
          <span class="small">共 {{ group.count }} 次 · 首次 {{ fmtTime(group.firstSeenAt) }} · 最後 {{ fmtTime(group.lastSeenAt) }}</span>
        </div>
        <GEmpty v-if="eventsError" compact tone="danger" title="無法取得事件" :description="describeError(eventsError)" />
        <GTable
          v-else
          :loading="!events"
          :rows="events ?? []"
          row-key="id"
          :page-size="10"
          dense
          clickable
          :columns="[
            { key: 'ts', label: '時間', width: '160px' },
            { key: 'path', label: '實際路徑' },
            { key: 'userId', label: '使用者', width: '110px' },
            { key: 'durationMs', label: '耗時', width: '80px', align: 'right' },
          ]"
          @row-click="(r: LogSummary) => (selected = r)"
        >
          <template #cell-ts="{ row }"
            ><span class="small nowrap">{{ fmtTime(row.ts) }}</span></template
          >
          <template #cell-path="{ row }"
            ><code class="small">{{ row.path }}</code></template
          >
          <template #cell-userId="{ row }"
            ><span class="small">{{ row.userId ?? '—' }}</span></template
          >
          <template #cell-durationMs="{ row }"
            ><span class="small">{{ fmtMs(row.durationMs) }}</span></template
          >
        </GTable>
      </div>
    </GModal>
    <LogDetailModal :log="selected" @close="selected = null" @trace="(t) => $router.push({ path: '/gateway/observe/logs', query: { traceId: t } })" />
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.api {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.err {
  color: var(--c-danger);
}
</style>
