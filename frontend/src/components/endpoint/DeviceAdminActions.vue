<script setup lang="ts">
/**
 * 電腦詳情「概要」的管理操作(RustIt P3,P3-DATA-DESIGN §4–§5):需要按鈕權限 it.endpoint-device.admin 與 BFF endpoint.command.admin。
 *   - 停用 / 啟用 / 退役:PUT /devices/{id}/status;停用與退役立即中斷 Agent 連線,之後 Agent 連線被拒
 *   - 合併疑似同一台:以首次連線較早的為舊裝置(保留 deviceId),新登錄併入;兩台未完成的指令會取消
 *     後端回 fingerprint_mismatch / overlap 時,再確認一次後以 force 合併
 * 操作人由 BFF 內部 Token 帶到後端寫稽核;原因必填,寫入事件。
 */
import { computed, reactive, ref } from 'vue';
import { can, EP, UI } from '@/api/auth';
import { deviceApi, type DeviceStatus } from '@/api/endpoint';
import { fmtTime, fromNow } from '@/api/format';
import { ApiError, describeError } from '@/api/http';
import type { EndpointDeviceDetail } from '@/api/types';
import { confirm, toast } from '@/ui';

const props = defineProps<{ device: EndpointDeviceDetail }>();
const emit = defineEmits<{ changed: [] }>();
const allowed = computed(() => can(UI.devAdmin) && can(EP.commandAdmin));
const merged = computed(() => !!props.device.mergedInto);

type Pending =
  | { kind: 'status'; status: DeviceStatus; title: string; message: string }
  | { kind: 'merge'; targetId: string; sourceId: string; title: string; message: string };
const pending = ref<Pending | null>(null);
const form = reactive({ reason: '' });
const busy = ref(false);
const open = computed({
  get: () => !!pending.value,
  set: (v: boolean) => {
    if (!v) pending.value = null;
  },
});

function ask(p: Pending) {
  form.reason = '';
  pending.value = p;
}

const name = computed(() => props.device.computerName);
function askStatus(status: DeviceStatus) {
  const msg: Record<DeviceStatus, [string, string]> = {
    disabled: [`停用 ${name.value}?`, '立即中斷 Agent 連線,之後的回報與指令都會被拒絕(資料保留);可再啟用。'],
    retired: [`退役 ${name.value}?`, '報廢或不再使用的電腦:立即中斷連線、清單預設不再顯示(勾「顯示退役」才看得到);可改回使用中。'],
    active: [`將 ${name.value} 改回使用中?`, 'Agent 下次重試連線時恢復回報(最慢約 10 分鐘)。'],
  };
  const [title, message] = msg[status];
  ask({ kind: 'status', status, title, message });
}

/** 以首次連線較早者為舊裝置(保留),較晚者為新登錄(併入) */
const candidates = computed(() =>
  (props.device.suspectedDuplicates ?? []).map((o) => {
    const meOlder = props.device.firstSeenAt <= o.firstSeenAt;
    return meOlder
      ? { other: o, targetId: props.device.deviceId, sourceId: o.deviceId, text: `把 ${o.computerName}(新登錄)併入這台` }
      : { other: o, targetId: o.deviceId, sourceId: props.device.deviceId, text: `把這台(新登錄)併入 ${o.computerName}` };
  }),
);
function askMerge(c: (typeof candidates.value)[number]) {
  ask({
    kind: 'merge',
    targetId: c.targetId,
    sourceId: c.sourceId,
    title: c.text,
    message:
      '新登錄的事件、指令紀錄與較新的一份資產搬到舊裝置,舊裝置改用新登錄目前的憑證(裝置代碼不變);新登錄標記為已合併。兩台尚未完成的指令會取消。硬體指紋由端點自行回報,請先確認是同一台實體電腦。',
  });
}

const FORCE_REASONS: Record<string, string> = {
  fingerprint_mismatch: '兩台的硬體指紋不同(或未回報)。',
  overlap: '新登錄的首次連線早於舊裝置最後回報,兩台曾同時使用。',
};

