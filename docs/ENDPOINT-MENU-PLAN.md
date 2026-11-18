# 端點管理選單重新分類規劃(草案)

> 狀態:**§8 已決定(2026-10-30),M1 完成(程式,分支 `feature/endpoint-menu-m1`;合併部署後的選單管理調整與授權補洞見 §3.2)**。範圍:側欄「端點管理」目前只有一個選單「電腦清單」,底下塞了 6 個 Tab(電腦清單、指令紀錄、告警、Agent 版本、軟體派送、上傳與簽章);功能變多後難找,也難以分開授權。本文件規劃改成多個選單,並列出權限節點的搬移方式。
> 時程以甘特圖為準,本文件不列日期。

## 1. 現況

| 項目 | 現況 |
| --- | --- |
| 側欄 | `it.group.endpoint`(端點管理)→ 選單 `it.endpoint-device.read`(電腦清單),路由 `/endpoint/devices` |
| Tab | `it.endpoint-device.list` 電腦清單、`it.endpoint-command.list` 指令紀錄、`it.endpoint-alert.list` 告警、`it.endpoint-release.list` Agent 版本、`it.endpoint-software.list` 軟體派送、`it.endpoint-software.upload` 上傳與簽章 |
| 按鈕 | `it.endpoint-device.command` / `.admin` / `.reboot`(掛電腦清單)、`it.endpoint-alert.resolve`、`it.endpoint-release.manage`、`it.endpoint-software.manage` / `.deploy` / `.approve` |
| 登記方式 | `deploy/gateway-rbac.yaml` 經 CI `rbac-test` / `rbac-prod` 套用;**只負責首次登記,已存在的節點不覆寫名稱、上層與排序**(之後在「系統管理 › 選單管理」調整) |
| 側欄組法 | `auth.ts` `buildMenus()`:頁面歸到 BFF 上層目錄(group),名稱 / 排序以 BFF 為準 |
| 待核可批次 | `BatchApprovals.vue` 目前散在軟體派送與電腦清單的對話框內 |

## 2. 新分類

```
端點管理(it.group.endpoint)                    〔開發中〕= 先顯示「開發中」頁,做好時再登記 tab 代碼
├─ 端點儀表板   /endpoint/dashboard        新選單 it.endpoint-dashboard.read
│    └ Tab:總覽〔開發中〕
├─ 電腦管理     /endpoint/devices          沿用 it.endpoint-device.read(名稱改「電腦管理」)
│    └ Tab:電腦清單、指令紀錄、告警、待核可(M2)、遠端協助〔開發中,RustDesk〕、報修單〔開發中〕、未安裝 Agent 電腦〔開發中〕
├─ 資產管理     /endpoint/assets           新選單 it.endpoint-asset.read(M1b)
│    └ Tab:資產登錄〔開發中,財產編號 / 保管人 / 狀態 / 生命週期〕、資產盤點〔開發中〕、周邊設備〔開發中〕、廠商與地點〔開發中〕
├─ 軟體管理     /endpoint/software         新選單 it.endpoint-software.read
│    └ Tab:軟體目錄與派送(現「軟體派送」)、上傳與簽章、已安裝軟體〔開發中〕、Windows 更新〔開發中,KB 移除〕、授權報表〔開發中〕、禁用軟體〔開發中〕、軟體使用率〔開發中〕
├─ 資安政策     /endpoint/policy           新選單 it.endpoint-policy.read
│    └ Tab:USB 儲存控管、原則與套用對象、防火牆規則、外接網卡與無線網路、執行軟體控管、弱點分析(CVE)、稽核紀錄(最後做)〔皆開發中〕
├─ Agent 管理   /endpoint/agent            新選單 it.endpoint-agent.read
│    └ Tab:Agent 版本(含發佈環)、使用者端程式〔開發中,P8〕、Agent 設定〔開發中〕
└─ 報表         /endpoint/reports          新選單 it.endpoint-report.read(M1b)
     └ Tab:報表中心〔開發中〕、報表訂閱〔開發中〕
```

資產管理、報表與各開發中 Tab 的功能說明取自 RustIt `docs/SMARTIT-FEATURE-BACKLOG.md`(gitlab 分支 `docs/smartit-backlog`) §2、§3(M1b,§8-6)。

