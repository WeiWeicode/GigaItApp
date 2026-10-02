# GigaNexus IT 管理系統 — 產品需求文件(PRD)

> IT 部門專用的管理系統:集中檢視並設定 Gateway BFF 的服務、路由與權限,並以「職級 × 部門」控管 IT 人員能看到的選單與能按的按鈕。
> 本文件以 **BDD** 撰寫:每項需求附使用者故事與對應的 Gherkin 驗收場景([Gherkin/](Gherkin/README.md))。

---

## 1. 文件資訊

| 項目 | 內容 |
| --- | --- |
| 產品名稱 | GigaNexus IT 管理系統(GigaItApp) |
| 文件版本 | **v0.1.6** |
| 建立日期 | 2026-09-25 |
| 技術棧 | Vue 3 + Vite(前端)/ Node.js 22 + Fastify 5 + TypeScript(後端 itapp-api)/ 經 Gateway Nginx 對外(詳見 [ARCHITECTURE.md](ARCHITECTURE.md)) |
| 相關文件 | [ARCHITECTURE.md](ARCHITECTURE.md)(架構與技術)、[API.md](API.md)(API 規格)、[UI-GUIDE.md](UI-GUIDE.md)(前端 UI 規範)、[Gherkin/](Gherkin/README.md)(驗收場景)、[../AGENT.md](../AGENT.md)(AI 協作準則)、Gateway 專案 `giga-api-gateway-bff/docs/`(上位規範) |
| 上位規範 | Gateway PRD v0.5(§7.2 SPA 子路徑、§8.3 RBAC、§8.7 管理 API)、FRONTEND-GUIDE、BACKEND-GUIDE §3.3(port 51291 已登記) |
| 狀態 | v0.1 基本框架完成(登入、UI、網頁框架、權限框架、BFF 讀取);頂列應用切換已完成(v0.1.5);改用單一入口(giga-Portal PRD I1–I5)尚未實作;待決事項見 §10 |

### 1.1 修訂紀錄

| 版本 | 日期 | 變更內容 |
| --- | --- | --- |
| v0.1.6 | 2026-10-01 | **建議(待確認,尚未實作)**:部門改綁 Gateway 的 BPM 部門樹(`gw.department`),以 Gateway 角色規則依部門指派 IT 管理系統權限,不在本系統複製部門資料(§5.2.1);新增 Q9–Q11。測試區 / 正式區已不保留示範帳號(後端修改紀錄 2026-10-01) |
| v0.1.5 | 2026-09-26 | 頂列**應用切換**(giga-Portal PRD FR-2.3、I3 的一部分):列出使用者有權限的應用並整頁導向,資料取自使用者的 Gateway 登入(`/api/auth/me`;沒有 Gateway 登入時不顯示);Gateway `me.apps`(G3)前暫以 `*.app.access` 推導。文件版本欄對齊修訂紀錄(原誤為 v0.1.2) |
| v0.1.4 | 2026-09-26 | **決策紀錄(尚未實作)**:需求方決定本系統**改用 Gateway 單一入口**,取消自有帳號與「職級 × 部門」權限;權限(含應用 / 選單 / Tab / 按鈕)以 BFF 為唯一來源,本系統提供各應用的權限設定畫面;新增應用切換與路由守衛(無 `it.app.access` 導回員工入口網)。詳見 `../giga-Portal/docs/PRD.md` D2、§9.2(I1–I5)與 Gateway PRD v0.7;本文件 FR-1.x、FR-2.x 將於實作時改寫。Q4 由此定案 |
| v0.1.3 | 2026-09-26 | API 路由新增「開發專案」欄(下游 repo 資料夾名稱,取自 Gateway `gw.upstream.project` / OpenAPI `x-gateway.project`,Gateway PRD v0.6)與明細的 **Gherkin 行為規格**(OpenAPI `x-gherkin`);關鍵字搜尋與匯出 CSV 含開發專案(FR-4.3) |
| v0.1.2 | 2026-09-25 | **端點管理**(§6.8):選單「端點管理 → 電腦清單」,經 Gateway BFF 取得 Agent 基本資料,**權限以 BFF 為準**、本系統只決定顯示(Gateway PRD Q27);新增權限 `endpoint.device.read`(共 18 項);與 Gateway、Go Endpoint Server 等專案同層放置(Gateway `AGENT.md` §10) |
| v0.1.1 | 2026-09-25 | ① 側欄收合時滑鼠移上浮出功能清單(FR-6.1);② **懶加載**(FR-6.7):清單改後端篩選 + 分頁(路由、人員、發佈版本)、儀表板依區塊拆 API(Tab 切換 / 捲動到才載入)、對話框選項按需查詢 |
| v0.1 | 2026-09-25 | 初稿。① `/it/` 由本系統取代 Gateway 範例 IT 頁面;② **自有登入、不共用單一入口**(需求方明確要求,為 Gateway FRONTEND-GUIDE §7.1 的例外);③ 職級(系統管理員 / 主管 / 高級工程師 / 一般工程師)× 部門(網管 / 系統 / 程式開發 / 資安)按鈕權限;④ BFF 讀取以服務帳號串接,寫入待 BFF 管理 API;⑤ 儀表板先以模擬資料呈現 |

