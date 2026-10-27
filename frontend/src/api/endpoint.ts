/**
 * 端點指令(RustIt ItAgentBack 經 BFF /api/endpoint/*;RustIt docs/contracts/command-kinds.md、ENDPOINT-AGENT-GUIDE §8.3–§8.4)。
 *   - 建立:POST /devices/{deviceId}/basic-commands(endpoint.command.basic)→ 202 + commandId;電腦離線時排隊,連線後送出
 *   - 查詢:GET /commands/{commandId}(執行中每 2 秒輪詢)、/devices/{deviceId}/commands、/commands(endpoint.device.read;nextCursor 分頁)
 *   - 取消:POST /commands/{commandId}/cancel(只能取消自己建立、仍在排隊的)
 *   - 日誌下載:GET /commands/{commandId}/files/{fileId}(瀏覽器直接下載,Cookie 驗證)
 * 指令只開放固定類型;結果一律以文字顯示(不用 v-html,RustIt P4-COMMAND-DESIGN §6.1)。
 * 電腦(RustIt P3,P3-DATA-DESIGN §3):清單分頁與篩選、事件、下載資產 JSON(endpoint.device.read);
 *   停用 / 啟用 / 退役 PUT /devices/{id}/status、合併 POST /devices/{id}/merge(endpoint.command.admin)。
 * 升級(RustIt P6,P6-UPGRADE-DESIGN §2、§7):版本登錄 / 發佈 / 撤回、發佈環目標版本(endpoint.software.manage;讀取 endpoint.device.read)、
 *   電腦所屬環 PUT /devices/{id}/ring 與立即升級 agent.upgrade(POST /devices/{id}/admin-commands,endpoint.command.admin)。
 * 監測(RustIt P5,P5-MONITOR-DESIGN §3.3):健康走勢 GET /devices/{id}/health、告警 GET /alerts(endpoint.device.read)、
 *   關閉告警 POST /alerts/{id}/resolve(endpoint.command.basic)。告警的 detail 來自端點回報,一律以文字顯示。
 */
import { fmtTime, fromNow } from '@/api/format';
import { ApiError, describeError, http, type Query } from '@/api/http';
import type {
  EndpointCommand,
  EndpointCommandKind,
  EndpointCommandPage,
  EndpointCommandState,
  EndpointAlert,
  EndpointAlertPage,
  EndpointAlertRule,
  EndpointBatch,
  EndpointBatchPage,
  EndpointBatchState,
  EndpointDeployResult,
  EndpointSoftware,
  EndpointSoftwareDetail,
  EndpointSoftwareFile,
  EndpointSoftwareStatus,
  EndpointDeviceEventPage,
  EndpointDevicePage,
  EndpointDeviceUpgrade,
  EndpointHealthSeries,
  EndpointRelease,
  EndpointReleaseComponent,
  EndpointReleaseFile,
  EndpointReleaseStatus,
  EndpointRing,
  EndpointRingTarget,
  EndpointUpgradeState,
} from '@/api/types';

const base = '/api/endpoint';

