import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

// IT 管理系統:子路徑 /it/(Nginx 對應 /srv/www/it-admin/current)
// 登入與權限改用 Gateway 單一入口(giga-Portal PRD D2、I1):API 一律同網域 /api/*(BFF 管理 API、/api/it/* 經 BFF 轉 itapp-api)
// 本機開發:/api 與入口網登入頁(/login 及其靜態檔)經 proxy 轉給測試區 Gateway(公司憑證;可用 GATEWAY_TARGET 改指其他 Gateway),
// Cookie 落在 localhost,登入後導回 http://localhost:5177/it/...
const GATEWAY = process.env.GATEWAY_TARGET ?? 'https://giganexus-test.gigasolar.com.tw';
// Gateway web-kit 尚未發佈到 Registry:以 alias 指向兄弟 repo 的原始碼(建置時以 WEB_KIT_DIR 指定,Dockerfile)
const WEB_KIT = fileURLToPath(new URL(process.env.WEB_KIT_DIR ?? '../../giga-api-gateway-bff/web-kit/src', import.meta.url));
const toGateway = { target: GATEWAY, changeOrigin: true };

export default defineConfig({
  base: '/it/', // 必須與登記的子路徑一致
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'vue-router'],
    alias: {
      '@giganexus/web-kit': `${WEB_KIT}/index.ts`,
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.PORT ?? 5177),
    strictPort: true,
    fs: { allow: ['.', WEB_KIT] },
    proxy: {
      '/api': toGateway,
      // 入口網(giga-Portal,base /)的首頁、登入頁與其靜態檔;只在本機開發使用。
      // 「/」也要轉:沒有 it.app.access 時守衛導回入口網 /,若由 Vite 回應會再導回 /it/ 造成無限迴圈
      '^/(\\?.*)?$': toGateway,
      '^/(login|register|reset-password|no-access)(/|$|\\?)': toGateway,
      '/assets': toGateway,
    },
  },
});
