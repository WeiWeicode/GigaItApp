<script setup lang="ts">
/** API 路由:由後端篩選與分頁(每次只取一頁);篩選選項來自回應的 facets,不必下載全部路由 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { describeError, http } from '@/api/http';
import { AUTH_MODE, METHOD_TONE, ROUTE_STATUS } from '@/api/format';
import type { BffRoute, BffRoutePage } from '@/api/types';
import GherkinView from '@/components/GherkinView.vue';
import SourceTag from '@/components/SourceTag.vue';
import { usePaged } from '@/composables/usePaged';
import { toast } from '@/ui';

const route = useRoute();
const PAGE_SIZE = 12;
const filters = reactive({
  q: '',
  system: '',
  authMode: '',
  upstream: typeof route.query.upstream === 'string' ? route.query.upstream : '',
});
let refreshing = false;
const query = (page: number, pageSize: number) => ({ ...filters, page, pageSize, refresh: refreshing ? 1 : undefined });
const list = usePaged<BffRoute, BffRoutePage>((page, pageSize) => http.get<BffRoutePage>('/bff/routes', { query: query(page, pageSize) }), {
  pageSize: PAGE_SIZE,
  watch: () => ({ ...filters }),
});
const data = list.data;
async function refresh() {
  refreshing = true;
  await list.reload();
  refreshing = false;
}

const systems = computed(() => (data.value?.facets.systems ?? []).map((s) => ({ label: s, value: s })));
const upstreams = computed(() => (data.value?.facets.upstreams ?? []).map((s) => ({ label: s, value: s })));

/** 開發專案欄:proxy 路由看上游登記的 repo(x-gateway.project);聚合 / mock 路由由 Gateway 自己處理 */
const projectOf = (r: BffRoute) => r.project ?? (r.routeType === 'proxy' ? null : 'Gateway');

const selected = ref<BffRoute | null>(null);
const detailOpen = computed({ get: () => !!selected.value, set: (v) => !v && (selected.value = null) });

