# GigaNexus IT 管理系統(GigaItApp)

IT 部門自己的管理系統,掛在 Gateway 的 `/it/`,**登入走 Gateway 單一入口**(`@giganexus/web-kit`),各管理頁以使用者身分直接呼叫 BFF 管理 API。
也是**畫面權限模型的範本**:目錄 / 選單 / Tab / 按鈕都登記為 BFF 權限,每個節點綁定它用到的 API(Gateway PRD §8.3.2、FRONTEND-GUIDE §7.5)。

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
                   ├─ /it/*        ─▶ SPA(frontend)
                   └─ /api/*       ─▶ BFF:/api/auth/*(單一入口)、/api/admin/*(管理 API)、/api/it/* ─▶ itapp-api:51291(內部 Token)
```

| 目錄 | 內容 |
| --- | --- |
| `backend/` | itapp-api:Fastify 5 + TypeScript;`auth/` 登入與 Session、`rbac/` 職級 / 權限 / 選單、`bff/` BFF mock / live 來源、`routes/` API、`store/` JSON 資料檔 |
| `frontend/` | Vue 3 + Vite;`ui/` 全域 UI 套件(G* 元件、圖表、tokens)、`layouts/` 框架與 TabbedPage、`pages/` 各頁 |
| `deploy/` | `docker-compose.yml`(itapp-api 加入 Gateway 網路、spa-it 發佈)、`gen-secrets.sh` |
| `docs/` | PRD、架構、API、UI 規範、Gherkin、修正紀錄(`DevelopmentProcess/`) |

## 選單與權限

側欄大項、選單、Tab、按鈕都是 BFF 的權限節點,首次登記在 [`deploy/gateway-rbac.yaml`](deploy/gateway-rbac.yaml)(CI 套用),之後由 IT 在 **系統管理 › 選單管理** 調整名稱、排序、圖示、上層與綁定的 API;前端代碼常數在 `frontend/src/api/auth.ts`(選單 `IT.*`、Tab / 按鈕 `UI.*`)。

| 目錄(group) | 選單(menu) | Tab | 按鈕(綁定的 API) |
| --- | --- | --- | --- |
| 總覽 | 儀表板 `it.dashboard.read` | 營運總覽 / Gateway 概況 / 團隊工作 | — |
| Gateway 管理 | 服務與路由 `it.gw-service.read` | 上游服務 / API 路由 / 發佈版本 | 新增 / 編輯上游(`upstream.write`)、新增 / 編輯 / 停用路由(`route.write`)、發佈 / 回滾(`release`) |
| | 權限查詢 `it.gw-rbac.read`(唯讀) | 角色權限總覽 / 誰能存取 / 關係圖 | — |
| 端點管理 | 電腦清單 `it.endpoint-device.read` | 電腦清單 | — |
| 系統管理 | 人員與部門 `it.sys-user.read` | 人員 / 部門 | 調整個別角色、強制登出、停用 / 啟用(`user.write`) |
| | 權限設定 `it.sys-role.read` | 角色權限 / 角色與指派規則 / 部門權限 / 個人權限 / 權限試算 | 各 Tab 的編輯(`rbac.write`) |
| | 選單管理 `it.sys-menu.read` | 選單 / Tab / 按鈕 | 新增 / 編輯 / 刪除(`rbac.write`) |
| | 稽核紀錄 `it.sys-audit.read` | 操作紀錄 / 登入紀錄 | — |

(API 權限為 `gw.admin.*` 的簡寫。)

## 權限模型

- **授予畫面節點 = 一併取得它綁定的 API**:選單綁該頁的讀取 API,Tab 綁該 Tab 用到的 API,按鈕綁它呼叫的寫入 API。BFF 仍以 API 權限檢查。
- **授予方式**(系統管理 › 權限設定):角色(可依公司、部門〔含下層〕、職級、職稱、AD 群組自動指派)、部門(含下層、職級門檻:全員 / 課級 / 理級 / 處級以上)、個人(預設永久,可設到期日);有效權限取聯集。
- **可見規則**:選單 = 選單權限 ∩ 該頁讀取權限 ∩ 至少一個可看的 Tab;Tab = Tab 權限;按鈕 = 按鈕權限;目錄依下層顯示。
- 角色 `it-admin` 擁有本系統全部節點(yaml 整組管理,畫面上修改會在下次部署被覆寫)。

## 舊版自有登入的測試帳號(過渡期 `/it/api/*`,虛構資料,dev 密碼 `Passw0rd!`)

下表的示範帳號(`itadmin` 除外)**只在 dev 建立**;測試區、正式區只有 `itadmin` 與實際 IT 人員(`IT_STAFF`),既有資料檔在啟動時會自動移除示範帳號(工號與姓名都和種子相同才移除),指向他們的部門主管改為未指定。

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
- **儀表板**:KPI、流量、工單、告警、服務延遲之模擬資料已清空,前端保留卡片並標示「開發中」;Gateway 統計、部門人數、最近操作為真實資料。
- **資料儲存**:JSON 檔、單一實例(登出黑名單在記憶體);多實例或正式上線前需改接資料庫。
- Linux 主機部署時,`secrets/*` 權限為 600,需確認容器內 `node` 使用者可讀(或改用 Docker Swarm / 外部 secret)。