export const KIND_LABELS: Record<EndpointCommandKind, string> = {
  'inventory.collect': '立即蒐集資產',
  'agent.diagnose': '遠端診斷',
  'logs.collect': '收集日誌',
  'agent.log_level': '調整日誌等級',
  'message.show': '傳送訊息',
  'agent.restart': '重新啟動 Agent',
  'agent.upgrade': '立即升級',
  'software.install': '安裝軟體',
  'software.uninstall': '移除軟體',
  'system.reboot': '重新開機',
  'system.reboot.cancel': '取消重新開機',
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

/** 軟體安裝 A6 延後原因(Agent 0.9.3 `result.deferred.reason`) */
export const DEFER_LABELS: Record<string, string> = { battery: '電池供電', metered: '計量網路' };

/** 延後中的軟體安裝(running + result.deferred);其他回 null */
export function deferredOf(c: Pick<EndpointCommand, 'state' | 'result'>): { reason: string; nextCheckAt: string | null } | null {
  if (c.state !== 'running') return null;
  const d = c.result?.deferred as { reason?: unknown; next_check_at?: unknown } | undefined;
  if (!d || typeof d !== 'object') return null;
  const reason = typeof d.reason === 'string' ? d.reason : '';
  return { reason: DEFER_LABELS[reason] ?? reason, nextCheckAt: typeof d.next_check_at === 'string' ? d.next_check_at : null };
}

/** 指令狀態文字:延後中的軟體安裝顯示「延後中(原因)」而不是「執行中」(P7 驗收 §5-4) */
export function commandStateLabel(c: Pick<EndpointCommand, 'state' | 'result'>): string {
  const d = deferredOf(c);
  return d ? `延後中(${d.reason})` : STATE_LABELS[c.state];
}
export function commandStateTone(c: Pick<EndpointCommand, 'state' | 'result'>): (typeof STATE_TONES)[EndpointCommandState] {
  return deferredOf(c) ? 'warning' : STATE_TONES[c.state];
}

/** 參數 / payload 的值:物件與陣列用 JSON 顯示(不顯示 [object Object],P7 驗收 §6) */
export const paramText = (v: unknown): string => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v));

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
  // 軟體派送與重新開機(RustIt P7,command-kinds.md)
  DOWNLOAD_FAILED: '安裝檔下載失敗',
  HASH_MISMATCH: '安裝檔 SHA-256 不符,未安裝',
  SIGNATURE_INVALID: '安裝檔簽章無效或未簽章,未安裝',
  SIGNER_NOT_TRUSTED: '簽章者不在這台電腦的信任清單,未安裝',
  DISK_FULL: '磁碟空間不足',
  INSTALL_FAILED: '安裝 / 移除程式回報失敗(看結束代碼)',
  INSTALL_TIMEOUT: '安裝逾時,已結束安裝程式',
  INSTALL_BUSY: 'Windows Installer 仍在執行(等待後未啟動安裝,或 1618 重試後仍失敗)',
  DETECT_FAILED: '結束代碼成功,但偵測結果與預期不符',
  UNINSTALL_NOT_SUPPORTED: '找不到可用的移除方式,或此軟體不允許移除',
  DEFERRED_TIMEOUT: '電池 / 計量網路延後下載超過上限',
  REBOOT_LIMITED: '超過這台電腦的重新開機上限(開機未滿 30 分鐘、24 小時內 3 次,或有人登入時倒數少於 60 秒)',
  REBOOT_PENDING: '電腦重新開機倒數中,未執行',
  AGENT_UPGRADING: 'Agent 升級中,未執行',
  PACKAGE_REVOKED: '套件已撤回,指令取消',
  PACKAGE_CHANGED: '套件內容已修改,指令取消',
  PACKAGE_FILE_CHANGED: '軟體庫安裝檔被換掉,指令取消',
  BATCH_REJECTED: '批次被駁回,指令取消',
  APPROVAL_EXPIRED: '批次 24 小時無人核可,指令取消',
};

export const isFinal = (s: EndpointCommandState) => !['queued', 'sent', 'acked', 'running'].includes(s);

