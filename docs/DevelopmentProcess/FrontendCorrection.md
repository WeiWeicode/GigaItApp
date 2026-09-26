# 前端修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-26 頂列新增應用切換(giga-Portal FR-2.3、PRD §9.2 I3 的一部分)
- 內容:頂列帳號旁加入 `GAppSwitcher`(自 `../giga-Portal` 複製,兩邊同一版本),列出使用者有權限的應用(員工入口網 `/`、IT 管理系統 `/it/`),點選整頁導向。資料取自使用者的 **Gateway 登入**(`gatewayGet('/api/auth/me')`,gn_at Cookie),與本系統登入(it_at)分開;沒有 Gateway 登入時不顯示。Gateway 尚未提供 `me.apps`(G3)前,**暫時**依 `portal.app.access` / `it.app.access` 對照 `TEMP_APPS` 推導並在下拉標示(與 giga-Portal 相同)。新增 token `--grad-primary`、`--on-primary`、`--shadow-pop`(與 giga-Portal 同名,以本系統現有值定義)、圖示 `apps`、`home`、`arrow-right`。**未做**:改用單一入口(I1)、無 `it.app.access` 導回入口網的應用層守衛(I3 其餘部分),仍屬 M3。
- 檔案:`frontend/src/ui/components/GAppSwitcher.vue`(新增)、`frontend/src/composables/apps.ts`(新增)、`frontend/src/layouts/AppLayout.vue`、`frontend/src/ui/components/GIcon.vue`、`frontend/src/ui/styles/tokens.css`、`frontend/src/components.d.ts`、`docs/UI-GUIDE.md`、`docs/PROJECT-MAP.md`
- 驗證:`frontend/`:`npm run typecheck`、`npm run build` 通過。`RELEASE_SHA=7c43d69-appswitch docker compose -f deploy/docker-compose.yml run --rm --build spa-it` 發佈到本機 Nginx(上一版 `7da8c10` 保留可回滾)。headless Chrome 經 `https://localhost`:S100001 在入口網登入 → 應用切換到 `/it/` → 本系統自有登入 → 頂列應用切換列出「員工入口網」「IT 管理系統(目前所在)」→ 點員工入口網回到 `/` 首頁且不需重新登入入口網;只登入本系統、未登入 Gateway 時不顯示應用切換;無 console 錯誤。權限代碼來自 `../giga-Portal/deploy/gateway-dev-rbac.yaml`(本機)。

## 2026-09-25 側欄收合時改為滑鼠移上浮出選單
- 內容:原本側欄收合後只剩群組圖示,第二層功能頁無法選取。改為滑鼠移上(或鍵盤聚焦、點擊)群組圖示時,在右側浮出該群組的功能清單(Teleport 到 body、fixed 定位,避免被側欄 overflow 裁掉);移到清單途中不關閉(0.18 秒延遲 + 間隙熱區),Esc、移開或換頁關閉;窄螢幕(≤ 960px)維持抽屜不浮出;收合狀態記在 localStorage。
- 檔案:`frontend/src/layouts/AppLayout.vue`、`docs/UI-GUIDE.md` §5、`docs/Gherkin/ui/navigation.feature`
- 驗證:`vue-tsc` 通過;瀏覽器收合側欄 → 滑鼠移到「Gateway 管理」圖示 → 浮出「服務與路由 / BFF 權限」→ 移入並點「BFF 權限」→ 導向 /it/gateway/rbac、清單關閉;「系統管理」圖示同樣浮出三個項目
