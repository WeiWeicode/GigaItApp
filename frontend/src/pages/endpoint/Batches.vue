<script setup lang="ts">
/**
 * 電腦管理 › 待核可(ENDPOINT-MENU-PLAN §2.2 M2):集中列出等待第二人核可的批次(軟體安裝 / 移除、重新開機),
 * GET /api/endpoint/batches?state=pending_approval(nextCursor「載入更多」)。核可 / 駁回、權限與明細沿用 BatchApprovals
 * (「軟體目錄與派送」上方的入口保留不變)。權限:Tab it.endpoint-batch.list ∧ BFF endpoint.device.read。
 */
import BatchApprovals from '@/components/endpoint/BatchApprovals.vue';
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <BatchApprovals page />
  </div>
</template>
