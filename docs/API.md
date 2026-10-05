# IT 管理系統 — API 規格(itapp-api)

> **2026-10-02 起前端改用 Gateway 單一入口**(giga-Portal PRD I1–I4):
> - 管理資料直接呼叫 Gateway BFF 管理 API `/api/admin/*`(Gateway PRD §8.7;呼叫與型別集中在 `frontend/src/api/admin.ts`),不再經 itapp-api。
> - 本系統自己的資料為 **§0 `/api/it/*`**,經 BFF 路由表轉給 itapp-api。
> - §1 之後的 `/it/api/*`(自有登入)為**過渡期保留**,前端已不使用,測試區驗收後移除。
> - **權限(2026-10-05 起)**:選單 / Tab / 按鈕改為 Gateway BFF 的權限節點並綁定 API(Gateway PRD §8.3.2、FRONTEND-GUIDE §7.5),設定在「選單管理」「權限設定」(BFF `/api/admin/permissions`、`/dept-permissions`、`/user-permissions`)。本文件 §1 之後的職級 × 部門權限 API(`/it/api/rbac/*` 等)同屬**過渡期**,僅供參考。
>
> 行為驗收見 [Gherkin/](Gherkin/README.md)。

## 0. 經 Gateway BFF 轉入的 API(`/api/it/*`)

| 項目 | 規則 |
| --- | --- |
| 呼叫方式 | 瀏覽器呼叫 `https://<gateway-host>/api/it/...`;BFF 依路由表(`deploy/gateway-routes.yaml`)檢查權限後轉給 `itapp-api:51291`,附 `X-Internal-Token` |
| 驗證 | 只接受 `X-Internal-Token`(ES256、`iss = giganexus-bff`、`aud = itapp-api`,公鑰取自 `GW_JWKS_URL`);缺少或無效回 401 `ITAPP_INTERNAL_TOKEN_INVALID`(`backend/src/gateway/plugin.ts`) |
| 權限 | 由 BFF 路由檢查(下表「Gateway 權限」),itapp-api 不再檢查 |

| 方法 | 路徑 | Gateway 路由 / 權限 | 說明 |
| --- | --- | --- | --- |
| GET | `/api/it/dashboard/overview` | `it.dashboard.overview` / `it.dashboard.read` | `{ generatedAt, mockSections, kpis[], traffic[], alerts[] }`(監控整合開發中,目前為空清單) |
| GET | `/api/it/dashboard/work` | `it.dashboard.work` / `it.dashboard.read` | `{ generatedAt, mockSections, tickets[] }`(工單整合開發中,目前為空清單) |

儀表板的 Gateway 統計、部門人數、最近操作改由前端直接讀 BFF 管理 API(`frontend/src/composables/dashboard.ts`)。

---

以下為過渡期保留的自有登入 API:所有路徑在 `/it/api` 之下(Nginx 直通 itapp-api)。型別定義見 `backend/src/bff/types.ts`。

## 1. 共通規則

| 項目 | 規則 |
| --- | --- |
| 驗證 | Cookie `it_at`(登入時設定);未宣告 `public` 的 API 一律需要 |
| CSRF | `POST` / `PUT` / `PATCH` / `DELETE` 帶 `X-CSRF-Token: <it_csrf Cookie>`(登入、登出除外) |
| 權限 | 下表「權限」欄;缺少時 403 `ITAPP_PERMISSION_DENIED`,`details.permission` 為所需權限 |
| 格式 | JSON;請求 body 上限 1 MB;未定義的欄位回 400 |
| 追蹤 | 回應標頭 `X-Request-Id`(沿用 Nginx 產生的值) |
| 錯誤 | `{ code, message, requestId, details? }`,代碼見 [PRD.md](PRD.md) §7 |
| 快取 | 回應一律 `Cache-Control: no-store`;BFF 讀取 API 可帶 `?refresh=1` 略過 30 秒快取 |
| 分頁 | 清單 API 一律由後端篩選與分頁:`page`(從 1 開始)、`pageSize`(各 API 有上限),回應 `{ items, total, page, pageSize }`;前端不一次下載全部資料 |