---

## 2. 產品概述

| 模組 | 一句話定位 | 主要能力 |
| --- | --- | --- |
| **登入與 Session** | IT 人員自己的帳號 | 工號 + 密碼、httpOnly Session、CSRF、鎖定、變更密碼 |
| **權限框架** | 誰能看什麼、按什麼 | 職級 × 權限、部門限制、兩層選單過濾、資料範圍 |
| **系統管理** | 管理 IT 團隊 | 人員、部門、角色與按鈕權限、稽核紀錄 |
| **Gateway 管理** | BFF 的眼睛與手 | 上游、路由、發佈版本、BFF 角色權限矩陣 / 反查 / 關係圖 |
| **儀表板** | 一眼掌握 | KPI 卡片、流量、告警、工單、Gateway 概況、團隊工作 |

## 3. 背景與問題

1. Gateway BFF 的路由、權限只能從資料庫或 CLI 查看;「誰可以呼叫這支 API?」「這個角色有哪些權限?」需要工程師下 SQL。
2. 原本的 `/it/` 是新人上手 demo,沒有權限分級,任何有 `gw.admin.*` 的人看到的都一樣。
3. IT 部門內有不同職級與課別(網管、系統、程式開發、資安),需要「同職級不同課別能做的事不同」(例:發佈只給開發課與系統課)。
4. 需求方要求 IT 管理系統**獨立登入**,不依賴入口網單一入口(入口網或 AD 異常時仍能登入處理)。

## 4. 目標與成功指標

| # | 目標 | 成功指標(驗收) |
| --- | --- | --- |
| G1 | IT 人員以獨立帳號登入 | `auth/*.feature` 全部通過;入口網 Session 與本系統互不影響(`gateway/nginx-entry.feature`) |
| G2 | 按鈕權限由設定決定,不改程式 | 調整職級權限 / 部門限制後**不需重新登入即生效**(`rbac/permission-settings.feature`) |
| G3 | 後端一定再檢查 | 所有寫入 API 在無權限時回 403,不依賴前端隱藏(`rbac/effective-permission.feature`) |
| G4 | BFF 可視化 | 上游、路由、發佈版本、角色 × 權限、權限反查、關係圖皆可從畫面取得(`bff/bff-read.feature`) |
| G5 | 不假裝成功 | BFF 尚無寫入 API 時明確回 `ITAPP_BFF_NOT_SUPPORTED`(`bff/bff-write.feature`) |
| G6 | 一致的 UI | 所有頁面只用全域 UI 元件;明亮 / 黑暗皆正確、375px 無整頁水平捲動(`ui/navigation.feature`) |

## 5. 使用者角色

### 5.1 職級(`level`)

| 職級 | rank | 典型工作 | 預設能力 |
| --- | --- | --- | --- |
| 系統管理員 `admin` | 99 | IT 管理系統維運 | 固定擁有全部權限,不可調整(避免鎖死);看得到所有部門 |
| 主管 `manager` | 30 | 課長 / 經理 | 人員管理、核可發佈、BFF 權限設定、稽核 |
| 高級工程師 `senior` | 20 | 資深工程師 | 發佈、上游維護、檢視權限設定 |
| 一般工程師 `engineer` | 10 | 工程師 | 檢視為主 |

### 5.2 部門(`department`,可在系統內新增)

| 代碼 | 名稱 | 職掌 |
| --- | --- | --- |
| `NET` | 網管課 | 網路、防火牆、Wi-Fi、VPN |
| `SYS` | 系統課 | 伺服器、虛擬化、AD、Gateway 維運 |
| `DEV` | 程式開發課 | MES、HRM、入口網與內部系統開發 |
| `SEC` | 資安課 | 弱點掃描、端點防護、稽核 |

