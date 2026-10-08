<script setup lang="ts">
/**
 * 檔案管理 › BPM 附件(giga-file-service docs/API.md §3、F6;權限 file.bpm.read):
 *   輸入 BPM 單號(完全比對)查詢表單附件,下載 / 預覽。file-api 唯讀查 NaNa、向 BPM 取檔服務 :5144 即時取檔,不複製檔案。
 *   網址帶 ?sn=單號 可直接查詢(方便從其他頁面連過來)。
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { bpm, BPM_SERIAL_RE, PREVIEWABLE, type BpmAttachment } from '@/api/files';
import { fmtTime } from '@/api/format';
import { describeError } from '@/api/http';

const route = useRoute();
const router = useRouter();

const sn = ref(typeof route.query.sn === 'string' ? route.query.sn : '');
const loading = ref(false);
const error = ref<Error | null>(null);
const result = ref<{ serialNumber: string; source: string; items: BpmAttachment[] } | null>(null);

const trimmed = computed(() => sn.value.trim());
const invalid = computed(() => !!trimmed.value && !BPM_SERIAL_RE.test(trimmed.value));

async function search(): Promise<void> {
  if (!trimmed.value || invalid.value) return;
  loading.value = true;
  error.value = null;
  try {
    result.value = await bpm.bySerial(trimmed.value);
    if (route.query.sn !== trimmed.value) void router.replace({ query: { ...route.query, sn: trimmed.value } });
  } catch (e) {
    error.value = e as Error;
    result.value = null;
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (trimmed.value) void search();
});

const asAtt = (r: unknown) => r as BpmAttachment;
const envLabel = (host: string) => (host.endsWith('.190') ? '正式區' : host.endsWith('.191') ? '測試區' : host);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <GCard padding="sm">
      <form class="filters" @submit.prevent="search">
        <GInput
          v-model="sn"
          icon="hash"
          placeholder="BPM 單號(完全相符,例 CustomerComplaintProcess00000014)"
          clearable
          class="grow"
          :error="invalid ? '單號只能包含英數、底線、連字號' : undefined"
        />
        <GButton type="submit" variant="primary" icon="search" :loading="loading" :disabled="!trimmed || invalid">查詢</GButton>
      </form>
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="workflow" title="無法查詢 BPM 附件" :description="describeError(error)"
        ><GButton icon="refresh" @click="search">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else-if="!result && !loading">
      <GEmpty icon="workflow" title="輸入 BPM 單號查詢附件" description="單號需完全相符(不做部分比對);可下載表單上的附件,PDF 與圖片可預覽" />
    </GCard>
    <GCard
      v-else
      padding="none"
      title="表單附件"
      :subtitle="result ? `${result.serialNumber}:${result.items.length} 個附件(來源 ${envLabel(result.source)} ${result.source})` : ''"
      icon="workflow"
    >
      <GTable
        :loading="loading"
        :rows="result?.items ?? []"
        row-key="doid"
        dense
        empty-title="此單號沒有附件"
        empty-description="確認單號是否完整、是否為此環境(測試區 / 正式區)的表單"
        :columns="[
          { key: 'originalName', label: '檔名' },
          { key: 'formName', label: '表單', hideSm: true },
          { key: 'subject', label: '主旨', hideSm: true },
          { key: 'createdAt', label: '上傳時間', width: '150px', hideSm: true },
          { key: 'actions', label: '', align: 'right', width: '100px' },
        ]"
      >
        <template #cell-originalName="{ row }">
          <span class="name">
            <GIcon name="file" :size="15" class="faint" />
            <a class="ellipsis" :href="bpm.contentUrl(asAtt(row).doid)" :title="asAtt(row).originalName">{{ asAtt(row).originalName }}</a>
          </span>
        </template>
        <template #cell-formName="{ row }"
          ><span class="small">{{ asAtt(row).formName ?? '—' }}</span></template
        >
        <template #cell-subject="{ row }"
          ><span class="small ellipsis subject" :title="asAtt(row).subject ?? ''">{{ asAtt(row).subject ?? '—' }}</span></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap">{{ asAtt(row).createdAt ? fmtTime(asAtt(row).createdAt) : '—' }}</span></template
        >
        <template #cell-actions="{ row }">
          <div class="acts">
            <a v-if="PREVIEWABLE.has(asAtt(row).ext ?? '')" :href="bpm.contentUrl(asAtt(row).doid, true)" target="_blank" rel="noopener" title="預覽">
              <GButton size="sm" variant="ghost" icon="eye" square />
            </a>
            <a :href="bpm.contentUrl(asAtt(row).doid)" title="下載"><GButton size="sm" variant="ghost" icon="download" square /></a>
          </div>
        </template>
      </GTable>
    </GCard>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: flex-start;
}
.grow {
  flex: 1 1 260px;
  min-width: 0;
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 360px;
}
.subject {
  display: inline-block;
  max-width: 280px;
}
.acts {
  display: inline-flex;
  gap: 2px;
  justify-content: flex-end;
}
</style>
