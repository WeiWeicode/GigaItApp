# language: zh-TW
# 電腦管理 › 待核可(ENDPOINT-MENU-PLAN §2.2 M2):集中列出待第二人核可的批次。API 見 RustIt docs/contracts/command-kinds.md
# 「第二人核可」、ItAgentBack GET /v1/batches(state=pending_approval,nextCursor);核可 / 駁回同 software.feature「超過 20 台進入待核可」。
功能: 端點管理 — 待核可批次
  為了不必到各處找等待核可的派送與重新開機
  身為 IT 管理員
  我要在「電腦管理 › 待核可」Tab 看到所有待核可批次,檢視明細後核可或駁回

  背景:
    假如 測試區 Gateway 已登記 it.endpoint-batch.list(tab,上層 it.endpoint-device.read)

  Rule: 權限 — Tab it.endpoint-batch.list(endpoint.device.read);核可 / 駁回沿用 it.endpoint-software.approve(軟體批次)與 it.endpoint-device.reboot(其他批次)

    @manual
    場景: 沒有 Tab 權限看不到「待核可」
      假如 使用者有 it.endpoint-device.read,沒有 it.endpoint-batch.list
      當 開啟「電腦管理」
      那麼 Tab 沒有「待核可」,直接輸入 /endpoint/devices/batches 被導到同頁第一個可看的 Tab

    @manual
    場景: 只有清單權限看不到核可按鈕
      假如 使用者有 it.endpoint-batch.list,沒有 it.endpoint-software.approve 與 it.endpoint-device.reboot
      當 開啟「待核可」Tab
      那麼 可以看到批次清單與「檢視」
      而且 沒有「核可」「駁回」按鈕

  Rule: 清單 — 後端分頁(nextCursor),只列 24 小時核可期限內、資料範圍內的批次

    @manual
    場景: 沒有待核可批次
      假如 主機沒有 pending_approval 的批次
      當 開啟「待核可」Tab
      那麼 顯示「沒有待核可的批次」與核可規則說明

    @manual
    場景: 列出待核可批次
      假如 有 51 個待核可批次(軟體安裝、軟體移除、重新開機)
      當 開啟「待核可」Tab
      那麼 每列顯示指令類型、內容(軟體名稱與版本或參數)、台數、建立人、建立時間、有效期限(「N 小時後到期」)
      而且 先列 50 筆,按「載入更多」後出現第 51 筆,按鈕消失

    @manual
    場景: 點列看批次明細
      當 點選一個批次
      那麼 對話框顯示狀態、參數、建立人、建立時間、核可期限與目標電腦清單(指令狀態)

  Rule: 核可 / 駁回 — 核可人不可是建立人(主機回 403 ITA_APPROVER_SAME_AS_CREATOR)

    @manual
    場景: 自己建立的批次不能核可
      假如 批次的建立人是自己
      當 開啟「待核可」Tab
      那麼 該列標示「我建立的」,「核可」停用並提示請另一位 IT 核可,另一個按鈕為「撤回」
      而且 清單下方說明核可人不可是建立人

    @manual
    場景: 另一位 IT 核可軟體批次
      假如 使用者有 it.endpoint-software.approve,批次由別人建立
      當 在「待核可」Tab 按「核可」並確認
      那麼 提示「批次已核可,開始送出」,批次從清單消失
      而且 清單重新從第一頁載入

    @manual
    場景: 「軟體目錄與派送」的待核可卡片照舊
      當 開啟「軟體管理 › 軟體目錄與派送」
      那麼 上方「待核可批次」卡片的欄位、核可 / 駁回與檢視行為與以前相同(只取前 50 筆、沒有「載入更多」)
      而且 期限顯示「N 小時後到期」(修正原本一律「剛剛到期」)