export const endpointApi = {
  /** 管理等級指令(目前只有 agent.upgrade,P6;endpoint.command.admin) */
  createAdmin: (deviceId: string, kind: EndpointCommandKind, params: Record<string, unknown> = {}) =>
    http.post<EndpointCommand>(`${base}/devices/${encodeURIComponent(deviceId)}/admin-commands`, { kind, params }),
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

// ---------- 電腦(RustIt P3) ----------

export type DeviceStatus = 'active' | 'disabled' | 'retired';

export const DEVICE_STATUS_LABELS: Record<DeviceStatus, string> = { active: '使用中', disabled: '已停用', retired: '已退役' };

/** 事件類型說明(主機稽核 + Agent 端點事件;RustIt ItAgentBack DeviceEventType、docs/contracts/event.schema.json) */
export const EVENT_LABELS: Record<string, string> = {
  registered: '首次連線登錄',
  fingerprint_changed: '憑證指紋變更',
  disabled: '停用',
  enabled: '啟用',
  retired: '退役',
  merged: '合併',
  duplicate_connection: '重複連線',
  clock_skew: '時鐘偏差',
  suspected_duplicate: '疑似同一台',
  usb_inserted: 'USB 插入',
  usb_removed: 'USB 移除',
  offline_period: '離線期間',
  agent_started: 'Agent 啟動',
  company_changed: '公司變更',
  // RustIt P5:主機比對資產
  software_installed: '安裝軟體',
  software_removed: '移除軟體',
  software_updated: '軟體更新',
  software_changed_bulk: '大量軟體變更',
  hardware_changed: '硬體變更',
  // RustIt P5-2:Watchdog 與 Agent 互相看守
  agent_restarted: 'Agent 重新啟動',
  agent_service_stopped: 'Agent 服務被停止',
  agent_start_type_changed: 'Agent 啟動類型被改',
  agent_binary_missing: 'Agent 程式不見',
  agent_binary_changed: 'Agent 程式被換',
  agent_start_failed: 'Agent 無法啟動',
  agent_pipe_impersonation: '本機管道被冒充',
  watchdog_stopped: 'Watchdog 被停止',
  watchdog_missing: 'Watchdog 不存在',
  watchdog_binary_changed: 'Watchdog 程式被換',
};

export const EVENT_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  disabled: 'danger',
  retired: 'danger',
  enabled: 'success',
  merged: 'info',
  company_changed: 'info',
  duplicate_connection: 'warning',
  clock_skew: 'warning',
  suspected_duplicate: 'warning',
  fingerprint_changed: 'warning',
  offline_period: 'warning',
  software_installed: 'info',
  software_removed: 'info',
  software_updated: 'info',
  software_changed_bulk: 'warning',
  hardware_changed: 'danger',
  agent_restarted: 'warning',
  agent_start_failed: 'danger',
  agent_service_stopped: 'danger',
  agent_start_type_changed: 'danger',
  agent_binary_missing: 'danger',
  agent_binary_changed: 'danger',
  agent_pipe_impersonation: 'danger',
  watchdog_stopped: 'danger',
  watchdog_missing: 'danger',
  watchdog_binary_changed: 'danger',
};

/** Windows 服務啟動類型(Watchdog / Agent 回報的 start_type) */
export const START_TYPE_LABELS: Record<string, string> = { auto: '自動', manual: '手動', disabled: '停用', missing: '—', unknown: '未知' };
export const startTypeLabel = (v: string) => START_TYPE_LABELS[v] ?? v;

// ---------- 告警(RustIt P5) ----------

export const ALERT_RULE_LABELS: Record<EndpointAlertRule, string> = {
  offline_long: '離線過久',
  disk_low: '磁碟空間不足',
  hardware_changed: '硬體變更',
  agent_restarts: 'Agent 反覆重啟',
  cert_expiring: '憑證即將到期',
  clock_skew: '時鐘偏差',
  agent_tampered: 'Agent / Watchdog 被變更',
  agent_silent: 'Agent 沒有回應',
};

export const ALERT_SEVERITY_LABELS: Record<EndpointAlert['severity'], string> = { critical: '嚴重', warn: '警告' };
export const ALERT_SEVERITY_TONES: Record<EndpointAlert['severity'], 'danger' | 'warning'> = { critical: 'danger', warn: 'warning' };
export const alertRuleLabel = (rule: string) => ALERT_RULE_LABELS[rule as EndpointAlertRule] ?? rule;

const HW_COMPONENTS: Record<string, string> = { memory: '記憶體', disk: '磁碟', gpu: '顯示卡', bios: 'BIOS', board: '主機板', cpu: 'CPU' };

type Data = Record<string, unknown>;
const txt = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const list = (v: unknown) => (Array.isArray(v) ? v.map(txt).join('、') : txt(v));

/** 事件類規則:同一台已有未結束告警時,後續事件只更新 last_seen_at,detail 保留第一次觸發(RustIt P5-MONITOR-DESIGN §8.1) */
const FIRST_DETAIL_RULES = new Set<string>(['hardware_changed', 'agent_tampered']);
export const alertDetailHint = (rule: string) => (FIRST_DETAIL_RULES.has(rule) ? '此為第一次觸發的內容,之後的事件請看電腦詳情的「事件」Tab' : undefined);

