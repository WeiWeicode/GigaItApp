# Bug 修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-09-25 BFF 權限關係圖:滑鼠移到右欄 API 節點時畫面左右閃動
- 內容:節點高亮時有 `transform: translateX(2px)`,右欄(API 路由)節點原本貼齊容器右緣,高亮後超出 2px(scrollWidth 670 > clientWidth 668),`.graph` 出現水平捲軸 → 版面與滑鼠命中改變 → 高亮取消 → 捲軸消失,反覆循環造成閃動。修正:① 移除高亮位移,只保留外框 / 陰影;② 三欄左右各留 8px 邊距,高亮效果不會超出容器;③ ResizeObserver 取整數並忽略 1px 內變化,避免捲軸造成的寬度抖動反覆觸發重排;④ `.graph` 禁止垂直捲軸;⑤ 全域 `html { scrollbar-gutter: stable }`,頁面捲軸出現 / 消失時版面寬度不變(其他頁面也可能有同類跳動)。
- 檔案:`frontend/src/pages/gateway/RbacGraph.vue`、`frontend/src/ui/styles/base.css`
- 驗證:修正前以 JS 模擬移入右欄第一個節點,量到節點右緣超出容器 2px、scrollWidth > clientWidth;修正後在 1024 與 1920 寬度逐一移入全部 45 個節點,皆無超出、無水平捲軸,停留 1 秒內連續取樣 20 次版面寬度與節點位置不變。`vue-tsc`、`vite build` 通過,已重新發佈到 Gateway `/it/`
