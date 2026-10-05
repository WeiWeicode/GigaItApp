# IT 管理系統 — 前端 UI 規範

> **UI 全域套用**:所有頁面只組合 `src/ui/` 的全域元件與設計 token,不在頁面裡各自刻按鈕、卡片、表格、表單、對話框的樣式。
> 對應 [PRD.md](PRD.md) §6.6;AI 協作規則見 [../AGENT.md](../AGENT.md) §8。

---

## 1. 風格

| 元素 | 做法 |
| --- | --- |
| 玻璃擬態 | 半透明底(`--glass*`)+ `backdrop-filter: blur()`(`--glass-blur`)+ 1px 邊框(`--glass-border`) |
| 細緻線性邊框 | `.glass-edge`:以遮罩畫出 1px 漸層邊(`--glass-highlight`) |
| 漸層光暈 | 背景三個品牌色光暈 + 淡網格(`body::before/::after`);卡片 `glow` 在右上角加 tone 色光暈;主要按鈕帶 `--shadow-glow` |
| 品牌色 | 靛 `#6366f1` → 紫 `#a855f7` → 青 `#22d3ee`(`--grad-brand`) |
| 字型 | 系統字型堆疊(Inter / Noto Sans TC / PingFang TC / 微軟正黑體);CSP 不允許外部字型 |

## 2. 設計 Token(`ui/styles/tokens.css`)

- 主題:`<html data-theme="light|dark">`;**每個顏色 token 明亮、黑暗都要定義**。頁面不寫死色碼。
- 語意色:`--c-primary / info / success / warning / danger / cyan / violet`;元件以 `class="tone-xxx"` 取得 `--tone`。
- 圖表色:`--chart-1` … `--chart-8`(`ui/charts/palette.ts` 的 `chartColor(i)`、`toneColor(tone)`)。
- 尺寸:`--radius-*`、`--space-*`、`--fs-*`、`--sidebar-w`、`--topbar-h`;動畫 `--ease`、`--dur`。

## 3. 全域元件(`app.use(ui)` 後可直接使用,不需 import)

| 元件 | 用途 | 主要 props / 用法 |
| --- | --- | --- |
| `GButton` | 按鈕 | `variant` primary / secondary / ghost / danger、`size` sm / md / lg、`icon`、`iconRight`、`loading`、`square`、`block` |
| `GCard` | 玻璃卡片 | `title`、`subtitle`、`icon`、`tone`、`glow`、`padding` none / sm / md / lg、`interactive`;slot `header`、`actions`、`footer` |
| `GStatCard` | KPI 卡 | `label`、`value`、`unit`、`delta`、`deltaUnit`、`trend`、`tone`、`icon`、`invert`(數值下降為好事) |
| `GPageHeader` | 頁首 | `title`、`description`、`icon`、`eyebrow`(一般由 `TabbedPage` 產生) |
| `GTabs` | 頁籤 | `items: { label, to?, value?, icon?, permission?, count? }[]`;有 `to` 為路由模式,否則 `v-model` |
| `GTable` | 資料表 | `columns: { key, label, width?, align?, sortable?, mono?, hideSm? }[]`、`rows`、`rowKey`、`loading`、`pageSize`(0 = 不分頁)、`total` + `v-model:page`(server 分頁;此時忽略 `sortable`,因為只有一頁資料)、`clickable` → `@row-click`;儲存格 slot `#cell-{key}="{ row }"` |
| `GInput` | 文字輸入 | `v-model`、`label`、`icon`、`type`(password 自動附顯示切換)、`error`、`hint`、`clearable`、`size` md / lg |
| `GSelect` | 下拉 | `v-model`、`options: { label, value }[]`、`placeholder`(空值選項)、`label`、`icon` |
| `GSwitch` / `GCheckbox` | 開關 / 核取 | `v-model`、`label` 或 `ariaLabel`、`disabled`、`size` |
| `GSegmented` | 小型篩選 | `v-model`、`options: { label, value, icon? }[]`、`size` |
| `GBadge` | 標籤 | `tone`、`variant` soft / outline / solid、`dot`、`icon`、`mono` |
| `GModal` | 對話框 | `v-model:open`、`title`、`subtitle`、`icon`、`tone`、`width`、`persistent`;slot `footer` |
| `GEmpty` | 空狀態 / 錯誤 | `icon`、`title`、`description`、`tone`(載入失敗用 danger,slot 放「重試」) |
| `GSkeleton` | 載入骨架 | `lines` 或 `height` |
| `GAvatar` / `GLogo` | 頭像 / 品牌標誌 | `name`、`size` |
| `GAppSwitcher` | 應用切換(頂列帳號旁) | `apps: { code, name, basePath, icon }[]`、`current`、`derived`;一個以下不顯示,點選整頁導向;**與 `../giga-Portal/frontend/src/ui/components/GAppSwitcher.vue` 同一版本,兩邊同步修改** |
| `GProgress` | 進度條 | `value`、`max`、`tone`,或多段 `segments: { value, tone, label? }[]` |
| `GIcon` | 圖示 | `name`(在 `GIcon.vue` 的 `ICONS` 登記)、`size`、`stroke` |
| 圖表 | `GSparkline`(趨勢)、`GAreaChart`(時間序列,含 tooltip)、`GBarList`(分類比較)、`GDonut`(組成,≤ 8 類)、`GRing`(單一比例) | 顏色自動取 palette |
| `GLazy` | 懶加載區塊 | 捲動到接近可視範圍(`rootMargin`,預設上下 200px)才渲染預設 slot;`#placeholder` 放骨架;`minHeight` 保留高度避免跳動 |
| `GFeedbackHost` | toast / confirm 容器 | 只放在 `App.vue` |

