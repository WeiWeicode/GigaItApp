# language: zh-TW
@v0.1 @security
功能: IT 管理系統登入(自有帳號,不共用單一入口)
  為了讓 IT 人員用獨立的帳號管理 Gateway 與團隊權限
  身為 IT 部門成員
  我要用 IT 管理系統的工號與密碼登入,登入後依職級與部門看到可用的功能

  背景:
    假如 IT 管理系統有種子帳號,密碼皆為 "Passw0rd!"(虛構資料)
    而且 帳號 "S100041" 已停用

  Rule: 帳號與入口網(AD / 本機帳號)完全分開

    @auto @manual
    場景: 正確工號與密碼登入成功
      當 使用者以帳號 "S100001" 與密碼 "Passw0rd!" 呼叫 POST /it/api/auth/login
      那麼 回應狀態為 200
      而且 回應的 me 中 "level.code" 為 "manager"、"department.code" 為 "SYS"
      而且 回應設定 Cookie "it_at"(httpOnly、SameSite=Strict、Path=/it/api)與 "it_csrf"(Path=/it/)
      而且 瀏覽器導向該使用者第一個可見的選單頁面

    @auto
    場景: 工號不分大小寫
      當 使用者以帳號 "ITADMIN" 與正確密碼登入
      那麼 回應狀態為 200

    @auto
    場景: 密碼錯誤
      當 使用者以帳號 "S100001" 與密碼 "wrong" 登入
      那麼 回應狀態為 401
      而且 回應 code 為 "ITAPP_LOGIN_FAILED"
      而且 回應含 requestId

    @auto
    場景: 停用帳號不可登入
      當 使用者以帳號 "S100041" 與正確密碼登入
      那麼 回應狀態為 403
      而且 回應 code 為 "ITAPP_ACCOUNT_DISABLED"

    @auto
    場景: 缺少必要欄位
      當 使用者只送出帳號 "itadmin" 未送密碼
      那麼 回應狀態為 400
      而且 回應 code 為 "ITAPP_VALIDATION_FAILED"

  Rule: 連續失敗不鎖定(鎖定策略已暫停實施)

    @auto
    場景: 連續多次密碼錯誤後仍不鎖定帳號
      假如 帳號 "S100030" 已連續多次密碼錯誤
      當 使用者以帳號 "S100030" 與正確密碼登入
      那麼 回應狀態為 200

  Rule: 登入紀錄

    @auto
    場景: 登入成功與失敗都寫入登入紀錄
      當 使用者以帳號 "S100020" 與錯誤密碼登入
      那麼 登入紀錄新增一筆 actor 為 "s100020"、result 為 "failure" 的資料
      而且 紀錄包含來源 IP

  Rule: 開發環境示範帳號

    @manual
    場景: dev 建置顯示示範帳號,正式建置不顯示
      假如 前端以 "npm run dev" 啟動
      當 使用者開啟 /it/login
      那麼 畫面顯示示範帳號清單,點選後自動填入工號與密碼
      但是 "npm run build" 產生的正式版不顯示示範帳號
