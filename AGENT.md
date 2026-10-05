# GigaNexus IT 管理系統 — AI 協作準則(AGENT.md)

> 本文件是 AI 程式助手(Claude、Gemini 等)在本專案中的行為準則,所有 AI 協作開發必須遵守。
> 由 Gateway 專案(`giga-api-gateway-bff`)根目錄 `AGENT.md` 與下游後端樣本 `samples/node-backend/AGENT.md` 整理合併,並依本專案調整。
> Gateway 的規格(`../giga-api-gateway-bff/docs/`)仍是上位規範;本文件與之不一致時,**先指出差異,不要自行決定以哪一邊為準**。
> 本專案與 Gateway、Go Endpoint Server 等專案放在**同一層目錄**、彼此相依;跨專案規則(相對路徑、用 BFF 路由表找 API、跨 repo 修改)見 `../giga-api-gateway-bff/AGENT.md` **§10 多專案工作區**。

---

## AI 分工(Claude / Gemini)— 必讀

同 `../giga-api-gateway-bff/AGENT.md` §10.8(有出入時以該節為準)。

寫程式、寫測試、寫文件由 **Claude** 負責;**Gemini** 只負責執行測試、撰寫測試報告,以及非邏輯性的修改。Gemini 開始動手前,先確認工作在下表 Gemini 欄是 ✅。

| 工作 | Claude | Gemini |
| --- | --- | --- |
| 寫程式(新功能、業務邏輯、API、權限、資料存取、狀態管理、修 bug、重構) | ✅ | ❌ |
| 寫測試(單元 / 整合 / E2E 測試碼、測試用 fixture 的邏輯) | ✅ | ❌ |
| 寫文件(`AGENT.md`、`README.md`、`docs/`、`PROJECT-MAP.md`、架構 JSON、修正紀錄) | ✅ | ❌(測試報告除外) |
| 執行測試(既有的 `npm test`、`test:int`、E2E、`cargo test` 等)並撰寫測試報告 | ✅ | ✅ |
| 非邏輯性修改:前端 mock / 假資料、版面與樣式(CSS、間距、顏色、排版)、畫面文案錯字 | ✅ | ✅ |
| CI/CD 與容器、部署設定 | ✅ | ❌ **禁止** |

**Gemini 禁止修改**(即使只改一行):

- CI/CD:`.gitlab-ci.yml`、`ci-templates/`、Runner 設定。
- 容器與部署:`Dockerfile*`、`docker-compose*`、`.dockerignore`、`deploy/`、`nginx/`、部署腳本、`.env*`、`Web.config` / 發佈設定。
- 相依與建置設定:`package.json`(含 scripts)、lock 檔、`Cargo.toml`、`tsconfig*.json`、`vite.config.*`。
- 資料庫:schema、migration、seed。
- 測試程式碼:測試失敗時**不得**為了讓測試通過而修改測試或程式、跳過測試、調整門檻;把失敗寫進報告,交給 Claude 處理。

**測試報告**(Gemini 執行測試後必寫):

- 位置:該 repo 的 `docs/test-reports/YYYY-MM-DD-<主題>.md`。
- 內容:1. 環境(分支 / commit、部署區、執行的指令)2. 結果(通過 / 失敗 / 略過數量)3. 失敗項目(測試名稱、錯誤訊息摘錄)4. **可能問題**:推測原因、相關檔案與行號、重現步驟、影響範圍 5. 建議交給 Claude 處理的項目。
- 測試全部通過也要寫,並列出觀察到的潛在風險(警告訊息、偶發失敗、執行過慢等)。

**判斷不了是否屬於「非邏輯性」時,一律視為邏輯修改**:不動程式,寫進報告交給 Claude。

---

## 0. 專案定位(先讀)

