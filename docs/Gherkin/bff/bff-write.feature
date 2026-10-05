# language: zh-TW
# 過渡期(2026-10-05):本檔描述 v0.1 自有登入 / 自有權限(/it/api/*、職級 × 部門),前端已改用 Gateway 單一入口與畫面權限模型(Gateway PRD §8.3.2),測試區驗收後隨 /it/api/* 一併移除。現行行為見 auth/gateway-sso.feature。
@v0.1
功能: Gateway BFF 設定(寫入)
  為了在 IT 管理系統直接調整 Gateway 的角色權限與發佈路由
  身為具相應按鈕權限的 IT 人員
  我要能操作,但在 BFF 尚未提供管理 API 時得到明確的「尚未開放」,而不是假裝成功

  Rule: 按鈕權限

    @auto
    場景: 沒有發佈權限不能發佈
      假如 "S100040"(資安課 · 高級工程師)已登入
      當 呼叫 POST /it/api/bff/releases
      那麼 回應狀態為 403

    @manual
    場景: 角色權限矩陣的編輯模式(需 bff.rbac.edit)
      假如 "S100001"(系統課主管)已登入
      當 在「角色權限矩陣」按某角色的「編輯」
      那麼 該欄變為核取方塊,下方儲存列顯示 +新增 / −移除 數量
      當 按「儲存」並確認
      那麼 依資料來源得到下列結果之一

  Rule: mock 模式只影響本系統資料

    @auto
    場景: mock 模式設定 BFF 角色權限
      假如 BFF_MODE 為 "mock"
      當 將角色 "mes-operator" 的權限設為 ["mes.workorder.read"]
      那麼 回應狀態為 200,重新讀取矩陣時 "mes-operator" 只有 "mes.workorder.read"
      而且 任何 Gateway 都不受影響

    @auto
    場景: mock 模式發佈只新增模擬版本
      假如 BFF_MODE 為 "mock",且 "S100031"(程式開發課 · 高級工程師)已登入
      當 以說明「測試」發佈
      那麼 發佈歷程最上方新增一筆說明以「[模擬]」開頭的版本
      而且 稽核紀錄新增 "bff.release.publish"

  Rule: live 模式在 BFF 提供 API 前明確拒絕

    @auto @e2e
    場景大綱: live 模式寫入回 501
      假如 BFF_MODE 為 "live"
      當 呼叫 <API>
      那麼 回應狀態為 501
      而且 回應 code 為 "ITAPP_BFF_NOT_SUPPORTED",訊息指出請暫以 Gateway CLI 操作
      而且 畫面以警告提示「BFF 尚未開放」

      例子:
        | API                                              |
        | PUT /it/api/bff/rbac/roles/employee/permissions  |
        | POST /it/api/bff/releases                        |

    @wip
    場景: BFF 提供管理 API 後改為實際寫入
      假如 BFF 已提供 PRD §8.7 的 /api/admin/roles/:id/permissions 與 /api/admin/releases
      當 在 live 模式儲存角色權限或發佈
      那麼 寫入 Gateway 並回傳新版本號

    @manual
    場景: 上游編輯尚未開放
      當 有 "bff.upstream.edit" 的人員在上游卡片按「編輯」
      那麼 顯示「上游編輯尚未開放」提示
