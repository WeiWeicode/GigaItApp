<script setup lang="ts">
/**
 * 端點管理 › 指令紀錄(RustIt P4-3):所有電腦的指令,新到舊;依狀態、類型篩選(後端篩選,nextCursor「載入更多」)。
 * 點列開結果(單筆查詢含日誌附檔,可下載)。權限:Tab it.endpoint-command.list ∧ BFF endpoint.device.read。
 */
import { reactive, ref, shallowRef, watch } from 'vue';
import { endpointApi, KIND_LABELS, STATE_LABELS, STATE_TONES } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointCommand, EndpointCommandKind } from '@/api/types';
import CommandResult from '@/components/endpoint/CommandResult.vue';
import { toast } from '@/ui';

const filters = reactive({ state: '', kind: '' });
const STATE_OPTIONS = Object.entries(STATE_LABELS).map(([value, label]) => ({ label, value }));
const KIND_OPTIONS = Object.entries(KIND_LABELS).map(([value, label]) => ({ label, value }));

const items = shallowRef<EndpointCommand[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
let seq = 0;
async function load(more = false) {
  const my = ++seq;
  loading.value = true;
  error.value = null;
  try {
    const page = await endpointApi.list({ state: filters.state, kind: filters.kind, limit: 50, cursor: more ? (cursor.value ?? undefined) : undefined });
    if (my !== seq) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
  } catch (e) {
    if (my === seq) error.value = e;
  } finally {
    if (my === seq) loading.value = false;
  }
}
watch(filters, () => void load());
void load();

const detail = shallowRef<EndpointCommand | null>(null);
const detailOpen = ref(false);
async function openDetail(row: EndpointCommand) {
  detail.value = row;
  detailOpen.value = true;
  try {
    detail.value = await endpointApi.get(row.commandId);
  } catch (e) {
    toast.fromError(e, '無法取得指令內容');
  }
}
const kindLabel = (k: string) => KIND_LABELS[k as EndpointCommandKind] ?? k;
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="load()">重新整理</GButton>
    </Teleport>

    <GCard padding="none" title="指令紀錄" icon="list" :subtitle="items.length ? `顯示 ${items.length} 筆${cursor ? '(還有更多)' : ''}` : ''">
      <template #actions>
        <div class="row" style="--gap: 8px">
          <GSelect v-model="filters.state" :options="STATE_OPTIONS" placeholder="全部狀態" />
          <GSelect v-model="filters.kind" :options="KIND_OPTIONS" placeholder="全部指令" />
        </div>
      </template>
      <GEmpty v-if="error" tone="danger" icon="list" title="無法取得指令紀錄" :description="describeError(error)"
        ><GButton icon="refresh" @click="load()">重試</GButton></GEmpty
      >
      <template v-else>
        <GTable
          :loading="loading && !items.length"
          :rows="items"
          row-key="commandId"
          :page-size="0"
          clickable
          empty-title="沒有符合的指令"
          empty-description="從「電腦清單」開啟電腦詳情的「指令」Tab 下達指令"
          :columns="[
            { key: 'createdAt', label: '時間', width: '130px' },
            { key: 'computerName', label: '電腦' },
            { key: 'kind', label: '指令' },
            { key: 'state', label: '狀態', width: '100px' },
            { key: 'createdBy', label: '操作人', hideSm: true },
            { key: 'errorCode', label: '錯誤', hideSm: true },
          ]"
          @row-click="openDetail"
        >
          <template #cell-createdAt="{ row }"
            ><span class="nowrap small" :title="fmtTime(row.createdAt)">{{ fromNow(row.createdAt) }}</span></template
          >
          <template #cell-computerName="{ row }"
            ><strong class="nowrap">{{ row.computerName }}</strong></template
          >
          <template #cell-kind="{ row }">{{ kindLabel(row.kind) }}</template>
          <template #cell-state="{ row }"
            ><GBadge :tone="STATE_TONES[row.state as keyof typeof STATE_TONES]" dot>{{ STATE_LABELS[row.state as keyof typeof STATE_LABELS] }}</GBadge>
            <GBadge v-if="row.batchState === 'pending_approval'" tone="warning">待核可</GBadge></template
          >
          <template #cell-createdBy="{ row }"
            ><span class="small">{{ row.createdBy.name ?? row.createdBy.emp }}</span></template
          >
          <template #cell-errorCode="{ row }"
            ><span class="mono small">{{ row.errorCode ?? '' }}</span></template
          >
        </GTable>
        <div v-if="cursor" class="row" style="justify-content: center; padding: 8px">
          <GButton size="sm" variant="ghost" :loading="loading" @click="load(true)">載入更多</GButton>
        </div>
      </template>
    </GCard>

    <GModal
      v-model:open="detailOpen"
      :title="detail ? `${detail.computerName} · ${kindLabel(detail.kind)}` : ''"
      :subtitle="detail?.commandId"
      icon="list"
      width="760px"
    >
      <CommandResult v-if="detail" :command="detail" />
    </GModal>
  </div>
</template>
