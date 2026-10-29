<script setup lang="ts">
/**
 * 端點管理 › 上傳與簽章(RustIt S1-4;S1-SIGNING-DESIGN §4、§5):
 *   上傳 / 登錄上傳區的安裝檔 → 另一位 IT 核可送簽 → 簽章工作站以公司憑證重簽 → 主機重算雜湊確認(signed)→ 到「軟體派送」登錄套件
 * 權限:Tab it.endpoint-software.upload ∧ BFF endpoint.software.manage(主機另要求可管理所有公司的角色)。
 *   核可:上傳者本人的核可按鈕停用(主機也會擋 ITA_UPLOAD_SAME_PERSON);駁回:待核可 / 送簽中。
 * 原廠簽章者、操作人等是簽章工作站回報、主機未驗證的欄位,畫面標「工作站回報(未驗證)」;備註、駁回原因一律以文字顯示(不用 v-html)。
 */
import { computed, ref, shallowRef, watch } from 'vue';
import { can, EP, UI, useAuth } from '@/api/auth';
import { softwareErrorText, UPLOAD_REJECT_LABELS, UPLOAD_STATE_LABELS, UPLOAD_STATE_TONES, uploadApi } from '@/api/endpoint';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointUpload, EndpointUploadState } from '@/api/types';
import UploadInstaller from '@/components/endpoint/UploadInstaller.vue';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const canManage = computed(() => can(UI.swUpload) && can(EP.softwareManage));
const { user } = useAuth();
const me = computed(() => (user.value?.employeeNo ?? '').toUpperCase());
const isMine = (u: EndpointUpload) => u.uploadedBy.emp.toUpperCase() === me.value;

const STATE_OPTIONS = [{ label: '全部', value: '' }, ...Object.entries(UPLOAD_STATE_LABELS).map(([value, label]) => ({ label, value }))];
const state = ref('');
const list = useAsync(() => uploadApi.list((state.value || undefined) as EndpointUploadState | undefined));
watch(state, () => void list.reload());
const items = computed(() => list.data.value?.items ?? []);

const who = (w: { emp: string; name: string | null } | null | undefined) => (w ? `${w.name ?? w.emp}(${w.emp})` : '—');
const rejectLabel = (code: string | null) => (code ? (UPLOAD_REJECT_LABELS[code] ?? code) : '');

const uploading = ref(false);
function onUploaded() {
  uploading.value = false;
  state.value = '';
  void list.reload();
}

const busyId = ref<string | null>(null);
async function act(u: EndpointUpload, fn: () => Promise<unknown>, done: string): Promise<boolean> {
  busyId.value = u.uploadId;
  try {
    await fn();
    toast.success(done, u.fileName);
    void list.reload();
    if (viewing.value?.uploadId === u.uploadId) viewing.value = await uploadApi.get(u.uploadId).catch(() => null);
    return true;
  } catch (e) {
    toast.error('操作失敗', softwareErrorText(e));
    void list.reload();
    return false;
  } finally {
    busyId.value = null;
  }
}

async function approve(u: EndpointUpload) {
  const ok = await confirm({
    title: `核可送簽 ${u.fileName}?`,
    message: `上傳者:${who(u.uploadedBy)}\n大小:${fmtBytes(u.sizeBytes)}\nSHA-256:${u.sha256}\n\n核可後送簽章工作站以公司軟體發佈憑證重簽。請先確認安裝檔來自原廠官方來源、版本正確;核可前主機會重算雜湊,檔案被換過就自動駁回。`,
    confirmText: '核可送簽',
  });
  if (ok) await act(u, () => uploadApi.approve(u.uploadId), '已核可,等待簽章工作站');
}

const rejecting = shallowRef<EndpointUpload | null>(null);
const rejectOpen = ref(false);
const reason = ref('');
function openReject(u: EndpointUpload) {
  rejecting.value = u;
  reason.value = '';
  rejectOpen.value = true;
}
async function reject() {
  const u = rejecting.value;
  if (!u || !reason.value.trim()) return;
  if (await act(u, () => uploadApi.reject(u.uploadId, reason.value.trim()), '已駁回')) rejectOpen.value = false;
}

