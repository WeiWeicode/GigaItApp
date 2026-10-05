# language: zh-TW
# 過渡期(2026-10-05):本檔描述 v0.1 自有登入 / 自有權限(/it/api/*、職級 × 部門),前端已改用 Gateway 單一入口與畫面權限模型(Gateway PRD §8.3.2),測試區驗收後隨 /it/api/* 一併移除。現行行為見 auth/gateway-sso.feature。
@v0.1
功能: 稽核紀錄
  為了追查誰在什麼時候改了什麼
  身為 IT 主管
  我要查詢登入紀錄與所有設定變更

  @auto
  場景: 寫入操作記錄操作人員、動作與對象
    當 "itadmin" 新增部門 "OPS"
    那麼 操作紀錄新增一筆 actor "itadmin"、action "dept.create"、target "OPS"

  @auto @manual
  場景: 依類型、關鍵字查詢並分頁
    當 開啟「稽核紀錄 > 操作紀錄」並搜尋 "dept.create"
    那麼 只列出符合的紀錄,由新到舊,每頁 15 筆
    而且 動作欄位以中文顯示(例:「新增部門」)

  @auto
  場景: 沒有稽核權限不能查詢
    假如 "S100021"(一般工程師,預設無 sys.audit.read)已登入
    當 呼叫 GET /it/api/audit
    那麼 回應狀態為 403

  @wip
  場景: 稽核紀錄匯出與保存期限
    當 IT 主管匯出上個月的操作紀錄
    那麼 下載 CSV,且紀錄保存至少 1 年(目前只保留最近 2000 筆)
