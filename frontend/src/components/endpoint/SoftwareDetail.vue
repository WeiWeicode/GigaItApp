<script setup lang="ts">
/**
 * 軟體套件詳情對話框(RustIt P7;GET /api/endpoint/software/{id},endpoint.device.read):
 *   - 完整安裝 / 移除參數、偵測規則、SHA-256、預期簽章者、覆核人 —— 發佈前的第二人覆核就看這裡(P7-SOFTWARE-DESIGN §3.2)
 *   - pilot 測試機的安裝結果(qualifies = 可作為「標記測試完成」的依據)與資料範圍內已安裝的電腦
 *   - 管理動作(it.endpoint-software.manage ∧ endpoint.software.manage;主機另要求可管理所有公司的角色):
 *     修改參數、標記測試完成(簽章者必須是測試機回報的實際簽章者)、發佈(發佈人 ≠ 登錄人 ≠ 修改安裝參數的人)、撤回
 * 套件欄位來自 IT 輸入、簽章者與結果來自測試機回報,一律以文字顯示(不用 v-html)。
 */
import { computed, reactive, ref, watch } from 'vue';
import { can, EP, UI, useAuth } from '@/api/auth';
import {
  DETECT_LABELS,
  ERROR_LABELS,
  INSTALLER_LABELS,
  REBOOT_POLICY_LABELS,
  SOFTWARE_STATUS_LABELS,
  SOFTWARE_STATUS_TONES,
  softwareApi,
  softwareErrorText,
} from '@/api/endpoint';
import { fmtBytes, fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointSoftwareDetail } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const props = defineProps<{ packageId: string | null }>();
const emit = defineEmits<{ changed: []; deploy: [pkg: EndpointSoftwareDetail] }>();

const { user } = useAuth();
const me = computed(() => (user.value?.employeeNo ?? '').toUpperCase());
const canManage = computed(() => can(UI.swManage) && can(EP.softwareManage));
const canDeploy = computed(() => can(UI.swDeploy) && can(EP.commandAdmin));

const state = useAsync(() => (props.packageId ? softwareApi.get(props.packageId) : Promise.resolve(null as unknown as EndpointSoftwareDetail)), { immediate: false });
const d = computed(() => state.data.value);
watch(
  () => [open.value, props.packageId] as const,
  ([o, id]) => {
    if (o && id) {
      editing.value = false;
      void state.reload();
    }
  },
);

const who = (w: { emp: string; name: string | null } | null | undefined) => (w ? `${w.name ?? w.emp}(${w.emp})` : '—');
const isCreator = computed(() => !!d.value && d.value.createdBy.emp.toUpperCase() === me.value);

// ---------- 修改參數 ----------
const editing = ref(false);
const edit = reactive({ installArgs: '', uninstallArgs: '', detectType: 'display_name', detectValue: '', rebootPolicy: 'never', licenseLimit: '', notes: '' });
function startEdit() {
  const x = d.value;
  if (!x) return;
  Object.assign(edit, {
    installArgs: x.installArgs ?? '',
    uninstallArgs: x.uninstallArgs ?? '',
    detectType: x.detectType,
    detectValue: x.detectValue,
    rebootPolicy: x.rebootPolicy,
    licenseLimit: x.licenseLimit === null ? '' : String(x.licenseLimit),
    notes: x.notes ?? '',
  });
  editing.value = true;
}
const DETECT_OPTIONS = Object.entries(DETECT_LABELS).map(([value, label]) => ({ label, value }));
const REBOOT_OPTIONS = Object.entries(REBOOT_POLICY_LABELS).map(([value, label]) => ({ label, value }));
const busy = ref<string | null>(null);

async function run(name: string, fn: () => Promise<unknown>, done: string) {
  busy.value = name;
  try {
    await fn();
    toast.success(done);
    await state.reload();
    emit('changed');
    return true;
  } catch (e) {
    toast.error('操作失敗', softwareErrorText(e));
    await state.reload();
    emit('changed');
    return false;
  } finally {
    busy.value = null;
  }
}

