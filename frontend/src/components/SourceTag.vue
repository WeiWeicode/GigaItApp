<script setup lang="ts">
/** BFF 資料來源標示:即時(live)或模擬(mock)與取得時間 */
import { fmtTime } from '@/api/format';

defineProps<{ source?: 'mock' | 'live'; fetchedAt?: string }>();
</script>

<template>
  <GBadge
    v-if="source"
    :tone="source === 'live' ? 'success' : 'warning'"
    dot
    :title="source === 'live' ? `Gateway BFF 即時資料(${fmtTime(fetchedAt)})` : 'BFF_MODE=mock:本機 Gateway 快照,設定 BFF_MODE=live 改讀即時資料'"
  >
    {{ source === 'live' ? 'BFF 即時' : 'BFF 模擬' }}
  </GBadge>
</template>
