# 專案地圖 — GigaItApp(IT 管理系統)

> **最後更新:2026-09-26**(頂列應用切換 GAppSwitcher、`composables/apps.ts`;公司環境 env 範本 `deploy/test.env.example`)。
> 開發新功能後,在同一個變更內更新本文件(`AGENT.md` §9.1、Gateway `AGENT.md` §10.7)。只寫結構與職責,細節連到 `docs/` 對應章節。

IT 部門的管理系統:`/it/`(Vue 前端)+ `/it/api/*`(itapp-api,Fastify,port 51291)。自有登入;Gateway BFF 資料由後端以服務帳號取得;端點管理由前端經 BFF(`/api/endpoint/*`)。

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
│  │  ├─ routes/                  介面層:/it/api/* 各資源(dashboard、users、rbac、audit、bff)
│  │  │  └─ paging.ts             後端分頁與篩選共用
│  │  ├─ auth/                    自有登入:Session Cookie、CSRF、密碼雜湊、/it/api/auth/*
│  │  ├─ rbac/                    權限核心:catalog(權限代碼、選單)、authz(職級 ∩ 部門、canManage)
│  │  ├─ bff/                     Gateway BFF 資料:BffSource 介面 + mock / live 來源、BffService(快取)
│  │  └─ store/                   資料儲存:itapp.json(store.ts)、種子資料(seed.ts)
│  └─ test/                       測試(與 src 平行):app.test.ts(基本行為)、scenarios.test.ts(Gherkin @auto)
├─ frontend/                      Vue 3 + Vite(base /it/)
│  ├─ src/
│  │  ├─ main.ts、App.vue、router.ts   進入點與路由(兩層選單 → TabbedPage → Tab 子路由,懶加載)
│  │  ├─ pages/                   畫面:dashboard/、gateway/、endpoint/、system/、Login、403、404
│  │  ├─ layouts/                 AppLayout(選單、頁首)、TabbedPage、ChangePasswordModal
│  │  ├─ ui/                      全域 UI 套件:G* 元件(components/)、圖表(charts/)、tokens.css、feedback(toast / confirm)
│  │  ├─ components/              本專案專用的小元件(非全域):SourceTag(BFF 來源)、GherkinView(行為規格顯示)
│  │  ├─ composables/             共用邏輯:useAsync、usePaged、主題、權限資料快取、apps(應用切換:讀 Gateway /api/auth/me)
│  │  ├─ api/                     HTTP:http.ts(/it/api)、gateway.ts(/api/endpoint/*)、auth、型別、顯示格式
│  │  └─ components.d.ts          全域元件型別(新增 G* 元件時更新)
│  └─ public/                     靜態資源
├─ deploy/                        docker-compose(itapp-api、spa-it 發佈)、gen-secrets、e2e-smoke、test.env.example(公司環境變數範本)
├─ secrets/                       ※ 本機機密(不進版控)
└─ docs/                          PRD、ARCHITECTURE、API、UI-GUIDE、Gherkin、修正紀錄
```

## 2. 分層(Gateway `AGENT.md` §10.7.2 TypeScript / Vue 列)

| 層 | 後端 | 前端 |
| --- | --- | --- |
| 介面 | `routes/*.ts`、`auth/routes.ts`(參數 schema、權限宣告、回應) | `pages/`、`layouts/`(畫面組合,不寫共用樣式) |
| 核心邏輯 | `rbac/`(有效權限、資料範圍)、`auth/plugin.ts`(身分、CSRF) | `composables/`(狀態、分頁、快取)、`api/auth.ts`(權限判斷) |
| 基礎設施 | `store/`(JSON 檔)、`bff/`(mock / live 來源) | `api/http.ts`、`api/gateway.ts` |
| 共用 / 工具 | `config.ts`、`errors.ts`、`routes/paging.ts` | `ui/`(無業務元件與 token)、`api/format.ts` |

## 3. 主要流程

| 流程 | 經過 |
| --- | --- |
| 登入 | `pages/Login.vue` → `api/http.ts` → `backend/src/auth/routes.ts` → `auth/password.ts` → Session Cookie + CSRF |
| 一般頁面資料 | `router.ts`(`meta.permission`)→ 頁面 → `composables/usePaged` / `useAsync` → `api/http.ts` → `routes/*.ts`(`config.permission`)→ `rbac/authz.ts` → `store/` 或 `bff/service.ts` |
| Gateway 視覺化 | `pages/gateway/*` → `/it/api/bff/*`(`routes/bff.ts`)→ `bff/service.ts` → mock(`mock-data.json`)或 live(以服務帳號呼叫 BFF 管理 API) |
| 端點管理 | `pages/endpoint/Devices.vue` → `api/gateway.ts` → Gateway `/api/endpoint/*` → BFF(權限)→ Go Endpoint Server;itapp-api 不經手 |
| 選單 | `/it/api/auth/me` 依權限過濾 `rbac/catalog.ts` 的 `MENUS` → `layouts/AppLayout.vue` |

## 4. 要改什麼 → 看哪裡

| 要做的事 | 位置 |
| --- | --- |
| 新增頁面 | `frontend/src/pages/<區>/`、`router.ts`(meta);選單在 `backend/src/rbac/catalog.ts` 的 `MENUS`;步驟見 `docs/UI-GUIDE.md` |
| 新增權限代碼 | `backend/src/rbac/catalog.ts` 的 `PERMISSIONS` |
| 新增 API | `backend/src/routes/<資源>.ts`(`app.ts` 註冊),同步 `docs/API.md`、前端 `api/types.ts` |
| 新增錯誤代碼 | `backend/src/errors.ts` 的 `ERROR_CODES`,同步 `docs/PRD.md` §7 |
| 新增共用 UI 元件 / 顏色 | `frontend/src/ui/components/`、`ui/styles/tokens.css`(明暗兩組)、`components.d.ts`、`docs/UI-GUIDE.md` |
| 新增圖示 | `frontend/src/ui/components/GIcon.vue` 的 `ICONS` |
| BFF 新資料 | 先查 BFF 既有 API(`AGENT.md` §7.4)→ `backend/src/bff/types.ts`、`mock.ts`、`live.ts` |
| 設定值 | `backend/src/config.ts`、`backend/.env.example`、`deploy/docker-compose.yml` |

## 5. 測試地圖

| 類型 | 位置 | 指令 |
| --- | --- | --- |
| 後端基本行為 | `backend/test/app.test.ts` | `backend/`:`npm test` |
| Gherkin `@auto` 場景 | `backend/test/scenarios.test.ts`(與 `docs/Gherkin/*.feature` 同名) | 同上 |
| 經 Gateway 的 `@e2e` | `deploy/e2e-smoke.sh` | 根目錄:`sh deploy/e2e-smoke.sh` |
| 前端 | 型別檢查 + 瀏覽器操作(`AGENT.md` §11) | `frontend/`:`npm run typecheck`、`npm run dev` |

## 6. 與設計原則的已知差異

| 項目 | 說明 |
| --- | --- |
| 測試目錄名稱 `test/` | Node.js 慣例;與原則中的 `tests/` 同義,不改名 |
| 前端沒有自動化測試 | 目前以型別檢查與瀏覽器操作驗證;新增複雜邏輯(composables)時補 `frontend/test/`(Vitest) |
| 資料儲存為 JSON 檔 | 基本框架階段;上正式區前改接資料庫(`AGENT.md` §7.5) |
| 沒有 `src/utils/` | 共用函式目前在 `routes/paging.ts`、`api/format.ts`;跨層共用增加時再建立 `utils/` 並更新本地圖 |
