<script setup lang="ts">
/** 部門限制:權限只開放給特定部門(例:發佈只給程式開發課與系統課)。空白 = 不限部門 */
import { computed, ref } from 'vue';
import { can } from '@/api/auth';
import { describeError, http } from '@/api/http';
import type { PermissionDef } from '@/api/types';
import { useRbacCatalog } from '@/composables/rbacCatalog';
import { toast } from '@/ui';

const { data, error, byModule, reload } = useRbacCatalog();
const editable = computed(() => can('sys.perm.edit'));
const onlyRestricted = ref(false);
const saving = ref<string | null>(null);

const modules = computed(() =>
  byModule.value
    .map((m) => ({ ...m, perms: m.perms.filter((p) => !onlyRestricted.value || data.value?.deptRestrictions[p.code]?.length) }))
    .filter((m) => m.perms.length),
);
const restricted = computed(() => Object.values(data.value?.deptRestrictions ?? {}).filter((d) => d.length).length);

async function toggle(p: PermissionDef, dept: string) {
  const cur = new Set(data.value?.deptRestrictions[p.code] ?? []);
  if (cur.has(dept)) cur.delete(dept);
  else cur.add(dept);
  saving.value = p.code;
  try {
    await http.put(`/rbac/permissions/${encodeURIComponent(p.code)}/departments`, { departments: [...cur] });
    toast.success(`已更新「${p.name}」`, cur.size ? `限 ${[...cur].map(deptName).join('、')}` : '不限部門');
    await reload();
  } catch (e) {
    toast.fromError(e, '更新失敗');
  } finally {
    saving.value = null;
  }
}
const deptName = (code: string) => data.value?.departments.find((d) => d.code === code)?.name ?? code;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <GCard padding="sm">
      <div class="row">
        <GIcon name="info" class="faint" />
        <span class="muted small">有效權限 = 職級權限 ∩ 部門限制。點部門標籤切換是否開放(立即儲存)。</span>
        <span class="spacer" />
        <GSwitch v-model="onlyRestricted" size="sm" :label="`只看有限制的(${restricted})`" />
      </div>
    </GCard>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="building" title="無法載入" :description="describeError(error)"><GButton icon="refresh" @click="reload">重試</GButton></GEmpty>
    </GCard>
    <GSkeleton v-else-if="!data" :lines="8" />
    <template v-else>
      <GCard v-for="m in modules" :key="m.code" :title="m.name" padding="none">
        <ul class="list">
          <li v-for="p in m.perms" :key="p.code" :class="{ busy: saving === p.code }">
            <div class="info">
              <span class="row" style="--gap: 6px">
                <GBadge :tone="p.type === 'page' ? 'info' : 'warning'">{{ p.type === 'page' ? '頁面' : '按鈕' }}</GBadge>
                <b>{{ p.name }}</b>
              </span>
              <code class="faint xs">{{ p.code }}</code>
            </div>
            <div class="depts">
              <button
                v-for="d in data.departments"
                :key="d.code"
                type="button"
                class="chip"
                :class="{ on: data.deptRestrictions[p.code]?.includes(d.code) }"
                :disabled="!editable || saving === p.code"
                :aria-pressed="!!data.deptRestrictions[p.code]?.includes(d.code)"
                @click="toggle(p, d.code)"
              >
                <GIcon v-if="data.deptRestrictions[p.code]?.includes(d.code)" name="check" :size="13" :stroke="3" />
                {{ d.name }}
              </button>
              <GBadge v-if="!data.deptRestrictions[p.code]?.length" tone="success" icon="globe">不限部門</GBadge>
            </div>
          </li>
        </ul>
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  padding: 12px 20px;
  border-top: 1px solid var(--line);
  transition: opacity var(--dur);
}
.list li.busy {
  opacity: 0.6;
}
.info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 260px;
  flex: 1;
}
.depts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 12px;
  border-radius: 99px;
  border: 1px dashed var(--line-strong);
  background: transparent;
  font: inherit;
  font-size: var(--fs-sm);
  color: var(--text-3);
  cursor: pointer;
  transition: all var(--dur) var(--ease);
}
.chip:hover:not(:disabled) {
  border-color: var(--c-cyan);
  color: var(--text);
}
.chip.on {
  border-style: solid;
  border-color: color-mix(in srgb, var(--c-cyan) 55%, transparent);
  background: color-mix(in srgb, var(--c-cyan) 16%, transparent);
  color: var(--c-cyan);
  font-weight: 600;
}
.chip:disabled {
  cursor: default;
}
</style>