> 上表為 v0.1 的**虛構**部門(示範帳號用);測試區 / 正式區新資料檔的部門主管為未指定。實際組織見 §5.2.1。

#### 5.2.1 改綁 Gateway 部門(v0.1.6 建議,待確認)

依 v0.1.4 決策(改用 Gateway 單一入口、權限以 BFF 為唯一來源),部門**不在本系統維護**,改綁 Gateway:

| 項目 | 現況(Gateway 已實作) | 本系統的做法 |
| --- | --- | --- |
| 部門資料 | `gw.department`:worker 每小時自 BPM 同步部門樹(例:`S1800` 資訊服務部 → `S1810` 網路通訊課、`S1820` 資訊應用課) | 不複製;需要顯示時呼叫 BFF `GET /api/admin/departments`(**不可直連 BFF 資料庫**,AGENT.md §6) |
| 誰能進 `/it/` | `gw.role_rule` 依 `dept_code` + `include_sub_depts` 自動指派角色 | 在 Gateway 建 IT 管理系統角色(含 `it.app.access` 與功能權限),規則 `dept_code = S1800`、含下層部門 |
| 課別差異(取代「部門限制」) | 同一角色可有多條規則;不同角色各自規則 | 對 `S1810`、`S1820` 各加規則對應不同角色(例:發佈權限只給特定課) |
| 人員異動 | 到職 / 調動由 BPM 同步,一小時內生效 | 不再手動建帳號、指定部門 |

不採用的做法:在本系統「部門」頁手動新增 `S1810` / `S1820`(兩份資料,且此頁在改用單一入口後移除);本系統直連 `gw.department`(違反 AGENT.md §6)。改用單一入口前,現有 4 個虛構部門維持不動。待確認事項見 Q9–Q11。

### 5.3 使用者故事(總覽)

- **作為資安課高級工程師**,我能查看所有路由與權限,但看不到「發佈草稿」按鈕,因為發佈只開放給開發課與系統課。
- **作為網管課課長**,我只看得到網管課的同仁,可以替新人建帳號、重設密碼,但不能動其他課的人,也不能把人升成主管。
- **作為系統課主管**,有人問「誰能匯入 API?」,我在「權限反查」選 `gw.admin.route.import`,立刻看到哪些角色、AD 群組擁有它,以及受保護的 API。
- **作為系統管理員**,主管希望一般工程師也能看稽核紀錄,我在「職級權限」打開開關、儲存,對方重新整理就看得到選單。
- **作為任何 IT 人員**,我登入後在儀表板一眼看到今天的流量、告警、待處理工單與 Gateway 路由狀態。
- **作為習慣收合側欄的使用者**,我把滑鼠移到群組圖示上就能直接選到頁面,不必先展開側欄。
- **作為 IT 主管**,路由與人員增加到上千筆時,清單仍然只載入目前這一頁,打開頁面一樣快。

---

## 6. 功能需求

需求編號 `FR-模組.序號`;「驗收」欄為對應的 feature 檔與場景。

### 6.1 登入與 Session

> **作為** IT 人員,**我要**用 IT 管理系統自己的帳號登入,**以便**不依賴入口網單一入口也能管理 Gateway。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-1.1 | 以工號(不分大小寫)+ 密碼登入;帳號與入口網(AD / 本機帳號)完全分開 | `auth/login.feature`:正確工號與密碼登入成功、工號不分大小寫 |
| FR-1.2 | 密碼以 scrypt 雜湊保存;帳號不存在也做一次雜湊比對,避免以回應時間猜帳號 | 程式審查(`backend/src/auth/`) |
| FR-1.3 | 同一工號連續失敗 **5 次鎖定 15 分鐘**(423 `ITAPP_ACCOUNT_LOCKED`) | `auth/login.feature`:連續 5 次密碼錯誤後鎖定 |
| FR-1.4 | 停用帳號不可登入(403 `ITAPP_ACCOUNT_DISABLED`) | `auth/login.feature`:停用帳號不可登入 |
| FR-1.5 | Session 為 JWT(HS256),放在 `it_at` Cookie(httpOnly、SameSite=Strict、Path=`/it/api`、test / prod 加 Secure),有效 **8 小時**,剩餘不到一半時自動換發 | `auth/session.feature` |
| FR-1.6 | CSRF:非 GET 請求須帶 `X-CSRF-Token` = `it_csrf` Cookie | `auth/session.feature`:非 GET 請求未帶 CSRF 標頭 |
| FR-1.7 | JWT 只含 userId、tokenVersion、jti;**權限每次請求重新計算**,調整立即生效 | `rbac/permission-settings.feature`:調整職級權限後立即生效 |
| FR-1.8 | 登出拒絕該 jti;停用、重設密碼、變更密碼遞增 tokenVersion,讓既有 Session 失效 | `auth/session.feature` |
| FR-1.9 | 變更自己的密碼:需目前密碼;新密碼至少 8 碼且含英文字母與數字;成功後目前頁面維持登入 | `auth/session.feature`:密碼政策、變更密碼後其他 Session 失效 |
| FR-1.10 | 所有登入成功 / 失敗、登出寫入登入紀錄(含來源 IP) | `auth/login.feature`:登入成功與失敗都寫入登入紀錄 |
| FR-1.11 | Session 失效時回登入頁並保留原頁面;dev 建置顯示示範帳號 | `auth/session.feature`、`auth/login.feature` |

