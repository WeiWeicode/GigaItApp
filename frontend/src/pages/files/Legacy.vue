<script setup lang="ts">
/**
 * 檔案管理 › 舊系統(giga-file-service F4 / A4;API.md §2 /api/file/legacy;PRD §8;權限 file.legacy.read):
 *   filebackend / SMBbackend 匯入到附件服務的舊檔(唯讀):各來源摘要、對照清單(舊 id、舊檔名 / path ↔ 新 UUID、單號)、下載查核。
 *   這些檔案由 BPM 舊畫面經相容層 /api/file/compat/* 使用,不出現在「檔案清單」;166 PortalSolar、190 SDSFILES 尚未同步。
 */
import { onMounted, reactive, ref } from 'vue';
import { BACKUP_STATUS, legacy, LEGACY_SOURCE_LABEL, type LegacyItem, type LegacySource, type LegacySummary } from '@/api/files';
import { fmtSize, fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import { usePaged } from '@/composables/usePaged';

const PAGE_SIZE = 15;
const f = reactive<{ source: LegacySource | 'all'; q: string }>({ source: 'all', q: '' });
const list = usePaged<LegacyItem>(
  (page, pageSize) => legacy.list({ source: f.source === 'all' ? undefined : f.source, q: f.q.trim() || undefined, page, pageSize }),
  { pageSize: PAGE_SIZE, watch: () => ({ ...f }) },
);

const summary = ref<LegacySummary[] | null>(null);
const summaryError = ref<Error | null>(null);
async function loadSummary(): Promise<void> {
  summaryError.value = null;
  try {
    summary.value = (await legacy.summary()).items;
  } catch (e) {
    summaryError.value = e as Error;
  }
}
async function reload(): Promise<void> {
  await Promise.all([loadSummary(), list.reload()]);
}
onMounted(loadSummary);

const asItem = (r: unknown) => r as LegacyItem;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="summaryError">
      <GEmpty tone="danger" icon="boxes" title="無法取得匯入摘要" :description="describeError(summaryError)" />
    </GCard>
    <div v-else-if="!summary" class="grid grid-2">
      <GSkeleton v-for="i in 2" :key="i" height="108px" />
    </div>
    <div v-else class="grid grid-2">
      <GStatCard
        v-for="s in summary"
        :key="s.source"
        :label="LEGACY_SOURCE_LABEL[s.source]"
        :value="s.files.toLocaleString()"
        unit="個"
        icon="boxes"
        :tone="s.files ? 'info' : 'neutral'"
        :hint="
          s.files
            ? `${fmtSize(s.bytes)};已刪除 ${s.deleted};已備份 ${s.backup.done}、待備份 ${s.backup.pending}${s.backup.failed ? `、失敗 ${s.backup.failed}` : ''};最後匯入 ${fromNow(s.lastImportedAt)}`
            : '尚未匯入'
        "
      />
    </div>
    <p class="xs faint note">
      BPM 舊畫面(bpmcomonent FileUpload / SPfileUpload)經相容層使用這些檔案,不出現在「檔案清單」。166 PortalSolar、190 SDSFILES 尚未同步(見 giga-file-service
      MIGRATION.md §3)。
    </p>

    <GCard padding="sm">
      <div class="filters">
        <GSegmented
          v-model="f.source"
          size="sm"
          :options="[
            { label: '全部', value: 'all' },
            { label: 'filebackend', value: 'filebackend' },
            { label: 'SMBbackend', value: 'smbbackend' },
          ]"
        />
        <GInput v-model="f.q" icon="search" placeholder="舊 id、舊檔名 / path、原檔名、單號(部分比對)" clearable class="grow" />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="boxes" title="無法載入舊系統檔案" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="匯入的舊檔" :subtitle="`${list.total.value.toLocaleString()} 筆`" icon="boxes">
      <GTable
        v-model:page="list.page.value"
        :loading="list.loading.value && !list.data.value"
        :rows="list.items.value"
        :total="list.total.value"
        :page-size="PAGE_SIZE"
        row-key="fileUuid"
        dense
        empty-title="沒有符合的舊檔"
        empty-description="尚未匯入,或調整來源與關鍵字"
        :columns="[
          { key: 'originalName', label: '原檔名' },
          { key: 'legacy', label: '舊系統', hideSm: true },
          { key: 'refNo', label: '單號', hideSm: true },
          { key: 'sizeBytes', label: '大小', align: 'right', width: '90px' },
          { key: 'createdAt', label: '上傳時間', width: '150px', hideSm: true },
          { key: 'status', label: '狀態', width: '130px' },
          { key: 'actions', label: '', align: 'right', width: '60px' },
        ]"
      >
        <template #cell-originalName="{ row }">
          <span class="name">
            <GIcon name="file" :size="15" class="faint" />
            <span class="ellipsis" :title="`${asItem(row).originalName}\nUUID ${asItem(row).fileUuid}\nSHA-256 ${asItem(row).sha256}`">{{
              asItem(row).originalName
            }}</span>
          </span>
        </template>
        <template #cell-legacy="{ row }">
          <div class="small">
            <GBadge tone="neutral">{{ asItem(row).legacySource }}</GBadge>
            id {{ asItem(row).legacyKey ?? '—' }}
          </div>
          <div class="xs faint ellipsis legacy-name" :title="asItem(row).legacyName">
            {{ asItem(row).legacyDir ? `${asItem(row).legacyDir}/` : '' }}{{ asItem(row).legacyName }}
          </div>
        </template>
        <template #cell-refNo="{ row }">
          <span class="small ellipsis ref" :title="asItem(row).refNo ?? ''">{{ asItem(row).refNo ?? '—' }}</span>
          <div class="xs faint ellipsis ref" :title="asItem(row).sourceApp ?? ''">{{ asItem(row).sourceApp ?? '' }}</div>
        </template>
        <template #cell-sizeBytes="{ row }"
          ><span class="small nowrap">{{ fmtSize(asItem(row).sizeBytes) }}</span></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap" :title="`上傳者 ${asItem(row).uploadedBy}`">{{ fmtTime(asItem(row).createdAt) }}</span></template
        >
        <template #cell-status="{ row }">
          <div class="badges">
            <GBadge v-if="asItem(row).deleted" tone="danger" dot>已刪除</GBadge>
            <GBadge v-else :tone="BACKUP_STATUS[asItem(row).backupStatus].tone" dot>{{ BACKUP_STATUS[asItem(row).backupStatus].label }}</GBadge>
            <GBadge v-if="!asItem(row).isCurrent" tone="warning" title="與其他表單共用同一個舊檔(各自匯入)">共用檔</GBadge>
          </div>
        </template>
        <template #cell-actions="{ row }">
          <a :href="legacy.contentUrl(asItem(row).fileUuid)" title="下載"><GButton size="sm" variant="ghost" icon="download" square /></a>
        </template>
      </GTable>
    </GCard>
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
  min-width: 0;
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 320px;
}
.legacy-name,
.ref {
  display: block;
  max-width: 240px;
}
.badges {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.note {
  margin: -6px 0 0;
}
</style>
