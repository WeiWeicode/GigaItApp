<script setup lang="ts">
/**
 * 發佈 / 回滾(Gateway PRD §8.4.3、§8.7、P2-2;權限 gw.admin.release):
 *   發佈前先看草稿清單與「目前版本 → 發佈後」差異(GET /api/admin/releases/preview),發佈會一併發佈**所有**草稿,≤ 5 秒全部 BFF 生效;
 *   回滾以歷史版本內容產生新版本。BFF 只回傳最近 50 個版本。
 */
import { computed, ref } from 'vue';
import { gw, type Release } from '@/api/admin';
import { can, UI } from '@/api/auth';
import { describeError } from '@/api/http';
import { fmtTime, fromNow } from '@/api/format';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

/** 發佈 / 回滾按鈕(it.gw-service.publish,綁定 gw.admin.release) */
const canPublish = computed(() => can(UI.svcPublish));

const { data, loading, error, reload } = useAsync(() => gw.releases());
const items = computed(() => data.value?.items ?? []);
const preview = useAsync(() => gw.releasePreview());
function refresh() {
  reload();
  preview.reload();
}

const open = ref(false);
const note = ref('');
const saving = ref(false);
async function openPublish() {
  open.value = true;
  await preview.reload();
}
async function publish() {
  saving.value = true;
  try {
    const r = await gw.publish(note.value.trim());
    toast.success(`已發佈 v${r.version}`, r.redisSynced ? '所有 BFF 實例 5 秒內生效' : 'Redis 同步失敗,補償機制將於 60 秒內修正');
    open.value = false;
    note.value = '';
    refresh();
  } catch (e) {
    toast.fromError(e, '發佈失敗');
  } finally {
    saving.value = false;
  }
}

async function rollback(r: Release) {
  const ok = await confirm({
    title: `回滾到 v${r.version}?`,
    message: '會以 v' + r.version + ' 的內容產生新版本並立即生效;目前的草稿不受影響。',
    tone: 'danger',
    confirmText: '回滾',
  });
  if (!ok) return;
  try {
    const x = await gw.rollback(r.version, `回滾到 v${r.version}`);
    toast.success(`已回滾,新版本 v${x.version}`);
    refresh();
  } catch (e) {
    toast.fromError(e, '回滾失敗');
  }
}

const count = (r: Release) => (r.diff ? r.diff.added.length + r.diff.modified.length + r.diff.removed.length : 0);
const pv = computed(() => preview.data.value);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="refresh">重新整理</GButton>
      <GButton v-if="canPublish" variant="primary" icon="rocket" @click="openPublish">發佈草稿{{ pv?.drafts.length ? `(${pv.drafts.length})` : '' }}</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="release" title="無法取得發佈版本" :description="describeError(error)"
        ><GButton icon="refresh" @click="refresh">重試</GButton></GEmpty
      >
    </GCard>

    <GCard v-if="pv?.changed" tone="warning" icon="alert" title="有尚未發佈的變更" :subtitle="`目前線上 v${pv.currentVersion};發佈後才會生效`">
      <div class="row" style="--gap: 6px">
        <GBadge v-if="pv.diff.added.length" tone="success">+{{ pv.diff.added.length }} 新增</GBadge>
        <GBadge v-if="pv.diff.modified.length" tone="info">~{{ pv.diff.modified.length }} 修改</GBadge>
        <GBadge v-if="pv.diff.removed.length" tone="danger">−{{ pv.diff.removed.length }} 移除</GBadge>
        <GBadge v-if="pv.diff.upstreamsChanged" tone="violet">上游變更</GBadge>
        <GBadge v-if="pv.diff.policiesChanged" tone="warning">限流變更</GBadge>
        <span class="spacer" />
        <GButton v-if="canPublish" size="sm" variant="primary" icon="rocket" @click="openPublish">檢視並發佈</GButton>
      </div>
    </GCard>

    <GCard v-if="!error" title="發佈歷程" subtitle="每次發佈都會產生一個版本快照,可回滾(顯示最近 50 個)" icon="release" tone="success">
      <GSkeleton v-if="!data" :lines="8" />
      <ol v-else class="releases">
        <li v-for="(r, i) in items" :key="r.version" :class="{ live: i === 0 }">
          <span class="dot" />
          <div class="card glass">
            <div class="row" style="--gap: 8px">
              <strong class="ver num">v{{ r.version }}</strong>
              <GBadge v-if="i === 0" tone="success" dot>線上版本</GBadge>
              <GBadge v-if="r.rolledBackFrom" tone="warning" icon="undo">回滾自 v{{ r.rolledBackFrom }}</GBadge>
              <span class="spacer" />
              <span class="faint xs" :title="fmtTime(r.publishedAt)">{{ fromNow(r.publishedAt) }}</span>
              <GButton v-if="canPublish && i > 0" size="sm" variant="ghost" icon="undo" @click="rollback(r)">回滾到此版</GButton>
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
    </GCard>

    <GModal v-model:open="open" title="發佈草稿" subtitle="所有草稿(含其他人與後端自動註冊的)會一起發佈,所有 BFF 5 秒內生效" icon="rocket" width="600px">
      <div class="stack" style="--gap: 12px">
        <GSkeleton v-if="preview.loading.value && !pv" :lines="4" />
        <GEmpty v-else-if="preview.error.value" tone="danger" compact :description="describeError(preview.error.value)" />
        <template v-else-if="pv">
          <p class="small">目前線上 v{{ pv.currentVersion }} → 發佈後 v{{ pv.currentVersion + 1 }}</p>
          <div v-if="pv.drafts.length" class="codes">
            <code v-for="d in pv.drafts" :key="d.routeId" :title="`${d.name}(${d.updatedBy} ${fromNow(d.updatedAt)})`">{{ d.routeCode }}</code>
          </div>
          <div class="row" style="--gap: 6px">
            <GBadge v-for="c in pv.diff.added" :key="`a${c}`" tone="success">+ {{ c }}</GBadge>
            <GBadge v-for="c in pv.diff.modified" :key="`m${c}`" tone="info">~ {{ c }}</GBadge>
            <GBadge v-for="c in pv.diff.removed" :key="`r${c}`" tone="danger">− {{ c }}</GBadge>
            <GBadge v-if="pv.diff.upstreamsChanged" tone="violet">上游變更</GBadge>
            <GBadge v-if="pv.diff.policiesChanged" tone="warning">限流變更</GBadge>
          </div>
          <p v-if="!pv.changed" class="faint small">與線上版本沒有差異,不需要發佈。</p>
        </template>
        <form id="publish-form" @submit.prevent="publish">
          <GInput v-model="note" label="發佈說明" placeholder="例:IT 管理系統儀表板 API 上線" required />
        </form>
      </div>
      <template #footer>
        <GButton variant="ghost" @click="open = false">取消</GButton>
        <GButton variant="primary" type="submit" form="publish-form" icon="rocket" :loading="saving" :disabled="!note.trim() || !pv?.changed">發佈</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
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