/** 告警 detail 摘要成一行文字(RustIt P5-MONITOR-DESIGN §4;內容來自端點,呼叫端以文字顯示) */
export function alertSummary(a: Pick<EndpointAlert, 'rule' | 'detail'>): string {
  const d = (a.detail && typeof a.detail === 'object' ? a.detail : {}) as Data;
  switch (a.rule) {
    case 'offline_long':
      return `最後回報 ${fmtTime(txt(d.lastSeenAt))}(${txt(d.days)} 天)`;
    case 'disk_low':
      return `${txt(d.drive) || '磁碟'} 剩餘 ${txt(d.freePct)}%`;
    case 'hardware_changed':
      return `首次:${HW_COMPONENTS[txt(d.component)] ?? txt(d.component)}:${list(d.before) || '—'} → ${list(d.after) || '—'}`;
    case 'agent_restarts':
      return `24 小時內非正常重啟 ${txt(d.restarts24h)} 次`;
    case 'cert_expiring': {
      const days = Number(d.days);
      return `到期 ${fmtTime(txt(d.certNotAfter))}(${Number.isFinite(days) && days < 0 ? '已過期' : `剩 ${txt(d.days)} 天`})`;
    }
    case 'clock_skew':
      return `端點時鐘與主機相差 ${Math.round(Number(d.clockSkewMs) / 1000)} 秒`;
    case 'agent_tampered': {
      const ev = EVENT_LABELS[txt(d.type)] ?? txt(d.type);
      const n = Number(d.count);
      return `首次:${ev}${Number.isFinite(n) && n > 1 ? `(同批 ${n} 筆)` : ''}`;
    }
    case 'agent_silent':
      return `Watchdog ${fromNow(txt(d.watchdogReportAt))}有回報,Agent 最後回報 ${fromNow(txt(d.lastSeenAt))}`;
    default:
      return Object.keys(d).length ? JSON.stringify(d) : '';
  }
}

export interface AlertListQuery extends Query {
  /** open(預設)/ resolved / all */
  state?: 'open' | 'resolved' | 'all';
  rule?: string;
  severity?: string;
  deviceId?: string;
  cursor?: string;
  limit?: number;
}

export const alertApi = {
  list: (query: AlertListQuery = {}) => http.get<EndpointAlertPage>(`${base}/alerts`, { query }),
  resolve: (alertId: string, note: string) => http.post<EndpointAlert>(`${base}/alerts/${encodeURIComponent(alertId)}/resolve`, { note }),
};

export interface DeviceListQuery extends Query {
  q?: string;
  software?: string;
  os?: string;
  online?: boolean;
  /** 逗號分隔;省略 = active,disabled */
  status?: string;
  page?: number;
  pageSize?: number;
}

export interface MergeResponse {
  deviceId: string;
  sourceDeviceId: string;
  alreadyMerged: boolean;
  events: number;
  commands: number;
  /** 兩台尚未完成、因合併取消的指令數 */
  canceledCommands: number;
  inventoryFrom: 'source' | 'target' | 'none';
}

export const deviceApi = {
  // 舊版 ItAgentBack(P3 前)只回 items:補上 total 等欄位,部署順序不同時清單仍可用
  list: async (query: DeviceListQuery = {}): Promise<EndpointDevicePage> => {
    const r = await http.get<Partial<EndpointDevicePage> & { items: EndpointDevicePage['items'] }>(`${base}/devices`, { query });
    return { items: r.items, total: r.total ?? r.items.length, page: r.page ?? 1, pageSize: r.pageSize ?? r.items.length };
  },
  events: (deviceId: string, query: Query = {}) => http.get<EndpointDeviceEventPage>(`${base}/devices/${encodeURIComponent(deviceId)}/events`, { query }),
  setStatus: (deviceId: string, status: DeviceStatus, reason: string) =>
    http.put<{ deviceId: string; status: DeviceStatus; changed: boolean }>(`${base}/devices/${encodeURIComponent(deviceId)}/status`, { status, reason }),
  merge: (deviceId: string, sourceDeviceId: string, reason: string, force = false) =>
    http.post<MergeResponse>(`${base}/devices/${encodeURIComponent(deviceId)}/merge`, { sourceDeviceId, reason, force }),
  /** 健康走勢(RustIt P5;hours 1–24) */
  health: (deviceId: string, hours = 24) => http.get<EndpointHealthSeries>(`${base}/devices/${encodeURIComponent(deviceId)}/health`, { query: { hours } }),
  /** 升級狀態(RustIt P6):所屬環、各元件目前 / 目標版本與最後錯誤 */
  upgrade: (deviceId: string) => http.get<EndpointDeviceUpgrade>(`${base}/devices/${encodeURIComponent(deviceId)}/upgrade`),
  /** 調整所屬環(endpoint.command.admin;進出 pilot 另需可管理所有公司) */
  setRing: (deviceId: string, ring: EndpointRing) =>
    http.put<EndpointDeviceUpgrade>(`${base}/devices/${encodeURIComponent(deviceId)}/ring`, { ring }),
};