**開發中 Tab 的做法**(需求方 2026-10-30 決定:做好時再登記):共用一個「開發中」元件(說明這個功能要做什麼、對應的設計文件 / 路線圖),路由 `meta.wip = true`、**不綁 tab 權限代碼**(有該選單即可看到),Tab 標籤加「開發中」標記;只有新選單需要登記 menu 代碼。功能真的做好時才登記 tab 代碼、授予 it-admin、移除 `wip`。只有開發中 Tab 的選單(端點儀表板、資產管理、資安政策、報表)也要出現在側欄。

分類原則:**看「對什麼東西操作」**——電腦本身(清單、指令、告警)、電腦上的軟體(目錄、上傳、已安裝、更新)、監控程式本身(Agent / Watchdog 版本與發佈環)。儀表板放第一個,作為進入端點管理的落點。

### 2.1 端點儀表板(新)

| 區塊 | 內容 | 資料來源 |
| --- | --- | --- |
| 指標列 | 電腦總數、在線 / 離線、未結告警、待核可批次、24 小時內失敗指令 | **需新 API** |
| 健康 | 磁碟剩餘 < 10%、記憶體長期 > 90%、長時間未回報(> 7 天)的電腦清單(點開電腦詳情) | 需新 API |
| 分佈 | 作業系統版本(Win10 / 11、build)、Agent 版本分佈(對照發佈環目標)、公司別台數 | 需新 API |
| 派送 | 近 7 天軟體派送成功 / 失敗、進行中的批次 | 需新 API |
| 最近告警 | 最新 10 筆未結告警 | 既有 `GET /v1/alerts` |

- ItAgentBack 現有管理 API 沒有彙總端點,前端不可為了算數字把整份電腦清單抓下來(上千台時太慢)。**需 RustIt 新增 `GET /v1/dashboard/summary`**(權限 `endpoint.device.read`,依 E6 公司範圍過濾,Redis 快取 60 秒)——跨 repo,需同意。
- 第一版可先只做「指標列 + 最近告警」,分佈與健康清單第二批。

### 2.2 電腦管理(沿用,改名)

- 選單代碼不變(`it.endpoint-device.read`),只在「選單管理」把名稱改為「電腦管理」;Tab 電腦清單 / 指令紀錄 / 告警不動。
- 新增 Tab「待核可」(`it.endpoint-batch.list`):集中列出 `GET /v1/batches?state=pending_approval`(重開機、軟體派送、之後的 KB 移除),核可 / 駁回按鈕沿用既有按鈕權限(`it.endpoint-software.approve`、`it.endpoint-device.reboot`)。原本對話框內的入口保留。

### 2.3 軟體管理(新選單)

| Tab | 代碼 | 說明 |
| --- | --- | --- |
| 軟體目錄與派送 | 沿用 `it.endpoint-software.list`(改掛到新選單) | 現 `Software.vue`,不改功能 |
| 上傳與簽章 | 沿用 `it.endpoint-software.upload`(改掛) | 現 `SoftwareUploads.vue` |
| 已安裝軟體(新) | `it.endpoint-software.installed` | 全公司已安裝軟體彙總:名稱、版本數、台數,點開看哪些電腦(目前電腦清單只有「軟體名稱」篩選)。**需 RustIt 新增彙總 API**(`GET /v1/software/installed`) |
| Windows 更新(新) | `it.endpoint-update.list` | RustIt `KB-UNINSTALL-DESIGN.md` U4 的批次入口:輸入 KB → 查哪些電腦有裝 → 批次移除;單台入口在電腦詳情「安全」Tab。依該設計的進度上線 |

### 2.4 Agent 管理(新選單)

- Tab「Agent 版本」沿用 `it.endpoint-release.list`(改掛)。現在只有一個 Tab;之後的 Agent 設定(主機下發設定、信任簽章者清單檢視)、使用者端程式(P8)版本會放這裡。
- 若需求方覺得單 Tab 選單太空,可改放軟體管理底下(§8-2)。

## 3. 權限節點與路由

