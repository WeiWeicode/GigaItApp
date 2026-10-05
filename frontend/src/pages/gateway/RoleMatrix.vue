<script setup lang="ts">
/**
 * 權限查詢 › 角色權限總覽(唯讀):BFF 全部權限(含純 API 權限)依系統分組 × 角色。
 * 設定一律在「系統管理 › 權限設定」(角色、部門、個人);此頁只用來查看與排查。
 */
import { computed, ref } from 'vue';
import { describeError } from '@/api/http';
import { useBffRbac } from '@/composables/bffRbac';

const { data, loading, error, grants, bySystem, reload } = useBffRbac();

const system = ref('');
const systems = computed(() => [{ label: '全部', value: '' }, ...bySystem.value.map((g) => ({ label: g.system, value: g.system }))]);
const groups = computed(() => bySystem.value.filter((g) => !system.value || g.system === system.value));
const roles = computed(() => data.value?.roles ?? []);

const hoverRole = ref<string | null>(null);
const hoverPerm = ref<string | null>(null);

const has = (role: string, perm: string) => !!grants.value.get(role)?.has(perm);
const roleCount = (role: string) => grants.value.get(role)?.size ?? 0;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="shield" title="無法取得權限資料" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <GCard padding="sm" class="readonly-note">
        <div class="row">
          <GBadge tone="info" icon="eye">唯讀</GBadge>
          <span class="small muted">只顯示透過<b>角色</b>取得的權限;直接授予部門 / 個人的權限見「誰能存取」。要調整請到權限設定。</span>
          <span class="spacer" />
          <RouterLink to="/system/permissions" class="small">前往權限設定 →</RouterLink>
        </div>
      </GCard>

      <GCard padding="sm">
        <div class="row">
          <span class="muted small">系統</span>
          <GSegmented v-model="system" :options="systems" size="sm" />
          <span class="spacer" />
          <span class="legend"><i class="on" /> 擁有 <i /> 未擁有</span>
        </div>
      </GCard>

      <GCard padding="none">
        <GSkeleton v-if="!data" :lines="10" style="padding: 20px" />
        <div v-else class="matrix-wrap">
          <table class="matrix">
            <thead>
              <tr>
                <th class="corner">權限 \ 角色</th>
                <th
                  v-for="r in roles"
                  :key="r.code"
                  class="role"
                  :class="{ hl: hoverRole === r.code }"
                  @mouseenter="hoverRole = r.code"
                  @mouseleave="hoverRole = null"
                >
                  <div class="role-head" :title="r.description ?? ''">
                    <strong>{{ r.name }}</strong>
                    <code>{{ r.code }}</code>
                    <span class="row" style="--gap: 4px; justify-content: center">
                      <GBadge v-if="r.isSystem" tone="danger">內建</GBadge>
                      <GBadge tone="primary">{{ roleCount(r.code) }}</GBadge>
                    </span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody v-for="g in groups" :key="g.system">
              <tr class="group">
                <td :colspan="roles.length + 1">
                  <GBadge tone="violet" icon="layers">{{ g.system }}</GBadge>
                  <span class="faint xs">{{ g.perms.length }} 項權限</span>
                </td>
              </tr>
              <tr v-for="p in g.perms" :key="p.code" :class="{ hl: hoverPerm === p.code }" @mouseenter="hoverPerm = p.code" @mouseleave="hoverPerm = null">
                <th class="perm">
                  <div class="pl">
                    <span>{{ p.name }}</span>
                    <code>{{ p.code }}</code>
                  </div>
                </th>
                <td v-for="r in roles" :key="r.code" class="cell" :class="{ hl: hoverRole === r.code }">
                  <span v-if="has(r.code, p.code)" class="yes" :title="`${r.name} 擁有 ${p.code}`"><GIcon name="check" :size="14" :stroke="3" /></span>
                  <span v-else class="no" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.legend {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.legend i {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  border: 1px dashed var(--line-strong);
}
.legend i.on {
  background: var(--grad-brand);
  border: 0;
  margin-left: 6px;
}
.matrix-wrap {
  overflow: auto;
  max-height: calc(100vh - 300px);
  min-height: 300px;
}
.matrix {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: var(--fs-sm);
}
.matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--glass-strong);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--line);
}
.corner {
  left: 0;
  z-index: 3 !important;
  min-width: 240px;
  text-align: left;
  padding: 12px 16px;
  font-size: var(--fs-xs);
  color: var(--text-3);
  font-weight: 700;
}
.role {
  min-width: 118px;
  padding: 10px 8px;
  vertical-align: bottom;
  transition: background var(--dur);
}
.role-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}
.role-head code {
  font-size: 11px;
  color: var(--text-3);
}
.perm {
  position: sticky;
  left: 0;
  z-index: 1;
  text-align: left;
  font-weight: 500;
  padding: 8px 16px;
  background: var(--glass-strong);
  border-right: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}
.pl {
  display: flex;
  flex-direction: column;
}
.perm code {
  font-size: 11px;
  color: var(--text-3);
}
.group td {
  padding: 14px 16px 6px;
  display: table-cell;
}
.group td > * {
  margin-right: 8px;
}
.cell {
  text-align: center;
  padding: 6px;
  border-bottom: 1px solid var(--line);
  transition: background var(--dur);
}
tr.hl .cell,
.cell.hl,
.role.hl {
  background: color-mix(in srgb, var(--c-primary) 7%, transparent);
}
tr.hl .perm {
  color: var(--c-primary);
}
.yes {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 4px 12px rgb(99 102 241 / 0.35);
}
.no {
  display: inline-block;
  width: 24px;
  height: 24px;
  border-radius: 8px;
  border: 1px dashed var(--line-strong);
}
</style>
