<script setup lang="ts">
/**
 * 電腦詳情「事件」Tab(RustIt P3;GET /api/endpoint/devices/{deviceId}/events,新到舊,「載入更多」):
 * 主機稽核(登錄、憑證指紋變更、停用 / 啟用 / 退役、合併、時鐘偏差、疑似同一台)與 Agent 端點事件(USB 插拔、離線期間、Agent 啟動)。
 * RustIt P5:主機比對資產的軟硬體變更、Watchdog / Agent 互相看守的事件(服務被停止、啟動類型被改、程式不見或被換、重新啟動原因)。
 * 端點事件的時間是端點上的發生時間(離線期間的事件連線後才補傳);內容一律以文字顯示。
 */
import { ref, shallowRef } from 'vue';
import { deviceApi, EVENT_LABELS, EVENT_TONES, paramText, startTypeLabel } from '@/api/endpoint';
import { fmtBytes, fmtTime } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointDeviceEvent } from '@/api/types';

const props = defineProps<{ deviceId: string }>();
const items = shallowRef<EndpointDeviceEvent[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const loaded = ref(false);
const error = ref<unknown>(null);

async function load(more = false) {
  loading.value = true;
  error.value = null;
  try {
    const page = await deviceApi.events(props.deviceId, { limit: 50, cursor: more ? (cursor.value ?? undefined) : undefined });
    items.value = more ? [...items.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
    loaded.value = true;
  } catch (e) {
    error.value = e;
  } finally {
    loading.value = false;
  }
}
void load();

const REASONS: Record<string, string> = {
  network: '網路不通',
  dns: 'DNS 解析失敗',
  tls: '憑證 / TLS 失敗',
  rejected: '主機拒絕',
  server_busy: '主機忙碌',
  server_error: '主機錯誤',
  unknown: '未知',
};

const PREVIOUS_EXIT: Record<string, string> = {
  stop: '服務被停止',
  shutdown: 'Windows 關機',
  restart_command: '指令重啟',
  unexpected: '沒有正常結束',
  first_run: '第一次執行',
};
const RESTART_CAUSE: Record<string, string> = { crashed: '當掉後重新啟動', hung: '沒有回應,Watchdog 強制重啟', restart_command: '指令重啟' };
const HW: Record<string, string> = { memory: '記憶體', disk: '磁碟', gpu: '顯示卡', bios: 'BIOS', board: '主機板', cpu: 'CPU' };

type Data = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : paramText(v));

/** 端點事件的 data 摘要成一行文字(event.schema.json:offline_period、usb_*) */
function summary(e: EndpointDeviceEvent): string {
  const d = (e.data && typeof e.data === 'object' ? e.data : {}) as Data;
  if (e.type === 'offline_period') {
    const from = str(d.started_at);
    const to = str(d.ended_at);
    const mins = from && to ? Math.round((Date.parse(to) - Date.parse(from)) / 60_000) : null;
    return [
      `${fmtTime(from)} ~ ${fmtTime(to)}${mins !== null ? `(${mins} 分鐘)` : ''}`,
      `原因:${REASONS[str(d.reason)] ?? str(d.reason)}`,
      d.retries !== undefined ? `重試 ${str(d.retries)} 次` : '',
    ]
      .filter(Boolean)
      .join(',');
  }
  if (e.type === 'usb_inserted' || e.type === 'usb_removed') {
    return [str(d.drive), str(d.label), str(d.file_system), typeof d.total === 'number' ? fmtBytes(d.total) : '', d.serial ? `序號 ${str(d.serial)}` : '']
      .filter(Boolean)
      .join(' · ');
  }
  if (e.type === 'agent_started' && d.agent_version)
    return [`Agent 版本 ${str(d.agent_version)}`, d.previous_exit ? `上次結束:${PREVIOUS_EXIT[str(d.previous_exit)] ?? str(d.previous_exit)}` : '']
      .filter(Boolean)
      .join(',');
  if (e.type === 'software_installed' || e.type === 'software_removed') return [str(d.name), str(d.version), str(d.publisher)].filter(Boolean).join(' · ');
  if (e.type === 'software_updated') return `${str(d.name)}:${str(d.from)} → ${str(d.to)}`;
  if (e.type === 'software_changed_bulk')
    return `安裝 ${str(d.installed)}、移除 ${str(d.removed)}、更新 ${str(d.updated)} 項${Array.isArray(d.names) && d.names.length ? `(${d.names.map(str).join('、')}…)` : ''}`;
  if (e.type === 'hardware_changed')
    return `${HW[str(d.component)] ?? str(d.component)}:${Array.isArray(d.before) ? d.before.map(str).join('、') : ''} → ${Array.isArray(d.after) ? d.after.map(str).join('、') : ''}`;
  if (e.type === 'agent_restarted')
    return `${RESTART_CAUSE[str(d.cause)] ?? str(d.cause)}${d.previous_pid !== undefined ? `(PID ${str(d.previous_pid)} → ${str(d.pid)})` : ''}`;
  if (['agent_service_stopped', 'watchdog_stopped'].includes(e.type))
    return [
      // restarted=false 且 state=running:服務仍在執行(例如只被改了啟動類型),不是重啟失敗
      d.restarted === true ? '已重新啟動' : d.restarted === false && d.state !== 'running' ? '未能重新啟動' : '',
      d.start_type ? `啟動類型 ${startTypeLabel(str(d.start_type))}` : '',
      str(d.error),
    ]
      .filter(Boolean)
      .join(',');
  if (e.type === 'agent_start_type_changed')
    return `${startTypeLabel(str(d.from))} → ${startTypeLabel(str(d.to) || 'auto')}${d.restored === true ? '(已改回自動)' : ''}`;
  if (['agent_binary_changed', 'watchdog_binary_changed'].includes(e.type)) return `${str(d.path)}${d.expected ? `(應為 ${str(d.expected)})` : ''}`;
  if (e.type === 'agent_start_failed') return `${str(d.error)}(第 ${str(d.attempts)} 次)`;
  if (e.detail) return e.detail;
  if (e.data && typeof e.data === 'object' && Object.keys(e.data).length) return JSON.stringify(e.data);
  return '';
}
</script>

<template>
  <GCard padding="none" title="事件" icon="clock" :subtitle="loaded ? `顯示 ${items.length} 筆${cursor ? '(還有更多)' : ''}` : ''">
    <template #actions>
      <GButton size="sm" variant="ghost" icon="refresh" :loading="loading" @click="load()">重新整理</GButton>
    </template>
    <GEmpty v-if="error" tone="danger" icon="clock" title="無法取得事件" :description="describeError(error)"
      ><GButton icon="refresh" @click="load()">重試</GButton></GEmpty
    >
    <template v-else>
      <GTable
        :loading="loading && !loaded"
        :rows="items"
        row-key="id"
        :page-size="0"
        empty-title="沒有事件"
        :columns="[
          { key: 'occurredAt', label: '時間', width: '150px' },
          { key: 'type', label: '事件', width: '120px' },
          { key: 'detail', label: '內容' },
        ]"
      >
        <template #cell-occurredAt="{ row }">
          <span class="nowrap small" :title="row.receivedAt ? `主機收到 ${fmtTime(row.receivedAt)}` : ''">{{ fmtTime(row.occurredAt) }}</span>
        </template>
        <template #cell-type="{ row }">
          <GBadge :tone="EVENT_TONES[row.type] ?? 'neutral'">{{ EVENT_LABELS[row.type] ?? row.type }}</GBadge>
        </template>
        <template #cell-detail="{ row }"
          ><span class="small" style="overflow-wrap: anywhere">{{ summary(row) }}</span></template
        >
      </GTable>
      <div v-if="cursor" class="row" style="justify-content: center; padding: 8px">
        <GButton size="sm" variant="ghost" :loading="loading" @click="load(true)">載入更多</GButton>
      </div>
    </template>
  </GCard>
</template>
