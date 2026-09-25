<script setup lang="ts">
/** 職級 × 權限矩陣:有 sys.perm.edit 時可直接勾選,下方儲存列一次送出有變更的職級;系統管理員固定全部 */
import { computed, ref, watch } from 'vue';
import { can } from '@/api/auth';
import { describeError, http } from '@/api/http';
import { LEVEL_TONE } from '@/api/format';
import type { LevelCode } from '@/api/types';
import { useRbacCatalog } from '@/composables/rbacCatalog';
import { confirm, toast } from '@/ui';

const { data, error, byModule, reload } = useRbacCatalog();
const editable = computed(() => can('sys.perm.edit'));

const draft = ref<Record<string, Set<string>>>({});
function resetDraft() {
  draft.value = Object.fromEntries(Object.entries(data.value?.levelPermissions ?? {}).map(([l, ps]) => [l, new Set(ps)]));
}
watch(data, resetDraft, { immediate: true });

const levels = computed(() => data.value?.levels ?? []);
const deptName = (code: string) => data.value?.departments.find((d) => d.code === code)?.name ?? code;

function toggle(level: LevelCode, perm: string, on: boolean) {
  const s = new Set(draft.value[level]);
  if (on) s.add(perm);
  else s.delete(perm);
  draft.value = { ...draft.value, [level]: s };
}
const changed = computed(() =>
  levels.value
    .filter((l) => l.code !== 'admin')
    .map((l) => {
      const orig = new Set(data.value?.levelPermissions[l.code] ?? []);
      const cur = draft.value[l.code] ?? new Set();
      return { level: l, add: [...cur].filter((p) => !orig.has(p)).length, remove: [...orig].filter((p) => !cur.has(p)).length };
    })
    .filter((c) => c.add || c.remove),
);

const saving = ref(false);
async function save() {
  const ok = await confirm({
    title: '儲存職級權限?',
    message: changed.value.map((c) => `${c.level.name}:+${c.add} / −${c.remove}`).join('、') + '。儲存後立即生效。',
    confirmText: '儲存',
  });
  if (!ok) return;
  saving.value = true;
  try {
    for (const c of changed.value) await http.put(`/rbac/levels/${c.level.code}/permissions`, { permissions: [...draft.value[c.level.code]!] });
    toast.success('已儲存職級權限', '選單與按鈕會在使用者下次操作時更新');
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <GCard v-if="error">
      <GEmpty tone="danger" icon="key" title="無法載入權限設定" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <div class="grid levels-grid">
        <GCard v-for="l in levels" :key="l.code" :tone="LEVEL_TONE[l.code]" glow padding="sm">
          <div class="lv-head">
            <GBadge :tone="LEVEL_TONE[l.code]" variant="solid">{{ l.name }}</GBadge>
            <span class="spacer" />
            <b class="num">{{ draft[l.code]?.size ?? 0 }}</b
            ><span class="faint xs">/ {{ data?.permissions.length }}</span>
          </div>
          <p class="muted xs lv-desc">{{ l.description }}</p>
        </GCard>
      </div>

      <GCard padding="none" title="職級權限" subtitle="頁面權限決定選單是否可見;按鈕權限決定頁面內的操作" icon="grid">
        <template #actions>
          <GBadge v-if="!editable" tone="neutral" icon="lock">唯讀</GBadge>
        </template>
        <GSkeleton v-if="!data" :lines="10" style="padding: 20px" />
        <div v-else class="wrap">
          <table class="mx">
            <thead>
              <tr>
                <th class="first">權限</th>
                <th class="dept">部門限制</th>
                <th v-for="l in levels" :key="l.code" class="lv">
                  <GBadge :tone="LEVEL_TONE[l.code]">{{ l.name }}</GBadge>
                </th>
              </tr>
            </thead>
            <tbody v-for="m in byModule" :key="m.code">
              <tr class="mod">
                <td :colspan="levels.length + 2">
                  <strong>{{ m.name }}</strong
                  ><span class="faint xs"> · {{ m.perms.length }} 項</span>
                </td>
              </tr>
              <tr v-for="p in m.perms" :key="p.code">
                <th class="first">
                  <div class="pl">
                    <span class="row" style="--gap: 6px">
                      <GBadge :tone="p.type === 'page' ? 'info' : 'warning'" :icon="p.type === 'page' ? 'layers' : 'zap'">{{
                        p.type === 'page' ? '頁面' : '按鈕'
                      }}</GBadge>
                      <b>{{ p.name }}</b>
                    </span>
                    <code>{{ p.code }}</code>
                  </div>
                </th>
                <td class="dept">
                  <template v-if="data.deptRestrictions[p.code]?.length">
                    <GBadge v-for="d in data.deptRestrictions[p.code]" :key="d" tone="cyan">{{ deptName(d) }}</GBadge>
                  </template>
                  <span v-else class="faint xs">不限</span>
                </td>
                <td v-for="l in levels" :key="l.code" class="cell">
                  <span v-if="l.code === 'admin'" class="lock" title="系統管理員固定擁有全部權限"><GIcon name="check" :size="13" :stroke="3" /></span>
                  <GSwitch
                    v-else
                    size="sm"
                    :model-value="!!draft[l.code]?.has(p.code)"
                    :disabled="!editable"
                    :aria-label="`${l.name} ${p.name}`"
                    @update:model-value="toggle(l.code, p.code, $event)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GCard>
    </template>

    <Transition name="page">
      <div v-if="changed.length" class="savebar glass glass-edge">
        <GIcon name="edit" />
        <span>尚未儲存的變更</span>
        <GBadge v-for="c in changed" :key="c.level.code" :tone="LEVEL_TONE[c.level.code]">{{ c.level.name }} +{{ c.add }} / −{{ c.remove }}</GBadge>
        <span class="spacer" />
        <GButton variant="ghost" icon="undo" @click="resetDraft">復原</GButton>
        <GButton variant="primary" icon="save" :loading="saving" @click="save">儲存</GButton>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.levels-grid {
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  --gap: 14px;
}
.lv-head {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.lv-head b {
  font-size: var(--fs-xl);
}
.lv-desc {
  margin: 8px 0 0;
}
.wrap {
  overflow-x: auto;
}
.mx {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: var(--fs-sm);
}
.mx thead th {
  padding: 12px;
  font-size: var(--fs-xs);
  color: var(--text-3);
  font-weight: 700;
  border-bottom: 1px solid var(--line);
  text-align: left;
}
.mx th.lv {
  text-align: center;
  min-width: 110px;
}
.mod td {
  padding: 16px 16px 6px;
  font-size: var(--fs-sm);
}
.first {
  padding: 10px 16px;
  text-align: left;
  font-weight: 500;
  min-width: 260px;
}
.pl {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pl code {
  font-size: 11px;
  color: var(--text-3);
}
.dept {
  padding: 8px 12px;
  min-width: 150px;
}
td.dept > * + * {
  margin-left: 4px;
}
tbody tr:not(.mod) > * {
  border-bottom: 1px solid var(--line);
}
tbody tr:not(.mod):hover > * {
  background: var(--glass-soft);
}
.cell {
  text-align: center;
  padding: 8px;
}
.lock {
  display: inline-grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border-radius: 7px;
  color: #fff;
  background: color-mix(in srgb, var(--c-danger) 70%, transparent);
  opacity: 0.75;
}
.savebar {
  position: sticky;
  bottom: 16px;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 12px 16px;
  border-radius: var(--radius-lg);
  background: var(--glass-strong);
  box-shadow: var(--shadow-lg);
}
</style>