### 6.2 權限框架

> **作為** IT 主管,**我要**以「職級 × 權限」加上「部門限制」決定每個人的選單與按鈕,**以便**同職級不同課別能做的事不同。

**有效權限 = 職級權限 ∩ 部門限制**(admin 固定全部)。權限代碼 `{module}.{resource}.{action}`,`page` 控制選單 / 頁面,`button` 控制按鈕與對應寫入 API。

| 權限代碼 | 名稱 | 類型 | 預設職級 | 預設部門限制 |
| --- | --- | --- | --- | --- |
| `dashboard.view` | 檢視儀表板 | page | 主管、高級、一般 | — |
| `bff.route.read` | 檢視服務與路由 | page | 主管、高級、一般 | — |
| `bff.route.export` | 匯出路由清單 | button | 主管、高級 | — |
| `bff.route.publish` | 發佈 / 回滾 | button | 主管、高級 | DEV、SYS |
| `bff.upstream.edit` | 編輯上游服務 | button | 高級 | NET、SYS |
| `bff.rbac.read` | 檢視 BFF 權限 | page | 主管、高級、一般 | — |
| `bff.rbac.edit` | 設定 BFF 角色權限 | button | 主管 | SYS、SEC |
| `endpoint.device.read` | 檢視電腦清單(只控制顯示;資料另需 Gateway 同名權限) | page | 主管、高級、一般 | — |
| `sys.user.read` | 檢視人員 | page | 主管、高級、一般 | — |
| `sys.user.create` / `edit` / `disable` / `reset-password` | 人員寫入 | button | 主管 | — |
| `sys.dept.read` | 檢視部門 | page | 主管、高級、一般 | — |
| `sys.dept.edit` | 編輯部門 | button | (僅 admin) | — |
| `sys.perm.read` | 檢視角色與按鈕權限 | page | 主管、高級 | — |
| `sys.perm.edit` | 設定角色與按鈕權限 | button | (僅 admin) | — |
| `sys.audit.read` | 檢視稽核紀錄 | page | 主管 | — |

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-2.1 | 有效權限依上式計算;`/auth/me` 回傳 permissions、兩層 menus(只含有權限的項目,不回傳空群組)、dataScope | `rbac/effective-permission.feature` |
| FR-2.2 | 每支寫入 API 宣告按鈕權限,後端檢查;無權限 403 `ITAPP_PERMISSION_DENIED`,`details.permission` 指出所需權限 | `rbac/effective-permission.feature`:一般工程師不能新增人員 |
| FR-2.3 | 「職級權限」頁:矩陣開關,儲存列顯示各職級增減,確認後儲存;admin 欄鎖定;無 `sys.perm.edit` 時唯讀 | `rbac/permission-settings.feature` |
| FR-2.4 | 「部門限制」頁:點部門標籤切換,立即儲存;空白 = 不限部門 | `rbac/permission-settings.feature`:設定部門限制後立即生效 |
| FR-2.5 | 「權限試算」頁:選職級 + 部門,顯示有效權限、被部門擋下的權限與選單預覽(後端計算,與實際登入一致) | `rbac/permission-settings.feature`:同職級不同部門的試算結果 |
| FR-2.6 | 前端:`v-can` 隱藏按鈕、路由 `meta.permission` 導向 403、Tab 依權限顯示(僅體驗,不取代 FR-2.2) | `ui/navigation.feature` |

### 6.3 系統管理

