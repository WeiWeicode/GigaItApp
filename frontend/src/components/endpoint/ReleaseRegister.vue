<script setup lang="ts">
/**
 * 登錄版本對話框(RustIt P6;POST /api/endpoint/releases,endpoint.software.manage):
 * 從版本檔目錄中尚未登錄的檔案挑選(簽章人員放入已簽章的檔案後才會出現);SHA-256 與大小由主機讀檔計算,不接受輸入。
 * 預期簽章者 = 簽章憑證的 SHA-1 指紋(40 個十六進位字元,可多個、換憑證時新舊並列);Agent 還要再與本機信任清單取交集。
 * 登錄後是草稿:只能設給 pilot 環,發佈後才能推到 it / all。
 */
import { computed, reactive, ref, watch } from 'vue';
import { RELEASE_COMPONENT_LABELS, releaseApi } from '@/api/endpoint';
import { fmtBytes } from '@/api/format';
import { ApiError, describeError } from '@/api/http';
import type { EndpointReleaseFile } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ registered: [] }>();

const files = useAsync(() => releaseApi.files(), { immediate: false });
const form = reactive({ pick: '', signers: '', notes: '' });
const busy = ref(false);

watch(open, (v) => {
  if (!v) return;
  form.pick = '';
  form.signers = '';
  form.notes = '';
  void files.reload();
});

const key = (f: EndpointReleaseFile) => `${f.component}|${f.version}|${f.fileName}`;
const options = computed(() =>
  (files.data.value?.items ?? []).map((f) => ({
    label: `${RELEASE_COMPONENT_LABELS[f.component]} ${f.version} · ${f.fileName} · ${fmtBytes(f.sizeBytes)}`,
    value: key(f),
  })),
);
const picked = computed(() => (files.data.value?.items ?? []).find((f) => key(f) === form.pick) ?? null);

const THUMB = /^[0-9a-fA-F]{40}$/;
/** 逗號、分號或換行分隔;每個去掉空白、冒號與不可見字元(Windows 憑證視窗的「指紋」是 `ab cd ef …` 空白分隔,開頭常帶 U+200E);去除重複 */
const signerList = computed(() => [
  ...new Set(
    form.signers
      .split(/[,;\n]+/)
      .map((s) => s.replace(/[\s:\u200e\u200f]/g, ''))
      .filter(Boolean),
  ),
]);
const signerError = computed(() => {
  if (!form.signers.trim()) return null;
  const bad = signerList.value.find((s) => !THUMB.test(s));
  if (bad) return `不是 40 個十六進位字元的 SHA-1 指紋:${bad.slice(0, 44)}`;
  return signerList.value.length > 8 ? '最多 8 個' : null;
});
const valid = computed(() => !!picked.value && signerList.value.length > 0 && !signerError.value);

async function submit() {
  const f = picked.value;
  if (!f || !valid.value) return;
  busy.value = true;
  try {
    await releaseApi.register({
      component: f.component,
      version: f.version,
      fileName: f.fileName,
      signerThumbprints: signerList.value,
      notes: form.notes.trim() || undefined,
    });
    toast.success('版本已登錄(草稿)', `${RELEASE_COMPONENT_LABELS[f.component]} ${f.version}:先設給 pilot 環驗證,再發佈`);
    emit('registered');
  } catch (e) {
    // 已登錄過同版本(409)、檔案不見或被換掉:提示並重新讀取檔案清單
    if (e instanceof ApiError && (e.status === 409 || e.status === 404)) void files.reload();
    toast.error('無法登錄版本', describeError(e));
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GModal v-model:open="open" title="登錄版本" subtitle="從版本檔目錄挑選已簽章的檔案" icon="package" width="620px">
    <div class="stack" style="--gap: 14px">
      <GEmpty v-if="files.error.value" tone="danger" icon="package" title="無法讀取版本檔目錄" :description="describeError(files.error.value)"
        ><GButton icon="refresh" @click="files.reload">重試</GButton></GEmpty
      >
      <template v-else>
        <GSelect
          v-model="form.pick"
          label="版本檔"
          required
          :options="options"
          :placeholder="files.loading.value ? '讀取中…' : options.length ? '請選擇' : '目錄中沒有尚未登錄的檔案'"
          :disabled="files.loading.value || !options.length"
        />
        <p class="faint xs" style="margin: 0">檔案由簽章人員放進主機的版本檔目錄({元件}/{版本}/{檔名});SHA-256 與大小由主機讀檔計算。</p>
        <GTextarea
          v-model="form.signers"
          label="預期簽章者(SHA-1 指紋)"
          required
          :rows="2"
          :error="signerError"
          placeholder="40 個十六進位字元(可直接貼憑證視窗的指紋);多個以逗號或換行分隔(換憑證時新舊並列)"
        />
        <GInput v-model="form.notes" label="備註(選填)" placeholder="例:修正離線補傳問題" />
        <p class="faint xs" style="margin: 0">登錄後是「草稿」:只能設給 pilot 環;在 pilot 驗證後再發佈,才能推到 it / all 環。</p>
      </template>
    </div>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" :loading="busy" :disabled="!valid" @click="submit">登錄</GButton>
    </template>
  </GModal>
</template>