/** 資產 JSON 下載網址(同網域,瀏覽器以 Cookie 驗證;BFF 權限 endpoint.device.read) */
export function inventoryJsonUrl(deviceId: string): string {
  return `${base}/devices/${encodeURIComponent(deviceId)}/inventory.json`;
}

// ---------- Agent 版本與發佈環(RustIt P6) ----------

export const RELEASE_COMPONENT_LABELS: Record<EndpointReleaseComponent, string> = { agent: 'Agent', watchdog: 'Watchdog' };
export const RELEASE_STATUS_LABELS: Record<EndpointReleaseStatus, string> = { draft: '草稿', published: '已發佈', revoked: '已撤回' };
export const RELEASE_STATUS_TONES: Record<EndpointReleaseStatus, 'neutral' | 'success' | 'danger'> = { draft: 'neutral', published: 'success', revoked: 'danger' };
export const RING_LABELS: Record<EndpointRing, string> = { pilot: 'pilot(IT 測試機)', it: 'it(IT 部門)', all: 'all(全公司)' };
export const RING_SHORT: Record<EndpointRing, string> = { pilot: 'pilot', it: 'it', all: 'all' };

export const UPGRADE_STATE_LABELS: Record<EndpointUpgradeState, string> = {
  pending: '等待開始',
  downloading: '下載中',
  verifying: '驗證中',
  installing: '安裝中',
  succeeded: '已升級',
  failed: '失敗',
  rolled_back: '已還原',
};
export const UPGRADE_STATE_TONES: Record<EndpointUpgradeState, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  pending: 'neutral',
  downloading: 'info',
  verifying: 'info',
  installing: 'info',
  succeeded: 'success',
  failed: 'danger',
  rolled_back: 'warning',
};

/** 升級錯誤代碼說明(RustIt docs/contracts/event.schema.json UpgradeErrorCode) */
export const UPGRADE_ERROR_LABELS: Record<string, string> = {
  DOWNLOAD_FAILED: '下載失敗',
  HASH_MISMATCH: 'SHA-256 或版本不符',
  SIGNATURE_INVALID: '簽章無效或未簽章',
  SIGNER_NOT_TRUSTED: '簽章者不受信任',
  PREPARE_TIMEOUT: 'Agent 收尾逾時',
  STOP_TIMEOUT: '停止服務逾時',
  REPLACE_FAILED: '替換檔案失敗',
  HEALTH_CHECK_FAILED: '新版啟動後不正常(已還原)',
  ROLLBACK_FAILED: '還原失敗',
  DISK_FULL: '磁碟空間不足',
};
export const upgradeErrorLabel = (code: string | null) => (code ? (UPGRADE_ERROR_LABELS[code] ?? code) : '');

/** 版本號由小到大比較(核心 x.y.z;預發行字尾較小),選單排序用 */
export function compareVersion(a: string, b: string): number {
  const core = (v: string) => (v.split('-')[0] ?? '').split('.').map((n) => Number(n) || 0);
  const [x, y] = [core(a), core(b)];
  for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
  const [pa, pb] = [a.includes('-'), b.includes('-')];
  return pa === pb ? a.localeCompare(b) : pa ? -1 : 1;
}

export const releaseApi = {
  list: (query: { component?: EndpointReleaseComponent; status?: EndpointReleaseStatus } = {}) => http.get<{ items: EndpointRelease[] }>(`${base}/releases`, { query }),
  /** 版本檔目錄中尚未登錄的檔案(簽章人員放進目錄後才會出現) */
  files: () => http.get<{ items: EndpointReleaseFile[] }>(`${base}/releases/files`),
  register: (body: { component: EndpointReleaseComponent; version: string; fileName: string; signerThumbprints: string[]; notes?: string }) =>
    http.post<EndpointRelease>(`${base}/releases`, body),
  // 後端 schema 不接受沒有 body 的 JSON POST:一律帶 {}
  publish: (releaseId: string) => http.post<EndpointRelease>(`${base}/releases/${encodeURIComponent(releaseId)}/publish`, {}),
  revoke: (releaseId: string) => http.post<EndpointRelease>(`${base}/releases/${encodeURIComponent(releaseId)}/revoke`, {}),
  rings: () => http.get<{ items: EndpointRingTarget[] }>(`${base}/release-rings`),
  /** targetVersion = null:不升級;pilot 未滿 24 小時就設 it / all 回 409 ITA_RING_TOO_EARLY,確認後帶 force */
  setRing: (ring: EndpointRing, component: EndpointReleaseComponent, targetVersion: string | null, force = false) =>
    http.put<EndpointRingTarget>(`${base}/release-rings/${ring}/${component}`, { targetVersion, force }),
};

