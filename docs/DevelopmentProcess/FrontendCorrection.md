# 前端修改紀錄

> 新紀錄加在最上方;格式見 `AGENT.md` §11。

## 2026-10-29 上傳與簽章 Tab(RustIt S1-4)
- 內容:「電腦清單」新增第 6 個 Tab「上傳與簽章」(PRD FR-8.9,RustIt `docs/S1-SIGNING-DESIGN.md` §5;需求方 2026-10-28 同意跨 repo)。上傳安裝檔用 XHR 串流(web-kit `http` 只送 JSON / FormData、無進度):`application/octet-stream`、手動帶 `X-CSRF-Token`、401 換發一次後重送;路徑規則與主機 `SEGMENT_RE` 相同。另可從 NAS 上傳區登錄檔案(含備註)。清單 / 詳情 / 核可(上傳者本人停用)/ 駁回(需原因);工作站回報欄位標「未驗證」,備註與駁回原因以文字顯示。「軟體派送」登錄對話框與套件詳情顯示上傳紀錄(RustIt !76 的 `upload` 欄位;舊主機沒有此欄位時不顯示)。新節點 `it.endpoint-software.upload`(tab,includes `endpoint.software.manage`,it-admin 擁有)。
- 檔案:`frontend/src/pages/endpoint/SoftwareUploads.vue`(新)、`components/endpoint/UploadInstaller.vue`(新)、`api/endpoint.ts`(`uploadApi`、`uploadInstaller`、狀態 / 駁回代碼標籤、錯誤代碼)、`api/types.ts`、`api/auth.ts`、`router.ts`、`components/endpoint/SoftwareRegister.vue`、`SoftwareDetail.vue`;`deploy/gateway-rbac.yaml`;`docs/PRD.md` FR-8.9、`docs/Gherkin/endpoint/software.feature`、`docs/PROJECT-MAP.md`。
- 驗證:`npm run typecheck`、`npm run build` 通過。**未做瀏覽器操作**:測試區尚未套用 migration 0011、未發佈 `endpoint.software.upload.*` 路由、新節點要合併後 CI rbac-test 才登記;上述完成後照 Gherkin「上傳與簽章」四個場景實測(需兩個 IT 帳號)。security-auditor:無 High / Medium;L1 已修(401 換發期間按取消不再重送、上傳結束移除 abort 監聽)。