## 2. 端點一覽

| 方法 | 路徑 | 權限 | 說明 |
| --- | --- | --- | --- |
| GET | `/healthz` | public | `{ status, env, bffMode }` |
| POST | `/auth/login` | public | 登入 |
| POST | `/auth/logout` | public | 登出(204) |
| GET | `/auth/me` | 登入 | 目前使用者 |
| POST | `/auth/password` | 登入 | 變更自己的密碼 |
| GET | `/dashboard/overview` | `dashboard.view` | 儀表板:KPI、流量、告警 |
| GET | `/dashboard/work` | `dashboard.view` | 儀表板:近期工單、最近操作 |
| GET | `/dashboard/gateway` | `dashboard.view` | 儀表板:Gateway 統計(讀 BFF)、上游 p95 |
| GET | `/dashboard/team` | `dashboard.view` | 儀表板:各部門成員與工單 |
| GET | `/bff/overview` | `bff.route.read` | 上游、限流政策、線上版本 |
| GET | `/bff/routes?q=&system=&upstream=&authMode=&status=&permission=&page=&pageSize=` | `bff.route.read` | 路由清單(篩選 + 分頁,pageSize ≤ 500) |
| GET | `/bff/releases?page=&pageSize=` | `bff.route.read` | 發佈版本(由新到舊分頁,pageSize ≤ 50,預設 10) |
| POST | `/bff/releases` | `bff.route.publish` | 發佈草稿(live 回 501) |
| GET | `/bff/rbac` | `bff.rbac.read` | 角色、權限、角色權限、AD 群組、公司 |
| GET | `/bff/rbac/who-can-access?permission=` | `bff.rbac.read` | 權限反查 |
| PUT | `/bff/rbac/roles/:role/permissions` | `bff.rbac.edit` | 設定 BFF 角色權限(live 回 501) |
| GET | `/users?q=&dept=&level=&page=&pageSize=` | `sys.user.read` | 人員(依資料範圍,篩選 + 分頁,pageSize ≤ 100) |
| POST | `/users` | `sys.user.create` | 新增人員 |
| PATCH | `/users/:id` | `sys.user.edit` | 編輯人員 |
| POST | `/users/:id/disable`、`/users/:id/enable` | `sys.user.disable` | 停用 / 啟用 |
| POST | `/users/:id/reset-password` | `sys.user.reset-password` | 重設密碼 |
| GET | `/departments` | `sys.dept.read` | 部門與人數 |
| POST | `/departments` | `sys.dept.edit` | 新增部門 |
| PATCH | `/departments/:code` | `sys.dept.edit` | 編輯部門 |
| GET | `/rbac/catalog` | `sys.perm.read` | 權限目錄與目前設定 |
| GET | `/rbac/preview?level=&dept=` | `sys.perm.read` | 權限試算 |
| PUT | `/rbac/levels/:level/permissions` | `sys.perm.edit` | 設定職級權限 |
| PUT | `/rbac/permissions/:code/departments` | `sys.perm.edit` | 設定部門限制 |
| GET | `/audit?type=&q=&page=&pageSize=` | `sys.audit.read` | 稽核紀錄 |

## 3. 登入與 Session

### POST `/auth/login`
```jsonc
// 請求
{ "username": "S100001", "password": "Passw0rd!" }   // username 1–64、password 1–256;工號不分大小寫
// 200:me(同 GET /auth/me),並 Set-Cookie it_at、it_csrf
```
| 狀態 | code | 情況 |
| --- | --- | --- |
| 401 | `ITAPP_LOGIN_FAILED` | 帳號不存在或密碼錯誤 |
| 403 | `ITAPP_ACCOUNT_DISABLED` | 已停用 |
| 423 | `ITAPP_ACCOUNT_LOCKED` | 連續 5 次失敗,15 分鐘內 |

