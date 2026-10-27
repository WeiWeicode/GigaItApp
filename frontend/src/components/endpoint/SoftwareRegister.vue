<script setup lang="ts">
/**
 * 登錄軟體套件對話框(RustIt P7;POST /api/endpoint/software,endpoint.software.manage):
 * 從軟體庫中尚未登錄的安裝檔挑選(IT 把測過的安裝檔放進 {軟體}/{版本}/ 後才會出現);SHA-256 與大小由主機讀檔計算。
 * 安裝 / 移除參數只填「額外」屬性(靜默開關由 Agent 依安裝程式類型組),字元與類型限制由主機檢查,不符回 400。
 * 登錄後是草稿:只能派到 pilot 環的測試機,測試成功後「標記測試完成」,再由另一位 IT 發佈(兩人覆核)。
 */
import { computed, reactive, ref, watch } from 'vue';
import {
  DETECT_LABELS,
  INSTALLER_LABELS,
  REBOOT_POLICY_LABELS,
  SOFTWARE_TIMEOUT_DEFAULT,
  softwareApi,
  softwareErrorText,
  softwareTimeoutError,
} from '@/api/endpoint';
import { fmtBytes } from '@/api/format';
import { describeError } from '@/api/http';
import type { EndpointSoftwareFile } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ registered: [] }>();

const files = useAsync(() => softwareApi.files(), { immediate: false });
const form = reactive({
  pick: '',
  name: '',
  version: '',
  installerType: 'msi',
  installArgs: '',
  uninstallArgs: '',
  detectType: 'display_name',
  detectValue: '',
  rebootPolicy: 'never',
  timeoutSec: String(SOFTWARE_TIMEOUT_DEFAULT),
  licenseLimit: '',
  notes: '',
});
const busy = ref(false);

watch(open, (v) => {
  if (!v) return;
  Object.assign(form, {
    pick: '',
    name: '',
    version: '',
    installerType: 'msi',
    installArgs: '',
    uninstallArgs: '',
    detectType: 'display_name',
    detectValue: '',
    rebootPolicy: 'never',
    timeoutSec: String(SOFTWARE_TIMEOUT_DEFAULT),
    licenseLimit: '',
    notes: '',
  });
  void files.reload();
});

const options = computed(() =>
  (files.data.value?.items ?? []).map((f: EndpointSoftwareFile) => ({ label: `${f.fileName} · ${fmtBytes(f.sizeBytes)}`, value: f.fileName })),
);
const picked = computed(() => (files.data.value?.items ?? []).find((f) => f.fileName === form.pick) ?? null);
// 挑檔後帶入軟體名稱 / 版本,並依副檔名猜安裝程式類型(.msi → MSI;其他請自行確認)。
// 判斷值不預填:資料夾名稱常與登錄檔的 DisplayName 不同,照預設派送會 DETECT_FAILED(P7 VM 驗收 B-4)
watch(picked, (f) => {
  if (!f) return;
  form.name = f.software;
  form.version = f.version;
  form.installerType = f.fileName.toLowerCase().endsWith('.msi') ? 'msi' : 'exe';
});

const INSTALLER_OPTIONS = Object.entries(INSTALLER_LABELS).map(([value, label]) => ({ label, value }));
const DETECT_OPTIONS = Object.entries(DETECT_LABELS).map(([value, label]) => ({ label, value }));
const REBOOT_OPTIONS = Object.entries(REBOOT_POLICY_LABELS).map(([value, label]) => ({ label, value }));

const limitNumber = computed(() => (form.licenseLimit.trim() === '' ? null : Number(form.licenseLimit)));
const limitError = computed(() => (limitNumber.value !== null && !(Number.isInteger(limitNumber.value) && limitNumber.value >= 0) ? '請填 0 以上的整數,或留空表示不限' : null));
const timeoutError = computed(() => softwareTimeoutError(form.timeoutSec));
const valid = computed(
  () => !!picked.value && !!form.name.trim() && !!form.version.trim() && !!form.detectValue.trim() && !limitError.value && !timeoutError.value,
);

