<script setup lang="ts">
/**
 * 電腦詳情(放在電腦清單的對話框內,開啟時才載入):GET /api/endpoint/devices/{deviceId}(RustIt ItAgentBack)。
 * RustIt P3 分 Tab(PLATFORM-PLAN §3.3、§7;P3-DATA-DESIGN §5):
 *   概要(狀態、身分、疑似同一台與管理操作)/ 硬體 / 網路 / 軟體(名稱篩選)/ 安全與周邊(防毒、更新、USB、RustDesk)/ 事件 / 指令。
 *   硬體到安全與周邊都來自同一份資產快照;事件、指令切到該 Tab 才載入。
 *   「下載資產 JSON」:最新一份快照原樣(snake_case),瀏覽器以 Cookie 下載(endpoint.device.read)。
 * Agent 回報的字串一律以文字顯示(不用 v-html)。
 */
import { computed, ref } from 'vue';
import { inventoryJsonUrl } from '@/api/endpoint';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { describeError, http } from '@/api/http';
import type { EndpointDeviceDetail } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import DeviceAdminActions from '@/components/endpoint/DeviceAdminActions.vue';
import DeviceEvents from '@/components/endpoint/DeviceEvents.vue';
import DeviceCommands from './DeviceCommands.vue';

const props = defineProps<{ deviceId: string }>();
const emit = defineEmits<{ changed: [] }>();
const { data, loading, error, reload } = useAsync(() => http.get<EndpointDeviceDetail>(`/api/endpoint/devices/${encodeURIComponent(props.deviceId)}`));
const d = computed(() => data.value);
const inv = computed(() => data.value?.inventory ?? null);
const usedPct = (v: { total: number; available: number }) => (v.total ? Math.round(((v.total - v.available) / v.total) * 100) : 0);
const tab = ref('overview');
const TABS = [
  { label: '概要', value: 'overview', icon: 'monitor' },
  { label: '硬體', value: 'hardware', icon: 'cpu' },
  { label: '網路', value: 'network', icon: 'wifi' },
  { label: '軟體', value: 'software', icon: 'package' },
  { label: '安全與周邊', value: 'security', icon: 'shield' },
  { label: '事件', value: 'events', icon: 'clock' },
  { label: '指令', value: 'commands', icon: 'send' },
];
const INVENTORY_TABS = ['hardware', 'network', 'software', 'security'];

const swQuery = ref('');
const software = computed(() => {
  const q = swQuery.value.trim().toLowerCase();
  const list = inv.value?.software ?? [];
  return q ? list.filter((s) => `${s.name} ${s.publisher}`.toLowerCase().includes(q)) : list;
});

const USB_POLICY: Record<string, string> = { Allowed: '允許', Blocked: '封鎖', Unknown: '未知' };
const bootTime = computed(() => (inv.value?.system.bootTime ? fmtTime(new Date(inv.value.system.bootTime * 1000).toISOString()) : '—'));
const skewText = computed(() => {
  const ms = d.value?.clockSkewMs;
  if (ms == null) return '—';
  const sec = Math.round(ms / 1000);
  return `${sec > 0 ? '+' : ''}${sec} 秒`;
});
const skewWarn = computed(() => Math.abs(d.value?.clockSkewMs ?? 0) > 5 * 60_000);

const statusBadge = computed(() => {
  const x = d.value;
  if (!x) return null;
  if (x.status === 'retired') return { tone: 'neutral' as const, text: x.mergedInto ? '已合併' : '已退役' };
  if (x.status === 'disabled') return { tone: 'danger' as const, text: '已停用' };
  return null;
});

async function onChanged() {
  await reload();
  emit('changed');
}
</script>

