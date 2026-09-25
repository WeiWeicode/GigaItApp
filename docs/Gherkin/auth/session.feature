# language: zh-TW
@v0.1 @security
功能: Session、CSRF 與密碼變更
  為了讓登入狀態安全且權限調整能立即生效
  身為 IT 管理系統
  我要以 httpOnly Cookie 保存 Session、驗證 CSRF,並在帳號狀態改變時讓舊 Session 失效

  Rule: Session 與 CSRF

    @auto
    場景: 未登入呼叫 API
      當 未帶 Cookie 呼叫 GET /it/api/auth/me
      那麼 回應狀態為 401
      而且 回應 code 為 "ITAPP_UNAUTHENTICATED"

    @auto
    場景: 非 GET 請求未帶 CSRF 標頭
      假如 "S100001" 已登入
      當 呼叫 POST /it/api/bff/releases 但未帶 X-CSRF-Token
      那麼 回應狀態為 403
      而且 回應 code 為 "ITAPP_CSRF_INVALID"

    @manual
    場景: Session 剩餘時間不到一半時自動換發
      假如 "S100001" 的 Session 有效期 8 小時,已使用 5 小時
      當 呼叫任一需登入的 API
      那麼 回應重新設定 "it_at" 與 "it_csrf",有效期重新計算為 8 小時

    @manual
    場景: Session 失效時回到登入頁並保留原頁面
      假如 使用者停在 /it/system/users
      當 任一 API 回應 401
      那麼 瀏覽器導向 /it/login?redirect=/system/users&expired=1,並顯示「登入已逾時」
      而且 重新登入後回到 /it/system/users

  Rule: 讓舊 Session 失效

    @auto
    場景: 登出後 Token 不可再使用
      假如 "S100020" 已登入
      當 呼叫 POST /it/api/auth/logout
      那麼 回應狀態為 204 並清除 Cookie
      而且 以原本的 Cookie 呼叫 GET /it/api/auth/me 回應 401

    @auto
    場景: 帳號被停用後既有 Session 立即失效
      假如 "S100033" 已登入
      當 系統管理員停用 "S100033"
      那麼 "S100033" 原本的 Cookie 呼叫任一 API 回應 401

  Rule: 變更自己的密碼

    @auto
    場景大綱: 密碼政策
      假如 "S100011" 已登入
      當 以目前密碼 "<目前密碼>" 變更為新密碼 "<新密碼>"
      那麼 回應狀態為 <狀態>

      例子:
        | 目前密碼  | 新密碼     | 狀態 |
        | x         | abc12345   | 400  |
        | Passw0rd! | abcdefgh   | 400  |
        | Passw0rd! | NewPass123 | 200  |

    @auto
    場景: 變更密碼後其他 Session 失效,目前頁面維持登入
      假如 "S100011" 在兩個瀏覽器登入
      當 在其中一個瀏覽器變更密碼成功
      那麼 另一個瀏覽器的 Session 回應 401
      而且 變更密碼的瀏覽器取得新 Session 並維持登入
