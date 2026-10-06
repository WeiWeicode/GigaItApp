# language: zh-TW
# 2026-10-06 RustIt 整合 M3(RustIt docs/INTEGRATION-PLAN.md):資料來自 RustIt ItAgentBack(Node.js Endpoint Server),經 Gateway BFF。
# 本機驗證:ItAgentBack npm run dev(DEV_SKIP_TOKEN=1)+ RustAgent 連本機,GigaItApp 以 ENDPOINT_LOCAL 啟動(vite.config.ts,只影響本機畫面)。
# 測試區:待 M4(ItAgentBack 註冊 OpenAPI、gateway-rbac.yaml 端點節點補 includes: [endpoint.device.read])。
功能: 端點管理 — 電腦清單顯示 Agent 回報的基本資訊與詳情
  為了知道公司電腦的使用者、網路位址與硬體狀況
  身為 IT 人員
  我要在電腦清單看到 Agent 回報的基本資訊,並點開看硬體、網卡、磁碟與防毒

  背景:
    假如 電腦 "PC-EXAMPLE-01" 的 Agent 已回報資產,且 WebSocket 在線
    而且 使用者擁有選單 it.endpoint-device.read、Tab it.endpoint-device.list 與 API 權限 endpoint.device.read

  @manual
  場景: 清單顯示基本資訊
    當 開啟 "/it/endpoint/devices"
    那麼 清單欄位為 電腦名稱、狀態、使用者、IP、作業系統、CPU、記憶體、最後回報
    而且 "PC-EXAMPLE-01" 的狀態為「在線」,使用者為 "EXAMPLE\user01",IP 為 "192.0.2.10"
    而且 卡片副標題顯示「1 台,在線 1 台」

  @manual
  場景: 點列開啟詳情
    當 在清單點選 "PC-EXAMPLE-01"
    那麼 開啟對話框,標題為電腦名稱
    而且 顯示使用者、作業系統、製造商 / 型號、序號、Agent 版本、憑證 DN 與指紋
    而且 顯示「硬體」(CPU、記憶體、顯示卡)、「安全」(防毒啟用與病毒碼、最近更新、已安裝軟體筆數)、「磁碟」(各磁碟區用量)、「網路卡」(IP、MAC、DHCP)

  @manual
  場景: Agent 中斷後變離線
    假如 "PC-EXAMPLE-01" 的 Agent 被結束
    當 約 90 秒內重新整理電腦清單
    那麼 "PC-EXAMPLE-01" 的狀態為「離線」,最後回報為 Agent 結束的時間

  @manual
  場景: 已連線但尚未回報資產
    假如 Agent 已建立 WebSocket,但第一份資產回報尚未完成
    當 點選該電腦
    那麼 詳情顯示「尚未收到資產回報」,清單的使用者、IP 等欄位顯示「—」

  @manual @security
  場景: 沒有 endpoint.device.read 時維持權限不足提示
    假如 使用者在 Gateway 沒有 endpoint.device.read
    當 開啟 "/it/endpoint/devices"
    那麼 顯示「Gateway 權限不足」,不呼叫 /api/endpoint/devices
