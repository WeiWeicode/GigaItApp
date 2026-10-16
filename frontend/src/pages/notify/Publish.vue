<script setup lang="ts">
/**
 * 發布公告(Gateway NOTIFY-PLAN §6.5;此 Tab 為範本,日後複製到員工入口網):
 *   標題、HTML 內文(Tiptap)、等級、對象、管道、需確認已閱讀、發布時間(立即 / 排程)、到期日;右側即時預覽與預估人數。
 *   ?id= 編輯草稿或排程中的公告。發布前確認視窗列出人數與管道;idempotencyKey 防止重按重複發布。
 */
import { notifyApi, sanitizeHtml, type AnnounceChannel, type Audience, type AudiencePreview, type ComposeOptions, type NotifyLevel } from '@giganexus/web-kit';
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuth } from '@/api/auth';
import { describeError } from '@/api/http';
import AudiencePicker from '@/components/notify/AudiencePicker.vue';
import RichEditor from '@/components/notify/RichEditor.vue';
import { CHANNEL_LABEL, levelOf } from '@/composables/notify';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const route = useRoute();
const router = useRouter();
const { me } = useAuth();
const opts = useAsync(() => notifyApi.composeOptions());

const form = reactive({
  title: '',
  publisherTitle: '',
  bodyHtml: '',
  level: 'info' as NotifyLevel,
  linkUrl: '',
  audience: {} as Audience,
  channels: [] as AnnounceChannel[],
  requireAck: false,
  timing: 'now',
  publishAt: '',
  expire: 'none',
  expireAt: '',
});
/** 編輯中的草稿 / 排程公告 */
const editing = ref<{ id: number; rowVer: string; status: string } | null>(null);
const busy = ref(false);
let idempotencyKey = crypto.randomUUID();

/** datetime-local 的值(本地時間) */
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
const toIso = (v: string) => (v ? new Date(v).toISOString() : null);

watch(
  () => opts.data.value,
  async (o) => {
    if (!o) return;
    form.channels = o.defaults.channels.filter((c) => o.channels.find((x) => x.code === c)?.available);
    form.audience = o.canPublishAll ? { all: true } : { depts: o.ownDepts.map((code) => ({ code, sub: true })) };
    form.publisherTitle = defaultPublisher(o);
    if (o.defaults.expireDays) {
      form.expire = 'date';
      form.expireAt = localInput(new Date(Date.now() + o.defaults.expireDays * 86_400_000));
    }
    const id = Number(route.query.id);
    if (id) await loadDraft(id);
  },
);

/** 發布單位預設「公司-部門」:取本人第一個部門,公司名稱與「對象」的公司清單一致 */
function defaultPublisher(o: ComposeOptions): string {
  const dept = o.depts.find((d) => d.code === (me.value?.user.deptCode ?? o.ownDepts[0])) ?? o.depts.find((d) => d.code === o.ownDepts[0]);
  const comp = o.companies.find((c) => c.id === dept?.companyId)?.name ?? me.value?.companies[0];
  const deptName = dept?.name ?? me.value?.user.department;
  return [comp, deptName].filter(Boolean).join('-');
}

async function loadDraft(id: number) {
  try {
    const d = await notifyApi.get(id);
    if (d.status !== 'draft' && d.status !== 'scheduled') {
      toast.warning('只有草稿或排程中的公告可以修改');
      return;
    }
    editing.value = { id, rowVer: d.rowVer!, status: d.status };
    Object.assign(form, {
      title: d.title,
      publisherTitle: d.publisherTitle ?? '',
      bodyHtml: d.bodyHtml,
      level: d.level,
      linkUrl: d.linkUrl ?? '',
      audience: d.audience ?? {},
      channels: d.channels ?? [],
      requireAck: d.requireAck,
      timing: d.status === 'scheduled' ? 'later' : 'now',
      publishAt: d.publishAt && d.status === 'scheduled' ? localInput(new Date(d.publishAt)) : '',
      expire: d.expireAt ? 'date' : 'none',
      expireAt: d.expireAt ? localInput(new Date(d.expireAt)) : '',
    });
  } catch (e) {
    toast.fromError(e, '公告載入失敗');
  }
}

/* ---- 預估人數(對象或管道變更後 400 ms 查詢) ---- */
const preview = ref<AudiencePreview | null>(null);
const previewError = ref<unknown>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [form.audience, form.channels],
  () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        preview.value = await notifyApi.preview(form.audience, form.channels);
        previewError.value = null;
      } catch (e) {
        preview.value = null;
        previewError.value = e;
      }
    }, 400);
  },
  { deep: true },
);

const lv = computed(() => levelOf(form.level));
const previewHtml = computed(() => sanitizeHtml(form.bodyHtml));
const levelOptions = computed(() => (opts.data.value?.levels ?? []).map((l) => ({ label: l.name, value: l.code })));

function toggleChannel(c: AnnounceChannel, on: boolean) {
  form.channels = on ? [...new Set([...form.channels, c])] : form.channels.filter((x) => x !== c);
}