> **作為**課主管,**我要**管理自己部門的帳號,**以便**新人到職、離職時不必找系統管理員。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-3.0 | 人員清單由後端篩選(關鍵字、部門、職級)與分頁,每頁 10 筆 | `system/users.feature`:人員清單由後端篩選與分頁 |
| FR-3.1 | 資料範圍:非 admin 只看得到自己部門;只能管理**同部門且職級較低**者,也不能指派同級以上職級(403 `ITAPP_DATA_ACCESS_DENIED`) | `system/users.feature`:資料範圍、只能管理同部門且職級較低者 |
| FR-3.2 | 新增人員:工號 3–20 碼英數(不分大小寫不可重複,409),回傳一次性 12 碼臨時密碼,畫面只顯示一次 | `system/users.feature`:新增人員回傳一次性臨時密碼、工號重複 |
| FR-3.3 | 停用 / 啟用(停用立即登出、不能停用自己)、重設密碼(臨時密碼、舊 Session 失效),皆需確認 | `system/users.feature` |
| FR-3.4 | 部門:卡片顯示主管、成員數、職級分布;新增(代碼大寫英數 2–10 碼、不可重複)、修改名稱 / 說明 / 主管(主管工號須存在) | `system/departments.feature` |
| FR-3.5 | 稽核:所有寫入操作記錄 actor / action / target / detail / IP / 結果;分「操作紀錄」「登入紀錄」,可搜尋、分頁(每頁上限 100),保留最近 2000 筆 | `system/audit.feature` |

### 6.4 Gateway BFF 視覺化與設定

> **作為** IT 工程師,**我要**在畫面上看到 BFF 的上游、路由與權限關係,**以便**不用下 SQL 就能回答「誰可以呼叫這支 API」。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-4.1 | 資料來源:`BFF_MODE=mock`(本機 Gateway 快照,離線開發)或 `live`(itapp-api 以 BFF 服務帳號登入,讀取既有管理 API);回應與畫面標示來源 | `bff/bff-read.feature`:回應與畫面標示資料來源 |
| FR-4.2 | 讀取快取 30 秒,「重新整理」強制重取;BFF 無法連線時回 502 `ITAPP_BFF_UNAVAILABLE`,其他功能不受影響 | `bff/bff-read.feature` |
| FR-4.3 | 服務與路由:上游卡片、限流政策、路由清單(**後端**搜尋〔含開發專案〕、系統 / 上游 / 驗證模式篩選與分頁,篩選選項由回應 facets 提供;「開發專案」欄;明細、請求路徑圖、Gherkin 行為規格)、匯出 CSV(`bff.route.export`,按下時才逐頁取回全部符合資料)、發佈歷程(每次 10 筆,「載入更多」;版本、差異、回滾來源) | `bff/bff-read.feature`:服務與路由、路由清單由後端篩選與分頁、路由顯示開發專案與行為規格、發佈版本分頁 |
| FR-4.4 | BFF 權限:角色 × 權限矩陣(依系統篩選、滑鼠十字高亮)、權限反查(角色、AD 群組、公司、個別指派、受保護 API)、關係圖(角色 → 權限 → API,高亮上下游) | `bff/bff-read.feature`:BFF 權限 |
| FR-4.5 | 設定:角色權限編輯(`bff.rbac.edit`)、發佈草稿(`bff.route.publish`);mock 寫入本系統資料檔 / 模擬版本,**live 在 BFF 提供管理 API 前回 501 `ITAPP_BFF_NOT_SUPPORTED`** | `bff/bff-write.feature` |
| FR-4.6 | 上游編輯(`bff.upstream.edit`)目前只提示「尚未開放」 | `bff/bff-write.feature`:上游編輯尚未開放 |

### 6.5 首頁儀表板

> **作為** IT 人員,**我要**登入就看到今天的重點數字,**以便**快速判斷是否有異常。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-5.1 | 營運總覽:問候卡、5 張 KPI 卡(API 呼叫、可用率、平均回應、待處理工單、資安告警;含較昨日與 14 日趨勢)、24 小時流量圖、告警、近期工單、最近操作 | `dashboard/dashboard.feature`:營運總覽 |
| FR-5.2 | Gateway 概況:上游 / 路由 / 已發佈 / 草稿 / 權限 / 角色數(可點擊)、路由依系統、驗證模式、線上版本、上游 p95 | `dashboard/dashboard.feature`:Gateway 概況與團隊工作 |
| FR-5.3 | 團隊工作:各部門成員數、處理中 / 結案數、結案率 | 同上 |
| FR-5.0 | 儀表板依區塊拆成 `/dashboard/overview`、`/work`、`/gateway`、`/team`,依 Tab 與捲動位置按需載入;只有 Gateway 區塊讀 BFF,BFF 無法連線不影響其他區塊 | `dashboard/dashboard.feature`:依 Tab 與捲動位置載入 |
| FR-5.4 | 模擬資料已清空,前端保留卡片並標示「開發中」 | `dashboard/dashboard.feature`:模擬資料清空並標示開發中 |
| FR-5.5 | 最近操作:有 `sys.audit.read` 看全部,否則只看自己的 | `dashboard/dashboard.feature`:最近操作的可見範圍 |

