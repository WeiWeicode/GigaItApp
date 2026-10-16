<script setup lang="ts">
/**
 * 指令結果(電腦詳情「指令」Tab、指令紀錄頁共用):狀態、錯誤、依類型顯示結果、日誌下載、各階段時間與稽核欄位。
 * result 由 Agent 回報,一律以文字顯示(不用 v-html,RustIt P4-COMMAND-DESIGN §6.1)。
 */
import { computed } from 'vue';
import { commandFileUrl, ERROR_LABELS, KIND_LABELS, STATE_LABELS, STATE_TONES } from '@/api/endpoint';
import { fmtSize, fmtTime } from '@/api/format';
import type { EndpointCommand, EndpointCommandKind } from '@/api/types';

const props = defineProps<{ command: EndpointCommand; compact?: boolean }>();
const c = computed(() => props.command);
const r = computed(() => (c.value.result ?? {}) as Record<string, unknown>);

interface Check {
  name: string;
  status: string;
  ms?: number;
  detail?: string;
}
const CHECK_LABELS: Record<string, string> = {
  gateway: 'Gateway 連線',
  dns: 'DNS(網域)',
  clock: '時鐘',
  cert: '裝置憑證',
  disk: '系統磁碟',
  wmi: 'WMI',
  store: '本機暫存',
};
const CHECK_TONES: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = { ok: 'success', warn: 'warning', fail: 'danger', skipped: 'neutral' };
const checks = computed(() => (Array.isArray(r.value.checks) ? (r.value.checks as Check[]) : []));
const text = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const kindLabel = (k: string) => KIND_LABELS[k as EndpointCommandKind] ?? k;
const paramText = computed(() => {
  const p = c.value.params ?? {};
  const keys = Object.keys(p);
  return keys.length ? keys.map((k) => `${k} = ${String(p[k])}`).join(',') : '';
});
const timeline = computed(() =>
  [
    ['建立', c.value.createdAt],
    ['送出', c.value.sentAt],
    ['收到', c.value.ackedAt],
    ['開始', c.value.startedAt],
    ['結束', c.value.finishedAt],
  ].filter(([, t]) => t) as [string, string][],
);
</script>

<template>
  <div class="stack" style="--gap: 12px">
    <div class="row" style="--gap: 8px">
      <GBadge :tone="STATE_TONES[c.state]" dot>{{ STATE_LABELS[c.state] }}</GBadge>
      <strong>{{ kindLabel(c.kind) }}</strong>
      <span v-if="paramText" class="faint small mono">{{ paramText }}</span>
      <span class="spacer" />
      <span class="faint small">{{ c.createdBy.name ?? c.createdBy.emp }}({{ c.createdBy.emp }})· {{ fmtTime(c.createdAt) }}</span>
    </div>

    <p v-if="c.state === 'queued'" class="small muted" style="margin: 0">電腦連線後送出;{{ fmtTime(c.expiresAt) }} 前未送達即過期,不會執行。</p>
    <p v-else-if="c.state === 'expired'" class="small muted" style="margin: 0">電腦在有效期限內沒有連線,指令未執行。</p>

    <div v-if="c.state === 'failed'" class="small">
      <GBadge tone="danger" mono>{{ c.errorCode ?? 'FAILED' }}</GBadge>
      {{ ERROR_LABELS[c.errorCode ?? ''] ?? '' }}
      <span v-if="c.errorMessage" class="faint">{{ c.errorMessage }}</span>
    </div>

    <template v-if="c.state === 'succeeded'">
      <!-- 遠端診斷:各項檢查 -->
      <template v-if="c.kind === 'agent.diagnose'">
        <GTable
          :rows="checks"
          row-key="name"
          :page-size="0"
          :columns="[
            { key: 'name', label: '檢查項目', width: '140px' },
            { key: 'status', label: '結果', width: '90px' },
            { key: 'detail', label: '說明' },
            { key: 'ms', label: '耗時', width: '80px', align: 'right', hideSm: true },
          ]"
        >
          <template #cell-name="{ row }">{{ CHECK_LABELS[row.name] ?? row.name }}</template>
          <template #cell-status="{ row }"
            ><GBadge :tone="CHECK_TONES[row.status] ?? 'neutral'">{{ row.status }}</GBadge></template
          >
          <template #cell-detail="{ row }"
            ><span class="small">{{ text(row.detail) }}</span></template
          >
          <template #cell-ms="{ row }"
            ><span class="small">{{ row.ms === undefined ? '—' : `${row.ms} ms` }}</span></template
          >
        </GTable>
        <p class="faint small" style="margin: 0">
          Agent {{ text(r.agent_version) }} · {{ r.service_mode ? '服務模式' : '前景模式' }} · 日誌等級 {{ text(r.log_level) }} · 已執行
          {{ text(r.uptime_sec) }} 秒
        </p>
      </template>

      <!-- 收集日誌:下載附檔 -->
      <template v-else-if="c.kind === 'logs.collect'">
        <p class="small" style="margin: 0">
          收集 {{ text(r.days_included) }} 天日誌,壓縮後 {{ fmtSize(Number(r.size_bytes ?? 0)) }}
          <span v-if="r.truncated" class="faint">(超過 20 MB 上限,已捨棄較舊的日期)</span>
        </p>
        <div v-for="f in c.files ?? []" :key="f.fileId" class="row" style="--gap: 8px">
          <a v-if="!f.expired" :href="commandFileUrl(c.commandId, f.fileId)" :download="f.fileName"
            ><GButton size="sm" variant="primary" icon="download">下載日誌</GButton></a
          >
          <GBadge v-else tone="neutral">已超過保存期限並刪除</GBadge>
          <span class="mono small">{{ f.fileName }}</span>
          <span class="faint small">{{ fmtSize(f.sizeBytes) }} · 保存至 {{ fmtTime(f.expiresAt) }}</span>
        </div>
        <p v-if="!compact" class="faint xs mono" style="margin: 0">SHA-256 {{ text(r.sha256) }}</p>
      </template>

      <p v-else-if="c.kind === 'agent.log_level'" class="small" style="margin: 0">
        日誌等級 {{ text(r.previous) }} → <strong>{{ text(r.level) }}</strong>
        <template v-if="r.until">,{{ fmtTime(String(r.until)) }} 自動恢復</template>
      </p>
      <p v-else-if="c.kind === 'inventory.collect'" class="small" style="margin: 0">
        資產回報:{{ r.result === 'unchanged' ? '沒有變化' : r.result === 'stored' ? '已更新' : text(r.result) }}
      </p>
      <p v-else-if="c.kind === 'message.show'" class="small" style="margin: 0">已顯示在電腦主控台的使用者畫面(工作階段 {{ text(r.session_id) }})</p>
      <p v-else-if="c.kind === 'agent.restart'" class="small" style="margin: 0">Agent 已於 {{ fmtTime(text(r.restarted_at)) }} 重新啟動</p>
      <pre v-else class="small mono result-raw">{{ JSON.stringify(r, null, 2) }}</pre>
    </template>

    <p v-if="!compact" class="faint xs" style="margin: 0">
      <span v-for="([label, t], i) in timeline" :key="label">{{ i ? ' → ' : '' }}{{ label }} {{ fmtTime(t) }}</span>
      <template v-if="c.sendCount > 1">· 推送 {{ c.sendCount }} 次</template>
      <template v-if="c.requestId">· requestId {{ c.requestId.slice(0, 12) }}</template>
    </p>
  </div>
</template>

<style scoped>
.result-raw {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
