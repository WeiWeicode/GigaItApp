<script setup lang="ts">
/**
 * 第二層功能頁的外框:頁首 + 頁籤(Tab)+ 子路由內容。
 * 標題、說明、圖示與 Tab 定義在路由 meta(router.ts),子路由就是各個 Tab。
 */
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { menuTitle } from '@/api/auth';
import type { TabItem } from '@/ui/components/GTabs.vue';

const route = useRoute();
const page = computed(() => {
  const m = route.matched[1]!.meta as { title: string; permission?: string; description?: string; icon?: string; tabs?: TabItem[]; eyebrow?: string };
  // 頁首標題與側欄一致:以 BFF 的選單權限名稱為準
  return { ...m, title: menuTitle(m.permission, m.title) };
});
</script>

<template>
  <div class="tabbed stack">
    <GPageHeader :title="page.title" :description="page.description" :icon="page.icon" :eyebrow="page.eyebrow">
      <div id="page-actions" class="row" />
    </GPageHeader>
    <GTabs v-if="page.tabs?.length" :items="page.tabs" />
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" :key="route.path" />
      </Transition>
    </RouterView>
  </div>
</template>

<style scoped>
.tabbed {
  --gap: 20px;
}
</style>