## 2026-10-27 軟體派送驗收後修正(RustIt Agent 0.9.3)
- 內容:配合 RustIt `feature/p7-0.9.3`(設計 `docs/P7-SOFTWARE-DESIGN.md` §8.1.5,需求方 2026-10-27 決定)。(1)延後中:`running` 的軟體安裝帶 `result.deferred` 時,狀態顯示「延後中(電池供電 / 計量網路)」(`commandStateLabel` / `commandStateTone`,指令清單、電腦指令、指令詳情),詳情加下次檢查時間;(2)指令參數、結果、批次摘要、事件內容的物件改用 JSON 顯示(`paramText`;原本 `detect = [object Object]`);(3)登錄畫面版本欄提示與 DisplayVersion 一致(7-Zip 是 26.05,不是 26.05.2.0.0)、撤回後同一檔案可重新登錄;(4)`INSTALL_BUSY` 說明與 `result.installer_busy` 提示。
- 檔案:`frontend/src/api/endpoint.ts`、`components/endpoint/CommandResult.vue`、`BatchApprovals.vue`、`DeviceEvents.vue`、`SoftwareRegister.vue`、`pages/endpoint/Commands.vue`、`DeviceCommands.vue`。
- 驗證:`npm run typecheck`、`npm run build` 通過。未做瀏覽器操作:測試區主機尚無延後回報與 0010,RustIt MR 合併部署後於 VM 重測(L3、#9、#11)時一併確認。舊主機 / 舊 Agent 沒有 `deferred` 時照舊顯示「執行中」。

## 2026-10-27 軟體派送 VM 驗收修正(RustIt P7 B-1 / B-2 / B-4 / B-5)
- 內容:需求方 2026-10-27 決定(RustIt 設計 `docs/P7-SOFTWARE-DESIGN.md` §8.1.4),配合 RustIt 分支 `feature/p7-acceptance-fixes`。
  - B-1:登錄 / 修改套件加「安裝逾時(秒)」(300–7200,預設 1800,主機再驗;修改逾時不退回草稿,沒改就不送);詳情覆核內容顯示逾時。
  - B-4:登錄時「判斷值」不再預填套件名稱(資料夾名稱常與登錄檔 DisplayName 不同,照預設派送會 DETECT_FAILED),加提示:對照測試機登錄檔的實際名稱、名稱不含版本的用 MSI 產品代碼、Agent 0.9.2 起會比對版本。
  - B-5:詳情 API 回 `viewerScopeAll = false`(沒有可管理所有公司的角色,例如 it-admin)時,「發佈」停用並顯示原因;「修改」「撤回」同樣停用(code-reviewer 建議)。舊主機沒有此欄位時不擋。
  - B-2:pilot 測試機結果與指令結果顯示 Agent 偵測到的版本(`installedVersion` / `installed_version`)、升級前版本、`version_unknown`、`interrupted`(確認期間 Agent 停止)。
- 檔案:`frontend/src/api/{endpoint,types}.ts`、`frontend/src/components/endpoint/{SoftwareRegister,SoftwareDetail,CommandResult}.vue`
- 驗證:`npm run typecheck`、`npm run build` 通過。**未做瀏覽器操作**:本機 dev 經 proxy 連測試區,測試區 endpoint-server 尚未部署這些欄位(RustIt MR 合併、套 0009 後再驗;VM 驗收時一併確認)。

## 2026-10-22 軟體派送畫面(RustIt P7-5)
- 內容:「電腦清單」新增第 5 個 Tab「軟體派送」:待核可批次(核可 / 駁回 / 檢視)、軟體目錄(清單、登錄、修改、標記測試完成、發佈、撤回、詳情含覆核內容與 pilot 測試機結果)、派送對話框(單台走 admin-commands、多台走 /software/{id}/deploy,`ignorePower`)。電腦詳情「指令」Tab 新增「管理指令」:派送軟體、重新開機(`delay_sec`、`message`、`force` 二次確認)、取消重新開機;指令結果顯示軟體安裝 / 重開機結果,`CommandView.batchState` 待核可徽章(電腦指令 Tab、指令紀錄 Tab、結果元件)。軟體批次核可走 `/batches/{id}/approve|reject`(endpoint.software.manage),非軟體批次走 `/approve-command|/reject-command`(endpoint.command.admin);核可人不得是建立人(建立人只能撤回)。待核可清單使用 RustIt 新增的 `GET /batches?state=pending_approval`(需求方 2026-10-22 同意跨 repo 修改,RustIt 分支 `feature/p7-5-batch-list`)。新節點 `it.endpoint-software.list|manage|deploy|approve`、`it.endpoint-device.reboot`(`deploy/gateway-rbac.yaml`,it-admin 擁有)。
- 檔案:`frontend/src/pages/endpoint/Software.vue`、`frontend/src/components/endpoint/{SoftwareRegister,SoftwareDetail,SoftwareDeploy,BatchApprovals}.vue`、`frontend/src/pages/endpoint/{DeviceCommands,Commands}.vue`、`frontend/src/components/endpoint/CommandResult.vue`、`frontend/src/api/{endpoint,types,auth}.ts`、`frontend/src/router.ts`、`deploy/gateway-rbac.yaml`、`docs/PRD.md`(FR-8.8)、`docs/Gherkin/endpoint/software.feature`、`docs/PROJECT-MAP.md`
- 驗證:`npm run typecheck` 通過;瀏覽器驗證見下方補記。

## 2026-10-19 人員明細:本機帳號建立 / 重置密碼
- 內容:需求方要求 it-admin 可在「人員與部門 › 人員」為人員建立本機帳號或重置密碼(禾迅等無 AD 網域公司;配合 giga-api-gateway-bff 同日「reset-password 擴充為建立帳號 / 重置密碼」)。明細對話框新增按鈕(AD 帳號不顯示;已有啟用 / 鎖定的本機帳號顯示「重置密碼」,否則「建立帳號」),對話框可指定密碼(留空由系統產生);完成後顯示寄送對象,沒寄出(或非正式區)才顯示明文。新按鈕權限 `it.sys-user.password`(includes `gw.admin.local.write`,`deploy/gateway-rbac.yaml`,it-admin 擁有);`LOCAL` 狀態對照改為 BFF 實際值(`pending_approval` / `pending_verify`)
- 檔案:`frontend/src/pages/system/Users.vue`、`frontend/src/api/admin.ts`、`frontend/src/api/auth.ts`、`deploy/gateway-rbac.yaml`
- 驗證:`npm run typecheck`、`npm run build` 通過;瀏覽器實測需 BFF 新版部署到測試區後進行(未執行)

## 2026-10-16 電腦詳情固定高度、篩選列換行、Agent 啟動事件文字(RustIt P3 測試區實測後)
- 內容:需求方要求詳情對話框不隨 Tab 內容改變高度 → `GModal` 新增 `height`(固定高度、內容在內部捲動),電腦詳情設 `85vh`,Tab 列在捲動時固定在上方;電腦清單篩選列改為可換行(1280px 寬時「顯示退役」被擠掉),`GCheckbox` 改用 `label` 參數(原寫法 slot 不顯示文字);事件「Agent 啟動」顯示「Agent 版本 x.y.z」而非原始 JSON。
- 檔案:`frontend/src/ui/components/GModal.vue`、`frontend/src/pages/endpoint/Devices.vue`、`DeviceDetail.vue`、`frontend/src/components/endpoint/DeviceEvents.vue`、`docs/UI-GUIDE.md`
- 驗證:`npm run typecheck`、`npm run build` 通過;測試區瀏覽器(1280×860)以相同樣式暫時套用確認:詳情高度固定 731px(85vh),內容短的 Tab 不縮小;篩選列不再溢出。部署後需求方再確認。

## 2026-10-16 端點電腦清單分頁與篩選、詳情分 Tab、停用 / 退役 / 合併(RustIt P3)
- 內容:配合 RustIt ItAgentBack P3(RustIt `docs/P3-DATA-DESIGN.md`,分支 `feature/p3-data`)。電腦清單改後端分頁(每頁 50 台,`usePaged`)與篩選(關鍵字:名稱 / 使用者 / IP / MAC / 裝置代碼;軟體名稱;作業系統;在線;顯示退役),標示「疑似同一台」「已退役 / 已合併」;詳情分 Tab:概要(時鐘偏差、開機時間、裝置代碼、疑似同一台提示)、硬體(CPU、記憶體模組、主機板與 BIOS、磁碟、實體磁碟、顯示卡)、網路(閘道、DNS)、軟體(名稱 / 發行者篩選)、安全與周邊(防毒、Windows 更新、USB 原則與使用過的裝置、RustDesk)、事件(主機稽核與端點事件,載入更多)、指令(既有);「下載資產 JSON」。管理操作(按鈕節點 `it.endpoint-device.admin` ∧ `endpoint.command.admin`):停用 / 啟用 / 退役、合併疑似同一台(首次連線較早者為舊裝置;後端回指紋不同或時間重疊時再確認一次後 force),原因必填。Agent 回報的字串一律文字顯示。`deviceApi.list` 相容 P3 前只回 `items` 的 ItAgentBack。新增圖示 package、hard-drive、merge、archive、ban。
- 檔案:`frontend/src/pages/endpoint/Devices.vue`、`DeviceDetail.vue`、`frontend/src/components/endpoint/DeviceEvents.vue`(新)、`DeviceAdminActions.vue`(新)、`frontend/src/api/endpoint.ts`、`types.ts`、`auth.ts`、`frontend/src/ui/icons.ts`、`deploy/gateway-rbac.yaml`、`docs/Gherkin/endpoint/device-inventory.feature`、`docs/PROJECT-MAP.md`
- 驗證:`frontend` `npm run typecheck`、`npm run build` 通過;`backend` `npm test` 52/55(3 項為 Windows 暫存檔鎖定 EPERM / EBUSY,未改動時同樣失敗)。瀏覽器:入口網登入需本人帳密,AI 未登入;改以本機 ItAgentBack(DEV_SKIP_TOKEN,唯讀測試庫)驗證畫面所用的 API(分頁、篩選、事件、下載)。**待部署後由需求方在瀏覽器實測各 Tab、篩選與下載**;停用 / 退役 / 合併待 P3-4 以測試 VM 驗證。

## 2026-10-13 檔案管理:「舊系統」Tab(giga-file-service A4)
- 內容:filebackend / SMBbackend 匯入附件服務的舊檔不出現在「檔案清單」(相容層命名空間,giga-file-service API §4.4 規則 17),新增唯讀「舊系統」Tab:兩個來源的摘要卡片(檔案數、容量、已刪除、備份、最後匯入)、對照清單(來源篩選、關鍵字比對舊 id / 舊檔名 / 原檔名 / 單號,後端分頁;標示已刪除、備份狀態、共用檔)、下載。權限節點 `it.gw-file.legacy`(tab,includes `file.legacy.read`)加入 `gateway-rbac.yaml` 與 `it-admin`
- 檔案:`frontend/src/pages/files/Legacy.vue`(新增)、`frontend/src/api/files.ts`、`frontend/src/api/auth.ts`、`frontend/src/router.ts`、`deploy/gateway-rbac.yaml`、`docs/PROJECT-MAP.md`
- 驗證:`npm run typecheck` 通過;測試區瀏覽器實測見下次更新(配合 giga-file-service a3373b5,路由已由使用者於「服務與路由」發佈)

## 2026-10-08 檔案管理:單檔上限 30 MB、主機磁碟容量
- 內容:使用者測試回饋。① 上傳上限由 10 MB 改為 30 MB(giga-file-service D3;Gateway Nginx 直送 file-api,不受 BFF 10 MB 限制)。② 「主機磁碟」原本顯示 WSL 虛擬磁碟上限(1007 GB,稀疏檔),改以 file-api 回傳的 `capacity.basis`:host 時為 Windows 主機磁碟,並註明虛擬磁碟上限僅供參考
- 檔案:`frontend/src/api/files.ts`、`frontend/src/pages/files/Files.vue`、`Storage.vue`、`docs/Gherkin/gateway/files.feature`
- 驗證:`npm run typecheck` 通過;測試區實測待部署

## 2026-09-26 頂列新增應用切換(giga-Portal FR-2.3、PRD §9.2 I3 的一部分)
- 內容:頂列帳號旁加入 `GAppSwitcher`(自 `../giga-Portal` 複製,兩邊同一版本),列出使用者有權限的應用(員工入口網 `/`、IT 管理系統 `/it/`),點選整頁導向。資料取自使用者的 **Gateway 登入**(`gatewayGet('/api/auth/me')`,gn_at Cookie),與本系統登入(it_at)分開;沒有 Gateway 登入時不顯示。Gateway 尚未提供 `me.apps`(G3)前,**暫時**依 `portal.app.access` / `it.app.access` 對照 `TEMP_APPS` 推導並在下拉標示(與 giga-Portal 相同)。新增 token `--grad-primary`、`--on-primary`、`--shadow-pop`(與 giga-Portal 同名,以本系統現有值定義)、圖示 `apps`、`home`、`arrow-right`。**未做**:改用單一入口(I1)、無 `it.app.access` 導回入口網的應用層守衛(I3 其餘部分),仍屬 M3。
- 檔案:`frontend/src/ui/components/GAppSwitcher.vue`(新增)、`frontend/src/composables/apps.ts`(新增)、`frontend/src/layouts/AppLayout.vue`、`frontend/src/ui/components/GIcon.vue`、`frontend/src/ui/styles/tokens.css`、`frontend/src/components.d.ts`、`docs/UI-GUIDE.md`、`docs/PROJECT-MAP.md`
- 驗證:`frontend/`:`npm run typecheck`、`npm run build` 通過。`RELEASE_SHA=7c43d69-appswitch docker compose -f deploy/docker-compose.yml run --rm --build spa-it` 發佈到本機 Nginx(上一版 `7da8c10` 保留可回滾)。headless Chrome 經 `https://localhost`:S100001 在入口網登入 → 應用切換到 `/it/` → 本系統自有登入 → 頂列應用切換列出「員工入口網」「IT 管理系統(目前所在)」→ 點員工入口網回到 `/` 首頁且不需重新登入入口網;只登入本系統、未登入 Gateway 時不顯示應用切換;無 console 錯誤。權限代碼來自 `../giga-Portal/deploy/gateway-dev-rbac.yaml`(本機)。

## 2026-09-25 側欄收合時改為滑鼠移上浮出選單
- 內容:原本側欄收合後只剩群組圖示,第二層功能頁無法選取。改為滑鼠移上(或鍵盤聚焦、點擊)群組圖示時,在右側浮出該群組的功能清單(Teleport 到 body、fixed 定位,避免被側欄 overflow 裁掉);移到清單途中不關閉(0.18 秒延遲 + 間隙熱區),Esc、移開或換頁關閉;窄螢幕(≤ 960px)維持抽屜不浮出;收合狀態記在 localStorage。
- 檔案:`frontend/src/layouts/AppLayout.vue`、`docs/UI-GUIDE.md` §5、`docs/Gherkin/ui/navigation.feature`
- 驗證:`vue-tsc` 通過;瀏覽器收合側欄 → 滑鼠移到「Gateway 管理」圖示 → 浮出「服務與路由 / BFF 權限」→ 移入並點「BFF 權限」→ 導向 /it/gateway/rbac、清單關閉;「系統管理」圖示同樣浮出三個項目
