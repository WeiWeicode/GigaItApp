# 專案地圖 — GigaItApp(IT 管理系統)

> **最後更新:2026-10-07**(通知中心(Gateway NOTIFY-PLAN N3):`pages/notify/`(我的通知、公告查詢、發布公告〔Tiptap 編輯器,日後複製到入口網〕、發布紀錄、通知設定)、`components/notify/`(鈴鐺、NotifyHost、最新公告卡片、RichEditor、AudiencePicker)、`composables/notify.ts`;連線與收件匣狀態用 web-kit 0.3.0 `useNotifyCenter`;測試區實測通過(發布單位預設公司-部門、`GModal` 依開啟順序疊層、Tab 頁面須單一根節點)。2026-10-05:畫面權限模型範本:目錄 / 選單 / Tab / 按鈕登記為 BFF 權限並綁定 API(`deploy/gateway-rbac.yaml`、`api/auth.ts` 的 `IT` / `UI`);新增選單管理 `pages/system/MenuManage.vue`、部門 / 個人權限 `DeptPermissions.vue` / `UserPermissions.vue`、角色權限 `AppPermissions.vue`;圖示登記 `ui/icons.ts`。2026-10-02:改用 Gateway 單一入口、各管理頁直接呼叫 BFF 管理 API(`api/admin.ts`);itapp-api 新增經 BFF 轉入的 `/api/it/*`(`gateway/plugin.ts`);`deploy/gateway-rbac.yaml`、`gateway-routes.yaml`)。
> 開發新功能後,在同一個變更內更新本文件(`AGENT.md` §9.1、Gateway `AGENT.md` §10.7)。只寫結構與職責,細節連到 `docs/` 對應章節。

IT 部門的管理系統:`/it/`(Vue 前端)。登入走 Gateway 單一入口(web-kit);Gateway 管理與系統管理頁以使用者身分直接呼叫 BFF 管理 API(`/api/admin/*`);本系統自己的資料 `/api/it/*` 經 BFF 轉給 itapp-api(Fastify,port 51291,驗證內部 Token);端點管理經 BFF(`/api/endpoint/*`)。舊的 `/it/api/*`(自有登入)過渡期保留。

---

## 1. 目錄

```
GigaItApp/
├─ backend/                       itapp-api(Node.js + TypeScript + Fastify)
│  ├─ src/                        原始碼(建置只取這裡,tsconfig.build.json)
│  │  ├─ server.ts                進入點:載入設定、啟動
│  │  ├─ app.ts                   組裝 Fastify:auth plugin、路由、錯誤處理
│  │  ├─ config.ts                設定與部署區(dev / test / prod)檢查
│  │  ├─ errors.ts                AppError 與錯誤代碼 ERROR_CODES(ITAPP_*)
│  │  ├─ gateway/plugin.ts        經 BFF 轉入的 /api/it/*:以 BFF JWKS 驗證 X-Internal-Token(單一入口)
│  │  ├─ routes/                  介面層:it-dashboard.ts(/api/it/dashboard/*);其餘為過渡期 /it/api/*(dashboard、users、rbac、audit、bff)
│  │  │  └─ paging.ts             後端分頁與篩選共用
│  │  ├─ auth/                    過渡期自有登入(/it/api/*):Session Cookie、CSRF、密碼雜湊
│  │  ├─ rbac/                    權限核心:catalog(權限代碼、選單)、authz(職級 ∩ 部門、canManage)
│  │  ├─ bff/                     Gateway BFF 資料:BffSource 介面 + mock / live 來源、BffService(快取)
│  │  └─ store/                   資料儲存:itapp.json(store.ts)、種子資料(seed.ts;示範帳號只在 dev,test / prod 啟動時移除)
│  └─ test/                       測試(與 src 平行):app.test.ts(基本行為)、scenarios.test.ts(Gherkin @auto)、gateway.test.ts(內部 Token)
├─ frontend/                      Vue 3 + Vite(base /it/)
│  ├─ src/
│  │  ├─ main.ts、App.vue、router.ts   進入點與路由(兩層選單 → TabbedPage → Tab 子路由,懶加載)
│  │  ├─ pages/                   畫面:dashboard/、notify/(通知中心五個 Tab)、gateway/(上游、路由、發佈、權限查詢〔唯讀〕)、endpoint/、system/(人員、部門、權限設定:角色權限、角色與規則、部門權限、個人權限、試算;選單管理;稽核)、403、404、Unavailable
│  │  ├─ layouts/                 AppLayout(選單、頁首、應用切換)、TabbedPage
│  │  ├─ ui/                      全域 UI 套件:G* 元件(components/)、圖表(charts/)、tokens.css、feedback(toast / confirm)
│  │  ├─ components/              本專案專用的小元件(非全域):GherkinView(行為規格顯示)、notify/(NotifyBell 鈴鐺、NotifyHost 連線與公告閱讀對話框、LatestAnnouncements 儀表板卡片、RichEditor〔Tiptap〕、AudiencePicker)
│  │  ├─ composables/             共用邏輯:useAsync、usePaged、主題、bffRbac(角色 × 權限快取)、dashboard(儀表板各區塊資料)、apps(應用切換與應用層守衛)、notify(收件匣 center、公告閱讀對話框狀態)
│  │  ├─ api/                     http.ts(包裝 web-kit)、auth.ts(me、選單、權限代碼 IT / GW)、admin.ts(BFF 管理 API 與型別)、types、format
│  │  └─ components.d.ts          全域元件型別(新增 G* 元件時更新)
│  └─ public/                     靜態資源
├─ deploy/                        docker-compose(itapp-api、spa-it 發佈)、gateway-rbac.yaml(it.* 選單權限、it-admin 角色)、gateway-routes.yaml(itapp-api 上游與 /api/it/* 路由)、apply-gateway-rbac.sh、gen-secrets、e2e-smoke、test.env.example
├─ secrets/                       ※ 本機機密(不進版控)
└─ docs/                          PRD、ARCHITECTURE、API、UI-GUIDE、Gherkin、修正紀錄
```

