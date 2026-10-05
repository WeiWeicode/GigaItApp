<script setup lang="ts">
/**
 * 權限試算(giga-Portal PRD I4、Gateway PRD §8.7 POST /api/admin/rbac/preview):與實際登入的計算為同一函式。
 *   依工號:實際使用者(含 AD 群組、所屬公司、個別指派)
 *   依人事條件:公司 + 部門 + 職級 + 職稱(假設條件,不含 AD 群組與個別指派)
 * 結果:命中的角色與來源、可進入的應用,以及所選應用的「選單 → Tab → 按鈕」權限樹(✓ = 擁有)。
 */
import { computed, reactive, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { rbac, type PermNode, type RbacPreview } from '@/api/admin';
import { describeError } from '@/api/http';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

const route = useRoute();
const mode = ref<'emp' | 'facts'>(typeof route.query.emp === 'string' || route.query.mode !== 'facts' ? 'emp' : 'facts');
const form = reactive({ employeeNo: typeof route.query.emp === 'string' ? route.query.emp : '', company: '', deptCode: '', jobLevel: '', title: '' });
const result = ref<RbacPreview | null>(null);
const loading = ref(false);

const depts = useAsync(() => rbac.departments());
const apps = useAsync(() => rbac.apps());
const companyOptions = computed(() => [
  { label: '不指定公司', value: '' },
  ...(depts.data.value?.companies ?? []).map((c) => ({ label: c.name, value: c.name })),
]);

async function run() {
  if (mode.value === 'emp' && !form.employeeNo.trim()) return;
  loading.value = true;
  try {
    result.value = await rbac.preview(
      mode.value === 'emp'
        ? { employeeNo: form.employeeNo.trim() }
        : {
            company: form.company || undefined,
            deptCode: form.deptCode.trim() || undefined,
            jobLevel: form.jobLevel.trim() || undefined,
            title: form.title.trim() || undefined,
          },
    );
  } catch (e) {
    result.value = null;
    toast.fromError(e, '試算失敗');
  } finally {
    loading.value = false;
  }
}
if (form.employeeNo) void run();

const SOURCE: Record<string, { label: string; tone: string }> = {
  default: { label: '所有登入者', tone: 'warning' },
  ad_group: { label: 'AD 群組', tone: 'primary' },
  company: { label: '公司預設', tone: 'cyan' },
  rule: { label: '指派規則', tone: 'violet' },
  user: { label: '個別指派', tone: 'success' },
};

// ---- 應用權限樹 ----
const app = ref('');
watch(
  () => apps.data.value,
  (a) => {
    if (!app.value && a?.items[0]) app.value = a.items.find((x) => x.code === 'it')?.code ?? a.items[0].code;
  },
);
const tree = useAsync(() => (app.value ? rbac.permissionTree(app.value) : Promise.resolve({ items: [] as PermNode[] })), { immediate: false });
watch(app, () => tree.reload());
const appOptions = computed(() => (apps.data.value?.items ?? []).map((a) => ({ label: a.name, value: a.code })));
const granted = computed(() => new Set(result.value?.permissions ?? []));
const KIND: Record<string, string> = { app: '應用', group: '目錄', menu: '選單', tab: 'Tab', button: '按鈕', api: 'API' };
// 選單隨附的 API 讀取權限(選單管理設定)
const allPerms = useAsync(() => rbac.permissions());
const includesOf = computed(() => new Map((allPerms.data.value?.items ?? []).map((p) => [p.code, p.includes ?? []])));
type Flat = { node: PermNode; depth: number; descendants: string[] };
const flat = computed<Flat[]>(() => {
  const out: Flat[] = [];
  const desc = (n: PermNode): string[] => n.children.flatMap((c) => [c.code, ...desc(c)]);
  const walk = (l: PermNode[], d: number) => l.forEach((n) => (out.push({ node: n, depth: d, descendants: desc(n) }), walk(n.children, d + 1)));
  walk(tree.data.value?.items ?? [], 0);
  return out;
});
/** 目錄(group)不授予:底下有任一項擁有即顯示 */
const isOn = (f: Flat) => (f.node.kind === 'group' ? f.descendants.some((c) => granted.value.has(c)) : granted.value.has(f.node.code));
const grantable = computed(() => flat.value.filter((f) => f.node.kind !== 'group'));
const grantedInTree = computed(() => grantable.value.filter((f) => granted.value.has(f.node.code)).length);
</script>

<template>
  <div class="layout">
    <div class="stack" style="--gap: 16px">
      <GCard title="試算條件" icon="filter">
        <form class="stack" style="--gap: 14px" @submit.prevent="run">
          <GSegmented
            v-model="mode"
            :options="[
              { label: '依工號', value: 'emp', icon: 'user' },
              { label: '依人事條件', value: 'facts', icon: 'building' },
            ]"
          />
          <template v-if="mode === 'emp'">
            <GInput v-model="form.employeeNo" label="工號" icon="user" placeholder="例:S112009" required hint="實際使用者:含 AD 群組、所屬公司與個別指派" />
          </template>
          <template v-else>
            <GSelect v-model="form.company" label="公司" :options="companyOptions" icon="building" />
            <GInput v-model="form.deptCode" label="部門代碼" placeholder="例:S1800" hint="規則設定「含下層」時,下層部門也會命中" />
            <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
              <GInput v-model="form.jobLevel" label="職級" placeholder="例:3" />
              <GInput v-model="form.title" label="職稱" placeholder="選填" />
            </div>
            <p class="faint xs" style="margin: 0">假設條件不含 AD 群組與個別指派。</p>
          </template>
          <GButton variant="primary" type="submit" icon="eye" :loading="loading">試算</GButton>
        </form>
      </GCard>

      <GCard v-if="result" title="命中的角色" :subtitle="`${result.roles.length} 個角色 · ${result.permissions.length} 項權限`" icon="shield" tone="violet">
        <div class="stack" style="--gap: 10px">
          <div v-for="r in result.roles" :key="r.code" class="role">
            <code>{{ r.code }}</code>
            <span class="spacer" />
            <GBadge v-for="s in r.sources" :key="s" :tone="SOURCE[s]?.tone ?? 'neutral'">
              {{ SOURCE[s]?.label ?? s }}{{ s === 'rule' && r.ruleIds.length ? ` #${r.ruleIds.join(', #')}` : '' }}
            </GBadge>
          </div>
          <GEmpty v-if="!result.roles.length" compact icon="lock" title="沒有命中任何角色" />
        </div>
      </GCard>

      <GCard v-if="result" title="可進入的應用" icon="apps" tone="success">
        <div class="row" style="--gap: 6px">
          <GBadge v-for="a in result.apps" :key="a.code" tone="success" icon="check">{{ a.name }}</GBadge>
          <span v-if="!result.apps.length" class="faint small">沒有任何應用權限</span>
        </div>
      </GCard>
    </div>

    <GCard
      title="應用權限樹"
      :subtitle="result ? `此應用擁有 ${grantedInTree} / ${grantable.length} 項(目錄依下層顯示)` : '先在左側試算'"
      icon="grid"
      padding="none"
    >
      <template #actions>
        <GSelect v-model="app" :options="appOptions" icon="apps" />
      </template>
      <GEmpty v-if="tree.error.value" tone="danger" compact :description="describeError(tree.error.value)" />
      <GSkeleton v-else-if="tree.loading.value" :lines="8" style="padding: 20px" />
      <GEmpty
        v-else-if="!flat.length"
        compact
        title="此應用尚未登記權限"
        description="由應用的 gateway-rbac.yaml 或 OpenAPI x-permissions 登記(kind / parent)"
      />
      <ul v-else class="tree">
        <li
          v-for="f in flat"
          :key="f.node.code"
          :style="{ '--depth': f.depth }"
          :class="[!result ? '' : isOn(f) ? 'yes' : 'no', { grp: f.node.kind === 'group' }]"
          :title="f.node.kind === 'group' ? '目錄不需授予:底下有任一項擁有時顯示' : ''"
        >
          <span class="st"><GIcon :name="!result ? 'minus' : f.node.kind === 'group' ? 'layers' : isOn(f) ? 'check' : 'x'" :size="14" :stroke="2.6" /></span>
          <GBadge tone="neutral" variant="outline">{{ KIND[f.node.kind] ?? f.node.kind }}</GBadge>
          <span class="name">{{ f.node.name }}</span>
          <code class="faint xs">{{ f.node.code }}</code>
          <span v-if="f.node.kind === 'group' && result" class="faint xs">{{ isOn(f) ? '依下層:顯示' : '依下層:不顯示' }}</span>
          <span v-if="includesOf.get(f.node.code)?.length" class="incl">
            <span class="faint xs">隨附</span>
            <GBadge
              v-for="c in includesOf.get(f.node.code)"
              :key="c"
              :tone="!result ? 'neutral' : granted.has(c) ? 'success' : 'danger'"
              :title="result?.includedBy?.[c] ? `隨選單 ${result.includedBy[c].join('、')} 取得` : ''"
              >{{ c }}</GBadge
            >
          </span>
        </li>
      </ul>
    </GCard>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 360px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: 1fr;
  }
}
.role {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.tree {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}
.tree li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px 6px calc(16px + var(--depth) * 22px);
  border-bottom: 1px solid var(--line);
  min-width: 0;
}
.tree li:last-child {
  border-bottom: 0;
}
.st {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  color: var(--text-3);
  background: var(--glass-soft);
}
.yes .st {
  color: var(--c-success);
  background: color-mix(in srgb, var(--c-success) 16%, transparent);
}
.no .st {
  color: var(--c-danger);
}
.no .name {
  color: var(--text-3);
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 目錄:不授予,依下層顯示 */
.grp .st,
.grp.no .st,
.grp.yes .st {
  color: var(--text-3);
  background: var(--glass-soft);
}
.incl {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-left: auto;
}
</style>