/** 管理 API 錯誤代碼說明(軟體派送;錯誤提示補充用,describeError 之外的人話) */
export const SOFTWARE_API_ERRORS: Record<string, string> = {
  ITA_PACKAGE_NOT_PUBLISHED: '此套件尚未發佈,只能派送到 pilot 環的測試機',
  ITA_PACKAGE_REVOKED: '此套件已撤回,不能再安裝',
  ITA_PACKAGE_NOT_FOUND: '找不到此套件',
  ITA_PACKAGE_EXISTS: '同名同版本或同一檔案已登錄過',
  ITA_PACKAGE_NOT_TESTED: '還沒有 pilot 測試機以目前的檔案與參數安裝成功的紀錄',
  ITA_SIGNER_NOT_OBSERVED: '簽章者必須是測試機回報的實際簽章者',
  ITA_LICENSE_EXCEEDED: '超過授權數',
  ITA_APPROVER_SAME_AS_CREATOR: '核可人不可是批次建立人,請由另一位 IT 核可',
  ITA_APPROVAL_ROUTE_MISMATCH: '批次類型與核可路徑不符',
  ITA_BATCH_NOT_PENDING: '批次不是待核可,或已超過 24 小時核可期限',
  ITA_REVIEWER_SAME_AS_CREATOR: '發佈人不可是登錄人,請由另一位 IT 發佈',
  ITA_REVIEWER_SAME_AS_EDITOR: '發佈人不可是上次發佈以來修改過安裝參數的人',
  ITA_REVIEWER_NOT_PERSON: '發佈者需要有工號',
  ITA_SCOPE_ALL_REQUIRED: '需要可管理所有公司的角色',
  ITA_COMMAND_LIMIT: '這台電腦同類型的未結束指令已達上限',
};

/** 錯誤訊息:已知的管理 API 錯誤代碼補人話,其餘用 describeError */
export function softwareErrorText(e: unknown): string {
  const known = e instanceof ApiError ? SOFTWARE_API_ERRORS[e.code] : undefined;
  return known ? `${known}(${describeError(e)})` : describeError(e);
}

// ---------- 軟體派送(RustIt P7) ----------

export const SOFTWARE_STATUS_LABELS: Record<EndpointSoftwareStatus, string> = { draft: '草稿', tested: '已測試', published: '已發佈', revoked: '已撤回' };
export const SOFTWARE_STATUS_TONES: Record<EndpointSoftwareStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  draft: 'neutral',
  tested: 'info',
  published: 'success',
  revoked: 'danger',
};
export const INSTALLER_LABELS: Record<string, string> = { msi: 'MSI', inno: 'Inno Setup', nsis: 'NSIS', burn: 'WiX Burn', exe: '其他 exe(參數完全自訂)' };
export const DETECT_LABELS: Record<string, string> = { msi_product_code: 'MSI 產品代碼', display_name: '登錄檔顯示名稱(% 為萬用字元)' };
export const REBOOT_POLICY_LABELS: Record<string, string> = { never: '不需要(3010 只標記)', required: '安裝後需要重新開機' };
export const BATCH_STATE_LABELS: Record<EndpointBatchState, string> = {
  pending_approval: '待核可',
  running: '進行中',
  done: '已完成',
  rejected: '已駁回',
  expired: '逾期未核可',
};
export const BATCH_STATE_TONES: Record<EndpointBatchState, 'neutral' | 'info' | 'success' | 'danger' | 'warning'> = {
  pending_approval: 'warning',
  running: 'info',
  done: 'success',
  rejected: 'danger',
  expired: 'neutral',
};

/** 軟體派送批次走 /approve、/reject(endpoint.software.manage);其他批次(system.reboot)走 -command(endpoint.command.admin) */
export const isSoftwareBatchKind = (kind: string) => kind === 'software.install' || kind === 'software.uninstall';

