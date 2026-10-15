<script setup lang="ts">
/**
 * 電腦詳情「指令」Tab(RustIt P4-3;指令類型 RustIt docs/contracts/command-kinds.md):
 *   - 指令按鈕:需要按鈕權限 it.endpoint-device.command 與 BFF endpoint.command.basic;停用的電腦不顯示
 *   - 下指令後每 2 秒查詢狀態直到結束;離線電腦排隊,連線後送出(預設 1 小時內有效)
 *   - 這台電腦的指令紀錄(新到舊,「載入更多」);點列看結果、下載日誌;自己建立且仍在排隊的可取消
 */
import { computed, onBeforeUnmount, reactive, ref, shallowRef } from 'vue';
import { can, EP, UI, useAuth } from '@/api/auth';
import { endpointApi, isFinal, KIND_LABELS, STATE_LABELS, STATE_TONES } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointCommand, EndpointCommandKind } from '@/api/types';
import CommandResult from '@/components/endpoint/CommandResult.vue';
import { confirm, toast } from '@/ui';

const props = defineProps<{ deviceId: string; computerName: string; online: boolean; active: boolean }>();
const { user } = useAuth();
const me = computed(() => user.value?.employeeNo ?? '');
const canCommand = computed(() => props.active && can(UI.devCommand) && can(EP.commandBasic));

// ---------- 目前執行中的指令(每 2 秒輪詢) ----------
const current = shallowRef<EndpointCommand | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));

async function track(id: string) {
  clearTimeout(timer);
  try {
    const c = await endpointApi.get(id);
    current.value = c;
    if (isFinal(c.state)) {
      await reloadHistory();
      return;
    }
  } catch (e) {
    toast.fromError(e, '無法取得指令狀態');
  }
  timer = setTimeout(() => void track(id), 2000);
}

const sending = ref<EndpointCommandKind | null>(null);
async function send(kind: EndpointCommandKind, params: Record<string, unknown> = {}) {
  sending.value = kind;
  try {
    const c = await endpointApi.create(props.deviceId, kind, params);
    current.value = c;
    if (c.state === 'queued') toast.info(`${KIND_LABELS[kind]}已排隊`, props.online ? undefined : '電腦離線,連線後送出(1 小時內有效)');
    await reloadHistory();
    void track(c.commandId);
    return true;
  } catch (e) {
    toast.fromError(e, `${KIND_LABELS[kind]}失敗`);
    return false;
  } finally {
    sending.value = null;
  }
}

async function restart() {
  const ok = await confirm({
    title: `重新啟動 ${props.computerName} 的 Agent?`,
    message: 'Agent 服務會停止後由 Windows 自動重新啟動(約 10 秒),期間暫停回報;不影響使用者操作。',
    tone: 'danger',
    confirmText: '重新啟動',
  });
  if (ok) await send('agent.restart');
}

// ---------- 需要參數的指令 ----------
const logsOpen = ref(false);
const logs = reactive({ days: '3' });
const levelOpen = ref(false);
const level = reactive({ level: 'debug', minutes: '60' });
const msgOpen = ref(false);
const msg = reactive({ title: '', text: '', timeout: '0' });

const DAY_OPTIONS = [1, 2, 3, 7, 14].map((d) => ({ label: `最近 ${d} 天`, value: String(d) }));
const LEVEL_OPTIONS = [
  { label: 'debug(除錯)', value: 'debug' },
  { label: 'trace(最詳細)', value: 'trace' },
  { label: '恢復設定檔的等級', value: 'default' },
];
const MINUTE_OPTIONS = [10, 30, 60, 240, 1440].map((m) => ({ label: m >= 60 ? `${m / 60} 小時` : `${m} 分鐘`, value: String(m) }));
const TIMEOUT_OPTIONS = [
  { label: '不自動關閉', value: '0' },
  { label: '1 分鐘', value: '60' },
  { label: '5 分鐘', value: '300' },
  { label: '30 分鐘', value: '1800' },
];
/** 與 ItAgentBack 相同的檢查:不可含控制字元(內文可換行)與雙向文字控制字元 */
const UNSAFE = /[\u0000-\u0009\u000B-\u001F\u007F-\u009F‎‏‪-‮⁦-⁩]/;
const msgError = computed(() => {
  const t = msg.text.trim();
  if (!t) return null;
  if (t.length > 1000) return '內文最多 1000 字';
  if (t.split('\n').length > 30) return '內文最多 30 行';
  if (UNSAFE.test(t) || UNSAFE.test(msg.title) || msg.title.includes('\n')) return '不可含控制字元';
  if (msg.title.length > 64) return '標題最多 64 字';
  return null;
});

