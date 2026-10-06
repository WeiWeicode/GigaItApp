<script setup lang="ts">
/**
 * 單筆紀錄明細:有「查看請求 / 回應內容」(observe.log.body)才向 BFF 取完整明細(headers、body、步驟、錯誤堆疊);
 * 沒有時只顯示清單上的摘要。body 已在 SDK 與 giga-observe 兩端遮罩密碼、Token 等欄位;錯誤的完整 body 保留 90 天。
 */
import { computed, ref, watch } from 'vue';
import { can, UI } from '@/api/auth';
import { describeError } from '@/api/http';
import { fmtTime } from '@/api/format';
import { observe, type LogDetail, type LogSummary } from '@/api/observe';
import { fmtMs, statusTone } from '@/composables/observe';

const props = defineProps<{ log: LogSummary | null }>();
const emit = defineEmits<{ close: []; trace: [traceId: string] }>();

const open = computed({ get: () => !!props.log, set: (v) => !v && emit('close') });
const canBody = computed(() => can(UI.obsBody));
const detail = ref<LogDetail | null>(null);
const loading = ref(false);
const error = ref<unknown>(null);

watch(
  () => props.log?.id,
  async (id) => {
    detail.value = null;
    error.value = null;
    if (!id || !canBody.value) return;
    loading.value = true;
    try {
      detail.value = await observe.log(id);
    } catch (e) {
      error.value = e;
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

function pretty(v: unknown): string {
  if (v === null || v === undefined || v === '') return '(無)';
  if (typeof v === 'string') {
    try {
      return JSON.stringify(JSON.parse(v), null, 2);
    } catch {
      return v;
    }
  }
  return JSON.stringify(v, null, 2);
}
/** 堆疊通常已以「名稱: 訊息」開頭,避免重複 */
function stackText(e: { name: string; message: string; stack: string }): string {
  const head = `${e.name}: ${e.message}`;
  if (!e.stack) return head;
  return e.stack.startsWith(e.name) ? e.stack : `${head}\n${e.stack}`;
}
const KIND: Record<string, string> = { http: 'API', job: '排程', web: '前端' };
</script>

<template>
  <GModal v-model:open="open" :title="log ? `${log.method} ${log.path}` : ''" :subtitle="log?.serviceId" icon="list" width="760px">
    <div v-if="log" class="stack" style="--gap: 16px">
      <div class="row" style="--gap: 6px">
        <GBadge :tone="statusTone(log.status)" mono>{{ log.status || '—' }}</GBadge>
        <GBadge tone="neutral">{{ KIND[log.kind] ?? log.kind }}</GBadge>
        <GBadge v-if="log.level === 'error'" tone="danger" icon="alert">錯誤</GBadge>
        <span class="faint small">{{ fmtTime(log.ts) }} · {{ fmtMs(log.durationMs) }}</span>
      </div>
      <dl class="kv">
        <dt>路徑樣板</dt>
        <dd>
          <code>{{ log.pathTemplate ?? log.path }}</code>
        </dd>
        <dt>使用者</dt>
        <dd>{{ log.userId ?? '—' }}</dd>
        <template v-if="log.meta?.routeCode">
          <dt>Gateway 路由</dt>
          <dd>
            <code>{{ log.meta.routeCode }}</code>
            <span v-if="log.meta.upstream" class="faint small"> → {{ log.meta.upstream }}</span>
          </dd>
        </template>
        <template v-if="log.traceId">
          <dt>Request ID</dt>
          <dd class="row" style="--gap: 8px">
            <code class="small">{{ log.traceId }}</code>
            <GButton size="sm" variant="ghost" icon="search" @click="emit('trace', log.traceId!)">查同一請求的所有紀錄</GButton>
          </dd>
        </template>
        <template v-if="log.errorMessage">
          <dt>錯誤</dt>
          <dd class="err">{{ log.errorMessage }}</dd>
        </template>
      </dl>

      <GCard v-if="!canBody" padding="sm" tone="neutral">
        <div class="row" style="--gap: 8px">
          <GIcon name="lock" :size="16" />
          <span class="small muted">請求 / 回應內容可能含個資,需要「查看請求 / 回應內容」權限</span>
        </div>
      </GCard>
      <GSkeleton v-else-if="loading" :lines="8" />
      <GEmpty v-else-if="error" compact tone="danger" icon="alert" title="無法取得明細" :description="describeError(error)" />
      <template v-else-if="detail">
        <div v-if="detail.actions.length" class="stack" style="--gap: 6px">
          <h4 class="sec">步驟</h4>
          <div v-for="a in detail.actions" :key="a.seq" class="action" :class="a.ok ? 'tone-success' : 'tone-danger'">
            <span class="faint xs">#{{ a.seq }}</span>
            <GBadge tone="neutral" mono>{{ a.type }}</GBadge>
            <code class="small">{{ a.target }}</code>
            <span class="faint small">{{ a.note }}</span>
            <span class="spacer" />
            <span class="small">{{ fmtMs(a.durationMs) }}</span>
          </div>
        </div>
        <div v-if="detail.error" class="stack" style="--gap: 6px">
          <h4 class="sec">錯誤堆疊</h4>
          <pre class="code err-bg">{{ stackText(detail.error) }}</pre>
        </div>
        <div class="grid grid-2">
          <div class="stack" style="--gap: 6px">
            <h4 class="sec">
              請求 <span class="faint xs">{{ detail.request.bodySize }} bytes{{ detail.request.bodyTruncated ? ' · 已截斷' : '' }}</span>
            </h4>
            <pre class="code">{{ pretty({ ip: detail.request.ip, headers: detail.request.headers, query: detail.request.query }) }}</pre>
            <pre class="code">{{ pretty(detail.request.body) }}</pre>
          </div>
          <div class="stack" style="--gap: 6px">
            <h4 class="sec">
              回應 <span class="faint xs">{{ detail.response.bodySize }} bytes{{ detail.response.bodyTruncated ? ' · 已截斷' : '' }}</span>
            </h4>
            <pre class="code">{{ pretty(detail.response.body) }}</pre>
          </div>
        </div>
        <p v-if="detail.bodyTrimmedAt" class="faint xs">超過 90 天的錯誤只保留內容摘要(前 1 KB)</p>
      </template>
    </div>
  </GModal>
</template>

<style scoped>
.kv {
  display: grid;
  grid-template-columns: 100px 1fr;
  gap: 8px 12px;
  margin: 0;
}
.kv dt {
  color: var(--text-3);
  font-size: var(--fs-sm);
}
.kv dd {
  margin: 0;
  min-width: 0;
  word-break: break-all;
}
.err {
  color: var(--c-danger);
}
.sec {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 700;
}
.code {
  margin: 0;
  padding: 10px 12px;
  max-height: 260px;
  overflow: auto;
  border-radius: var(--radius-sm);
  background: var(--glass-soft);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  white-space: pre-wrap;
  word-break: break-all;
}
.err-bg {
  border-color: color-mix(in srgb, var(--c-danger) 30%, transparent);
  background: color-mix(in srgb, var(--c-danger) 6%, transparent);
}
.action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border-left: 3px solid var(--tone);
  background: color-mix(in srgb, var(--tone) 5%, transparent);
}
</style>