function validate(draft: boolean): string | null {
  if (!form.title.trim()) return '請輸入標題';
  if (draft) return null;
  if (!form.bodyHtml.trim()) return '請輸入內文';
  if (!form.channels.length) return '請至少選擇一個管道';
  if (form.timing === 'later' && (!form.publishAt || new Date(form.publishAt) <= new Date())) return '排程時間需晚於現在';
  if (form.expire === 'date' && !form.expireAt) return '請選擇到期時間';
  if (preview.value && !preview.value.allowed) return '對象超出您可發布的範圍';
  if (preview.value && preview.value.targetCount === 0) return '對象沒有任何在職人員';
  if (preview.value?.emailOverLimit) return 'Email 收件人超過單次上限,請縮小對象或取消 Email';
  return null;
}

async function submit(draft: boolean) {
  const err = validate(draft);
  if (err) return toast.warning(err);
  if (!draft) {
    const p = preview.value;
    const channels = form.channels.map((c) => CHANNEL_LABEL[c]).join('、');
    const when = form.timing === 'later' ? `排程於 ${new Date(form.publishAt).toLocaleString('zh-TW', { hour12: false })} 發布` : '立即發布';
    const email =
      form.channels.includes('email') && p
        ? `;Email 逐人寄 ${p.withEmail} 封(約 ${p.estimatedEmailMinutes} 分鐘寄完${p.withoutEmail ? `,${p.withoutEmail} 人沒有 Email` : ''})`
        : '';
    const ok = await confirm({
      title: `確認${when}?`,
      message: `「${form.title}」\n對象 ${p?.targetCount ?? '?'} 人(${p?.description ?? ''});管道:${channels}${email}。\n發布後 Email 無法收回,撤回只會移除站內公告。`,
      confirmText: form.timing === 'later' ? '排程發布' : '發布',
      tone: form.level === 'urgent' ? 'danger' : 'primary',
    });
    if (!ok) return;
  }
  const input = {
    title: form.title.trim(),
    bodyHtml: form.bodyHtml,
    level: form.level,
    audience: form.audience,
    channels: form.channels,
    linkUrl: form.linkUrl.trim() || null,
    requireAck: form.requireAck,
    publishAt: form.timing === 'later' ? toIso(form.publishAt) : null,
    expireAt: form.expire === 'date' ? toIso(form.expireAt) : null,
    publisherTitle: form.publisherTitle.trim() || null,
  };
  busy.value = true;
  try {
    if (editing.value) {
      await notifyApi.update(editing.value.id, { ...input, rowVer: editing.value.rowVer, publish: !draft });
      toast.success(draft ? '草稿已儲存' : form.timing === 'later' ? '已排程發布' : '公告已發布');
    } else {
      const r = await notifyApi.create({ ...input, draft, idempotencyKey });
      if (r.code === 'DUPLICATE_REQUEST') toast.info('此公告已送出,不再重複發布');
      else toast.success(draft ? '草稿已儲存' : r.status === 'scheduled' ? '已排程發布' : `公告已發布,對象 ${r.targetCount} 人`);
      idempotencyKey = crypto.randomUUID();
    }
    await router.push('/notify/history');
  } catch (e) {
    toast.fromError(e, draft ? '儲存失敗' : '發布失敗');
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <GEmpty v-if="opts.error.value" tone="danger" icon="alert" title="發布選項載入失敗" :description="describeError(opts.error.value)">
    <GButton icon="refresh" @click="opts.reload">重試</GButton>
  </GEmpty>
  <GCard v-else-if="!opts.data.value"><GSkeleton :lines="10" /></GCard>
  <div v-else class="grid grid-3 publish">
    <div class="span-2 stack" style="--gap: 16px">
      <GCard :title="editing ? `編輯公告 #${editing.id}` : '公告內容'" icon="edit">
        <template v-if="editing" #actions
          ><GBadge tone="info">{{ editing.status === 'draft' ? '草稿' : '排程中' }}</GBadge></template
        >
        <div class="stack" style="--gap: 14px">
          <div class="grid grid-2" style="--gap: 12px">
            <GInput v-model="form.title" label="標題" placeholder="例:全體員工特休公告" required />
            <GInput v-model="form.publisherTitle" label="發布單位(顯示用)" placeholder="例:總經理室" />
          </div>
          <div class="row wrap" style="--gap: 10px">
            <span class="small muted">等級</span>
            <GSegmented v-model="form.level" :options="levelOptions" size="sm" />
            <span class="xs faint">緊急:收件人立即跳出對話框</span>
          </div>
          <RichEditor v-model="form.bodyHtml" :max-image-bytes="opts.data.value.maxImageBytes" placeholder="輸入公告內容;可貼上 Word 的格式與圖片" />
          <GInput v-model="form.linkUrl" label="相關連結(選填)" icon="link" placeholder="https://… 或站內路徑" />
        </div>
      </GCard>

      <GCard title="對象" icon="users">
        <AudiencePicker v-model="form.audience" :options="opts.data.value" />
      </GCard>

      <GCard title="管道與時間" icon="send">
        <div class="stack" style="--gap: 14px">
          <div class="channels">
            <div v-for="c in opts.data.value.channels" :key="c.code" class="channel" :class="{ off: !c.available }">
              <GCheckbox
                :label="c.name"
                :disabled="!c.available"
                :model-value="form.channels.includes(c.code)"
                @update:model-value="toggleChannel(c.code, $event)"
              />
              <span v-if="c.note" class="xs faint">{{ c.note }}</span>
            </div>
          </div>
          <GSwitch v-model="form.requireAck" label="需確認已閱讀(收件人按「已閱讀」才算確認,可追蹤未確認名單)" />
          <div class="row wrap" style="--gap: 12px">
            <span class="small muted">發布</span>
            <GSegmented
              v-model="form.timing"
              size="sm"
              :options="[
                { label: '立即', value: 'now' },
                { label: '排程', value: 'later' },
              ]"
            />
            <GInput v-if="form.timing === 'later'" v-model="form.publishAt" type="datetime-local" />
          </div>
          <div class="row wrap" style="--gap: 12px">
            <span class="small muted">到期</span>
            <GSegmented
              v-model="form.expire"
              size="sm"
              :options="[
                { label: '不到期', value: 'none' },
                { label: '指定時間', value: 'date' },
              ]"
            />
            <GInput v-if="form.expire === 'date'" v-model="form.expireAt" type="datetime-local" />
            <span class="xs faint">到期後不再提醒,仍可在「公告查詢」查到</span>
          </div>
        </div>
      </GCard>

      <div class="row" style="--gap: 10px; justify-content: flex-end">
        <GButton variant="secondary" icon="save" :loading="busy" @click="submit(true)">存草稿</GButton>
        <GButton icon="send" :loading="busy" @click="submit(false)">{{ form.timing === 'later' ? '排程發布' : '發布' }}</GButton>
      </div>
    </div>

    <div class="stack side" style="--gap: 16px">
      <GCard title="預估對象" icon="users" tone="cyan">
        <GEmpty v-if="previewError" compact tone="danger" :description="describeError(previewError)" />
        <div v-else-if="preview" class="stack" style="--gap: 10px">
          <div class="big">{{ preview.targetCount.toLocaleString() }} <span class="small muted">人</span></div>
          <p class="small muted">{{ preview.description || '尚未選擇對象' }}</p>
          <GBadge v-if="!preview.allowed" tone="danger" icon="lock">超出可發布範圍</GBadge>
          <template v-if="form.channels.includes('email')">
            <div class="small">
              Email {{ preview.withEmail.toLocaleString() }} 封<span v-if="preview.withoutEmail" class="faint"
                >(另 {{ preview.withoutEmail }} 人沒有 Email)</span
              >
            </div>
            <div class="xs faint">逐人寄,約 {{ preview.estimatedEmailMinutes }} 分鐘寄完(每秒 {{ opts.data.value.mailRatePerSec }} 封)</div>
            <GBadge v-if="preview.emailOverLimit" tone="danger" icon="alert">超過單次上限 {{ opts.data.value.maxEmailRecipients }} 人</GBadge>
          </template>
          <details v-if="preview.sample.length" class="xs">
            <summary class="faint">前 {{ preview.sample.length }} 位</summary>
            <span v-for="s in preview.sample" :key="s.employeeNo" class="sample"
              >{{ s.displayName }}<span class="faint">({{ s.department ?? '-' }})</span></span
            >
          </details>
        </div>
        <GSkeleton v-else :lines="3" />
      </GCard>

      <GCard title="收件人看到的樣子" icon="eye" :tone="lv.tone">
        <div class="stack" style="--gap: 10px">
          <div class="row" style="--gap: 6px">
            <GBadge :tone="lv.tone" :icon="lv.icon">{{ lv.label }}</GBadge>
            <GBadge v-if="form.requireAck" tone="warning" icon="check-check">需確認已閱讀</GBadge>
          </div>
          <strong class="pv-title">{{ form.title || '(標題)' }}</strong>
          <span class="xs faint">{{ form.publisherTitle || '公告' }}</span>
          <!-- 預覽與收件人相同:經 sanitizeHtml 清洗後顯示 -->
          <div v-if="previewHtml" class="gn-notify-content pv-body" v-html="previewHtml" />
          <span v-else class="small faint">(內文)</span>
        </div>
      </GCard>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  flex-wrap: wrap;
}
.channels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 10px;
}
.channel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.channel.off {
  opacity: 0.7;
}
.side {
  position: sticky;
  top: calc(var(--topbar-h) + 28px);
  align-self: start;
}
.big {
  font-size: var(--fs-3xl);
  font-weight: 750;
  line-height: 1.1;
}
.sample {
  display: inline-block;
  margin: 4px 8px 0 0;
}
.pv-title {
  font-size: var(--fs-lg);
}
.pv-body {
  max-height: 420px;
  overflow-y: auto;
  font-size: var(--fs-sm);
}
@media (max-width: 960px) {
  .publish {
    grid-template-columns: 1fr;
  }
  .publish .span-2 {
    grid-column: auto;
  }
  .side {
    position: static;
  }
}
</style>
