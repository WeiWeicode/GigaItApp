<script setup lang="ts">
/**
 * 電腦清單:經 Gateway BFF 取得 Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8)。
 * 權限以 BFF 為準;進頁先確認 Gateway 已登入、且與本系統登入者為同一工號(§8.6)。
 */
import { computed } from 'vue';
import { useAuth } from '@/api/auth';
import { fmtTime, fromNow } from '@/api/format';
import { gatewayGet, gatewayLoginUrl, type EndpointDevice, type GatewayMe } from '@/api/gateway';
import { ApiError, describeError } from '@/api/http';
import { useAsync } from '@/composables/useAsync';

const { user } = useAuth();

type Result =
  | { kind: 'no-login' }
  | { kind: 'mismatch'; gw: GatewayMe['user'] }
  | { kind: 'no-permission'; gw: GatewayMe['user'] }
  | { kind: 'ok'; gw: GatewayMe['user']; devices: EndpointDevice[] };

const { data, loading, error, reload } = useAsync<Result>(async () => {
  let me: GatewayMe;
  try {
    me = await gatewayGet<GatewayMe>('/api/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { kind: 'no-login' };
    throw e;
  }
  if (me.user.employeeNo.toUpperCase() !== user.value?.employeeNo.toUpperCase()) return { kind: 'mismatch', gw: me.user };
  if (!me.permissions.includes('endpoint.device.read')) return { kind: 'no-permission', gw: me.user };
  const r = await gatewayGet<{ items: EndpointDevice[] }>('/api/endpoint/devices');
  return { kind: 'ok', gw: me.user, devices: r.items };
});

const gw = computed(() => (data.value && data.value.kind !== 'no-login' ? data.value.gw : null));
const devices = computed(() => (data.value?.kind === 'ok' ? data.value.devices : []));
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

function goGatewayLogin() {
  location.href = gatewayLoginUrl();
}
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GBadge v-if="gw" tone="info" icon="user">Gateway:{{ gw.employeeNo }} {{ gw.name }}</GBadge>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="monitor" :title="errorTitle" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <GCard v-else-if="data?.kind === 'no-login'">
      <GEmpty tone="warning" icon="login" title="需要登入 Gateway" description="端點管理的資料與權限由 Gateway 提供,請以同一個工號登入入口網後回到此頁。"
        ><GButton variant="primary" icon="login" @click="goGatewayLogin">登入 Gateway</GButton></GEmpty
      >
    </GCard>

    <GCard v-else-if="data?.kind === 'mismatch'">
      <GEmpty
        tone="warning"
        icon="alert"
        title="Gateway 登入者與目前使用者不同"
        :description="`Gateway 目前登入的是 ${data.gw.employeeNo} ${data.gw.name},IT 管理系統是 ${user?.employeeNo} ${user?.name}。請以 ${user?.employeeNo} 重新登入 Gateway。`"
        ><GButton variant="primary" icon="login" @click="goGatewayLogin">重新登入 Gateway</GButton></GEmpty
      >
    </GCard>

    <GCard v-else-if="data?.kind === 'no-permission'">
      <GEmpty
        tone="warning"
        icon="lock"
        title="Gateway 權限不足"
        :description="`${data.gw.employeeNo} 在 Gateway 沒有 endpoint.device.read(端點查詢),請洽 IT 管理員設定角色。`"
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