### 6.6 網頁框架與 UI

> **作為**使用者,**我要**每一頁的操作方式、外觀都一致,並可切換明亮 / 黑暗。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-6.1 | 選單兩層(群組 → 功能),功能頁內以 Tab 切換第三層,Tab 對應網址;麵包屑顯示「群組 / 功能 / Tab」;**側欄收合時,滑鼠移上(或鍵盤聚焦、點擊)群組圖示即在右側浮出該群組的功能清單可直接選取**,收合狀態記住 | `ui/navigation.feature`:選單結構、收合選單 |
| FR-6.2 | UI 全域套用:按鈕、卡片、表格、表單、對話框、Tab、提示、圖表皆為全域元件,頁面不各自刻樣式(規範見 [UI-GUIDE.md](UI-GUIDE.md)) | 程式審查 |
| FR-6.3 | 風格:玻璃擬態(半透明毛玻璃、細緻線性邊框、漸層光暈);明亮 / 黑暗兩套 token,記住使用者選擇 | `ui/navigation.feature`:明亮 / 黑暗切換 |
| FR-6.4 | 響應式:≤ 960px 選單改抽屜;375px 無整頁水平捲動 | `ui/navigation.feature`:手機寬度 |
| FR-6.5 | 錯誤訊息顯示後端 `message` 與 `requestId` 前 12 碼 | 程式審查(`describeError`) |
| FR-6.7 | **懶加載**:頁面程式碼依路由分割(進頁才下載);Tab 切換才載入該 Tab 資料;清單一律後端分頁;首屏以外區塊捲動到才載入;對話框選項打開時才查詢。目的:資料量成長時不因一次取回全部而變慢 | `dashboard/dashboard.feature`、`bff/bff-read.feature`、`system/users.feature`(分頁場景)、[UI-GUIDE.md](UI-GUIDE.md) §4 |

### 6.7 Gateway 整合與部署

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-7.1 | 前端發佈到 `gw_www` 的 `it-admin`(Nginx `/it/`),symlink 原子切換,可回滾 | `gateway/nginx-entry.feature` |
| FR-7.2 | Nginx `/it/api/` 直接轉給 `itapp-api`(`ITAPP_API_UPSTREAM`,變數上游:未部署時 Nginx 仍可啟動、請求回 502);`/it/api/auth/login` 套用 `gw_auth` 登入限流 | `gateway/nginx-entry.feature` |
| FR-7.3 | 機密(JWT 金鑰、種子密碼、BFF 服務帳號密碼)以 Docker secret `*_FILE` 提供,prod 只接受 `_FILE` | 程式審查(`config.ts`) |

### 6.8 端點管理(經 Gateway BFF)

> **作為** IT 人員,**我要**在 IT 管理系統查看使用者電腦上 Agent 的連線狀況,**以便**知道哪些電腦在線、用的是哪張裝置憑證。

端點資料由 Go Endpoint Server 提供,經 Gateway BFF 轉送;**能否取得、能否下指令以 BFF 權限為準**,身分是使用者的 Gateway 登入。本系統的 `endpoint.device.read` 只決定選單與頁面是否顯示,`itapp-api` 不轉送端點 API(Gateway PRD Q27、`ENDPOINT-AGENT-GUIDE.md` §8)。