async function saveEdit() {
  const x = d.value;
  if (!x) return;
  const limit = edit.licenseLimit.trim() === '' ? null : Number(edit.licenseLimit);
  if (limit !== null && !(Number.isInteger(limit) && limit >= 0)) return toast.warning('授權數請填 0 以上的整數,或留空');
  const body = {
    installArgs: edit.installArgs.trim(),
    uninstallArgs: edit.uninstallArgs.trim(),
    detectType: edit.detectType,
    detectValue: edit.detectValue.trim(),
    rebootPolicy: edit.rebootPolicy,
    licenseLimit: limit,
    notes: edit.notes.trim(),
  };
  const argsChanged =
    body.installArgs !== (x.installArgs ?? '') ||
    body.uninstallArgs !== (x.uninstallArgs ?? '') ||
    body.detectType !== x.detectType ||
    body.detectValue !== x.detectValue ||
    body.rebootPolicy !== x.rebootPolicy;
  if (argsChanged && (x.status === 'tested' || x.status === 'published')) {
    const ok = await confirm({
      title: '修改會讓套件退回草稿',
      message: '安裝 / 移除參數、偵測規則或重新開機政策變更後,套件退回「草稿」:清除測試完成與發佈紀錄,尚未送出的安裝指令取消,需重新測試並由另一位 IT 發佈。',
      confirmText: '修改並退回草稿',
      tone: 'danger',
    });
    if (!ok) return;
  }
  if (await run('edit', () => softwareApi.update(x.packageId, body), '套件已更新')) editing.value = false;
}

// ---------- 標記測試完成 ----------
const signers = ref('');
const qualifying = computed(() => (d.value?.testResults ?? []).filter((t) => t.qualifies));
const observed = computed(() => [...new Set(qualifying.value.map((t) => (t.signer ?? '').toLowerCase()).filter(Boolean))]);
watch(observed, (v) => (signers.value = v.join('\n')), { immediate: true });
const signerList = computed(() => [...new Set(signers.value.split(/[,;\s]+/).map((s) => s.replace(/[:‎‏]/g, '')).filter(Boolean))]);
const signerError = computed(() => {
  if (!signers.value.trim()) return null;
  const bad = signerList.value.find((s) => !/^[0-9a-fA-F]{40}$/.test(s));
  return bad ? `不是 40 個十六進位字元的 SHA-1 指紋:${bad.slice(0, 44)}` : signerList.value.length > 8 ? '最多 8 個' : null;
});
async function markTested() {
  const x = d.value;
  if (!x || !signerList.value.length || signerError.value) return;
  const ok = await confirm({
    title: `${x.name} ${x.version} 標記為測試完成?`,
    message: `預期簽章者:${signerList.value.join('、')}\n簽章者必須與測試機回報的實際簽章者相符;請先核對廠商憑證主體。之後由另一位 IT 發佈。`,
    confirmText: '標記測試完成',
  });
  if (ok) await run('tested', () => softwareApi.markTested(x.packageId, signerList.value), '已標記測試完成');
}

// ---------- 發佈 / 撤回 ----------
async function publish() {
  const x = d.value;
  if (!x) return;
  const ok = await confirm({
    title: `發佈 ${x.name} ${x.version}?`,
    message: `請確認畫面上的完整安裝參數、偵測規則與預期簽章者(${x.signerThumbprints.length} 個)、檔案大小與 SHA-256 都正確。發佈後可派送到所有電腦。\n發佈人不可是登錄人,也不可是上次發佈以來修改過安裝參數的人。`,
    confirmText: '發佈',
  });
  if (ok) await run('publish', () => softwareApi.publish(x.packageId), '套件已發佈');
}
async function revoke() {
  const x = d.value;
  if (!x) return;
  const ok = await confirm({
    title: `撤回 ${x.name} ${x.version}?`,
    message: '撤回後立即不能再安裝(仍可移除);尚未送出的安裝指令會取消,已送出的指令下載會被拒絕。已安裝的電腦不會自動移除。',
    confirmText: '撤回',
    tone: 'danger',
  });
  if (ok) await run('revoke', () => softwareApi.revoke(x.packageId), '套件已撤回');
}
</script>

