import { createApp } from 'vue';
import { installAuthRedirect } from './api/auth';
import App from './App.vue';
import { initTheme } from './composables/theme';
import { router } from './router';
import ui from './ui';

initTheme();
// 任一 API 回 401(Session 過期、被停用)→ 回登入頁,登入後回到原頁面
installAuthRedirect(() => router.replace({ path: '/login', query: { redirect: router.currentRoute.value.fullPath, expired: '1' } }));

createApp(App).use(router).use(ui).mount('#app');