### GET `/auth/me`
```jsonc
{
  "user": { "id": 2, "employeeNo": "S100001", "name": "陳主管", "email": "s100001@example.test", "title": "經理", "lastLoginAt": "2026-09-25T06:30:00.000Z" },
  "department": { "code": "SYS", "name": "系統課" },
  "level": { "code": "manager", "name": "主管", "rank": 30 },
  "permissions": ["bff.rbac.edit", "bff.rbac.read", "..."],
  "menus": [{ "key": "overview", "title": "總覽", "icon": "dashboard", "children": [{ "key": "dashboard", "title": "儀表板", "path": "/dashboard", "permission": "dashboard.view" }] }],
  "dataScope": "dept"
}
```

### POST `/auth/password`
`{ "currentPassword": "...", "newPassword": "..." }` → 200 `{ ok: true }`,並換發 Cookie。目前密碼錯誤或新密碼不符政策(至少 8 碼、含英文字母與數字)回 400。

## 4. 儀表板

依區塊拆成 4 支 API,前端依 Tab 與捲動位置按需呼叫(懶加載);只有 `/dashboard/gateway` 會讀 BFF,BFF 無法連線時只有這支回 502,其他區塊不受影響。每支回應都有 `mockSections` 標示模擬區塊。

| API | 呼叫時機 | 回應主體 |
| --- | --- | --- |
| `GET /dashboard/overview` | 「營運總覽」Tab 開啟時 | `{ kpis: [{ key, label, value, unit, delta, trend[14], tone }], traffic: [{ hour, requests, errors }], alerts: [{ level, title, at }] }` |
| `GET /dashboard/work` | 捲動到「近期工單 / 最近操作」附近時 | `{ tickets: [{ id, title, dept, deptName, priority, status, updatedAt }], activity: AuditEntry[], activityScope: 'all' \| 'self' }` |
| `GET /dashboard/gateway` | 切到「Gateway 概況」Tab 時 | `{ gateway: { source, upstreams, routes, published, draft, deprecated, permissions, roles, liveVersion, bySystem, byAuthMode }, services: [{ code, name, system, p95, availability, status }] }` |
| `GET /dashboard/team` | 切到「團隊工作」Tab 時 | `{ departments: [{ code, name, members, open, closed }] }` |

## 5. Gateway BFF

所有回應含 `source`(`mock` / `live`)與 `fetchedAt`。live 模式 BFF 錯誤回 502 `ITAPP_BFF_UNAVAILABLE`,`details = { bffStatus, bffCode, bffRequestId }`。

| API | 回應主體 |
| --- | --- |
| `GET /bff/overview` | `{ upstreams: [{ code, name, systemCode, timeoutMs, targets: [{ baseUrl, environment }], routes: { published: 13 } }], policies: [{ code, limitCount, windowSec, keyBy }], release: { liveVersion, redisVersion, draftRoutes } }` |
| `GET /bff/routes` | `{ items: [{ routeCode, name, systemCode, method, publicPath, routeType, upstream, project, upstreamPath, authMode, permissionCode, status, tags, description, gherkin }], total, page, pageSize, facets: { systems, upstreams, totalAll } }`;`project` 為開發專案(下游 repo 資料夾名稱,未登記或非 proxy 路由為 `null`)、`gherkin` 為行為規格(皆取自 BFF 路由查詢,Gateway PRD v0.6);篩選:`q`(代碼 / 名稱 / 路徑 / 權限 / 標籤 / 開發專案)、`system`、`upstream`、`authMode`、`status`、`permission`。BFF 路由查詢本身不分頁,itapp-api 快取整份後分頁;`facets` 供下拉選單使用 |
| `GET /bff/releases` | `{ items: [{ releaseId, note, publishedBy, publishedAt, rolledBackFrom, diff: { added, modified, removed, upstreamsChanged, policiesChanged } }], total, page, pageSize }`;live 模式直接向 BFF 取該頁 |
| `POST /bff/releases` | 請求 `{ note }`(1–200);回應 `{ release }`;live → 501 `ITAPP_BFF_NOT_SUPPORTED` |
| `GET /bff/rbac` | `{ roles: [{ code, name, description, isSystem }], permissions: [{ code, name, systemCode, description }], rolePermissions: [{ role, permission }], roleAdGroups: [{ role, adGroupDn }], roleCompanies: [{ role, company }] }` |
| `GET /bff/rbac/who-can-access` | `{ permission, exists, name?, roles: [{ code, name, everyone, adGroups, companies, users }] }` |
| `PUT /bff/rbac/roles/:role/permissions` | 請求 `{ permissions: string[] }`(≤ 500);角色不存在 404、權限不存在 400(`details.unknown`);live → 501 |

