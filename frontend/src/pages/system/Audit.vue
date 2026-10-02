<script setup lang="ts">
/**
 * 稽核紀錄(Gateway PRD §8.7、P2-7;權限 gw.admin.audit.read):
 *   操作紀錄 GET /api/admin/audit-logs(操作人、動作前綴、對象類型;點列可看修改前後內容)
 *   登入紀錄 GET /api/admin/auth-logs(帳號、事件、來源 IP)
 * 新到舊、後端分頁;BFF 未指定區間時為最近 30 天,這裡提供 7 / 30 / 90 天切換。
 */
import { computed, reactive, ref } from 'vue';
import { audit, type AuditRow, type AuthLogRow } from '@/api/admin';
import { describeError } from '@/api/http';
import { ACTION_LABEL, AUTH_EVENT, fmtTime, fromNow } from '@/api/format';
import { usePaged } from '@/composables/usePaged';

const props = defineProps<{ type: 'operation' | 'login' }>();
const PAGE_SIZE = 15;
const f = reactive({ who: '', action: '', entityType: '', event: '', ip: '', days: '30' });
const from = () => new Date(Date.now() - Number(f.days) * 86_400_000).toISOString();

type Row = AuditRow | AuthLogRow;
const list = usePaged<Row>(
  (page, pageSize) =>
    props.type === 'operation'
      ? audit.operations({
          actor: f.who.trim() || undefined,
          action: f.action || undefined,
          entityType: f.entityType || undefined,
          from: from(),
          page,
          pageSize,
        })
      : audit.logins({ username: f.who.trim() || undefined, event: f.event || undefined, ip: f.ip.trim() || undefined, from: from(), page, pageSize }),
  { pageSize: PAGE_SIZE, watch: () => ({ ...f }) },
);

const ACTION_PREFIXES = [
  { label: '全部動作', value: '' },
  { label: '路由', value: 'route.' },
  { label: '上游', value: 'upstream.' },
  { label: '發佈 / 回滾', value: 'release.' },
  { label: '角色', value: 'role.' },
  { label: '權限', value: 'permission.' },
  { label: '使用者', value: 'user.' },
  { label: '本機帳號', value: 'local.' },
  { label: '公司', value: 'company.' },
  { label: 'API Key', value: 'client.' },
  { label: '限流政策', value: 'rate_limit.' },
];
const EVENTS = [{ label: '全部事件', value: '' }, ...Object.entries(AUTH_EVENT).map(([value, e]) => ({ label: e.label, value }))];

