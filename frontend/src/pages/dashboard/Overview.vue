<script setup lang="ts">
/** 營運總覽:上半部(KPI、流量、告警)進頁即載入;下半部(工單、最近操作)捲動到附近才載入(GLazy) */
import { computed, ref } from 'vue';
import { useAuth } from '@/api/auth';
import { describeError, http } from '@/api/http';
import { fromNow } from '@/api/format';
import type { DashboardOverview } from '@/api/types';
import { useAsync } from '@/composables/useAsync';
import WorkSection from './sections/WorkSection.vue';

const { me } = useAuth();
const { data, loading, error, reload: reloadOverview } = useAsync(() => http.get<DashboardOverview>('/dashboard/overview'));
const refreshKey = ref(0);
function reload() {
  refreshKey.value++;
  return reloadOverview();
}

const greeting = computed(() => {
  const h = new Date().getHours();
  return h < 11 ? '早安' : h < 14 ? '午安' : h < 18 ? '下午好' : '晚安';
});
const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

const KPI_ICON: Record<string, string> = { calls: 'zap', availability: 'check-circle', latency: 'gauge', tickets: 'ticket', alerts: 'shield' };
const DEFAULT_KPIS = [
  { key: 'calls', label: '今日 API 呼叫', hint: 'API 監控開發中' },
  { key: 'availability', label: '服務可用率', hint: '監控系統開發中' },
  { key: 'latency', label: '平均回應時間', hint: 'APM 整合開發中' },
  { key: 'tickets', label: '待處理工單', hint: '工單整合開發中' },
  { key: 'alerts', label: '資安告警', hint: '告警整合開發中' },
];

const displayKpis = computed(() => {
  if (data.value?.kpis && data.value.kpis.length > 0) {
    return data.value.kpis.map((k) => ({
      ...k,
      hint: k.hint ?? '較昨日',
    }));
  }
  return DEFAULT_KPIS.map((k) => ({
    key: k.key,
    label: k.label,
    value: '開發中',
    unit: '',
    delta: undefined,
    trend: [],
    tone: 'neutral',
    hint: k.hint,
  }));
});

const traffic = computed(() => {
  const t = data.value?.traffic ?? [];
  return {
    labels: t.map((h) => `${String(h.hour).padStart(2, '0')}:00`),
    series: [
      { name: '請求數', values: t.map((h) => h.requests), color: 'var(--chart-1)' },
      { name: '錯誤數', values: t.map((h) => h.errors * 20), color: 'var(--c-danger)', area: false },
    ],
  };
});
const ALERT = { danger: 'alert', warning: 'alert-circle', info: 'info' } as Record<string, string>;
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <GCard glow padding="lg" class="hero">
      <div class="hero-row">
        <GAvatar :name="me?.user.name ?? '?'" :size="56" />
        <div class="hero-text">
          <h2>{{ greeting }},{{ me?.user.name }}</h2>
          <p class="muted">{{ today }}</p>
          <div class="row" style="--gap: 6px; margin-top: 8px">
            <GBadge tone="primary" icon="building">{{ me?.department?.name }}</GBadge>
            <GBadge tone="violet" icon="shield">{{ me?.level.name }}</GBadge>
            <GBadge v-if="data" tone="neutral" icon="info" title="KPI、流量、工單、告警為開發中功能;Gateway 統計、部門人數與操作紀錄為真實資料"
              >部分功能開發中</GBadge
            >
          </div>
        </div>
        <div class="spacer" />
        <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
      </div>
    </GCard>

    <GCard v-if="error && !data">
      <GEmpty tone="danger" icon="alert" title="儀表板載入失敗" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <div class="grid kpis">
        <template v-if="data">
          <GStatCard
            v-for="k in displayKpis"
            :key="k.key"
            :label="k.label"
            :value="k.value"
            :unit="k.unit"
            :delta="k.delta"
            :delta-unit="k.key === 'tickets' || k.key === 'alerts' ? ' 件' : k.key === 'availability' ? ' pt' : '%'"
            :trend="k.trend"
            :tone="k.tone"
            :icon="KPI_ICON[k.key]"
            :invert="k.key === 'latency' || k.key === 'tickets' || k.key === 'alerts'"
            :hint="k.hint"
          />
        </template>
        <template v-else>
          <GCard v-for="i in 5" :key="i" padding="sm"><GSkeleton :lines="3" /></GCard>
        </template>
      </div>

      <div class="grid grid-3">
        <GCard class="span-2" title="今日 API 流量" subtitle="每小時請求數與錯誤數" icon="activity">
          <template #actions><GBadge tone="info">開發中</GBadge></template>
          <GAreaChart v-if="data && (data.traffic?.length ?? 0) > 0" :labels="traffic.labels" :series="traffic.series" :height="250" />
          <GEmpty v-else-if="data" compact icon="activity" title="開發中" description="API 流量監控功能開發中，尚未接入即時指標來源" />
          <GSkeleton v-else height="250px" />
        </GCard>
        <GCard title="系統告警" icon="bell" tone="neutral">
          <template #actions><GBadge tone="info">開發中</GBadge></template>
          <ul v-if="data && data.alerts.length" class="alerts">
            <li v-for="a in data.alerts" :key="a.title" :class="`tone-${a.level}`">
              <span class="al-ic"><GIcon :name="ALERT[a.level] ?? 'info'" :size="16" /></span>
              <div>
                <strong>{{ a.title }}</strong>
                <span class="faint xs">{{ fromNow(a.at) }}</span>
              </div>
            </li>
          </ul>
          <GEmpty v-else-if="data" compact icon="bell" title="開發中" description="系統告警模組開發中" />
          <GSkeleton v-else :lines="5" />
        </GCard>
      </div>

      <GLazy min-height="360px">
        <WorkSection :refresh-key="refreshKey" />
        <template #placeholder>
          <div class="grid grid-3">
            <GCard class="span-2"><GSkeleton :lines="7" /></GCard>
            <GCard><GSkeleton :lines="7" /></GCard>
          </div>
        </template>
      </GLazy>
    </template>
  </div>
</template>

<style scoped>
.hero-row {
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.hero-text h2 {
  font-size: var(--fs-xl);
  font-weight: 750;
}
.hero-text p {
  margin: 2px 0 0;
}
.kpis {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  --gap: 16px;
}
.alerts {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.alerts li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--tone) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 20%, transparent);
}
.alerts li > div {
  display: flex;
  flex-direction: column;
}
.al-ic {
  color: var(--tone);
  margin-top: 2px;
}
</style>