## 6. 人員與部門

### GET `/users`
`{ scope: 'all' | 'dept', items: UserRow[], total, page, pageSize, levels: Level[], departments: Department[] }`;篩選 `q`(工號 / 姓名 / Email / 職稱)、`dept`、`level`,資料範圍外的條件只會得到 0 筆;`UserRow` 不含密碼雜湊與 tokenVersion。

### POST `/users`
```jsonc
// 請求
{ "employeeNo": "T100001", "name": "測試網管", "email": null, "title": null, "deptCode": "NET", "level": "engineer" }
// 201
{ "user": { /* UserRow */ }, "tempPassword": "Xk3...a7" }   // 12 碼,只回傳這一次
```
| 狀態 | code | 情況 |
| --- | --- | --- |
| 400 | `ITAPP_VALIDATION_FAILED` | 工號格式(`^[A-Za-z0-9_-]{3,20}$`)、部門不存在 |
| 403 | `ITAPP_DATA_ACCESS_DENIED` | 非自己部門,或職級不低於自己(admin 除外) |
| 409 | `ITAPP_CONFLICT` | 工號已存在(不分大小寫) |

### PATCH `/users/:id`
可改 `name`、`email`、`title`、`deptCode`、`level`(至少一項)。變更前後都需符合資料範圍。

### POST `/users/:id/disable` | `enable` | `reset-password`
停用會讓對方 Session 立即失效;不能停用自己(400)。重設密碼回 `{ tempPassword }`。

### 部門
- `GET /departments` → `{ items: [{ code, name, description, leadEmployeeNo, leadName, memberCount, byLevel: { admin, manager, senior, engineer } }] }`(只算啟用中成員)
- `POST /departments` `{ code: ^[A-Z][A-Z0-9]{1,9}$, name, description?, leadEmployeeNo? }` → 201;重複 409、主管工號不存在 400
- `PATCH /departments/:code` `{ name?, description?, leadEmployeeNo? }`

## 7. 角色與按鈕權限

| API | 說明 |
| --- | --- |
| `GET /rbac/catalog` | `{ levels, modules, departments, permissions: [{ code, name, module, type: 'page'|'button', description }], levelPermissions: { admin(全部), manager, senior, engineer }, deptRestrictions, menus }` |
| `GET /rbac/preview?level=senior&dept=SEC` | `{ permissions, menus }`(與實際登入計算相同) |
| `PUT /rbac/levels/:level/permissions` | `{ permissions: string[] }`;`admin` 回 400;不存在的代碼 400(`details.unknown`) |
| `PUT /rbac/permissions/:code/departments` | `{ departments: string[] }`;空陣列 = 不限部門;部門不存在 400 |

## 8. 稽核

### GET `/audit`
參數:`type=operation|login`、`q`(比對 actor / action / target / detail)、`page`(≥ 1)、`pageSize`(1–100,預設 20)。
回應:`{ items: [{ id, at, type, actor, action, target, result: 'success'|'failure', detail, ip }], total, page, pageSize }`,由新到舊。

`action` 一覽:`login`、`logout`、`password.change`、`user.create|update|disable|enable|reset-password`、`dept.create|update`、`rbac.level.update`、`rbac.dept-restriction.update`、`bff.release.publish`、`bff.rbac.update`(中文對照見前端 `ACTION_LABEL`)。
