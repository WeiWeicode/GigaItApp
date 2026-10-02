<script setup lang="ts">
/**
 * 上游服務與限流政策(Gateway PRD §8.7、P2-1):GET /api/admin/upstreams、/rate-limit-policies。
 * 新增 / 編輯上游需 gw.admin.upstream.write;位址只管理本區(測試區 test / 正式區 prod),修改在下次發佈時生效。
 */
import { computed, reactive, ref } from 'vue';
import { GW } from '@/api/auth';
import { gw, type Upstream } from '@/api/admin';
import { describeError } from '@/api/http';
import { fromNow } from '@/api/format';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

const { data, loading, error, reload } = useAsync(() => gw.upstreams());
const policies = useAsync(() => gw.policies());
function refresh() {
  reload();
  policies.reload();
}

const SYSTEM_TONE = ['primary', 'cyan', 'violet', 'success', 'warning', 'info'];
const upstreams = computed(() => (data.value?.items ?? []).map((u, i) => ({ ...u, tone: u.isEnabled ? SYSTEM_TONE[i % SYSTEM_TONE.length]! : 'neutral' })));

// ---- 新增 / 編輯 ----
const formOpen = ref(false);
const editing = ref<Upstream | null>(null);
const form = reactive({
  code: '',
  name: '',
  systemCode: '',
  targets: '',
  timeoutSec: '10',
  healthCheckPath: '',
  project: '',
  description: '',
  isEnabled: true,
});
const saving = ref(false);

