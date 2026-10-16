<script setup lang="ts">
/**
 * 我的通知:有效公告(未到期、管道含 GigaItApp)+ 個人通知,新到舊;未讀篩選、全部已讀、桌面通知開關(L1)。
 * 收到推播時重新查詢(web-kit useNotifyCenter 的未讀數變動)。
 */
import { desktopPermission, enableDesktopNotify, notifyApi, type FeedItem } from '@giganexus/web-kit';
import { computed, reactive, ref, watch } from 'vue';
import { fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import { center, levelOf, NOTIFY_APP, openFeedItem } from '@/composables/notify';
import { usePaged } from '@/composables/usePaged';
import { toast } from '@/ui';

const filters = reactive({ view: 'all' });
const list = usePaged<FeedItem>((page, pageSize) => notifyApi.feed(NOTIFY_APP, { unread: filters.view === 'unread' || undefined, page, pageSize }), {
  pageSize: 15,
  watch: () => ({ ...filters }),
});
/** 公告與個人通知的 id 可能相同:以 kind-id 當列的鍵 */
const rows = computed(() => list.items.value.map((i) => ({ ...i, key: `${i.kind}-${i.id}` })));
// 新通知、已讀狀態變更時同步這一頁
watch(
  () => [center.unread.value, center.items.value.length],
  () => void list.reload(),
);

const perm = ref(desktopPermission());
async function enableDesktop() {
  perm.value = await enableDesktopNotify();
  if (perm.value === 'granted') toast.success('已開啟桌面通知', '分頁在背景時,新公告會跳出 Windows 通知');
  else if (perm.value === 'denied') toast.warning('瀏覽器已封鎖通知', '請在網址列左側的網站設定中允許「通知」');
}
async function open(i: FeedItem) {
  await openFeedItem(i);
  void list.reload();
}
async function readAll() {
  try {
    await center.markAllRead();
    await list.reload();
  } catch (e) {
    toast.fromError(e, '標記已讀失敗');
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <GCard padding="sm">
      <div class="row wrap" style="--gap: 10px">
        <GSegmented
          v-model="filters.view"
          size="sm"
          :options="[
            { label: '全部', value: 'all' },
            { label: '未讀', value: 'unread' },
          ]"
        />
        <GBadge v-if="center.unread.value" tone="primary">{{ center.unread.value }} 則未讀</GBadge>
        <span class="spacer" />
        <span v-if="perm === 'granted'" class="small muted"><GIcon name="check-circle" :size="14" /> 桌面通知已開啟</span>
        <span v-else-if="perm === 'unsupported'" class="small faint">此瀏覽器不支援桌面通知</span>
        <GButton v-else size="sm" variant="secondary" icon="bell-ring" @click="enableDesktop">開啟桌面通知</GButton>
        <GButton size="sm" variant="ghost" icon="check-check" :disabled="!center.unread.value" @click="readAll">全部已讀</GButton>
      </div>
    </GCard>

    <GCard padding="none">
      <GEmpty v-if="list.error.value" tone="danger" icon="alert" title="載入失敗" :description="describeError(list.error.value)">
        <GButton icon="refresh" @click="list.reload">重試</GButton>
      </GEmpty>
      <GTable
        v-else
        v-model:page="list.page.value"
        :rows="rows"
        :total="list.total.value"
        :loading="list.loading.value"
        :page-size="list.pageSize"
        row-key="key"
        clickable
        :empty-title="filters.view === 'unread' ? '沒有未讀通知' : '沒有通知'"
        :columns="[
          { key: 'title', label: '通知' },
          { key: 'from', label: '來源', width: '140px', hideSm: true },
          { key: 'at', label: '時間', width: '110px' },
        ]"
        @row-click="open"
      >
        <template #cell-title="{ row }">
          <div class="t-cell" :class="{ unread: !row.isRead }">
            <span class="dot" :class="`tone-${levelOf(row.level).tone}`" />
            <div class="txt">
              <span class="title ellipsis">
                <GBadge v-if="row.kind === 'announcement' && row.level !== 'info'" :tone="levelOf(row.level).tone">{{ levelOf(row.level).label }}</GBadge>
                {{ row.title }}
                <GBadge v-if="row.requireAck && !row.ackAt" tone="warning" icon="check-check">需確認</GBadge>
              </span>
              <span class="small faint ellipsis">{{ row.summary }}</span>
            </div>
          </div>
        </template>
        <template #cell-from="{ row }"
          ><span class="small muted">{{ row.kind === 'announcement' ? (row.publisherTitle ?? '公告') : '系統通知' }}</span></template
        >
        <template #cell-at="{ row }"
          ><span class="small faint nowrap">{{ fromNow(row.at) }}</span></template
        >
      </GTable>
    </GCard>
  </div>
</template>

<style scoped>
.wrap {
  flex-wrap: wrap;
}
.t-cell {
  display: flex;
  gap: 10px;
  min-width: 0;
  color: var(--text-2);
}
.t-cell.unread {
  color: var(--text);
}
.t-cell.unread .title {
  font-weight: 700;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  margin-top: 8px;
  border-radius: 50%;
  background: var(--tone);
  opacity: 0.3;
}
.t-cell.unread .dot {
  opacity: 1;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.title {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