<template>
  <GModal v-model:open="open" :title="d ? `${d.name} ${d.version}` : '軟體套件'" :subtitle="d?.packageId" icon="package" width="860px">
    <GSkeleton v-if="state.loading.value && !d" :lines="8" />
    <GEmpty v-else-if="state.error.value" tone="danger" icon="package" title="無法取得套件詳情" :description="describeError(state.error.value)"
      ><GButton icon="refresh" @click="state.reload">重試</GButton></GEmpty
    >
    <div v-else-if="d" class="stack" style="--gap: 16px">
      <div class="row wrap" style="--gap: 8px">
        <GBadge :tone="SOFTWARE_STATUS_TONES[d.status]">{{ SOFTWARE_STATUS_LABELS[d.status] }}</GBadge>
        <span class="small muted">{{ INSTALLER_LABELS[d.installerType] ?? d.installerType }} · {{ fmtBytes(d.sizeBytes) }}</span>
        <span v-if="d.status === 'published'" class="small muted">已安裝 {{ d.installedCount ?? '—' }} 台{{ d.licenseLimit !== null ? ` / 授權 ${d.licenseLimit}` : '' }}</span>
      </div>

      <!-- 覆核內容 -->
      <GCard title="覆核內容" icon="shield" padding="sm" subtitle="發佈前請逐項確認">
        <dl class="kv">
          <dt>檔案</dt>
          <dd class="mono">{{ d.fileName }}</dd>
          <dt>SHA-256</dt>
          <dd class="mono">{{ d.sha256 }}</dd>
          <dt>安裝參數</dt>
          <dd class="mono">{{ d.installArgs || '(無)' }}</dd>
          <dt>移除參數</dt>
          <dd class="mono">{{ d.uninstallArgs || '(無)' }}</dd>
          <dt>已安裝判斷</dt>
          <dd>{{ DETECT_LABELS[d.detectType] ?? d.detectType }}:<span class="mono">{{ d.detectValue }}</span></dd>
          <dt>重新開機</dt>
          <dd>{{ REBOOT_POLICY_LABELS[d.rebootPolicy] ?? d.rebootPolicy }}</dd>
          <dt>預期簽章者</dt>
          <dd>
            <template v-if="d.signerThumbprints.length"
              ><div v-for="s in d.signerThumbprints" :key="s" class="mono">{{ s }}</div></template
            >
            <span v-else class="faint">尚未設定(標記測試完成時填入)</span>
          </dd>
          <dt v-if="d.observedSigners.length">測試機回報簽章者</dt>
          <dd v-if="d.observedSigners.length">
            <div v-for="s in d.observedSigners" :key="s" class="mono">{{ s }}</div>
          </dd>
          <dt>登錄</dt>
          <dd>{{ who(d.createdBy) }} · {{ fmtTime(d.createdAt) }}</dd>
          <dt v-if="d.testedAt">測試完成</dt>
          <dd v-if="d.testedAt">{{ d.testedByEmp }} · {{ fmtTime(d.testedAt) }}</dd>
          <dt v-if="d.publishedAt">發佈</dt>
          <dd v-if="d.publishedAt">{{ who(d.publishedBy) }} · {{ fmtTime(d.publishedAt) }}</dd>
          <dt v-if="d.revokedAt">撤回</dt>
          <dd v-if="d.revokedAt">{{ d.revokedByEmp }} · {{ fmtTime(d.revokedAt) }}</dd>
          <dt v-if="d.notes">備註</dt>
          <dd v-if="d.notes" style="overflow-wrap: anywhere">{{ d.notes }}</dd>
        </dl>
      </GCard>

      <!-- 修改參數 -->
      <GCard v-if="editing" title="修改參數" icon="edit" padding="sm">
        <div class="stack" style="--gap: 12px">
          <GInput v-model="edit.installArgs" label="額外安裝參數" />
          <GInput v-model="edit.uninstallArgs" label="額外移除參數" />
          <div class="grid2">
            <GSelect v-model="edit.detectType" label="已安裝的判斷" :options="DETECT_OPTIONS" />
            <GInput v-model="edit.detectValue" label="判斷值" required />
          </div>
          <div class="grid2">
            <GSelect v-model="edit.rebootPolicy" label="重新開機" :options="REBOOT_OPTIONS" />
            <GInput v-model="edit.licenseLimit" label="授權數(留空 = 不限)" />
          </div>
          <GInput v-model="edit.notes" label="備註" />
          <div class="row" style="--gap: 8px; justify-content: flex-end">
            <GButton variant="ghost" @click="editing = false">取消</GButton>
            <GButton variant="primary" :loading="busy === 'edit'" :disabled="!edit.detectValue.trim()" @click="saveEdit">儲存</GButton>
          </div>
        </div>
      </GCard>

      <!-- 測試機結果與測試完成 -->
      <GCard title="pilot 測試機結果" icon="activity" padding="none" :subtitle="d.testResults.length ? `${d.testResults.length} 筆` : ''">
        <GTable
          :rows="d.testResults"
          row-key="commandId"
          :page-size="0"
          empty-title="還沒有測試機的安裝紀錄"
          empty-description="把電腦放進 pilot 環後,派送此草稿套件到該電腦;安裝成功並偵測通過才能標記測試完成"
          :columns="[
            { key: 'computerName', label: '測試機' },
            { key: 'state', label: '結果', width: '150px' },
            { key: 'signer', label: '回報簽章者', hideSm: true },
            { key: 'finishedAt', label: '完成', width: '100px', hideSm: true },
          ]"
        >
          <template #cell-state="{ row }">
            <GBadge :tone="row.qualifies ? 'success' : row.state === 'succeeded' ? 'warning' : row.state === 'failed' ? 'danger' : 'neutral'">{{
              row.qualifies ? '可作為依據' : row.state === 'succeeded' ? '成功(不符現行內容)' : row.state
            }}</GBadge>
            <div v-if="row.errorCode" class="faint xs">{{ ERROR_LABELS[row.errorCode] ?? row.errorCode }}</div>
          </template>
          <template #cell-signer="{ row }"
            ><span class="mono xs" style="overflow-wrap: anywhere">{{ row.signer ?? '—' }}</span
            ><div v-if="row.signerSubject" class="faint xs">{{ row.signerSubject }}</div></template
          >
          <template #cell-finishedAt="{ row }"
            ><span class="small nowrap" :title="fmtTime(row.finishedAt)">{{ row.finishedAt ? fromNow(row.finishedAt) : '—' }}</span></template
          >
        </GTable>
        <div v-if="canManage && d.status === 'draft'" class="stack" style="--gap: 8px; padding: 12px">
          <GTextarea
            v-model="signers"
            label="預期簽章者(SHA-1 指紋)"
            :rows="2"
            :error="signerError"
            :placeholder="observed.length ? '' : '需要先有測試機成功的紀錄'"
          />
          <div class="row" style="justify-content: flex-end">
            <GButton variant="primary" icon="check" :loading="busy === 'tested'" :disabled="!observed.length || !signerList.length || !!signerError" @click="markTested"
              >標記測試完成</GButton
            >
          </div>
        </div>
      </GCard>

      <GCard v-if="d.status === 'published' || d.installedDevices.length" title="已安裝的電腦" icon="monitor" padding="none" :subtitle="`${d.installedDevices.length} 台(資料範圍內,最多 200)`">
        <GTable
          :rows="d.installedDevices"
          row-key="deviceId"
          :page-size="8"
          empty-title="沒有電腦安裝此軟體"
          :columns="[
            { key: 'computerName', label: '電腦' },
            { key: 'name', label: '登錄名稱', hideSm: true },
            { key: 'version', label: '版本', width: '110px' },
          ]"
        >
          <template #cell-version="{ row }"
            ><span class="mono small">{{ row.version ?? '—' }}</span></template
          >
        </GTable>
      </GCard>
    </div>
    <template #footer>
      <p v-if="d && canManage && d.status === 'tested' && isCreator" class="small muted" style="margin: 0 auto 0 0">登錄人不能發佈,請另一位 IT 發佈。</p>
      <GButton v-if="d && canDeploy && d.status !== 'revoked'" icon="send" @click="emit('deploy', d)">派送…</GButton>
      <GButton v-if="d && canManage && d.status !== 'revoked'" icon="edit" :disabled="editing" @click="startEdit">修改</GButton>
      <GButton v-if="d && canManage && d.status === 'tested'" variant="primary" icon="rocket" :loading="busy === 'publish'" :disabled="isCreator" @click="publish">發佈</GButton>
      <GButton v-if="d && canManage && d.status !== 'revoked'" variant="danger" :loading="busy === 'revoke'" @click="revoke">撤回</GButton>
      <GButton @click="open = false">關閉</GButton>
    </template>
  </GModal>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 120px 1fr;
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
  overflow-wrap: anywhere;
}
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
  .kv {
    grid-template-columns: 1fr;
  }
}
</style>
