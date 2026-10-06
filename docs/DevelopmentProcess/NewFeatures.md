# 新增功能紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-10-06 電腦清單顯示 Agent 回報的基本資訊與詳情(RustIt 整合 M3)
- 內容:配合 RustIt INTEGRATION-PLAN M3(RustIt 8d83ab4:ItAgentBack 與 rustit-agent)。
  - `api/types.ts`:`EndpointDevice` 只新增欄位(`status`、`userName`、`domain`、`osName`、`osVersion`、`manufacturer`、`model`、`cpuName`、`memoryTotal`、`ips`、`agentVersion`、`lastInventoryAt`);新增 `EndpointInventory`、`EndpointDeviceDetail`。
  - 電腦清單欄位改為 名稱 / 狀態(停用另標示)/ 使用者 / IP / 作業系統 / CPU / 記憶體 / 最後回報,憑證 DN 改在滑過名稱與詳情顯示;點列以 GModal 開 `DeviceDetail.vue`(開啟時才呼叫 `GET /api/endpoint/devices/{deviceId}`):基本資訊、硬體、安全(防毒、最近更新、軟體筆數)、磁碟用量、網卡。既有的 403 / 404 / 5xx 提示不變。`format.ts` 新增 `fmtBytes`。
  - `vite.config.ts`:新增 `ENDPOINT_LOCAL`(只在 dev 且有設定時生效),`/api/endpoint/*` 轉本機 ItAgentBack 管理 API(`/v1/*`),並在本機畫面的 `/api/auth/me` 補上 `it.endpoint-device.read`、`.list` 與 `endpoint.device.read`;與 `OBSERVE_LOCAL` 共用同一個 `/api/auth/me` 改寫(`localPermsProxy`)。測試區權限不變,`gateway-rbac.yaml` 的 `includes` 於 M4 ItAgentBack 註冊 OpenAPI 後再補。
  - 文件:Gherkin `endpoint/device-inventory.feature`(`@manual`)、PRD FR-8.3(欄位與詳情;Endpoint Server 改為 RustIt ItAgentBack)。
- 已知差異:UI-GUIDE §7 要求清單用後端分頁(`usePaged`),目前端點 API 回傳全部裝置(`{ items }`,沿用既有頁面與 RustIt 計畫 §5 的格式);裝置數成長前改為後端分頁與篩選(RustIt 路線圖「資產」階段)。
- 檔案:`frontend/src/api/types.ts`、`frontend/src/api/format.ts`、`frontend/src/pages/endpoint/Devices.vue`、`frontend/src/pages/endpoint/DeviceDetail.vue`、`frontend/vite.config.ts`、`docs/Gherkin/endpoint/device-inventory.feature`、`docs/Gherkin/README.md`、`docs/PRD.md`
- 驗證:`npm run typecheck`(vue-tsc)、`npm run build` 通過。本機閉環(使用者自己的電腦):RustIt ItAgentBack(dev,51296)+ rustit-agent 連本機,`ENDPOINT_LOCAL=http://127.0.0.1:51296 npm run dev -- --port 5179`,使用者自行登入測試區 Gateway 後開 `/it/endpoint/devices`:清單顯示 1 台、在線 1 台(電腦名稱、使用者、IPv4 +2、Windows 10 Education、i5-11400、15.8 GB、剛剛),點列詳情顯示硬體、防毒(Trend Micro 啟用 / Windows Defender 未啟用)、C: / D: 用量、3 張網卡;`/api/endpoint/*` 請求皆 200。黑暗 / 明亮主題與 375px 寬度已檢視(卡片改上下排列)。

## 2026-10-06 架構觀測頁、儀表板接監控、itapp-api 接 giga-observe(Gateway W9-9 ~ W9-11、W9-3)
- 內容:
  - 「API Gateway 管理 › 架構觀測」:架構圖(分層、連線、15 秒更新、狀態篩選、服務詳情:概況 / 紀錄 / 錯誤 / 相依)、紀錄(Request ID 串接、載入更多、明細含步驟與錯誤堆疊)、錯誤聚合、流量與來源 IP(Nginx 流量、資安告警、IP 排行、前端效能 p75)。資料經 BFF `/api/observe/*`(`observe.data.read`;看請求 / 回應內容需 `observe.log.body`)。
  - 權限:選單 `it.gw-observe.read`、Tab `.map` / `.logs` / `.errors` / `.traffic`、按鈕 `.body`;儀表板兩個 Tab 隨附 `observe.data.read`。
  - 儀表板:今日 API 呼叫、可用率、平均回應時間、資安告警、今日流量、系統告警、Gateway 概況的上游服務健康改接即時資料;沒有權限或未接入時維持「開發中」。
  - 前端 `installMonitor`(只在建置版本);itapp-api 改用 `@giganexus/backend-sdk`(Token 驗證 `createTokenVerifier`、`setupGateway` 監控,不自動註冊)。
  - 套件改從公司 GitLab npm Registry 安裝(`.npmrc`、Token 為 `GITLAB_NPM_TOKEN`;Docker 以 BuildKit secret `npm_token` 傳入、CI 讀主機機密檔);移除 web-kit 兄弟 repo alias。
  - GModal 以視窗寬度為上限(窄螢幕超出畫面);vite `OBSERVE_LOCAL` 本機示範模式。
  - 使用手冊 `docs/OBSERVE-MANUAL.md`。
