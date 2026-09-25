# language: zh-TW
@v0.1 @security
功能: 有效權限 = 職級權限 ∩ 部門限制
  為了讓不同職級、不同部門的 IT 人員只看到並只能操作自己負責的功能
  身為 IT 主管
  我要以「職級 × 權限」再加上「部門限制」決定每個人的選單與按鈕

  背景:
    假如 使用預設權限設定(README「權限模型」)
    而且 "bff.route.publish" 只開放給部門 "DEV"、"SYS"

  Rule: 職級權限

    @auto
    場景: 系統管理員固定擁有全部權限
      當 "itadmin" 登入
      那麼 me 的 permissions 包含全部 17 項權限代碼
      而且 dataScope 為 "all"

    @auto
    場景: 一般工程師不能新增人員(後端檢查,不只是前端隱藏按鈕)
      假如 "S100032"(程式開發課 · 一般工程師)已登入
      當 直接呼叫 POST /it/api/users
      那麼 回應狀態為 403
      而且 回應 code 為 "ITAPP_PERMISSION_DENIED"
      而且 details.permission 為 "sys.user.create"

  Rule: 部門限制

    @auto @manual
    場景大綱: 同職級不同部門的發佈權限
      假如 "<工號>"(<部門> · 高級工程師)已登入
      那麼 me 的 permissions <是否> 包含 "bff.route.publish"
      而且 「發佈版本」頁 <是否> 顯示「發佈草稿」按鈕

      例子:
        | 工號    | 部門       | 是否 |
        | S100031 | 程式開發課 | 有   |
        | S100040 | 資安課     | 沒有 |

  Rule: 選單

    @auto
    場景: 選單只回傳有權限的項目,且不回傳空群組
      當 "S100012"(網管課 · 一般工程師)登入
      那麼 me 的 menus 含「人員與部門」
      但是 不含「角色與按鈕權限」與「稽核紀錄」
      而且 每個選單群組至少有一個子項目

    @manual
    場景: 首頁沒有權限時導向第一個可見的選單
      假如 某職級沒有 "dashboard.view"
      當 該職級的人員開啟 /it/
      那麼 導向其第一個可見選單頁面,而不是 403