async function sendLogs() {
  if (await send('logs.collect', { days: Number(logs.days) })) logsOpen.value = false;
}
async function sendLevel() {
  const params = level.level === 'default' ? { level: 'default' } : { level: level.level, duration_min: Number(level.minutes) };
  if (await send('agent.log_level', params)) levelOpen.value = false;
}
async function sendMessage() {
  const params: Record<string, unknown> = { text: msg.text.trim(), timeout_sec: Number(msg.timeout) };
  if (msg.title.trim()) params.title = msg.title.trim();
  if (await send('message.show', params)) {
    msgOpen.value = false;
    msg.title = '';
    msg.text = '';
  }
}

// ---------- 指令紀錄 ----------
const history = shallowRef<EndpointCommand[]>([]);
const cursor = ref<string | null>(null);
const historyLoading = ref(false);
const historyError = ref<unknown>(null);
async function loadHistory(more = false) {
  historyLoading.value = true;
  historyError.value = null;
  try {
    const page = await endpointApi.listByDevice(props.deviceId, { limit: 20, cursor: more ? (cursor.value ?? undefined) : undefined });
    history.value = more ? [...history.value, ...page.items] : page.items;
    cursor.value = page.nextCursor;
  } catch (e) {
    historyError.value = e;
  } finally {
    historyLoading.value = false;
  }
}
const reloadHistory = () => loadHistory(false);
void loadHistory();

const detail = shallowRef<EndpointCommand | null>(null);
const detailOpen = ref(false);
async function openDetail(row: EndpointCommand) {
  detail.value = row;
  detailOpen.value = true;
  try {
    detail.value = await endpointApi.get(row.commandId); // 單筆才有 files
  } catch (e) {
    toast.fromError(e, '無法取得指令內容');
  }
}