| 項目 | 內容 |
| --- | --- |
| 做什麼 | IT 部門自己的管理系統:儀表板、Gateway BFF 的服務 / 路由 / 權限視覺化與設定、Gateway 使用者 / 部門 / 角色與各應用的選單、Tab、按鈕權限、稽核 |
| 子路徑 | `/it/`(取代 Gateway 原本的範例 IT 頁面,Nginx 對應 `/srv/www/it-admin/current`) |
| API | **`/api/*` 經 Gateway BFF**:管理資料直接呼叫 BFF 管理 API `/api/admin/*`(以使用者本人身分);本系統自己的資料 `/api/it/*` 由 BFF 依路由表轉給 `itapp-api:51291`(只驗證 `X-Internal-Token`,`backend/src/gateway/plugin.ts`)。舊的 `/it/api/*`(Nginx 直通、自有登入)**過渡期保留**,前端已不使用,測試區驗收後移除 |
| 登入 | **Gateway 單一入口**(2026-10-02 實作,giga-Portal PRD D2、§9.2 I1–I3):前端以 `@giganexus/web-kit` 取得 `/api/auth/me`,未登入導向入口網 `/login?redirect=/it/...`,沒有 `it.app.access` 導回入口網 `/`;不再有自有登入頁、Session、CSRF |
| 權限 | 選單權限 `it.*`(kind `menu`,上層 `it.app.access`)登記在 `deploy/gateway-rbac.yaml`,角色 `it-admin`;資料與按鈕權限直接用 BFF 的 `gw.admin.*`(按鈕 = API)。頁面 / 選單可見 = 選單權限 ∩ 該頁需要的 BFF 讀取權限(`frontend/src/api/auth.ts`) |
| 端點管理 | 前端直接呼叫 `/api/endpoint/*`,經 BFF 到 Endpoint Server,**權限以 BFF 為準**(Gateway PRD Q27、`ENDPOINT-AGENT-GUIDE.md` §8) |
| 工作區 | 與 `../giga-api-gateway-bff/`(上位規範、web-kit、開發用憑證)、`../giga-Portal/`(員工入口網:單一入口與應用切換起點;**本系統負責設定其選單 / Tab / 按鈕權限**)同層;規則見 Gateway `AGENT.md` §10 |
| 權限查詢 | 「權限查詢」畫面(Gateway 管理,**唯讀**):角色權限總覽、誰能存取(含部門 / 個人直接授予)、關係圖(角色 / 部門 / 個人 → 權限 → API);不提供編輯 |
| 選單管理 | 「選單管理」畫面(系統管理):各應用的選單 / Tab / 按鈕清單改名稱、上層、排序,新增或刪除;`gateway-rbac.yaml` 只負責首次登記。側欄與頁首名稱以 BFF 名稱(`/api/auth/me` 的 `menus`)為準 |
| 權限設定 | 「權限設定」畫面(系統管理,唯一的權限編輯入口;含 **API 權限** Tab:純 API 權限 × 角色)設定各應用(員工入口網、本系統…)的應用 / 選單 / Tab / 按鈕 × 角色、角色指派規則(公司 / 部門〔含下層〕/ 職級 / 職稱)、**部門權限**(含下層、職級門檻)與**個人權限**(直接授予,不經角色)、權限試算;以使用者身分寫入 BFF(需 `gw.admin.rbac.write`) |
| 目錄 | `backend/`(Fastify,itapp-api)、`frontend/`(Vue 3 + Vite)、`deploy/`(compose)、`docs/DevelopmentProcess/`(修正紀錄);**各目錄與檔案職責見專案地圖 `docs/PROJECT-MAP.md`** |

`/api/it/*` 依下游樣本「只信任 `X-Internal-Token`」;路由以 `deploy/gateway-routes.yaml`(CLI apply)或「服務與路由」畫面登記,尚未採用 OpenAPI 自動註冊。過渡期保留的 `/it/api/*` 仍為自有登入,只供舊測試使用。

---

## 1. 先思考再動手

- **動手之前,先說明你的理解與假設**:用 1–3 句話摘要打算做什麼、為什麼這樣做。
- **有疑問先問,不要猜**;需求有多種解讀時,列出選項讓人類選擇。
- 規格以 Gateway `docs/` 與本文件為準;程式與規格不一致時先指出差異。

```
❌ 直接開始寫「BFF 角色權限編輯」的 live 實作
✅ 「BFF 目前沒有角色權限寫入 API(PRD §8.7 / P2-3)。我打算維持 live 模式回 ITAPP_BFF_NOT_SUPPORTED,
    mock 模式寫入資料檔。要等 BFF 提供 API 再串,還是先由 BFF 補 API?」
```

## 2. 簡單優先

- 用最少的程式碼解決當前問題,不寫「未來可能用到」的程式碼。
- 不要「順便」引入新套件、設計模式或抽象層;新增套件前先說明理由(Gateway `docs/TECH-STACK.md` 已列的優先)。
- 10 行能解決的不要寫 50 行。

