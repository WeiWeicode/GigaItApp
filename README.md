# GigaNexus IT 管理系統(GigaItApp)

IT 部門自己的管理系統,掛在 Gateway 的 `/it/`(**取代原本的範例 IT 頁面**),**自有登入,不共用單一入口**。
這一版完成:登入、全域 UI(玻璃擬態、明亮 / 黑暗切換)、兩層選單 + 頁內 Tab、首頁儀表板、BFF 與 BFF 權限的視覺化與設定、職級 × 部門的按鈕權限。

AI 協作準則見 [AGENT.md](AGENT.md)(由 Gateway 根目錄 AGENT.md 與後端樣本 AGENT.md 合併)。

| 文件 | 內容 |
| --- | --- |
| [docs/PRD.md](docs/PRD.md) | 產品需求(BDD:使用者故事、需求編號、對應驗收場景、錯誤代碼、待決事項) |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架構、設計決策、請求流程、權限 / 資料模型、BFF 串接、技術棧、部署、安全清單 |
| [docs/API.md](docs/API.md) | API 規格 |
| [docs/UI-GUIDE.md](docs/UI-GUIDE.md) | 前端 UI 規範(設計 token、全域元件、新增頁面) |
| [docs/Gherkin/](docs/Gherkin/README.md) | 驗收行為規格(12 個 feature;`@auto` 由 `npm test`、`@e2e` 由 `deploy/e2e-smoke.sh` 驗證) |

```
瀏覽器 ──https──▶ Nginx(Gateway)
                   ├─ /it/*        ─▶ /srv/www/it-admin/current(frontend,Vue SPA)
                   ├─ /it/api/*    ─▶ itapp-api:51291(backend,自有登入 / 權限)──服務帳號──▶ BFF /api/admin/*
                   └─ /api/*       ─▶ BFF(其他系統,不受影響)
```

| 目錄 | 內容 |
| --- | --- |
| `backend/` | itapp-api:Fastify 5 + TypeScript;`auth/` 登入與 Session、`rbac/` 職級 / 權限 / 選單、`bff/` BFF mock / live 來源、`routes/` API、`store/` JSON 資料檔 |
| `frontend/` | Vue 3 + Vite;`ui/` 全域 UI 套件(G* 元件、圖表、tokens)、`layouts/` 框架與 TabbedPage、`pages/` 各頁 |
| `deploy/` | `docker-compose.yml`(itapp-api 加入 Gateway 網路、spa-it 發佈)、`gen-secrets.sh` |
| `docs/` | PRD、架構、API、UI 規範、Gherkin、修正紀錄(`DevelopmentProcess/`) |

## 選單

| 第一層 | 第二層 | Tab(第三層) | 權限 |
| --- | --- | --- | --- |
| 總覽 | 儀表板 | 營運總覽 / Gateway 概況 / 團隊工作 | `dashboard.view` |
| Gateway 管理 | 服務與路由 | 上游服務 / API 路由 / 發佈版本 | `bff.route.read` |
| | BFF 權限 | 角色權限矩陣 / 權限反查 / 關係圖 | `bff.rbac.read` |
| 端點管理 | 電腦清單 | 電腦清單(經 Gateway BFF,需同一工號登入 Gateway) | `endpoint.device.read`(資料另需 Gateway 同名權限) |
| 系統管理 | 人員與部門 | 人員 / 部門 | `sys.user.read`(部門 Tab `sys.dept.read`) |
| | 角色與按鈕權限 | 職級權限 / 部門限制 / 權限試算 | `sys.perm.read` |
| | 稽核紀錄 | 操作紀錄 / 登入紀錄 | `sys.audit.read` |

## 權限模型

**有效權限 = 職級權限 ∩ 部門限制**,在「角色與按鈕權限」頁即時調整;系統管理員固定擁有全部權限。
資料範圍:非系統管理員只看得到自己部門,且只能管理**同部門、職級較低**的人員。

預設職級權限(✓)與部門限制:

