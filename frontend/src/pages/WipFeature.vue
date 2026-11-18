<script setup lang="ts">
/**
 * 開發中 Tab 的共用佔位頁(ENDPOINT-MENU-PLAN §2、§8-2):說明這個功能要做什麼、對應的設計文件 / 路線圖。
 * 路由 meta.wip = true、不綁 Tab 權限代碼(有該選單即可看到);功能做好時再登記 Tab 代碼、換成正式頁面。
 * 內容由路由 props 傳入,不呼叫任何 API。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const props = defineProps<{
  /** 這個功能要做什麼 */
  summary: string;
  /** 預計內容 / 分批 */
  plan?: string[];
  /** 對應的設計文件或路線圖(repo 與路徑、章節) */
  docs?: string[];
}>();

const route = useRoute();
const title = computed(() => route.meta.tab ?? '此功能');
</script>

<template>
  <div class="wip stack">
    <GCard :title="`${title}(開發中)`" icon="construction" tone="warning">
      <div class="stack body">
        <div class="row">
          <GBadge tone="warning" icon="construction">開發中</GBadge>
          <span class="hint">功能尚未上線,畫面先佔位;做好時才會開放並登記權限</span>
        </div>
        <p class="summary">{{ props.summary }}</p>
        <section v-if="props.plan?.length" class="stack sec">
          <h4>預計內容</h4>
          <ul>
            <li v-for="p in props.plan" :key="p">{{ p }}</li>
          </ul>
        </section>
        <section v-if="props.docs?.length" class="stack sec">
          <h4>設計文件 / 路線圖</h4>
          <ul class="docs">
            <li v-for="d in props.docs" :key="d"><GIcon name="file" :size="14" /> {{ d }}</li>
          </ul>
        </section>
      </div>
    </GCard>
  </div>
</template>

<style scoped>
.body {
  --gap: 14px;
}
.sec {
  --gap: 6px;
}
.hint {
  color: var(--text-3);
  font-size: var(--fs-sm);
}
.summary {
  margin: 0;
  color: var(--text);
  line-height: 1.7;
}
h4 {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--text-2);
}
ul {
  margin: 0;
  padding-left: 20px;
  color: var(--text-2);
  line-height: 1.8;
}
.docs {
  list-style: none;
  padding-left: 0;
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  overflow-wrap: anywhere;
}
.docs li {
  display: flex;
  gap: 6px;
  align-items: baseline;
}
</style>
