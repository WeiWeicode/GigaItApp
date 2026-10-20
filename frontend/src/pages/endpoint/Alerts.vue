<script setup lang="ts">
/**
 * 端點管理 › 告警(RustIt P5;P5-MONITOR-DESIGN §4、§7):固定規則的告警,新到舊;依狀態(預設未結束)、規則、嚴重度篩選
 * (後端篩選,nextCursor「載入更多」)。點列開電腦詳情;關閉按鈕 it.endpoint-alert.resolve ∧ endpoint.command.basic。
 * 權限:Tab it.endpoint-alert.list ∧ BFF endpoint.device.read。只列登入者所屬公司的電腦(RustIt E6,由後端過濾)。
 * detail 來自端點回報,一律以文字顯示。
 */
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { ALERT_RULE_LABELS, ALERT_SEVERITY_LABELS, ALERT_SEVERITY_TONES, alertApi, alertDetailHint, alertRuleLabel, alertSummary } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointAlert } from '@/api/types';
import AlertResolve from '@/components/endpoint/AlertResolve.vue';
import { toast } from '@/ui';
import DeviceDetail from './DeviceDetail.vue';

const filters = reactive<{ state: 'open' | 'resolved' | 'all'; rule: string; severity: string }>({ state: 'open', rule: '', severity: '' });
const STATE_OPTIONS = [
  { label: '未結束', value: 'open' },
  { label: '已關閉', value: 'resolved' },
  { label: '全部', value: 'all' },
];
const RULE_OPTIONS = Object.entries(ALERT_RULE_LABELS).map(([value, label]) => ({ label, value }));
const SEVERITY_OPTIONS = Object.entries(ALERT_SEVERITY_LABELS).map(([value, label]) => ({ label, value }));
const canResolve = computed(() => can(UI.alertResolve) && can(EP.commandBasic));

const items = shallowRef<EndpointAlert[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
let seq = 0;
async function load(more = false) {
  const my = ++seq;
  loading.value = true;
  error.value = null;
  try {
    const page = await alertApi.list({
      state: filters.state,
      rule: filters.rule || undefined,
      severity: filters.severity || undefined,
      limit: 50,
      cursor: more ? (cursor.value ?? undefined) : undefined,
    });
    if (my !== seq) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
  } catch (e) {
    if (my !== seq) return;
    // 載入更多失敗:保留已載入的資料,只提示
    if (more) toast.fromError(e, '無法載入更多告警');
    else error.value = e;
  } finally {
    if (my === seq) loading.value = false;
  }
}
watch(filters, () => void load());
void load();

const resolving = ref<EndpointAlert | null>(null);
function onResolved() {
  resolving.value = null;
  void load();
}

const selected = ref<{ deviceId: string; computerName: string } | null>(null);
const detailOpen = ref(false);
function openDevice(row: EndpointAlert) {
  selected.value = { deviceId: row.deviceId, computerName: row.computerName };
  detailOpen.value = true;
}
const resolvedText = (a: EndpointAlert) =>
  a.resolvedBy === 'manual'
    ? `${a.resolvedByName ?? a.resolvedByEmp ?? ''} 確認${a.resolveNote ? `:${a.resolveNote}` : ''}`
    : `自動(${a.resolveNote ?? '條件已恢復'})`;
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="load()">重新整理</GButton>
    </Teleport>

    <GCard padding="none" title="告警" icon="bell" :subtitle="items.length ? `顯示 ${items.length} 筆${cursor ? '(還有更多)' : ''}` : ''">
      <template #actions>
        <div class="row" style="--gap: 8px; flex-wrap: wrap">
          <GSegmented v-model="filters.state" :options="STATE_OPTIONS" />
          <GSelect v-model="filters.rule" :options="RULE_OPTIONS" placeholder="全部規則" />
          <GSelect v-model="filters.severity" :options="SEVERITY_OPTIONS" placeholder="全部嚴重度" />
        </div>
      </template>
      <GEmpty v-if="error" tone="danger" icon="bell" title="無法取得告警" :description="describeError(error)"
        ><GButton icon="refresh" @click="load()">重試</GButton></GEmpty
      >
      <template v-else>
        <GTable
          :loading="loading && !items.length"
          :rows="items"
          row-key="alertId"
          :page-size="0"
          clickable
          :empty-title="filters.state === 'open' ? '沒有未結束的告警' : '沒有符合的告警'"
          empty-description="告警每 5 分鐘依固定規則評估;硬體變更與服務被停止會立即出現"
          :columns="[
            { key: 'severity', label: '嚴重度', width: '84px' },
            { key: 'computerName', label: '電腦' },
            { key: 'rule', label: '規則', width: '150px' },
            { key: 'detail', label: '內容' },
            { key: 'openedAt', label: '開始', width: '110px', hideSm: true },
            { key: 'state', label: '狀態', hideSm: true },
            { key: 'actions', label: '', width: '84px' },
          ]"
          @row-click="openDevice"
        >
          <template #cell-severity="{ row }"
            ><GBadge :tone="ALERT_SEVERITY_TONES[row.severity as EndpointAlert['severity']]" dot>{{
              ALERT_SEVERITY_LABELS[row.severity as EndpointAlert['severity']]
            }}</GBadge></template
          >
          <template #cell-computerName="{ row }"
            ><strong class="nowrap">{{ row.computerName }}</strong></template
          >
          <template #cell-rule="{ row }">{{ alertRuleLabel(row.rule) }}</template>
          <template #cell-detail="{ row }"
            ><span class="small" style="overflow-wrap: anywhere" :title="alertDetailHint(row.rule)">{{ alertSummary(row) }}</span></template
          >
          <template #cell-openedAt="{ row }"
            ><span class="nowrap small" :title="`開始 ${fmtTime(row.openedAt)},最近仍成立 ${fmtTime(row.lastSeenAt)}`">{{
              fromNow(row.openedAt)
            }}</span></template
          >
          <template #cell-state="{ row }">
            <GBadge v-if="row.state === 'open'" tone="danger">未結束</GBadge>
            <span v-else class="small faint" :title="fmtTime(row.resolvedAt)" style="overflow-wrap: anywhere">{{ resolvedText(row) }}</span>
          </template>
          <template #cell-actions="{ row }">
            <GButton v-if="canResolve && row.state === 'open'" size="sm" variant="ghost" @click.stop="resolving = row">關閉</GButton>
          </template>
        </GTable>
        <div v-if="cursor" class="row" style="justify-content: center; padding: 8px">
          <GButton size="sm" variant="ghost" :loading="loading" @click="load(true)">載入更多</GButton>
        </div>
      </template>
    </GCard>

    <AlertResolve :alert="resolving" @resolved="onResolved" @close="resolving = null" />

    <GModal v-model:open="detailOpen" :title="selected?.computerName ?? ''" :subtitle="selected?.deviceId" icon="monitor" width="960px" height="85vh">
      <DeviceDetail v-if="selected" :key="selected.deviceId" :device-id="selected.deviceId" @changed="load()" />
    </GModal>
  </div>
</template>
