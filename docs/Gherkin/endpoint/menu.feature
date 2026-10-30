# language: zh-TW
# 端點管理選單拆分(ENDPOINT-MENU-PLAN M1;需求方 2026-10-30 決定 §8):五個選單、〔開發中〕Tab、舊網址 redirect。
# 「待核可」於 M2 實作(batches.feature),不再是開發中。
# 選單代碼登記在 deploy/gateway-rbac.yaml;既有環境的上層 / 名稱 / 排序與授權補洞由主討論串在「選單管理」手動調整(計畫 §3.2)。
功能: 端點管理 — 選單分類與開發中 Tab
  為了在功能變多後仍找得到、也能分開授權
  身為 IT 管理員
  我要端點管理分成端點儀表板、電腦管理、軟體管理、資安政策、Agent 管理五個選單,尚未做好的功能先以「開發中」Tab 顯示路線圖

  背景:
    假如 測試區 Gateway 已登記 it.endpoint-dashboard.read、it.endpoint-software.read、it.endpoint-policy.read、it.endpoint-agent.read
    而且 「選單管理」已把 Tab 的上層、名稱與排序調整為計畫 §3.2 的結構

  Rule: 側欄 — 依選單權限顯示,順序為端點儀表板 / 電腦管理 / 軟體管理 / 資安政策 / Agent 管理

    @manual
    場景: it-admin 看到五個選單
      假如 使用者擁有角色 it-admin
      當 展開側欄「端點管理」
      那麼 依序看到「端點儀表板」「電腦管理」「軟體管理」「資安政策」「Agent 管理」

    @manual
    場景: 只有開發中 Tab 的選單也會出現在側欄
      假如 使用者有 it.endpoint-policy.read,沒有任何端點 Tab 權限
      當 展開側欄「端點管理」
      那麼 看到「資安政策」
      而且 點進去顯示「USB 儲存控管」Tab 與開發中說明

    @manual
    場景: 沒有選單權限看不到該選單
      假如 使用者有 it.endpoint-software.list,但沒有 it.endpoint-software.read
      當 展開側欄「端點管理」
      那麼 沒有「軟體管理」
      而且 直接輸入 /endpoint/software 顯示 403

  Rule: 各選單的 Tab — 既有 Tab 依 Tab 權限顯示;〔開發中〕Tab 不綁 Tab 權限,有選單即可看到

    @manual
    場景大綱: 各選單的 Tab 與開發中標記
      假如 使用者擁有角色 it-admin
      當 開啟「<選單>」
      那麼 Tab 依序為 <Tab>
      而且 標「開發中」的 Tab 為 <開發中>

      例子:
        | 選單       | Tab                                                     | 開發中                               |
        | 端點儀表板 | 總覽                                                    | 總覽                                 |
        | 電腦管理   | 電腦清單、指令紀錄、告警、待核可、遠端協助、報修單          | 遠端協助、報修單                      |
        | 軟體管理   | 軟體目錄與派送、上傳與簽章、已安裝軟體、Windows 更新、授權報表 | 已安裝軟體、Windows 更新、授權報表      |
        | 資安政策   | USB 儲存控管                                            | USB 儲存控管                         |
        | Agent 管理 | Agent 版本、使用者端程式、Agent 設定                       | 使用者端程式、Agent 設定               |

    @manual
    場景: 開發中頁說明功能與設計文件,不呼叫 API
      當 開啟「軟體管理」的「Windows 更新」Tab
      那麼 顯示「Windows 更新(開發中)」卡片、功能說明與「RustIt docs/KB-UNINSTALL-DESIGN.md U4」
      而且 沒有送出任何 /api/endpoint/* 請求

    @manual
    場景: 既有頁面搬到新選單後功能不變
      當 開啟「軟體管理」的「軟體目錄與派送」Tab
      那麼 畫面與原「電腦清單 › 軟體派送」相同(待核可批次、軟體目錄、登錄 / 派送按鈕依按鈕權限)

  Rule: 舊網址 — 拆分前的 Tab 網址導向新位置(保留一個版本週期)

    @manual
    場景大綱: 舊網址 redirect
      當 開啟 "/it<舊網址>"
      那麼 網址變成 "/it<新網址>"

      例子:
        | 舊網址                              | 新網址                      |
        | /endpoint/devices/software          | /endpoint/software          |
        | /endpoint/devices/software-uploads  | /endpoint/software/uploads  |
        | /endpoint/devices/releases          | /endpoint/agent             |

  Rule: 版面

    @manual
    場景: 手機寬度與黑暗模式
      假如 視窗寬度 375px
      當 開啟「電腦管理」
      那麼 Tab 列可水平捲動,整頁沒有水平捲動
      而且 切換黑暗模式後「開發中」標記與卡片顏色清楚可讀
