<script setup lang="ts">
/** 稽核紀錄(操作 / 登入):server 端分頁與搜尋 */
import { ref, watch } from 'vue';
import { describeError, http } from '@/api/http';
import { ACTION_LABEL, fmtTime, fromNow } from '@/api/format';
import type { AuditEntry } from '@/api/types';

const props = defineProps<{ type: 'operation' | 'login' }>();
const q = ref('');
const page = ref(1);
const data = ref<{ items: AuditEntry[]; total: number } | null>(null);
const loading = ref(false);
const error = ref<Error | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await http.get('/audit', { query: { type: props.type, q: q.value.trim() || undefined, page: page.value, pageSize: 15 } });
  } catch (e) {
    error.value = e as Error;
  } finally {
    loading.value = false;
  }
}
watch(page, load, { immediate: true });
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(() => (page.value === 1 ? load() : (page.value = 1)), 300);
});
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="load">重新整理</GButton>
    </Teleport>
    <GCard padding="sm">
      <GInput v-model="q" icon="search" :placeholder="type === 'login' ? '搜尋工號' : '搜尋人員、動作、對象、內容'" clearable />
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="audit" title="無法載入稽核紀錄" :description="describeError(error)"
        ><GButton icon="refresh" @click="load">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none">
      <GTable
        v-model:page="page"
        :loading="loading && !data"
        :rows="data?.items ?? []"
        :total="data?.total ?? 0"
        :page-size="15"
        row-key="id"
        dense
        :empty-title="type === 'login' ? '尚無登入紀錄' : '尚無操作紀錄'"
        :columns="[
          { key: 'at', label: '時間', width: '170px' },
          { key: 'actor', label: '人員', mono: true },
          { key: 'action', label: '動作' },
          { key: 'target', label: '對象', mono: true, hideSm: true },
          { key: 'detail', label: '內容', hideSm: true },
          { key: 'result', label: '結果' },
          { key: 'ip', label: '來源 IP', mono: true, hideSm: true },
        ]"
      >
        <template #cell-at="{ row }"
          ><span class="small nowrap" :title="fromNow(row.at)">{{ fmtTime(row.at) }}</span></template
        >
        <template #cell-action="{ row }"
          ><GBadge tone="primary" variant="outline">{{ ACTION_LABEL[row.action] ?? row.action }}</GBadge></template
        >
        <template #cell-detail="{ row }"
          ><span class="muted small">{{ row.detail ?? '—' }}</span></template
        >
        <template #cell-result="{ row }">
          <GBadge :tone="row.result === 'success' ? 'success' : 'danger'" dot>{{ row.result === 'success' ? '成功' : '失敗' }}</GBadge>
        </template>
        <template #cell-ip="{ row }"
          ><span class="faint small">{{ row.ip ?? '—' }}</span></template
        >
      </GTable>
    </GCard>
  </div>
</template>