- 檔案:`frontend/src/pages/observe/*`、`frontend/src/components/observe/*`、`frontend/src/api/{observe,auth}.ts`、`frontend/src/composables/{observe,dashboard}.ts`、`frontend/src/pages/dashboard/{Overview,GatewaySummary}.vue`、`frontend/src/{router,main}.ts`、`frontend/src/ui/components/GModal.vue`、`frontend/{vite.config.ts,tsconfig.json,Dockerfile,.npmrc}`、`backend/src/{app,config}.ts`、`backend/src/gateway/plugin.ts`、`backend/{Dockerfile,.npmrc}`、`deploy/{gateway-rbac.yaml,docker-compose.yml,gen-secrets.sh}`、`.gitlab-ci.yml`、`docs/OBSERVE-MANUAL.md`
- 驗證:型別檢查、正式建置通過;本機以 giga-observe 示範資料實測四個 Tab、服務詳情、紀錄明細、Request ID 串接、儀表板(明亮 / 黑暗);測試區部署 `917d933` 後需求方確認畫面,itapp-api 心跳(版本 917d9336)與請求紀錄進到 giga-observe。後端單元測試在 Windows 有 3 項因檔案鎖定(rename EBUSY / EPERM)失敗,原版程式相同;CI(Linux)通過

## 2026-10-05 Tab / 按鈕登記為權限並綁定 API;角色權限合併
- 內容:
  - 本系統 21 個 Tab、10 個按鈕登記為 `kind tab / button`(`api/auth.ts` 的 `UI`、`deploy/gateway-rbac.yaml`),各自綁定用到的 BFF API(按鈕綁寫入,如「停用 / 啟用」→ `gw.admin.user.write`);路由 Tab、Tab 名稱(以 BFF 為準)、各頁按鈕改用這些代碼。`it-admin` 擁有全部。
  - 「應用權限」+「API 權限」合併為**角色權限**:每列標示綁定的 API;應用選「未綁定畫面的 API」設定沒綁到畫面的 API。部門 / 個人權限同樣標示綁定的 API。勾選單時自動勾它底下的 Tab(按鈕需個別勾)。
  - 選單管理綁定 API:選單只能選讀取,Tab / 按鈕可選寫入;只列此應用相關系統(可切換顯示全部),每個 API 列出它保護的路由與已綁定的節點。
- 檔案:`frontend/src/api/{auth,admin}.ts`、`frontend/src/router.ts`、`frontend/src/layouts/TabbedPage.vue`、`frontend/src/composables/appPermTree.ts`、`frontend/src/pages/system/{AppPermissions,DeptPermissions,UserPermissions,MenuManage,RoleRules,Users}.vue`、`frontend/src/pages/gateway/{Upstreams,Routes,Releases}.vue`;移除 `ApiPermissions.vue`;`deploy/gateway-rbac.yaml`

## 2026-10-05 API 權限也能給部門 / 個人
- 內容:「部門權限」「個人權限」的應用下拉新增「API 權限(無畫面,含寫入)」,依系統分組列出純 API 權限(BFF `app = '@api'`),部門可依職級門檻、個人可設到期日;「API 權限」Tab 仍授予角色。個人權限的來源欄新增「隨選單」。
- 檔案:`frontend/src/composables/appPermTree.ts`、`frontend/src/pages/system/{DeptPermissions,UserPermissions,ApiPermissions}.vue`

