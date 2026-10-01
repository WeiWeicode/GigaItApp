# language: zh-TW
@v0.1
功能: 首頁儀表板
  為了一登入就掌握服務健康、Gateway 設定與團隊工作量
  身為 IT 人員
  我要在儀表板以卡片與圖表看到重點數字,並清楚知道哪些是模擬資料

  Rule: 依 Tab 與捲動位置載入(懶加載)

    @manual
    場景: 進頁只載入第一眼需要的資料
      當 使用者開啟「儀表板 > 營運總覽」
      那麼 只呼叫 GET /it/api/dashboard/overview
      當 捲動到「近期工單 / 最近操作」附近
      那麼 才呼叫 GET /it/api/dashboard/work 並顯示內容(之前顯示骨架)
      當 切到「Gateway 概況」Tab
      那麼 才呼叫 GET /it/api/dashboard/gateway

    @auto
    場景: BFF 無法連線只影響 Gateway 區塊
      假如 BFF_MODE 為 "live" 且 BFF 無法連線
      那麼 GET /it/api/dashboard/gateway 回應 502 "ITAPP_BFF_UNAVAILABLE"
      但是 /dashboard/overview、/dashboard/work、/dashboard/team 照常回應 200

  Rule: 內容

  @auto @manual
  場景: 營運總覽
    當 具 "dashboard.view" 的人員開啟「儀表板 > 營運總覽」
    那麼 顯示問候卡(姓名、部門、職級、日期)與 5 張 KPI 卡(數值、較昨日、14 日趨勢)
    而且 顯示 24 小時流量圖、系統告警、近期工單與最近操作
    而且 模擬區塊保留卡片並標示「開發中」,問候卡標示「部分功能開發中」

  @auto
  場景: 模擬資料清空並標示開發中
    當 呼叫 GET /it/api/dashboard/overview
    那麼 mockSections 為空陣列
    而且 GET /it/api/dashboard/gateway 的 gateway 數字來自 BFF(routes 為數字)

  @auto
  場景: 儀表板模擬資料已清空且結構一致
    當 呼叫 GET /it/api/dashboard/overview
    那麼 kpis、traffic、alerts 皆為空陣列

  @auto
  場景: 最近操作的可見範圍
    假如 "S100032" 沒有 "sys.audit.read"
    當 呼叫 GET /it/api/dashboard/work
    那麼 activityScope 為 "self","最近操作"只顯示 "S100032" 自己的操作
    而且 有 "sys.audit.read" 的人員看到全部人員的操作

  @manual
  場景: Gateway 概況與團隊工作
    當 切到「Gateway 概況」
    那麼 顯示上游、路由、已發佈、草稿、權限、角色數(可點擊跳到對應頁)、路由依系統環圈圖、驗證模式長條、線上版本、上游 p95
    當 切到「團隊工作」
    那麼 每個部門顯示成員數(真實)、處理中與結案數(模擬)與結案率

  @wip
  場景: 以真實來源取代模擬資料
    假如 已接上監控(Nginx 日誌 / Prometheus)與工單系統
    那麼 KPI、流量、上游延遲、工單、告警改讀真實資料,mockSections 不再列出這些區塊
