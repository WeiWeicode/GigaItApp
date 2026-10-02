<script setup lang="ts">
/**
 * API 路由(Gateway PRD §8.7、P2-1):GET /api/admin/routes(後端篩選與分頁)、明細、新增 / 修改(草稿)、停用、試打。
 * 修改只寫資料庫:已發佈的路由改為草稿,線上仍用目前版本,於「發佈版本」發佈後生效(PRD §8.4.3)。
 * 聚合路由的步驟在此只顯示;編輯請用 Gateway CLI apply 或匯入(PRD §8.4.4)。
 */
import { computed, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';
import { can, GW } from '@/api/auth';
import { gw, type RouteDetail, type RouteInput, type RouteRow, type RouteTestResult } from '@/api/admin';
import { describeError } from '@/api/http';
import { AUTH_MODE, fromNow, METHOD_TONE, ROUTE_STATUS } from '@/api/format';
import GherkinView from '@/components/GherkinView.vue';
import { useAsync } from '@/composables/useAsync';
import { usePaged } from '@/composables/usePaged';
import { confirm, toast } from '@/ui';

const route = useRoute();
const PAGE_SIZE = 12;
const filters = reactive({
  q: '',
  system: '',
  status: '',
  upstreamId: typeof route.query.upstream === 'string' ? route.query.upstream : '',
});
const query = (page: number, pageSize: number) => ({ ...filters, upstreamId: filters.upstreamId ? Number(filters.upstreamId) : undefined, page, pageSize });
const list = usePaged<RouteRow>((page, pageSize) => gw.routes(query(page, pageSize)), { pageSize: PAGE_SIZE, watch: () => ({ ...filters }) });

// 篩選與表單的選項:上游(含系統代碼、開發專案)、限流政策
const ups = useAsync(() => gw.upstreams());
const pols = useAsync(() => gw.policies());
const upstreamOptions = computed(() => (ups.data.value?.items ?? []).map((u) => ({ label: `${u.code}(${u.systemCode})`, value: String(u.upstreamId) })));
const systemOptions = computed(() => [...new Set((ups.data.value?.items ?? []).map((u) => u.systemCode))].sort().map((s) => ({ label: s, value: s })));
const policyOptions = computed(() => [
  { label: '不限流', value: '' },
  ...(pols.data.value?.items ?? []).map((p) => ({ label: `${p.code}(${p.limitCount} 次 / ${p.windowSec} 秒)`, value: String(p.policyId) })),
]);
const projectOf = (upstreamCode: string | null) => (ups.data.value?.items ?? []).find((u) => u.code === upstreamCode)?.project ?? null;

// ---- 明細 ----
const selected = ref<RouteDetail | null>(null);
const detailLoading = ref(false);
const detailOpen = computed({ get: () => !!selected.value, set: (v) => !v && ((selected.value = null), (test.value = null)) });
async function openDetail(r: RouteRow) {
  detailLoading.value = true;
  try {
    selected.value = await gw.route(r.routeId);
  } catch (e) {
    toast.fromError(e, '無法取得路由明細');
  } finally {
    detailLoading.value = false;
  }
}

// ---- 新增 / 編輯(草稿) ----
const formOpen = ref(false);
const editing = ref<RouteDetail | null>(null);
const form = reactive({
  routeCode: '',
  name: '',
  systemCode: '',
  method: 'GET',
  publicPath: '',
  routeType: 'proxy' as 'proxy' | 'mock' | 'aggregate',
  upstreamId: '',
  upstreamPath: '',
  authMode: 'permission' as RouteRow['authMode'],
  permissionCode: '',
  rateLimitPolicyId: '',
  timeoutSec: '',
  tags: '',
  description: '',
  mockResponse: '',
  deprecated: false,
});
const saving = ref(false);
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', '*'].map((m) => ({ label: m, value: m }));
const AUTH_OPTIONS = [
  { label: '需權限', value: 'permission' },
  { label: '登入即可', value: 'authenticated' },
  { label: '公開', value: 'public' },
  { label: 'API Key', value: 'api_key' },
];

function openCreate() {
  editing.value = null;
  Object.assign(form, {
    routeCode: '',
    name: '',
    systemCode: filters.system,
    method: 'GET',
    publicPath: '',
    routeType: 'proxy',
    upstreamId: filters.upstreamId,
    upstreamPath: '',
    authMode: 'permission',
    permissionCode: '',
    rateLimitPolicyId: '',
    timeoutSec: '',
    tags: '',
    description: '',
    mockResponse: '',
    deprecated: false,
  });
  formOpen.value = true;
}
function openEdit(r: RouteDetail) {
  editing.value = r;
  Object.assign(form, {
    routeCode: r.routeCode,
    name: r.name,
    systemCode: r.systemCode,
    method: r.method,
    publicPath: r.publicPath,
    routeType: r.routeType,
    upstreamId: r.upstreamId ? String(r.upstreamId) : '',
    upstreamPath: r.upstreamPath ?? '',
    authMode: r.authMode,
    permissionCode: r.permissionCode ?? '',
    rateLimitPolicyId: r.rateLimitPolicyId ? String(r.rateLimitPolicyId) : '',
    timeoutSec: r.timeoutMs ? String(r.timeoutMs / 1000) : '',
    tags: r.tags ?? '',
    description: r.description ?? '',
    mockResponse: r.mockResponse === null || r.mockResponse === undefined ? '' : JSON.stringify(r.mockResponse, null, 2),
    deprecated: r.status === 'deprecated',
  });
  formOpen.value = true;
}

async function save() {
  let mockResponse: unknown;
  if (form.routeType === 'mock') {
    try {
      mockResponse = form.mockResponse.trim() ? JSON.parse(form.mockResponse) : null;
    } catch {
      return toast.error('mock 回應不是合法的 JSON');
    }
  }
  const body: RouteInput & { mockResponse?: unknown } = {
    name: form.name.trim(),
    systemCode: form.systemCode.trim(),
    method: form.method,
    publicPath: form.publicPath.trim(),
    routeType: form.routeType,
    authMode: form.authMode,
    permissionCode: form.authMode === 'permission' || form.authMode === 'api_key' ? form.permissionCode.trim() || null : null,
    rateLimitPolicyId: form.rateLimitPolicyId ? Number(form.rateLimitPolicyId) : null,
    timeoutMs: form.timeoutSec ? Math.round(Number(form.timeoutSec) * 1000) : null,
    tags: form.tags.trim() || null,
    description: form.description.trim() || null,
    ...(form.routeType === 'proxy'
      ? { upstreamId: form.upstreamId ? Number(form.upstreamId) : null, upstreamPath: form.upstreamPath.trim() || null }
      : form.routeType === 'mock'
        ? { upstreamId: null, upstreamPath: null, mockResponse }
        : {}),
  };
  saving.value = true;
  try {
    if (editing.value) {
      const r = await gw.updateRoute(editing.value.routeId, editing.value.rowVer, { ...body, ...(form.deprecated ? { status: 'deprecated' } : {}) });
      selected.value = selected.value ? r : null;
      toast.success('已儲存為草稿', '於「發佈版本」發佈後生效');
    } else {
      await gw.createRoute({ ...body, routeCode: form.routeCode.trim() });
      toast.success('已新增路由(草稿)', '於「發佈版本」發佈後生效');
    }
    formOpen.value = false;
    await list.reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}

async function disable(r: RouteDetail) {
  const ok = await confirm({
    title: `停用路由 ${r.routeCode}?`,
    message: '停用後於下次發佈時自線上移除;資料保留,可再改回草稿。',
    tone: 'danger',
    confirmText: '停用',
  });
  if (!ok) return;
  try {
    selected.value = await gw.disableRoute(r.routeId, r.rowVer);
    toast.success('已停用', '於「發佈版本」發佈後生效');
    await list.reload();
  } catch (e) {
    toast.fromError(e, '停用失敗');
  }
}

// ---- 試打(以目前使用者身分呼叫本區上游) ----
const test = ref<RouteTestResult | null>(null);
const testing = ref(false);
const testPath = ref('');
async function runTest(r: RouteDetail) {
  testing.value = true;
  try {
    test.value = await gw.testRoute(r.routeId, testPath.value.trim() ? { path: testPath.value.trim() } : {});
  } catch (e) {
    toast.fromError(e, '試打失敗');
  } finally {
    testing.value = false;
  }
}

/** 匯出目前篩選結果為 CSV:按下時才逐頁取回全部符合的資料 */
const exporting = ref(false);
async function exportCsv() {
  exporting.value = true;
  try {
    const rows: RouteRow[] = [];
    for (let page = 1; ; page++) {
      const r = await gw.routes(query(page, 200));
      rows.push(...r.items);
      if (rows.length >= r.total || !r.items.length) break;
    }
    const cols: (keyof RouteRow)[] = [
      'routeCode',
      'name',
      'systemCode',
      'method',
      'publicPath',
      'routeType',
      'upstreamCode',
      'authMode',
      'permissionCode',
      'status',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replaceAll('"', '""')}"`;
    const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `gateway-routes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success('已匯出', `${rows.length} 筆路由`);
  } catch (e) {
    toast.fromError(e, '匯出失敗');
  } finally {
    exporting.value = false;
  }
}

const canWrite = computed(() => can(GW.routeWrite));
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="download" :loading="exporting" :disabled="!list.total.value" @click="exportCsv">匯出 CSV</GButton>
      <GButton icon="refresh" :loading="list.loading.value" @click="list.reload">重新整理</GButton>
      <GButton v-if="canWrite" variant="primary" icon="plus" @click="openCreate">新增路由</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="filters.q" icon="search" placeholder="搜尋路由代碼、名稱、路徑、權限、標籤…" clearable class="grow" />
        <GSelect v-model="filters.system" :options="systemOptions" placeholder="全部系統" icon="layers" />
        <GSelect v-model="filters.upstreamId" :options="upstreamOptions" placeholder="全部上游" icon="server" />
        <GSegmented
          v-model="filters.status"
          size="sm"
          :options="[
            { label: '全部', value: '' },
            { label: '已發佈', value: 'published' },
            { label: '草稿', value: 'draft' },
            { label: '已棄用', value: 'deprecated' },
            { label: '停用', value: 'disabled' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="gateway" title="無法取得路由" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="API 路由" :subtitle="`${list.total.value} 支`" icon="route">
      <GTable
        v-model:page="list.page.value"
        :loading="(list.loading.value && !list.data.value) || detailLoading"
        :rows="list.items.value"
        :total="list.total.value"
        row-key="routeId"
        :page-size="PAGE_SIZE"
        clickable
        empty-title="沒有符合條件的路由"
        :columns="[
          { key: 'method', label: '方法', width: '84px' },
          { key: 'publicPath', label: '對外路徑' },
          { key: 'name', label: '名稱', hideSm: true },
          { key: 'upstreamCode', label: '上游', hideSm: true },
          { key: 'authMode', label: '驗證' },
          { key: 'permissionCode', label: '權限', hideSm: true },
          { key: 'status', label: '狀態' },
        ]"
        @row-click="openDetail"
      >
        <template #cell-method="{ row }"
          ><GBadge :tone="METHOD_TONE[row.method] ?? 'neutral'" variant="outline" mono>{{ row.method }}</GBadge></template
        >
        <template #cell-publicPath="{ row }">
          <div class="path">
            <code>{{ row.publicPath }}</code>
            <span class="faint xs mono">{{ row.routeCode }}</span>
          </div>
        </template>
        <template #cell-name="{ row }"
          ><span class="nowrap">{{ row.name }}</span></template
        >
        <template #cell-upstreamCode="{ row }">
          <code v-if="row.upstreamCode" class="small">{{ row.upstreamCode }}</code>
          <span v-else class="faint small">{{ row.routeType }}</span>
        </template>
        <template #cell-authMode="{ row }">
          <GBadge :tone="AUTH_MODE[row.authMode]?.tone ?? 'neutral'" :icon="AUTH_MODE[row.authMode]?.icon">{{
            AUTH_MODE[row.authMode]?.label ?? row.authMode
          }}</GBadge>
        </template>
        <template #cell-permissionCode="{ row }">
          <code v-if="row.permissionCode" class="perm">{{ row.permissionCode }}</code
          ><span v-else class="faint">—</span>
        </template>
        <template #cell-status="{ row }">
          <GBadge :tone="ROUTE_STATUS[row.status]?.tone ?? 'neutral'" dot>{{ ROUTE_STATUS[row.status]?.label ?? row.status }}</GBadge>
        </template>
      </GTable>
    </GCard>

    <GModal v-model:open="detailOpen" :title="selected?.name" :subtitle="selected?.routeCode" icon="route" width="680px">
      <div v-if="selected" class="stack" style="--gap: 16px">
        <div class="flow">
          <div class="node glass">
            <span class="faint xs">瀏覽器</span>
            <code
              ><b>{{ selected.method }}</b> {{ selected.publicPath }}</code
            >
          </div>
          <GIcon name="chevron-right" class="faint" />
          <div class="node glass hl">
            <span class="faint xs">Gateway BFF</span>
            <span class="small"
              >{{ AUTH_MODE[selected.authMode]?.label ?? selected.authMode
              }}<template v-if="selected.permissionCode">
                · <code>{{ selected.permissionCode }}</code></template
              ><template v-if="selected.rateLimitPolicy"> · 限流 {{ selected.rateLimitPolicy }}</template></span
            >
          </div>
          <GIcon name="chevron-right" class="faint" />
          <div class="node glass">
            <span class="faint xs">{{ selected.routeType === 'proxy' ? `上游 ${selected.upstreamCode}` : selected.routeType }}</span>
            <code>{{
              selected.upstreamPath ??
              (selected.routeType === 'mock' ? '(mock 回應)' : selected.routeType === 'aggregate' ? '(聚合多個上游)' : selected.publicPath)
            }}</code>
          </div>
        </div>
        <dl class="kv">
          <dt>系統</dt>
          <dd>{{ selected.systemCode }}</dd>
          <dt>開發專案</dt>
          <dd>
            <span v-if="projectOf(selected.upstreamCode)" class="project"><GIcon name="repo" :size="14" />{{ projectOf(selected.upstreamCode) }}</span>
            <span v-else class="faint">{{ selected.routeType === 'proxy' ? '未登記' : 'Gateway' }}</span>
          </dd>
          <dt>狀態</dt>
          <dd>
            <GBadge :tone="ROUTE_STATUS[selected.status]?.tone ?? 'neutral'" dot>{{ ROUTE_STATUS[selected.status]?.label ?? selected.status }}</GBadge>
          </dd>
          <dt>來源</dt>
          <dd>{{ selected.source }} · {{ selected.updatedBy }} {{ fromNow(selected.updatedAt) }}</dd>
          <dt>標籤</dt>
          <dd>{{ selected.tags ?? '—' }}</dd>
        </dl>
        <div v-if="selected.steps.length" class="desc">
          <p class="faint xs strong">聚合步驟</p>
          <p v-for="s in selected.steps" :key="s.stepKey" class="mono small">
            {{ s.stepOrder }}. {{ s.stepKey }} ← {{ s.method }} {{ s.upstreamCode }}{{ s.pathTemplate }}{{ s.required ? '(必要)' : '' }}
          </p>
        </div>
        <div v-if="selected.description" class="desc">
          <p class="faint xs strong">API 用途說明</p>
          <p>{{ selected.description }}</p>
        </div>
        <div class="stack" style="--gap: 6px">
          <p class="faint xs strong spec-title"><GIcon name="spec" :size="14" />Gherkin 行為規格</p>
          <GherkinView v-if="selected.gherkin" :text="selected.gherkin" />
          <p v-else class="faint small">尚未提供行為規格(OpenAPI x-gherkin)</p>
        </div>

        <div v-if="canWrite && selected.status !== 'disabled'" class="desc stack" style="--gap: 10px">
          <p class="faint xs strong">試打(以您的身分呼叫本區上游;草稿也可以)</p>
          <div class="row" style="--gap: 8px">
            <GInput v-model="testPath" class="grow" :placeholder="`實際路徑(參數代入值),預設 ${selected.publicPath}`" />
            <GButton icon="zap" :loading="testing" @click="runTest(selected)">試打</GButton>
          </div>
          <div v-if="test" class="stack" style="--gap: 6px">
            <div class="row" style="--gap: 6px">
              <GBadge :tone="test.wouldBeAllowed ? 'success' : 'warning'" :icon="test.wouldBeAllowed ? 'check' : 'lock'">{{
                test.wouldBeAllowed ? '您實際呼叫會被允許' : '您實際呼叫會被拒絕(權限不足)'
              }}</GBadge>
              <GBadge v-if="test.response" :tone="test.response.status < 400 ? 'success' : 'danger'">HTTP {{ test.response.status }}</GBadge>
              <GBadge v-if="test.error" tone="danger">{{ test.error.code }}</GBadge>
              <span v-if="test.upstream" class="faint xs mono">{{ test.upstream.method }} {{ test.upstream.code }}{{ test.upstream.path }}</span>
            </div>
            <pre class="out">{{ test.error ? test.error.message : JSON.stringify(test.response?.body, null, 2) }}</pre>
          </div>
        </div>
      </div>
      <template #footer>
        <GButton
          v-if="selected?.permissionCode && $can(GW.rbacRead)"
          variant="ghost"
          icon="search"
          @click="$router.push({ path: '/gateway/rbac/who-can-access', query: { permission: selected.permissionCode } })"
        >
          誰可以呼叫?
        </GButton>
        <span class="spacer" />
        <GButton v-if="canWrite && selected && selected.status !== 'disabled'" variant="danger" icon="x-circle" @click="disable(selected)">停用</GButton>
        <GButton v-if="canWrite && selected" variant="primary" icon="edit" @click="openEdit(selected)">編輯</GButton>
      </template>
    </GModal>

    <GModal v-model:open="formOpen" :title="editing ? `編輯路由 ${editing.routeCode}` : '新增路由(草稿)'" icon="route" width="640px">
      <form id="route-form" class="stack" style="--gap: 14px" @submit.prevent="save">
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GInput
            v-model="form.routeCode"
            label="路由代碼"
            placeholder="例:it.dashboard.overview"
            :disabled="!!editing"
            required
            hint="系統.資源.動作,建立後不可改"
          />
          <GInput v-model="form.name" label="名稱" required />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 120px 1fr; --gap: 12px">
          <GInput v-model="form.systemCode" label="系統代碼" placeholder="例:it" required />
          <GSelect v-model="form.method" label="方法" :options="METHODS" />
          <GSelect
            v-model="form.routeType"
            label="類型"
            :disabled="editing?.routeType === 'aggregate'"
            :options="[
              { label: '轉送上游', value: 'proxy' },
              { label: 'mock 回應', value: 'mock' },
              ...(editing?.routeType === 'aggregate' ? [{ label: '聚合', value: 'aggregate' }] : []),
            ]"
          />
        </div>
        <GInput
          v-model="form.publicPath"
          label="對外路徑"
          :placeholder="`/api/${form.systemCode || '{系統}'}/...`"
          hint="參數寫 :id,結尾可用 * 比對其後所有路徑"
          required
        />
        <div v-if="form.routeType === 'proxy'" class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GSelect v-model="form.upstreamId" label="上游" :options="upstreamOptions" placeholder="選擇上游" required />
          <GInput
            v-model="form.upstreamPath"
            label="上游路徑"
            :placeholder="`留空 = 去掉 /api/${form.systemCode || '{系統}'} 前綴`"
            hint="可引用 :id 與結尾 *"
          />
        </div>
        <GTextarea v-if="form.routeType === 'mock'" v-model="form.mockResponse" label="mock 回應(JSON)" mono :rows="5" />
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GSelect v-model="form.authMode" label="驗證" :options="AUTH_OPTIONS" />
          <GInput
            v-model="form.permissionCode"
            label="權限代碼"
            :disabled="form.authMode !== 'permission' && form.authMode !== 'api_key'"
            placeholder="例:it.dashboard.read"
          />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GSelect v-model="form.rateLimitPolicyId" label="限流政策" :options="policyOptions" />
          <GInput v-model="form.timeoutSec" label="逾時(秒,空白 = 依上游)" type="number" />
        </div>
        <GInput v-model="form.tags" label="標籤" placeholder="以逗號分隔" />
        <GTextarea v-model="form.description" label="API 用途說明" :rows="2" />
        <GSwitch v-if="editing" v-model="form.deprecated" label="標示為已棄用(仍可呼叫,通知呼叫端改用新版)" />
      </form>
      <template #footer>
        <GButton variant="ghost" @click="formOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="route-form" :loading="saving">儲存為草稿</GButton>
      </template>
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
  flex: 1 1 260px;
}
.path {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.path code {
  font-weight: 600;
}
.perm {
  font-size: var(--fs-sm);
  color: var(--c-violet);
}
.project {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
}
.spec-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
}
.flow {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.node {
  flex: 1 1 150px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  border-radius: var(--radius-md);
  box-shadow: none;
  min-width: 0;
  word-break: break-all;
}
.node.hl {
  border-color: color-mix(in srgb, var(--c-primary) 45%, transparent);
  box-shadow: 0 0 24px rgb(99 102 241 / 0.2);
}
.kv {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 8px 12px;
  margin: 0;
  font-size: var(--fs-sm);
}
.kv dt {
  color: var(--text-3);
}
.kv dd {
  margin: 0;
}
.desc {
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
.desc p {
  margin: 0;
  white-space: pre-wrap;
  font-size: var(--fs-sm);
}
.desc p + p {
  margin-top: 6px;
}
.out {
  margin: 0;
  max-height: 240px;
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