## 2026-10-05 選單隨附的 API 讀取權限
- 內容:授予選單即一併取得該頁需要的 API 讀取權限(BFF `gw.permission_include`),解決「勾了選單、側欄卻不顯示」(側欄可見 = 選單權限 ∩ 該頁讀取權限)。選單管理的編輯視窗可勾選「此頁需要的 API 讀取權限」;權限試算、個人權限標示隨附的權限與是否取得,目錄改顯示「依下層」;誰能存取列出「隨選單取得」;API 權限 Tab 標示被哪些選單隨附。`gateway-rbac.yaml` 以 `includes` 首次登記(與 `api/auth.ts` 的 `requires` 一致)。
- 檔案:`frontend/src/pages/system/{MenuManage,PermissionPreview,UserPermissions,ApiPermissions}.vue`、`frontend/src/pages/gateway/WhoCanAccess.vue`、`frontend/src/api/admin.ts`、`deploy/gateway-rbac.yaml`

## 2026-10-05 側欄大項改由 BFF 管理(選單目錄 group、圖示)
- 內容:側欄大項(總覽、Gateway 管理、端點管理、系統管理)登記為 BFF 選單目錄(`kind = group`,`it.group.*`,只分組命名、不可授予),頁面掛到所屬目錄。側欄大項的名稱 / 圖示 / 順序、頁面歸屬(頁面在 BFF 的上層目錄)與頁面名稱 / 順序 / 頁首圖示改以 `/api/auth/me` 的 `menus` 為準,沒有時用 `api/auth.ts` 的預設值。選單管理可新增目錄、選圖示(`ui/icons.ts` 登記的名稱);權限勾選畫面的目錄列不顯示勾選框。圖示清單由 `GIcon.vue` 移到 `ui/icons.ts`。
- 檔案:`frontend/src/api/{auth,admin}.ts`、`frontend/src/ui/{icons.ts,components/GIcon.vue}`、`frontend/src/layouts/TabbedPage.vue`、`frontend/src/composables/{appPermTree,bffRbac}.ts`、`frontend/src/pages/system/{MenuManage,AppPermissions,DeptPermissions,UserPermissions}.vue`、`deploy/gateway-rbac.yaml`

## 2026-10-05 選單管理、API 權限 Tab
- 內容:
  - **選單管理**(系統管理,新選單 `it.sys-menu.read`):各應用「應用 → 選單 → Tab → 按鈕」清單的改名稱、上層、排序、說明,新增與刪除;原「權限設定 › 應用權限」的新增功能移到此頁。程式(`gateway-rbac.yaml` / OpenAPI)只負責首次登記,BFF `apply` 不再覆寫已存在權限的上層與排序(名稱本來就不覆寫)。
  - **側欄 / 頁首名稱以 BFF 為準**:`/api/auth/me` 的 `menus` 回傳擁有的畫面權限與名稱,`menuTitle()` 優先使用,沒有時用前端預設文字。
  - **權限設定 › API 權限**:沒有畫面的純 API 權限(kind = api)× 角色,可編輯(保留角色的其他權限)。
- 檔案:`frontend/src/pages/system/{MenuManage,ApiPermissions,AppPermissions}.vue`、`frontend/src/api/{auth,admin}.ts`、`frontend/src/layouts/TabbedPage.vue`、`frontend/src/router.ts`、`deploy/gateway-rbac.yaml`、`AGENT.md`

## 2026-10-05 權限查詢(唯讀)與權限設定分工
- 內容:「BFF 權限」改名**權限查詢**(Gateway 管理,唯讀):角色權限總覽移除編輯並連到權限設定;誰能存取補上直接授予的部門 / 個人;關係圖左欄加入部門(× 職級門檻)與個人(BFF `GET /api/admin/direct-grants`)。「角色與按鈕權限」改名**權限設定**(系統管理),為唯一的權限編輯入口。選單權限名稱同步(`deploy/gateway-rbac.yaml`)。
- 修正(web-kit,Gateway repo):`/api/auth/me` 遇 401 未先 Refresh,Access Token 過期或權限版本遞增後換頁會被導回登入頁;本系統重新建置後套用。
- 檔案:`frontend/src/router.ts`、`frontend/src/api/{auth,admin}.ts`、`frontend/src/pages/gateway/{RoleMatrix,WhoCanAccess,RbacGraph}.vue`、`frontend/src/pages/{Forbidden,dashboard/GatewaySummary}.vue`、`deploy/gateway-rbac.yaml`、`AGENT.md`、`docs/PROJECT-MAP.md`

