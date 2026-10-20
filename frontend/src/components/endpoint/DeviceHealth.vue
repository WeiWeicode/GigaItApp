<script setup lang="ts">
/**
 * 電腦詳情「健康與 Agent」Tab(RustIt P5;PLATFORM-PLAN §7、P5-MONITOR-DESIGN §7):切到這個 Tab 才掛載並查走勢。
 *   - 目前健康:CPU、記憶體、最滿的固定磁碟(在線取最近一則心跳,離線取最後落盤,附取樣時間)
 *   - 24 小時走勢:GET /api/endpoint/devices/{id}/health(5 分鐘分桶;Agent 0.5.0 以前沒有健康資料)
 *   - Agent:版本、上次啟動原因不在詳情 API(看事件 Tab)、憑證到期日、時鐘偏差
 *   - Watchdog(P5-2):最近回報、Agent 服務狀態 / 啟動類型、24 小時非正常重啟
 *   - 此台未結束的告警,可關閉(按鈕 it.endpoint-alert.resolve ∧ endpoint.command.basic)
 * 端點回報的字串一律以文字顯示。
 */
import { computed, ref } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { ALERT_SEVERITY_LABELS, ALERT_SEVERITY_TONES, alertDetailHint, alertRuleLabel, alertSummary, deviceApi, startTypeLabel } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointAlert, EndpointDeviceDetail } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import AlertResolve from './AlertResolve.vue';

const props = defineProps<{ device: EndpointDeviceDetail }>();
const emit = defineEmits<{ changed: [] }>();

const h = computed(() => props.device.health ?? null);
const wd = computed(() => props.device.watchdog ?? null);
const alerts = computed(() => props.device.alerts ?? []);
const canResolve = computed(() => can(UI.alertResolve) && can(EP.commandBasic));

const trend = useAsync(() => deviceApi.health(props.device.deviceId, 24));
// GAreaChart 不支援缺值:三項都有值的時段才畫(null 補 0 會把磁碟剩餘畫成 0%,看起來像空間用完)
const points = computed(() => (trend.data.value?.points ?? []).filter((p) => p.cpuPct != null && p.memUsedPct != null && p.diskMinFreePct != null));
const labels = computed(() => points.value.map((p) => new Date(p.at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })));
const series = computed(() => [
  { name: 'CPU %', values: points.value.map((p) => p.cpuPct!), area: true },
  { name: '記憶體 %', values: points.value.map((p) => p.memUsedPct!) },
  { name: '磁碟剩餘 %', values: points.value.map((p) => p.diskMinFreePct!) },
]);

const usageTone = (v: number | undefined) => (v === undefined ? 'primary' : v >= 90 ? 'danger' : v >= 75 ? 'warning' : 'primary');
const freeTone = (v: number | undefined) => (v === undefined ? 'primary' : v < 5 ? 'danger' : v < 10 ? 'warning' : 'primary');

const uptime = computed(() => {
  const s = h.value?.uptimeS;
  if (s === undefined) return '—';
  const d = Math.floor(s / 86400);
  const hr = Math.floor((s % 86400) / 3600);
  return d ? `${d} 天 ${hr} 小時` : `${hr} 小時 ${Math.floor((s % 3600) / 60)} 分`;
});

const certDays = computed(() => {
  const t = props.device.certNotAfter;
  return t ? Math.floor((Date.parse(t) - Date.now()) / 86_400_000) : null;
});

const SERVICE_STATE: Record<string, string> = {
  running: '執行中',
  stopped: '已停止',
  start_pending: '啟動中',
  stop_pending: '停止中',
  paused: '暫停',
  missing: '不存在',
  unknown: '未知',
};

