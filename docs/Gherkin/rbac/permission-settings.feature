# language: zh-TW
@v0.1
功能: 角色與按鈕權限設定
  為了在不改程式的情況下調整誰能做什麼
  身為系統管理員
  我要在「角色與按鈕權限」頁調整職級權限與部門限制,並試算結果

  Rule: 職級權限

    @auto @manual
    場景: 調整職級權限後立即生效
      假如 "S100021"(一般工程師)呼叫 GET /it/api/audit 回應 403
      當 系統管理員在「職級權限」勾選一般工程師的 "sys.audit.read",按「儲存」並確認
      那麼 畫面顯示「已儲存職級權限」
      而且 "S100021" 不需重新登入,再次呼叫 GET /it/api/audit 回應 200

    @auto
    場景: 系統管理員的權限不可調整
      當 呼叫 PUT /it/api/rbac/levels/admin/permissions
      那麼 回應狀態為 400
      而且 「職級權限」頁的系統管理員欄位為鎖定狀態

    @auto
    場景: 不存在的權限代碼
      當 以 permissions ["x.y.z"] 呼叫 PUT /it/api/rbac/levels/engineer/permissions
      那麼 回應狀態為 400
      而且 details.unknown 為 ["x.y.z"]

    @auto @manual
    場景: 主管可檢視但不能調整
      假如 "S100001"(主管)已登入
      那麼 「職級權限」頁顯示「唯讀」且開關不可操作
      而且 直接呼叫 PUT /it/api/rbac/levels/engineer/permissions 回應 403 "ITAPP_PERMISSION_DENIED"

    @manual
    場景: 未儲存的變更可復原
      當 系統管理員切換任一開關
      那麼 下方出現儲存列,列出各職級 +新增 / −移除 的數量
      而且 按「復原」後回到原設定

  Rule: 部門限制

    @auto
    場景: 設定部門限制後立即生效;清空即不限部門
      假如 "S100031"(程式開發課 · 高級工程師)擁有 "bff.route.export"
      當 將 "bff.route.export" 的部門限制設為 ["NET"]
      那麼 "S100031" 的 permissions 不再包含 "bff.route.export"
      當 將 "bff.route.export" 的部門限制清空
      那麼 "S100031" 的 permissions 又包含 "bff.route.export"

    @auto
    場景: 不存在的部門
      當 將部門限制設為 ["XXX"]
      那麼 回應狀態為 400

  Rule: 權限試算

    @auto @manual
    場景: 同職級不同部門的試算結果
      當 在「權限試算」選擇職級「高級工程師」與部門「資安課」
      那麼 「發佈 / 回滾」顯示為「被部門擋下」並標示「限 程式開發課、系統課」
      當 部門改為「程式開發課」
      那麼 「發佈 / 回滾」顯示為有效權限
      而且 右側「選單預覽」同步更新