### 3.1 節點(`deploy/gateway-rbac.yaml`)

| 動作 | 節點 |
| --- | --- |
| 新增 menu | `it.endpoint-dashboard.read`(includes `endpoint.device.read`)、`it.endpoint-software.read`(includes `endpoint.device.read`)、`it.endpoint-agent.read`(includes `endpoint.device.read`) |
| 新增 tab | `it.endpoint-dashboard.overview`、`it.endpoint-batch.list`、`it.endpoint-software.installed`、`it.endpoint-update.list`(後兩者依 API 上線時間再登記) |
| **改上層**(代碼不變) | `it.endpoint-software.list`、`it.endpoint-software.upload` → `it.endpoint-software.read`;`it.endpoint-release.list` → `it.endpoint-agent.read`;底下按鈕跟著 Tab 走,不必動 |
| 改名 | `it.endpoint-device.read`:電腦清單 → 電腦管理 |
| 角色 | `it-admin` 加入新增的 menu / tab 代碼 |

**沿用舊代碼的原因**:角色與個人已授予的 Tab / 按鈕不會失效,也不用重新指派。

### 3.2 為什麼 CI 套用不夠

`apply` 對已存在的節點**不覆寫上層、名稱、排序**。因此:

1. yaml 照新結構寫(新環境第一次套用就是對的)。
2. 測試區與正式區**各自**在「系統管理 › 選單管理」手動:改 3 個 Tab 的上層、改「電腦清單」名稱、調整排序(儀表板 10、電腦管理 20、軟體管理 30、資安政策 40、Agent 管理 50)。
3. **授權補洞**:頁面可見 = 選單 ∩ Tab。被搬走的 Tab 原本靠 `it.endpoint-device.read` 這個選單顯示,搬到新選單後,**只有 Tab 沒有新選單的角色會看不到頁面**。手動調整前,先在「權限查詢 › 誰能存取」列出持有 `it.endpoint-software.list` / `.upload` / `it.endpoint-release.list` 的角色與個人,一併授予對應的新選單(`it-admin` 由 yaml 處理)。
4. 是否要請 Gateway 的 `apply` 加「強制同步上層」選項,見 §8-4(跨 repo)。

### 3.3 路由

| 新路徑 | 舊路徑(保留 redirect) |
| --- | --- |
| `/endpoint/dashboard` | — |
| `/endpoint/devices`、`/commands`、`/alerts`、`/batches`(新) | 不變 |
| `/endpoint/software`、`/endpoint/software/uploads`、`/installed`、`/updates` | `/endpoint/devices/software` → `/endpoint/software`;`/endpoint/devices/software-uploads` → `/endpoint/software/uploads` |
| `/endpoint/agent` | `/endpoint/devices/releases` → `/endpoint/agent` |

- 舊網址 redirect 保留一個版本週期(書籤、群組裡貼過的連結);程式內目前沒有寫死這些路徑的連結(已搜尋)。
- `auth.ts`:`IT` 加三個選單代碼、`UI` 加新 Tab 代碼、`MENU` 的 endpoint 群組改為 4 個子項;`router.ts` 拆成 4 個 `TabbedPage`。

## 4. 分批

| 批 | 內容 | repo |
| --- | --- | --- |
| **M1** 選單拆分 ✅ | 新選單 / 路由 / redirect、yaml、`auth.ts`;頁面元件不改,只搬位置;〔開發中〕Tab(`pages/WipFeature.vue`);測試區「選單管理」手動調整與授權補洞(合併部署後由主討論串處理) | GigaItApp |
| **M1b** 資產管理、報表選單與開發中 Tab ✅ | 新選單 `it.endpoint-asset.read`(sort 25)、`it.endpoint-report.read`(sort 60);電腦管理 / 軟體管理 / 資安政策補開發中 Tab(§8-6;分支 `feature/endpoint-menu-m1b`,依賴 M2) | GigaItApp |
| **M2** 待核可 Tab ✅ | `Batches.vue`,沿用 `BatchApprovals.vue`(`page` 模式);Tab 代碼 `it.endpoint-batch.list`(分支 `feature/endpoint-batches-m2`) | GigaItApp |
| **M3** 儀表板第一版 | RustIt `GET /v1/dashboard/summary`(指標列)+ 頁面(指標列、最近告警) | RustIt、GigaItApp |
| **M4** 儀表板第二版、已安裝軟體 | 分佈、健康清單;`GET /v1/software/installed` + Tab | RustIt、GigaItApp |
| **M5** Windows 更新 Tab | 依 RustIt KB-UNINSTALL U4 | RustIt、GigaItApp |
| 正式區 | 每批合併 `main` 後,正式區「選單管理」同樣手動調整(§3.2) | — |

