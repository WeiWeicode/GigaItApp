/**
 * 端點指令(RustIt ItAgentBack 經 BFF /api/endpoint/*;RustIt docs/contracts/command-kinds.md、ENDPOINT-AGENT-GUIDE §8.3–§8.4)。
 *   - 建立:POST /devices/{deviceId}/basic-commands(endpoint.command.basic)→ 202 + commandId;電腦離線時排隊,連線後送出
 *   - 查詢:GET /commands/{commandId}(執行中每 2 秒輪詢)、/devices/{deviceId}/commands、/commands(endpoint.device.read;nextCursor 分頁)
 *   - 取消:POST /commands/{commandId}/cancel(只能取消自己建立、仍在排隊的)
 *   - 日誌下載:GET /commands/{commandId}/files/{fileId}(瀏覽器直接下載,Cookie 驗證)
 * 指令只開放固定類型;結果一律以文字顯示(不用 v-html,RustIt P4-COMMAND-DESIGN §6.1)。
 */
import { http, type Query } from '@/api/http';
import type { EndpointCommand, EndpointCommandKind, EndpointCommandPage, EndpointCommandState } from '@/api/types';

const base = '/api/endpoint';

export const KIND_LABELS: Record<EndpointCommandKind, string> = {
  'inventory.collect': '立即蒐集資產',
  'agent.diagnose': '遠端診斷',
  'logs.collect': '收集日誌',
  'agent.log_level': '調整日誌等級',
  'message.show': '傳送訊息',
  'agent.restart': '重新啟動 Agent',
};

export const STATE_LABELS: Record<EndpointCommandState, string> = {
  queued: '排隊中',
  sent: '已送出',
  acked: '已收到',
  running: '執行中',
  succeeded: '成功',
  failed: '失敗',
  canceled: '已取消',
  expired: '已過期',
};

export const STATE_TONES: Record<EndpointCommandState, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  queued: 'neutral',
  sent: 'info',
  acked: 'info',
  running: 'info',
  succeeded: 'success',
  failed: 'danger',
  canceled: 'neutral',
  expired: 'warning',
};

/** 錯誤代碼說明(command-kinds.md) */
export const ERROR_LABELS: Record<string, string> = {
  UNSUPPORTED_COMMAND: 'Agent 版本不支援此指令',
  EXPIRED: '超過有效期限,未執行',
  TIMEOUT: 'Agent 未在時限內回報結果',
  INVALID_PARAMS: '參數不正確',
  NO_ACTIVE_SESSION: '電腦目前沒有登入的使用者',
  NOT_RUNNING_AS_SERVICE: 'Agent 不是以服務執行,無法重新啟動',
  NO_LOGS: '指定天數內沒有日誌',
  UPLOAD_FAILED: '日誌上傳失敗',
  EXECUTION_FAILED: '執行失敗',
};

export const isFinal = (s: EndpointCommandState) => !['queued', 'sent', 'acked', 'running'].includes(s);

export const endpointApi = {
  create: (deviceId: string, kind: EndpointCommandKind, params: Record<string, unknown> = {}) =>
    http.post<EndpointCommand>(`${base}/devices/${encodeURIComponent(deviceId)}/basic-commands`, { kind, params }),
  get: (commandId: string) => http.get<EndpointCommand>(`${base}/commands/${encodeURIComponent(commandId)}`),
  cancel: (commandId: string) => http.post<EndpointCommand>(`${base}/commands/${encodeURIComponent(commandId)}/cancel`),
  listByDevice: (deviceId: string, query: Query = {}) =>
    http.get<EndpointCommandPage>(`${base}/devices/${encodeURIComponent(deviceId)}/commands`, { query }),
  list: (query: Query = {}) => http.get<EndpointCommandPage>(`${base}/commands`, { query }),
};

/** 日誌下載網址(同網域,瀏覽器以 Cookie 驗證;BFF 權限 endpoint.device.read) */
export function commandFileUrl(commandId: string, fileId: string): string {
  return `${base}/commands/${encodeURIComponent(commandId)}/files/${encodeURIComponent(fileId)}`;
}
