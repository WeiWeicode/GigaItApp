# language: zh-TW
# RustIt P5-3:端點監測畫面。告警規則與 API 見 RustIt docs/P5-MONITOR-DESIGN.md §3.3、§4、§7;API 經 BFF /api/endpoint/*。
功能: 端點管理 — 健康、告警與監測事件
  為了及早發現電腦資源不足、硬體被更換或 Agent 被停用
  身為 IT 人員
  我要在電腦清單看到健康摘要與未結束告警數,在詳情看健康走勢,並在「告警」Tab 查詢與關閉告警

  背景:
    假如 測試區 Gateway 已發佈 ItAgentBack 的 /alerts、/devices/{id}/health 路由
    而且 電腦 "RUSTIT-P34" 的 Agent 0.6.0 與 Watchdog 0.1.0 已經由 :9443 連線

  Rule: 權限 — Tab it.endpoint-alert.list(endpoint.device.read)、按鈕 it.endpoint-alert.resolve(endpoint.command.basic)

    @manual
    場景: 電腦清單顯示健康摘要與告警數
      假如 "S112009" 擁有角色 it-admin
      當 開啟「電腦清單」
      那麼 "RUSTIT-P34" 的「健康」欄顯示 CPU、記憶體與磁碟剩餘百分比
      而且 電腦名稱旁顯示未結束告警數

    @manual
    場景: 詳情「健康與 Agent」Tab
      當 在「電腦清單」點選 "RUSTIT-P34" 並切到「健康與 Agent」Tab
      那麼 看到目前健康、Agent 與 Watchdog 版本、服務狀態與啟動類型、24 小時走勢
      而且 看到這台電腦未結束的告警;事件類告警的內容以「首次:」開頭

    @manual
    場景: 事件 Tab 顯示監測事件的中文名稱
      當 切到「事件」Tab
      那麼 "agent_service_stopped" 顯示為「Agent 服務被停止」,內容含「已重新啟動,啟動類型 自動」
      而且 "software_removed" 顯示為「移除軟體」

    @manual
    場景: 在「告警」Tab 關閉告警
      假如 "RUSTIT-P34" 有未結束的「Agent / Watchdog 被變更」告警
      當 在「告警」Tab 按「關閉」並填寫確認說明
      那麼 告警狀態變為已關閉,顯示確認人與說明

    @manual
    場景: 告警已被別人關閉
      假如 另一位 IT 人員已關閉同一筆告警
      當 我送出關閉
      那麼 提示「告警已不是未結束狀態」並重新整理清單
