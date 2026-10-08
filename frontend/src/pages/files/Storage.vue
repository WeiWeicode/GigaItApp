<script setup lang="ts">
/**
 * 檔案管理 › 儲存與備份(giga-file-service docs/API.md §2、STORAGE.md;權限 file.storage.read):
 *   檔案數、容量、暫存檔、NAS 備份狀態(pending / done / failed)、檔案根目錄所在磁碟用量、最近備份失敗清單。
 *   NAS 備份(F2):排程每 5 分鐘補傳並比對 SHA-256,失敗 5 次改為「備份失敗」並告警;「重試」改回待備份(權限 file.storage.manage)。
 */
import { computed, ref } from 'vue';
import { can, UI } from '@/api/auth';
import { files } from '@/api/files';
import { fmtSize, fmtTime } from '@/api/format';
import { describeError } from '@/api/http';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const { data, loading, error, reload } = useAsync(() => files.storage());
const s = computed(() => data.value);
const usedPct = computed(() => {
  const c = s.value?.capacity;
  return c && c.totalBytes > 0 ? Math.round(((c.totalBytes - c.freeBytes) / c.totalBytes) * 100) : null;
});

const canRetry = computed(() => can(UI.fileBackupRetry) && !!s.value?.backupEnabled);
const retrying = ref(false);
async function retry(uuid?: string, name?: string) {
  const ok = await confirm({
    title: uuid ? '重試這個檔案的備份?' : `重試全部 ${s.value?.backup.failed ?? 0} 個失敗的備份?`,
    message: `${uuid ? name : '失敗的檔案'}會改回「待備份」,由下一輪排程(5 分鐘內)補傳到 NAS。`,
    confirmText: '重試',
  });
  if (!ok) return;
  retrying.value = true;
  try {
    const r = await files.retryBackup(uuid ? [uuid] : undefined);
    toast.success(`已排入重試 ${r.retried} 個檔案`, '5 分鐘內補傳,重新整理可看到進度');
    await reload();
  } catch (e) {
    toast.fromError(e, '重試失敗');
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" :loading="loading" @click="reload">重新整理</GButton>
    </Teleport>

    <GCard v-if="error">
      <GEmpty tone="danger" icon="database" title="無法取得儲存狀態" :description="describeError(error)"
        ><GButton icon="refresh" @click="reload">重試</GButton></GEmpty
      >
    </GCard>
    <template v-else>
      <div v-if="!s" class="grid grid-4">
        <GSkeleton v-for="i in 4" :key="i" height="108px" />
      </div>
      <div v-else class="grid grid-4">
        <GStatCard label="檔案" :value="s.files.toLocaleString()" unit="個" icon="file" />
        <GStatCard label="容量" :value="fmtSize(s.bytes)" icon="database" tone="info" />
        <GStatCard label="暫存(未綁定)" :value="s.temp.toLocaleString()" unit="個" icon="clock" tone="warning" hint="24 小時內未綁定會自動清除" />
        <GStatCard
          label="備份失敗"
          :value="s.backup.failed.toLocaleString()"
          unit="個"
          icon="alert"
          :tone="s.backup.failed ? 'danger' : 'success'"
          :hint="`已備份 ${s.backup.done}、待備份 ${s.backup.pending}`"
        />
      </div>

      <GCard
        v-if="s"
        title="NAS 備份"
        :subtitle="s.backupEnabled ? '每 5 分鐘補傳到 NAS docker-folder/giga-files,比對 SHA-256;失敗 5 次標記為失敗並告警' : '此環境未設定 NAS 備份,檔案維持待備份'"
        icon="database"
      >
        <GProgress
          :segments="[
            { value: s.backup.done, tone: 'success', label: '已備份' },
            { value: s.backup.pending, tone: 'warning', label: '待備份' },
            { value: s.backup.failed, tone: 'danger', label: '失敗' },
          ]"
          :height="10"
        />
        <p class="small muted legend">
          <GBadge tone="success" dot>已備份 {{ s.backup.done }}</GBadge>
          <GBadge tone="warning" dot>待備份 {{ s.backup.pending }}</GBadge>
          <GBadge tone="danger" dot>失敗 {{ s.backup.failed }}</GBadge>
        </p>
      </GCard>

      <GCard
        v-if="s"
        title="主機磁碟"
        :subtitle="s.capacity?.basis === 'host' ? 'Windows 主機磁碟(檔案存在 WSL /srv/giga-files,實際佔用主機磁碟)' : '檔案根目錄所在的檔案系統'"
        icon="server"
      >
        <template v-if="s.capacity && usedPct !== null">
          <GProgress :value="usedPct" :tone="usedPct >= 85 ? 'danger' : usedPct >= 70 ? 'warning' : 'primary'" :height="10" />
          <p class="small muted legend">
            已用 {{ fmtSize(s.capacity.totalBytes - s.capacity.freeBytes) }} / {{ fmtSize(s.capacity.totalBytes) }}({{ usedPct }}%),剩餘
            {{ fmtSize(s.capacity.freeBytes) }}
          </p>
          <p v-if="s.capacity.basis === 'host'" class="xs faint">
            WSL 虛擬磁碟上限 {{ fmtSize(s.capacity.filesystem.totalBytes) }}(稀疏檔,隨使用成長,不代表實際可用空間)
          </p>
          <p v-else class="xs faint">未設定主機磁碟偵測(HOST_DISK_PATH),此數字可能是 WSL 虛擬磁碟上限而非實際可用空間</p>
        </template>
        <p v-else class="small muted">無法取得磁碟容量</p>
      </GCard>

      <GCard v-if="s && s.failedItems.length" padding="none" title="最近備份失敗" icon="alert" tone="danger">
        <template v-if="canRetry" #actions>
          <GButton size="sm" icon="refresh" :loading="retrying" @click="retry()">全部重試</GButton>
        </template>
        <GTable
          :rows="s.failedItems"
          row-key="fileUuid"
          dense
          :columns="[
            { key: 'originalName', label: '檔名' },
            { key: 'createdAt', label: '上傳時間', width: '170px' },
            ...(canRetry ? [{ key: 'actions', label: '', width: '90px' }] : []),
          ]"
        >
          <template #cell-createdAt="{ row }"
            ><span class="small nowrap">{{ fmtTime(row.createdAt) }}</span></template
          >
          <template #cell-actions="{ row }"
            ><GButton size="sm" variant="ghost" :disabled="retrying" @click="retry(row.fileUuid, row.originalName)">重試</GButton></template
          >
        </GTable>
      </GCard>
    </template>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 10px 0 0;
}
</style>
