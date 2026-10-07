<script setup lang="ts">
/**
 * 公告對象(Gateway NOTIFY-PLAN §4 D4):符合 = 指定工號 ∪ AD 群組 ∪ ((全公司 ∪ 公司 ∪ 部門) ∩ 職級門檻)。
 * 沒有全公司發布權限(notify.announce.publish.all)時只能選本部門(含下層),由 BFF 再檢查一次。
 */
import type { Audience, AudienceDept, ComposeOptions } from '@giganexus/web-kit';
import { computed, ref, watch } from 'vue';

const props = defineProps<{ options: ComposeOptions }>();
const model = defineModel<Audience>({ required: true });

const mode = ref<'all' | 'pick'>(model.value.all ? 'all' : 'pick');
const deptQ = ref('');
const usersText = ref((model.value.users ?? []).join('\n'));
const groupsText = ref((model.value.adGroups ?? []).join('\n'));

const deptName = computed(() => new Map(props.options.depts.map((d) => [d.code, d.name])));
/** 本部門(含下層):沒有全公司權限時可選的部門 */
const allowedDepts = computed(() => {
  if (props.options.canPublishAll) return null;
  const children = new Map<string, string[]>();
  for (const d of props.options.depts) if (d.parentCode) children.set(d.parentCode, [...(children.get(d.parentCode) ?? []), d.code]);
  const out = new Set<string>();
  const stack = [...props.options.ownDepts];
  while (stack.length) {
    const c = stack.pop()!;
    if (out.has(c)) continue;
    out.add(c);
    stack.push(...(children.get(c) ?? []));
  }
  return out;
});
const deptResults = computed(() => {
  const q = deptQ.value.trim().toLowerCase();
  const chosen = new Set((model.value.depts ?? []).map((d) => d.code));
  return props.options.depts
    .filter((d) => !chosen.has(d.code) && (!allowedDepts.value || allowedDepts.value.has(d.code)))
    .filter((d) => !q || d.code.toLowerCase().includes(q) || d.name.toLowerCase().includes(q))
    .slice(0, 30);
});

const tierOptions = computed(() => props.options.jobTiers.map((t) => ({ label: t.name, value: t.code })));
const tier = computed({
  get: () => model.value.jobTier ?? 'all',
  set: (v: string) => update({ jobTier: v === 'all' ? undefined : v }),
});

function update(patch: Partial<Audience>) {
  const next: Audience = { ...model.value, ...patch };
  for (const k of Object.keys(next) as (keyof Audience)[]) {
    const v = next[k];
    if (v === undefined || v === false || (Array.isArray(v) && !v.length)) delete next[k];
  }
  model.value = next;
}

watch(mode, (m) => update({ all: m === 'all' ? true : undefined }));
const lines = (s: string) => [
  ...new Set(
    s
      .split(/[\s,;、]+/)
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];
watch(usersText, (v) => update({ users: lines(v).map((u) => u.toUpperCase()) }));
watch(groupsText, (v) =>
  update({
    adGroups: v
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
  }),
);

function addDept(code: string) {
  update({ depts: [...(model.value.depts ?? []), { code, sub: true }] });
  deptQ.value = '';
}
function toggleSub(d: AudienceDept) {
  update({ depts: (model.value.depts ?? []).map((x) => (x.code === d.code ? { ...x, sub: !x.sub } : x)) });
}
function removeDept(code: string) {
  update({ depts: (model.value.depts ?? []).filter((x) => x.code !== code) });
}
function toggleCompany(id: number, on: boolean) {
  const cur = new Set(model.value.companies ?? []);
  if (on) cur.add(id);
  else cur.delete(id);
  update({ companies: [...cur] });
}
</script>

<template>
  <div class="stack" style="--gap: 12px">
    <GSegmented
      v-if="options.canPublishAll"
      v-model="mode"
      :options="[
        { label: '全公司', value: 'all', icon: 'building' },
        { label: '指定對象', value: 'pick', icon: 'users' },
      ]"
    />
    <p v-else class="small muted">您只能發給本部門(含下層);要發給全公司請洽超級管理員授予「公告:發布(全公司)」權限。</p>

    <template v-if="mode === 'pick' || !options.canPublishAll">
      <div v-if="options.canPublishAll && options.companies.length > 1" class="row wrap" style="--gap: 12px">
        <span class="small muted">公司</span>
        <GCheckbox
          v-for="c in options.companies"
          :key="c.id"
          :label="c.name"
          :model-value="(model.companies ?? []).includes(c.id)"
          @update:model-value="toggleCompany(c.id, $event)"
        />
      </div>

      <div class="stack" style="--gap: 8px">
        <span class="small muted">部門(預設含下層部門)</span>
        <div v-if="model.depts?.length" class="row wrap" style="--gap: 6px">
          <span v-for="d in model.depts" :key="d.code" class="chip">
            <GIcon name="building" :size="13" />{{ deptName.get(d.code) ?? d.code }}
            <button type="button" class="chip-btn" :title="d.sub ? '目前含下層,點選改為只有本部門' : '目前只有本部門,點選改為含下層'" @click="toggleSub(d)">
              {{ d.sub ? '含下層' : '本部門' }}
            </button>
            <button type="button" class="chip-x" aria-label="移除" @click="removeDept(d.code)"><GIcon name="x" :size="12" /></button>
          </span>
        </div>
        <GInput v-model="deptQ" icon="search" placeholder="搜尋部門代碼或名稱後點選加入" clearable />
        <div v-if="deptQ.trim()" class="results">
          <button v-for="d in deptResults" :key="d.code" type="button" class="res" @click="addDept(d.code)">
            <span class="mono xs faint">{{ d.code }}</span
            >{{ d.name }}
          </button>
          <span v-if="!deptResults.length" class="xs faint">沒有符合的部門</span>
        </div>
      </div>

      <div v-if="options.canPublishAll" class="grid grid-2" style="--gap: 12px">
        <GTextarea v-model="usersText" label="指定工號" placeholder="每行或以逗號分隔,例:S112009" :rows="3" mono hint="不受職級門檻限制" />
        <GTextarea v-model="groupsText" label="AD 群組" placeholder="每行一個:群組名稱(CN)或完整 DN" :rows="3" mono hint="只涵蓋登入過的人" />
      </div>
    </template>

    <GSelect v-model="tier" label="職級門檻(套用在全公司 / 公司 / 部門)" :options="tierOptions" icon="shield" />
  </div>
</template>

<style scoped>
.wrap {
  flex-wrap: wrap;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--glass-soft);
  font-size: var(--fs-sm);
}
.chip-btn {
  border: 0;
  border-radius: 999px;
  padding: 2px 8px;
  background: color-mix(in srgb, var(--c-primary) 15%, transparent);
  color: var(--c-primary);
  font: inherit;
  font-size: var(--fs-xs);
  cursor: pointer;
}
.chip-x {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: none;
  color: var(--text-3);
  cursor: pointer;
}
.chip-x:hover {
  background: var(--glass-hover);
  color: var(--c-danger);
}
.results {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 160px;
  overflow-y: auto;
}
.res {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border: 1px dashed var(--line-strong);
  border-radius: 10px;
  background: none;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text);
  cursor: pointer;
}
.res:hover {
  border-style: solid;
  background: var(--glass-soft);
}
</style>
