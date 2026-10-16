<script setup lang="ts">
/**
 * 電腦清單:經 Gateway BFF 取得 Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8;RustIt ItAgentBack,INTEGRATION-PLAN M3)。
 * 單一入口後本系統的登入就是 Gateway 登入(同一工號);資料權限以 BFF 的 endpoint.device.read 為準(§8.6)。
 * RustIt P3:後端分頁(每頁 50 台,依電腦名稱排序)與篩選(關鍵字:名稱、使用者、IP、MAC、裝置代碼;軟體名稱;作業系統;在線;顯示退役)。
 * 點列開詳情(DeviceDetail:概要 / 硬體 / 網路 / 軟體 / 安全與周邊 / 事件 / 指令)。
 */
import { computed, reactive, ref } from 'vue';
import { can, EP, useAuth } from '@/api/auth';
import { deviceApi } from '@/api/endpoint';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { ApiError, describeError } from '@/api/http';
import type { EndpointDevice, EndpointDevicePage } from '@/api/types';
import { usePaged } from '@/composables/usePaged';
import DeviceDetail from './DeviceDetail.vue';

const PAGE_SIZE = 50;
const { user } = useAuth();
const allowed = computed(() => can(EP.deviceRead));

const filters = reactive({ q: '', software: '', os: '', online: '', retired: false });
const list = usePaged<EndpointDevice, EndpointDevicePage>(
  (page, pageSize) =>
    deviceApi.list({
      q: filters.q.trim(),
      software: filters.software.trim(),
      os: filters.os.trim(),
      online: filters.online === '' ? undefined : filters.online === 'true',
      status: filters.retired ? 'active,disabled,retired' : undefined,
      page,
      pageSize,
    }),
  { pageSize: PAGE_SIZE, watch: () => ({ ...filters }), immediate: allowed.value },
);
const { items, total, page, loading, error, data } = list;
const loaded = computed(() => !!data.value);
const load = () => (allowed.value ? list.reload() : Promise.resolve());

const hasFilter = computed(() => !!(filters.q.trim() || filters.software.trim() || filters.os.trim() || filters.online || filters.retired));
function clearFilters() {
  Object.assign(filters, { q: '', software: '', os: '', online: '', retired: false });
}
const ONLINE_OPTIONS = [
  { label: '在線', value: 'true' },
  { label: '離線', value: 'false' },
];

const selected = ref<EndpointDevice | null>(null);
const detailOpen = ref(false);
function openDetail(row: EndpointDevice) {
  selected.value = row;
  detailOpen.value = true;
}
// 詳情內停用 / 退役 / 合併後重新載入清單
function onChanged() {
  void load();
}

const statusBadge = (d: EndpointDevice): { tone: 'danger' | 'success' | 'neutral'; text: string } =>
  d.status === 'retired'
    ? { tone: 'neutral', text: d.mergedInto ? '已合併' : '已退役' }
    : d.status === 'disabled'
      ? { tone: 'danger', text: '已停用' }
      : d.online
        ? { tone: 'success', text: '在線' }
        : { tone: 'neutral', text: '離線' };

