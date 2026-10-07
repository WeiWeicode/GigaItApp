<script setup lang="ts">
/**
 * 發布紀錄(Gateway NOTIFY-PLAN §6.5):本人發布的公告(有全公司權限可看全部),已讀率、Email 寄送進度;
 * 點選查看已讀 / 未讀名單(可匯出 CSV)、撤回、提醒未讀(重寄 Email)、編輯草稿 / 排程。
 */
import { notifyApi, type AnnouncementRow, type AnnouncementStatus, type Receipts } from '@giganexus/web-kit';
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NOTIFY, useAuth } from '@/api/auth';
import { fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import { CHANNEL_LABEL, levelOf, openAnnouncement, STATUS } from '@/composables/notify';
import { usePaged } from '@/composables/usePaged';
import { confirm, toast } from '@/ui';

const router = useRouter();
const { can } = useAuth();
const canAll = computed(() => can(NOTIFY.publishAll));

const filters = reactive({ q: '', status: '', mine: false });
const list = usePaged<AnnouncementRow>(
  (page, pageSize) =>
    notifyApi.list({
      q: filters.q || undefined,
      status: (filters.status || undefined) as AnnouncementStatus | undefined,
      mine: filters.mine || undefined,
      page,
      pageSize,
    }),
  { pageSize: 10, watch: () => ({ ...filters }) },
);

const statusOptions = [{ label: '全部狀態', value: '' }, ...Object.entries(STATUS).map(([value, s]) => ({ label: s.label, value }))];
const readPct = (r: AnnouncementRow) => (r.targetCount ? Math.round((r.readCount / r.targetCount) * 100) : 0);
const emailText = (r: AnnouncementRow) => {
  if (!r.email) return null;
  const total = Object.values(r.email).reduce((a, b) => a + b, 0);
  const sent = r.email.sent ?? 0;
  const failed = (r.email.failed ?? 0) + (r.email.dead ?? 0);
  return { sent, total, failed, queued: r.email.queued ?? 0 };
};

/* ---- 明細與已讀名單 ---- */
const sel = ref<AnnouncementRow | null>(null);
const open = computed({ get: () => !!sel.value, set: (v) => (v ? undefined : (sel.value = null)) });
const rc = reactive({ state: 'unread' as 'read' | 'unread' | 'all', q: '', page: 1, data: null as Receipts | null, loading: false, error: null as unknown });

async function loadReceipts() {
  if (!sel.value) return;
  rc.loading = true;
  try {
    rc.data = await notifyApi.receipts(sel.value.announcementId, { state: rc.state, q: rc.q || undefined, page: rc.page, pageSize: 20 });
    rc.error = null;
  } catch (e) {
    rc.error = e;
  } finally {
    rc.loading = false;
  }
}
function select(r: AnnouncementRow) {
  sel.value = r;
  Object.assign(rc, { state: 'unread', q: '', page: 1, data: null, error: null });
  if (r.status === 'published' || r.status === 'revoked') void loadReceipts();
}
let qTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [rc.state, rc.q],
  () => {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rc.page = 1;
      void loadReceipts();
    }, 300);
  },
);
watch(() => rc.page, loadReceipts);