const selected = ref<AuditRow | null>(null);
const open = computed({ get: () => !!selected.value, set: (v) => !v && (selected.value = null) });
const json = (v: unknown) => (v === null || v === undefined ? '—' : JSON.stringify(v, null, 2));
const asOp = (r: Row) => r as AuditRow;
const asAuth = (r: Row) => r as AuthLogRow;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="list.reload">重新整理</GButton>
    </Teleport>
    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="f.who" icon="search" :placeholder="type === 'login' ? '帳號(工號)' : '操作人'" clearable class="grow" />
        <template v-if="type === 'operation'">
          <GSelect v-model="f.action" :options="ACTION_PREFIXES" icon="filter" />
        </template>
        <template v-else>
          <GSelect v-model="f.event" :options="EVENTS" icon="filter" />
          <GInput v-model="f.ip" icon="globe" placeholder="來源 IP" clearable style="width: 160px" />
        </template>
        <GSegmented
          v-model="f.days"
          size="sm"
          :options="[
            { label: '7 天', value: '7' },
            { label: '30 天', value: '30' },
            { label: '90 天', value: '90' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="audit" title="無法載入稽核紀錄" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else-if="type === 'operation'" padding="none" :subtitle="`${list.total.value.toLocaleString()} 筆`">
      <GTable
        v-model:page="list.page.value"
        :loading="list.loading.value && !list.data.value"
        :rows="list.items.value"
        :total="list.total.value"
        :page-size="PAGE_SIZE"
        row-key="auditId"
        dense
        clickable
        empty-title="此區間沒有操作紀錄"
        :columns="[
          { key: 'occurredAt', label: '時間', width: '170px' },
          { key: 'actorName', label: '操作人', mono: true },
          { key: 'action', label: '動作' },
          { key: 'entityId', label: '對象', mono: true, hideSm: true },
          { key: 'actorIp', label: '來源 IP', mono: true, hideSm: true },
        ]"
        @row-click="selected = asOp($event)"
      >
        <template #cell-occurredAt="{ row }"
          ><span class="small nowrap" :title="fromNow(row.occurredAt)">{{ fmtTime(row.occurredAt) }}</span></template
        >
        <template #cell-action="{ row }"
          ><GBadge tone="primary" variant="outline" :title="asOp(row).action">{{ ACTION_LABEL[asOp(row).action] ?? asOp(row).action }}</GBadge></template
        >
        <template #cell-entityId="{ row }"
          ><span class="small"
            ><span class="faint">{{ asOp(row).entityType }}</span> {{ asOp(row).entityId ?? '' }}</span
          ></template
        >
        <template #cell-actorIp="{ row }"
          ><span class="faint small">{{ asOp(row).actorIp ?? '—' }}</span></template
        >
      </GTable>
    </GCard>
    <GCard v-else padding="none" :subtitle="`${list.total.value.toLocaleString()} 筆`">
      <GTable
        v-model:page="list.page.value"
        :loading="list.loading.value && !list.data.value"
        :rows="list.items.value"
        :total="list.total.value"
        :page-size="PAGE_SIZE"
        row-key="logId"
        dense
        empty-title="此區間沒有登入紀錄"
        :columns="[
          { key: 'occurredAt', label: '時間', width: '170px' },
          { key: 'username', label: '帳號', mono: true },
          { key: 'event', label: '事件' },
          { key: 'reason', label: '原因', hideSm: true },
          { key: 'authMethod', label: '方式', hideSm: true },
          { key: 'ip', label: '來源 IP', mono: true, hideSm: true },
        ]"
      >
        <template #cell-occurredAt="{ row }"
          ><span class="small nowrap" :title="fromNow(row.occurredAt)">{{ fmtTime(row.occurredAt) }}</span></template
        >
        <template #cell-event="{ row }">
          <GBadge :tone="AUTH_EVENT[asAuth(row).event]?.tone ?? 'neutral'" dot>{{ AUTH_EVENT[asAuth(row).event]?.label ?? asAuth(row).event }}</GBadge>
        </template>
        <template #cell-reason="{ row }"
          ><span class="muted small">{{ asAuth(row).reason ?? '—' }}</span></template
        >
        <template #cell-authMethod="{ row }"
          ><span class="small">{{ asAuth(row).authMethod ?? '—' }}</span></template
        >
        <template #cell-ip="{ row }"
          ><span class="faint small" :title="asAuth(row).userAgent ?? ''">{{ asAuth(row).ip ?? '—' }}</span></template
        >
      </GTable>
    </GCard>

    <GModal
      v-model:open="open"
      :title="selected ? (ACTION_LABEL[selected.action] ?? selected.action) : ''"
      :subtitle="selected?.action"
      icon="audit"
      width="720px"
    >
      <div v-if="selected" class="stack" style="--gap: 12px">
        <dl class="kv">
          <dt>時間</dt>
          <dd>{{ fmtTime(selected.occurredAt) }}</dd>
          <dt>操作人</dt>
          <dd class="mono">{{ selected.actorName ?? '—' }}(IP {{ selected.actorIp ?? '—' }})</dd>
          <dt>對象</dt>
          <dd class="mono">{{ selected.entityType }} {{ selected.entityId ?? '' }}</dd>
          <dt>requestId</dt>
          <dd class="mono small">{{ selected.requestId ?? '—' }}</dd>
        </dl>
        <div class="cmp">
          <div>
            <p class="faint xs strong">修改前</p>
            <pre class="out">{{ json(selected.before) }}</pre>
          </div>
          <div>
            <p class="faint xs strong">修改後 / 內容</p>
            <pre class="out">{{ json(selected.after) }}</pre>
          </div>
        </div>
      </div>
    </GModal>
  </div>
</template>

<style scoped>
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}
.grow {
  flex: 1 1 220px;
}
.kv {
  display: grid;
  grid-template-columns: 80px 1fr;
  gap: 6px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
.kv dt {
  color: var(--text-3);
}
.kv dd {
  margin: 0;
}
.cmp {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 12px;
}
.cmp p {
  margin: 0 0 6px;
}
.out {
  margin: 0;
  max-height: 360px;
  overflow: auto;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--field);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
