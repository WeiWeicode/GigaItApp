# 新增功能紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-26 決策:改用 Gateway 單一入口;新增兄弟專案 giga-Portal(只改文件)
- 內容:需求方新建員工入口網 `../giga-Portal`,並決定本系統**改用 Gateway 單一入口**、權限以 BFF 為唯一來源、由本系統提供各應用的權限設定畫面、新增應用切換與路由守衛(無 `it.app.access` 導回 `/`)。本次只記錄決策:AGENT.md §0 登入、工作區、權限設定列與 §10 參考文件;PRD v0.1.4 修訂紀錄、Q2 / Q3 / Q4 狀態。實作項目見 `../giga-Portal/docs/PRD.md` §9.2(I1–I5)、Gateway PRD v0.7。
- 檔案:`AGENT.md`、`docs/PRD.md`
- 驗證:文件;程式未修改

## 2026-09-26 API 路由:開發專案欄與 Gherkin 行為規格
- 內容:API 路由頁新增「開發專案」欄(下游 repo 資料夾名稱),明細對話框顯示開發專案與 **Gherkin 行為規格**(關鍵字、標籤、註解醒目標示,純文字渲染)。BFF 原本沒有專案欄位,經需求方同意由 Gateway 新增 `gw.upstream.project`(OpenAPI `x-gateway.project`)並由路由查詢回傳(Gateway 端修改見 `../giga-api-gateway-bff/docs/DevelopmentProcess/NewFeatures.md` 同日紀錄,commit 302358b)。`gherkin` 原本 BFF 已回傳、`live.ts` 將其丟棄,改為保留;舊版 BFF 沒有 `project` 時補 `null`,mock / live 形狀一致。聚合 / mock 路由顯示「Gateway」,未登記的 proxy 路由顯示「未登記」。關鍵字搜尋比對開發專案,匯出 CSV 加入 `project` 欄。`mock-data.json` 的路由以本機 Gateway 快照補上 `project`、`gherkin`。新增圖示 `repo`、`spec`。PRD v0.1.3(FR-4.3)、API.md、Gherkin `bff/bff-read.feature`(新增「路由顯示開發專案與行為規格」)、專案地圖同步更新。
- 檔案:`backend/src/bff/types.ts`、`backend/src/bff/live.ts`、`backend/src/bff/mock-data.json`、`backend/src/routes/bff.ts`、`backend/test/scenarios.test.ts`、`frontend/src/api/types.ts`、`frontend/src/pages/gateway/Routes.vue`、`frontend/src/components/GherkinView.vue`、`frontend/src/ui/components/GIcon.vue`、`docs/PRD.md`、`docs/API.md`、`docs/Gherkin/bff/bff-read.feature`、`docs/PROJECT-MAP.md`
- 驗證:`backend/` `npm test` 46 項通過(新增 1 項)、`typecheck` 通過;`frontend/` `typecheck` 通過。重建本機 `itapp-api`(`BFF_MODE=live`)後以 `dev:gw`(http://localhost:5178/it/)用種子帳號 itadmin 操作:清單 27 支路由顯示開發專案(`giga-api-gateway-bff`、`giga-endpoint`,DMS 6 支為「未登記」),搜尋 `giga-endpoint` 得 1 / 27,明細顯示 Gherkin(明暗主題皆確認),console 僅有登入前的 401。`mock-data.json` 仍為原本的 1 空格縮排(Prettier 檢查本來就不通過,未改格式)。**`/it/` 正式發佈(`spa-it`)未執行**

## 2026-09-26 專案地圖與核心設計原則
- 內容:新增 `docs/PROJECT-MAP.md`(目錄職責、前後端分層、主要流程、「要改什麼看哪裡」、測試地圖、與設計原則的已知差異:前端尚無自動化測試、資料為 JSON 檔)。AGENT.md 新增 §9.1:開發新功能後必須更新專案地圖;核心設計原則(職責分離、`src/`、集中測試)依 Gateway `AGENT.md` §10.7.2 的 TypeScript / Vue 列落實;§0 目錄、§10 參考文件、§11 修正紀錄加上地圖路徑。
- 檔案:`AGENT.md`、`docs/PROJECT-MAP.md`
- 驗證:文件;地圖目錄與 `git ls-files` 對照

## 2026-09-25 端點管理:電腦清單(經 Gateway BFF);多專案工作區
- 內容:依 Gateway PRD Q27(端點管理以 BFF 為準),新增選單「端點管理 → 電腦清單」與權限 `endpoint.device.read`(只控制顯示,預設主管 / 高級 / 一般工程師;共 18 項)。前端 `src/api/gateway.ts` 以使用者的 Gateway 登入呼叫 `/api/auth/me` 與 `/api/endpoint/devices`(唯讀 GET,暫不接 web-kit,PRD Q8);頁面處理未登入 Gateway、工號與本系統登入者不同、Gateway 無權限、BFF 404 / 5xx。`itapp-api` 不轉送端點 API。AGENT.md 加入端點管理規則與多專案工作區(同層目錄、`../giga-api-gateway-bff/` 相對路徑、用 BFF 路由表找 API,Gateway `AGENT.md` §10),修正查詢路由表的指令;PRD v0.1.2 §6.8、ARCHITECTURE D12、Gherkin `endpoint/devices.feature`。
- 檔案:`backend/src/rbac/catalog.ts`、`backend/test/scenarios.test.ts`、`frontend/src/api/gateway.ts`、`frontend/src/pages/endpoint/Devices.vue`、`frontend/src/router.ts`、`frontend/src/ui/components/GIcon.vue`(`monitor`)、`frontend/vite.config.ts`(`/api` proxy 到本機 Gateway)、`AGENT.md`、`README.md`、`docs/`
- 驗證:`npm test` 45 項通過(新增「預設職級看得到電腦清單選單」);前端 `vue-tsc`、`vite build` 通過。Gateway 端以 E2E 驗證 `/api/endpoint/devices`(S100001 可取得經 :9443 連線的 PC-001,S112009 403)。**瀏覽器操作尚未完成**:需要使用者自行登入 IT 管理系統與 Gateway(不代為輸入密碼)。既有資料檔不會自動加入新權限,本機已補上;其他環境需在「職級權限」頁勾選

## 2026-09-25 懶加載:清單後端分頁、儀表板依區塊按需載入
- 內容:檢查後確認頁面程式碼原本已依路由延遲載入(19 個 `import()`),但**資料**是一次取回:路由、人員、發佈版本整份下載後在前端分頁,儀表板一次呼叫就算完三個 Tab(含 BFF)的資料。改為:① `/bff/routes`、`/users` 後端篩選 + 分頁(`routes/paging.ts`),路由清單回傳 facets 供下拉選項;`/bff/releases` 分頁(live 直接向 BFF 取該頁),前端「載入更多」;② 儀表板拆成 `/dashboard/overview|work|gateway|team`,Tab 切換才載入,「近期工單 / 最近操作」以新全域元件 `GLazy` 捲動到才載入,BFF 無法連線只影響 gateway 區塊;③ 新增 `usePaged`(分頁、300 ms 防抖、丟棄過期回應);權限反查只查該權限的路由、關係圖只查需權限路由(超過 500 支提示)、部門主管候選人在打開對話框時才查、匯出 CSV 按下才逐頁取回;④ `GTable` 在 server 分頁時忽略前端排序(只排一頁會誤導)。舊的 `GET /dashboard` 已移除。
- 檔案:`backend/src/routes/{paging,bff,users,dashboard}.ts`、`backend/src/bff/*`、`frontend/src/composables/usePaged.ts`、`frontend/src/ui/components/{GLazy,GTable}.vue`、`frontend/src/pages/**`、`docs/`
- 驗證:`npm test` 44 項通過(新增路由分頁 / 篩選 / facets、發佈版本分頁、人員分頁;BFF 無法連線時 gateway 502、其他三區塊 200);前端 `vue-tsc`、`vite build` 通過;`deploy/e2e-smoke.sh` 通過,經 Gateway 以 live BFF 驗證 releases page 2 回 v28–v24、routes `system=dms` 6 筆。瀏覽器(以 Performance API 檢查實際請求):儀表板進頁只有 `/dashboard/overview`,捲動到底才出現 `/dashboard/work`;Gateway 概況 Tab 只打 `/dashboard/gateway`;API 路由第一次 `page=1&pageSize=12`、輸入關鍵字後只送一次 `q=work-orders`(3 筆);發佈歷程 10 → 載入更多 → 20;人員 `page=1&pageSize=10`;權限反查 `permission=mes.workorder.read&pageSize=100`;關係圖 `authMode=permission&pageSize=500`。注意:瀏覽器面板隱藏時 IntersectionObserver 不會觸發(第一次測試誤判未載入),面板顯示後確認正常

## 2026-09-25 BDD PRD、技術文件與 Gherkin 驗收場景
- 內容:新增 `docs/PRD.md`(BDD:使用者故事、需求編號 FR-x.y 對應 Gherkin 場景、權限表、錯誤代碼總表、非功能需求、里程碑、風險與待決事項 Q1–Q7)、`docs/ARCHITECTURE.md`(設計決策 D1–D10、請求流程、權限 / 資料模型、BFF 串接、技術棧、部署、安全清單)、`docs/API.md`、`docs/UI-GUIDE.md`、`docs/Gherkin/`(12 個 feature,標籤 `@auto` / `@manual` / `@e2e` / `@wip`)。為讓 `@auto` 場景可驗證,新增 `backend/test/scenarios.test.ts`(26 項,以「feature 檔 / 場景」命名)與 `test/helpers.ts`;新增 `deploy/e2e-smoke.sh` 驗證 `@e2e` 場景。AGENT.md 加入「行為變更時同步 PRD → Gherkin → 測試」規則。程式行為未變更。
- 檔案:`docs/`、`backend/test/scenarios.test.ts`、`backend/test/helpers.ts`、`deploy/e2e-smoke.sh`、`AGENT.md`、`README.md`
- 驗證:`npm test` 41 項全部通過(原 15 + 新 26)、`npm run typecheck` 通過;`sh deploy/e2e-smoke.sh` 11 項通過,`STOP_API=1` 時 itapp-api 停止回 502 `UPSTREAM_ERROR` 通過(第一次執行時發現腳本本身的 shell 引號錯誤導致登入 body 被拆開、檢查誤判通過,已修正後重跑)

## 2026-09-25 IT 管理系統基本框架(取代 Gateway 範例 IT 頁面)
- 內容:建立 GigaItApp。後端 itapp-api(Fastify,port 51291):自有登入(工號 + 密碼、JWT Session Cookie、CSRF、5 次失敗鎖 15 分)、職級(系統管理員 / 主管 / 高級工程師 / 一般工程師)× 部門(網管 / 系統 / 程式開發 / 資安)按鈕權限、兩層選單、資料範圍(只能管理同部門且職級較低者)、稽核紀錄、BFF 串接(mock 快照 / live 服務帳號)。前端 Vue 3 + Vite:全域 UI 套件(G* 元件、圖表、玻璃擬態 tokens、明亮 / 黑暗)、兩層選單 + 頁內 Tab、儀表板(部分模擬資料)、BFF 服務 / 路由 / 發佈版本、BFF 角色權限矩陣 / 反查 / 關係圖、人員與部門、職級權限 / 部門限制 / 權限試算、稽核紀錄。部署:Nginx `/it/api/` 直接轉給 itapp-api,前端發佈到 `it-admin` 取代範例頁。
- 檔案:`backend/`、`frontend/`、`deploy/`、`AGENT.md`、`README.md`;Gateway:`nginx/conf.d/portal.conf`、`nginx/templates/00-env.conf.template`、`nginx/Dockerfile`、`deploy/docker-compose.yml`、`deploy/*.env.example`、`deploy/docker-compose.dev.yml`
- 驗證:後端 `npm test` 15 項通過、`typecheck`、`build` 通過;前端 `vue-tsc`、`vite build` 通過。live 模式對本機 BFF 讀取 overview / routes / releases / rbac / who-can-access 成功,寫入回 501 `ITAPP_BFF_NOT_SUPPORTED`。部署到本機 Gateway 後,經 Nginx `/it/api/healthz` 200、Cookie 為 Secure / HttpOnly、路徑 `/it/api`。瀏覽器(1440 / 375 寬,明亮 / 黑暗):登入 → 儀表板三個 Tab → 服務與路由 → BFF 權限矩陣 / 關係圖 → 人員 → 職級權限(itadmin 調整一般工程師權限 → 確認 → 儲存成功)→ 以一般工程師進入稽核紀錄被導向 403;經 Gateway 以資安課高級工程師登入,發佈版本頁無「發佈草稿」按鈕、資料來源顯示「BFF 即時」