function openCreate() {
  editing.value = null;
  Object.assign(form, {
    code: '',
    name: '',
    systemCode: '',
    targets: '',
    timeoutSec: '10',
    healthCheckPath: '/healthz',
    project: '',
    description: '',
    isEnabled: true,
  });
  formOpen.value = true;
}
function openEdit(u: Upstream) {
  editing.value = u;
  Object.assign(form, {
    code: u.code,
    name: u.name,
    systemCode: u.systemCode,
    targets: u.targets.map((t) => t.baseUrl).join('\n'),
    timeoutSec: String(u.timeoutMs / 1000),
    healthCheckPath: u.healthCheckPath ?? '',
    project: u.project ?? '',
    description: u.description ?? '',
    isEnabled: u.isEnabled,
  });
  formOpen.value = true;
}
async function save() {
  saving.value = true;
  const body = {
    name: form.name.trim(),
    systemCode: form.systemCode.trim(),
    timeoutMs: Math.round(Number(form.timeoutSec) * 1000),
    healthCheckPath: form.healthCheckPath.trim() || null,
    project: form.project.trim() || null,
    description: form.description.trim() || null,
    targets: form.targets
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((baseUrl) => ({ baseUrl })),
  };
  try {
    if (editing.value) {
      await gw.updateUpstream(editing.value.upstreamId, editing.value.rowVer, { ...body, isEnabled: form.isEnabled });
      toast.success('已更新上游', '於「發佈版本」發佈後生效');
    } else {
      await gw.createUpstream({ ...body, code: form.code.trim() });
      toast.success('已新增上游', '於「發佈版本」發佈後生效');
    }
    formOpen.value = false;
    await reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}

// ---- 健康檢查 ----
const checking = ref<number | null>(null);
async function check(u: Upstream) {
  checking.value = u.upstreamId;
  try {
    const r = await gw.healthCheck(u.upstreamId);
    if (!r.results.length) toast.warning(`${u.code} 沒有本區位址`);
    for (const x of r.results)
      (x.ok ? toast.success : toast.error)(`${u.code} ${x.ok ? '正常' : '異常'}`, `${x.baseUrl}${r.path} → ${x.status ?? x.error ?? '無回應'}(${x.ms} ms)`);
  } catch (e) {
    toast.fromError(e, '健康檢查失敗');
  } finally {
    checking.value = null;
  }
}

const KEY_BY: Record<string, string> = { user: '每位使用者', ip: '每個 IP', client: '每個 API Key', route: '整條路由' };
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <Teleport to="#page-actions" defer>
      <GBadge v-if="data" tone="info" icon="globe">本區位址:{{ data.environment }}</GBadge>
      <GButton icon="refresh" :loading="loading" @click="refresh">重新整理</GButton>
      <GButton v-can="GW.upstreamWrite" variant="primary" icon="plus" @click="openCreate">新增上游</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="gateway" title="無法取得上游服務" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>

    <template v-else>
      <GCard v-if="data && !upstreams.length">
        <GEmpty
          icon="server"
          title="本區尚未登記上游服務"
          description="後端服務以 OpenAPI 自動註冊、Gateway CLI apply,或按右上角「新增上游」登記;路由與上游於「發佈版本」發佈後生效。"
        />
      </GCard>
      <div v-else class="grid grid-auto" style="--min: 300px; --gap: 16px">
        <template v-if="data">
          <GCard v-for="u in upstreams" :key="u.code" :tone="u.tone" glow>
            <template #header>
              <span class="ic"><GIcon name="server" :size="18" /></span>
              <div class="titles">
                <h3 class="mono">{{ u.code }}</h3>
                <p class="muted small">{{ u.name }}</p>
              </div>
            </template>
            <template #actions>
              <GBadge v-if="!u.isEnabled" tone="danger">已停用</GBadge>
              <GBadge tone="neutral" variant="outline">{{ u.systemCode }}</GBadge>
            </template>
            <div class="stack" style="--gap: 12px">
              <div v-for="t in u.targets" :key="t.targetId" class="target">
                <GIcon name="globe" :size="14" class="faint" />
                <code class="ellipsis">{{ t.baseUrl }}</code>
                <span class="spacer" />
                <GBadge v-if="!t.isEnabled" tone="neutral">停用</GBadge>
              </div>
              <p v-if="!u.targets.length" class="faint xs">尚未設定本區位址</p>
              <p v-if="u.project" class="faint xs"><GIcon name="repo" :size="12" /> {{ u.project }}</p>
              <div class="foot">
                <span class="faint xs" :title="`更新:${u.updatedBy}`"
                  ><GIcon name="clock" :size="12" /> 逾時 {{ u.timeoutMs / 1000 }} 秒 · {{ fromNow(u.updatedAt) }}</span
                >
                <span class="spacer" />
                <GButton size="sm" variant="ghost" icon="activity" :loading="checking === u.upstreamId" title="健康檢查" @click="check(u)" />
                <GButton v-can="GW.upstreamWrite" size="sm" variant="ghost" icon="edit" @click="openEdit(u)">編輯</GButton>
                <GButton
                  size="sm"
                  variant="ghost"
                  icon-right="chevron-right"
                  @click="$router.push({ path: '/gateway/services/routes', query: { upstream: String(u.upstreamId) } })"
                >
                  {{ u.routes }} 支路由
                </GButton>
              </div>
            </div>
          </GCard>
        </template>
        <template v-else>
          <GCard v-for="i in 6" :key="i"><GSkeleton :lines="4" /></GCard>
        </template>
      </div>

      <GCard title="限流政策" subtitle="路由可套用的速率限制" icon="gauge" tone="warning" padding="none">
        <GEmpty v-if="policies.error.value" tone="danger" compact :description="describeError(policies.error.value)" />
        <GTable
          v-else
          :loading="!policies.data.value"
          :rows="policies.data.value?.items ?? []"
          row-key="code"
          :page-size="0"
          :columns="[
            { key: 'code', label: '代碼', mono: true },
            { key: 'limitCount', label: '上限', align: 'right' },
            { key: 'windowSec', label: '時間窗', align: 'right' },
            { key: 'keyBy', label: '計數依據' },
            { key: 'routes', label: '使用路由', align: 'right' },
          ]"
        >
          <template #cell-limitCount="{ row }"
            ><b class="num">{{ row.limitCount.toLocaleString() }}</b> 次<span v-if="row.burst" class="faint xs">(突發 {{ row.burst }})</span></template
          >
          <template #cell-windowSec="{ row }"
            ><span class="num">{{ row.windowSec }}</span> 秒</template
          >
          <template #cell-keyBy="{ row }"
            ><GBadge tone="info">{{ KEY_BY[row.keyBy] ?? row.keyBy }}</GBadge></template
          >
          <template #cell-routes="{ row }"
            ><span class="num">{{ row.routes }}</span></template
          >
        </GTable>
      </GCard>
    </template>

    <GModal v-model:open="formOpen" :title="editing ? `編輯上游 ${editing.code}` : '新增上游'" icon="server" width="560px">
      <form id="upstream-form" class="stack" style="--gap: 14px" @submit.prevent="save">
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GInput v-model="form.code" label="上游代碼" placeholder="例:itapp-api" :disabled="!!editing" required hint="= 內部 Token 的 aud,建立後不可改" />
          <GInput v-model="form.systemCode" label="系統代碼" placeholder="例:it" required />
        </div>
        <GInput v-model="form.name" label="名稱" required />
        <GTextarea v-model="form.targets" label="本區位址" hint="每行一個,http://主機:port(port 51200–51300)" mono placeholder="http://itapp-api:51291" />
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GInput v-model="form.timeoutSec" label="逾時(秒)" type="number" />
          <GInput v-model="form.healthCheckPath" label="健康檢查路徑" placeholder="/healthz" />
        </div>
        <GInput v-model="form.project" label="開發專案(repo 資料夾)" placeholder="例:GigaItApp" />
        <GInput v-model="form.description" label="說明" />
        <GSwitch v-if="editing" v-model="form.isEnabled" label="啟用(停用前需先停用使用它的路由)" />
      </form>
      <template #footer>
        <GButton variant="ghost" @click="formOpen = false">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="upstream-form" :loading="saving">儲存</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.ic {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) calc(var(--tone-bg-alpha) * 100%), transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 25%, transparent);
}
.titles {
  min-width: 0;
}
.titles h3 {
  font-size: var(--fs-lg);
}
.titles p {
  margin: 0;
}
.target {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--glass-soft);
  border: 1px solid var(--line);
  min-width: 0;
}
.target code {
  font-size: var(--fs-sm);
}
.foot {
  display: flex;
  align-items: center;
  gap: 4px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
}
</style>