/** 匯出目前篩選結果為 CSV(bff.route.export):按下時才逐頁取回全部符合的資料 */
const exporting = ref(false);
async function exportCsv() {
  exporting.value = true;
  try {
    const rows: BffRoute[] = [];
    for (let page = 1; ; page++) {
      const r = await http.get<BffRoutePage>('/bff/routes', { query: { ...filters, page, pageSize: 500 } });
      rows.push(...r.items);
      if (rows.length >= r.total || !r.items.length) break;
    }
    const cols: (keyof BffRoute)[] = [
      'routeCode',
      'name',
      'systemCode',
      'method',
      'publicPath',
      'upstream',
      'project',
      'upstreamPath',
      'authMode',
      'permissionCode',
      'status',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `gateway-routes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('已匯出', `${rows.length} 筆路由`);
  } catch (e) {
    toast.fromError(e, '匯出失敗');
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <SourceTag :source="data?.source" :fetched-at="data?.fetchedAt" />
      <GButton v-can="'bff.route.export'" icon="download" :loading="exporting" :disabled="!list.total.value" @click="exportCsv">匯出 CSV</GButton>
      <GButton icon="refresh" :loading="list.loading.value" @click="refresh">重新整理</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="搜尋路由代碼、名稱、路徑、權限、開發專案…" clearable class="grow" />
        <GSelect v-model="filters.system" :options="systems" placeholder="全部系統" icon="layers" />
        <GSelect v-model="filters.upstream" :options="upstreams" placeholder="全部上游" icon="server" />
        <GSegmented
          v-model="filters.authMode"
          size="sm"
          :options="[
            { label: '全部', value: '' },
            { label: '公開', value: 'public' },
            { label: '登入', value: 'authenticated' },
            { label: '需權限', value: 'permission' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="gateway" title="無法取得路由" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="refresh">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" :title="`API 路由`" :subtitle="`${list.total.value} / ${data?.facets.totalAll ?? 0} 支`" icon="route">
      <GTable
        v-model:page="list.page.value"
        :loading="list.loading.value && !data"
        :rows="list.items.value"
        :total="list.total.value"
        row-key="routeCode"
        :page-size="PAGE_SIZE"
        clickable
        empty-title="沒有符合條件的路由"
        :columns="[
          { key: 'method', label: '方法', width: '84px' },
          { key: 'publicPath', label: '對外路徑' },
          { key: 'name', label: '名稱', hideSm: true },
          { key: 'systemCode', label: '系統', hideSm: true },
          { key: 'project', label: '開發專案', hideSm: true },
          { key: 'authMode', label: '驗證' },
          { key: 'permissionCode', label: '權限', hideSm: true },
          { key: 'status', label: '狀態' },
        ]"
        @row-click="selected = $event"
      >
        <template #cell-method="{ row }"
          ><GBadge :tone="METHOD_TONE[row.method] ?? 'neutral'" variant="outline" mono>{{ row.method }}</GBadge></template
        >
        <template #cell-publicPath="{ row }">
          <div class="path">
            <code>{{ row.publicPath }}</code>
            <span class="faint xs mono">{{ row.routeCode }}</span>
          </div>
        </template>
        <template #cell-name="{ row }"
          ><span class="nowrap">{{ row.name }}</span></template
        >
        <template #cell-systemCode="{ row }"
          ><GBadge tone="neutral">{{ row.systemCode }}</GBadge></template
        >
        <template #cell-project="{ row }">
          <span v-if="row.project" class="project nowrap"><GIcon name="repo" :size="14" />{{ row.project }}</span>
          <span v-else-if="projectOf(row)" class="faint small">Gateway</span>
          <span v-else class="faint small" title="上游服務未在 OpenAPI 登記 x-gateway.project">未登記</span>
        </template>
        <template #cell-authMode="{ row }">
          <GBadge :tone="AUTH_MODE[row.authMode]?.tone ?? 'neutral'" :icon="AUTH_MODE[row.authMode]?.icon">{{
            AUTH_MODE[row.authMode]?.label ?? row.authMode
          }}</GBadge>
        </template>
        <template #cell-permissionCode="{ row }">
          <code v-if="row.permissionCode" class="perm">{{ row.permissionCode }}</code
          ><span v-else class="faint">—</span>
        </template>
        <template #cell-status="{ row }">
          <GBadge :tone="ROUTE_STATUS[row.status]?.tone ?? 'neutral'" dot>{{ ROUTE_STATUS[row.status]?.label ?? row.status }}</GBadge>
        </template>
      </GTable>
    </GCard>

    <GModal v-model:open="detailOpen" :title="selected?.name" :subtitle="selected?.routeCode" icon="route" width="640px">
      <div v-if="selected" class="stack" style="--gap: 16px">
        <div class="flow">
          <div class="node glass">
            <span class="faint xs">瀏覽器</span>
            <code
              ><b>{{ selected.method }}</b> {{ selected.publicPath }}</code
            >
          </div>
          <GIcon name="chevron-right" class="faint" />
          <div class="node glass hl">
            <span class="faint xs">Gateway BFF</span>
            <span class="small"
              >{{ AUTH_MODE[selected.authMode]?.label
              }}<template v-if="selected.permissionCode">
                · <code>{{ selected.permissionCode }}</code></template
              ></span
            >
          </div>
          <GIcon name="chevron-right" class="faint" />
          <div class="node glass">
            <span class="faint xs">{{ selected.routeType === 'proxy' ? `上游 ${selected.upstream}` : selected.routeType }}</span>
            <code>{{ selected.upstreamPath ?? (selected.routeType === 'mock' ? '(mock 回應)' : '(聚合多個上游)') }}</code>
          </div>
        </div>
        <dl class="kv">
          <dt>系統</dt>
          <dd>{{ selected.systemCode }}</dd>
          <dt>開發專案</dt>
          <dd>
            <span v-if="selected.project" class="project"><GIcon name="repo" :size="14" />{{ selected.project }}</span>
            <span v-else-if="projectOf(selected)" class="faint">Gateway({{ selected.routeType }} 路由由 Gateway 處理)</span>
            <span v-else class="faint">未登記(上游 {{ selected.upstream }} 的 OpenAPI 未提供 x-gateway.project)</span>
          </dd>
          <dt>類型</dt>
          <dd>{{ selected.routeType }}</dd>
          <dt>狀態</dt>
          <dd>
            <GBadge :tone="ROUTE_STATUS[selected.status]?.tone ?? 'neutral'" dot>{{ ROUTE_STATUS[selected.status]?.label ?? selected.status }}</GBadge>
          </dd>
          <dt>標籤</dt>
          <dd>{{ selected.tags ?? '—' }}</dd>
        </dl>
        <div v-if="selected.description" class="desc">
          <p class="faint xs strong">API 用途說明</p>
          <p>{{ selected.description }}</p>
        </div>
        <div class="stack" style="--gap: 6px">
          <p class="faint xs strong spec-title"><GIcon name="spec" :size="14" />Gherkin 行為規格</p>
          <GherkinView v-if="selected.gherkin" :text="selected.gherkin" />
          <p v-else class="faint small">下游尚未提供行為規格(OpenAPI x-gherkin)</p>
        </div>
        <GButton
          v-if="selected.permissionCode && $can('bff.rbac.read')"
          icon="search"
          @click="$router.push({ path: '/gateway/rbac/who-can-access', query: { permission: selected.permissionCode } })"
        >
          誰可以呼叫這支 API?
        </GButton>
      </div>
    </GModal>
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
.path {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.path code {
  font-weight: 600;
}
.perm {
  font-size: var(--fs-sm);
  color: var(--c-violet);
}
.project {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
}
.spec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.node {
  flex: 1 1 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-md);
  box-shadow: none;
  min-width: 0;
  word-break: break-all;
}
.node.hl {
  border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
  box-shadow: 0 0 24px rgb(99 102 241 / 0.2);
}
.kv {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 8px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
.kv dt {
  color: var(--text-3);
}
.kv dd {
  margin: 0;
}
.desc {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.desc p {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--fs-sm);
}
.desc p + p {
  margin-top: 6px;
}
</style>
