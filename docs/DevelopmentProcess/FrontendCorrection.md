# 前端修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-25 側欄收合時改為滑鼠移上浮出選單
- 內容:原本側欄收合後只剩群組圖示,第二層功能頁無法選取。改為滑鼠移上(或鍵盤聚焦、點擊)群組圖示時,在右側浮出該群組的功能清單(Teleport 到 body、fixed 定位,避免被側欄 overflow 裁掉);移到清單途中不關閉(0.18 秒延遲 + 間隙熱區),Esc、移開或換頁關閉;窄螢幕(≤ 960px)維持抽屜不浮出;收合狀態記在 localStorage。
- 檔案:`frontend/src/layouts/AppLayout.vue`、`docs/UI-GUIDE.md` §5、`docs/Gherkin/ui/navigation.feature`
- 驗證:`vue-tsc` 通過;瀏覽器收合側欄 → 滑鼠移到「Gateway 管理」圖示 → 浮出「服務與路由 / BFF 權限」→ 移入並點「BFF 權限」→ 導向 /it/gateway/rbac、清單關閉;「系統管理」圖示同樣浮出三個項目
