<script setup lang="ts">
/**
 * 電腦清單:經 Gateway BFF 取得 Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8;RustIt ItAgentBack,INTEGRATION-PLAN M3)。
 * 單一入口後本系統的登入就是 Gateway 登入(同一工號);資料權限以 BFF 的 endpoint.device.read 為準(§8.6)。
 * 點列開詳情(DeviceDetail:硬體、網卡、磁碟、防毒)。
 */
import { computed, ref } from 'vue';
import { can, useAuth } from '@/api/auth';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { ApiError, describeError, http } from '@/api/http';
import type { EndpointDevice } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import DeviceDetail from './DeviceDetail.vue';

const { user } = useAuth();
const allowed = computed(() => can('endpoint.device.read'));
const { data, loading, error, reload } = useAsync(async () =>
  allowed.value ? (await http.get<{ items: EndpointDevice[] }>('/api/endpoint/devices')).items : [],
);
const devices = computed(() => data.value ?? []);
const onlineCount = computed(() => devices.value.filter((d) => d.online).length);
const selected = ref<EndpointDevice | null>(null);
const detailOpen = ref(false);
function openDetail(row: EndpointDevice) {
  selected.value = row;
  detailOpen.value = true;
}

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
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="monitor" :title="errorTitle" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <GCard v-else-if="!allowed">
      <GEmpty
        tone="warning"
        icon="lock"
        title="Gateway 權限不足"
        :description="`${user?.employeeNo ?? ''} 在 Gateway 沒有 endpoint.device.read(端點查詢),請洽 IT 權限管理人員設定角色。`"
      />
    </GCard>

    <GCard v-else padding="none" title="電腦清單" :subtitle="`${devices.length} 台,在線 ${onlineCount} 台`" icon="monitor">
      <GTable
        :loading="loading && !data"
        :rows="devices"
        row-key="deviceId"
        clickable
        empty-title="尚無 Agent 連線紀錄"
        empty-description="Agent 經 Gateway :9443 連線後會出現在這裡"
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
        <template #cell-computerName="{ row }"
          ><strong class="nowrap" :title="row.certDn">{{ row.computerName }}</strong></template
        >
        <template #cell-online="{ row }">
          <GBadge :tone="row.status === 'disabled' ? 'danger' : row.online ? 'success' : 'neutral'" dot>{{
            row.status === 'disabled' ? '已停用' : row.online ? '在線' : '離線'
          }}</GBadge>
        </template>
        <template #cell-userName="{ row }"
          ><span class="nowrap">{{ row.userName ?? '—' }}</span></template
        >
        <template #cell-ips="{ row }"
          ><span class="mono small" :title="row.ips.join(', ')">{{ row.ips[0] ?? '—' }}{{ row.ips.length > 1 ? ` +${row.ips.length - 1}` : '' }}</span></template
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

    <GModal v-model:open="detailOpen" :title="selected?.computerName ?? ''" :subtitle="selected?.deviceId" icon="monitor" width="880px">
      <DeviceDetail v-if="selected" :key="selected.deviceId" :device-id="selected.deviceId" />
    </GModal>
  </div>
</template>
