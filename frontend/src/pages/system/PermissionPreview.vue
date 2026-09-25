<script setup lang="ts">
/** 權限試算:選職級 + 部門,即時算出有效權限與看得到的選單(後端 /rbac/preview 計算,與實際登入結果一致) */
import { computed, ref, watch } from 'vue';
import { http } from '@/api/http';
import { LEVEL_TONE } from '@/api/format';
import type { LevelCode, RbacCatalog } from '@/api/types';
import { useRbacCatalog } from '@/composables/rbacCatalog';

const { data, byModule } = useRbacCatalog();
const level = ref<LevelCode>('senior');
const dept = ref('DEV');
const result = ref<{ permissions: string[]; menus: RbacCatalog['menus'] } | null>(null);
const loading = ref(false);

watch(
  [level, dept],
  async () => {
    loading.value = true;
    try {
      result.value = await http.get('/rbac/preview', { query: { level: level.value, dept: dept.value } });
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

const granted = computed(() => new Set(result.value?.permissions ?? []));
/** 被部門限制擋掉的權限(職級有、但部門不在清單) */
const blocked = computed(() => {
  const lp = new Set(data.value?.levelPermissions[level.value] ?? []);
  return new Set([...lp].filter((p) => !granted.value.has(p)));
});
const deptName = (c: string) => data.value?.departments.find((d) => d.code === c)?.name ?? c;
</script>

<template>
  <div class="layout">
    <div class="stack" style="--gap: 16px">
      <GCard title="試算條件" icon="filter">
        <div class="stack" style="--gap: 14px">
          <div>
            <p class="lbl">職級</p>
            <GSegmented v-model="level" :options="(data?.levels ?? []).map((l) => ({ label: l.name, value: l.code }))" />
          </div>
          <GSelect v-model="dept" label="部門" icon="building" :options="(data?.departments ?? []).map((d) => ({ label: d.name, value: d.code }))" />
          <div class="summary">
            <div>
              <b class="num">{{ granted.size }}</b
              ><span>有效權限</span>
            </div>
            <div>
              <b class="num warn">{{ blocked.size }}</b
              ><span>被部門擋下</span>
            </div>
            <div>
              <b class="num">{{ result?.menus.reduce((s, g) => s + g.children.length, 0) ?? 0 }}</b
              ><span>可見選單</span>
            </div>
          </div>
        </div>
      </GCard>

      <GCard title="選單預覽" subtitle="這個人登入後看到的側邊選單" icon="menu" tone="violet">
        <div class="menu-preview" :class="{ loading }">
          <div v-for="g in result?.menus ?? []" :key="g.key" class="mg">
            <div class="mg-t"><GIcon :name="g.icon" :size="16" />{{ g.title }}</div>
            <div v-for="c in g.children" :key="c.key" class="mi"><i />{{ c.title }}</div>
          </div>
          <GEmpty v-if="result && !result.menus.length" compact icon="lock" title="沒有任何可見選單" />
        </div>
      </GCard>
    </div>

    <GCard title="權限明細" :subtitle="`${data?.levels.find((l) => l.code === level)?.name} · ${deptName(dept)}`" icon="key" padding="none">
      <template #actions
        ><GBadge :tone="LEVEL_TONE[level]">{{ data?.levels.find((l) => l.code === level)?.name }}</GBadge></template
      >
      <div v-for="m in byModule" :key="m.code" class="mod">
        <p class="mod-t">{{ m.name }}</p>
        <div v-for="p in m.perms" :key="p.code" class="perm" :class="granted.has(p.code) ? 'yes' : blocked.has(p.code) ? 'blocked' : 'no'">
          <span class="st">
            <GIcon :name="granted.has(p.code) ? 'check' : blocked.has(p.code) ? 'building' : 'minus'" :size="14" :stroke="2.6" />
          </span>
          <div class="pinfo">
            <b>{{ p.name }}</b>
            <code>{{ p.code }}</code>
          </div>
          <span class="spacer" />
          <GBadge v-if="blocked.has(p.code)" tone="warning" icon="building">限 {{ data?.deptRestrictions[p.code]?.map(deptName).join('、') }}</GBadge>
          <GBadge :tone="p.type === 'page' ? 'info' : 'neutral'" variant="outline">{{ p.type === 'page' ? '頁面' : '按鈕' }}</GBadge>
        </div>
      </div>
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
.lbl {
  margin: 0 0 6px;
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text-2);
}
.summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.summary div {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.summary b {
  font-size: var(--fs-2xl);
}
.summary b.warn {
  color: var(--c-warning);
}
.summary span {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.menu-preview {
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: opacity var(--dur);
}
.menu-preview.loading {
  opacity: 0.5;
}
.mg-t {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 650;
  padding: 6px 4px;
}
.mi {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: 12px;
  padding: 6px 10px;
  border-left: 1px solid var(--line-strong);
  font-size: var(--fs-sm);
  color: var(--text-2);
}
.mi i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--c-violet);
  margin-left: -14px;
}
.mod {
  padding: 4px 0 8px;
}
.mod-t {
  margin: 12px 20px 4px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--text-3);
}
.perm {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 20px;
  flex-wrap: wrap;
  transition: opacity var(--dur);
}
.perm.no {
  opacity: 0.45;
}
.st {
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  flex: none;
  border: 1px dashed var(--line-strong);
  color: var(--text-3);
}
.yes .st {
  border: 0;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 4px 12px rgb(99 102 241 / 0.35);
}
.blocked .st {
  border: 1px solid color-mix(in srgb, var(--c-warning) 50%, transparent);
  color: var(--c-warning);
  background: color-mix(in srgb, var(--c-warning) 12%, transparent);
}
.pinfo {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.pinfo b {
  font-size: var(--fs-sm);
  font-weight: 600;
}
.pinfo code {
  font-size: 11px;
  color: var(--text-3);
}
@media (max-width: 960px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
