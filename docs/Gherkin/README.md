# IT 管理系統 — Gherkin 行為規格

> 以 Gherkin(繁體中文關鍵字,`# language: zh-TW`)描述 IT 管理系統的驗收行為,對應 [PRD.md](../PRD.md) **v0.1**。
>
> **過渡期標示(2026-10-05)**:除 `auth/gateway-sso.feature` 外,各檔描述 v0.1 自有登入與自有權限(`/it/api/*`、職級 × 部門限制),前端已改用 Gateway 單一入口與畫面權限模型(Gateway PRD §8.3.2、FRONTEND-GUIDE §7.5;本系統 PRD v0.3)。這些檔案保留到測試區驗收後隨 `/it/api/*` 移除;新模型的行為規格之後另寫。
> 寫法沿用 Gateway 專案 `docs/Gherkin/README.md`;場景以**可觀察的行為**(HTTP 狀態、`code`、Cookie、畫面)描述,不描述實作細節。

## 檔案一覽

| 檔案 | 內容 | PRD | 狀態 |
| --- | --- | --- | --- |
| `auth/login.feature` | 自有帳號登入、鎖定、登入紀錄、示範帳號 | §6.1 | 過渡期 |
| `auth/session.feature` | Session Cookie、CSRF、自動換發、登出、停用即失效、變更密碼 | §6.1 | 過渡期 |
| `auth/gateway-sso.feature` | Gateway 單一入口、`/api/it/*` 只信任內部 Token、管理操作以本人身分寫入 BFF(v0.2) | giga-Portal PRD §9.2 | 現行 |
| `rbac/effective-permission.feature` | 有效權限 = 職級 ∩ 部門限制、選單過濾 | §6.2 | 過渡期 |
| `rbac/permission-settings.feature` | 職級權限、部門限制、權限試算 | §6.2 | 過渡期 |
| `system/users.feature` | 人員資料範圍、新增 / 停用 / 重設密碼 | §6.3 | 過渡期 |
| `system/departments.feature` | 部門維護 | §6.3 | 過渡期 |
| `system/audit.feature` | 操作紀錄、登入紀錄 | §6.3 | 過渡期 |
| `bff/bff-read.feature` | BFF 上游 / 路由 / 發佈版本 / 角色權限的讀取與視覺化、mock / live、BFF 無法連線 | §6.4 | 過渡期 |
| `bff/bff-write.feature` | BFF 角色權限設定與發佈:mock 寫入、live 明確拒絕 | §6.4 | 過渡期 |
| `dashboard/dashboard.feature` | 首頁儀表板、模擬資料標示 | §6.5 | 過渡期 |
| `endpoint/devices.feature` | 端點管理:經 Gateway BFF 取得 Agent 清單、Gateway 登入與同一工號檢查 | §6.8 | 過渡期 |
| `endpoint/device-inventory.feature` | 端點管理:電腦清單顯示 Agent 回報的基本資訊、點列開詳情(RustIt ItAgentBack) | §6.8 | 現行 |
| `ui/navigation.feature` | 兩層選單、頁內 Tab、403 / 404、明亮 / 黑暗、手機寬度 | §6.6 | 過渡期 |
| `gateway/nginx-entry.feature` | 經 Gateway Nginx 的 `/it/`、`/it/api/`、登入限流、502 | §6.7 | 過渡期 |

## 標籤慣例

| 標籤 | 意義 | 如何驗證 |
| --- | --- | --- |
| `@v0.1` | 本版本範圍 | — |
| `@auto` | 已有自動化測試 | `cd backend && npm test`(`test/scenarios.test.ts` 以「feature 檔 / 場景」命名,`test/app.test.ts` 為基本行為) |
| `@e2e` | 需經 Gateway Nginx 的環境 | `sh deploy/e2e-smoke.sh`(`STOP_API=1` 另驗 502) |
| `@manual` | 畫面行為,以瀏覽器操作驗證 | `npm run dev` 或 `npm run dev:gw`,依場景步驟操作;結果記入 `docs/DevelopmentProcess/` |
| `@security` | 安全相關,修改登入 / 權限時必跑 | — |
| `@wip` | 規格已定、尚未實作 | 不列入驗收 |

同一場景可同時有 `@auto` 與 `@manual`(API 行為自動化,畫面另以瀏覽器確認)。

## 撰寫原則

- 關鍵字使用 zh-TW 官方詞彙:`功能`、`背景`、`場景`、`場景大綱`、`例子`、`假如`、`當`、`那麼`、`而且`、`但是`;`Rule:` 沒有中文關鍵字。
- 主機位址以 `GATEWAY_IP` 表示;帳號使用種子資料(`backend/src/store/seed.ts`,虛構資料),不使用真實個資。
- 數值(Session 8 小時、鎖定 5 次 / 15 分、快取 30 秒、密碼至少 8 碼)與 PRD 一致;PRD 變更時同步修改本目錄與測試。
- 新增 `@auto` 場景時,在 `backend/test/scenarios.test.ts` 對應的 `describe('<feature 檔>')` 內新增同名測試。
