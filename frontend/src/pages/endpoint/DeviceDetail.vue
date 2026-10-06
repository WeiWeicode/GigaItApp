<script setup lang="ts">
/**
 * 電腦詳情(放在電腦清單的對話框內,開啟時才載入):GET /api/endpoint/devices/{deviceId}(RustIt ItAgentBack)。
 * 顯示 Agent 最新一份資產:基本資訊、硬體、磁碟、網卡、防毒;軟體清單只顯示筆數(進階功能再做查詢)。
 */
import { computed } from 'vue';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { describeError, http } from '@/api/http';
import type { EndpointDeviceDetail } from '@/api/types';
import { useAsync } from '@/composables/useAsync';

const props = defineProps<{ deviceId: string }>();
const { data, loading, error, reload } = useAsync(() => http.get<EndpointDeviceDetail>(`/api/endpoint/devices/${encodeURIComponent(props.deviceId)}`));
const d = computed(() => data.value);
const inv = computed(() => data.value?.inventory ?? null);
const usedPct = (v: { total: number; available: number }) => (v.total ? Math.round(((v.total - v.available) / v.total) * 100) : 0);
</script>

<template>
  <GSkeleton v-if="loading && !d" :lines="8" />
  <GEmpty v-else-if="error" tone="danger" icon="monitor" title="無法取得電腦詳情" :description="describeError(error)"
    ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
  >
  <div v-else-if="d" class="stack" style="--gap: 16px">
    <dl class="kv">
      <dt>狀態</dt>
      <dd class="row" style="--gap: 6px">
        <GBadge :tone="d.online ? 'success' : 'neutral'" dot>{{ d.online ? '在線' : '離線' }}</GBadge>
        <GBadge v-if="d.status === 'disabled'" tone="danger">已停用</GBadge>
        <span class="faint small">最後回報 {{ fromNow(d.lastSeenAt) }}</span>
      </dd>
      <dt>使用者</dt>
      <dd>{{ d.userName ?? '—' }}</dd>
      <dt>作業系統</dt>
      <dd>{{ d.osName ?? '—' }} <span class="faint small">{{ d.osVersion ?? '' }}</span></dd>
      <dt>製造商 / 型號</dt>
      <dd>{{ [d.manufacturer, d.model].filter(Boolean).join(' ') || '—' }}</dd>
      <dt>序號</dt>
      <dd class="mono small">{{ inv?.identity.biosSerial || inv?.identity.systemUuid || '—' }}</dd>
      <dt>Agent</dt>
      <dd>{{ d.agentVersion ?? '—' }} <span class="faint small">資產蒐集 {{ fmtTime(d.collectedAt) }}</span></dd>
      <dt>首次連線</dt>
      <dd>{{ fmtTime(d.firstSeenAt) }}</dd>
      <dt>憑證</dt>
      <dd class="mono small">{{ d.certDn }}<br /><span class="faint">{{ d.certFingerprint }}</span></dd>
    </dl>

    <GEmpty v-if="!inv" icon="clock" title="尚未收到資產回報" description="Agent 已連線,第一份資產回報完成後會顯示硬體、網卡、磁碟與防毒資訊" />
    <template v-else>
      <div class="grid grid-2" style="--gap: 16px">
        <GCard title="硬體" icon="cpu" padding="sm">
          <dl class="kv">
            <dt>CPU</dt>
            <dd>{{ inv.cpu.name || '—' }} <span class="faint small">{{ inv.cpu.cores }} 核 / {{ inv.cpu.logical }} 執行緒</span></dd>
            <dt>記憶體</dt>
            <dd>
              {{ fmtBytes(inv.memoryTotal) }}
              <span v-if="inv.memoryModules.length" class="faint small"
                >({{ inv.memoryModules.map((m) => `${fmtBytes(m.capacity)}${m.speedMhz ? ` ${m.speedMhz}MHz` : ''}`).join('、') }})</span
              >
            </dd>
            <dt>顯示卡</dt>
            <dd>{{ inv.gpus.map((g) => g.name).join('、') || '—' }}</dd>
            <dt>主機板</dt>
            <dd>{{ [inv.identity.boardManufacturer, inv.identity.boardProduct].filter(Boolean).join(' ') || '—' }}</dd>
          </dl>
        </GCard>

        <GCard title="安全" icon="shield" padding="sm">
          <dl class="kv">
            <dt>防毒</dt>
            <dd>
              <span v-if="!inv.security.antivirus.length" class="faint">未偵測到</span>
              <span v-for="a in inv.security.antivirus" :key="a.name" class="row" style="--gap: 6px">
                {{ a.name }}
                <GBadge :tone="a.enabled ? 'success' : 'danger'">{{ a.enabled ? '啟用' : '未啟用' }}</GBadge>
                <GBadge :tone="a.upToDate ? 'success' : 'warning'">{{ a.upToDate ? '病毒碼最新' : '病毒碼過期' }}</GBadge>
              </span>
            </dd>
            <dt>最近更新</dt>
            <dd class="small">{{ inv.security.recentHotfixes.slice(0, 3).map((h) => `${h.id}(${h.installedOn})`).join('、') || '—' }}</dd>
            <dt>已安裝軟體</dt>
            <dd>{{ inv.software.length }} 筆</dd>
          </dl>
        </GCard>
      </div>

      <GCard title="磁碟" icon="database" padding="sm">
        <div class="stack" style="--gap: 10px">
          <div v-for="v in inv.volumes" :key="v.mountPoint" class="stack" style="--gap: 4px">
            <div class="row small">
              <strong class="mono">{{ v.mountPoint }}</strong>
              <span class="faint">{{ v.label }} · {{ v.fileSystem }}{{ v.removable ? ' · 卸除式' : '' }}</span>
              <span class="spacer" />
              <span>可用 {{ fmtBytes(v.available) }} / {{ fmtBytes(v.total) }}</span>
            </div>
            <GProgress :value="usedPct(v)" :max="100" :tone="usedPct(v) >= 90 ? 'danger' : usedPct(v) >= 75 ? 'warning' : 'primary'" />
          </div>
          <p class="faint small" style="margin: 0">
            實體磁碟:{{ inv.physicalDisks.map((p) => `${p.model}(${fmtBytes(p.size)}${p.interface ? `,${p.interface}` : ''})`).join('、') || '—' }}
          </p>
        </div>
      </GCard>

      <GCard title="網路卡" icon="wifi" padding="none">
        <GTable
          :rows="inv.network"
          row-key="mac"
          :page-size="0"
          :columns="[
            { key: 'description', label: '網卡' },
            { key: 'ips', label: 'IP' },
            { key: 'mac', label: 'MAC', mono: true, hideSm: true },
            { key: 'dhcpEnabled', label: 'DHCP', width: '72px', hideSm: true },
          ]"
        >
          <template #cell-ips="{ row }"
            ><span class="mono small">{{ row.ips.join(', ') || '—' }}</span></template
          >
          <template #cell-dhcpEnabled="{ row }">{{ row.dhcpEnabled ? '是' : '否' }}</template>
        </GTable>
      </GCard>

      <p v-if="inv.warnings.length" class="faint xs" style="margin: 0">蒐集警告:{{ inv.warnings.join(';') }}</p>
    </template>
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
