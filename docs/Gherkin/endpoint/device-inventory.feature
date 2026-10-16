# language: zh-TW
# 2026-10-06 RustIt 整合 M3(RustIt docs/INTEGRATION-PLAN.md):資料來自 RustIt ItAgentBack(Node.js Endpoint Server),經 Gateway BFF。
# 本機驗證:ItAgentBack npm run dev(DEV_SKIP_TOKEN=1)+ RustAgent 連本機,GigaItApp 以 ENDPOINT_LOCAL 啟動(vite.config.ts,只影響本機畫面)。
# 測試區(2026-10-07 M4):ItAgentBack 已部署並註冊 OpenAPI、IT 已發佈;gateway-rbac.yaml 端點節點已加 includes: [endpoint.device.read];需求方以實機 Agent 驗證清單可見。
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

  # 2026-10-16 RustIt P3(RustIt docs/P3-DATA-DESIGN.md):後端分頁與篩選、詳情分 Tab、管理操作
  @manual
  場景: 依軟體名稱與 IP 找電腦
    當 在電腦清單的「軟體名稱」輸入 "7-Zip"
    那麼 只列出安裝了 7-Zip 的電腦,標題顯示「符合 N 台」
    當 清除後在關鍵字輸入電腦的 IP 前幾碼
    那麼 列出該 IP 的電腦;超過 50 台時以分頁切換

  @manual
  場景: 詳情分 Tab 與下載資產 JSON
    當 點開 "PC-EXAMPLE-01"
    那麼 看得到「概要、硬體、網路、軟體、安全與周邊、事件、指令」Tab
    而且 「軟體」Tab 可依名稱篩選,「事件」Tab 依時間新到舊並可載入更多
    當 按「下載資產 JSON」
    那麼 下載 "PC-EXAMPLE-01-<日期>.json"(Agent 回報的原始資產)

  @manual @security
  場景: 合併疑似同一台
    假如 測試 VM 改名並以新憑證重新登錄,與舊登錄的硬體指紋相同
    而且 使用者擁有按鈕 it.endpoint-device.admin 與 API 權限 endpoint.command.admin
    那麼 清單兩台都標示「疑似同一台」
    當 在舊裝置詳情按「把 <新名稱>(新登錄)併入這台」並填寫原因
    那麼 清單只剩舊裝置(裝置代碼不變、名稱改為新名稱),事件出現「合併」
    而且 新登錄勾「顯示退役」才看得到,狀態為「已合併」

  @manual @security
  場景: 沒有管理權限看不到管理操作
    假如 使用者沒有 endpoint.command.admin
    當 點開任一電腦
    那麼 「概要」Tab 不顯示停用、退役與合併按鈕