async function submit() {
  const f = picked.value;
  if (!f || !valid.value) return;
  busy.value = true;
  try {
    await softwareApi.register({
      name: form.name.trim(),
      version: form.version.trim(),
      fileName: f.fileName,
      installerType: form.installerType,
      installArgs: form.installArgs.trim() || undefined,
      uninstallArgs: form.uninstallArgs.trim() || undefined,
      detectType: form.detectType,
      detectValue: form.detectValue.trim(),
      rebootPolicy: form.rebootPolicy,
      timeoutSec: Number(form.timeoutSec),
      licenseLimit: limitNumber.value,
      notes: form.notes.trim() || undefined,
    });
    toast.success('套件已登錄(草稿)', `${form.name.trim()} ${form.version.trim()}:先派到 pilot 測試機驗證,再標記測試完成`);
    emit('registered');
  } catch (e) {
    toast.error('無法登錄套件', softwareErrorText(e));
    void files.reload();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GModal v-model:open="open" title="登錄軟體套件" subtitle="從軟體庫挑選安裝檔" icon="package" width="680px">
    <div class="stack" style="--gap: 14px">
      <GEmpty v-if="files.error.value" tone="danger" icon="package" title="無法讀取軟體庫" :description="describeError(files.error.value)"
        ><GButton icon="refresh" @click="files.reload">重試</GButton></GEmpty
      >
      <template v-else>
        <GSelect
          v-model="form.pick"
          label="安裝檔"
          required
          :options="options"
          :placeholder="files.loading.value ? '讀取中…' : options.length ? '請選擇' : '軟體庫中沒有尚未登錄的安裝檔'"
          :disabled="files.loading.value || !options.length"
        />
        <p class="faint xs" style="margin: 0">安裝檔放進軟體庫的 {軟體}/{版本}/{檔名}(.msi 或 .exe);登錄後不得覆寫該檔案,換版本請放新資料夾。SHA-256 與大小由主機讀檔計算。</p>
        <div class="grid2">
          <GInput v-model="form.name" label="軟體名稱" required />
          <GInput v-model="form.version" label="版本" required />
        </div>
        <div class="grid2">
          <GSelect v-model="form.installerType" label="安裝程式類型" :options="INSTALLER_OPTIONS" required />
          <GSelect v-model="form.rebootPolicy" label="重新開機" :options="REBOOT_OPTIONS" />
        </div>
        <GInput v-model="form.installArgs" label="額外安裝參數(選填)" placeholder="例:ALLUSERS=1" hint="靜默開關由 Agent 依類型加上;不可指到其他檔案、不可含序號或密碼" />
        <GInput v-model="form.uninstallArgs" label="額外移除參數(選填)" placeholder="例:/S" />
        <div class="grid2">
          <GSelect v-model="form.detectType" label="已安裝的判斷" :options="DETECT_OPTIONS" required />
          <GInput
            v-model="form.detectValue"
            label="判斷值"
            required
            :placeholder="form.detectType === 'msi_product_code' ? '{GUID}' : '例:7-Zip%'"
          />
        </div>
        <p class="faint xs" style="margin: 0">
          判斷值要對照<strong>測試機登錄檔</strong>「新增 / 移除程式」的實際名稱(DisplayName,% 為萬用字元,例 <span class="mono">7-Zip%</span>)或 MSI
          產品代碼,不一定等於資料夾名稱;不符時安裝後會 DETECT_FAILED。名稱不含版本的軟體(例如 Notepad++)建議用 MSI 產品代碼。Agent 0.9.2
          起找到項目會再比對版本:較舊就升級,相同或較新才算已安裝。
        </p>
        <div class="grid2">
          <GInput
            v-model="form.timeoutSec"
            label="安裝逾時(秒)"
            required
            :error="timeoutError"
            hint="300–7200;安裝 / 移除程式超過就結束並回報 INSTALL_TIMEOUT"
          />
          <GInput v-model="form.licenseLimit" label="授權數(選填)" placeholder="留空 = 不限" :error="limitError" />
        </div>
        <GInput v-model="form.notes" label="備註(選填)" placeholder="安裝檔來源網址、取得日期、授權、已知問題" />
        <p class="faint xs" style="margin: 0">登錄後是「草稿」:只能派到 pilot 環的測試機;測試成功後標記測試完成,再由<strong>另一位</strong> IT 發佈。需要可管理所有公司的角色。</p>
      </template>
    </div>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" :loading="busy" :disabled="!valid" @click="submit">登錄</GButton>
    </template>
  </GModal>
</template>

<style scoped>
.grid2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
@media (max-width: 560px) {
  .grid2 {
    grid-template-columns: 1fr;
  }
}
</style>
