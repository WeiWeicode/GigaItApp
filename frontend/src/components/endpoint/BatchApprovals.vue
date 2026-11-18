<script setup lang="ts">
/**
 * 待核可批次(RustIt P7;P7-SOFTWARE-DESIGN §6 第二人核可;GET /api/endpoint/batches?state=pending_approval,endpoint.device.read):
 *   批次 > 20 台、或同一人 24 小時內累計超過 20 台的 admin 指令不會立刻送出,需建立人以外的 IT 核可;24 小時沒人核可自動取消。
 *   - 軟體派送批次(software.install / uninstall):POST /batches/{id}/approve、/reject —— it.endpoint-software.approve ∧ endpoint.software.manage
 *   - 其他批次(system.reboot):POST /batches/{id}/approve-command、/reject-command —— it.endpoint-device.reboot ∧ endpoint.command.admin
 *   核可人不得是建立人(建立人只能駁回自己的批次,等於撤回);核可人的資料範圍需涵蓋批次全部電腦,否則主機回 404。
 *   「檢視」列出批次的參數與各台電腦,核可前確認。批次參數與電腦名稱以文字顯示。
 * 兩處使用(ENDPOINT-MENU-PLAN §2.2 M2):「軟體目錄與派送」上方的卡片(前 50 筆),與「電腦管理 › 待核可」Tab(page:
 *   nextCursor「載入更多」、建立時間 / 有效期限分欄、點列看明細、說明建立人不能核可)。核可規則與權限兩處相同。
 */
import { computed, reactive, ref, shallowRef, watch } from 'vue';
import { can, EP, UI, useAuth } from '@/api/auth';
import { batchApi, BATCH_STATE_LABELS, BATCH_STATE_TONES, endpointApi, isSoftwareBatchKind, KIND_LABELS, paramText, softwareApi, softwareErrorText } from '@/api/endpoint';
import { fmtTime, untilText } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointBatch, EndpointCommand, EndpointCommandKind } from '@/api/types';
import { confirm, toast } from '@/ui';

const props = defineProps<{ page?: boolean }>();
const emit = defineEmits<{ changed: [] }>();
const { user } = useAuth();
const me = computed(() => (user.value?.employeeNo ?? '').toUpperCase());

