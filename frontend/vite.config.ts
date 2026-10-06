import vue from '@vitejs/plugin-vue';
import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';
import { defineConfig, type ProxyOptions } from 'vite';

// IT 管理系統:子路徑 /it/(Nginx 對應 /srv/www/it-admin/current)
// 登入與權限改用 Gateway 單一入口(giga-Portal PRD D2、I1):API 一律同網域 /api/*(BFF 管理 API、/api/it/* 經 BFF 轉 itapp-api)
// 本機開發:/api 與入口網登入頁(/login 及其靜態檔)經 proxy 轉給測試區 Gateway(公司憑證;可用 GATEWAY_TARGET 改指其他 Gateway),
// Cookie 落在 localhost,登入後導回 http://localhost:5177/it/...
const GATEWAY = process.env.GATEWAY_TARGET ?? 'https://giganexus-test.gigasolar.com.tw';
// @giganexus/web-kit 取自公司 GitLab npm Registry(.npmrc,Token 為環境變數 GITLAB_NPM_TOKEN)
const toGateway = { target: GATEWAY, changeOrigin: true };

/**
 * 本機看架構觀測(Gateway MONITORING-PLAN W9-10,只在 dev 且設定 OBSERVE_LOCAL 時生效):
 *   OBSERVE_LOCAL=http://localhost:15202(giga-observe 的 npm run dev:local,示範資料;本機 Windows 保留 51202,改用 PORT=15202)
 *   - /api/observe/* 改轉本機 giga-observe(/api/v1/*),以 .local-keys.json 的 read Key 呼叫,不經測試區 BFF
 *   - /api/auth/me 補上架構觀測的選單 / Tab / 按鈕與 observe.* 權限,只影響本機畫面;測試區 BFF 的權限不變
 */
const OBSERVE_LOCAL = process.env.OBSERVE_LOCAL;
const OBSERVE_PERMS = ['it.gw-observe.read', 'it.gw-observe.map', 'it.gw-observe.logs', 'it.gw-observe.errors', 'it.gw-observe.traffic', 'it.gw-observe.body', 'observe.data.read', 'observe.log.body'];
function observeLocalProxy(): Record<string, ProxyOptions> {
  if (!OBSERVE_LOCAL) return {};
  // 每次請求重新讀取:dev:local 重啟後會換一把新 Key
  const readKey = () => {
    try {
      return String(JSON.parse(readFileSync(new URL('../../giga-observe/backend/.local-keys.json', import.meta.url), 'utf8')).read);
    } catch {
      console.warn('[observe-local] 找不到 giga-observe/backend/.local-keys.json,請先執行 npm run dev:local');
      return '';
    }
  };
  return {
    '/api/observe': {
      target: OBSERVE_LOCAL,
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/api\/observe/, '/api/v1'),
      configure: (proxy) => proxy.on('proxyReq', (req) => req.setHeader('X-API-Key', readKey())),
    },
    '^/api/auth/me(\\?.*)?$': {
      ...toGateway,
      selfHandleResponse: true,
      headers: { 'accept-encoding': 'identity' },
      configure: (proxy) =>
        proxy.on('proxyRes', (proxyRes: IncomingMessage, _req: IncomingMessage, res: ServerResponse) => {
          const chunks: Buffer[] = [];
          proxyRes.on('data', (c: Buffer) => chunks.push(c));
          proxyRes.on('end', () => {
            let body = Buffer.concat(chunks);
            if (proxyRes.statusCode === 200) {
              try {
                const me = JSON.parse(body.toString('utf8'));
                me.permissions = [...new Set([...(me.permissions ?? []), ...OBSERVE_PERMS])];
                body = Buffer.from(JSON.stringify(me));
              } catch {
                // 非 JSON 照原樣
              }
            }
            const headers = { ...proxyRes.headers, 'content-length': String(body.length) };
            delete headers['content-encoding'];
            res.writeHead(proxyRes.statusCode ?? 200, headers);
            res.end(body);
          });
        }),
    },
  };
}

export default defineConfig({
  base: '/it/', // 必須與登記的子路徑一致
  plugins: [vue()],
  resolve: {
    dedupe: ['vue', 'vue-router'],
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: Number(process.env.PORT ?? 5177),
    strictPort: true,
    proxy: {
      ...observeLocalProxy(),
      '/api': toGateway,
      // 入口網(giga-Portal,base /)的首頁、登入頁與其靜態檔;只在本機開發使用。
      // 「/」也要轉:沒有 it.app.access 時守衛導回入口網 /,若由 Vite 回應會再導回 /it/ 造成無限迴圈
      '^/(\\?.*)?$': toGateway,
      '^/(login|register|reset-password|no-access)(/|$|\\?)': toGateway,
      '/assets': toGateway,
    },
  },
});
