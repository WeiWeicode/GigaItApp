# language: zh-TW
# 過渡期(2026-10-05):本檔描述 v0.1 自有登入 / 自有權限(/it/api/*、職級 × 部門),前端已改用 Gateway 單一入口與畫面權限模型(Gateway PRD §8.3.2),測試區驗收後隨 /it/api/* 一併移除。現行行為見 auth/gateway-sso.feature。
@v0.1
功能: 端點管理 — 電腦清單(經 Gateway BFF)
  為了在 IT 管理系統查看使用者電腦上 Agent 的連線狀況
  身為 IT 人員
  我要經 Gateway BFF 取得 Agent 基本資料,且資料權限以 Gateway 為準(Gateway PRD Q27、ENDPOINT-AGENT-GUIDE §8)

  Rule: 本系統只決定選單是否顯示

    @auto
    場景: 預設職級看得到「端點管理 → 電腦清單」選單
      當 "S100032"(程式開發課 · 一般工程師)登入
      那麼 me 的 menus 包含 "ep-devices"
      而且 me 的 permissions 包含 "endpoint.device.read"

  Rule: 資料經 Gateway BFF,以 Gateway 的登入與權限為準

    背景:
      假如 本機 Gateway dev 環境已啟動,Agent "CN=PC-001" 已經由 :9443 連線
      而且 "S100001" 已登入 IT 管理系統

    @manual @e2e
    場景: Gateway 已登入且為同一工號,顯示 Agent 清單
      假如 瀏覽器已以 "S100001" 登入 Gateway 入口網(Gateway 角色 it-endpoint)
      當 開啟 "/it/endpoint/devices"
      那麼 清單顯示電腦 "PC-001",狀態、憑證 DN、指紋、最後回報時間
      而且 頁首顯示 "Gateway:S100001"

    @manual @e2e
    場景: 尚未登入 Gateway
      假如 瀏覽器沒有 Gateway 的登入狀態
      當 開啟 "/it/endpoint/devices"
      那麼 顯示「需要登入 Gateway」與「登入 Gateway」按鈕
      當 點選「登入 Gateway」
      那麼 導向 "/login?redirect=/it/endpoint/devices"

    @manual @e2e @security
    場景: Gateway 登入者與 IT 管理系統登入者不同
      假如 瀏覽器以 "S112009" 登入 Gateway
      當 開啟 "/it/endpoint/devices"
      那麼 顯示「Gateway 登入者與目前使用者不同」,不呼叫 /api/endpoint/devices

    @manual @e2e @security
    場景: Gateway 沒有 endpoint.device.read
      假如 瀏覽器以 "S100001" 登入 Gateway,但該帳號在 Gateway 沒有 endpoint.device.read
      當 開啟 "/it/endpoint/devices"
      那麼 顯示「Gateway 權限不足」

  @wip
  場景: 對電腦下指令
    假如 Gateway 使用者擁有 endpoint.command.basic
    當 在電腦清單對 "PC-001" 選擇「收集資產」
    那麼 BFF 回 202 與 commandId,畫面輪詢顯示執行進度(ENDPOINT-AGENT-GUIDE §8.4)