// 待核可清單(後端分頁:nextCursor;卡片模式只取第一頁)
const items = shallowRef<EndpointBatch[]>([]);
const cursor = ref<string | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);
let seq = 0;
async function load(more = false) {
  const my = ++seq;
  loading.value = true;
  error.value = null;
  try {
    const page = await batchApi.list({ state: 'pending_approval', limit: 50, cursor: more ? (cursor.value ?? undefined) : undefined });
    if (my !== seq) return;
    items.value = more ? [...items.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
  } catch (e) {
    if (my !== seq) return;
    // 載入更多失敗:保留已載入的資料,只提示
    if (more) toast.fromError(e, '無法載入更多批次');
    else error.value = e;
  } finally {
    if (my === seq) loading.value = false;
  }
}
const reload = () => load();
void load();
defineExpose({ reload });

// 卡片模式維持原欄位;待核可 Tab 另列建立時間(key created)。注意 key createdAt 這欄顯示的是有效期限(沿用原欄位 key)
const columns = computed(() => [
  { key: 'kind', label: '指令', width: '120px' },
  { key: 'summary', label: '內容' },
  { key: 'targetCount', label: '台數', width: '70px' },
  { key: 'createdBy', label: '建立人', width: '150px', hideSm: true },
  ...(props.page ? [{ key: 'created', label: '建立時間', width: '150px', hideSm: true }] : []),
  { key: 'createdAt', label: props.page ? '有效期限' : '期限', width: '120px', hideSm: true },
  { key: 'actions', label: '', width: '230px' },
]);

const canApprove = (b: EndpointBatch) =>
  isSoftwareBatchKind(b.kind) ? can(UI.swApprove) && can(EP.softwareManage) : can(UI.devReboot) && can(EP.commandAdmin);
const isMine = (b: EndpointBatch) => b.createdBy.emp.toUpperCase() === me.value;
const kindLabel = (k: string) => KIND_LABELS[k as EndpointCommandKind] ?? k;
const who = (w: { emp: string; name: string | null }) => `${w.name ?? w.emp}(${w.emp})`;

/** 批次摘要:軟體批次顯示套件(名稱版本,沒有就查目錄);其他列出參數 */
const pkgNames = reactive(new Map<string, string>());
const str = (v: unknown) => (typeof v === 'string' ? v : '');
async function loadNames(bs: EndpointBatch[]) {
  for (const b of bs) {
    const id = (str(b.params.package_id) || str(b.params.packageId)).toLowerCase();
    if (!id || pkgNames.has(id) || str(b.params.name)) continue;
    try {
      const p = await softwareApi.get(id);
      pkgNames.set(id, `${p.name} ${p.version}`);
    } catch {
      pkgNames.set(id, id);
    }
  }
}
const summary = (b: EndpointBatch) => {
  if (isSoftwareBatchKind(b.kind)) {
    const id = (str(b.params.package_id) || str(b.params.packageId)).toLowerCase();
    return str(b.params.name) ? `${str(b.params.name)} ${str(b.params.version)}` : (pkgNames.get(id) ?? id);
  }
  const p = Object.entries(b.params).map(([k, v]) => `${k} = ${paramText(v)}`);
  return p.join(',') || '—';
};
watch(items, (bs) => void loadNames(bs), { immediate: true });

// ---------- 核可 / 駁回 ----------
const busyId = ref<string | null>(null);
async function approve(b: EndpointBatch) {
  const ok = await confirm({
    title: `核可「${kindLabel(b.kind)}」批次?`,
    message: `${summary(b)} · ${b.targetCount} 台(同時 ${b.maxConcurrent} 台),建立人 ${who(b.createdBy)}。核可後立即開始送出。請先按「檢視」確認目標電腦與參數。`,
    confirmText: '核可並送出',
  });
  if (!ok) return;
  await act(b, () => batchApi.approve(b), '批次已核可,開始送出');
}
const rejecting = shallowRef<EndpointBatch | null>(null);
const rejectOpen = ref(false);
const reason = ref('');
function startReject(b: EndpointBatch) {
  rejecting.value = b;
  reason.value = '';
  rejectOpen.value = true;
}
async function reject() {
  const b = rejecting.value;
  if (!b || !reason.value.trim()) return;
  if (await act(b, () => batchApi.reject(b, reason.value.trim()), '批次已駁回,指令全部取消')) rejectOpen.value = false;
}
async function act(b: EndpointBatch, fn: () => Promise<unknown>, done: string) {
  busyId.value = b.batchId;
  try {
    await fn();
    toast.success(done);
    return true;
  } catch (e) {
    // 核可人是建立人(403)、已被別人處理或逾期(409)、批次含範圍外電腦(404):提示後重新整理
    toast.error('操作失敗', softwareErrorText(e));
    return false;
  } finally {
    busyId.value = null;
    await reload();
    emit('changed');
  }
}

// ---------- 檢視 ----------
const viewing = shallowRef<EndpointBatch | null>(null);
const viewOpen = ref(false);
const cmds = shallowRef<EndpointCommand[]>([]);
const cmdsLoading = ref(false);
const cmdsError = ref<unknown>(null);
const cmdsMore = ref(false);
async function view(b: EndpointBatch) {
  viewing.value = b;
  viewOpen.value = true;
  cmds.value = [];
  cmdsError.value = null;
  cmdsLoading.value = true;
  try {
    const page = await endpointApi.list({ batchId: b.batchId, limit: 100 });
    cmds.value = page.items;
    cmdsMore.value = !!page.nextCursor;
  } catch (e) {
    cmdsError.value = e;
  } finally {
    cmdsLoading.value = false;
  }
}
</script>

<template>
  <GCard title="待核可批次" icon="check-check" padding="none" :subtitle="items.length ? `${items.length} 個等待另一位 IT 核可` : '超過 20 台的派送需要第二人核可'">
    <template #actions>
      <GButton size="sm" variant="ghost" icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </template>
    <GEmpty v-if="error" tone="danger" icon="check-check" title="無法取得待核可批次" :description="describeError(error)"
      ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
    >
    <template v-else>
      <GTable
        :loading="loading && !items.length"
        :rows="items"
        row-key="batchId"
        :page-size="0"
        empty-title="沒有待核可的批次"
        :clickable="props.page"
        :columns="columns"
        @row-click="props.page && view($event as EndpointBatch)"
      >
        <template #cell-kind="{ row }">{{ kindLabel(row.kind) }}</template>
        <template #cell-created="{ row }"
          ><span class="small nowrap">{{ fmtTime(row.createdAt) }}</span></template
        >
        <template #cell-summary="{ row }"
          ><span class="small" style="overflow-wrap: anywhere">{{ summary(row as EndpointBatch) }}</span></template
        >
        <template #cell-createdBy="{ row }"
          ><span class="small">{{ who(row.createdBy) }}</span
          ><GBadge v-if="isMine(row as EndpointBatch)" tone="neutral">我建立的</GBadge></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap" :title="`建立 ${fmtTime(row.createdAt)}`">{{
            untilText(row.approvalExpiresAt)
          }}</span></template
        >
        <template #cell-actions="{ row }">
          <div class="row" style="--gap: 4px; justify-content: flex-end">
            <GButton size="sm" variant="ghost" @click.stop="view(row as EndpointBatch)">檢視</GButton>
            <GButton
              v-if="canApprove(row as EndpointBatch)"
              size="sm"
              variant="primary"
              :loading="busyId === row.batchId"
              :disabled="isMine(row as EndpointBatch)"
              :title="isMine(row as EndpointBatch) ? '核可人不可是建立人,請另一位 IT 核可' : ''"
              @click.stop="approve(row as EndpointBatch)"
              >核可</GButton
            >
            <GButton
              v-if="canApprove(row as EndpointBatch)"
              size="sm"
              variant="ghost"
              :loading="busyId === row.batchId"
              :title="isMine(row as EndpointBatch) ? '撤回自己建立的批次' : ''"
              @click.stop="startReject(row as EndpointBatch)"
              >{{ isMine(row as EndpointBatch) ? '撤回' : '駁回' }}</GButton
            >
          </div>
        </template>
      </GTable>
      <div v-if="props.page && cursor" class="row" style="justify-content: center; padding: 8px">
        <GButton size="sm" variant="ghost" :loading="loading" @click="load(true)">載入更多</GButton>
      </div>
      <p v-if="props.page" class="small faint note">
        核可人不可是建立人:自己建立的批次「核可」會停用,只能撤回,請另一位 IT
        核可。軟體批次需「核可軟體派送批次」權限,重新開機等其他批次需「重新開機與核可重開機批次」權限;24 小時內沒人核可自動取消。
      </p>
    </template>
  </GCard>

  <GModal v-model:open="rejectOpen" :title="rejecting && isMine(rejecting) ? '撤回批次' : '駁回批次'" :subtitle="rejecting ? kindLabel(rejecting.kind) : ''" icon="x" width="480px">
    <div class="stack" style="--gap: 12px">
      <GTextarea v-model="reason" label="原因" required :rows="3" />
      <p class="small muted" style="margin: 0">批次內尚未送出的指令全部取消(最多 500 字,不可含控制字元)。</p>
    </div>
    <template #footer>
      <GButton variant="ghost" @click="rejectOpen = false">取消</GButton>
      <GButton variant="danger" :loading="busyId === rejecting?.batchId" :disabled="!reason.trim() || reason.length > 500" @click="reject">確認</GButton>
    </template>
  </GModal>

  <GModal v-model:open="viewOpen" :title="viewing ? kindLabel(viewing.kind) : ''" :subtitle="viewing?.batchId" icon="list" width="760px">
    <div v-if="viewing" class="stack" style="--gap: 12px">
      <div class="row wrap" style="--gap: 8px">
        <GBadge :tone="BATCH_STATE_TONES[viewing.state]">{{ BATCH_STATE_LABELS[viewing.state] }}</GBadge>
        <span class="small">{{ summary(viewing) }}</span>
        <span class="faint small"
          >· {{ viewing.targetCount }} 台,同時 {{ viewing.maxConcurrent }} 台 · 建立人 {{ who(viewing.createdBy) }} · {{ fmtTime(viewing.createdAt)
          }}{{ viewing.approvalExpiresAt ? ` · 核可期限 ${fmtTime(viewing.approvalExpiresAt)}` : '' }}</span
        >
      </div>
      <pre class="small mono params">{{ JSON.stringify(viewing.params, null, 2) }}</pre>
      <GEmpty v-if="cmdsError" tone="danger" icon="monitor" title="無法取得目標電腦" :description="describeError(cmdsError)" />
      <GTable
        v-else
        :loading="cmdsLoading"
        :rows="cmds"
        row-key="commandId"
        :page-size="10"
        empty-title="沒有指令"
        :columns="[
          { key: 'computerName', label: '目標電腦' },
          { key: 'state', label: '狀態', width: '100px' },
        ]"
      />
      <p v-if="cmdsMore" class="faint xs" style="margin: 0">只列前 100 台。</p>
    </div>
    <template #footer>
      <GButton @click="viewOpen = false">關閉</GButton>
    </template>
  </GModal>
</template>

<style scoped>
.note {
  margin: 0;
  padding: 10px 16px 14px;
}
.params {
  margin: 0;
  max-height: 160px;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>