## 2026-10-05 部門權限 / 個人權限 Tab(Gateway PRD §8.3.4 v0.12)
- 內容:「角色與按鈕權限」新增兩個 Tab,選單 / Tab / 按鈕權限可直接授予部門與個人,不必建角色或規則。
  - **部門權限**:左側部門樹(只列開放公司,● = 此應用直接設定數),右側權限樹 × 職級門檻(全員 / 課級 ≤7 / 理級 ≤6 / 處級 ≤4);含下層部門開關;◐ = 自上層部門繼承(不能取消)、「含」= 已由較寬門檻涵蓋。
  - **個人權限**:搜尋人員,列出此應用的有效權限與來源(角色 / 部門 / 個人),可直接加給個人權限,預設永久、可設到期日。
  - 勾選子項自動勾選上層、取消上層一併取消子項(BFF 儲存時也會補上層)。
- 檔案:`frontend/src/api/admin.ts`、`frontend/src/router.ts`、`frontend/src/composables/appPermTree.ts`、`frontend/src/pages/system/{DeptPermissions,UserPermissions}.vue`、`AGENT.md`
- BFF:`GET /api/admin/job-tiers`、`GET/PUT /api/admin/dept-permissions[/:deptCode]`、`GET/PUT /api/admin/user-permissions/:id`(giga-api-gateway-bff v0.12)

## 2026-10-02 改用 Gateway 單一入口,管理頁接 BFF 管理 API(giga-Portal PRD I1–I4、Gateway P2-3a)
- 內容:
  - **前端單一入口(I1、I3)**:改用 `@giganexus/web-kit`(`api/http.ts` 包裝、`api/auth.ts` 讀 `/api/auth/me`),移除自有登入頁、變更密碼、`it_csrf`;未登入導向入口網 `/login?redirect=/it/...`,沒有 `it.app.access` 導回 `/`,BFF 無法連線顯示 `Unavailable` 頁;首次導覽前顯示載入畫面。
  - **權限改用 BFF(I2)**:選單權限 `it.*`(kind menu、上層 `it.app.access`)與角色 `it-admin` 登記在 `deploy/gateway-rbac.yaml`(CI rbac-test 套用);頁面 / 選單可見 = 選單權限 ∩ 該頁的 BFF 讀取權限(`meta.requires`),按鈕直接用 `gw.admin.*`。
  - **管理頁改為以使用者身分直呼 BFF 管理 API**(`api/admin.ts`):上游服務(新增、編輯、健康檢查)、API 路由(篩選、明細、新增 / 編輯草稿、停用、試打、匯出)、發佈版本(差異預覽、發佈、回滾)、BFF 權限(矩陣編輯、反查含規則 / 個別指派 / API Key、關係圖)、人員(搜尋、停用、強制登出、個別指派角色)、部門樹(BPM 同步)、**應用權限樹 × 角色(I4)**、角色與指派規則、AD 群組、權限試算(工號 / 人事條件)、稽核(操作含前後內容、登入)。儀表板的 Gateway 概況、團隊工作、最近操作改讀 BFF。移除職級 × 部門權限頁(LevelMatrix、DeptRestrictions)與 SourceTag。新增全域元件 `GTextarea`。
  - **itapp-api 經 BFF 轉入(G5 / P2-3a)**:新增 `/api/it/dashboard/overview`、`/work`,只驗證 `X-Internal-Token`(`gateway/plugin.ts`,以 jose 對 BFF JWKS 驗證;compose 預設 `GW_JWKS_URL=http://bff-1:3000/.well-known/jwks.json`);上游與路由登記於 `deploy/gateway-routes.yaml`。舊 `/it/api/*` 過渡期保留。
  - 部署:spa-it 建置帶入 web-kit(`additional_contexts`、`WEB_KIT_DIR`,同 giga-Portal);CI 新增 `rbac-test`,前端型別檢查連到 Gateway 共用目錄的 web-kit;本機開發 `/api`、入口網 `/`、`/login` proxy 到測試區 Gateway(`/` 也要轉,否則應用層守衛導回 `/` 會與 Vite 互相導向造成畫面一直閃)。
