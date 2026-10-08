<script setup lang="ts">
/**
 * 檔案管理 › 檔案清單(giga-file-service docs/API.md §2;PRD §8,D16):
 *   GET /api/file/files(後端分頁:單號、來源系統、只看自己上傳的)、上傳(multipart)、綁定單號、下載 / 預覽、刪除(軟刪除)
 *   資料範圍由 file-api 決定(自己上傳的或同公司);按鈕:上傳 / 綁定 UI.fileUpload、刪除 UI.fileDelete
 *   上傳經 Gateway Nginx 直送 file-api(D4-B),單檔上限 30 MB、一次最多 10 個,不合格整批拒絕
 */
import { computed, reactive, ref } from 'vue';
import { can, UI, useAuth } from '@/api/auth';
import { BACKUP_STATUS, files, PREVIEWABLE, UPLOAD_MAX_BYTES, UPLOAD_MAX_FILES, type FileItem } from '@/api/files';
import { fmtSize, fmtTime, fromNow } from '@/api/format';
import { describeError } from '@/api/http';
import { usePaged } from '@/composables/usePaged';
import { confirm, toast } from '@/ui';

const PAGE_SIZE = 15;
const { user } = useAuth();
const me = computed(() => user.value?.employeeNo ?? '');
const f = reactive({ refNo: '', sourceSystem: '', mine: 'all' });
const list = usePaged<FileItem>(
  (page, pageSize) =>
    files.list({
      refNo: f.refNo.trim() || undefined,
      sourceSystem: f.sourceSystem.trim() || undefined,
      uploadedBy: f.mine === 'mine' ? me.value : undefined,
      page,
      pageSize,
    }),
  { pageSize: PAGE_SIZE, watch: () => ({ ...f }) },
);

// ---------- 上傳 ----------
const uploadOpen = ref(false);
const picked = ref<File[]>([]);
const up = reactive({ refType: '', refNo: '' });
const uploading = ref(false);
const dragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const tooBig = computed(() => picked.value.filter((p) => p.size > UPLOAD_MAX_BYTES));
const uploadBlocked = computed(() => !picked.value.length || picked.value.length > UPLOAD_MAX_FILES || tooBig.value.length > 0);

function openUpload() {
  picked.value = [];
  up.refType = '';
  up.refNo = '';
  uploadOpen.value = true;
}
function addFiles(list: FileList | null | undefined) {
  if (!list) return;
  const names = new Set(picked.value.map((p) => `${p.name}|${p.size}`));
  for (const file of Array.from(list)) if (!names.has(`${file.name}|${file.size}`)) picked.value.push(file);
}
function onDrop(e: DragEvent) {
  dragging.value = false;
  addFiles(e.dataTransfer?.files);
}
async function doUpload() {
  uploading.value = true;
  try {
    const r = await files.upload(picked.value, { refType: up.refType.trim(), refNo: up.refNo.trim() });
    toast.success(`已上傳 ${r.items.length} 個檔案`, up.refNo.trim() ? `已綁定單號 ${up.refNo.trim()}` : '未指定單號:24 小時內未綁定會自動清除');
    uploadOpen.value = false;
    await list.reload();
  } catch (e) {
    toast.fromError(e, '上傳失敗(整批未保存)');
  } finally {
    uploading.value = false;
  }
}

// ---------- 綁定單號(暫存檔,只限自己上傳的) ----------
const bindTarget = ref<FileItem | null>(null);
const bind = reactive({ refType: '', refNo: '' });
const binding = ref(false);
const bindOpen = computed({ get: () => !!bindTarget.value, set: (v) => !v && (bindTarget.value = null) });
function openBind(row: FileItem) {
  bind.refType = '';
  bind.refNo = '';
  bindTarget.value = row;
}
async function doBind() {
  if (!bindTarget.value) return;
  binding.value = true;
  try {
    await files.bind([bindTarget.value.fileUuid], bind.refNo.trim(), bind.refType.trim() || undefined);
    toast.success('已綁定單號', `${bindTarget.value.originalName} → ${bind.refNo.trim()}`);
    bindTarget.value = null;
    await list.reload();
  } catch (e) {
    toast.fromError(e, '綁定失敗');
  } finally {
    binding.value = false;
  }
}