```
❌ 為了讀一個設定值,建立 ConfigProvider + Strategy Pattern
✅ 在 backend/src/config.ts 的 loadConfig 加一個欄位並檢查
```

## 3. 外科手術式修改

- **只改必須改的地方**;不順手整理、重構、改名不相關的程式碼,不改動既有格式(格式交給 Prettier)。
- 修改 Gateway 專案(`nginx/`、`deploy/`、`docs/`)時同樣只動必要的幾行,並在 Gateway 的 `docs/DevelopmentProcess/` 留紀錄。
- 每次修改都要能用一句話解釋為什麼改。

## 4. 目標導向執行

- 先定義成功標準,**優先對應 `docs/PRD.md` 的需求編號(FR-x.y)與 `docs/Gherkin/*.feature` 場景**,自己迭代到達成為止;遇到阻塞(缺資訊、權限不足、BFF 尚無 API)才停下來回報。
- 行為變更時同步更新:PRD 需求 → Gherkin 場景(標籤 `@auto` / `@manual` / `@e2e` / `@wip`)→ `backend/test/scenarios.test.ts` 同名測試;API 變更同步 `docs/API.md`,UI 元件變更同步 `docs/UI-GUIDE.md`。
- 完成時簡要說明:做了什麼、執行了哪些指令、結果如何;有畫面的修改要用瀏覽器實際操作(見 §9)。

## 5. 失敗要明確說

- **失敗就說失敗**,不能把「靜默跳過」包裝成「完成」;附上錯誤訊息與 `requestId`。
- 不用空的 `catch {}` 吞錯誤;確實要降級時記錄 log 並在註解說明依據。
- **BFF 尚未提供的寫入 API,live 模式一律丟 `ITAPP_BFF_NOT_SUPPORTED`**,不可假裝成功;mock 模式的寫入只影響本系統資料檔,回報時要講清楚。
- 不要刪除或放寬失敗的測試來讓測試通過。

---

## 6. 部署區與設定

