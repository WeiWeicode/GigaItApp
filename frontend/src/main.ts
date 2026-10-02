import { createApp } from 'vue';
import App from './App.vue';
import { initTheme } from './composables/theme';
import { router } from './router';
import ui from './ui';

initTheme();
// 登入狀態由 Gateway web-kit 管理:任一 API 回 401 時先 Refresh,失敗才導向入口網登入頁(登入後回到原頁面)
createApp(App).use(router).use(ui).mount('#app');
