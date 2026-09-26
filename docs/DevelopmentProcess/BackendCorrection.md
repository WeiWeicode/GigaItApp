# 後端修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-26 移除測試應用 DMS 的模擬資料
- 內容:測試應用「公司文件系統」(TestGigaAPP)已自 Gateway 移除(Nginx `/dms/`、BFF 上游 / 路由 / 角色 / 權限,見 `../giga-api-gateway-bff/docs/DevelopmentProcess/BackendCorrection.md` 同日紀錄)。`mock-data.json` 同步移除 `dms-api` 上游、6 條 dms 路由、權限 `dms.document.read` / `write`、角色 `dms-reader` / `dms-editor` 及其權限 / AD 群組 / 公司對應;發佈版本歷程(v32、v33 備註提到 dms)為歷史紀錄,保留。場景測試改用 mes / portal 資料(路由總數 26 → 20;「未登記」的例子改驗聚合 / mock 路由沒有開發專案),Gherkin `bff/bff-read.feature` 分頁數字同步。
- 檔案:`backend/src/bff/mock-data.json`、`backend/test/scenarios.test.ts`、`docs/Gherkin/bff/bff-read.feature`
- 驗證:`backend/` `npm test` 46 項通過、`typecheck` 通過;live 模式(`dev:gw`)API 路由頁為 21 支,系統 / 上游篩選已無 dms

## 2026-09-25 清單 API 分頁與儀表板拆分
- 內容:`GET /bff/routes` 新增 `q / system / upstream / authMode / status / permission / page / pageSize(≤ 500)` 與 `facets`;`GET /bff/releases` 新增 `page / pageSize(≤ 50,預設 10)`,`BffSource.releases(page, pageSize)`(live 直接取 BFF 該頁);`GET /users` 新增 `q / dept / level / page / pageSize(≤ 100)`;`GET /dashboard` 拆成 `/dashboard/overview|work|gateway|team`(舊路徑移除,回 404)。細節見 NewFeatures 同日項目。
- 檔案:`backend/src/routes/paging.ts`、`backend/src/routes/{bff,users,dashboard}.ts`、`backend/src/bff/{types,mock,live,service}.ts`、`backend/test/*`
- 驗證:`npm test` 44 項通過;已重建並部署 itapp-api 容器
