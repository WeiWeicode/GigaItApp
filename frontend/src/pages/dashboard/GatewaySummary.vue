<script setup lang="ts">
/** Gateway 概況:切到這個 Tab 才以 BFF 管理 API 即時統計(上游、路由、角色 / 權限、待發佈草稿) */
import { computed } from 'vue';
import { describeError } from '@/api/http';
import { AUTH_MODE } from '@/api/format';
import { loadGateway } from '@/composables/dashboard';
import { useAsync } from '@/composables/useAsync';

const { data, error, reload } = useAsync(loadGateway);
const gw = computed(() => data.value?.gateway);

const stats = computed(() => {
  const g = gw.value;
  if (!g) return [];
  return [
    { label: '上游服務', value: g.upstreams ?? 0, icon: 'server', tone: 'primary', to: '/gateway/services' },
    { label: 'API 路由', value: g.routes ?? 0, icon: 'route', tone: 'cyan', to: '/gateway/services/routes' },
    { label: '已發佈', value: g.published ?? 0, icon: 'check-circle', tone: 'success', to: '/gateway/services/routes' },
    { label: '草稿待發佈', value: g.draft ?? 0, icon: 'edit', tone: 'warning', to: '/gateway/services/releases' },
    { label: 'Gateway 權限', value: g.permissions ?? 0, icon: 'key', tone: 'violet', to: '/gateway/rbac' },
    { label: 'Gateway 角色', value: g.roles ?? 0, icon: 'shield', tone: 'info', to: '/gateway/rbac' },
  ];
});
const bySystem = computed(() => (gw.value?.bySystem ?? []).map((s) => ({ label: s.system, value: s.count })).sort((a, b) => b.value - a.value));
const byAuth = computed(() => (gw.value?.byAuthMode ?? []).map((m) => ({ label: AUTH_MODE[m.mode]?.label ?? m.mode, value: m.count })));
const services = computed(() => [...(data.value?.services ?? [])].sort((a, b) => b.p95 - a.p95));
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <GCard v-if="error && !data">
      <GEmpty tone="danger" icon="alert" title="無法取得 Gateway BFF 資料" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <div class="grid stats">
        <template v-if="data">
          <GCard v-for="s in stats" :key="s.label" :tone="s.tone" glow interactive padding="sm" @click="$router.push(s.to)">
            <div class="stat">
              <span class="ic"><GIcon :name="s.icon" :size="20" /></span>
              <div>
                <div class="num big">{{ s.value }}</div>
                <div class="muted small">{{ s.label }}</div>
              </div>
            </div>
          </GCard>
        </template>
        <template v-else>
          <GCard v-for="i in 6" :key="i" padding="sm"><GSkeleton :lines="2" /></GCard>
        </template>
      </div>

      <div class="grid grid-3">
        <GCard title="路由依系統" subtitle="各系統在 Gateway 上架的 API 數" icon="layers">
          <GDonut v-if="data" :items="bySystem" center-label="路由" />
          <GSkeleton v-else height="150px" />
        </GCard>
        <GCard title="驗證模式" subtitle="公開 / 登入即可 / 需權限" icon="fingerprint" tone="violet">
          <GBarList v-if="data" :items="byAuth" colorful unit=" 支" />
          <GSkeleton v-else :lines="4" />
          <p v-if="data" class="faint xs note">公開 API 需 IT 核准;需權限的 API 由角色權限控管(見「權限查詢」)。</p>
        </GCard>
        <GCard title="線上版本" icon="release" tone="success">
          <div v-if="data" class="version">
            <GRing :value="gw?.draft ? 80 : 100" tone="success" :size="96" />
            <div>
              <div class="num huge">v{{ gw?.liveVersion ?? '—' }}</div>
              <div class="muted small">{{ gw?.draft ? `${gw.draft} 支草稿待發佈` : '所有路由皆已發佈' }}</div>
              <GBadge :tone="gw?.source === 'live' ? 'success' : 'warning'" dot style="margin-top: 8px">{{
                gw?.source === 'live' ? 'BFF 即時資料' : 'BFF 模擬資料'
              }}</GBadge>
            </div>
          </div>
          <GSkeleton v-else :lines="3" />
        </GCard>
      </div>

      <GCard title="上游服務健康" subtitle="p95 回應時間與可用率" icon="activity" tone="cyan">
        <template #actions
          ><GBadge v-if="!data || data.mockSections.includes('services')" tone="info">開發中</GBadge
          ><GBadge v-else tone="success" dot>近 1 小時</GBadge></template
        >
        <div v-if="data && services.length" class="svc-grid">
          <div v-for="s in services" :key="s.code" class="svc">
            <div class="row" style="--gap: 8px">
              <GBadge :tone="s.status === 'healthy' ? 'success' : 'warning'" dot>{{ s.status === 'healthy' ? '正常' : '偏慢' }}</GBadge>
              <strong class="mono">{{ s.code }}</strong>
              <span class="spacer" />
              <span class="faint xs">{{ s.system }}</span>
            </div>
            <div class="row metrics">
              <span
                ><b class="num">{{ s.p95 }}</b> ms p95</span
              >
              <span
                ><b class="num">{{ s.availability }}</b
                >% 可用</span
              >
            </div>
            <GProgress :value="Math.min(s.p95, 1000)" :max="1000" :tone="s.status === 'healthy' ? 'success' : 'warning'" :height="6" />
          </div>
        </div>
        <GEmpty v-else-if="data && !data.mockSections.includes('services')" compact icon="activity" title="近 1 小時沒有轉送流量" description="BFF 近 1 小時沒有轉送到上游服務的請求" />
        <GEmpty v-else-if="data" compact icon="activity" title="開發中" description="上游服務健康需要架構觀測權限(observe.data.read),或觀測服務尚未接入" />
        <GSkeleton v-else :lines="4" />
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.stats {
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  --gap: 14px;
}
.stat {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ic {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) calc(var(--tone-bg-alpha) * 100%), transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 25%, transparent);
}
.big {
  font-size: var(--fs-2xl);
  font-weight: 750;
  line-height: 1.1;
}
.huge {
  font-size: var(--fs-3xl);
  font-weight: 800;
}
.note {
  margin: 14px 0 0;
}
.version {
  display: flex;
  align-items: center;
  gap: 20px;
}
.svc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}
.svc {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.metrics {
  font-size: var(--fs-sm);
  color: var(--text-2);
  --gap: 16px;
}
.metrics b {
  color: var(--text);
}
</style>
