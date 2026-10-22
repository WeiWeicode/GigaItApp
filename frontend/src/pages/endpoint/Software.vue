<script setup lang="ts">
/**
 * 端點管理 › 軟體派送(RustIt P7;P7-SOFTWARE-DESIGN §3):
 *   - 待核可批次(> 20 台的派送、重新開機批次需第二人核可)
 *   - 軟體目錄:清單(狀態、名稱篩選)、登錄(從軟體庫挑安裝檔)、詳情(覆核內容、測試機結果、已安裝電腦、修改 / 測試完成 / 發佈 / 撤回)、派送(單台 / 多台,安裝 / 移除)
 * 權限:Tab it.endpoint-software.list ∧ BFF endpoint.device.read;登錄等管理按鈕 it.endpoint-software.manage ∧ endpoint.software.manage
 *   (主機另要求可管理所有公司的角色);派送 it.endpoint-software.deploy ∧ endpoint.command.admin。名稱、版本、備註等一律以文字顯示。
 */
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { INSTALLER_LABELS, SOFTWARE_STATUS_LABELS, SOFTWARE_STATUS_TONES, softwareApi } from '@/api/endpoint';
import { fmtBytes, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointSoftware, EndpointSoftwareStatus } from '@/api/types';
import BatchApprovals from '@/components/endpoint/BatchApprovals.vue';
import SoftwareDeploy from '@/components/endpoint/SoftwareDeploy.vue';
import SoftwareDetail from '@/components/endpoint/SoftwareDetail.vue';
import SoftwareRegister from '@/components/endpoint/SoftwareRegister.vue';
import { useAsync } from '@/composables/useAsync';

const canManage = computed(() => can(UI.swManage) && can(EP.softwareManage));
const canDeploy = computed(() => can(UI.swDeploy) && can(EP.commandAdmin));

const filters = reactive<{ status: '' | EndpointSoftwareStatus; q: string }>({ status: '', q: '' });
const STATUS_OPTIONS = Object.entries(SOFTWARE_STATUS_LABELS).map(([value, label]) => ({ label, value }));

const list = useAsync(() => softwareApi.list({ status: filters.status || undefined, q: filters.q.trim() || undefined }));
let timer: ReturnType<typeof setTimeout> | undefined;
watch(filters, () => {
  clearTimeout(timer);
  timer = setTimeout(() => void list.reload(), 300);
});
const items = computed(() => list.data.value?.items ?? []);

const approvals = ref<InstanceType<typeof BatchApprovals> | null>(null);
function reloadAll() {
  void list.reload();
  void approvals.value?.reload();
}

const registering = ref(false);
function onRegistered() {
  registering.value = false;
  void list.reload();
}

const detailId = ref<string | null>(null);
const detailOpen = ref(false);
function openDetail(p: EndpointSoftware) {
  detailId.value = p.packageId;
  detailOpen.value = true;
}

const deployPkg = shallowRef<EndpointSoftware | null>(null);
const deployOpen = ref(false);
function openDeploy(p: EndpointSoftware | null) {
  deployPkg.value = p;
  deployOpen.value = true;
}
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="reloadAll">重新整理</GButton>
      <GButton v-if="canDeploy" icon="send" @click="openDeploy(null)">派送軟體</GButton>
      <GButton v-if="canManage" variant="primary" icon="plus" title="需要可管理所有公司的角色(軟體目錄是全公司共用)" @click="registering = true">登錄套件</GButton>
    </Teleport>

    <BatchApprovals ref="approvals" @changed="list.reload" />

    <GCard title="軟體目錄" icon="package" padding="none" :subtitle="items.length ? `${items.length} 個套件` : ''">
      <template #actions>
        <div class="row" style="--gap: 8px; flex-wrap: wrap">
          <GInput v-model="filters.q" icon="search" placeholder="軟體名稱" clearable />
          <GSelect v-model="filters.status" :options="STATUS_OPTIONS" placeholder="全部狀態" />
        </div>
      </template>
      <GEmpty v-if="list.error.value" tone="danger" icon="package" title="無法取得軟體目錄" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
      <GTable
        v-else
        :loading="list.loading.value && !items.length"
        :rows="items"
        row-key="packageId"
        :page-size="0"
        clickable
        empty-title="還沒有登錄的軟體"
        empty-description="IT 把測過的安裝檔放進軟體庫後,按「登錄套件」挑選;登錄後先在 pilot 測試機驗證,再由另一位 IT 發佈"
        :columns="[
          { key: 'name', label: '軟體' },
          { key: 'status', label: '狀態', width: '100px' },
          { key: 'file', label: '安裝檔', hideSm: true },
          { key: 'installedCount', label: '已安裝', width: '90px', hideSm: true },
          { key: 'createdAt', label: '登錄', width: '120px', hideSm: true },
        ]"
        @row-click="openDetail"
      >
        <template #cell-name="{ row }">
          <strong>{{ row.name }}</strong> <span class="mono small">{{ row.version }}</span>
          <div v-if="row.notes" class="faint xs" style="overflow-wrap: anywhere">{{ row.notes }}</div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="SOFTWARE_STATUS_TONES[row.status as EndpointSoftware['status']]">{{
            SOFTWARE_STATUS_LABELS[row.status as EndpointSoftware['status']]
          }}</GBadge></template
        >
        <template #cell-file="{ row }">
          <div class="small" style="overflow-wrap: anywhere">
            {{ INSTALLER_LABELS[row.installerType as string]?.split('(')[0] ?? row.installerType }} · {{ fmtBytes(row.sizeBytes) }}
            <div class="faint xs mono" :title="row.sha256">SHA-256 {{ row.sha256.slice(0, 16) }}…</div>
          </div>
        </template>
        <template #cell-installedCount="{ row }"
          ><span class="small">{{ row.status === 'published' ? (row.installedCount ?? '—') : '—' }}{{ row.licenseLimit !== null ? ` / ${row.licenseLimit}` : '' }}</span></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap" :title="row.createdBy.name ?? row.createdBy.emp">{{ fromNow(row.createdAt) }}</span></template
        >
      </GTable>
    </GCard>

    <SoftwareRegister v-model:open="registering" @registered="onRegistered" />
    <SoftwareDetail
      v-model:open="detailOpen"
      :package-id="detailId"
      @changed="list.reload"
      @deploy="
        (p) => {
          detailOpen = false;
          openDeploy(p);
        }
      "
    />
    <SoftwareDeploy v-model:open="deployOpen" :pkg="deployPkg" @deployed="reloadAll" />
  </div>
</template>