const errorTitle = computed(() => {
  const e = error.value;
  if (e instanceof ApiError) {
    if (e.status === 403) return 'Gateway 權限不足';
    if (e.status === 404) return 'Gateway 尚未提供端點 API';
    if (e.status >= 502) return 'Endpoint Server 無法連線';
  }
  return '無法取得電腦清單';
});
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="load">重新整理</GButton>
    </Teleport>

    <GCard v-if="!allowed">
      <GEmpty
        tone="warning"
        icon="lock"
        title="Gateway 權限不足"
        :description="`${user?.employeeNo ?? ''} 在 Gateway 沒有 endpoint.device.read(端點查詢),請洽 IT 權限管理人員設定角色。`"
      />
    </GCard>

    <GCard v-else padding="none" title="電腦清單" :subtitle="loaded ? `${hasFilter ? '符合' : '共'} ${total} 台` : ''" icon="monitor">
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="電腦名稱、使用者、IP、MAC、裝置代碼" clearable />
        <GInput v-model="filters.software" icon="package" placeholder="軟體名稱" clearable />
        <GInput v-model="filters.os" placeholder="作業系統(例:Windows 11、24H2)" clearable />
        <GSelect v-model="filters.online" :options="ONLINE_OPTIONS" placeholder="在線 / 離線" />
        <GCheckbox v-model="filters.retired" label="顯示退役" />
        <GButton v-if="hasFilter" size="sm" variant="ghost" icon="x" @click="clearFilters">清除</GButton>
      </div>

      <GEmpty v-if="error" tone="danger" icon="monitor" :title="errorTitle" :description="describeError(error)"
        ><GButton icon="refresh" @click="load">重試</GButton></GEmpty
      >
      <GTable
        v-else
        v-model:page="page"
        :loading="loading && !loaded"
        :rows="items"
        :total="total"
        :page-size="PAGE_SIZE"
        row-key="deviceId"
        clickable
        :empty-title="hasFilter ? '沒有符合條件的電腦' : '尚無 Agent 連線紀錄'"
        :empty-description="hasFilter ? '調整或清除篩選條件' : 'Agent 經 Gateway :9443 連線後會出現在這裡'"
        :columns="[
          { key: 'computerName', label: '電腦名稱' },
          { key: 'online', label: '狀態', width: '96px' },
          { key: 'userName', label: '使用者', hideSm: true },
          { key: 'ips', label: 'IP' },
          { key: 'osName', label: '作業系統', hideSm: true },
          { key: 'cpuName', label: 'CPU', hideSm: true },
          { key: 'memoryTotal', label: '記憶體', align: 'right', hideSm: true },
          { key: 'lastSeenAt', label: '最後回報' },
        ]"
        @row-click="openDetail"
      >
        <template #cell-computerName="{ row }">
          <span class="row" style="--gap: 6px">
            <strong class="nowrap" :title="row.certDn">{{ row.computerName }}</strong>
            <GBadge v-if="row.suspectedDuplicate" tone="warning" title="有其他裝置硬體指紋相同(重灌、改名或換憑證),可在詳情確認合併">疑似同一台</GBadge>
          </span>
        </template>
        <template #cell-online="{ row }">
          <GBadge :tone="statusBadge(row).tone" dot>{{ statusBadge(row).text }}</GBadge>
        </template>
        <template #cell-userName="{ row }"
          ><span class="nowrap">{{ row.userName ?? '—' }}</span></template
        >
        <template #cell-ips="{ row }"
          ><span class="mono small" :title="row.ips.join(', ')"
            >{{ row.ips[0] ?? '—' }}{{ row.ips.length > 1 ? ` +${row.ips.length - 1}` : '' }}</span
          ></template
        >
        <template #cell-osName="{ row }"
          ><span class="small" :title="row.osVersion ?? ''">{{ row.osName ?? '—' }}</span></template
        >
        <template #cell-cpuName="{ row }"
          ><span class="small">{{ row.cpuName ?? '—' }}</span></template
        >
        <template #cell-memoryTotal="{ row }"
          ><span class="nowrap">{{ fmtBytes(row.memoryTotal) }}</span></template
        >
        <template #cell-lastSeenAt="{ row }"
          ><span class="nowrap" :title="fmtTime(row.lastSeenAt)">{{ fromNow(row.lastSeenAt) }}</span></template
        >
      </GTable>
    </GCard>

    <GModal v-model:open="detailOpen" :title="selected?.computerName ?? ''" :subtitle="selected?.deviceId" icon="monitor" width="960px" height="85vh">
      <DeviceDetail v-if="selected" :key="selected.deviceId" :device-id="selected.deviceId" @changed="onChanged" />
    </GModal>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
/* 欄寬不足時自動換行,「顯示退役」與「清除」不被擠掉 */
.filters > :nth-child(1) {
  flex: 2 1 240px;
}
.filters > :nth-child(2),
.filters > :nth-child(3) {
  flex: 1 1 160px;
}
.filters > :nth-child(4) {
  flex: 0 1 140px;
}
.filters > :nth-child(n + 5) {
  flex: 0 0 auto;
  white-space: nowrap;
}
</style>
