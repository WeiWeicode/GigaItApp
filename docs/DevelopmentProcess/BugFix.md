# Bug 修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-11-18 選單管理改排序後「儲存失敗 / 無法連線伺服器」
- 內容:正式區問題 #1。排序欄位 `<GInput type="number">` 經 v-model 變成 number,`form.sort.trim()` 丟 TypeError,請求沒送出;`describeError` 又把所有 TypeError 說成「無法連線伺服器」。改為 `String(form.sort ?? '').trim()`;`describeError` 只把 fetch 網路失敗(瀏覽器的 Failed to fetch / NetworkError / Load failed 等,新增 `isNetworkError`)說成無法連線,其他程式錯誤(TypeError、ReferenceError 等)顯示「畫面發生錯誤,請回報 IT」並 `console.error`。其他 `type="number"` 欄位(Routes、Upstreams、通知設定)都用 `Number()` / truthy 判斷,不受影響
- 檔案:`frontend/src/pages/system/MenuManage.vue`、`frontend/src/api/http.ts`
- 驗證:`npm run typecheck`、`npm run build` 通過。瀏覽器步驟(測試區合併後):選單管理 → 編輯任一選單 → 排序改數字 → 儲存 → 顯示「已儲存」、側欄順序改變;Nginx 日誌有 `PATCH /api/admin/permissions/<code>`

## 2026-10-30 待核可批次的期限一律顯示「剛剛到期」
- 內容:`BatchApprovals.vue` 期限欄用 `fromNow(approvalExpiresAt)`,但 `fromNow` 只處理過去時間,未來的核可期限都落在「剛剛」→ 顯示「剛剛到期」。新增 `api/format.ts` 的 `untilText()`(N 分鐘 / 小時 / 天後到期;已過顯示「已到期」),「軟體目錄與派送」卡片與「待核可」Tab 都改用。
- 檔案:`frontend/src/api/format.ts`、`frontend/src/components/endpoint/BatchApprovals.vue`
- 驗證:本機假 Gateway 的批次(期限 16–18 小時後)顯示「18 小時後到期」等;typecheck / build 通過

## 2026-10-29 deploy-prod 發佈前端失敗:compose run 沒有 --no-build
- 內容:正式區第一次 `deploy-prod`(pipeline #566,job 1648)itapp-api 已更新且 healthy,但 `$IT run --rm --no-build spa-it` 回 `unknown flag: --no-build`(主機 3 Docker Compose v5.6,`run` 只有 `--build` / `--pull`)。改為 `run --rm --pull never spa-it`:映像已由前一步拉取,`run` 不加 `--build` 不會建置
- 檔案:`.gitlab-ci.yml`
- 驗證:主機 3 以含 `build:` 的測試 compose 執行 `run --rm --pull never`,使用本機映像、未建置、exit 0;YAML 解析通過

## 2026-10-29 上傳安裝檔對話框按鈕錯位(「從上傳區登錄」沒有登錄按鈕)
- 內容:`feature/s1-incoming-delete`(!14)在 footer 的 `v-if` / `v-else` 之間插入「刪除檔案」按鈕,`v-else` 改接到刪除按鈕:「上傳檔案」模式同時出現「上傳」與「登錄」,「從上傳區登錄」模式沒有「登錄」。改為上傳模式只有「上傳」,其他模式以 `<template v-else>` 放「刪除檔案」與「登錄」。測試區瀏覽器實測刪除功能時發現。
- 檔案:`frontend/src/components/endpoint/UploadInstaller.vue`。
- 驗證:`npm run typecheck`、`npm run build` 通過;合併部署後在測試區確認兩種模式的按鈕。

## 2026-09-25 BFF 權限關係圖:滑鼠移到右欄 API 節點時畫面左右閃動
- 內容:節點高亮時有 `transform: translateX(2px)`,右欄(API 路由)節點原本貼齊容器右緣,高亮後超出 2px(scrollWidth 670 > clientWidth 668),`.graph` 出現水平捲軸 → 版面與滑鼠命中改變 → 高亮取消 → 捲軸消失,反覆循環造成閃動。修正:① 移除高亮位移,只保留外框 / 陰影;② 三欄左右各留 8px 邊距,高亮效果不會超出容器;③ ResizeObserver 取整數並忽略 1px 內變化,避免捲軸造成的寬度抖動反覆觸發重排;④ `.graph` 禁止垂直捲軸;⑤ 全域 `html { scrollbar-gutter: stable }`,頁面捲軸出現 / 消失時版面寬度不變(其他頁面也可能有同類跳動)。
- 檔案:`frontend/src/pages/gateway/RbacGraph.vue`、`frontend/src/ui/styles/base.css`
- 驗證:修正前以 JS 模擬移入右欄第一個節點,量到節點右緣超出容器 2px、scrollWidth > clientWidth;修正後在 1024 與 1920 寬度逐一移入全部 45 個節點,皆無超出、無水平捲軸,停留 1 秒內連續取樣 20 次版面寬度與節點位置不變。`vue-tsc`、`vite build` 通過,已重新發佈到 Gateway `/it/`
