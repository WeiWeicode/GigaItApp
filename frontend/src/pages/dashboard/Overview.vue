<script setup lang="ts">
/**
 * 營運總覽:上半部(KPI、流量、告警)進頁即載入;下半部(工單、最近操作)捲動到附近才載入(GLazy)
 * KPI / 今日流量 / 系統告警優先取架構觀測(giga-observe,W9-11);沒有權限或尚未接入時沿用 itapp-api 的資料(顯示「開發中」)
 */
import { computed, ref } from 'vue';
import { useAuth } from '@/api/auth';
import { describeError } from '@/api/http';
import { fromNow } from '@/api/format';
import { loadObserveOverview, loadOverview } from '@/composables/dashboard';
import { useAsync } from '@/composables/useAsync';
import LatestAnnouncements from '@/components/notify/LatestAnnouncements.vue';
import WorkSection from './sections/WorkSection.vue';

const { me } = useAuth();
const { data: itData, loading: itLoading, error, reload: reloadOverview } = useAsync(loadOverview);
const obs = useAsync(loadObserveOverview);
/** 架構觀測有資料時以它為準 */
const data = computed(() => obs.data.value ?? itData.value);
const live = computed(() => !!obs.data.value);
const loading = computed(() => itLoading.value || obs.loading.value);
const refreshKey = ref(0);
function reload() {
  refreshKey.value++;
  return Promise.all([reloadOverview(), obs.reload()]);
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
      // 示範資料的錯誤數很小,放大 20 倍才看得見;真實資料照原值
      { name: '錯誤數', values: t.map((h) => h.errors * (live.value ? 1 : 20)), color: 'var(--c-danger)', area: false },
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
            <GBadge tone="primary" icon="building">{{ me?.user.department ?? '未指定部門' }}</GBadge>
            <GBadge v-if="me?.user.title" tone="violet" icon="shield">{{ me.user.title }}</GBadge>
            <GBadge v-if="live" tone="neutral" icon="info" title="KPI、流量與告警為架構觀測的即時資料;待處理工單為開發中功能">工單開發中</GBadge>
            <GBadge v-else-if="data" tone="neutral" icon="info" title="KPI、流量、工單、告警為開發中功能;Gateway 統計、部門人數與操作紀錄為真實資料"
              >部分功能開發中</GBadge
            >
          </div>
        </div>
        <div class="spacer" />
        <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
      </div>
    </GCard>

    <!-- 最新公告(Gateway NOTIFY-PLAN):經 /ws/notify 即時更新 -->
    <LatestAnnouncements />

    <!-- KPI / 流量 / 告警來自 itapp-api(經 BFF /api/it/*);連不到時只影響這幾個區塊,其餘照常顯示 -->
    <GCard v-if="error && !data && !live" padding="sm" tone="warning">
      <div class="row" style="--gap: 8px">
        <GIcon name="alert-circle" :size="16" />
        <span class="small">IT 系統 API 暫時無法取得,KPI、流量與告警以「開發中」顯示:{{ describeError(error) }}</span>
        <span class="spacer" />
        <GButton size="sm" icon="refresh" @click="reload">重試</GButton>
      </div>
    </GCard>

    <div class="grid kpis">
      <template v-if="data || error">
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
        <template #actions
          ><GBadge v-if="live" tone="success" dot>即時</GBadge><GBadge v-else tone="info">開發中</GBadge></template
        >
        <GAreaChart v-if="data && (data.traffic?.length ?? 0) > 0" :labels="traffic.labels" :series="traffic.series" :height="250" />
        <GEmpty v-else-if="live" compact icon="activity" title="今天還沒有 API 呼叫" />
        <GEmpty v-else-if="data || error" compact icon="activity" title="開發中" description="API 流量監控功能開發中，尚未接入即時指標來源" />
        <GSkeleton v-else height="250px" />
      </GCard>
      <GCard title="系統告警" icon="bell" tone="neutral">
        <template #actions
          ><RouterLink v-if="live" to="/gateway/observe" class="xs">架構觀測</RouterLink><GBadge v-else tone="info">開發中</GBadge></template
        >
        <ul v-if="data && data.alerts.length" class="alerts">
          <li v-for="a in data.alerts" :key="a.title" :class="`tone-${a.level}`">
            <span class="al-ic"><GIcon :name="ALERT[a.level] ?? 'info'" :size="16" /></span>
            <div>
              <strong>{{ a.title }}</strong>
              <span class="faint xs">{{ fromNow(a.at) }}</span>
            </div>
          </li>
        </ul>
        <GEmpty v-else-if="live" compact icon="check-circle" tone="success" title="所有服務正常" description="近 15 分鐘沒有系統告警" />
        <GEmpty v-else-if="data || error" compact icon="bell" title="開發中" description="系統告警模組開發中" />
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
