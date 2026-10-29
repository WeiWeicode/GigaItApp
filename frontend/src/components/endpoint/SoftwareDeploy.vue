<script setup lang="ts">
/**
 * 派送軟體對話框(RustIt P7;P7-SOFTWARE-DESIGN §3.5、§6;權限 it.endpoint-software.deploy ∧ BFF endpoint.command.admin):
 *   - 單台:POST /devices/{id}/admin-commands(software.install / software.uninstall,params.packageId、ignorePower)
 *   - 多台:POST /software/{id}/deploy(action install / uninstall,Idempotency-Key 防重複送出);超過 20 台(或同一人 24 小時累計超過)進入「待核可」,
 *     需另一位 IT 核可後才送出
 *   - draft / tested 套件只能派到 pilot 環(ITA_PACKAGE_NOT_PUBLISHED);已撤回的套件只能移除
 * 電腦用名稱 / 使用者搜尋後勾選(後端分頁,只查停用以外的電腦,每次一頁)。
 */
import { computed, reactive, ref, watch } from 'vue';
import { deviceApi, endpointApi, softwareApi, softwareErrorText, SOFTWARE_STATUS_LABELS } from '@/api/endpoint';
import { describeError } from '@/api/http';
import type { EndpointDevice, EndpointSoftware } from '@/api/types';
import { toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{
  /** 指定套件(從軟體目錄開啟);省略時在對話框內挑 */
  pkg?: EndpointSoftware | null;
  /** 預先選好的電腦(從電腦詳情開啟) */
  device?: { deviceId: string; computerName: string } | null;
}>();
const emit = defineEmits<{ deployed: [] }>();

const MAX_DEVICES = 200;
const form = reactive({ packageId: '', action: 'install', ignorePower: false, q: '' });
const selected = reactive(new Map<string, string>());
const packages = ref<EndpointSoftware[]>([]);
const results = ref<EndpointDevice[]>([]);
const searching = ref(false);
const searchError = ref<unknown>(null);
const busy = ref(false);

const ACTION_OPTIONS = [
  { label: '安裝', value: 'install' },
  { label: '移除', value: 'uninstall' },
];

watch(open, async (v) => {
  if (!v) return;
  Object.assign(form, { packageId: props.pkg?.packageId ?? '', action: 'install', ignorePower: false, q: '' });
  selected.clear();
  if (props.device) selected.set(props.device.deviceId, props.device.computerName);
  results.value = [];
  if (!props.pkg) {
    try {
      packages.value = (await softwareApi.list()).items;
    } catch (e) {
      toast.fromError(e, '無法取得軟體目錄');
    }
  }
  void search();
});

const current = computed(() => props.pkg ?? packages.value.find((p) => p.packageId === form.packageId) ?? null);
const packageOptions = computed(() =>
  packages.value
    .filter((p) => p.status !== 'revoked' || form.action === 'uninstall')
    .map((p) => ({ label: `${p.name} ${p.version}(${SOFTWARE_STATUS_LABELS[p.status]})`, value: p.packageId })),
);
// 沒發佈過的套件只能派 pilot;已撤回只能移除
const pilotOnly = computed(() => !!current.value && (current.value.status === 'draft' || current.value.status === 'tested'));
const revoked = computed(() => current.value?.status === 'revoked');

let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => form.q,
  () => {
    clearTimeout(timer);
    timer = setTimeout(() => void search(), 300);
  },
);
async function search() {
  searching.value = true;
  searchError.value = null;
  try {
    results.value = (await deviceApi.list({ q: form.q.trim() || undefined, status: 'active', page: 1, pageSize: 15 })).items;
  } catch (e) {
    searchError.value = e;
  } finally {
    searching.value = false;
  }
}

function toggle(d: EndpointDevice, on: boolean) {
  if (on) {
    if (selected.size >= MAX_DEVICES) return toast.warning(`一次最多 ${MAX_DEVICES} 台`);
    selected.set(d.deviceId, d.computerName);
  } else selected.delete(d.deviceId);
}

const count = computed(() => selected.size);
const needsApproval = computed(() => count.value > 20);
const valid = computed(() => !!current.value && count.value > 0 && !(form.action === 'install' && revoked.value));

