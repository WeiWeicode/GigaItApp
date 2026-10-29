<script setup lang="ts">
/**
 * 設定發佈環目標版本對話框(RustIt P6;PUT /api/endpoint/release-rings/{ring}/{component},endpoint.software.manage):
 *   - pilot 可選草稿或已發佈的版本;it / all 只能選已發佈的版本;撤回的版本不列
 *   - 「不升級」= 目標清空(維持現況);可以選比目前舊的版本(降版走同一流程)
 *   - pilot 的同一版本設定未滿 24 小時就設 it / all:主機回 409 ITA_RING_TOO_EARLY,確認後帶 force 再送(寫入稽核)
 */
import { computed, ref, watch } from 'vue';
import { RELEASE_COMPONENT_LABELS, RELEASE_STATUS_LABELS, RING_SHORT, compareVersion, releaseApi } from '@/api/endpoint';
import { ApiError } from '@/api/http';
import type { EndpointRelease, EndpointRingTarget } from '@/api/types';
import { confirm, toast } from '@/ui';

/** ready:版本清單已載入(未載入或載入失敗時選單不完整,不能儲存,避免把目標誤清成「不升級」) */
const props = defineProps<{ ring: EndpointRingTarget | null; releases: EndpointRelease[]; ready: boolean }>();
const emit = defineEmits<{ saved: []; close: []; stale: [] }>();
const open = ref(false);
const target = ref('');
const busy = ref(false);

watch(
  () => props.ring,
  (r) => {
    open.value = !!r;
    target.value = r?.targetVersion ?? '';
  },
);
watch(open, (v) => {
  if (!v) emit('close');
});

/** 這個環、這個元件可選的版本(新到舊);目前的目標若已不在清單(例如被撤回),仍列出來,避免選單顯示成「不升級」而誤清 */
const options = computed(() => {
  const r = props.ring;
  if (!r) return [];
  const list = props.releases
    .filter((x) => x.component === r.component && (x.status === 'published' || (r.ring === 'pilot' && x.status === 'draft')))
    .sort((a, b) => compareVersion(b.version, a.version))
    .map((x) => ({ label: `${x.version}(${RELEASE_STATUS_LABELS[x.status]})`, value: x.version }));
  if (r.targetVersion && !list.some((o) => o.value === r.targetVersion)) list.push({ label: `${r.targetVersion}(目前;已不可選)`, value: r.targetVersion });
  return list;
});

async function submit() {
  const r = props.ring;
  if (!r) return;
  const version = target.value || null;
  busy.value = true;
  try {
    try {
      await releaseApi.setRing(r.ring, r.component, version);
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'ITA_RING_TOO_EARLY') throw e;
      // 主機的兩種情況:pilot 已是此版本但未滿 24 小時 / pilot 目前根本不是此版本(details[0].message)
      const notPilot = (e.details as { message?: string }[] | undefined)?.[0]?.message?.includes('目前不是此版本');
      const ok = await confirm({
        title: '仍要推進?',
        message: `${
          notPilot
            ? `pilot 環目前不是 ${RELEASE_COMPONENT_LABELS[r.component]} ${version},這個版本還沒在 pilot 驗證過。`
            : `pilot 環的 ${RELEASE_COMPONENT_LABELS[r.component]} ${version} 設定還不到 24 小時。`
        }確認 pilot 已驗證過這個版本後才繼續(此次操作會寫入稽核)。`,
        tone: 'danger',
        confirmText: '仍要設定',
      });
      if (!ok) return;
      await releaseApi.setRing(r.ring, r.component, version, true);
    }
    toast.success('已更新目標版本', `${RING_SHORT[r.ring]} 環 ${RELEASE_COMPONENT_LABELS[r.component]}:${version ?? '不升級'}`);
    emit('saved');
  } catch (e) {
    toast.fromError(e, '無法設定目標版本');
    // 版本在對話框開著時被別人撤回 / 改狀態(404、409):選單已過期,通知父層重新載入
    if (e instanceof ApiError && (e.status === 404 || (e.status === 409 && e.code !== 'ITA_RING_TOO_EARLY'))) emit('stale');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GModal
    v-model:open="open"
    title="設定目標版本"
    :subtitle="ring ? `${RING_SHORT[ring.ring]} 環 · ${RELEASE_COMPONENT_LABELS[ring.component]}` : ''"
    icon="rocket"
    width="520px"
  >
    <div v-if="ring" class="stack" style="--gap: 12px">
      <GSelect v-model="target" label="目標版本" :options="options" placeholder="不升級(維持現況)" />
      <p class="faint xs" style="margin: 0">
        {{ ring.ring === 'pilot' ? 'pilot 可選草稿或已發佈的版本。' : '只能選已發佈的版本;草稿要先發佈。' }}
        電腦在下一次 Watchdog 上報(最多 5 分鐘)取得目標後自動下載、驗證簽章並升級,新版不正常會自動還原。選比目前舊的版本即為降版。
      </p>
      <p v-if="ring.ring !== 'pilot'" class="faint xs" style="margin: 0">建議先在 pilot 環跑滿 24 小時再推進;未滿時會要求確認。</p>
    </div>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" :loading="busy" :disabled="!ready" :title="ready ? undefined : '版本清單尚未載入'" @click="submit">儲存</GButton>
    </template>
  </GModal>
</template>
