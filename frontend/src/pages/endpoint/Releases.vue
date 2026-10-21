<script setup lang="ts">
/**
 * 端點管理 › Agent 版本(RustIt P6;P6-UPGRADE-DESIGN §1、§7):
 *   - 發佈環:pilot / it / all × Agent / Watchdog 的目標版本與進度(到目標 / 進行中 / 失敗 / 尚未開始),設定目標版本
 *   - 版本清單:登錄(從版本檔目錄挑未登錄的檔案)、發佈、撤回;SHA-256 與大小由主機讀檔計算,簽章者指紋為預期簽章者
 * 權限:Tab it.endpoint-release.list ∧ BFF endpoint.device.read;管理按鈕 it.endpoint-release.manage ∧ endpoint.software.manage
 *   (主機另要求可管理所有公司,否則回 403)。檔名、版本、備註等一律以文字顯示。
 */
import { computed, reactive, ref, watch } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { RELEASE_COMPONENT_LABELS, RELEASE_STATUS_LABELS, RELEASE_STATUS_TONES, RING_SHORT, compareVersion, releaseApi } from '@/api/endpoint';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointRelease, EndpointReleaseComponent, EndpointReleaseStatus, EndpointRingTarget } from '@/api/types';
import RingTarget from '@/components/endpoint/RingTarget.vue';
import ReleaseRegister from '@/components/endpoint/ReleaseRegister.vue';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const canManage = computed(() => can(UI.releaseManage) && can(EP.softwareManage));

const filters = reactive<{ component: '' | EndpointReleaseComponent; status: '' | EndpointReleaseStatus }>({ component: '', status: '' });
const COMPONENT_OPTIONS = Object.entries(RELEASE_COMPONENT_LABELS).map(([value, label]) => ({ label, value }));
const STATUS_OPTIONS = Object.entries(RELEASE_STATUS_LABELS).map(([value, label]) => ({ label, value }));

const releases = useAsync(() => releaseApi.list({ component: filters.component || undefined, status: filters.status || undefined }));
// 設定目標版本要看全部版本(不受篩選影響)
const allReleases = useAsync(() => releaseApi.list());
const rings = useAsync(() => releaseApi.rings());
watch(filters, () => void releases.reload());

const items = computed(() =>
  [...(releases.data.value?.items ?? [])].sort((a, b) => a.component.localeCompare(b.component) || compareVersion(b.version, a.version)),
);
const ringRows = computed(() => rings.data.value?.items ?? []);

function reloadAll() {
  void releases.reload();
  void allReleases.reload();
  void rings.reload();
}

// ---------- 登錄 ----------
const registering = ref(false);
function onRegistered() {
  registering.value = false;
  reloadAll();
}

// ---------- 發佈 / 撤回 ----------
const busyId = ref<string | null>(null);
async function publish(r: EndpointRelease) {
  const ok = await confirm({
    title: `發佈 ${RELEASE_COMPONENT_LABELS[r.component]} ${r.version}?`,
    message: '發佈後才能設為 it / all 環的目標版本。請確認這個版本已在 pilot 環驗證過。',
    confirmText: '發佈',
  });
  if (!ok) return;
  await act(r, () => releaseApi.publish(r.releaseId), '版本已發佈');
}
async function revoke(r: EndpointRelease) {
  const ok = await confirm({
    title: `撤回 ${RELEASE_COMPONENT_LABELS[r.component]} ${r.version}?`,
    message: '撤回後不再下發,也不能再設為目標;以此版本為目標的發佈環會改為「不升級」,已指定此版本的單台升級一併清除。已經升級的電腦不會自動降版。',
    confirmText: '撤回',
    tone: 'danger',
  });
  if (!ok) return;
  await act(r, () => releaseApi.revoke(r.releaseId), '版本已撤回');
}
async function act(r: EndpointRelease, fn: () => Promise<EndpointRelease>, done: string) {
  busyId.value = r.releaseId;
  try {
    const res = await fn();
    toast.success(done, res.clearedRings?.length ? `已清除環的目標:${res.clearedRings.map((x) => RING_SHORT[x]).join('、')}` : undefined);
  } catch (e) {
    // 狀態已被別人改過(409)、版本不存在(404):提示並重新載入
    toast.fromError(e, '操作失敗');
  } finally {
    busyId.value = null;
    reloadAll();
  }
}