| 權限 | 類型 | 主管 | 高級工程師 | 一般工程師 | 部門限制 |
| --- | --- | :-: | :-: | :-: | --- |
| `dashboard.view` 檢視儀表板 | 頁面 | ✓ | ✓ | ✓ | |
| `bff.route.read` 檢視服務與路由 | 頁面 | ✓ | ✓ | ✓ | |
| `bff.route.export` 匯出路由清單 | 按鈕 | ✓ | ✓ | | |
| `bff.route.publish` 發佈 / 回滾 | 按鈕 | ✓ | ✓ | | 程式開發課、系統課 |
| `bff.upstream.edit` 編輯上游服務 | 按鈕 | | ✓ | | 網管課、系統課 |
| `bff.rbac.read` 檢視 BFF 權限 | 頁面 | ✓ | ✓ | ✓ | |
| `bff.rbac.edit` 設定 BFF 角色權限 | 按鈕 | ✓ | | | 系統課、資安課 |
| `sys.user.read` 檢視人員 | 頁面 | ✓ | ✓ | ✓ | |
| `sys.user.create` / `edit` / `disable` / `reset-password` | 按鈕 | ✓ | | | |
| `sys.dept.read` 檢視部門 | 頁面 | ✓ | ✓ | ✓ | |
| `sys.dept.edit` 編輯部門 | 按鈕 | | | | |
| `sys.perm.read` 檢視角色與按鈕權限 | 頁面 | ✓ | ✓ | | |
| `sys.perm.edit` 設定角色與按鈕權限 | 按鈕 | | | | |
| `sys.audit.read` 檢視稽核紀錄 | 頁面 | ✓ | | | |

## 測試帳號(虛構資料,dev 密碼 `Passw0rd!`)

| 工號 | 姓名 | 部門 | 職級 | 用途 |
| --- | --- | --- | --- | --- |
| `itadmin` | IT 系統管理員 | 系統課 | 系統管理員 | 全部權限 |
| `S100001` | 陳主管 | 系統課 | 主管 | 人員管理、BFF 權限設定 |
| `S100010` | 林志偉 | 網管課 | 主管 | 只看得到網管課 |
| `S100031` | 劉建宏 | 程式開發課 | 高級工程師 | 可發佈路由 |
| `S100040` | 周子翔 | 資安課 | 高級工程師 | 無發佈權限(部門限制) |
| `S100012` | 吳佳穎 | 網管課 | 一般工程師 | 唯讀 |
| `S100041` | 鄭雅婷 | 資安課 | 一般工程師 | 已停用 |

其餘帳號見 `backend/src/store/seed.ts`。本系統帳號與入口網(AD / 本機帳號)**完全分開**。

## 開發

```bash
cd backend && npm install && cp .env.example .env && npm test && npm run dev    # :51291,BFF_MODE=mock(npm test 41 項)
cd frontend && npm install && npm run dev                                       # http://localhost:5177/it/
```

- 經本機 Gateway 測試(需先部署 itapp-api,見下):`cd frontend && npm run dev:gw` → http://localhost:5178/it/
- 後端改讀 BFF 即時資料:`.env` 設 `BFF_MODE=live`、`BFF_BASE_URL=https://localhost`、`BFF_SERVICE_USER` / `BFF_SERVICE_PASSWORD`、`NODE_EXTRA_CA_CERTS=<Gateway 開發用根憑證>`
- 資料檔在 `backend/data/itapp.json`,刪除後重啟即回到種子資料

## 部署到本機 Gateway(視同測試區)

需要 Gateway 本機環境已啟動(`giga-api-gateway-bff/deploy/dev/up.sh`),且 Gateway 的 Nginx 已含 `/it/api/` 路由(`ITAPP_API_UPSTREAM`)。

```bash
sh deploy/gen-secrets.sh                                                     # secrets/(不入版控)
docker compose -f deploy/docker-compose.yml up -d --build --wait itapp-api   # 後端,BFF_MODE=live
docker compose -f deploy/docker-compose.yml run --rm --build spa-it          # 前端發佈到 it-admin(/it/)
```

