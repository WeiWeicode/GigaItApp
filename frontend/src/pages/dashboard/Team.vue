<script setup lang="ts">
/** 團隊工作:切到這個 Tab 才呼叫 /dashboard/team */
import { computed } from 'vue';
import { describeError, http } from '@/api/http';
import type { DashboardTeam } from '@/api/types';
import { useAsync } from '@/composables/useAsync';

const { data, error, reload } = useAsync(() => http.get<DashboardTeam>('/dashboard/team'));
const DEPT_ICON: Record<string, string> = { NET: 'wifi', SYS: 'server', DEV: 'code', SEC: 'shield' };
const TONES = ['primary', 'cyan', 'violet', 'success', 'warning', 'info'];

const depts = computed(() =>
  (data.value?.departments ?? []).map((d, i) => ({
    ...d,
    tone: TONES[i % TONES.length]!,
    rate: d.open + d.closed ? (d.closed / (d.open + d.closed)) * 100 : 0,
  })),
);
const workload = computed(() => depts.value.map((d) => ({ label: d.name, value: d.open, hint: `${d.members} 人` })));
const totals = computed(() => ({
  members: depts.value.reduce((s, d) => s + d.members, 0),
  open: depts.value.reduce((s, d) => s + d.open, 0),
  closed: depts.value.reduce((s, d) => s + d.closed, 0),
}));
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <GCard v-if="error && !data">
      <GEmpty tone="danger" icon="alert" title="載入失敗" :description="describeError(error)"><GButton icon="refresh" @click="reload">重試</GButton></GEmpty>
    </GCard>
    <template v-else>
      <div class="grid dept-grid">
        <template v-if="data">
          <GCard v-for="d in depts" :key="d.code" :tone="d.tone" glow>
            <div class="dept-head">
              <span class="ic"><GIcon :name="DEPT_ICON[d.code] ?? 'building'" :size="20" /></span>
              <div>
                <h3>{{ d.name }}</h3>
                <span class="faint xs mono">{{ d.code }}</span>
              </div>
              <span class="spacer" />
              <GRing :value="d.rate" :tone="d.tone" :size="64" :label="`${d.name} 結案率`" />
            </div>
            <div class="dept-stats">
              <div>
                <b class="num">{{ d.members }}</b
                ><span>成員</span>
              </div>
              <div>
                <b class="num">{{ d.open }}</b
                ><span>處理中</span>
              </div>
              <div>
                <b class="num">{{ d.closed }}</b
                ><span>本月結案</span>
              </div>
            </div>
          </GCard>
        </template>
        <template v-else>
          <GCard v-for="i in 4" :key="i"><GSkeleton :lines="4" /></GCard>
        </template>
      </div>

      <div class="grid grid-2">
        <GCard title="各部門待處理工單" subtitle="成員人數為真實資料,工單為模擬" icon="ticket" tone="warning">
          <GBarList v-if="data" :items="workload" colorful unit=" 件" />
          <GSkeleton v-else :lines="6" />
        </GCard>
        <GCard title="本月總覽" icon="sparkles" tone="violet">
          <div v-if="data" class="totals">
            <div class="t">
              <span class="muted small">IT 成員</span><b class="num">{{ totals.members }}</b>
            </div>
            <div class="t">
              <span class="muted small">處理中</span><b class="num">{{ totals.open }}</b>
            </div>
            <div class="t">
              <span class="muted small">已結案</span><b class="num">{{ totals.closed }}</b>
            </div>
            <div class="span">
              <div class="row small muted" style="margin-bottom: 8px">
                結案比例<span class="spacer" /><b class="num">{{ Math.round((totals.closed / Math.max(1, totals.open + totals.closed)) * 100) }}%</b>
              </div>
              <GProgress
                :segments="[
                  { value: totals.closed, tone: 'success', label: '已結案' },
                  { value: totals.open, tone: 'warning', label: '處理中' },
                ]"
                :height="10"
              />
            </div>
          </div>
          <GSkeleton v-else :lines="4" />
        </GCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dept-grid {
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  --gap: 16px;
}
.dept-head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dept-head h3 {
  font-size: var(--fs-lg);
}
.ic {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) calc(var(--tone-bg-alpha) * 100%), transparent);
}
.dept-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-top: 16px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.dept-stats div {
  display: flex;
  flex-direction: column;
}
.dept-stats b {
  font-size: var(--fs-xl);
}
.dept-stats span {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.totals {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}
.t {
  display: flex;
  flex-direction: column;
  padding: 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.t b {
  font-size: var(--fs-2xl);
}
.span {
  grid-column: 1 / -1;
}
</style>