async function revoke() {
  const r = sel.value!;
  const ok = await confirm({
    title: '撤回公告?',
    message: `「${r.title}」會從所有人的收件匣與儀表板移除;已寄出的 Email 無法收回。`,
    confirmText: '撤回',
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await notifyApi.revoke(r.announcementId);
    toast.success('公告已撤回');
    sel.value = null;
    await list.reload();
  } catch (e) {
    toast.fromError(e, '撤回失敗');
  }
}
async function remind() {
  const r = sel.value!;
  const unread = (r.targetCount ?? 0) - r.readCount;
  if (
    !(await confirm({
      title: '提醒未讀?',
      message: `重新寄 Email 給尚未閱讀的人(約 ${unread} 人);同一則公告 10 分鐘內只能提醒一次。`,
      confirmText: '寄出提醒',
    }))
  )
    return;
  try {
    await notifyApi.remind(r.announcementId);
    toast.success('提醒已排入寄送');
  } catch (e) {
    toast.fromError(e, '提醒失敗');
  }
}
function edit() {
  void router.push({ path: '/notify/publish', query: { id: sel.value!.announcementId } });
}
</script>

<template>
  <div>
    <!-- 單一根節點(註解也要放在裡面):TabbedPage 以 <Transition mode="out-in"> 切換 Tab,多根節點會讓下一個 Tab 空白 -->
    <GCard padding="none">
      <template #header>
        <div class="filters">
          <GInput v-model="filters.q" icon="search" placeholder="搜尋標題" clearable />
          <GSelect v-model="filters.status" :options="statusOptions" />
          <GSwitch v-if="canAll" v-model="filters.mine" label="只看我發布的" size="sm" />
          <span class="spacer" />
          <GButton icon="plus" @click="router.push('/notify/publish')">發布公告</GButton>
        </div>
      </template>
      <GEmpty v-if="list.error.value" tone="danger" icon="alert" title="載入失敗" :description="describeError(list.error.value)">
        <GButton icon="refresh" @click="list.reload">重試</GButton>
      </GEmpty>
      <GTable
        v-else
        v-model:page="list.page.value"
        :rows="list.items.value"
        :total="list.total.value"
        :loading="list.loading.value"
        :page-size="list.pageSize"
        row-key="announcementId"
        clickable
        empty-title="還沒有發布紀錄"
        :columns="[
          { key: 'title', label: '公告' },
          { key: 'status', label: '狀態', width: '96px' },
          { key: 'audienceText', label: '對象', hideSm: true },
          { key: 'channels', label: '管道', hideSm: true },
          { key: 'read', label: '已讀', width: '170px' },
          { key: 'publishAt', label: '發布時間', width: '130px', hideSm: true },
        ]"
        @row-click="select"
      >
        <template #cell-title="{ row }">
          <div class="t-cell">
            <GBadge :tone="levelOf(row.level).tone">{{ levelOf(row.level).label }}</GBadge>
            <span class="strong ellipsis">{{ row.title }}</span>
          </div>
          <div class="xs faint">{{ row.publisherTitle ?? '' }}{{ canAll ? ` · ${row.createdBy}` : '' }}</div>
        </template>
        <template #cell-status="{ row }"
          ><GBadge :tone="STATUS[row.status]?.tone" dot>{{ STATUS[row.status]?.label ?? row.status }}</GBadge></template
        >
        <template #cell-audienceText="{ row }"
          ><span class="small muted">{{ row.audienceText }}</span></template
        >
        <template #cell-channels="{ row }"
          ><span class="small">{{ row.channels.map((c: string) => CHANNEL_LABEL[c] ?? c).join('、') }}</span></template
        >
        <template #cell-read="{ row }">
          <template v-if="row.status === 'published' || row.status === 'revoked'">
            <GProgress :value="readPct(row)" :tone="readPct(row) >= 80 ? 'success' : 'primary'" :height="6" />
            <span class="xs faint"
              >{{ row.readCount }} / {{ row.targetCount ?? '-' }}({{ readPct(row) }}%){{ row.requireAck ? ` · 確認 ${row.ackCount}` : '' }}</span
            >
          </template>
          <span v-else class="xs faint">—</span>
        </template>
        <template #cell-publishAt="{ row }"
          ><span class="small faint nowrap" :title="fmtTime(row.publishAt)">{{ row.publishAt ? fromNow(row.publishAt) : '—' }}</span></template
        >
      </GTable>
    </GCard>

    <GModal v-model:open="open" :title="sel?.title" :subtitle="sel ? `#${sel.announcementId} · ${STATUS[sel.status]?.label}` : ''" icon="megaphone" width="860px">
      <div v-if="sel" class="stack" style="--gap: 16px">
        <div class="meta">
          <div><span class="xs faint">對象</span>{{ sel.audienceText }}</div>
          <div><span class="xs faint">管道</span>{{ sel.channels.map((c) => CHANNEL_LABEL[c] ?? c).join('、') }}</div>
          <div><span class="xs faint">發布</span>{{ fmtTime(sel.publishAt) }}</div>
          <div><span class="xs faint">到期</span>{{ sel.expireAt ? fmtTime(sel.expireAt) : '不到期' }}</div>
          <div v-if="emailText(sel)">
            <span class="xs faint">Email</span>已寄 {{ emailText(sel)!.sent }} / {{ emailText(sel)!.total }}
            <span v-if="emailText(sel)!.queued" class="faint">(寄送中 {{ emailText(sel)!.queued }})</span>
            <span v-if="emailText(sel)!.failed" class="danger-text">(失敗 {{ emailText(sel)!.failed }})</span>
          </div>
        </div>

        <template v-if="sel.status === 'published' || sel.status === 'revoked'">
          <div class="row wrap" style="--gap: 10px">
            <GSegmented
              v-model="rc.state"
              size="sm"
              :options="[
                { label: '未讀', value: 'unread' },
                { label: '已讀', value: 'read' },
                { label: '全部', value: 'all' },
              ]"
            />
            <GInput v-model="rc.q" icon="search" placeholder="工號 / 姓名 / 部門" clearable />
            <span class="spacer" />
            <span v-if="rc.data" class="small muted"
              >已讀 {{ rc.data.readCount }} / {{ rc.data.targetCount }}{{ sel.requireAck ? `,確認 ${rc.data.ackCount}` : '' }}</span
            >
            <a class="small" :href="notifyApi.receiptsCsvUrl(sel.announcementId, rc.state)" download><GIcon name="download" :size="14" /> 匯出 CSV</a>
          </div>
          <GEmpty v-if="rc.error" compact tone="danger" :description="describeError(rc.error)" />
          <GTable
            v-else
            v-model:page="rc.page"
            dense
            :rows="rc.data?.items ?? []"
            :total="rc.data?.total ?? 0"
            :loading="rc.loading"
            :page-size="20"
            row-key="employeeNo"
            :empty-title="rc.state === 'unread' ? '全部都已讀' : '沒有資料'"
            :columns="[
              { key: 'employeeNo', label: '工號', mono: true, width: '110px' },
              { key: 'displayName', label: '姓名' },
              { key: 'department', label: '部門', hideSm: true },
              { key: 'readAt', label: '已讀', width: '140px' },
              { key: 'ackAt', label: '確認', width: '140px', hideSm: true },
            ]"
          >
            <template #cell-readAt="{ row }"
              ><span class="small faint">{{ row.readAt ? fmtTime(row.readAt) : '—' }}</span></template
            >
            <template #cell-ackAt="{ row }"
              ><span class="small faint">{{ row.ackAt ? fmtTime(row.ackAt) : '—' }}</span></template
            >
          </GTable>
        </template>
        <p v-else class="small muted">{{ sel.status === 'draft' ? '草稿尚未發布。' : '排程中,到時間後自動發布。' }}</p>
      </div>
      <template #footer>
        <GButton variant="ghost" icon="eye" @click="openAnnouncement(sel!.announcementId)">查看內容</GButton>
        <span class="spacer" />
        <GButton v-if="sel?.status === 'draft' || sel?.status === 'scheduled'" variant="secondary" icon="edit" @click="edit">編輯</GButton>
        <GButton v-if="sel?.status === 'published' && sel.channels.includes('email')" variant="secondary" icon="mail" @click="remind">提醒未讀</GButton>
        <GButton v-if="sel?.status === 'published' || sel?.status === 'scheduled'" variant="danger" icon="x-circle" @click="revoke">撤回</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  width: 100%;
}
.filters > :first-child {
  width: min(280px, 100%);
}
.t-cell {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.meta {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px 16px;
  font-size: var(--fs-sm);
}
.meta > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.danger-text {
  color: var(--c-danger);
}
.wrap {
  flex-wrap: wrap;
}
</style>