開啟 https://localhost/it/;`sh deploy/e2e-smoke.sh` 做經 Gateway 的端到端檢查。回滾前端:`docker compose -f deploy/docker-compose.yml run --rm spa-it rollback it-admin`。
Gateway 的 `deploy/dev/up.sh` 也會以本專案 `frontend/` 建置 `spa-it`(`ITAPP_DIR` 可指定本專案位置,預設 `../../GigaItApp`)。

## 部署到公司測試區

CI 未就緒前依 `../giga-api-gateway-bff/docs/TEST-DEPLOY-RUNBOOK.md` 步驟 8 手動部署:指令同上,加 `--env-file <主機受保護目錄>/itapp.env`(範本 `deploy/test.env.example`:公司的 Gateway 網路 / volume 名稱為 `giganexus-gw_*`、`BFF_BASE_URL` 為 Gateway DNS 名稱(公司 `*.gigasolar.com.tw` 憑證)、`GW_CA_CERT` 指向 Gateway `pki/ca.crt`、`BFF_SERVICE_USER` 為公司服務帳號)。`gen-secrets.sh` 務必以 `BFF_SERVICE_PASSWORD`、`ITAPP_SEED_PASSWORD` 指定密碼,不要用本機預設值。正式區的 BFF 不提供 `/api/admin/demo/*`、`/api/admin/db/*`,需改 `BFF_MODE=mock`(2026-09-26 決定)。

## API(皆在 `/it/api` 下)

| 方法 | 路徑 | 權限 |
| --- | --- | --- |
| POST | `/auth/login`、`/auth/logout` | 公開(登入經 Nginx 登入限流) |
| GET / POST | `/auth/me`、`/auth/password` | 登入 |
| GET | `/dashboard` | `dashboard.view` |
| GET | `/bff/overview`、`/bff/routes`、`/bff/releases` | `bff.route.read` |
| POST | `/bff/releases` | `bff.route.publish` |
| GET | `/bff/rbac`、`/bff/rbac/who-can-access?permission=` | `bff.rbac.read` |
| PUT | `/bff/rbac/roles/:role/permissions` | `bff.rbac.edit` |
| GET / POST / PATCH | `/users`、`/users/:id`、`/users/:id/(disable\|enable\|reset-password)` | `sys.user.*` |
| GET / POST / PATCH | `/departments`、`/departments/:code` | `sys.dept.*` |
| GET / PUT | `/rbac/catalog`、`/rbac/preview`、`/rbac/levels/:level/permissions`、`/rbac/permissions/:code/departments` | `sys.perm.*` |
| GET | `/audit?type=operation\|login` | `sys.audit.read` |

錯誤格式 `{ code, message, requestId, details? }`,代碼見 `backend/src/errors.ts`。

## 目前限制

- **BFF 寫入**:BFF 尚未提供角色權限編輯、發佈等管理 API(PRD §8.7 / P2-3)。`BFF_MODE=live` 時這些按鈕會顯示「BFF 尚未開放」(`ITAPP_BFF_NOT_SUPPORTED`);`mock` 時只寫入本系統資料檔 / 模擬版本,不影響任何 Gateway。上游編輯按鈕目前只提示未開放。
- **BFF 讀取**:live 模式使用 BFF 的 `/api/admin/demo/*`、`/api/admin/db/*`,這些只在 BFF dev / test 註冊;正式區需等 BFF 正式管理 API。服務帳號目前用虛構帳號 `S100001`,正式環境需專用帳號。
- **儀表板**:KPI、流量、工單、告警、服務延遲為**模擬資料**(畫面已標示);Gateway 統計、部門人數、最近操作為真實資料。
- **資料儲存**:JSON 檔、單一實例(登出黑名單在記憶體);多實例或正式上線前需改接資料庫。
- Linux 主機部署時,`secrets/*` 權限為 600,需確認容器內 `node` 使用者可讀(或改用 Docker Swarm / 外部 secret)。