| 項目 | `dev`(本機開發) | `test`(測試區) | `prod`(正式區) |
| --- | --- | --- | --- |
| `IT_ENV` | `dev` | `test` | `prod` |
| 機密(JWT 金鑰、種子密碼、BFF 服務帳號密碼) | 可直接給值;JWT 金鑰未設定時隨機產生 | `*_FILE`(Docker secret) | **只接受** `*_FILE` |
| Cookie `Secure` | 否(http://localhost) | 是 | 是 |
| `BFF_MODE` | 預設 `mock` | `live` | `live`(需 BFF 正式管理 API,見下) |
| 日誌等級預設 | `debug` | `info` | `info` |

- 部署區只有這三個值;不要新增 `staging`、`product` 之類的名稱。缺少必要設定時**啟動失敗**,不要加預設值繞過檢查。
- `BFF_MODE=live` 用到的 `/api/admin/demo/*`、`/api/admin/db/*` 在 BFF **只於 dev / test 註冊**;正式區必須等 BFF 管理 API(PRD §8.7 / P2-3)再切換,不可自行連 BFF 資料庫。
- BFF 服務帳號需 `gw.admin.route.read`、`gw.admin.rbac.read`;正式環境請 Gateway 負責人以 CLI 代建專用本機帳號,不要用個人帳號。
- Port `51291`(Gateway BACKEND-GUIDE §3.3 已登記);不可自行換 port。

---

## 7. 後端規則(`backend/`)

### 7.1 API
| 項目 | 規範 |
| --- | --- |
| 路徑 | `/it/api/{resource}`,資源名詞複數、kebab-case;常數 `API_PREFIX` |
| 存取宣告 | 路由 `config: { permission: 'sys.user.create' }`;不需登入才寫 `config: { public: true }`。**寫入 API 一律宣告按鈕權限**,不能只靠前端隱藏按鈕 |
| 參數驗證 | Fastify JSON schema(`body` / `querystring` / `params`),`additionalProperties: false` |
| 冪等 | `GET` / `PUT` 必須冪等 |
| 分頁 | **清單 API 一律由後端篩選與分頁**(`routes/paging.ts`:`page`、`pageSize` 上限、回應 `{ items, total, page, pageSize }`);不回傳「全部資料讓前端自己篩」。儀表板等多區塊頁面依區塊拆 API,讓前端按需呼叫 |
| 稽核 | 所有寫入操作呼叫 `store.addAudit(...)`,`action` 用 `{resource}.{verb}` 並在前端 `ACTION_LABEL` 補中文 |

### 7.2 權限模型(`src/rbac/`)
- **有效權限 = 職級權限 ∩ 部門限制**;`admin` 固定全部(不可調整,避免鎖死)。
- 權限代碼 `{module}.{resource}.{action}`,只能在 `rbac/catalog.ts` 的 `PERMISSIONS` 新增;`type: 'page'` 控制選單 / 頁面,`type: 'button'` 控制按鈕與對應寫入 API。
- 兩層選單定義在 `MENUS`,由 `/it/api/auth/me` 依權限過濾後回傳;第三層(Tab)定義在前端路由 meta。
- **資料層級**:非 admin 只能看 / 管理自己部門、且只能管理職級比自己低的人(`canManage`),違反回 `403 ITAPP_DATA_ACCESS_DENIED`。

### 7.3 身分、錯誤與機密
- 身分只來自 `it_at` Session Cookie(httpOnly、SameSite=Strict、Path=/it/api);非 GET 必須驗證 `X-CSRF-Token` = `it_csrf`。不要關閉 CSRF 或放寬 Cookie 屬性。
- 權限每次請求由資料檔計算,**不要把權限放進 JWT**(調整後需立即生效);停用 / 重設密碼時遞增 `tokenVersion`。
- 錯誤一律 `throw new AppError('ITAPP_XXX', message?, details?)`,格式 `{ code, message, requestId, details? }`;**新代碼先登記在 `errors.ts` 的 `ERROR_CODES`**,一律 `ITAPP_` 開頭。
- 不回傳堆疊、密碼雜湊;不在日誌記錄 Cookie / CSRF / 密碼。機密不入版控、不寫進映像檔。

### 7.4 串接 BFF(`src/bff/`)
- **新增 BFF 資料前,先查 BFF 既有 API**(`GET /api/admin/routes/catalog`,或 `node ../giga-api-gateway-bff/sdk/node/dist/lookup-cli.js <關鍵字>`,見 Gateway `AGENT.md` §10.4);查到就用,查不到先回報,不要自己連 BFF 資料庫或重寫 BFF 邏輯。查不到(沒設定、連不到)時明確說明「未查詢」。
- mock 與 live 必須實作同一個 `BffSource` 介面、回傳相同形狀;`mock-data.json` 取自本機 Gateway dev 快照(虛構資料)。
- 唯讀資料經 `BffService` 快取(預設 30 秒),寫入後清除快取。

### 7.5 資料儲存
- 基本框架階段使用 `DATA_DIR/itapp.json`(單一實例)。**要多實例或上正式區前改接資料庫**(SQL Server 2012 限制見 Gateway `docs/DATABASE.md` §0),路由層不直接操作 JSON 結構以外的東西。

---

## 8. 前端規則(`frontend/`)

| 項目 | 規範 |
| --- | --- |
| 框架 | Vue 3 Composition API(`<script setup lang="ts">`)+ Vite + vue-router(History 模式,`base: '/it/'`) |
| **UI 全域套用** | 基本元件一律用 `src/ui/` 的 `G*` 元件(全域註冊,不需 import);**頁面不自己刻按鈕 / 卡片 / 表格 / 表單 / 對話框樣式**,需要新樣式時擴充 `G*` 元件或 `ui/styles/tokens.css` |
| 顏色 / 主題 | 只用 `tokens.css` 的 CSS 變數與 `tone-*` class;新增顏色時**明亮與黑暗兩組都要定義**。不寫死色碼 |
| 玻璃擬態 | 面板用 `.glass` / `.glass-edge`(或 `GCard`),圖表色取 `ui/charts/palette.ts` |
| 圖示 | `<GIcon name="...">`,新圖示在 `GIcon.vue` 的 `ICONS` 登記,頁面不直接 import `lucide-vue-next` |
| 權限 | 按鈕 `v-can="'權限代碼'"`,頁面 `meta.permission`,Tab `permission`;這些只是體驗,**後端一定要再檢查** |
| HTTP | 一律經 `src/api/http.ts`(包裝 `@giganexus/web-kit`:同網域 `/api/*`、CSRF、401 先 Refresh 再導向入口網登入、錯誤含 `requestId`);BFF 管理 API 的呼叫與型別集中在 `src/api/admin.ts`;頁面不直接呼叫 `fetch` |
| 回饋 | `toast.*` / `await confirm({...})`(`@/ui`),錯誤顯示 `describeError(e)`(含 requestId) |
| 頁面結構 | 兩層選單 → `TabbedPage`(路由 meta:`title`、`tabs`)→ Tab 子路由;頁面動作按鈕 `<Teleport to="#page-actions" defer>` |
| 版面 | 手機寬度(375px)不可出現整頁水平捲動;表格在卡片內捲動 |
| **懶加載** | 頁面程式一律 `() => import()`(路由層);清單用 `usePaged`(後端分頁、篩選防抖),**不要一次取回全部資料**;首屏以外的區塊用 `<GLazy>` 包住,捲動到才掛載並呼叫 API;多個 Tab 各自在切換時才載入;對話框需要的選項在打開時才查詢 |
| 禁止 | Token / 密碼存 localStorage、sessionStorage;解析 JWT;寫死主機與 port;`/` 開頭的寫死資源路徑(用 `import.meta.env.BASE_URL`) |

新增全域元件時,同步更新 `src/components.d.ts`(模板型別檢查用)。

---

## 9. 專案慣例

| 項目 | 規範 |
| --- | --- |
| 語言 | TypeScript(ESM、`strict`、`noUncheckedIndexedAccess`) |
| 命名 | 變數 / 函式 `camelCase`,型別 / 元件 `PascalCase`,常數 `UPPER_SNAKE_CASE`;後端檔名 `kebab-case.ts`,Vue 元件 `PascalCase.vue` |
| 格式 | Prettier(單引號、`printWidth` 160、尾逗號) |
| 註解語言 | 繁體中文,註明對應規格章節(例 `(PRD §8.7)`、`(AGENT.md §7.2)`);同一檔案內統一 |
| 測試帳號 | 種子帳號皆為虛構資料,dev 密碼 `Passw0rd!`;**不可在瀏覽器輸入真實帳密** |

### 9.1 專案地圖與設計原則

- **專案地圖:`docs/PROJECT-MAP.md`**。開發新功能後,在同一個變更內更新(新增 / 搬移 / 刪除目錄或主要檔案、職責改變、新頁面、新 API 都要反映),並更新開頭的「最後更新」;規則見 Gateway `AGENT.md` §10.7.1。
- 核心設計原則依 Gateway `AGENT.md` §10.7.2 的 **TypeScript / Node.js**(`backend/`)與 **Vue**(`frontend/`)兩列:

| 原則 | 本專案做法 |
| --- | --- |
| 職責分離 | 後端:`routes/`(介面)只做 schema 驗證與權限宣告,權限規則在 `rbac/`,資料在 `store/`、`bff/`,不在路由裡直接操作 JSON 結構;前端:`pages/` 只組合畫面,邏輯放 `composables/`,HTTP 只在 `api/`,共用元件只在 `ui/` |
| 原始碼根目錄 | `backend/src/`、`frontend/src/`;建置只取 `src/`(`tsconfig.build.json`、Vite) |
| 集中測試 | `backend/test/`(與 `src/` 平行);前端目前無自動化測試,新增 composables 等邏輯時補 `frontend/test/`(Vitest) |

- 既有程式與原則不同之處列在專案地圖 §6,不要為了符合原則大規模搬移(§3)。

### 常用指令
| 位置 | 指令 | 說明 |
| --- | --- | --- |
| `backend/` | `npm run dev` | 本機開發(讀 `.env`;預設 `BFF_MODE=mock`) |
| `backend/` | `npm test` / `npm run typecheck` / `npm run build` | 測試(`app.test.ts` 基本行為、`scenarios.test.ts` 對應 Gherkin `@auto` 場景)/ 型別 / 建置 |
| 根目錄 | `sh deploy/e2e-smoke.sh`(`STOP_API=1` 另驗 502) | 經 Gateway Nginx 的 `@e2e` 檢查 |
| `frontend/` | `npm run dev` | http://localhost:5177/it/;`/api` 與入口網登入頁 proxy 到測試區 Gateway(`GATEWAY_TARGET` 可改),以自己的帳號登入後操作的是**測試區真實資料** |
| `frontend/` | `npm run typecheck` / `npm run build` | 型別 / 建置 |
| 根目錄 | `sh deploy/gen-secrets.sh` → `docker compose -f deploy/docker-compose.yml up -d --build --wait itapp-api` | 部署後端到本機 Gateway 網路 |
| 根目錄 | `docker compose -f deploy/docker-compose.yml run --rm --build spa-it` | 發佈前端到 `/it/`(`... run --rm spa-it rollback it-admin` 回滾) |

---

## 10. 參考文件

| 文件 | 路徑 | 說明 |
| --- | --- | --- |
| **專案地圖** | `docs/PROJECT-MAP.md` | 目錄與檔案職責、分層、主要流程、「要改什麼去哪裡」;**開發新功能後必須更新**(§9.1) |
| 產品需求(BDD) | `docs/PRD.md` | 需求編號 FR-x.y、權限表、錯誤代碼總表(§7)、待決事項 |
| 架構與技術 | `docs/ARCHITECTURE.md` | 設計決策 D1–D12、請求流程、權限模型、資料模型、BFF 串接、技術棧、部署 |
| API 規格 | `docs/API.md` | 端點、權限、請求 / 回應、錯誤 |
| 前端 UI 規範 | `docs/UI-GUIDE.md` | 設計 token、全域元件、新增頁面步驟 |
| 驗收場景 | `docs/Gherkin/*.feature` | 各功能的驗收行為(標籤慣例見 `docs/Gherkin/README.md`) |
| Gateway 開發手冊 | `../giga-api-gateway-bff/AGENT.md` | 通用準則來源;§10 多專案工作區 |
| 下游後端準則 | `../giga-api-gateway-bff/samples/node-backend/AGENT.md` | 部署區、錯誤格式、新增 API 前先查 |
| 產品需求 | `../giga-api-gateway-bff/docs/PRD.md` | §7.2 SPA 子路徑、§8.3 RBAC、§8.7 管理 API、§8.1.1 錯誤代碼、Q27 端點管理以 BFF 為準 |
| 前端規範 | `../giga-api-gateway-bff/docs/FRONTEND-GUIDE.md` | 子路徑、資源路徑、禁止事項(登入頁為本專案例外) |
| 後端規範 | `../giga-api-gateway-bff/docs/BACKEND-GUIDE.md` | §3 port 登記、§5 錯誤與日誌 |
| 部署 | `../giga-api-gateway-bff/docs/DEPLOYMENT.md` | SPA 發佈 / 回滾、機密 |
| 端點管理 | `../giga-api-gateway-bff/docs/ENDPOINT-AGENT-GUIDE.md` | §8:端點 API、權限代碼、指令派送、本系統前端規則(§8.6) |
| 本專案說明 | `README.md` | 架構、帳號、權限矩陣、部署步驟 |
| 員工入口網 | `../giga-Portal/docs/PRD.md` | D2(本系統改單一入口)、§6.2 應用切換與路由守衛、§9.2 本系統配合修改 I1–I5 |
| 應用切換規範 | `../giga-api-gateway-bff/docs/FRONTEND-GUIDE.md` | §7.4 應用切換與應用層守衛、§7.5 選單 / Tab / 按鈕權限 |

---

## 11. 修正紀錄

每次修正都要留紀錄,**新紀錄加在檔案最上方**。有畫面或使用者操作流程的修改,完成後要用瀏覽器實際操作確認(`npm run dev`),並在紀錄說明操作步驟與結果;型別檢查、測試、建置仍需執行並回報。

| 文件 | 路徑 | 說明 |
| --- | --- | --- |
| Bug 修改紀錄 | `docs/DevelopmentProcess/BugFix.md` | Bug 修改 |
| 新增功能紀錄 | `docs/DevelopmentProcess/NewFeatures.md` | 新功能 |
| 前端修改紀錄 | `docs/DevelopmentProcess/FrontendCorrection.md` | `frontend/` |
| 後端修改紀錄 | `docs/DevelopmentProcess/BackendCorrection.md` | `backend/`、`deploy/` |

動到 Gateway 專案(`nginx/`、`deploy/`、`docs/`)時,另在 Gateway 的 `docs/DevelopmentProcess/` 留紀錄。

**開發新功能後,同一個變更內更新 `docs/PROJECT-MAP.md`**(§9.1),並在紀錄的「檔案」欄列出。

### 紀錄格式
```
## YYYY-MM-DD 標題
- 內容:改了什麼、為什麼
- 檔案:主要修改的檔案
- 驗證:執行的指令與結果(瀏覽器操作了哪些步驟)
```