提示與確認:`import { toast, confirm } from '@/ui'`
```ts
toast.success('已儲存');  toast.fromError(e, '儲存失敗');   // fromError 附 requestId
if (!(await confirm({ title: '停用?', message: '...', tone: 'danger', confirmText: '停用' }))) return;
```

## 4. 懶加載

| 層級 | 做法 | 例子 |
| --- | --- | --- |
| 程式碼 | 所有頁面在 `router.ts` 以 `() => import()` 載入,打包成獨立 chunk,進到該頁才下載 | 全部 19 個頁面 |
| Tab | 每個 Tab 是子路由,切到該 Tab 才掛載、才呼叫它的 API | 儀表板三個 Tab 各自呼叫 `/dashboard/overview`、`/gateway`、`/team` |
| 清單 | `usePaged`:後端篩選 + 分頁,每次只取一頁;篩選變更 300 ms 防抖後回第 1 頁 | API 路由、人員、稽核 |
| 捲動 | `<GLazy>`:首屏以外的區塊捲動到附近才掛載 | 儀表板「近期工單 / 最近操作」 |
| 追加載入 | 「載入更多」逐頁追加 | 發佈歷程(每次 10 筆) |
| 按需查詢 | 對話框選項、明細在打開時才查 | 部門主管候選人、權限反查的相關 API |

```ts
const filters = reactive({ q: '', dept: '' });
const list = usePaged<UserRow, UserPage>((page, pageSize) => http.get('/users', { query: { ...filters, page, pageSize } }), {
  pageSize: 10,
  watch: () => ({ ...filters }),
});
// <GTable :rows="list.items.value" :total="list.total.value" v-model:page="list.page.value" :page-size="10" />
```

## 5. 側邊欄

- 兩層選單:群組可展開 / 收合,目前頁面以亮點標示。
- **收合時**只顯示群組圖示;滑鼠移到圖示(或鍵盤 Tab 聚焦、點擊)會在右側**浮出**該群組的功能清單,可直接點選;移開、按 Esc 或換頁即關閉。收合狀態記在瀏覽器(個人偏好)。
- 寬度 ≤ 960px 改為抽屜,不使用浮出選單。

## 6. 權限在畫面上的用法

| 情境 | 寫法 |
| --- | --- |
| 按鈕 | `<GButton v-can="UI.userDisable">` 或 `v-if="can(UI.xxx)"`(按鈕代碼 `UI.*`,不要直接用 API 代碼);`v-can:disable` 改為停用並提示 |
| 條件顯示 | 模板 `$can(code)`;script `import { can, UI } from '@/api/auth'` |
| 頁面 | 路由 `meta.permission` = 選單代碼 `IT.*`(另以 `meta.requires` 列該頁的 BFF 讀取權限);缺少時導向 `/403` |
| Tab | `meta.tabs` 的 item 與子路由 `meta` 都標 Tab 代碼 `UI.*`;目前 Tab 沒權限時自動改到同頁第一個可看的 Tab |
| 名稱 / 圖示 | 側欄、頁首、Tab 標籤以 BFF 為準(`menuTitle()` / `menuIcon()`,資料來自 `/api/auth/me` 的 `menus`);前端文字只是預設值 |

每個選單 / Tab / 按鈕都要在 `deploy/gateway-rbac.yaml` 登記並以 `includes` 綁定它用到的 BFF API(Gateway FRONTEND-GUIDE §7.5);前端權限只是體驗,**BFF 一定再以 API 權限檢查**。

## 7. 新增一個頁面

1. 決定放在哪個目錄(側欄大項)與功能頁;在 `deploy/gateway-rbac.yaml` 登記選單 / Tab / 按鈕(`kind`、`parent`、`sort`、`includes` 綁定的 API),並把代碼加到 `frontend/src/api/auth.ts` 的 `IT` / `UI`、`MENU`;角色 `it-admin` 的清單一併加入。
2. `router.ts`:功能頁用 `TabbedPage`,`meta` 填 `permission`、`title`、`description`、`icon`、`tabs`;每個 Tab 是子路由(`meta.tab`)。
3. 頁面:單筆 / 小量資料用 `useAsync(() => http.get(...))`;**清單用 `usePaged`(後端分頁)**;首屏以外的區塊包 `<GLazy>`、由子元件自己載入資料;載入中用 `GSkeleton`,錯誤用 `<GEmpty tone="danger">` + 重試;頁首按鈕 `<Teleport to="#page-actions" defer>`。
4. 版面只用 `.grid` / `.grid-2|3|4|auto` / `.stack` / `.row` 與 G* 元件;需要新樣式先擴充元件或 token。
5. 明亮 / 黑暗、1440px / 375px 都用瀏覽器看過;部署後在「選單管理」確認節點與綁定、在「權限試算」確認授予結果;更新 Gherkin(`@manual`)與修正紀錄。

## 8. 禁止事項

- 在頁面內寫按鈕 / 輸入框 / 表格的基本樣式,或寫死色碼、陰影、圓角數值
- 直接 import `lucide-vue-next`、直接呼叫 `fetch`
- 呼叫清單 API 取回全部資料後在前端篩選 / 分頁;進頁就載入首屏看不到的區塊
- Token、密碼存入 localStorage / sessionStorage(主題偏好可以)
- 以 `/` 開頭寫死資源路徑(用 `import.meta.env.BASE_URL`);引用外部 CDN 字型或腳本(CSP 會擋)
