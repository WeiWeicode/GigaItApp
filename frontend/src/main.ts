import { installMonitor } from '@giganexus/web-kit';
import { createApp } from 'vue';
import App from './App.vue';
import { initTheme } from './composables/theme';
import { router } from './router';
import ui from './ui';

initTheme();
// 登入狀態由 Gateway web-kit 管理:任一 API 回 401 時先 Refresh,失敗才導向入口網登入頁(登入後回到原頁面)
const app = createApp(App);
// 前端健康度回報(Gateway MONITORING-PLAN W9-9):JS 錯誤、API 失敗、效能、換頁 → BFF /api/telemetry/web → giga-observe(服務 itapp-web)
// 只在建置後的版本開啟,本機開發不送(避免開發中的錯誤混進測試區監控)
installMonitor({ app: 'itapp-web', router, vueApp: app, release: import.meta.env.VITE_RELEASE, enabled: import.meta.env.PROD });
app.use(router).use(ui).mount('#app');