async function submit() {
  const p = current.value;
  if (!p || !valid.value) return;
  busy.value = true;
  try {
    const ids = [...selected.keys()];
    const kind = form.action === 'install' ? 'software.install' : 'software.uninstall';
    const params: Record<string, unknown> = { packageId: p.packageId };
    if (form.action === 'install' && form.ignorePower) params.ignorePower = true;
    if (ids.length === 1) {
      const c = await endpointApi.createAdmin(ids[0]!, kind, params);
      if (c.batchState === 'pending_approval') toast.info('已建立,等待另一位 IT 核可', '同一人 24 小時內派送台數累計超過 20 台');
      else toast.success(`${form.action === 'install' ? '安裝' : '移除'}指令已建立`, c.state === 'queued' ? '電腦離線時排隊,連線後送出' : undefined);
    } else {
      const r = await softwareApi.deploy(p.packageId, { action: form.action as 'install' | 'uninstall', deviceIds: ids, ignorePower: form.action === 'install' && form.ignorePower ? true : undefined }, crypto.randomUUID());
      if (r.state === 'pending_approval') toast.info(`已建立 ${ids.length} 台的批次,等待另一位 IT 核可`, '24 小時內未核可會自動取消');
      else toast.success(`已對 ${ids.length} 台建立${form.action === 'install' ? '安裝' : '移除'}指令`);
    }
    emit('deployed');
    open.value = false;
  } catch (e) {
    toast.error('無法派送', softwareErrorText(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GModal v-model:open="open" title="派送軟體" :subtitle="current ? `${current.name} ${current.version}` : ''" icon="send" width="720px">
    <div class="stack" style="--gap: 14px">
      <GSelect v-if="!pkg" v-model="form.packageId" label="套件" required :options="packageOptions" placeholder="請選擇" />
      <div class="row wrap" style="--gap: 12px; align-items: flex-end">
        <div class="stack" style="--gap: 4px">
          <span class="small muted">動作</span>
          <GSegmented v-model="form.action" :options="ACTION_OPTIONS" />
        </div>
        <GSwitch v-if="form.action === 'install'" v-model="form.ignorePower" label="略過電池延後(IT 現場處理時用;計量網路仍會延後)" />
      </div>
      <p v-if="pilotOnly" class="small" style="margin: 0"><GBadge tone="warning">{{ SOFTWARE_STATUS_LABELS[current!.status] }}</GBadge> 尚未發佈:只能派到 pilot 環的測試機,其他電腦會被拒絕。</p>
      <p v-else-if="revoked" class="small" style="margin: 0"><GBadge tone="danger">已撤回</GBadge> 已撤回的套件不能再安裝,只能移除。</p>

      <div class="stack" style="--gap: 8px">
        <GInput v-model="form.q" label="選擇電腦" icon="search" placeholder="電腦名稱、使用者…" clearable />
        <GEmpty v-if="searchError" tone="danger" icon="monitor" title="無法查詢電腦" :description="describeError(searchError)"
          ><GButton icon="refresh" @click="search">重試</GButton></GEmpty
        >
        <GSkeleton v-else-if="searching && !results.length" :lines="3" />
        <div v-else class="picker">
          <p v-if="!results.length" class="faint small" style="margin: 8px">沒有符合的電腦</p>
          <div v-for="d in results" :key="d.deviceId" class="pick-row">
            <GCheckbox :model-value="selected.has(d.deviceId)" :label="d.computerName" @update:model-value="toggle(d, $event)" />
            <span class="faint xs">{{ d.userName ?? '—' }} · {{ d.online ? '在線' : '離線' }}</span>
          </div>
          <p class="faint xs" style="margin: 6px 8px">只列最符合的 15 台,用搜尋縮小範圍;已選的電腦會保留。</p>
        </div>
        <div v-if="count" class="row wrap" style="--gap: 6px">
          <GBadge v-for="[id, name] in selected" :key="id" tone="info">{{ name }}</GBadge>
        </div>
      </div>

      <p v-if="needsApproval" class="small" style="margin: 0">
        <GBadge tone="warning">需要核可</GBadge> 超過 20 台:批次會先停在「待核可」,由<strong>另一位</strong>具權限的 IT 核可後才送出(24 小時內未核可自動取消)。
      </p>
    </div>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" icon="send" :loading="busy" :disabled="!valid" @click="submit"
        >{{ form.action === 'install' ? '安裝' : '移除' }}{{ count ? ` ${count} 台` : '' }}</GButton
      >
    </template>
  </GModal>
</template>

<style scoped>
.picker {
  max-height: 240px;
  overflow: auto;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
}
.pick-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
}
</style>
