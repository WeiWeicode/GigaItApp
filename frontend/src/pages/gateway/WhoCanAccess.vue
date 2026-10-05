<script setup lang="ts">
/**
 * 權限查詢 › 誰能存取(唯讀,GET /api/admin/permissions/:code/who-can-access,P2-6):選一個權限,列出擁有它的角色
 * 與角色如何被指派(所有登入者 / AD 群組 / 公司預設 / 指派規則 / 個別使用者)、直接授予的部門與個人(v0.12),
 * 以及具備此權限的 API Key。設定請到「系統管理 › 權限設定」。
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { gw, rbac as rbacApi, type WhoCanAccess } from '@/api/admin';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';
import { useAsync } from '@/composables/useAsync';

const route = useRoute();
const router = useRouter();
const { data: rbac, bySystem } = useBffRbac();
const tiers = useAsync(() => rbacApi.jobTiers());
const tierName = (code: string) => tiers.data.value?.items.find((t) => t.code === code)?.name ?? code;

const q = ref('');
const selected = ref<string>(typeof route.query.permission === 'string' ? route.query.permission : '');
// 需要目前這個權限的路由:以權限代碼搜尋(後端 LIKE),再取完全相符者;選擇的權限變更時重新查詢
const routes = useAsync(() => gw.routes({ q: selected.value, page: 1, pageSize: 200 }), { immediate: false });
const result = ref<WhoCanAccess | null>(null);
const loading = ref(false);
const error = ref<Error | null>(null);

const filteredGroups = computed(() => {
  const k = q.value.trim().toLowerCase();
  return bySystem.value
    .map((g) => ({ ...g, perms: g.perms.filter((p) => !k || p.code.includes(k) || p.name.toLowerCase().includes(k)) }))
    .filter((g) => g.perms.length);
});
/** 指派規則的條件文字(公司 / 部門〔含下層〕/ 職級 / 職稱) */
function ruleText(x: WhoCanAccess['roles'][number]['rules'][number]): string {
  return [
    x.company,
    x.deptCode ? `${x.deptCode}${x.includeSubDepts ? '(含下層)' : ''}` : null,
    x.jobLevels?.length ? `職級 ${x.jobLevels.join('、')}` : null,
    x.title ? `職稱「${x.title}」` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}
const perm = computed(() => rbac.value?.permissions.find((p) => p.code === selected.value));
const relatedRoutes = computed(() => (routes.data.value?.items ?? []).filter((r) => r.permissionCode === selected.value && r.status !== 'disabled'));

watch(
  selected,
  async (code) => {
    router.replace({ query: code ? { permission: code } : {} });
    result.value = null;
    if (!code) return;
    void routes.reload();
    loading.value = true;
    error.value = null;
    try {
      result.value = await rbacApi.whoCanAccess(code);
    } catch (e) {
      error.value = e as Error;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

// 預設選第一個
watch(
  () => bySystem.value,
  (g) => {
    if (!selected.value && g[0]?.perms[0]) selected.value = g[0].perms[0].code;
  },
  { immediate: true },
);
</script>

<template>
  <div class="layout">
    <GCard class="picker" padding="none">
      <div class="search"><GInput v-model="q" icon="search" placeholder="搜尋權限代碼或名稱" clearable /></div>
      <div class="list">
        <GSkeleton v-if="!rbac" :lines="10" style="padding: 12px" />
        <div v-for="g in filteredGroups" :key="g.system" class="grp">
          <p class="grp-title">{{ g.system }}</p>
          <button v-for="p in g.perms" :key="p.code" type="button" class="perm-btn" :class="{ active: selected === p.code }" @click="selected = p.code">
            <span>{{ p.name }}</span>
            <code>{{ p.code }}</code>
          </button>
        </div>
        <GEmpty v-if="rbac && !filteredGroups.length" compact title="找不到符合的權限" />
      </div>
    </GCard>

    <div class="stack result" style="--gap: 16px">
      <GCard v-if="perm" glow tone="violet">
        <div class="head">
          <span class="ic"><GIcon name="key" :size="22" /></span>
          <div>
            <h2>{{ perm.name }}</h2>
            <code class="muted">{{ perm.code }}</code>
          </div>
        </div>
        <p v-if="perm.description" class="muted small" style="margin: 12px 0 0">{{ perm.description }}</p>
      </GCard>

      <GCard v-if="error">
        <GEmpty tone="danger" icon="alert" title="查詢失敗" :description="describeError(error)" />
      </GCard>
      <GCard v-else-if="loading"><GSkeleton :lines="6" /></GCard>
      <template v-else-if="result">
        <GCard v-if="!result.roles.length && !result.direct?.departments.length && !result.direct?.users.length">
          <GEmpty icon="shield" tone="warning" title="沒有任何人擁有此權限" description="沒有角色、部門或個人擁有它;需要此權限的 API 目前沒有人可以呼叫。" />
        </GCard>
        <GCard v-if="result.direct?.departments.length || result.direct?.users.length" title="直接授予(不經角色)" icon="user-check" tone="cyan">
          <div class="assign">
            <div v-if="result.direct?.departments.length">
              <p class="lbl"><GIcon name="building" :size="13" /> 部門</p>
              <GBadge v-for="d in result.direct.departments" :key="`${d.deptCode}|${d.jobTier}`" tone="info" :title="d.deptCode"
                >{{ d.name }}({{ tierName(d.jobTier) }}{{ d.includeSubDepts ? ',含下層' : '' }})</GBadge
              >
            </div>
            <div v-if="result.direct?.users.length">
              <p class="lbl"><GIcon name="user" :size="13" /> 個人</p>
              <GBadge v-for="u in result.direct.users" :key="u.employeeNo" tone="violet" :title="u.reason ?? ''"
                >{{ u.name }}({{ u.employeeNo }}){{ u.validTo ? ` 至 ${u.validTo.slice(0, 10)}` : '' }}</GBadge
              >
            </div>
          </div>
        </GCard>
        <div v-if="result.roles.length" class="grid grid-auto" style="--min: 280px; --gap: 14px">
          <GCard v-for="r in result.roles" :key="r.code" :title="r.name" :subtitle="r.code" icon="shield" :tone="r.everyone ? 'warning' : 'primary'">
            <template #actions><GBadge v-if="r.everyone" tone="warning" icon="users">所有登入者</GBadge></template>
            <div class="assign">
              <div v-if="r.adGroups.length">
                <p class="lbl"><GIcon name="users" :size="13" /> AD 群組</p>
                <code v-for="g in r.adGroups" :key="g" class="chip">{{ g.split(',')[0] }}</code>
              </div>
              <div v-if="r.companies.length">
                <p class="lbl"><GIcon name="building" :size="13" /> 公司預設</p>
                <GBadge v-for="c in r.companies" :key="c" tone="cyan">{{ c }}</GBadge>
              </div>
              <div v-if="r.rules.length">
                <p class="lbl"><GIcon name="workflow" :size="13" /> 指派規則</p>
                <GBadge v-for="x in r.rules" :key="x.ruleId" tone="violet">{{ ruleText(x) }}</GBadge>
              </div>
              <div v-if="r.users.length">
                <p class="lbl"><GIcon name="user" :size="13" /> 個別指派</p>
                <GBadge v-for="u in r.users" :key="u.employeeNo" tone="neutral" :title="u.validTo ? `至 ${u.validTo.slice(0, 10)}` : ''"
                  >{{ u.name }}({{ u.employeeNo }})</GBadge
                >
              </div>
              <p v-if="!r.everyone && !r.adGroups.length && !r.companies.length && !r.rules.length && !r.users.length" class="faint small">尚未指派給任何人</p>
            </div>
          </GCard>
        </div>
      </template>

      <GCard v-if="result?.apiClients.length" title="具備此權限的 API Key" icon="key" padding="sm">
        <div class="row" style="--gap: 6px">
          <GBadge v-for="c in result.apiClients" :key="c.code" :tone="c.active ? 'cyan' : 'neutral'" :title="c.name"
            >{{ c.code }}{{ c.active ? '' : '(停用 / 過期)' }}</GBadge
          >
        </div>
      </GCard>

      <GCard v-if="selected" title="需要此權限的 API" :subtitle="`${relatedRoutes.length} 支`" icon="route" padding="none">
        <GTable
          :loading="routes.loading.value"
          :rows="relatedRoutes"
          row-key="routeCode"
          :page-size="0"
          dense
          empty-title="沒有路由使用此權限"
          :columns="[
            { key: 'method', label: '方法', width: '80px' },
            { key: 'publicPath', label: '對外路徑' },
            { key: 'name', label: '名稱', hideSm: true },
          ]"
        >
          <template #cell-method="{ row }"
            ><GBadge variant="outline" mono>{{ row.method }}</GBadge></template
          >
          <template #cell-publicPath="{ row }"
            ><code>{{ row.publicPath }}</code></template
          >
        </GTable>
      </GCard>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
.picker {
  position: sticky;
  top: 92px;
}
.search {
  padding: 14px;
  border-bottom: 1px solid var(--line);
}
.list {
  max-height: calc(100vh - 260px);
  overflow: auto;
  padding: 6px 8px 12px;
}
.grp-title {
  margin: 12px 8px 4px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}
.perm-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: none;
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}
.perm-btn:hover {
  background: var(--glass-soft);
}
.perm-btn.active {
  background: var(--glass-strong);
  border-color: color-mix(in srgb, var(--c-violet) 40%, transparent);
  box-shadow: var(--shadow-sm);
}
.perm-btn span {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.perm-btn code {
  font-size: 11px;
  color: var(--text-3);
}
.head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.head h2 {
  font-size: var(--fs-xl);
}
.ic {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 14px;
  color: #fff;
  background: linear-gradient(135deg, var(--c-violet), var(--c-primary));
  box-shadow: 0 8px 24px rgb(168 85 247 / 0.35);
}
.assign {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.assign > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.lbl {
  width: 100%;
  margin: 0;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--text-3);
  display: flex;
  align-items: center;
  gap: 4px;
}
.chip {
  font-size: var(--fs-xs);
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .picker {
    position: static;
  }
  .list {
    max-height: 280px;
  }
}
</style>