// ---------- 刪除(軟刪除) ----------
async function remove(row: FileItem) {
  const ok = await confirm({
    title: `刪除「${row.originalName}」?`,
    message: '軟刪除:清單與下載都看不到,實體檔與備份保留(之後依保留期限清除)。',
    confirmText: '刪除',
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await files.remove(row.fileUuid);
    toast.success('已刪除', row.originalName);
    await list.reload();
  } catch (e) {
    toast.fromError(e, '刪除失敗');
  }
}

const canUpload = computed(() => can(UI.fileUpload));
const canDelete = computed(() => can(UI.fileDelete));
const asFile = (r: unknown) => r as FileItem;
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="list.loading.value" @click="list.reload">重新整理</GButton>
      <GButton v-if="canUpload" variant="primary" icon="upload" @click="openUpload">上傳檔案</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="filters">
        <GInput v-model="f.refNo" icon="hash" placeholder="單號(完全相符)" clearable class="grow" />
        <GInput v-model="f.sourceSystem" icon="filter" placeholder="來源系統代碼(例 file、bpm)" clearable style="width: 220px" />
        <GSegmented
          v-model="f.mine"
          size="sm"
          :options="[
            { label: '全部', value: 'all' },
            { label: '我上傳的', value: 'mine' },
          ]"
        />
      </div>
    </GCard>

    <GCard v-if="list.error.value">
      <GEmpty tone="danger" icon="folder" title="無法載入檔案清單" :description="describeError(list.error.value)"
        ><GButton icon="refresh" @click="list.reload">重試</GButton></GEmpty
      >
    </GCard>
    <GCard v-else padding="none" title="檔案清單" :subtitle="`${list.total.value.toLocaleString()} 筆(自己上傳的或同公司的)`" icon="folder">
      <GTable
        v-model:page="list.page.value"
        :loading="list.loading.value && !list.data.value"
        :rows="list.items.value"
        :total="list.total.value"
        :page-size="PAGE_SIZE"
        row-key="fileUuid"
        dense
        empty-title="沒有檔案"
        empty-description="上傳後會出現在這裡;沒有單號的暫存檔 24 小時內未綁定會自動清除"
        :columns="[
          { key: 'originalName', label: '檔名' },
          { key: 'sizeBytes', label: '大小', align: 'right', width: '90px' },
          { key: 'refNo', label: '單號' },
          { key: 'sourceSystem', label: '來源', hideSm: true },
          { key: 'uploadedBy', label: '上傳者', mono: true, hideSm: true },
          { key: 'createdAt', label: '上傳時間', width: '150px', hideSm: true },
          { key: 'backupStatus', label: '備份', width: '96px', hideSm: true },
          { key: 'actions', label: '', align: 'right', width: '150px' },
        ]"
      >
        <template #cell-originalName="{ row }">
          <span class="name">
            <GIcon name="file" :size="15" class="faint" />
            <a class="ellipsis" :href="files.contentUrl(asFile(row).fileUuid)" :title="`${asFile(row).originalName}\nSHA-256 ${asFile(row).sha256}`">{{
              asFile(row).originalName
            }}</a>
          </span>
        </template>
        <template #cell-sizeBytes="{ row }"
          ><span class="small nowrap">{{ fmtSize(asFile(row).sizeBytes) }}</span></template
        >
        <template #cell-refNo="{ row }">
          <span v-if="asFile(row).refNo" class="small nowrap"
            ><span v-if="asFile(row).refType" class="faint">{{ asFile(row).refType }} </span>{{ asFile(row).refNo }}</span
          >
          <GBadge v-else tone="warning" variant="outline" title="未綁定單號,24 小時內未綁定會自動清除">暫存</GBadge>
        </template>
        <template #cell-sourceSystem="{ row }"
          ><span class="small" :title="asFile(row).sourceApp ?? ''">{{ asFile(row).sourceSystem }}</span></template
        >
        <template #cell-createdAt="{ row }"
          ><span class="small nowrap" :title="fmtTime(asFile(row).createdAt)">{{ fromNow(asFile(row).createdAt) }}</span></template
        >
        <template #cell-backupStatus="{ row }">
          <GBadge :tone="BACKUP_STATUS[asFile(row).backupStatus].tone" dot>{{ BACKUP_STATUS[asFile(row).backupStatus].label }}</GBadge>
        </template>
        <template #cell-actions="{ row }">
          <div class="acts">
            <a v-if="PREVIEWABLE.has(asFile(row).ext ?? '')" :href="files.contentUrl(asFile(row).fileUuid, true)" target="_blank" rel="noopener" title="預覽">
              <GButton size="sm" variant="ghost" icon="eye" square />
            </a>
            <a :href="files.contentUrl(asFile(row).fileUuid)" title="下載"><GButton size="sm" variant="ghost" icon="download" square /></a>
            <GButton
              v-if="canUpload && !asFile(row).refNo && asFile(row).uploadedBy === me"
              size="sm"
              variant="ghost"
              icon="link"
              square
              title="綁定單號"
              @click="openBind(asFile(row))"
            />
            <GButton v-if="canDelete" size="sm" variant="ghost" icon="trash" square title="刪除" @click="remove(asFile(row))" />
          </div>
        </template>
      </GTable>
    </GCard>

    <GModal
      v-model:open="uploadOpen"
      title="上傳檔案"
      subtitle="單檔 30 MB、一次 10 個;執行檔與腳本不可上傳"
      icon="upload"
      width="620px"
      :persistent="uploading"
    >
      <div class="stack" style="--gap: 14px">
        <div
          class="drop"
          :class="{ over: dragging }"
          role="button"
          tabindex="0"
          @click="fileInput?.click()"
          @keydown.enter="fileInput?.click()"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop.prevent="onDrop"
        >
          <GIcon name="upload" :size="26" class="faint" />
          <p class="small">拖曳檔案到這裡,或<strong>點選選擇檔案</strong></p>
          <p class="xs faint">PDF、圖片、Office、壓縮檔等;任一檔不合格時整批不會保存</p>
          <input ref="fileInput" type="file" multiple hidden @change="addFiles(($event.target as HTMLInputElement).files)" />
        </div>
        <ul v-if="picked.length" class="picked">
          <li v-for="(p, i) in picked" :key="`${p.name}|${p.size}`">
            <GIcon name="file" :size="15" class="faint" />
            <span class="ellipsis grow">{{ p.name }}</span>
            <span class="small nowrap" :class="{ 'tone-danger': p.size > UPLOAD_MAX_BYTES }">{{ fmtSize(p.size) }}</span>
            <GButton size="sm" variant="ghost" icon="x" square title="移除" @click="picked.splice(i, 1)" />
          </li>
        </ul>
        <p v-if="tooBig.length" class="small tone-danger">有 {{ tooBig.length }} 個檔案超過 30 MB(單檔上限),請移除後再上傳。</p>
        <p v-if="picked.length > UPLOAD_MAX_FILES" class="small tone-danger">一次最多 {{ UPLOAD_MAX_FILES }} 個檔案。</p>
        <div class="grid grid-2">
          <GInput v-model="up.refType" label="單據類型(選填)" placeholder="例 ecr(小寫英數)" />
          <GInput v-model="up.refNo" label="單號(選填)" placeholder="留空 = 暫存,之後再綁定" />
        </div>
      </div>
      <template #footer>
        <GButton :disabled="uploading" @click="uploadOpen = false">取消</GButton>
        <GButton variant="primary" icon="upload" :loading="uploading" :disabled="uploadBlocked" @click="doUpload"
          >上傳 {{ picked.length || '' }} 個檔案</GButton
        >
      </template>
    </GModal>

    <GModal v-model:open="bindOpen" title="綁定單號" :subtitle="bindTarget?.originalName" icon="link" width="480px">
      <div class="stack" style="--gap: 12px">
        <p class="small muted">暫存檔綁定到單據後不會被自動清除;只能綁定自己上傳的檔案。</p>
        <GInput v-model="bind.refType" label="單據類型(選填)" placeholder="例 ecr(小寫英數)" />
        <GInput v-model="bind.refNo" label="單號" required placeholder="例 ECR-2026-001" />
      </div>
      <template #footer>
        <GButton @click="bindTarget = null">取消</GButton>
        <GButton variant="primary" icon="link" :loading="binding" :disabled="!bind.refNo.trim()" @click="doBind">綁定</GButton>
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
  flex: 1 1 220px;
  min-width: 0;
}
.name {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 360px;
}
.acts {
  display: inline-flex;
  gap: 2px;
  justify-content: flex-end;
}
.drop {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: var(--space-6) var(--space-4);
  border: 1.5px dashed var(--line);
  border-radius: var(--radius-md);
  background: var(--field);
  cursor: pointer;
  text-align: center;
  transition: border-color var(--dur) var(--ease);
}
.drop p {
  margin: 0;
}
.drop.over,
.drop:hover,
.drop:focus-visible {
  border-color: var(--c-primary);
}
.picked {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}
.picked li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  background: var(--field);
}
</style>
