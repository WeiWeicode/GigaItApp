# language: zh-TW
@v0.2 @security
功能: Gateway 單一入口與經 BFF 轉入的 API
  為了讓 IT 管理系統與員工入口網共用同一個登入、權限只在 Gateway 設定一次
  身為 IT 管理系統
  我要以 Gateway web-kit 判斷登入與權限,並只接受經 Gateway BFF 轉入、帶有效內部 Token 的 /api/it/* 請求
  (giga-Portal PRD D2、§9.2 I1–I4;Gateway BACKEND-GUIDE §4.2)

  Rule: itapp-api 的 /api/it/* 只信任 X-Internal-Token

    @auto
    場景: 未帶內部 Token 直接呼叫
      當 未帶 X-Internal-Token 呼叫 GET /api/it/dashboard/overview
      那麼 回應狀態為 401
      而且 回應 code 為 "ITAPP_INTERNAL_TOKEN_INVALID"

    @auto
    場景: 帶 BFF 簽發的內部 Token
      假如 內部 Token 由 BFF 金鑰簽發(iss = giganexus-bff、aud = itapp-api、ES256、未過期)
      當 呼叫 GET /api/it/dashboard/overview
      那麼 回應狀態為 200

    @auto
    場景大綱: 內部 Token 不符時拒絕
      假如 內部 Token 的 <欄位> 不符
      當 呼叫 GET /api/it/dashboard/work
      那麼 回應狀態為 401
      而且 回應 code 為 "ITAPP_INTERNAL_TOKEN_INVALID"

      例子:
        | 欄位            |
        | aud(給其他服務) |
        | iss             |
        | 簽章金鑰         |
        | 已過期           |

    @auto
    場景: 內部 Token 不能拿來呼叫過渡期的自有登入 API
      假如 帶有效的內部 Token
      當 呼叫 GET /it/api/auth/me
      那麼 回應狀態為 401
      而且 回應 code 為 "ITAPP_UNAUTHENTICATED"

  Rule: 前端改用 Gateway 單一入口(瀏覽器操作)

    @manual
    場景: 未登入 Gateway 開啟 IT 管理系統
      當 未登入時開啟 /it/system/users
      那麼 導向入口網 /login?redirect=/it/system/users
      而且 登入後回到 /it/system/users

    @manual
    場景: 沒有 IT 管理系統應用權限
      假如 使用者沒有 "it.app.access"
      當 開啟 /it/
      那麼 導回入口網首頁 /

    @manual
    場景: 選單依選單權限與 BFF 讀取權限的交集顯示
      假如 使用者有 "it.gw-service.read" 但沒有 "gw.admin.route.read"
      那麼 側邊選單不顯示「服務與路由」
      而且 直接開啟 /it/gateway/services 顯示 403 頁

    @manual
    場景: 管理操作以使用者本人身分寫入 BFF
      假如 "S112009" 具備 "gw.admin.route.write"
      當 在「服務與路由 › API 路由」修改一條路由並儲存
      那麼 路由狀態變為草稿
      而且 Gateway 稽核紀錄的操作人為 "S112009"
