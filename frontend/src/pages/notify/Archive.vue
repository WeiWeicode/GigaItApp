<script setup lang="ts">
/** 公告查詢:我在對象內的所有已發布公告(含已到期,不限年份),關鍵字搜尋標題與內文、日期區間、等級 */
import { notifyApi, type FeedItem } from '@giganexus/web-kit';
import { reactive } from 'vue';
import { fmtTime } from '@/api/format';
import { describeError } from '@/api/http';
import { LEVEL, levelOf, openAnnouncement } from '@/composables/notify';
import { usePaged } from '@/composables/usePaged';

const filters = reactive({ q: '', from: '', to: '', level: '' });
const list = usePaged<FeedItem>(
  (page, pageSize) =>
    notifyApi.archive({
      q: filters.q.trim() || undefined,
      from: filters.from ? new Date(`${filters.from}T00:00:00`).toISOString() : undefined,
      // 結束日含當天
      to: filters.to ? new Date(new Date(`${filters.to}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined,
      level: filters.level || undefined,
      page,
      pageSize,
    }),
  { pageSize: 15, watch: () => ({ ...filters }) },
);
const levelOptions = [{ label: '全部等級', value: '' }, ...Object.entries(LEVEL).map(([value, l]) => ({ label: l.label, value }))];
</script>

<template>
  <GCard padding="none">
    <template #header>
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="搜尋標題或內文" clearable />
        <GInput v-model="filters.from" type="date" aria-label="開始日期" />
        <span class="faint">~</span>
        <GInput v-model="filters.to" type="date" aria-label="結束日期" />
        <GSelect v-model="filters.level" :options="levelOptions" />
      </div>
    </template>
    <GEmpty v-if="list.error.value" tone="danger" icon="alert" title="查詢失敗" :description="describeError(list.error.value)">
      <GButton icon="refresh" @click="list.reload">重試</GButton>
    </GEmpty>
    <GTable
      v-else
      v-model:page="list.page.value"
      :rows="list.items.value"
      :total="list.total.value"
      :loading="list.loading.value"
      :page-size="list.pageSize"
      row-key="id"
      clickable
      empty-title="沒有符合的公告"
      :columns="[
        { key: 'title', label: '公告' },
        { key: 'publisherTitle', label: '發布單位', width: '140px', hideSm: true },
        { key: 'at', label: '發布時間', width: '150px' },
        { key: 'state', label: '狀態', width: '110px', hideSm: true },
      ]"
      @row-click="(r: FeedItem) => openAnnouncement(r.id)"
    >
      <template #cell-title="{ row }">
        <div class="t-cell">
          <GBadge :tone="levelOf(row.level).tone">{{ levelOf(row.level).label }}</GBadge>
          <div class="txt">
            <span class="ellipsis" :class="{ strong: !row.isRead }">{{ row.title }}</span>
            <span class="small faint ellipsis">{{ row.summary }}</span>
          </div>
        </div>
      </template>
      <template #cell-publisherTitle="{ row }"
        ><span class="small muted">{{ row.publisherTitle ?? '公告' }}</span></template
      >
      <template #cell-at="{ row }"
        ><span class="small faint nowrap">{{ fmtTime(row.at) }}</span></template
      >
      <template #cell-state="{ row }">
        <GBadge v-if="row.isExpired" tone="neutral">已到期</GBadge>
        <GBadge v-else-if="!row.isRead" tone="primary" dot>未讀</GBadge>
        <GBadge v-else tone="success" dot>已讀</GBadge>
      </template>
    </GTable>
  </GCard>
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
  width: min(300px, 100%);
}
.t-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.txt {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
</style>
