<script setup lang="ts">
import { computed } from 'vue';
import { describeError, http } from '@/api/http';
import { ROUTE_STATUS } from '@/api/format';
import type { BffOverview } from '@/api/types';
import SourceTag from '@/components/SourceTag.vue';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

let refreshing = false;
const { data, loading, error, reload } = useAsync(() => http.get<BffOverview>('/bff/overview', { query: { refresh: refreshing ? 1 : undefined } }));
async function refresh() {
  refreshing = true;
  await reload();
  refreshing = false;
}

const SYSTEM_TONE = ['primary', 'cyan', 'violet', 'success', 'warning', 'info'];
const upstreams = computed(() =>
  (data.value?.upstreams ?? []).map((u, i) => ({
    ...u,
    tone: SYSTEM_TONE[i % SYSTEM_TONE.length]!,
    total: Object.values(u.routes).reduce((s, n) => s + n, 0),
  })),
);

function edit() {
  toast.info('上游編輯尚未開放', 'BFF 管理 API(PRD §8.7 / P2-3)完成後串接;目前請以 Gateway CLI 調整。');
}
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <SourceTag :source="data?.source" :fetched-at="data?.fetchedAt" />
      <GButton icon="refresh" :loading="loading" @click="refresh">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="gateway" title="無法取得 Gateway 資料" :description="describeError(error)"
        ><GButton icon="refresh" @click="refresh">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <div class="grid grid-auto" style="--min: 300px; --gap: 16px">
        <template v-if="data">
          <GCard v-for="u in upstreams" :key="u.code" :tone="u.tone" glow>
            <template #header>
              <span class="ic"><GIcon name="server" :size="18" /></span>
              <div class="titles">
                <h3 class="mono">{{ u.code }}</h3>
                <p class="muted small">{{ u.name }}</p>
              </div>
            </template>
            <template #actions>
              <GBadge tone="neutral" variant="outline">{{ u.systemCode }}</GBadge>
            </template>
            <div class="stack" style="--gap: 12px">
              <div v-for="t in u.targets" :key="t.baseUrl" class="target">
                <GIcon name="globe" :size="14" class="faint" />
                <code class="ellipsis">{{ t.baseUrl }}</code>
                <span class="spacer" />
                <GBadge :tone="t.environment === 'prod' ? 'danger' : 'info'">{{ t.environment }}</GBadge>
              </div>
              <div class="row" style="--gap: 6px">
                <GBadge v-for="(n, s) in u.routes" :key="s" :tone="ROUTE_STATUS[s]?.tone ?? 'neutral'" dot>{{ ROUTE_STATUS[s]?.label ?? s }} {{ n }}</GBadge>
                <span v-if="!u.total" class="faint xs">尚無路由</span>
              </div>
              <div class="foot">
                <span class="faint xs"><GIcon name="clock" :size="12" /> 逾時 {{ (u.timeoutMs / 1000).toFixed(0) }} 秒</span>
                <span class="spacer" />
                <GButton v-can="'bff.upstream.edit'" size="sm" variant="ghost" icon="edit" @click="edit">編輯</GButton>
                <GButton
                  size="sm"
                  variant="ghost"
                  icon-right="chevron-right"
                  @click="$router.push({ path: '/gateway/services/routes', query: { upstream: u.code } })"
                >
                  {{ u.total }} 支路由
                </GButton>
              </div>
            </div>
          </GCard>
        </template>
        <template v-else>
          <GCard v-for="i in 6" :key="i"><GSkeleton :lines="4" /></GCard>
        </template>
      </div>

      <GCard title="限流政策" subtitle="路由可套用的速率限制" icon="gauge" tone="warning" padding="none">
        <GTable
          :loading="!data"
          :rows="data?.policies ?? []"
          row-key="code"
          :page-size="0"
          :columns="[
            { key: 'code', label: '代碼', mono: true },
            { key: 'limitCount', label: '上限', align: 'right' },
            { key: 'windowSec', label: '時間窗', align: 'right' },
            { key: 'keyBy', label: '計數依據' },
          ]"
        >
          <template #cell-limitCount="{ row }"
            ><b class="num">{{ row.limitCount.toLocaleString() }}</b> 次</template
          >
          <template #cell-windowSec="{ row }"
            ><span class="num">{{ row.windowSec }}</span> 秒</template
          >
          <template #cell-keyBy="{ row }"
            ><GBadge tone="info">{{ row.keyBy === 'user' ? '每位使用者' : row.keyBy === 'ip' ? '每個 IP' : row.keyBy }}</GBadge></template
          >
        </GTable>
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.ic {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) calc(var(--tone-bg-alpha) * 100%), transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 25%, transparent);
}
.titles {
  min-width: 0;
}
.titles h3 {
  font-size: var(--fs-lg);
}
.titles p {
  margin: 0;
}
.target {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--glass-soft);
  border: 1px solid var(--line);
  min-width: 0;
}
.target code {
  font-size: var(--fs-sm);
}
.foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
</style>
