# 後端修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-25 清單 API 分頁與儀表板拆分
- 內容:`GET /bff/routes` 新增 `q / system / upstream / authMode / status / permission / page / pageSize(≤ 500)` 與 `facets`;`GET /bff/releases` 新增 `page / pageSize(≤ 50,預設 10)`,`BffSource.releases(page, pageSize)`(live 直接取 BFF 該頁);`GET /users` 新增 `q / dept / level / page / pageSize(≤ 100)`;`GET /dashboard` 拆成 `/dashboard/overview|work|gateway|team`(舊路徑移除,回 404)。細節見 NewFeatures 同日項目。
- 檔案:`backend/src/routes/paging.ts`、`backend/src/routes/{bff,users,dashboard}.ts`、`backend/src/bff/{types,mock,live,service}.ts`、`backend/test/*`
- 驗證:`npm test` 44 項通過;已重建並部署 itapp-api 容器