<template>
  <GSkeleton v-if="loading && !d" :lines="8" />
  <GEmpty v-else-if="error" tone="danger" icon="monitor" title="無法取得電腦詳情" :description="describeError(error)"
    ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
  >
  <div v-else-if="d" class="stack" style="--gap: 16px">
    <div class="row" style="--gap: 8px">
      <GTabs v-model="tab" :items="TABS" />
      <span class="spacer" />
      <a v-if="inv" :href="inventoryJsonUrl(d.deviceId)" download><GButton size="sm" variant="ghost" icon="download">下載資產 JSON</GButton></a>
    </div>

    <!-- 概要 -->
    <div v-if="tab === 'overview'" class="stack" style="--gap: 16px">
      <div v-if="d.suspectedDuplicates?.length || d.mergedInto" class="notice tone-warning">
        <template v-if="d.mergedInto">
          這台已併入 <span class="mono">{{ d.mergedInto }}</span
          >(重灌、改名或換憑證後確認為同一台),紀錄已搬到該裝置。
        </template>
        <template v-else>
          <strong>疑似同一台:</strong>有 {{ d.suspectedDuplicates!.length }} 台裝置的硬體指紋(BIOS 序號 + 主機板
          UUID)與這台相同,可能是重灌、改名或換憑證後重新登錄。 指紋由端點自行回報,合併前請對照電腦名稱、使用者與實體確認。
        </template>
      </div>

      <dl class="kv">
        <dt>狀態</dt>
        <dd class="row" style="--gap: 6px">
          <GBadge :tone="d.online ? 'success' : 'neutral'" dot>{{ d.online ? '在線' : '離線' }}</GBadge>
          <GBadge v-if="statusBadge" :tone="statusBadge.tone">{{ statusBadge.text }}</GBadge>
          <span class="faint small">最後回報 {{ fromNow(d.lastSeenAt) }}</span>
        </dd>
        <dt>使用者</dt>
        <dd>{{ d.userName ?? '—' }}</dd>
        <dt>網域</dt>
        <dd>{{ d.domain ?? '—' }}</dd>
        <dt>作業系統</dt>
        <dd>
          {{ d.osName ?? '—' }} <span class="faint small">{{ d.osVersion ?? '' }}</span>
        </dd>
        <dt>製造商 / 型號</dt>
        <dd>{{ [d.manufacturer, d.model].filter(Boolean).join(' ') || '—' }}</dd>
        <dt>序號</dt>
        <dd class="mono small">{{ inv?.identity.biosSerial || inv?.identity.systemUuid || '—' }}</dd>
        <dt>IP</dt>
        <dd class="mono small">{{ d.ips.join(', ') || '—' }}</dd>
        <dt>Agent</dt>
        <dd>
          {{ d.agentVersion ?? '—' }} <span class="faint small">資產蒐集 {{ fmtTime(d.collectedAt) }}</span>
        </dd>
        <dt>時鐘偏差</dt>
        <dd>
          <span :class="{ 'tone-warning': skewWarn }">{{ skewText }}</span> <span v-if="skewWarn" class="faint small">(超過 ±5 分鐘)</span>
        </dd>
        <dt>開機時間</dt>
        <dd>{{ bootTime }}</dd>
        <dt>首次連線</dt>
        <dd>{{ fmtTime(d.firstSeenAt) }}</dd>
        <dt>裝置代碼</dt>
        <dd class="mono small">{{ d.deviceId }}</dd>
        <dt>憑證</dt>
        <dd class="mono small">
          {{ d.certDn }}<br /><span class="faint">{{ d.certFingerprint }}</span>
        </dd>
      </dl>

      <DeviceAdminActions :device="d" @changed="onChanged" />
    </div>

    <GEmpty
      v-else-if="INVENTORY_TABS.includes(tab) && !inv"
      icon="clock"
      title="尚未收到資產回報"
      description="Agent 已連線,第一份資產回報完成後會顯示硬體、網路、軟體與安全資訊"
    />

    <!-- 硬體 -->
    <div v-else-if="tab === 'hardware' && inv" class="stack" style="--gap: 16px">
      <div class="grid grid-2" style="--gap: 16px">
        <GCard title="處理器與記憶體" icon="cpu" padding="sm">
          <dl class="kv">
            <dt>CPU</dt>
            <dd>{{ inv.cpu.name || '—' }}</dd>
            <dt>核心</dt>
            <dd>
              {{ inv.cpu.cores }} 核 / {{ inv.cpu.logical }} 執行緒<span v-if="inv.cpu.maxMhz" class="faint small">,最高 {{ inv.cpu.maxMhz }} MHz</span>
            </dd>
            <dt>記憶體</dt>
            <dd>{{ fmtBytes(inv.memoryTotal) }}</dd>
            <dt>架構</dt>
            <dd>{{ inv.system.arch || '—' }}</dd>
          </dl>
        </GCard>
        <GCard title="主機板與 BIOS" icon="server" padding="sm">
          <dl class="kv">
            <dt>主機板</dt>
            <dd>{{ [inv.identity.boardManufacturer, inv.identity.boardProduct].filter(Boolean).join(' ') || '—' }}</dd>
            <dt>主機板序號</dt>
            <dd class="mono small">{{ inv.identity.boardSerial || '—' }}</dd>
            <dt>BIOS</dt>
            <dd>{{ [inv.identity.biosVendor, inv.identity.biosVersion].filter(Boolean).join(' ') || '—' }}</dd>
            <dt>BIOS 序號</dt>
            <dd class="mono small">{{ inv.identity.biosSerial || '—' }}</dd>
            <dt>系統 UUID</dt>
            <dd class="mono small">{{ inv.identity.systemUuid || '—' }}</dd>
          </dl>
        </GCard>
      </div>

      <GCard title="記憶體模組" icon="cpu" padding="none">
        <GTable
          :rows="inv.memoryModules"
          row-key="slot"
          :page-size="0"
          empty-title="未偵測到"
          :columns="[
            { key: 'slot', label: '插槽' },
            { key: 'capacity', label: '容量', align: 'right' },
            { key: 'speedMhz', label: '速度', align: 'right' },
            { key: 'manufacturer', label: '廠牌', hideSm: true },
            { key: 'partNumber', label: '型號', mono: true, hideSm: true },
          ]"
        >
          <template #cell-capacity="{ row }">{{ fmtBytes(row.capacity) }}</template>
          <template #cell-speedMhz="{ row }">{{ row.speedMhz ? `${row.speedMhz} MHz` : '—' }}</template>
        </GTable>
      </GCard>

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
        </div>
      </GCard>

      <GCard title="實體磁碟" icon="database" padding="none">
        <GTable
          :rows="inv.physicalDisks"
          row-key="serial"
          :page-size="0"
          empty-title="未偵測到"
          :columns="[
            { key: 'model', label: '型號' },
            { key: 'size', label: '容量', align: 'right' },
            { key: 'interface', label: '介面', hideSm: true },
            { key: 'mediaType', label: '類型', hideSm: true },
            { key: 'serial', label: '序號', mono: true, hideSm: true },
          ]"
        >
          <template #cell-size="{ row }">{{ fmtBytes(row.size) }}</template>
        </GTable>
      </GCard>

      <GCard title="顯示卡" icon="monitor" padding="none">
        <GTable
          :rows="inv.gpus"
          row-key="name"
          :page-size="0"
          empty-title="未偵測到"
          :columns="[
            { key: 'name', label: '名稱' },
            { key: 'driverVersion', label: '驅動程式', mono: true, hideSm: true },
            { key: 'resolution', label: '解析度' },
          ]"
        />
      </GCard>
    </div>

    <!-- 網路 -->
    <GCard v-else-if="tab === 'network' && inv" title="網路卡" icon="wifi" padding="none">
      <GTable
        :rows="inv.network"
        row-key="mac"
        :page-size="0"
        empty-title="未偵測到"
        :columns="[
          { key: 'description', label: '網卡' },
          { key: 'ips', label: 'IP' },
          { key: 'gateways', label: '閘道', hideSm: true },
          { key: 'dns', label: 'DNS', hideSm: true },
          { key: 'mac', label: 'MAC', mono: true, hideSm: true },
          { key: 'dhcpEnabled', label: 'DHCP', width: '72px', hideSm: true },
        ]"
      >
        <template #cell-ips="{ row }"
          ><span class="mono small">{{ row.ips.join(', ') || '—' }}</span></template
        >
        <template #cell-gateways="{ row }"
          ><span class="mono small">{{ row.gateways.join(', ') || '—' }}</span></template
        >
        <template #cell-dns="{ row }"
          ><span class="mono small">{{ (row.dns ?? []).join(', ') || '—' }}</span></template
        >
        <template #cell-dhcpEnabled="{ row }">{{ row.dhcpEnabled ? '是' : '否' }}</template>
      </GTable>
    </GCard>

    <!-- 軟體 -->
    <GCard v-else-if="tab === 'software' && inv" title="已安裝軟體" icon="package" padding="none" :subtitle="`${software.length} / ${inv.software.length} 筆`">
      <template #actions>
        <GInput v-model="swQuery" icon="search" placeholder="名稱或發行者" clearable />
      </template>
      <GTable
        :rows="software"
        row-key="name"
        :page-size="20"
        empty-title="沒有符合的軟體"
        :columns="[
          { key: 'name', label: '名稱', sortable: true },
          { key: 'version', label: '版本', mono: true },
          { key: 'publisher', label: '發行者', sortable: true, hideSm: true },
          { key: 'installDate', label: '安裝日期', sortable: true, hideSm: true },
        ]"
      />
    </GCard>

    <!-- 安全與周邊 -->
    <div v-else-if="tab === 'security' && inv" class="grid grid-2" style="--gap: 16px">
      <GCard title="防毒" icon="shield" padding="sm">
        <p v-if="!inv.security.antivirus.length" class="faint small" style="margin: 0">未偵測到防毒軟體</p>
        <div v-for="a in inv.security.antivirus" :key="a.name" class="row" style="--gap: 6px">
          {{ a.name }}
          <GBadge :tone="a.enabled ? 'success' : 'danger'">{{ a.enabled ? '啟用' : '未啟用' }}</GBadge>
          <GBadge :tone="a.upToDate ? 'success' : 'warning'">{{ a.upToDate ? '病毒碼最新' : '病毒碼過期' }}</GBadge>
        </div>
      </GCard>
      <GCard title="USB 儲存裝置" icon="hard-drive" padding="sm">
        <dl class="kv">
          <dt>原則</dt>
          <dd>
            <GBadge :tone="inv.usb?.storagePolicy === 'Blocked' ? 'success' : inv.usb?.storagePolicy === 'Allowed' ? 'warning' : 'neutral'">{{
              USB_POLICY[inv.usb?.storagePolicy ?? 'Unknown'] ?? inv.usb?.storagePolicy
            }}</GBadge>
          </dd>
          <dt>使用過的裝置</dt>
          <dd>
            <span v-if="!inv.usb?.storageHistory?.length" class="faint">—</span>
            <span v-for="u in inv.usb?.storageHistory ?? []" :key="u.serial" class="small" style="display: block"
              >{{ u.friendlyName }} <span class="faint mono">{{ u.serial }}</span></span
            >
          </dd>
        </dl>
        <p class="faint xs" style="margin: 8px 0 0">插拔紀錄見「事件」Tab</p>
      </GCard>
      <GCard title="Windows 更新(最近)" icon="refresh" padding="none">
        <GTable
          :rows="inv.security.recentHotfixes"
          row-key="id"
          :page-size="0"
          empty-title="沒有紀錄"
          :columns="[
            { key: 'id', label: 'KB', mono: true },
            { key: 'description', label: '說明', hideSm: true },
            { key: 'installedOn', label: '安裝日期' },
          ]"
        />
      </GCard>
      <GCard title="RustDesk(遠端協助)" icon="monitor" padding="sm">
        <dl class="kv">
          <dt>安裝</dt>
          <dd>{{ inv.rustdesk?.installed ? `已安裝 ${inv.rustdesk.version}` : '未安裝' }}</dd>
          <template v-if="inv.rustdesk?.installed">
            <dt>ID</dt>
            <dd class="mono">{{ inv.rustdesk.id || '—' }}</dd>
            <dt>伺服器</dt>
            <dd class="mono small">{{ inv.rustdesk.customServer || '預設' }}</dd>
          </template>
        </dl>
      </GCard>
      <p v-if="inv.warnings.length" class="faint xs" style="margin: 0; grid-column: 1 / -1">蒐集警告:{{ inv.warnings.join(';') }}</p>
    </div>

    <DeviceEvents v-else-if="tab === 'events'" :device-id="d.deviceId" />
    <DeviceCommands v-else-if="tab === 'commands'" :device-id="d.deviceId" :computer-name="d.computerName" :online="d.online" :active="d.status === 'active'" />
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
.notice {
  padding: 10px 12px;
  border-radius: var(--radius-md, 8px);
  border: 1px solid currentColor;
  font-size: var(--fs-sm);
  line-height: 1.6;
}
</style>