// ---------- 設定發佈環目標版本 ----------
const editing = ref<EndpointRingTarget | null>(null);
function onRingSaved() {
  editing.value = null;
  void rings.reload();
}
const progressText = (r: EndpointRingTarget) => {
  const p = r.progress;
  return r.targetVersion === null ? '—' : `${p.atTarget}/${p.total}`;
};
const COMPONENT_ORDER: Record<string, number> = { agent: 0, watchdog: 1 };
const RING_ORDER: Record<string, number> = { pilot: 0, it: 1, all: 2 };
// 環 × 元件才是唯一鍵:GTable 以 row[rowKey] 當 :key,只用 ring 會重複(每個環有兩列)
const sortedRings = computed(() =>
  [...ringRows.value]
    .map((r) => ({ ...r, rowId: `${r.ring}/${r.component}` }))
    .sort((a, b) => (RING_ORDER[a.ring] ?? 9) - (RING_ORDER[b.ring] ?? 9) || (COMPONENT_ORDER[a.component] ?? 9) - (COMPONENT_ORDER[b.component] ?? 9)),
);
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="releases.loading.value || rings.loading.value || allReleases.loading.value" @click="reloadAll">重新整理</GButton>
      <GButton v-if="canManage" variant="primary" icon="plus" title="需要可管理所有公司的角色(環與版本是全公司共用)" @click="registering = true"
        >登錄版本</GButton
      >
    </Teleport>

    <GCard title="發佈環" icon="rocket" padding="none" subtitle="先在 pilot(IT 測試機)驗證,再依序推到 it、all;主機只對所屬環的電腦下發目標版本">
      <GEmpty v-if="rings.error.value" tone="danger" icon="rocket" title="無法取得發佈環" :description="describeError(rings.error.value)"
        ><GButton icon="refresh" @click="rings.reload">重試</GButton></GEmpty
      >
      <GTable
        v-else
        :loading="rings.loading.value && !ringRows.length"
        :rows="sortedRings"
        row-key="rowId"
        :page-size="0"
        empty-title="沒有發佈環資料"
        :columns="[
          { key: 'ring', label: '環', width: '80px' },
          { key: 'component', label: '元件', width: '100px' },
          { key: 'targetVersion', label: '目標版本' },
          { key: 'progress', label: '進度', width: '230px' },
          { key: 'updatedAt', label: '設定', width: '150px', hideSm: true },
          { key: 'actions', label: '', width: '84px' },
        ]"
      >
        <template #cell-ring="{ row }"
          ><strong>{{ RING_SHORT[row.ring as EndpointRingTarget['ring']] }}</strong></template
        >
        <template #cell-component="{ row }">{{ RELEASE_COMPONENT_LABELS[row.component as EndpointRingTarget['component']] }}</template>
        <template #cell-targetVersion="{ row }">
          <span v-if="row.targetVersion" class="mono">{{ row.targetVersion }}</span>
          <span v-else class="faint small">不升級(維持現況)</span>
        </template>
        <template #cell-progress="{ row }">
          <div v-if="row.targetVersion" class="row small" style="--gap: 6px; flex-wrap: wrap">
            <GBadge tone="success">{{ progressText(row as EndpointRingTarget) }}</GBadge>
            <GBadge v-if="row.progress.inProgress" tone="info">進行中 {{ row.progress.inProgress }}</GBadge>
            <GBadge v-if="row.progress.failed" tone="danger">失敗 {{ row.progress.failed }}</GBadge>
            <GBadge v-if="row.progress.waiting" tone="neutral">待開始 {{ row.progress.waiting }}</GBadge>
          </div>
          <span v-else class="faint small">—</span>
        </template>
        <template #cell-updatedAt="{ row }"
          ><span v-if="row.targetSetAt" class="small nowrap" :title="`${fmtTime(row.targetSetAt)}${row.updatedBy.name ? ` · ${row.updatedBy.name}` : ''}`">{{
            fromNow(row.targetSetAt)
          }}</span
          ><span v-else class="faint small">—</span></template
        >
        <template #cell-actions="{ row }">
          <GButton v-if="canManage" size="sm" variant="ghost" @click="editing = row as EndpointRingTarget">設定</GButton>
        </template>
      </GTable>
    </GCard>

    <GCard title="版本清單" icon="package" padding="none" :subtitle="items.length ? `${items.length} 個版本` : ''">
      <template #actions>
        <div class="row" style="--gap: 8px; flex-wrap: wrap">
          <GSelect v-model="filters.component" :options="COMPONENT_OPTIONS" placeholder="全部元件" />
          <GSelect v-model="filters.status" :options="STATUS_OPTIONS" placeholder="全部狀態" />
        </div>
      </template>
      <GEmpty v-if="releases.error.value" tone="danger" icon="package" title="無法取得版本清單" :description="describeError(releases.error.value)"
        ><GButton icon="refresh" @click="releases.reload">重試</GButton></GEmpty
      >
      <GTable
        v-else
        :loading="releases.loading.value && !items.length"
        :rows="items"
        row-key="releaseId"
        :page-size="0"
        empty-title="還沒有登錄的版本"
        empty-description="簽章人員把已簽章的檔案放進版本檔目錄後,按「登錄版本」挑選;SHA-256 由主機讀檔計算"
        :columns="[
          { key: 'component', label: '元件', width: '90px' },
          { key: 'version', label: '版本', width: '130px' },
          { key: 'status', label: '狀態', width: '90px' },
          { key: 'file', label: '檔案', hideSm: true },
          { key: 'signer', label: '預期簽章者', width: '120px', hideSm: true },
          { key: 'createdAt', label: '登錄', width: '120px', hideSm: true },
          { key: 'actions', label: '', width: '150px' },
        ]"
      >
        <template #cell-component="{ row }">{{ RELEASE_COMPONENT_LABELS[row.component as EndpointRelease['component']] }}</template>
        <template #cell-version="{ row }">
          <strong class="mono">{{ row.version }}</strong>
          <div v-if="row.notes" class="faint xs" style="overflow-wrap: anywhere">{{ row.notes }}</div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="RELEASE_STATUS_TONES[row.status as EndpointRelease['status']]">{{
            RELEASE_STATUS_LABELS[row.status as EndpointRelease['status']]
          }}</GBadge></template
        >
        <template #cell-file="{ row }">
          <div class="small" style="overflow-wrap: anywhere">
            {{ row.fileName }} · {{ fmtBytes(row.sizeBytes) }}
            <div class="faint xs mono" :title="row.sha256">SHA-256 {{ row.sha256.slice(0, 16) }}…</div>
          </div>
        </template>
        <template #cell-signer="{ row }"
          ><span class="mono small" :title="row.signerThumbprints.join('\n')"
            >{{ row.signerThumbprints[0]?.slice(0, 8) }}…{{ row.signerThumbprints.length > 1 ? ` +${row.signerThumbprints.length - 1}` : '' }}</span
          ></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap" :title="`${fmtTime(row.createdAt)} · ${row.createdBy.name ?? row.createdBy.emp}`">{{
            fromNow(row.createdAt)
          }}</span></template
        >
        <template #cell-actions="{ row }">
          <div v-if="canManage" class="row" style="--gap: 4px; justify-content: flex-end">
            <GButton v-if="row.status === 'draft'" size="sm" variant="ghost" :loading="busyId === row.releaseId" @click="publish(row as EndpointRelease)"
              >發佈</GButton
            >
            <GButton v-if="row.status !== 'revoked'" size="sm" variant="ghost" :loading="busyId === row.releaseId" @click="revoke(row as EndpointRelease)"
              >撤回</GButton
            >
          </div>
        </template>
      </GTable>
    </GCard>

    <ReleaseRegister v-model:open="registering" @registered="onRegistered" />
    <RingTarget
      :ring="editing"
      :releases="allReleases.data.value?.items ?? []"
      :ready="!!allReleases.data.value && !allReleases.error.value"
      @saved="onRingSaved"
      @stale="reloadAll"
      @close="editing = null"
    />
  </div>
</template>