const viewing = shallowRef<EndpointUpload | null>(null);
const viewOpen = ref(false);
function openView(u: EndpointUpload) {
  viewing.value = u;
  viewOpen.value = true;
}
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="list.reload">重新整理</GButton>
      <GButton v-if="canManage" variant="primary" icon="upload" title="需要可管理所有公司的角色" @click="uploading = true">上傳安裝檔</GButton>
    </Teleport>

    <GCard title="上傳與簽章" icon="shield" padding="none" :subtitle="items.length ? `${items.length} 筆(最多 500)` : ''">
      <template #actions>
        <GSegmented v-model="state" :options="STATE_OPTIONS" size="sm" />
      </template>
      <GEmpty v-if="list.error.value" tone="danger" icon="shield" title="無法取得上傳紀錄" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
      <GTable
        v-else
        :loading="list.loading.value && !items.length"
        :rows="items"
        row-key="uploadId"
        :page-size="20"
        clickable
        empty-title="沒有上傳紀錄"
        empty-description="按「上傳安裝檔」上傳原廠安裝檔;另一位 IT 核可後送簽,簽好的檔案會出現在「軟體派送」的登錄清單"
        :columns="[
          { key: 'file', label: '安裝檔' },
          { key: 'state', label: '狀態', width: '130px' },
          { key: 'uploaded', label: '上傳', width: '150px', hideSm: true },
          { key: 'approved', label: '核可', width: '150px', hideSm: true },
          { key: 'actions', label: '', width: '150px' },
        ]"
        @row-click="openView"
      >
        <template #cell-file="{ row }">
          <div class="mono small" style="overflow-wrap: anywhere">{{ row.fileName }}</div>
          <div class="faint xs">
            {{ fmtBytes(row.sizeBytes) }} · <span class="mono" :title="row.sha256">SHA-256 {{ row.sha256.slice(0, 16) }}…</span
            >{{ row.source === 'incoming' ? ' · 上傳區登錄' : '' }}
          </div>
        </template>
        <template #cell-state="{ row }">
          <GBadge :tone="UPLOAD_STATE_TONES[row.state as EndpointUploadState]">{{ UPLOAD_STATE_LABELS[row.state as EndpointUploadState] }}</GBadge>
          <div v-if="row.rejectCode" class="faint xs">{{ rejectLabel(row.rejectCode) }}</div>
        </template>
        <template #cell-uploaded="{ row }">
          <div class="small">{{ row.uploadedBy.name ?? row.uploadedBy.emp }}</div>
          <div class="faint xs nowrap" :title="fmtTime(row.uploadedAt)">{{ fromNow(row.uploadedAt) }}</div>
        </template>
        <template #cell-approved="{ row }">
          <template v-if="row.approvedBy">
            <div class="small">{{ row.approvedBy.name ?? row.approvedBy.emp }}</div>
            <div class="faint xs nowrap" :title="fmtTime(row.approvedAt)">{{ fromNow(row.approvedAt) }}</div>
          </template>
          <span v-else class="faint small">—</span>
        </template>
        <template #cell-actions="{ row }">
          <div v-if="canManage" class="row" style="--gap: 4px; justify-content: flex-end">
            <GButton
              v-if="row.state === 'uploaded'"
              size="sm"
              variant="primary"
              :disabled="isMine(row) || busyId === row.uploadId"
              :title="isMine(row) ? '上傳者不能核可自己的上傳,請另一位 IT 核可' : '核可送簽'"
              @click.stop="approve(row)"
              >核可</GButton
            >
            <GButton
              v-if="row.state === 'uploaded' || row.state === 'queued'"
              size="sm"
              variant="ghost"
              :disabled="busyId === row.uploadId"
              @click.stop="openReject(row)"
              >駁回</GButton
            >
          </div>
        </template>
      </GTable>
    </GCard>

    <UploadInstaller v-model:open="uploading" @uploaded="onUploaded" />

    <GModal v-model:open="rejectOpen" title="駁回上傳" :subtitle="rejecting?.fileName" icon="x" width="480px">
      <div class="stack" style="--gap: 10px">
        <GTextarea v-model="reason" label="原因" required :rows="3" :error="reason.length > 500 ? '最多 500 字' : null" />
        <p class="faint xs" style="margin: 0">送簽中的紀錄駁回後會移除送簽工作單;已在簽章中的檔案,工作站確認狀態時會停止。</p>
      </div>
      <template #footer>
        <GButton variant="ghost" @click="rejectOpen = false">取消</GButton>
        <GButton variant="danger" :loading="busyId === rejecting?.uploadId" :disabled="!reason.trim() || reason.length > 500" @click="reject">駁回</GButton>
      </template>
    </GModal>

    <GModal v-model:open="viewOpen" title="上傳紀錄" :subtitle="viewing?.fileName" icon="shield" width="720px">
      <dl v-if="viewing" class="kv">
        <dt>狀態</dt>
        <dd>
          <GBadge :tone="UPLOAD_STATE_TONES[viewing.state]">{{ UPLOAD_STATE_LABELS[viewing.state] }}</GBadge>
          <span v-if="viewing.state === 'signed'" class="faint small"> 已放進軟體庫,到「軟體派送」登錄套件</span>
        </dd>
        <dt>安裝檔</dt>
        <dd class="mono" style="overflow-wrap: anywhere">{{ viewing.fileName }}</dd>
        <dt>大小</dt>
        <dd>{{ fmtBytes(viewing.sizeBytes) }}({{ viewing.sizeBytes.toLocaleString() }} bytes)</dd>
        <dt>原始檔 SHA-256</dt>
        <dd class="mono" style="overflow-wrap: anywhere">{{ viewing.sha256 }}</dd>
        <dt>來源</dt>
        <dd>{{ viewing.source === 'incoming' ? '上傳區(網路芳鄰)登錄' : '網頁上傳' }}</dd>
        <dt>上傳</dt>
        <dd>{{ who(viewing.uploadedBy) }} · {{ fmtTime(viewing.uploadedAt) }}</dd>
        <dt>核可</dt>
        <dd>{{ viewing.approvedBy ? `${who(viewing.approvedBy)} · ${fmtTime(viewing.approvedAt)}` : '—' }}</dd>
        <template v-if="viewing.notes">
          <dt>備註</dt>
          <dd style="white-space: pre-wrap; overflow-wrap: anywhere">{{ viewing.notes }}</dd>
        </template>
        <template v-if="viewing.state === 'rejected'">
          <dt>駁回</dt>
          <dd>
            {{ rejectLabel(viewing.rejectCode) }}{{ viewing.rejectedByEmp ? ` · ${viewing.rejectedByEmp}` : ' · 系統 / 簽章工作站' }} ·
            {{ fmtTime(viewing.rejectedAt) }}
            <div v-if="viewing.rejectReason" class="small" style="white-space: pre-wrap; overflow-wrap: anywhere">{{ viewing.rejectReason }}</div>
          </dd>
        </template>
        <template v-if="viewing.signedSha256">
          <dt>簽章後 SHA-256</dt>
          <dd class="mono" style="overflow-wrap: anywhere">{{ viewing.signedSha256 }}<span class="faint xs">(主機以軟體庫檔案重算確認)</span></dd>
        </template>
      </dl>
      <template v-if="viewing && (viewing.vendorSigner || viewing.vendorSignerSubject || viewing.signedSigner || viewing.signOperator)">
        <h4 class="small" style="margin: 16px 0 6px">工作站回報(未驗證)</h4>
        <p class="faint xs" style="margin: 0 0 8px">
          以下由簽章工作站寫入結果檔,主機只做顯示;實際簽章者以 pilot 測試機回報為準(登錄後「標記測試完成」時核對)。
        </p>
        <dl class="kv">
          <dt>原廠簽章者</dt>
          <dd style="overflow-wrap: anywhere">
            {{ viewing.vendorSignerSubject ?? '(未簽章)' }}
            <div v-if="viewing.vendorSigner" class="mono faint xs">{{ viewing.vendorSigner }}</div>
          </dd>
          <dt>原廠確認方式</dt>
          <dd>{{ viewing.vendorCheck === 'allowlist' ? '白名單' : viewing.vendorCheck === 'manual' ? '簽章人員人工確認' : (viewing.vendorCheck ?? '—') }}</dd>
          <dt>重簽憑證</dt>
          <dd class="mono" style="overflow-wrap: anywhere">{{ viewing.signedSigner ?? '—' }}</dd>
          <dt>操作人</dt>
          <dd>{{ viewing.signOperator ?? '—' }}</dd>
          <dt>簽章時間</dt>
          <dd>{{ viewing.signedAt ? fmtTime(viewing.signedAt) : '—' }}</dd>
        </dl>
      </template>
      <template #footer>
        <template v-if="viewing && canManage">
          <GButton
            v-if="viewing.state === 'uploaded'"
            variant="primary"
            :disabled="isMine(viewing) || busyId === viewing.uploadId"
            :title="isMine(viewing) ? '上傳者不能核可自己的上傳' : ''"
            @click="approve(viewing)"
            >核可送簽</GButton
          >
          <GButton v-if="viewing.state === 'uploaded' || viewing.state === 'queued'" variant="ghost" @click="openReject(viewing)">駁回</GButton>
        </template>
        <GButton variant="ghost" @click="viewOpen = false">關閉</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 130px 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: 13px;
}
.kv dt {
  color: var(--text-faint, inherit);
  opacity: 0.7;
}
.kv dd {
  margin: 0;
  min-width: 0;
}
@media (max-width: 560px) {
  .kv {
    grid-template-columns: 1fr;
  }
}
</style>
