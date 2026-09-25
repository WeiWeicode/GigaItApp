<script setup lang="ts">
/** 發佈歷程:一次載入 10 筆,按「載入更多」再取下一頁(不一次取回全部版本) */
import { ref } from 'vue';
import { ApiError, describeError, http } from '@/api/http';
import { fmtTime, fromNow } from '@/api/format';
import type { BffRelease, BffReleasePage } from '@/api/types';
import SourceTag from '@/components/SourceTag.vue';
import { useAsync } from '@/composables/useAsync';
import { toast } from '@/ui';

const PAGE_SIZE = 10;
let refreshing = false;
/** 目前已載入的全部版本(第 1 頁由 useAsync 載入,之後的頁數由 loadMore 追加) */
const items = ref<BffRelease[]>([]);
const { data, loading, error, reload } = useAsync(async () => {
  const r = await http.get<BffReleasePage>('/bff/releases', { query: { page: 1, pageSize: PAGE_SIZE, refresh: refreshing ? 1 : undefined } });
  items.value = r.items;
  return r;
});
async function refresh() {
  refreshing = true;
  await reload();
  refreshing = false;
}
const loadingMore = ref(false);
async function loadMore() {
  loadingMore.value = true;
  try {
    const page = Math.floor(items.value.length / PAGE_SIZE) + 1;
    const r = await http.get<BffReleasePage>('/bff/releases', { query: { page, pageSize: PAGE_SIZE } });
    items.value = [...items.value, ...r.items.filter((x) => !items.value.some((y) => y.releaseId === x.releaseId))];
  } catch (e) {
    toast.fromError(e, '載入失敗');
  } finally {
    loadingMore.value = false;
  }
}

const open = ref(false);
const note = ref('');
const saving = ref(false);
async function publish() {
  saving.value = true;
  try {
    const r = await http.post<{ release: BffRelease }>('/bff/releases', { note: note.value });
    toast.success(`已發佈 v${r.release.releaseId}`, r.release.note ?? undefined);
    open.value = false;
    note.value = '';
    await refresh();
  } catch (e) {
    if (e instanceof ApiError && e.code === 'ITAPP_BFF_NOT_SUPPORTED') toast.warning('BFF 尚未開放發佈 API', e.message);
    else toast.fromError(e, '發佈失敗');
  } finally {
    saving.value = false;
  }
}

const count = (r: BffRelease) => (r.diff ? r.diff.added.length + r.diff.modified.length + r.diff.removed.length : 0);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <SourceTag :source="data?.source" :fetched-at="data?.fetchedAt" />
      <GButton icon="refresh" :loading="loading" @click="refresh">重新整理</GButton>
      <GButton v-can="'bff.route.publish'" variant="primary" icon="rocket" @click="open = true">發佈草稿</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="release" title="無法取得發佈版本" :description="describeError(error)"
        ><GButton icon="refresh" @click="refresh">重試</GButton></GEmpty
      >
    </GCard>

    <GCard v-else title="發佈歷程" subtitle="每次發佈都會產生一個版本快照,可回滾" icon="release" tone="success">
      <GSkeleton v-if="!data" :lines="8" />
      <ol v-else class="releases">
        <li v-for="(r, i) in items" :key="r.releaseId" :class="{ live: i === 0 }">
          <span class="dot" />
          <div class="card glass">
            <div class="row" style="--gap: 8px">
              <strong class="ver num">v{{ r.releaseId }}</strong>
              <GBadge v-if="i === 0" tone="success" dot>線上版本</GBadge>
              <GBadge v-if="r.rolledBackFrom" tone="warning" icon="undo">回滾自 v{{ r.rolledBackFrom }}</GBadge>
              <span class="spacer" />
              <span class="faint xs" :title="fmtTime(r.publishedAt)">{{ fromNow(r.publishedAt) }}</span>
            </div>
            <p class="note">{{ r.note ?? '(無說明)' }}</p>
            <div class="row meta" style="--gap: 6px">
              <GBadge tone="neutral" icon="user">{{ r.publishedBy }}</GBadge>
              <template v-if="r.diff">
                <GBadge v-if="r.diff.added.length" tone="success">+{{ r.diff.added.length }} 新增</GBadge>
                <GBadge v-if="r.diff.modified.length" tone="info">~{{ r.diff.modified.length }} 修改</GBadge>
                <GBadge v-if="r.diff.removed.length" tone="danger">−{{ r.diff.removed.length }} 移除</GBadge>
                <GBadge v-if="r.diff.upstreamsChanged" tone="violet">上游變更</GBadge>
                <GBadge v-if="r.diff.policiesChanged" tone="warning">限流變更</GBadge>
                <span v-if="!count(r) && !r.diff.upstreamsChanged && !r.diff.policiesChanged" class="faint xs">路由內容無差異</span>
              </template>
            </div>
            <div v-if="r.diff && count(r)" class="codes">
              <code v-for="c in [...r.diff.added, ...r.diff.modified, ...r.diff.removed].slice(0, 8)" :key="c">{{ c }}</code>
              <span v-if="count(r) > 8" class="faint xs">…另 {{ count(r) - 8 }} 支</span>
            </div>
          </div>
        </li>
      </ol>
      <div v-if="data" class="more">
        <span class="faint xs">已顯示 {{ items.length }} / {{ data.total }} 個版本</span>
        <GButton v-if="items.length < data.total" size="sm" icon="chevron-down" :loading="loadingMore" @click="loadMore">載入更多</GButton>
      </div>
    </GCard>

    <GModal v-model:open="open" title="發佈草稿路由" subtitle="將所有草稿路由發佈為新版本,線上立即生效" icon="rocket">
      <form id="publish-form" @submit.prevent="publish">
        <GInput v-model="note" label="發佈說明" placeholder="例:MES 新增報工 API" required />
      </form>
      <p class="faint xs" style="margin: 12px 0 0">
        {{ data?.source === 'live' ? '目前連線 BFF 即時資料;BFF 尚未提供發佈 API 時會提示改用 CLI。' : '模擬模式:只新增一筆模擬版本,不影響任何 Gateway。' }}
      </p>
      <template #footer>
        <GButton variant="ghost" @click="open = false">取消</GButton>
        <GButton variant="primary" type="submit" form="publish-form" icon="rocket" :loading="saving" :disabled="!note.trim()">發佈</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 16px;
}
.releases {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.releases li {
  position: relative;
  display: flex;
  gap: 16px;
}
.releases li:not(:last-child)::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 22px;
  bottom: -16px;
  width: 2px;
  background: linear-gradient(var(--line-strong), var(--line));
}
.dot {
  flex: none;
  width: 16px;
  height: 16px;
  margin-top: 14px;
  border-radius: 50%;
  background: var(--bg);
  border: 2px solid var(--line-strong);
}
.live .dot {
  border-color: var(--c-success);
  background: var(--c-success);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--c-success) 22%, transparent);
}
.card {
  flex: 1;
  min-width: 0;
  padding: 14px 16px;
  border-radius: var(--radius-md);
  box-shadow: none;
}
.live .card {
  border-color: color-mix(in srgb, var(--c-success) 40%, transparent);
}
.ver {
  font-size: var(--fs-lg);
}
.note {
  margin: 6px 0 10px;
}
.codes {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}
.codes code {
  font-size: var(--fs-xs);
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--glass-soft);
  border: 1px solid var(--line);
}
</style>
