# language: zh-TW
# RustIt P7-5:軟體派送。API 與規則見 RustIt docs/P7-SOFTWARE-DESIGN.md §3.5、§6 與 docs/contracts/command-kinds.md;經 BFF 呼叫 /api/endpoint/software*、/batches*、/devices/{id}/admin-commands。
功能: 端點管理 — 軟體派送
  為了安全地把軟體裝到公司電腦,並讓大量派送與重新開機有第二人把關
  身為 IT 管理員
  我要在「軟體派送」Tab 管理軟體目錄、派送、核可批次,並在電腦詳情重新開機

  背景:
    假如 測試區 Gateway 已發佈 ItAgentBack 的 /software、/batches 路由
    而且 軟體庫有已測試過的安裝檔

  Rule: 權限 — Tab it.endpoint-software.list(endpoint.device.read);管理 / 派送 / 核可 / 重新開機各自的按鈕權限

    @manual
    場景: 沒有 Tab 權限看不到「軟體派送」
      假如 使用者沒有 it.endpoint-software.list
      當 開啟「電腦清單」
      那麼 Tab 沒有「軟體派送」,直接輸入 /endpoint/devices/software 被導回

    @manual
    場景: 只有唯讀權限看不到動作按鈕
      假如 使用者有 it.endpoint-software.list 但沒有 manage / deploy / approve
      當 開啟「軟體派送」Tab
      那麼 可以看到待核可批次與軟體目錄、詳情
      而且 沒有「登錄套件」「派送軟體」「核可」「發佈」按鈕

  Rule: 軟體目錄與兩人覆核

    @manual
    場景: 登錄 → pilot 測試 → 標記測試完成 → 另一位 IT 發佈
      假如 軟體庫有 7-Zip/24.09/7z2409-x64.msi 且電腦 PC-PILOT 在 pilot 環
      當 IT 甲「登錄套件」挑選該檔案,偵測規則填 7-Zip%
      而且 把草稿派送到 PC-PILOT 並安裝成功
      而且 在詳情的 pilot 測試機結果看到「可作為依據」,預期簽章者帶入測試機回報值,按「標記測試完成」
      那麼 套件狀態為「已測試」
      當 IT 甲自己開啟詳情
      那麼 「發佈」按鈕停用,提示登錄人不能發佈
      當 IT 乙開啟詳情確認完整安裝參數、簽章者與 SHA-256 後按「發佈」
      那麼 套件狀態為「已發佈」

    @manual
    場景: 已測試 / 已發佈的套件修改安裝參數會退回草稿
      假如 7-Zip 24.09 已發佈
      當 IT 在詳情修改額外安裝參數並儲存
      那麼 先出現「修改會讓套件退回草稿」確認
      而且 確認後狀態為「草稿」,需重新測試與覆核

  Rule: 派送

    @manual
    場景: 草稿套件只能派送到 pilot 環
      假如 7-Zip 24.09 為草稿
      當 IT 選擇一台不在 pilot 環的電腦安裝
      那麼 顯示「此套件尚未發佈,只能派送到 pilot 環的測試機」

    @manual
    場景: 單台與多台派送
      假如 7-Zip 24.09 已發佈
      當 在「派送軟體」對話框選 1 台並按「安裝」
      那麼 透過 admin-commands 建立單台指令
      當 選 3 台並按「安裝」
      那麼 透過 /software/{id}/deploy 建立批次,電腦離線時排隊

  Rule: 批次第二人核可(> 20 台,或同一人 24 小時累計超過 20 台)

    @manual
    場景: 超過 20 台進入待核可,由另一位核可
      假如 IT 甲對 21 台電腦派送已發佈的 7-Zip
      那麼 批次出現在「待核可批次」,指令不送出,指令列顯示「待核可」
      當 IT 甲嘗試核可
      那麼 「核可」按鈕停用,只能「撤回」
      當 IT 乙按「檢視」確認參數與目標電腦後按「核可」
      那麼 批次開始送出,從待核可清單消失

    @manual
    場景: 重新開機批次走 approve-command
      假如 IT 甲建立了超過門檻的 system.reboot 批次
      當 擁有 it.endpoint-device.reboot 的 IT 乙核可
      那麼 呼叫 /batches/{id}/approve-command 並成功

  Rule: 電腦詳情的重新開機

    @manual
    場景: 重新開機與取消
      假如 使用者有 it.endpoint-device.reboot
      當 在電腦詳情「指令」Tab 按「重新開機…」,選 5 分鐘並按確認
      那麼 建立 system.reboot 指令(delay_sec = 300、force = false)
      當 勾選「強制關閉應用程式」並送出
      那麼 先出現強制重新開機的二次確認
      當 按「取消重新開機」並確認
      那麼 建立 system.reboot.cancel 指令

  Rule: 上傳與簽章(RustIt S1-4)

    @manual
    場景: 上傳安裝檔後由另一位 IT 核可送簽
      假如 IT 甲有 it.endpoint-software.upload 且可管理所有公司
      當 IT 甲在「上傳與簽章」Tab 按「上傳安裝檔」,選 npp.8.7.1.Installer.x64.exe,軟體填 "Notepad++"、版本填 "8.7.1" 並上傳
      那麼 顯示上傳進度,完成後清單出現「待核可」的 Notepad++/8.7.1/npp.8.7.1.Installer.x64.exe
      而且 IT 甲看到的「核可」按鈕停用
      當 IT 乙按「核可」並在確認視窗核對 SHA-256
      那麼 狀態變為「送簽中」

    @manual
    場景: 駁回並顯示原因
      假如 有一筆「待核可」的上傳
      當 IT 乙按「駁回」並填原因
      那麼 狀態變為「已駁回」,詳情以文字顯示駁回原因

    @manual
    場景: 簽章完成後登錄套件
      假如 簽章工作站完成重簽,狀態為「已簽章」
      當 IT 在「軟體派送」按「登錄套件」並選該檔案
      那麼 顯示上傳者、核可人與原廠簽章者(工作站回報,未驗證)
      而且 可以登錄

    @manual
    場景: 尚未簽章的檔案不能登錄
      假如 某安裝檔的上傳紀錄為「送簽中」但檔案已在軟體庫
      當 IT 嘗試登錄該檔案
      那麼 顯示「完成簽章前不能登錄」並被主機拒絕(ITA_UPLOAD_NOT_SIGNED)
