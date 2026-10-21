# language: zh-TW
# RustIt P6-5:Agent 版本與發佈環。API 與規則見 RustIt docs/P6-UPGRADE-DESIGN.md §1、§2、§7;經 BFF 呼叫 /api/endpoint/releases、/release-rings、/devices/{id}/ring|upgrade|admin-commands。
功能: 端點管理 — Agent 版本與發佈環
  為了安全地把新版 Agent / Watchdog 先在測試機驗證,再逐環推到全公司
  身為 IT 管理員
  我要在「Agent 版本」Tab 登錄、發佈、撤回版本並設定各發佈環的目標版本,在電腦詳情看升級狀態

  背景:
    假如 測試區 Gateway 已發佈 ItAgentBack 的 /releases、/release-rings 路由
    而且 版本檔目錄有已簽章的 rustit-agent.exe 與 rustit-watchdog.exe

  Rule: 權限 — Tab it.endpoint-release.list(endpoint.device.read)、管理按鈕 it.endpoint-release.manage(endpoint.software.manage,主機另要求可管理所有公司)

    @manual
    場景: 沒有 Tab 權限看不到「Agent 版本」
      假如 使用者沒有 it.endpoint-release.list
      當 開啟「電腦清單」
      那麼 Tab 只有「電腦清單」「指令紀錄」「告警」,直接輸入 /endpoint/devices/releases 被導回

    @manual
    場景: 只有唯讀權限看不到管理按鈕
      假如 使用者有 it.endpoint-release.list 但沒有 it.endpoint-release.manage
      當 開啟「Agent 版本」Tab
      那麼 可以看到發佈環與版本清單
      而且 沒有「登錄版本」「發佈」「撤回」「設定」按鈕

  Rule: 登錄 — 從版本檔目錄挑選,SHA-256 與大小由主機計算

    @manual
    場景: 登錄一個版本
      假如 "S112009" 擁有角色 it-admin
      當 按「登錄版本」,選擇 "Watchdog 0.3.1 · rustit-watchdog.exe",填入 40 碼預期簽章者指紋後按「登錄」
      那麼 版本清單出現 Watchdog 0.3.1,狀態為「草稿」
      而且 該檔案不再出現在登錄對話框的清單

    @manual
    場景: 簽章者指紋格式錯誤不能送出
      當 在登錄對話框填入 "not-a-thumbprint"
      那麼 顯示「不是 40 個十六進位字元的 SHA-1 指紋」且「登錄」按鈕停用

  Rule: 發佈與撤回 — 草稿發佈後才能推到 it / all;撤回會清除環的目標

    @manual
    場景: 發佈草稿版本
      假如 Agent 0.8.0 為草稿
      當 按該列「發佈」並確認
      那麼 狀態變為「已發佈」,不再有「發佈」按鈕

    @manual
    場景: 撤回版本連動清除環的目標
      假如 pilot 與 it 環的 Agent 目標都是 0.7.1
      當 撤回 Agent 0.7.1 並確認
      那麼 版本狀態為「已撤回」,提示已清除的環,pilot 與 it 的 Agent 目標顯示「不升級(維持現況)」

  Rule: 發佈環 — pilot 可設草稿;it / all 只能設已發佈;pilot 未滿 24 小時要確認

    @manual
    場景: 設定 pilot 環的目標版本
      當 在 pilot / Agent 按「設定」,目標版本選 0.8.0(草稿)後儲存
      那麼 pilot / Agent 顯示目標 0.8.0,進度顯示「到目標 / 總台數」

    @manual
    場景: it 環只列已發佈的版本
      當 在 it / Agent 按「設定」
      那麼 下拉選單只有已發佈的版本,沒有草稿與已撤回的版本

    @manual
    場景: pilot 設定未滿 24 小時就推進需要確認
      假如 pilot 的同一版本設定未滿 24 小時
      當 把 it 環設為同一版本並儲存
      那麼 出現「仍要推進?」確認;按「仍要設定」才以 force 重送並成功,取消則不變更

  Rule: 電腦詳情 — 所屬環、升級狀態、立即升級

    @manual
    場景: 詳情顯示版本與升級狀態
      當 在「電腦清單」點選 "RUSTIT-P34" 並切到「健康與 Agent」Tab
      那麼 「版本與升級」區塊顯示所屬環、Agent 與 Watchdog 的目前版本、目標版本、升級狀態與最後錯誤(例如「簽章無效或未簽章」)

    @manual
    場景: 調整所屬環
      假如 使用者有 it.endpoint-device.admin 與 endpoint.command.admin
      當 把所屬環改為 pilot 並確認
      那麼 所屬環顯示 pilot;沒有「可管理所有公司」的角色時顯示主機的拒絕訊息

    @manual
    場景: 立即升級
      假如 這台電腦所屬環的 Agent 目標版本 0.8.1 高於目前版本
      當 按 Agent 那列「立即升級」並確認
      那麼 送出 agent.upgrade 指令,約 1 分鐘內升級狀態變為「下載中」或「安裝中」,完成後「已升級」
