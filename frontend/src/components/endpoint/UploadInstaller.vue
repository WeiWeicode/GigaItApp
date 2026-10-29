<script setup lang="ts">
/**
 * 上傳安裝檔對話框(RustIt S1-3 / S1-4;S1-SIGNING-DESIGN §4.5,endpoint.software.manage,主機另要求可管理所有公司的角色):
 *   - 上傳檔案:POST /api/endpoint/software/uploads?fileName={軟體}/{版本}/{檔名}(application/octet-stream,Gateway Nginx 直送,上限 4 GB)
 *   - 從上傳區登錄:網路芳鄰放進 NAS incoming\ 的檔案,挑選後 POST /uploads/register(過渡期,可填備註);
 *     放錯或不要的檔案可刪除 DELETE /uploads/incoming?fileName=(已駁回後仍在的檔案也列在這裡)
 * 上傳後是「待核可」:由另一位 IT 核可後才送簽章工作站重簽;上傳 API 不收備註(查詢字串會進請求日誌)。
 */
import { computed, reactive, ref, watch } from 'vue';
import { softwareErrorText, UPLOAD_MAX_BYTES, uploadApi, uploadInstaller, uploadPathError } from '@/api/endpoint';
import { fmtBytes } from '@/api/format';
import { describeError } from '@/api/http';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ uploaded: []; changed: [] }>();

const MODES = [
  { label: '上傳檔案', value: 'upload', icon: 'upload' },
  { label: '從上傳區登錄', value: 'incoming', icon: 'folder' },
];
const mode = ref('upload');

// ---------- 上傳檔案 ----------
const fileInput = ref<HTMLInputElement | null>(null);
const picked = ref<File | null>(null);
const form = reactive({ software: '', version: '', fileName: '' });
const progress = reactive({ loaded: 0, total: 0 });
const busy = ref(false);
let aborter: AbortController | null = null;

const incoming = useAsync(() => uploadApi.incoming(), { immediate: false });
const incomingForm = reactive({ pick: '', notes: '' });

watch(open, (v) => {
  if (!v) {
    aborter?.abort();
    return;
  }
  mode.value = 'upload';
  picked.value = null;
  Object.assign(form, { software: '', version: '', fileName: '' });
  Object.assign(progress, { loaded: 0, total: 0 });
  Object.assign(incomingForm, { pick: '', notes: '' });
  if (fileInput.value) fileInput.value.value = '';
});
watch(mode, (m) => {
  if (m === 'incoming' && !incoming.data.value) void incoming.reload();
});

function onPick(list: FileList | null) {
  const f = list?.[0] ?? null;
  picked.value = f;
  if (f) form.fileName = f.name;
}

const sizeError = computed(() => (picked.value && picked.value.size > UPLOAD_MAX_BYTES ? `超過上限 ${fmtBytes(UPLOAD_MAX_BYTES)}` : null));
const pathError = computed(() =>
  form.software || form.version || form.fileName ? uploadPathError(form.software.trim(), form.version.trim(), form.fileName.trim()) : null,
);
const target = computed(() => `${form.software.trim()}/${form.version.trim()}/${form.fileName.trim()}`);
const validUpload = computed(
  () => !!picked.value && !!picked.value.size && !sizeError.value && !!form.software.trim() && !!form.version.trim() && !pathError.value,
);
const percent = computed(() => (progress.total ? Math.floor((progress.loaded / progress.total) * 100) : 0));

async function submitUpload() {
  const f = picked.value;
  if (!f || !validUpload.value) return;
  busy.value = true;
  aborter = new AbortController();
  Object.assign(progress, { loaded: 0, total: f.size });
  try {
    await uploadInstaller(f, target.value, (loaded, total) => Object.assign(progress, { loaded, total }), aborter.signal);
    toast.success('已上傳,待核可', `${target.value}:請另一位 IT 核可後送簽`);
    emit('uploaded');
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') toast.info('已取消上傳');
    else toast.error('無法上傳安裝檔', softwareErrorText(e));
  } finally {
    busy.value = false;
    aborter = null;
  }
}

function cancelUpload() {
  aborter?.abort();
}

// ---------- 從上傳區登錄 / 刪除 ----------
const incomingOptions = computed(() =>
  (incoming.data.value?.items ?? []).map((f) => ({ label: `${f.fileName} · ${fmtBytes(f.sizeBytes)}`, value: f.fileName })),
);
async function submitIncoming() {
  if (!incomingForm.pick) return;
  busy.value = true;
  try {
    await uploadApi.register(incomingForm.pick, incomingForm.notes.trim() || undefined);
    toast.success('已登錄,待核可', `${incomingForm.pick}:請另一位 IT 核可後送簽`);
    emit('uploaded');
  } catch (e) {
    toast.error('無法登錄', softwareErrorText(e));
    void incoming.reload();
  } finally {
    busy.value = false;
  }
}
async function deleteIncoming() {
  const fileName = incomingForm.pick;
  if (!fileName) return;
  const ok = await confirm({
    title: `刪除上傳區的 ${fileName}?`,
    message: '從 NAS 上傳區(incoming)刪除這個檔案,刪除後無法復原。同一路徑若有已駁回的上傳紀錄,紀錄保留並記錄刪除人。',
    confirmText: '刪除檔案',
    tone: 'danger',
  });
  if (!ok) return;
  busy.value = true;
  try {
    await uploadApi.deleteIncoming(fileName);
    toast.success('已刪除上傳區的檔案', fileName);
    incomingForm.pick = '';
    emit('changed');
  } catch (e) {
    toast.error('無法刪除', softwareErrorText(e));
  } finally {
    busy.value = false;
    void incoming.reload();
  }
}
</script>