- 檔案:`frontend/src/api/{http,auth,admin,format,types}.ts`、`frontend/src/router.ts`、`frontend/src/App.vue`、`frontend/src/main.ts`、`frontend/src/layouts/AppLayout.vue`、`frontend/src/composables/{apps,bffRbac,dashboard}.ts`、`frontend/src/pages/gateway/*`、`frontend/src/pages/system/{Users,Departments,AppPermissions,RoleRules,PermissionPreview,Audit}.vue`、`frontend/src/pages/dashboard/*`、`frontend/src/pages/endpoint/Devices.vue`、`frontend/src/pages/Unavailable.vue`、`frontend/src/ui/components/GTextarea.vue`、`frontend/vite.config.ts`、`frontend/tsconfig.json`、`frontend/Dockerfile`、`backend/src/gateway/plugin.ts`、`backend/src/routes/it-dashboard.ts`、`backend/src/{app,config,errors}.ts`、`backend/src/auth/plugin.ts`、`backend/test/gateway.test.ts`、`deploy/gateway-rbac.yaml`、`deploy/gateway-routes.yaml`、`deploy/apply-gateway-rbac.sh`、`deploy/docker-compose.yml`、`.gitlab-ci.yml`、`AGENT.md`、`docs/API.md`、`docs/PROJECT-MAP.md`、`docs/Gherkin/auth/gateway-sso.feature`
- 驗證:
  - `frontend`:`npm run typecheck`、`npm run build` 通過;`backend`:`npm run typecheck` 通過,`npm test` 新增 `auth/gateway-sso.feature` 4 個場景通過(另 `app.test.ts`、`bff-read` 502、`bff-write` live 共 3 項於 Windows 因暫存檔改名被鎖 EBUSY / EPERM 失敗,改動前即如此,CI 為 Linux)。
  - 瀏覽器(本機 `npm run dev` 經測試區 Gateway,S112009 登入):未登入導向入口網登入頁、登入後回到 `/it/`;無 `it.app.access` 時導回入口網(修正前畫面無限閃爍)。測試區先以本機 CLI 套用 `gateway-rbac.yaml`,並經需求方同意指派 S112009 `gw-super-admin` + `it-admin`。逐頁操作:新增上游 itapp-api → 健康檢查 200(64 ms);新增路由 `it.dashboard.overview` / `work`(草稿)→ 編輯上游路徑 → 試打(允許,舊版 itapp-api 回 404 屬預期);發佈版本預覽 +2 新增、上游變更;角色權限矩陣 7 角色 × 54 權限;權限反查、關係圖;人員 2,272 筆、搜尋、明細;部門樹 875 個;應用權限樹(IT 管理系統、員工入口網);角色與規則;試算 S112009 → 3 角色 47 權限、應用 portal / it;稽核顯示上述操作(操作人 S112009)與前後內容、登入紀錄;儀表板 Gateway 概況即時統計、團隊工作(資訊服務部 7 人);電腦清單顯示 Gateway 權限不足(端點權限待 W6)。
  - 未完成:路由尚未發佈(待 CI 部署新版 itapp-api 後於「發佈版本」發佈);未推送。

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
- 內容:建立 GigaItApp。後端 itapp-api(Fastify,port 51297):自有登入(工號 + 密碼、JWT Session Cookie、CSRF、5 次失敗鎖 15 分)、職級(系統管理員 / 主管 / 高級工程師 / 一般工程師)× 部門(網管 / 系統 / 程式開發 / 資安)按鈕權限、兩層選單、資料範圍(只能管理同部門且職級較低者)、稽核紀錄、BFF 串接(mock 快照 / live 服務帳號)。前端 Vue 3 + Vite:全域 UI 套件(G* 元件、圖表、玻璃擬態 tokens、明亮 / 黑暗)、兩層選單 + 頁內 Tab、儀表板(部分模擬資料)、BFF 服務 / 路由 / 發佈版本、BFF 角色權限矩陣 / 反查 / 關係圖、人員與部門、職級權限 / 部門限制 / 權限試算、稽核紀錄。部署:Nginx `/it/api/` 直接轉給 itapp-api,前端發佈到 `it-admin` 取代範例頁。
- 檔案:`backend/`、`frontend/`、`deploy/`、`AGENT.md`、`README.md`;Gateway:`nginx/conf.d/portal.conf`、`nginx/templates/00-env.conf.template`、`nginx/Dockerfile`、`deploy/docker-compose.yml`、`deploy/*.env.example`、`deploy/docker-compose.dev.yml`
- 驗證:後端 `npm test` 15 項通過、`typecheck`、`build` 通過;前端 `vue-tsc`、`vite build` 通過。live 模式對本機 BFF 讀取 overview / routes / releases / rbac / who-can-access 成功,寫入回 501 `ITAPP_BFF_NOT_SUPPORTED`。部署到本機 Gateway 後,經 Nginx `/it/api/healthz` 200、Cookie 為 Secure / HttpOnly、路徑 `/it/api`。瀏覽器(1440 / 375 寬,明亮 / 黑暗):登入 → 儀表板三個 Tab → 服務與路由 → BFF 權限矩陣 / 關係圖 → 人員 → 職級權限(itadmin 調整一般工程師權限 → 確認 → 儲存成功)→ 以一般工程師進入稽核紀錄被導向 403;經 Gateway 以資安課高級工程師登入,發佈版本頁無「發佈草稿」按鈕、資料來源顯示「BFF 即時」
