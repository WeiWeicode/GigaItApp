<script setup lang="ts">
/**
 * 電腦詳情「健康與 Agent」Tab 的「版本與升級」區塊(RustIt P6;P6-UPGRADE-DESIGN §7):
 *   - 所屬環(pilot / it / all,預設 all):PUT /api/endpoint/devices/{id}/ring(endpoint.command.admin;進出 pilot 另需可管理所有公司)
 *   - 各元件(Agent / Watchdog)目前版本、目標版本(所屬環,或「指定」= agent.upgrade 強制版本)、升級狀態與最後錯誤
 *   - 立即升級:agent.upgrade(POST /devices/{id}/admin-commands,endpoint.command.admin)讓 Watchdog 立即上報並重設失敗次數、解除冷卻;
 *     目標版本仍由所屬環決定,沒有目標或已是目標時不會有動作
 * 按鈕:it.endpoint-device.admin ∧ endpoint.command.admin。錯誤訊息來自端點回報,一律以文字顯示。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { RELEASE_COMPONENT_LABELS, RING_LABELS, UPGRADE_STATE_LABELS, UPGRADE_STATE_TONES, deviceApi, endpointApi, upgradeErrorLabel } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointDeviceDetail, EndpointDeviceUpgrade, EndpointRing } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const props = defineProps<{ device: EndpointDeviceDetail }>();
const emit = defineEmits<{ changed: [] }>();

const allowed = computed(() => can(UI.devAdmin) && can(EP.commandAdmin));
const state = useAsync(() => deviceApi.upgrade(props.device.deviceId));
const rows = computed(() => state.data.value?.upgrades ?? []);
const RING_OPTIONS = Object.entries(RING_LABELS).map(([value, label]) => ({ label, value }));

const ring = ref<EndpointRing>('all');
watch(
  () => state.data.value?.ring,
  (r) => {
    if (r) ring.value = r;
  },
  { immediate: true },
);
const busy = ref(false);

async function changeRing() {
  const to = ring.value;
  if (!state.data.value || to === state.data.value.ring) return;
  const ok = await confirm({
    title: `把這台電腦放到 ${to} 環?`,
    message:
      (to === 'pilot' ? 'pilot 是 IT 測試機:新版本會先下發到這一環,草稿版本也可以。' : `這台電腦之後依 ${to} 環的目標版本升級。`) +
      (to === 'pilot' || state.data.value.ring === 'pilot' ? '進出 pilot 需要可管理所有公司的角色。' : ''),
    confirmText: '變更',
  });
  if (!ok) {
    ring.value = state.data.value.ring;
    return;
  }
  busy.value = true;
  try {
    await deviceApi.setRing(props.device.deviceId, to);
    toast.success('所屬環已變更');
    await state.reload();
    emit('changed');
  } catch (e) {
    toast.fromError(e, '無法變更所屬環');
    if (state.data.value) ring.value = state.data.value.ring;
  } finally {
    busy.value = false;
  }
}

let refreshTimer: number | undefined;
onBeforeUnmount(() => window.clearTimeout(refreshTimer));

async function upgradeNow(u: EndpointDeviceUpgrade['upgrades'][number]) {
  const name = RELEASE_COMPONENT_LABELS[u.component];
  const ok = await confirm({
    title: `立即升級 ${name}?`,
    message: `讓 Watchdog 立即上報並取得目標版本(目前 ${u.currentVersion ?? '—'},目標 ${u.targetVersion ?? '無'}),同時重設失敗次數、解除冷卻。電腦離線時指令會排隊,連線後送出。升級過程中 Agent 會短暫停止。`,
    confirmText: '立即升級',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await endpointApi.createAdmin(props.device.deviceId, 'agent.upgrade', { component: u.component });
    toast.success('已送出升級指令', '約 1 分鐘內開始;結果見「指令」Tab 與下方狀態');
    emit('changed');
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(() => void state.reload(), 5000);
  } catch (e) {
    toast.fromError(e, '無法送出升級指令');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GCard title="版本與升級" icon="rocket" padding="sm" :subtitle="state.data.value ? `所屬環 ${state.data.value.ring}` : ''">
    <template #actions>
      <GButton size="sm" variant="ghost" icon="refresh" :loading="state.loading.value" @click="state.reload">重新整理</GButton>
    </template>
    <GSkeleton v-if="state.loading.value && !state.data.value" :lines="3" />
    <GEmpty v-else-if="state.error.value" tone="danger" icon="rocket" title="無法取得升級狀態" :description="describeError(state.error.value)"
      ><GButton icon="refresh" @click="state.reload">重試</GButton></GEmpty
    >
    <div v-else class="stack" style="--gap: 12px">
      <div v-if="allowed" class="row" style="--gap: 8px; align-items: flex-end; flex-wrap: wrap">
        <GSelect v-model="ring" label="所屬環" :options="RING_OPTIONS" :disabled="busy" />
        <GButton size="sm" :loading="busy" :disabled="!state.data.value || ring === state.data.value.ring" @click="changeRing">變更</GButton>
      </div>
      <GTable
        :rows="rows"
        row-key="component"
        :page-size="0"
        empty-title="沒有升級資料"
        :columns="[
          { key: 'component', label: '元件', width: '90px' },
          { key: 'currentVersion', label: '目前版本', width: '110px' },
          { key: 'targetVersion', label: '目標版本', width: '130px' },
          { key: 'state', label: '狀態' },
          { key: 'actions', label: '', width: '110px' },
        ]"
      >
        <template #cell-component="{ row }">{{ RELEASE_COMPONENT_LABELS[row.component as EndpointDeviceUpgrade['upgrades'][number]['component']] }}</template>
        <template #cell-currentVersion="{ row }"
          ><span class="mono">{{ row.currentVersion ?? '—' }}</span></template
        >
        <template #cell-targetVersion="{ row }">
          <span v-if="row.targetVersion" class="mono">{{ row.targetVersion }}</span>
          <span v-else class="faint small">無</span>
          <GBadge v-if="row.targetSource === 'forced'" tone="warning" style="margin-left: 4px" :title="row.forcedBy ? `由 ${row.forcedBy} 指定` : undefined"
            >指定</GBadge
          >
        </template>
        <template #cell-state="{ row }">
          <div v-if="row.state" class="small" style="overflow-wrap: anywhere">
            <GBadge :tone="UPGRADE_STATE_TONES[row.state as keyof typeof UPGRADE_STATE_TONES]">{{
              UPGRADE_STATE_LABELS[row.state as keyof typeof UPGRADE_STATE_LABELS]
            }}</GBadge>
            <span class="faint xs" style="margin-left: 6px" :title="fmtTime(row.updatedAt)">{{ fromNow(row.updatedAt) }}</span>
            <div v-if="row.errorCode" class="tone-danger xs" :title="row.errorMessage ?? undefined">
              {{ upgradeErrorLabel(row.errorCode) }}{{ row.attempts ? `(第 ${row.attempts} 次)` : '' }}
            </div>
          </div>
          <span v-else class="faint small">—</span>
        </template>
        <template #cell-actions="{ row }">
          <GButton
            v-if="allowed"
            size="sm"
            variant="ghost"
            :disabled="busy || !row.targetVersion || row.targetVersion === row.currentVersion"
            :title="!row.targetVersion ? '這台電腦所屬環沒有目標版本' : row.targetVersion === row.currentVersion ? '已是目標版本' : undefined"
            @click="upgradeNow(row)"
            >立即升級</GButton
          >
        </template>
      </GTable>
      <p class="faint xs" style="margin: 0">
        目標版本由所屬環的設定決定(Agent 版本 Tab)。失敗同一版本最多自動重試 2 次,之後等「立即升級」;新版啟動後不正常會自動還原。
      </p>
    </div>
  </GCard>
</template>
