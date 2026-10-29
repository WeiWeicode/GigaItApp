<script setup lang="ts">
/**
 * 關閉告警對話框(RustIt P5;POST /api/endpoint/alerts/{alertId}/resolve,endpoint.command.basic):IT 確認後填說明關閉。
 * 硬體變更、服務被停止這類告警不會自動消失,要在這裡關閉;自動類規則若條件仍成立,下次評估(5 分鐘)會再開一筆。
 */
import { reactive, ref, watch } from 'vue';
import { alertApi, alertRuleLabel, alertSummary } from '@/api/endpoint';
import { ApiError } from '@/api/http';
import type { EndpointAlert } from '@/api/types';
import { toast } from '@/ui';

const props = defineProps<{ alert: EndpointAlert | null }>();
const emit = defineEmits<{ resolved: [EndpointAlert]; close: [] }>();
const open = ref(false);
const form = reactive({ note: '' });
const busy = ref(false);

watch(
  () => props.alert,
  (a) => {
    open.value = !!a;
    form.note = '';
  },
);
watch(open, (v) => {
  if (!v) emit('close');
});

async function submit() {
  if (!props.alert || !form.note.trim()) return;
  busy.value = true;
  try {
    const r = await alertApi.resolve(props.alert.alertId, form.note.trim());
    toast.success('告警已關閉');
    open.value = false;
    emit('resolved', r);
  } catch (e) {
    // 已被別人關閉或已自動結束(409 ITA_ALERT_NOT_OPEN)、告警不存在(404):關掉對話框並讓父層重新載入
    if (e instanceof ApiError && (e.status === 409 || e.status === 404)) {
      toast.warning('告警已不是未結束狀態', '可能已被其他人關閉或已自動結束,清單已重新整理');
      const a = props.alert;
      open.value = false;
      emit('resolved', a);
      return;
    }
    toast.fromError(e, '無法關閉告警');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GModal v-model:open="open" title="關閉告警" :subtitle="alert ? `${alert.computerName} · ${alertRuleLabel(alert.rule)}` : ''" icon="bell" width="520px">
    <div v-if="alert" class="stack" style="--gap: 12px">
      <p class="small" style="margin: 0; overflow-wrap: anywhere">{{ alertSummary(alert) }}</p>
      <p class="faint xs" style="margin: 0">自動類規則(例如磁碟空間不足)若條件仍成立,下次評估(每 5 分鐘)會再開一筆新的告警。</p>
      <GTextarea v-model="form.note" label="確認說明(寫入稽核)" required :rows="2" placeholder="例:更換記憶體,已確認;IT 排查時停止服務" />
    </div>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" :loading="busy" :disabled="!form.note.trim()" @click="submit">關閉告警</GButton>
    </template>
  </GModal>
</template>