M1、M2 只動 GigaItApp,可以先做;M3 起要 RustIt 新 API。

## 5. 文件與測試

- Gherkin:`docs/Gherkin/endpoint/` 補「端點儀表板」「待核可」;既有 `software.feature`、`releases.feature` 的路徑與選單名稱更新。
- `docs/PRD.md` §6.8 端點管理改為四個選單的描述;`docs/PROJECT-MAP.md`、`docs/DevelopmentProcess/NewFeatures.md`。
- 架構 JSON:GigaItApp 頁面結構有變時更新 `GigaNexusAIPlan/architecture/`(若有登錄頁面層級)並跑 `npm run arch:check`。
- 驗證:1440px / 375px、明亮 / 黑暗;以只持有部分 Tab 的測試角色確認授權補洞後看得到頁面(「權限試算」)。

## 6. 影響與風險

- **漏補授權**:§3.2 第 3 步沒做,非 it-admin 的使用者會突然看不到軟體派送 / Agent 版本。手動調整與補授權要同一次完成,完成後用「權限試算」檢查。
- 正式區手動步驟容易漏 → 每批的 MR 描述附正式區檢查清單。
- 儀表板 API 是新的查詢負擔 → Redis 快取 60 秒、只查 SQL 彙總,不讀 Mongo 快照。

## 7. 不做的事

- 不改既有頁面元件的功能與版面(M1 只搬位置)。
- 不改 BFF 權限代碼(`endpoint.*`),新 Tab 的 includes 都用既有權限。
- 不把端點指標放進「總覽 › 儀表板」(可列為之後的小卡片)。

## 8. 決定事項(需求方 2026-10-30)

1. 選單:端點儀表板 / 電腦管理 / 軟體管理 / 資安政策 / Agent 管理(Agent 管理**單獨成選單**)。
2. 開發中 Tab 放**完整路線圖**(§2 樹狀圖);**做好時再登記**權限節點,現在只登記新選單的 menu 代碼。
3. M1 先做「簡單的分類」:選單拆分 + 開發中 Tab;待核可(M2)、儀表板內容(M3)之後再做。
4. 既有 Tab 的上層搬移、改名、排序與授權補洞:合併部署後,由主討論串在需求方登入的瀏覽器操作「選單管理」,或直接呼叫 BFF 管理 API(寫入前仍逐次取得需求方同意)。不改 Gateway CLI。
5. 儀表板指標待 M3 時再定。
6. **RustIt 取代 SmartIT**(需求方 2026-10-30;功能對照見 RustIt `docs/SMARTIT-FEATURE-BACKLOG.md`(gitlab 分支 `docs/smartit-backlog`) §1–§3):
   - 資產管理與報表**兩個選單都新增**(回答「兩個都新增 (Recommended)」):資產管理 sort 25(電腦管理與軟體管理之間)、報表 sort 60(最後)。
   - 稽核類功能(檔案存取、網頁傳輸、即時通訊、螢幕擷取、列印紀錄)**列入但最後做**(回答「列入但最後做」),需法務與隱私公告確認後才開發。
   - 舊 SmartIT 資料**不匯入**(回答「不匯入」);資產資料上線後重新登錄。
   - 新增開發中 Tab:電腦管理「未安裝 Agent 電腦」;軟體管理「禁用軟體」「軟體使用率」;資安政策「原則與套用對象」「防火牆規則」「外接網卡與無線網路」「執行軟體控管」「弱點分析(CVE)」「稽核紀錄」;資產管理、報表的 Tab 全為開發中。與 M1 相同,開發中 Tab 做好時才登記 tab 代碼。