<template>
  <GModal v-model:open="open" title="上傳安裝檔" subtitle="送簽前需另一位 IT 核可" icon="upload" width="640px" :persistent="busy">
    <div class="stack" style="--gap: 14px">
      <GSegmented v-model="mode" :options="MODES" />

      <template v-if="mode === 'upload'">
        <div class="row" style="--gap: 8px; align-items: center; flex-wrap: wrap">
          <GButton icon="file" :disabled="busy" @click="fileInput?.click()">選擇安裝檔</GButton>
          <span v-if="picked" class="small" style="overflow-wrap: anywhere">{{ picked.name }} · {{ fmtBytes(picked.size) }}</span>
          <span v-else class="faint small">.msi 或 .exe,上限 {{ fmtBytes(UPLOAD_MAX_BYTES) }}</span>
          <input ref="fileInput" type="file" accept=".msi,.exe" hidden @change="onPick(($event.target as HTMLInputElement).files)" />
        </div>
        <p v-if="sizeError" class="xs" style="margin: 0; color: var(--c-danger)">{{ sizeError }}</p>
        <div class="grid3">
          <GInput v-model="form.software" label="軟體" required placeholder="例:7-Zip" :disabled="busy" />
          <GInput v-model="form.version" label="版本" required placeholder="例:24.09" :disabled="busy" />
          <GInput v-model="form.fileName" label="檔名" required :disabled="busy" />
        </div>
        <p class="xs" style="margin: 0" :class="pathError ? '' : 'faint'" :style="pathError ? { color: 'var(--c-danger)' } : {}">
          <template v-if="pathError">{{ pathError }}</template>
          <template v-else
            >放到 <span class="mono">{{ target }}</span
            >(簽章後放進軟體庫的同一路徑;已有同路徑的檔案不能再上傳,換版本請用新的版本資料夾)</template
          >
        </p>
        <div v-if="busy || progress.loaded" class="stack" style="--gap: 4px">
          <GProgress :value="progress.loaded" :max="progress.total || 1" />
          <span class="faint xs"
            >{{ percent }}% · {{ fmtBytes(progress.loaded) }} / {{ fmtBytes(progress.total)
            }}{{ busy && percent >= 100 ? ' · 主機計算 SHA-256 中…' : '' }}</span
          >
        </div>
        <p class="faint xs" style="margin: 0">
          只上傳從原廠官方網站取得的安裝檔;主機邊收邊算 SHA-256。上傳後由<strong>另一位</strong> IT
          核可,再由簽章工作站以公司憑證重簽。備註請到清單的詳情查看,上傳時不填備註。
        </p>
      </template>

      <template v-else>
        <GEmpty v-if="incoming.error.value" tone="danger" icon="folder" title="無法讀取上傳區" :description="describeError(incoming.error.value)"
          ><GButton icon="refresh" @click="incoming.reload">重試</GButton></GEmpty
        >
        <template v-else>
          <GSelect
            v-model="incomingForm.pick"
            label="上傳區的檔案"
            required
            :options="incomingOptions"
            :placeholder="incoming.loading.value ? '讀取中…' : incomingOptions.length ? '請選擇' : '上傳區沒有尚未登錄的檔案'"
            :disabled="incoming.loading.value || !incomingOptions.length"
          />
          <GTextarea v-model="incomingForm.notes" label="備註(選填)" :rows="2" placeholder="安裝檔來源網址、取得日期" />
          <p class="faint xs" style="margin: 0">
            網路芳鄰放進 NAS 上傳區 incoming\{軟體}\{版本}\ 的檔案(過渡期作法);登錄時主機讀檔算 SHA-256,之後流程與上傳相同。
          </p>
        </template>
      </template>
    </div>
    <template #footer>
      <GButton v-if="busy && mode === 'upload'" variant="ghost" @click="cancelUpload">取消上傳</GButton>
      <GButton v-else variant="ghost" @click="open = false">關閉</GButton>
      <GButton v-if="mode === 'upload'" variant="primary" :loading="busy" :disabled="!validUpload" @click="submitUpload">上傳</GButton>
      <template v-else>
        <GButton variant="ghost" icon="trash" :disabled="busy || !incomingForm.pick" @click="deleteIncoming">刪除檔案</GButton>
        <GButton variant="primary" :loading="busy" :disabled="!incomingForm.pick || incomingForm.notes.length > 1000" @click="submitIncoming">登錄</GButton>
      </template>
    </template>
  </GModal>
</template>

<style scoped>
.grid3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1.4fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .grid3 {
    grid-template-columns: 1fr;
  }
}
</style>
