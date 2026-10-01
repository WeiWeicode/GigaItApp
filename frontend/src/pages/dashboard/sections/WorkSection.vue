<script setup lang="ts">
/** 儀表板「近期工單 + 最近操作」:由 Overview 以 GLazy 包住,捲動到附近才掛載並呼叫 /dashboard/work */
import { watch } from 'vue';
import { describeError, http } from '@/api/http';
import { ACTION_LABEL, fromNow } from '@/api/format';
import type { DashboardWork } from '@/api/types';
import { useAsync } from '@/composables/useAsync';

const props = defineProps<{ refreshKey?: number }>();
const { data, error, reload } = useAsync(() => http.get<DashboardWork>('/dashboard/work'));
watch(() => props.refreshKey, reload);

const PRIORITY = { high: { label: '高', tone: 'danger' }, medium: { label: '中', tone: 'warning' }, low: { label: '低', tone: 'neutral' } } as const;
const STATUS = {
  open: { label: '待處理', tone: 'warning' },
  in_progress: { label: '處理中', tone: 'info' },
  resolved: { label: '已解決', tone: 'success' },
} as const;
</script>

<template>
  <GCard v-if="error && !data">
    <GEmpty compact tone="danger" icon="alert" title="工單與操作紀錄載入失敗" :description="describeError(error)"
      ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
    >
  </GCard>
  <div v-else class="grid grid-3">
    <GCard class="span-2" title="近期工單" icon="ticket" padding="none">
      <template #actions><GBadge tone="info">開發中</GBadge></template>
      <GTable
        :loading="!data"
        :rows="data?.tickets ?? []"
        row-key="id"
        :page-size="0"
        empty-title="開發中"
        empty-description="IT 工單系統整合開發中，尚未接入工單資料"
        :columns="[
          { key: 'id', label: '單號', mono: true, width: '130px' },
          { key: 'title', label: '主旨' },
          { key: 'dept', label: '部門', hideSm: true },
          { key: 'priority', label: '優先', align: 'center' },
          { key: 'status', label: '狀態' },
          { key: 'updatedAt', label: '更新', hideSm: true },
        ]"
      >
        <template #cell-dept="{ row }"
          ><span class="muted">{{ row.deptName }}</span></template
        >
        <template #cell-priority="{ row }"
          ><GBadge :tone="PRIORITY[row.priority]?.tone ?? 'neutral'">{{ PRIORITY[row.priority]?.label ?? row.priority }}</GBadge></template
        >
        <template #cell-status="{ row }"
          ><GBadge :tone="STATUS[row.status]?.tone ?? 'neutral'" dot>{{ STATUS[row.status]?.label ?? row.status }}</GBadge></template
        >
        <template #cell-updatedAt="{ row }"
          ><span class="faint small nowrap">{{ fromNow(row.updatedAt) }}</span></template
        >
      </GTable>
    </GCard>
    <GCard title="最近操作" :subtitle="data?.activityScope === 'self' ? '只顯示自己的操作' : '全部人員'" icon="audit" tone="cyan">
      <ol v-if="data?.activity.length" class="timeline">
        <li v-for="a in data.activity" :key="a.id">
          <i :class="a.result === 'success' ? 'ok' : 'fail'" />
          <div>
            <strong>{{ a.actor }}</strong> {{ ACTION_LABEL[a.action] ?? a.action }}
            <span v-if="a.target" class="mono small muted">{{ a.target }}</span>
            <div class="faint xs">{{ fromNow(a.at) }}</div>
          </div>
        </li>
      </ol>
      <GEmpty v-else-if="data" compact icon="audit" title="尚無操作紀錄" />
      <GSkeleton v-else :lines="6" />
    </GCard>
  </div>
</template>

<style scoped>
.timeline {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-size: var(--fs-sm);
}
.timeline li {
  display: flex;
  gap: 12px;
  position: relative;
}
.timeline li:not(:last-child)::after {
  content: '';
  position: absolute;
  left: 4px;
  top: 14px;
  bottom: -14px;
  width: 1px;
  background: var(--line-strong);
}
.timeline i {
  flex: none;
  width: 9px;
  height: 9px;
  margin-top: 6px;
  border-radius: 50%;
}
.timeline i.ok {
  background: var(--c-success);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-success) 20%, transparent);
}
.timeline i.fail {
  background: var(--c-danger);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--c-danger) 20%, transparent);
}
</style>