| 編號 | 需求 | 驗收 |
| --- | --- | --- |
| FR-8.1 | 選單「端點管理 → 電腦清單」(`/endpoint/devices`),依本系統的 `endpoint.device.read` 顯示 | `endpoint/devices.feature`:預設職級看得到選單 |
| FR-8.2 | 進頁呼叫 Gateway `GET /api/auth/me`:未登入 → 引導登入 Gateway(`/login?redirect=`);Gateway 工號與本系統登入者不同 → 提示重新登入,不取資料;Gateway 沒有 `endpoint.device.read` → 提示權限不足 | 同上(`@manual @e2e`) |
| FR-8.3 | 電腦清單經 `GET /api/endpoint/devices` 取得:電腦名稱、在線 / 離線、憑證 DN、指紋、最後回報、首次連線;頁首顯示目前的 Gateway 身分;BFF 回 404 / 5xx 時分別提示「Gateway 尚未提供端點 API」「Endpoint Server 無法連線」 | 同上(`@manual @e2e`) |
| FR-8.4 | Gateway 呼叫集中在 `src/api/gateway.ts`,目前只有唯讀 GET;加入下指令等寫入功能時改用 `@giganexus/web-kit`(CSRF、Token 自動更新) | 程式審查 |
| FR-8.5 | 對電腦下指令、查詢指令結果(ENDPOINT-AGENT-GUIDE §8.3–§8.4) | `@wip`,待 Go Endpoint Server(W6) |

---

## 7. 錯誤代碼總表

格式 `{ code, message, requestId, details? }`;代碼一律 `ITAPP_` 開頭,新增前先更新本表與 `backend/src/errors.ts`。

| HTTP | code | 意義 | 前端處理 |
| --- | --- | --- | --- |
| 400 | `ITAPP_VALIDATION_FAILED` | 參數驗證失敗 / 業務檢查不通過(`details` 列出欄位或不存在的代碼) | 顯示 message |
| 401 | `ITAPP_UNAUTHENTICATED` | 未登入或 Session 失效 | 回登入頁並保留原頁面 |
| 401 | `ITAPP_LOGIN_FAILED` | 帳號或密碼錯誤 | 登入頁顯示 |
| 403 | `ITAPP_PERMISSION_DENIED` | 缺少按鈕 / 頁面權限(`details.permission`) | 顯示 message 或 403 頁 |
| 403 | `ITAPP_DATA_ACCESS_DENIED` | 超出資料範圍(他部門、同級以上) | 顯示 message |
| 403 | `ITAPP_CSRF_INVALID` | CSRF 驗證失敗 | 提示重新整理 |
| 403 | `ITAPP_ACCOUNT_DISABLED` | 帳號已停用 | 登入頁顯示 |
| 404 | `ITAPP_NOT_FOUND` | 資料或 API 不存在 | 顯示 message |
| 409 | `ITAPP_CONFLICT` | 工號 / 部門代碼已存在 | 顯示 message |
| 423 | `ITAPP_ACCOUNT_LOCKED` | 連續失敗鎖定 | 登入頁顯示 |
| 500 | `ITAPP_INTERNAL_ERROR` | 非預期錯誤 | 顯示 message + requestId |
| 501 | `ITAPP_BFF_NOT_SUPPORTED` | BFF 尚未提供此管理 API | 警告提示「尚未開放」 |
| 502 | `ITAPP_BFF_UNAVAILABLE` | BFF 無法連線或回應錯誤(`details.bffStatus`、`bffCode`、`bffRequestId`) | 顯示錯誤卡片 + 重試 |
| 429 / 502 | `RATE_LIMITED` / `UPSTREAM_ERROR` | Gateway Nginx 產生(登入限流、itapp-api 未啟動) | 顯示 message |

## 8. 非功能需求

| 類別 | 需求 |
| --- | --- |
| 安全 | 前端不接觸 Token;Cookie httpOnly + SameSite=Strict;CSRF;登入限流(Nginx)+ 帳號鎖定(itapp-api);日誌遮蔽 Cookie / CSRF;回應 `Cache-Control: no-store`;不回傳堆疊與密碼雜湊;安全標頭由 Nginx 統一加上(CSP 不允許外部資源,因此字型、圖示皆打包) |
| 效能 | BFF 讀取快取 30 秒;頁面依路由延遲載入,主程式 gzip 約 64 KB;清單後端分頁(每頁 10–12 筆);儀表板依區塊按需載入(FR-6.7) |
| 可用性 | BFF 無法連線時只有 Gateway 相關區塊失敗;itapp-api 未部署時 Nginx 仍可啟動 |
| 可維運 | `/healthz`、`/readyz`;JSON 日誌沿用 Nginx `X-Request-Id` |
| 相容性 | 最新版 Chrome / Edge;寬度 375px 以上 |
| 無障礙 | 可鍵盤操作、`:focus-visible` 外框、圖示按鈕有 `aria-label`、尊重 `prefers-reduced-motion` |
| 語系 | 繁體中文 |

