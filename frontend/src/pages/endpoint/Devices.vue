<script setup lang="ts">
/**
 * 電腦清單:經 Gateway BFF 取得 Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8)。
 * 單一入口後本系統的登入就是 Gateway 登入(同一工號);資料權限以 BFF 的 endpoint.device.read 為準(§8.6)。
 */
import { computed } from 'vue';
import { can, useAuth } from '@/api/auth';
import { fmtTime, fromNow } from '@/api/format';
import { ApiError, describeError, http } from '@/api/http';
import type { EndpointDevice } from '@/api/types';
import { useAsync } from '@/composables/useAsync';

const { user } = useAuth();
const allowed = computed(() => can('endpoint.device.read'));
const { data, loading, error, reload } = useAsync(async () =>
  allowed.value ? (await http.get<{ items: EndpointDevice[] }>('/api/endpoint/devices')).items : [],
);
const devices = computed(() => data.value ?? []);
const onlineCount = computed(() => devices.value.filter((d) => d.online).length);

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
        empty-title="尚無 Agent 連線紀錄"
        empty-description="Agent 經 Gateway :9443 連線後會出現在這裡"
        :columns="[
          { key: 'computerName', label: '電腦名稱' },
          { key: 'online', label: '狀態', width: '96px' },
          { key: 'certDn', label: '憑證 DN', hideSm: true },
          { key: 'certFingerprint', label: '憑證指紋', hideSm: true },
          { key: 'lastSeenAt', label: '最後回報' },
          { key: 'firstSeenAt', label: '首次連線', hideSm: true },
        ]"
      >
        <template #cell-computerName="{ row }"
          ><strong class="nowrap">{{ row.computerName }}</strong></template
        >
        <template #cell-online="{ row }">
          <GBadge :tone="row.online ? 'success' : 'neutral'" dot>{{ row.online ? '在線' : '離線' }}</GBadge>
        </template>
        <template #cell-certDn="{ row }"
          ><code class="nowrap">{{ row.certDn }}</code></template
        >
        <template #cell-certFingerprint="{ row }"
          ><code :title="row.certFingerprint">{{ row.certFingerprint.slice(0, 12) }}…</code></template
        >
        <template #cell-lastSeenAt="{ row }"
          ><span class="nowrap" :title="fmtTime(row.lastSeenAt)">{{ fromNow(row.lastSeenAt) }}</span></template
        >
        <template #cell-firstSeenAt="{ row }"
          ><span class="nowrap">{{ fmtTime(row.firstSeenAt) }}</span></template
        >
      </GTable>
    </GCard>
  </div>
</template>