const cancelling = ref(false);
async function cancel(c: EndpointCommand) {
  cancelling.value = true;
  try {
    const r = await endpointApi.cancel(c.commandId);
    if (detail.value?.commandId === r.commandId) detail.value = r;
    if (current.value?.commandId === r.commandId) current.value = r;
    toast.success('已取消指令');
    await reloadHistory();
  } catch (e) {
    toast.fromError(e, '取消失敗');
  } finally {
    cancelling.value = false;
  }
}
const cancellable = (c: EndpointCommand) => c.state === 'queued' && c.createdBy.emp === me.value;
const kindLabel = (k: string) => KIND_LABELS[k as EndpointCommandKind] ?? k;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <GCard v-if="canCommand" title="下達指令" icon="send" padding="sm">
      <div class="stack" style="--gap: 10px">
        <div class="row wrap" style="--gap: 8px">
          <GButton icon="activity" :loading="sending === 'agent.diagnose'" :disabled="!!sending" @click="send('agent.diagnose')">遠端診斷</GButton>
          <GButton icon="download" :disabled="!!sending" @click="logsOpen = true">收集日誌</GButton>
          <GButton icon="refresh" :loading="sending === 'inventory.collect'" :disabled="!!sending" @click="send('inventory.collect')"
            >立即蒐集資產</GButton
          >
          <GButton icon="code" :disabled="!!sending" @click="levelOpen = true">調整日誌等級</GButton>
          <GButton icon="megaphone" :disabled="!!sending" @click="msgOpen = true">傳送訊息</GButton>
          <GButton icon="reset" variant="danger" :loading="sending === 'agent.restart'" :disabled="!!sending" @click="restart">重新啟動 Agent</GButton>
        </div>
        <p v-if="!online" class="small muted" style="margin: 0">電腦目前離線:指令會排隊,連線後送出;1 小時內未連線即過期,不會執行。</p>
      </div>
    </GCard>
    <p v-else-if="!active" class="small muted" style="margin: 0">此電腦已停用,不能下指令。</p>

    <GCard v-if="current" :title="kindLabel(current.kind)" icon="activity" padding="sm">
      <template #actions>
        <GButton v-if="cancellable(current)" size="sm" icon="x" :loading="cancelling" @click="cancel(current)">取消</GButton>
      </template>
      <CommandResult :command="current" compact />
    </GCard>

    <GCard title="指令紀錄" icon="list" padding="none" :subtitle="history.length ? `最近 ${history.length} 筆` : ''">
      <template #actions>
        <GButton size="sm" icon="refresh" variant="ghost" :loading="historyLoading" @click="reloadHistory">重新整理</GButton>
      </template>
      <GEmpty v-if="historyError" tone="danger" icon="list" title="無法取得指令紀錄" :description="describeError(historyError)"
        ><GButton icon="refresh" @click="reloadHistory">重試</GButton></GEmpty
      >
      <template v-else>
        <GTable
          :loading="historyLoading && !history.length"
          :rows="history"
          row-key="commandId"
          :page-size="0"
          clickable
          empty-title="尚無指令"
          empty-description="下達的指令與結果會列在這裡"
          :columns="[
            { key: 'createdAt', label: '時間', width: '120px' },
            { key: 'kind', label: '指令' },
            { key: 'state', label: '狀態', width: '96px' },
            { key: 'createdBy', label: '操作人', hideSm: true },
          ]"
          @row-click="openDetail"
        >
          <template #cell-createdAt="{ row }"
            ><span class="nowrap small" :title="fmtTime(row.createdAt)">{{ fromNow(row.createdAt) }}</span></template
          >
          <template #cell-kind="{ row }">{{ kindLabel(row.kind) }}</template>
          <template #cell-state="{ row }"
            ><GBadge :tone="STATE_TONES[row.state as keyof typeof STATE_TONES]" dot>{{ STATE_LABELS[row.state as keyof typeof STATE_LABELS] }}</GBadge></template
          >
          <template #cell-createdBy="{ row }"
            ><span class="small">{{ row.createdBy.name ?? row.createdBy.emp }}</span></template
          >
        </GTable>
        <div v-if="cursor" class="row" style="justify-content: center; padding: 8px">
          <GButton size="sm" variant="ghost" :loading="historyLoading" @click="loadHistory(true)">載入更多</GButton>
        </div>
      </template>
    </GCard>

    <GModal v-model:open="detailOpen" :title="detail ? kindLabel(detail.kind) : ''" :subtitle="detail?.commandId" icon="list" width="760px">
      <CommandResult v-if="detail" :command="detail" />
      <template #footer>
        <GButton v-if="detail && cancellable(detail)" icon="x" :loading="cancelling" @click="cancel(detail)">取消指令</GButton>
        <GButton @click="detailOpen = false">關閉</GButton>
      </template>
    </GModal>

    <GModal v-model:open="logsOpen" title="收集日誌" :subtitle="computerName" icon="download" width="440px">
      <div class="stack" style="--gap: 12px">
        <GSelect v-model="logs.days" label="範圍" :options="DAY_OPTIONS" />
        <p class="small muted" style="margin: 0">Agent 會把日誌壓縮後上傳(私鑰、Token 會被遮罩),完成後可在此下載;檔案保存 14 天。</p>
      </div>
      <template #footer>
        <GButton @click="logsOpen = false">取消</GButton>
        <GButton variant="primary" icon="download" :loading="sending === 'logs.collect'" @click="sendLogs">收集</GButton>
      </template>
    </GModal>

    <GModal v-model:open="levelOpen" title="調整日誌等級" :subtitle="computerName" icon="code" width="440px">
      <div class="stack" style="--gap: 12px">
        <GSelect v-model="level.level" label="等級" :options="LEVEL_OPTIONS" />
        <GSelect v-if="level.level !== 'default'" v-model="level.minutes" label="多久後自動恢復" :options="MINUTE_OPTIONS" />
        <p class="small muted" style="margin: 0">暫時提高 Agent 的日誌詳細程度以便排查;到期自動恢復,Agent 重新啟動後仍有效。</p>
      </div>
      <template #footer>
        <GButton @click="levelOpen = false">取消</GButton>
        <GButton variant="primary" icon="check" :loading="sending === 'agent.log_level'" @click="sendLevel">套用</GButton>
      </template>
    </GModal>

    <GModal v-model:open="msgOpen" title="傳送訊息" :subtitle="computerName" icon="megaphone" width="520px">
      <div class="stack" style="--gap: 12px">
        <GInput v-model="msg.title" label="標題(選填)" placeholder="例 系統維護通知" :error="msg.title.length > 64 ? '最多 64 字' : null" />
        <GTextarea v-model="msg.text" label="內文" required :rows="5" :error="msgError" />
        <GSelect v-model="msg.timeout" label="自動關閉" :options="TIMEOUT_OPTIONS" />
        <p class="small muted" style="margin: 0">
          訊息框標題固定加上「【IT 部門通知】」,內文結尾附上發送人工號;只送到電腦主控台的使用者(遠端桌面工作階段收不到)。
        </p>
      </div>
      <template #footer>
        <GButton @click="msgOpen = false">取消</GButton>
        <GButton variant="primary" icon="send" :loading="sending === 'message.show'" :disabled="!msg.text.trim() || !!msgError" @click="sendMessage"
          >傳送</GButton
        >
      </template>
    </GModal>
  </div>
</template>
