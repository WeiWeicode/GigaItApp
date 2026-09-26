# language: zh-TW
@v0.1
功能: Gateway BFF 資料視覺化(讀取)
  為了不用登入資料庫也能掌握 Gateway 的服務、路由與權限
  身為 IT 工程師
  我要在 IT 管理系統看到 BFF 的上游、路由、發佈版本與角色權限

  背景:
    假如 BFF_MODE 為 "mock"(本機 Gateway 快照)或 "live"(以服務帳號登入 BFF)

  Rule: 資料來源與快取

    @auto @manual
    場景: 回應與畫面標示資料來源
      當 呼叫任一 /it/api/bff/* 讀取 API
      那麼 回應含 "source"("mock" 或 "live")與 "fetchedAt"
      而且 頁首顯示「BFF 模擬」(橘)或「BFF 即時」(綠)

    @manual
    場景: 讀取資料快取 30 秒,可強制重新整理
      當 30 秒內重複開啟同一頁
      那麼 不重新呼叫 BFF
      當 按「重新整理」(refresh=1)
      那麼 重新向 BFF 取得資料

    @e2e
    場景: live 模式以服務帳號登入 BFF,Token 過期時先 Refresh 再重新登入
      假如 BFF_MODE 為 "live",服務帳號為 "S100001"
      當 itapp-api 第一次讀取 BFF 資料
      那麼 以 POST /api/auth/login 取得 gn_at / gn_rt / gn_csrf
      當 BFF 回應 401
      那麼 先呼叫 POST /api/auth/refresh,失敗才重新登入,並重送一次原請求

    @auto
    場景: BFF 無法連線
      假如 BFF_MODE 為 "live" 且 BFF 無法連線
      當 呼叫 GET /it/api/bff/overview
      那麼 回應狀態為 502
      而且 回應 code 為 "ITAPP_BFF_UNAVAILABLE"
      而且 儀表板只有 /dashboard/gateway 回 502,其他區塊照常回應

  Rule: 清單分頁(懶加載)

    @auto @manual
    場景: 路由清單由後端篩選與分頁,並回傳篩選選項
      當 開啟「API 路由」
      那麼 只呼叫 GET /it/api/bff/routes?page=1&pageSize=12,畫面顯示「共 20 筆 · 第 1 / 2 頁」
      而且 回應 facets 提供系統與上游的下拉選項
      當 輸入關鍵字 "work-orders"
      那麼 停止輸入 300 ms 後才以 q=work-orders 查詢一次,顯示 3 筆
      而且 pageSize 超過 500 回應 400

    @auto @manual
    場景: 發佈版本分頁(由新到舊)
      當 開啟「發佈版本」
      那麼 只載入最新 10 個版本,並顯示「已顯示 10 / N 個版本」
      當 按「載入更多」
      那麼 追加下一頁 10 個版本,全部載入後按鈕消失

    @manual
    場景: 匯出 CSV 時才取回全部符合的路由
      假如 使用者有 "bff.route.export"
      當 在已篩選的「API 路由」按「匯出 CSV」
      那麼 逐頁(每頁 500 筆)取回全部符合的路由後才產生檔案

  Rule: 服務與路由

    @manual
    場景: 上游服務卡片
      當 開啟「服務與路由 > 上游服務」
      那麼 每個上游顯示代碼、名稱、系統、目標位址與部署區、各狀態路由數、逾時
      而且 點「N 支路由」切到「API 路由」並以該上游篩選

    @manual
    場景: 路由清單篩選與明細
      當 在「API 路由」輸入關鍵字、選擇系統 / 上游、切換驗證模式
      那麼 清單即時篩選並顯示「符合數 / 總數」
      當 點選一列
      那麼 對話框顯示「瀏覽器 → Gateway BFF → 上游」的請求路徑、狀態、API 用途說明
      而且 有權限代碼時可按「誰可以呼叫這支 API?」跳到權限反查

    @auto @manual
    場景: 路由顯示開發專案與行為規格
      假如 下游服務以 OpenAPI "x-gateway.project" 登記開發專案、以 "x-gherkin" 登記行為規格(Gateway PRD v0.6)
      當 開啟「API 路由」
      那麼 清單的「開發專案」欄顯示 repo 資料夾名稱,例 "giga-api-gateway-bff"
      而且 未登記的 proxy 路由顯示「未登記」,聚合 / mock 路由顯示「Gateway」
      而且 以開發專案當關鍵字搜尋,只列出該專案的路由
      當 點選一列
      那麼 對話框顯示開發專案與 Gherkin 行為規格(關鍵字 功能 / 場景 / 假如 / 當 / 那麼 / 而且 醒目標示)
      而且 沒有行為規格時顯示「下游尚未提供行為規格」

    @manual
    場景: 匯出路由清單(需 bff.route.export)
      假如 使用者有 "bff.route.export"
      當 按「匯出 CSV」
      那麼 下載目前篩選結果(UTF-8 BOM,Excel 可直接開啟),含開發專案欄
      但是 沒有此權限的使用者看不到此按鈕

  Rule: BFF 權限

    @auto @manual
    場景: 權限反查
      當 在「權限反查」選擇 "gw.admin.route.read"
      那麼 列出擁有此權限的角色(含 "gw-it-admin"),以及各角色的 AD 群組、公司預設、個別指派
      而且 列出需要此權限的 API 路由

    @auto
    場景: 查詢不存在的權限
      當 呼叫 GET /it/api/bff/rbac/who-can-access?permission=nope.x.y
      那麼 回應的 exists 為 false

    @manual
    場景: 關係圖高亮上下游
      當 在「關係圖」將滑鼠移到角色 "gw-it-admin"
      那麼 亮出它擁有的權限與這些權限保護的 API 路由,其餘節點淡化
      當 點擊節點
      那麼 固定高亮,再點一次取消
