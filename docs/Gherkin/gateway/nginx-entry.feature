# language: zh-TW
# 過渡期(2026-10-05):本檔描述 v0.1 自有登入 / 自有權限(/it/api/*、職級 × 部門),前端已改用 Gateway 單一入口與畫面權限模型(Gateway PRD §8.3.2),測試區驗收後隨 /it/api/* 一併移除。現行行為見 auth/gateway-sso.feature。
@v0.1 @e2e
功能: 經 Gateway Nginx 提供 /it/ 與 /it/api/
  為了讓 IT 管理系統與其他系統共用同一個入口,但登入獨立
  身為 Gateway 負責人
  我要讓 /it/ 提供 SPA、/it/api/ 直接轉給 itapp-api,且不影響 /api/(BFF)

  背景:
    假如 Nginx 環境變數 ITAPP_API_UPSTREAM 為 "itapp-api:51291"
    而且 GigaItApp 前端已發佈到 "/srv/www/it-admin/current"

  場景: SPA 子路徑與 History 模式
    當 瀏覽器開啟 https://GATEWAY_IP/it/gateway/rbac/graph
    那麼 回應狀態為 200,內容為 IT 管理系統的 index.html

  場景: /it/api/ 轉給 itapp-api
    當 呼叫 GET https://GATEWAY_IP/it/api/healthz
    那麼 回應狀態為 200,且 bffMode 為 "live"
    而且 回應含安全標頭(CSP、HSTS、X-Frame-Options)與唯一一個 X-Request-Id

  場景: /api/ 仍由 BFF 處理,兩邊 Session 互不影響
    假如 使用者已登入 IT 管理系統
    當 呼叫 GET https://GATEWAY_IP/api/auth/me
    那麼 回應狀態為 401(IT 管理系統的 it_at Cookie 只送往 /it/api)

  @security
  場景: 登入 API 套用登入限流
    當 同一 IP 在短時間內大量呼叫 POST /it/api/auth/login
    那麼 超過 gw_auth 限流後回應 429 "RATE_LIMITED"

  場景: itapp-api 尚未部署
    假如 itapp-api 沒有啟動
    那麼 Nginx 仍可正常啟動
    而且 呼叫 /it/api/* 回應 502 "UPSTREAM_ERROR"

  場景: 前端發佈與回滾
    當 執行 docker compose -f deploy/docker-compose.yml run --rm spa-it rollback it-admin
    那麼 /srv/www/it-admin/current 指回上一版,不需重啟 Nginx