const resolving = ref<EndpointAlert | null>(null);
function onResolved() {
  resolving.value = null;
  emit('changed');
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <div class="grid grid-2" style="--gap: 16px">
      <GCard title="目前健康" icon="activity" padding="sm" :subtitle="h ? `取樣 ${fromNow(h.at)}` : ''">
        <p v-if="!h" class="faint small" style="margin: 0">尚無健康資料(Agent 0.5.0 起心跳才附健康摘要)</p>
        <div v-else class="stack" style="--gap: 10px">
          <div class="stack" style="--gap: 4px">
            <div class="row small">
              <span>CPU</span><span class="spacer" /><span>{{ h.cpuPct ?? '—' }}{{ h.cpuPct !== undefined ? '%' : '' }}</span>
            </div>
            <GProgress :value="h.cpuPct ?? 0" :max="100" :tone="usageTone(h.cpuPct)" />
          </div>
          <div class="stack" style="--gap: 4px">
            <div class="row small">
              <span>記憶體</span><span class="spacer" /><span>{{ h.memUsedPct ?? '—' }}{{ h.memUsedPct !== undefined ? '%' : '' }}</span>
            </div>
            <GProgress :value="h.memUsedPct ?? 0" :max="100" :tone="usageTone(h.memUsedPct)" />
          </div>
          <div class="stack" style="--gap: 4px">
            <div class="row small">
              <span
                >磁碟剩餘 <span class="faint mono">{{ h.diskMinFreeDrive ?? '' }}</span></span
              ><span class="spacer" /><span>{{ h.diskMinFreePct ?? '—' }}{{ h.diskMinFreePct !== undefined ? '%' : '' }}</span>
            </div>
            <GProgress :value="h.diskMinFreePct ?? 0" :max="100" :tone="freeTone(h.diskMinFreePct)" />
          </div>
          <dl class="kv">
            <dt>開機時間</dt>
            <dd>{{ uptime }}</dd>
            <dt>Agent 記憶體</dt>
            <dd>{{ h.agentRssMb !== undefined ? `${h.agentRssMb} MB` : '—' }}</dd>
          </dl>
        </div>
      </GCard>

      <GCard title="Agent 與 Watchdog" icon="shield" padding="sm">
        <dl class="kv">
          <dt>Agent 版本</dt>
          <dd>{{ device.agentVersion ?? '—' }}</dd>
          <dt>裝置憑證</dt>
          <dd>
            <template v-if="device.certNotAfter">
              {{ fmtTime(device.certNotAfter) }}
              <GBadge v-if="certDays !== null && certDays < 30" :tone="certDays < 0 ? 'danger' : 'warning'">{{
                certDays < 0 ? '已過期' : `剩 ${certDays} 天`
              }}</GBadge>
            </template>
            <span v-else class="faint">—</span>
          </dd>
          <dt>Watchdog</dt>
          <dd>
            <template v-if="wd">
              {{ wd.version ?? '—' }} <span class="faint small">回報 {{ fromNow(wd.reportAt) }}</span>
            </template>
            <span v-else class="faint">尚未回報(Agent 0.6.0 監控 MSI 起才有 Watchdog)</span>
          </dd>
          <template v-if="wd">
            <dt>Agent 服務</dt>
            <dd class="row" style="--gap: 6px">
              <GBadge :tone="wd.agentServiceState === 'running' ? 'success' : 'danger'">{{
                SERVICE_STATE[wd.agentServiceState ?? 'unknown'] ?? wd.agentServiceState
              }}</GBadge>
              <span class="faint small">啟動類型 {{ startTypeLabel(wd.agentStartType ?? 'unknown') }}</span>
            </dd>
            <dt>本機狀態</dt>
            <dd>
              <GBadge v-if="wd.agentStatusOk !== null" :tone="wd.agentStatusOk ? 'success' : 'warning'">{{
                wd.agentStatusOk ? '正常回應' : '沒有回應'
              }}</GBadge>
              <span v-else class="faint">—</span>
              <span v-if="wd.agentLastError" class="faint small" style="display: block; overflow-wrap: anywhere">{{ wd.agentLastError }}</span>
            </dd>
            <dt>24 小時重啟</dt>
            <dd>
              <span :class="{ 'tone-warning': (wd.agentRestarts24h ?? 0) >= 3 }">{{ wd.agentRestarts24h ?? '—' }} 次</span>
              <span class="faint small">(非正常:當掉、卡住)</span>
            </dd>
          </template>
        </dl>
      </GCard>
    </div>

    <GCard title="24 小時走勢" icon="activity" padding="sm" :subtitle="points.length ? '5 分鐘平均(磁碟取最低)' : ''">
      <GSkeleton v-if="trend.loading.value && !trend.data.value" :lines="4" />
      <GEmpty v-else-if="trend.error.value" tone="danger" icon="activity" title="無法取得健康走勢" :description="describeError(trend.error.value)"
        ><GButton icon="refresh" @click="trend.reload">重試</GButton></GEmpty
      >
      <p v-else-if="!points.length" class="faint small" style="margin: 0">最近 24 小時沒有健康資料(離線或 Agent 0.5.0 以前的版本)</p>
      <GAreaChart v-else :labels="labels" :series="series" :height="200" unit="%" />
    </GCard>

    <GCard title="未結束的告警" icon="bell" padding="none" :subtitle="alerts.length ? `${alerts.length} 筆` : ''">
      <GTable
        :rows="alerts"
        row-key="alertId"
        :page-size="0"
        empty-title="沒有未結束的告警"
        :columns="[
          { key: 'severity', label: '嚴重度', width: '84px' },
          { key: 'rule', label: '規則', width: '150px' },
          { key: 'detail', label: '內容' },
          { key: 'openedAt', label: '開始', width: '110px', hideSm: true },
          { key: 'actions', label: '', width: '84px' },
        ]"
      >
        <template #cell-severity="{ row }"
          ><GBadge :tone="ALERT_SEVERITY_TONES[row.severity as EndpointAlert['severity']]">{{
            ALERT_SEVERITY_LABELS[row.severity as EndpointAlert['severity']]
          }}</GBadge></template
        >
        <template #cell-rule="{ row }">{{ alertRuleLabel(row.rule) }}</template>
        <template #cell-detail="{ row }"
          ><span class="small" style="overflow-wrap: anywhere" :title="alertDetailHint(row.rule)">{{ alertSummary(row) }}</span></template
        >
        <template #cell-openedAt="{ row }"
          ><span class="nowrap small" :title="fmtTime(row.openedAt)">{{ fromNow(row.openedAt) }}</span></template
        >
        <template #cell-actions="{ row }">
          <GButton v-if="canResolve" size="sm" variant="ghost" @click="resolving = row">關閉</GButton>
        </template>
      </GTable>
    </GCard>

    <AlertResolve :alert="resolving" @resolved="onResolved" @close="resolving = null" />
  </div>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
.kv dt {
  color: var(--text-3);
}
.kv dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