## 9. 範圍與里程碑

| 版本 | 範圍 | 狀態 |
| --- | --- | --- |
| **v0.1** | 登入、全域 UI 與網頁框架、權限框架、人員 / 部門 / 稽核、BFF 讀取與視覺化、BFF 寫入(mock)、儀表板(部分模擬) | 完成(2026-09-25) |
| v0.2 | 資料改存資料庫(多實例)、BFF 寫入改接 BFF 管理 API(依 Gateway P2-3)、上游編輯、鎖定到期測試、部門停用 | 規劃中 |
| v0.3 | 儀表板改接真實監控與工單來源、稽核匯出與保存政策 | 規劃中 |

`@wip` 場景即為尚未實作的需求。

## 10. 假設、風險與待決事項

### 10.1 風險

| 風險 | 影響 | 因應 |
| --- | --- | --- |
| live 模式依賴 BFF 的 demo 端點(`/api/admin/demo/*`、`/api/admin/db/*`,僅 dev / test 註冊) | 正式區無法切 live | 等 BFF 正式管理 API(P2-3),`LiveBffSource` 改接;介面不變 |
| 服務帳號以一般登入取得 BFF Session | 帳號被停用或權限變更時讀取失敗 | 使用專用本機帳號,失敗時回 502 並記錄 BFF requestId |
| JSON 檔儲存、登出黑名單在記憶體 | 只能單一實例;重啟後已登出的 Token 在到期前可能再被使用 | v0.2 改資料庫 / Redis |
| 獨立登入與 Gateway 單一入口原則不同 | 帳號需另外維護 | 由各課主管自行管理部屬帳號(FR-3.x) |

### 10.2 待決事項

| # | 問題 | 建議 | 狀態 |
| --- | --- | --- | --- |
| Q1 | v0.2 資料庫:沿用 Gateway 的 SQL Server 2012(獨立 schema)或其他? | SQL Server 2012 獨立資料庫,沿用 Drizzle 與 2012 相容規則 | 待決 |
| Q2 | BFF 寫入:等 BFF P2-3,或先由 BFF 提供最小的角色權限 / 發佈 API? | 先開 `PUT /api/admin/roles/:id/permissions`、`POST /api/admin/releases` | 待決;角色權限、指派規則、權限試算已寫入 Gateway 規格 v0.7(§8.7,工作項目 P2-3a) |
| Q3 | 正式區 BFF 服務帳號的建立與權限範圍 | IT 以 CLI 代建本機帳號,只給 `gw.admin.route.read`、`gw.admin.rbac.read`(寫入開放後再加) | 過渡用;改單一入口後以使用者身分呼叫管理 API,**不再需要服務帳號** |
| Q4 | 是否需要讓 IT 人員也能用 AD 登入(保留獨立帳號為備援)? | v0.1 依需求只做獨立帳號 | **已決定(2026-09-26)**:改用 Gateway 單一入口(AD / 本機帳號),自有帳號退場;緊急管理帳號用 Gateway 本機帳號 + 個別指派 `gw-it-admin`(`../giga-Portal/docs/PRD.md` Q7) |
| Q5 | `sys.dept.edit`、`sys.perm.edit` 預設只有系統管理員;是否開放給 IT 經理? | 維持,由系統管理員依需要在「職級權限」開放 | 待決 |
| Q6 | 儀表板真實資料來源(監控、工單系統) | Nginx JSON 日誌 / Prometheus;工單待確認系統 | 待決 |
| Q7 | 稽核保存期限 | 至少 1 年,改資料庫後實作 | 待決 |
| Q8 | 何時改用 `@giganexus/web-kit` 呼叫 Gateway(目前 web-kit 只在 Gateway repo 內,尚未發佈) | 加入端點寫入功能(FR-8.5)前:複製一份到本 repo 或等公司 Package Registry | 待決 |
| Q9 | 虛構的 4 課(網管 / 系統 / 程式開發 / 資安)如何對應實際組織(只有 `S1810` 網路通訊課、`S1820` 資訊應用課)?系統、資安工作歸屬哪個單位 | 決定 Gateway 角色規則怎麼切(§5.2.1) | 待決 |
| Q10 | 子公司 IT 人員的部門代碼不同時,是否也能進 IT 管理系統 | 需要的話每家公司各加一條角色規則 | 待決 |
| Q11 | 何時實作 v0.1.4 改用單一入口(含 §5.2.1 部門綁定) | 先出實作計畫再排入甘特圖 | 待決 |
