import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// IT 管理系統:子路徑 /it/(取代 Gateway 範例 IT 頁面,Nginx 對應 /srv/www/it-admin/current)
// API 為 /it/api/*,由 Nginx 直接轉給 itapp-api(不經 BFF、不共用單一入口登入)
// 本機開發預設直連 itapp-api;npm run dev:gw 改經本機 Gateway(https://localhost,開發用自簽憑證)
const API = process.env.ITAPP_API_TARGET ?? 'http://localhost:51291';
// 端點管理經 Gateway BFF(/api/*,Gateway ENDPOINT-AGENT-GUIDE §8),本機一律轉給本機 Gateway
const GATEWAY = process.env.GATEWAY_TARGET ?? 'https://localhost';

export default defineConfig({
  base: '/it/', // 必須與登記的子路徑一致
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: {
    port: Number(process.env.PORT ?? 5177),
    strictPort: true,
    proxy: {
      '/it/api': { target: API, changeOrigin: true, secure: false },
      '/api': { target: GATEWAY, changeOrigin: true, secure: false },
    },
  },
});