export interface SoftwareBody {
  name: string;
  version: string;
  fileName: string;
  installerType: string;
  installArgs?: string;
  uninstallArgs?: string;
  detectType: string;
  detectValue: string;
  rebootPolicy: string;
  /** 安裝逾時(秒,300–7200;省略 = 1800) */
  timeoutSec?: number;
  licenseLimit: number | null;
  notes?: string;
}

/** 套件安裝逾時範圍(與 RustIt ItAgentBack 相同;主機會再驗) */
export const SOFTWARE_TIMEOUT_MIN = 300;
export const SOFTWARE_TIMEOUT_MAX = 7200;
export const SOFTWARE_TIMEOUT_DEFAULT = 1800;
/** 逾時輸入的錯誤訊息;通過回 null */
export const softwareTimeoutError = (v: string) => {
  const n = Number(v.trim());
  return v.trim() !== '' && Number.isInteger(n) && n >= SOFTWARE_TIMEOUT_MIN && n <= SOFTWARE_TIMEOUT_MAX
    ? null
    : `請填 ${SOFTWARE_TIMEOUT_MIN}–${SOFTWARE_TIMEOUT_MAX} 秒的整數`;
};

export const softwareApi = {
  list: (query: { status?: EndpointSoftwareStatus; q?: string } = {}) => http.get<{ items: EndpointSoftware[] }>(`${base}/software`, { query }),
  /** 軟體庫中尚未登錄的安裝檔(endpoint.software.manage) */
  files: () => http.get<{ items: EndpointSoftwareFile[] }>(`${base}/software/files`),
  get: (packageId: string) => http.get<EndpointSoftwareDetail>(`${base}/software/${encodeURIComponent(packageId)}`),
  register: (body: SoftwareBody) => http.post<EndpointSoftware>(`${base}/software`, body),
  update: (packageId: string, body: Partial<Pick<SoftwareBody, 'installArgs' | 'uninstallArgs' | 'detectType' | 'detectValue' | 'rebootPolicy' | 'timeoutSec' | 'licenseLimit' | 'notes'>>) =>
    http.put<EndpointSoftware>(`${base}/software/${encodeURIComponent(packageId)}`, body),
  markTested: (packageId: string, signerThumbprints: string[]) =>
    http.post<EndpointSoftware>(`${base}/software/${encodeURIComponent(packageId)}/mark-tested`, { signerThumbprints }),
  // 後端 schema 不接受沒有 body 的 JSON POST:一律帶 {}
  publish: (packageId: string) => http.post<EndpointSoftware>(`${base}/software/${encodeURIComponent(packageId)}/publish`, {}),
  revoke: (packageId: string) => http.post<EndpointSoftware>(`${base}/software/${encodeURIComponent(packageId)}/revoke`, {}),
  /** 多台批次派送(endpoint.command.admin);> 20 台進入待核可。同一個 Idempotency-Key 重送回傳同一批 */
  deploy: (packageId: string, body: { action: 'install' | 'uninstall'; deviceIds: string[]; ignorePower?: boolean }, idempotencyKey?: string) =>
    http.post<EndpointDeployResult>(`${base}/software/${encodeURIComponent(packageId)}/deploy`, body, idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
};

export const batchApi = {
  /** 批次清單(新到舊;RustIt P7-5 補);待核可清單用 state=pending_approval */
  list: (query: { state?: EndpointBatchState; cursor?: string; limit?: number } = {}) => http.get<EndpointBatchPage>(`${base}/batches`, { query }),
  get: (batchId: string) => http.get<EndpointBatch>(`${base}/batches/${encodeURIComponent(batchId)}`),
  approve: (batch: Pick<EndpointBatch, 'batchId' | 'kind'>) =>
    http.post<EndpointBatch>(`${base}/batches/${encodeURIComponent(batch.batchId)}/approve${isSoftwareBatchKind(batch.kind) ? '' : '-command'}`, {}),
  reject: (batch: Pick<EndpointBatch, 'batchId' | 'kind'>, reason: string) =>
    http.post<EndpointBatch>(`${base}/batches/${encodeURIComponent(batch.batchId)}/reject${isSoftwareBatchKind(batch.kind) ? '' : '-command'}`, { reason }),
};
