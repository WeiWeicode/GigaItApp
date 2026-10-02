<script setup lang="ts">
/**
 * 儀表板「近期工單 + 最近操作」:由 Overview 以 GLazy 包住,捲動到附近才掛載。
 * 工單取自 itapp-api(/api/it/dashboard/work),最近操作取自 Gateway 稽核(需 gw.admin.audit.read);兩者各自載入,互不影響。
 */
import { computed, watch } from 'vue';
import { describeError } from '@/api/http';
import { ACTION_LABEL, fromNow } from '@/api/format';
import { loadActivity, loadTickets } from '@/composables/dashboard';
import { useAsync } from '@/composables/useAsync';

const props = defineProps<{ refreshKey?: number }>();
const tickets = useAsync(loadTickets);
const act = useAsync(loadActivity);
const data = computed(() => (tickets.data.value ? { tickets: tickets.data.value.tickets } : null));
const error = computed(() => tickets.error.value);
const reload = () => Promise.all([tickets.reload(), act.reload()]);
watch(() => props.refreshKey, reload);

const PRIORITY = { high: { label: '高', tone: 'danger' }, medium: { label: '中', tone: 'warning' }, low: { label: '低', tone: 'neutral' } } as const;
const STATUS = {
  open: { label: '待處理', tone: 'warning' },
  in_progress: { label: '處理中', tone: 'info' },
  resolved: { label: '已解決', tone: 'success' },
} as const;
</script>

<template>
  <div class="grid grid-3">
    <GCard class="span-2" title="近期工單" icon="ticket" padding="none">
      <template #actions><GBadge tone="info">開發中</GBadge></template>
      <GEmpty v-if="error && !data" compact tone="danger" icon="alert" title="工單載入失敗" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
      <GTable
        v-else
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
    <GCard title="最近操作" subtitle="Gateway 管理操作(全部人員)" icon="audit" tone="cyan">
      <GEmpty v-if="act.error.value" compact tone="danger" :description="describeError(act.error.value)" />
      <GEmpty v-else-if="act.data.value === null && !act.loading.value" compact icon="lock" title="需要稽核查詢權限" />
      <ol v-else-if="act.data.value?.length" class="timeline">
        <li v-for="a in act.data.value" :key="a.id">
          <i :class="a.result === 'success' ? 'ok' : 'fail'" />
          <div>
            <strong>{{ a.actor }}</strong> {{ ACTION_LABEL[a.action] ?? a.action }}
            <span v-if="a.target" class="mono small muted">{{ a.target }}</span>
            <div class="faint xs">{{ fromNow(a.at) }}</div>
          </div>
        </li>
      </ol>
      <GEmpty v-else-if="act.data.value" compact icon="audit" title="最近 30 天沒有操作紀錄" />
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
