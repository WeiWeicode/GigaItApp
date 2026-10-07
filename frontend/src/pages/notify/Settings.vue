<script setup lang="ts">
/**
 * 通知設定(Gateway NOTIFY-PLAN §6.9):保留期限(預設永久)、預設到期天數、到期公告可查、Email 收件人上限、圖片上限、全文連結。
 * 檢視需 gw.admin.notify.read;儲存需 notify.settings.write(只給超級管理員,BFF 再檢查)。設定在各 BFF 實例 60 秒內生效。
 */
import { notifyApi, type NotifySettings } from '@giganexus/web-kit';
import { computed, reactive, ref, watch } from 'vue';
import { NOTIFY, useAuth } from '@/api/auth';
import { describeError } from '@/api/http';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const { can } = useAuth();
const canWrite = computed(() => can(NOTIFY.settingsWrite));
const res = useAsync(() => notifyApi.settings());

const f = reactive({
  keepForever: true,
  retentionYears: '5',
  noExpire: true,
  defaultExpireDays: '30',
  archiveShowsExpired: true,
  maxEmailRecipients: '',
  maxImageMb: '',
  viewUrl: '',
});
const saving = ref(false);
const retentionCount = ref<number | null>(null);

function fill(s: NotifySettings) {
  Object.assign(f, {
    keepForever: s.retentionYears === null,
    retentionYears: String(s.retentionYears ?? 5),
    noExpire: s.defaultExpireDays === null,
    defaultExpireDays: String(s.defaultExpireDays ?? 30),
    archiveShowsExpired: s.archiveShowsExpired,
    maxEmailRecipients: String(s.maxEmailRecipients),
    maxImageMb: String(+(s.maxImageBytes / 1024 / 1024).toFixed(2)),
    viewUrl: s.viewUrl,
  });
}
watch(
  () => res.data.value,
  (d) => d && fill(d.settings),
);

// 設定保留年數時預覽會被清除的公告數
let t: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [f.keepForever, f.retentionYears],
  () => {
    clearTimeout(t);
    retentionCount.value = null;
    const years = Number(f.retentionYears);
    if (f.keepForever || !Number.isInteger(years) || years < 1) return;
    t = setTimeout(async () => {
      retentionCount.value = (await notifyApi.retentionPreview(years).catch(() => null))?.announcements ?? null;
    }, 400);
  },
);

function changes(): Partial<Record<keyof NotifySettings, unknown>> {
  const cur = res.data.value!.settings;
  const next: NotifySettings = {
    retentionYears: f.keepForever ? null : Number(f.retentionYears),
    defaultExpireDays: f.noExpire ? null : Number(f.defaultExpireDays),
    archiveShowsExpired: f.archiveShowsExpired,
    maxEmailRecipients: Number(f.maxEmailRecipients),
    maxImageBytes: Math.round(Number(f.maxImageMb) * 1024 * 1024),
    viewUrl: f.viewUrl.trim(),
  };
  return Object.fromEntries((Object.keys(next) as (keyof NotifySettings)[]).filter((k) => next[k] !== cur[k]).map((k) => [k, next[k]]));
}

async function save() {
  const c = changes();
  if (!Object.keys(c).length) return toast.info('沒有變更');
  if (c.retentionYears !== undefined && c.retentionYears !== null) {
    const ok = await confirm({
      title: `改為保留 ${c.retentionYears} 年?`,
      message: `每日 03:00 會永久刪除發布超過 ${c.retentionYears} 年的公告${retentionCount.value !== null ? `(目前 ${retentionCount.value} 則)` : ''},刪除後無法復原。`,
      confirmText: '確定',
      tone: 'danger',
    });
    if (!ok) return;
  }
  saving.value = true;
  try {
    const r = await notifyApi.saveSettings(c);
    fill(r.settings);
    if (res.data.value) res.data.value = { ...res.data.value, settings: r.settings };
    toast.success('設定已儲存', '各 Gateway 實例 1 分鐘內生效');
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <GEmpty v-if="res.error.value" tone="danger" icon="alert" title="設定載入失敗" :description="describeError(res.error.value)">
    <GButton icon="refresh" @click="res.reload">重試</GButton>
  </GEmpty>
  <GCard v-else-if="!res.data.value"><GSkeleton :lines="8" /></GCard>
  <div v-else class="grid grid-2">
    <GCard title="保留與到期" icon="clock">
      <div class="stack" style="--gap: 16px">
        <div class="stack" style="--gap: 8px">
          <GSwitch v-model="f.keepForever" label="公告永久保留(預設)" :disabled="!canWrite" />
          <div v-if="!f.keepForever" class="row" style="--gap: 8px">
            <GInput v-model="f.retentionYears" type="number" :disabled="!canWrite" aria-label="保留年數" />
            <span class="small">年後刪除</span>
          </div>
          <span v-if="!f.keepForever && retentionCount !== null" class="xs" :class="retentionCount ? 'warn' : 'faint'">
            目前有 {{ retentionCount }} 則公告超過此期限,儲存後於每日 03:00 刪除
          </span>
        </div>
        <div class="stack" style="--gap: 8px">
          <GSwitch v-model="f.noExpire" label="新公告預設不到期" :disabled="!canWrite" />
          <div v-if="!f.noExpire" class="row" style="--gap: 8px">
            <span class="small">預設</span>
            <GInput v-model="f.defaultExpireDays" type="number" :disabled="!canWrite" aria-label="預設到期天數" />
            <span class="small">天後到期</span>
          </div>
        </div>
        <GSwitch v-model="f.archiveShowsExpired" label="已到期的公告仍可在「公告查詢」查到" :disabled="!canWrite" />
      </div>
    </GCard>

    <GCard title="寄送與內容" icon="mail">
      <div class="stack" style="--gap: 14px">
        <GInput v-model="f.maxEmailRecipients" type="number" label="單次公告 Email 收件人上限" hint="超過時發布畫面要求縮小對象" :disabled="!canWrite" />
        <GInput v-model="f.maxImageMb" type="number" label="內文圖片上限(MB / 張)" hint="0.1 – 5 MB" :disabled="!canWrite" />
        <GInput v-model="f.viewUrl" label="公告全文連結" hint="Email、桌面通知點擊的站內路徑,{id} 代入公告編號" :disabled="!canWrite" />
        <div class="small muted">Email 寄送速率:每秒 {{ res.data.value.readonly.mailRatePerSec }} 封(部署設定 MAIL_RATE_PER_SEC,不在此修改)</div>
      </div>
    </GCard>

    <div class="span-2 row" style="--gap: 10px; justify-content: flex-end">
      <span v-if="!canWrite" class="small muted"><GIcon name="lock" :size="14" /> 只有超級管理員可以修改通知設定</span>
      <GButton v-else icon="save" :loading="saving" @click="save">儲存設定</GButton>
    </div>
  </div>
</template>

<style scoped>
.warn {
  color: var(--c-warning);
}
</style>