async function submit() {
  const p = pending.value;
  if (!p || !form.reason.trim()) return;
  busy.value = true;
  try {
    if (p.kind === 'status') {
      const r = await deviceApi.setStatus(props.device.deviceId, p.status, form.reason.trim());
      toast.success(r.changed ? '狀態已變更' : '狀態沒有變更');
    } else {
      let r;
      try {
        r = await deviceApi.merge(p.targetId, p.sourceId, form.reason.trim());
      } catch (e) {
        const why = e instanceof ApiError ? (e.details as { reason?: string } | undefined)?.reason : undefined;
        if (!why || !FORCE_REASONS[why]) throw e;
        const ok = await confirm({
          title: '仍要合併?',
          message: `${FORCE_REASONS[why]}確認兩台是同一台實體電腦後才繼續。`,
          tone: 'danger',
          confirmText: '確認合併',
        });
        if (!ok) return;
        r = await deviceApi.merge(p.targetId, p.sourceId, form.reason.trim(), true);
      }
      toast.success(
        r.alreadyMerged ? '已經合併過' : '合併完成',
        r.alreadyMerged ? undefined : `搬移事件 ${r.events} 筆、指令 ${r.commands} 筆${r.canceledCommands ? `,取消未完成指令 ${r.canceledCommands} 筆` : ''}`,
      );
    }
    pending.value = null;
    emit('changed');
  } catch (e) {
    toast.error('操作失敗', describeError(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GCard v-if="allowed && !merged" title="管理" icon="settings" padding="sm">
    <div class="stack" style="--gap: 12px">
      <div class="row" style="--gap: 8px; flex-wrap: wrap">
        <GButton v-if="device.status === 'active'" icon="ban" @click="askStatus('disabled')">停用</GButton>
        <GButton v-if="device.status !== 'active'" icon="check-circle" @click="askStatus('active')">{{
          device.status === 'retired' ? '改回使用中' : '啟用'
        }}</GButton>
        <GButton v-if="device.status !== 'retired'" icon="archive" variant="danger" @click="askStatus('retired')">退役</GButton>
      </div>

      <div v-if="candidates.length" class="stack" style="--gap: 8px">
        <strong class="small">疑似同一台</strong>
        <div v-for="c in candidates" :key="c.other.deviceId" class="row" style="--gap: 8px; flex-wrap: wrap">
          <span class="small">
            {{ c.other.computerName }}
            <span class="faint mono">{{ c.other.deviceId.slice(0, 8) }}</span>
            <span class="faint">· 首次 {{ fmtTime(c.other.firstSeenAt) }} · 最後 {{ fromNow(c.other.lastSeenAt) }}</span>
          </span>
          <span class="spacer" />
          <GButton size="sm" icon="merge" :disabled="device.status === 'retired'" @click="askMerge(c)">{{ c.text }}</GButton>
        </div>
        <p v-if="device.status === 'retired'" class="faint xs" style="margin: 0">已退役的裝置要先改回使用中才能合併。</p>
      </div>
    </div>

    <GModal v-model:open="open" :title="pending?.title ?? ''" :subtitle="device.computerName" icon="settings" width="520px">
      <div v-if="pending" class="stack" style="--gap: 12px">
        <p class="small" style="margin: 0">{{ pending.message }}</p>
        <GTextarea v-model="form.reason" label="原因(寫入事件紀錄)" required :rows="2" placeholder="例:重灌、送修、報廢" />
      </div>
      <template #footer>
        <GButton variant="ghost" @click="pending = null">取消</GButton>
        <GButton
          :variant="pending?.kind === 'status' && pending.status === 'active' ? 'primary' : 'danger'"
          :loading="busy"
          :disabled="!form.reason.trim()"
          @click="submit"
          >確定</GButton
        >
      </template>
    </GModal>
  </GCard>
</template>