## 2. 分層(Gateway `AGENT.md` §10.7.2 TypeScript / Vue 列)

| 層 | 後端 | 前端 |
| --- | --- | --- |
| 介面 | `routes/*.ts`(`it-dashboard.ts` 為 /api/it/*;其餘過渡期) | `pages/`、`layouts/`(畫面組合,不寫共用樣式) |
| 核心邏輯 | `gateway/plugin.ts`(內部 Token);過渡期 `rbac/`、`auth/plugin.ts` | `composables/`(狀態、分頁、快取、儀表板資料)、`api/auth.ts`(選單與權限判斷) |
| 基礎設施 | 過渡期 `store/`(JSON 檔)、`bff/`(mock / live 來源) | `api/http.ts`(web-kit)、`api/admin.ts`(BFF 管理 API) |
| 共用 / 工具 | `config.ts`、`errors.ts`、`routes/paging.ts` | `ui/`(無業務元件與 token)、`api/format.ts` |

## 3. 主要流程

| 流程 | 經過 |
| --- | --- |
| 登入 | `router.ts` 守衛 → `api/auth.ts` `loadMe`(web-kit `/api/auth/me`)→ 未登入 `redirectToLogin()` 到入口網 `/login?redirect=/it/...`;無 `it.app.access` → 入口網 `/` |
| 管理頁資料 | `router.ts`(`meta.permission` 選單權限 + `meta.requires` BFF 讀取權限)→ 頁面 → `composables/usePaged` / `useAsync` → `api/admin.ts` → BFF `/api/admin/*`(BFF 以使用者權限檢查、寫稽核) |
| 本系統資料 | `composables/dashboard.ts` → `/api/it/dashboard/*` → BFF 路由(`it.dashboard.read`)→ itapp-api `routes/it-dashboard.ts`(`gateway/plugin.ts` 驗證內部 Token) |
| 端點管理 | `pages/endpoint/Devices.vue` → `api/http.ts` → Gateway `/api/endpoint/*` → BFF(權限)→ Endpoint Server;itapp-api 不經手 |
| 通知與公告 | `layouts/AppLayout.vue` 的 `NotifyHost` → web-kit `useNotifyCenter('itapp')`(`/ws/notify?app=itapp`,斷線重連後查 `/api/notify/feed`)→ 鈴鐺、儀表板「最新公告」、Toast / 對話框;發布 `pages/notify/Publish.vue` → web-kit `notifyApi` → BFF `/api/notify/*`(權限 `notify.announce.*`,BFF 檢查) |
| 選單 | `api/auth.ts` 的 `MENU`(依 `it.*` ∩ `gw.admin.*` 讀取權限過濾)→ `layouts/AppLayout.vue` |

## 4. 要改什麼 → 看哪裡

| 要做的事 | 位置 |
| --- | --- |
| 新增頁面 / Tab / 按鈕 | `frontend/src/pages/<區>/`、`router.ts`(meta.permission = 選單代碼;Tab 與子路由標 Tab 代碼);選單預設值在 `frontend/src/api/auth.ts` 的 `MENU`,代碼常數 `IT`(選單)/ `UI`(Tab、按鈕);節點與綁定的 API 首次登記到 `deploy/gateway-rbac.yaml`(Gateway FRONTEND-GUIDE §7.5);之後名稱 / 排序 / 圖示 / 綁定在「選單管理」;步驟見 `docs/UI-GUIDE.md` |
| 新增權限代碼 | 選單 / Tab:`deploy/gateway-rbac.yaml`(CI rbac-test 套用);按鈕 = 呼叫的 API 權限(BFF `gw.admin.*` 或本系統 API 的權限) |
| 新增本系統 API | `backend/src/routes/<資源>.ts`(`/api/it/*`,`config: { gateway: true }`)、`deploy/gateway-routes.yaml` 登記路由並發佈,同步 `docs/API.md` |
| 呼叫 BFF 管理 API | `frontend/src/api/admin.ts`(形狀對應 Gateway `bff/src/modules/admin/*.ts`) |
| 新增錯誤代碼 | `backend/src/errors.ts` 的 `ERROR_CODES`,同步 `docs/PRD.md` §7 |
| 新增共用 UI 元件 / 顏色 | `frontend/src/ui/components/`、`ui/styles/tokens.css`(明暗兩組)、`components.d.ts`、`docs/UI-GUIDE.md` |
| 新增圖示 | `frontend/src/ui/components/GIcon.vue` 的 `ICONS` |
| BFF 新資料 | 先查 BFF 既有 API(`AGENT.md` §7.4,`/docs`)→ `frontend/src/api/admin.ts` |
| 設定值 | `backend/src/config.ts`、`backend/.env.example`、`deploy/docker-compose.yml` |

## 5. 測試地圖

| 類型 | 位置 | 指令 |
| --- | --- | --- |
| 後端基本行為 | `backend/test/app.test.ts` | `backend/`:`npm test` |
| 內部 Token(`/api/it/*`) | `backend/test/gateway.test.ts`(Gherkin `auth/gateway-sso.feature`) | 同上 |
| Gherkin `@auto` 場景 | `backend/test/scenarios.test.ts`(與 `docs/Gherkin/*.feature` 同名) | 同上 |
| 經 Gateway 的 `@e2e` | `deploy/e2e-smoke.sh` | 根目錄:`sh deploy/e2e-smoke.sh` |
| 前端 | 型別檢查 + 瀏覽器操作(`AGENT.md` §11) | `frontend/`:`npm run typecheck`、`npm run dev` |

## 6. 與設計原則的已知差異

| 項目 | 說明 |
| --- | --- |
| 測試目錄名稱 `test/` | Node.js 慣例;與原則中的 `tests/` 同義,不改名 |
| 前端沒有自動化測試 | 目前以型別檢查與瀏覽器操作驗證;新增複雜邏輯(composables)時補 `frontend/test/`(Vitest) |
| 資料儲存為 JSON 檔 | 只剩過渡期 `/it/api/*` 使用;移除過渡期 API 時一併移除 |
| 過渡期 `/it/api/*` | 自有登入、職級 × 部門權限、`bff/` 服務帳號串接仍在後端,前端已不使用;測試區驗收單一入口後移除(含 Nginx `/it/api/` 直通) |
| 沒有 `src/utils/` | 共用函式目前在 `routes/paging.ts`、`api/format.ts`;跨層共用增加時再建立 `utils/` 並更新本地圖 |
