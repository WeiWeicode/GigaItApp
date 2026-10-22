/** 回應型別:儀表板(itapp-api /api/it/dashboard/* 與前端以 BFF 管理 API 組成的區塊)、端點管理;BFF 管理 API 型別見 api/admin.ts */

export interface AuditEntry {
  id: number;
  at: string;
  type: 'operation' | 'login';
  actor: string;
  action: string;
  target: string | null;
  result: 'success' | 'failure';
  detail: string | null;
  ip: string | null;
}
/** 儀表板依區塊拆成多支 API,依 Tab 與捲動位置按需載入(composables/dashboard.ts) */
export interface DashboardOverview {
  generatedAt: string;
  mockSections: string[];
  kpis: { key: string; label: string; value: number | string; unit?: string; delta?: number; trend?: number[]; tone?: string; hint?: string }[];
  traffic: { hour: number; requests: number; errors: number }[];
  alerts: { level: string; title: string; at: string }[];
}
export interface DashboardWork {
  mockSections: string[];
  tickets: {
    id: string;
    title: string;
    dept: string;
    deptName: string;
    priority: 'high' | 'medium' | 'low';
    status: 'open' | 'in_progress' | 'resolved';
    updatedAt: string;
  }[];
  activity: AuditEntry[];
  activityScope: 'all' | 'self';
}
export interface DashboardGateway {
  mockSections: string[];
  gateway: {
    source: 'mock' | 'live';
    upstreams: number;
    routes: number;
    published: number;
    draft: number;
    deprecated: number;
    permissions: number;
    roles: number;
    liveVersion: number | null;
    bySystem: { system: string; count: number }[];
    byAuthMode: { mode: string; count: number }[];
  };
  services: { code: string; name: string; system: string; p95: number; availability: number; status: 'healthy' | 'degraded' }[];
}
export interface DashboardTeam {
  mockSections: string[];
  departments: { code: string; name: string; members: number; open: number; closed: number }[];
}

/**
 * 電腦清單一列(RustIt ItAgentBack GET /api/endpoint/devices;Gateway ENDPOINT-AGENT-GUIDE §8.3、RustIt INTEGRATION-PLAN §5)。
 * 只新增欄位;userName 起為 Agent 回報資產後才有值,尚未回報時為 null / 空陣列。
 */
export interface EndpointDevice {
  deviceId: string;
  computerName: string;
  certDn: string;
  certFingerprint: string;
  online: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  /** active / disabled / retired(退役,RustIt P3) */
  status: 'active' | 'disabled' | 'retired' | string;
  /** DOMAIN\user */
  userName: string | null;
  domain: string | null;
  osName: string | null;
  osVersion: string | null;
  manufacturer: string | null;
  model: string | null;
  cpuName: string | null;
  /** 位元組 */
  memoryTotal: number | null;
  /** IPv4,有閘道的網卡優先 */
  ips: string[];
  agentVersion: string | null;
  lastInventoryAt: string | null;
  /** 有其他裝置硬體指紋相同(疑似同一台:重灌、改名、換憑證;RustIt P3) */
  suspectedDuplicate?: boolean;
  /** 已併入的目標裝置 */
  mergedInto?: string | null;
  retiredAt?: string | null;
  /** 健康摘要(RustIt P5;在線取最近一則心跳,離線取最後落盤;舊版 Agent 為 null) */
  health?: EndpointHealth | null;
  /** 未結束的告警數(RustIt P5) */
  openAlerts?: number;
}

/** 健康摘要(RustIt P5-MONITOR-DESIGN §2.1;取不到的欄位省略) */
export interface EndpointHealth {
  at: string;
  cpuPct?: number;
  memUsedPct?: number;
  /** 最滿的固定磁碟剩餘百分比 */
  diskMinFreePct?: number;
  diskMinFreeDrive?: string;
  uptimeS?: number;
  agentRssMb?: number;
}

/** Watchdog 最近一次回報(RustIt P5-2) */
export interface EndpointWatchdog {
  version: string | null;
  reportAt: string | null;
  agentServiceState: string | null;
  agentStartType: string | null;
  agentStatusOk: boolean | null;
  agentLastError: string | null;
  agentRestarts24h: number | null;
}

// ---------- Agent 版本與升級(RustIt P6;P6-UPGRADE-DESIGN §1、§2、§7) ----------

export type EndpointReleaseComponent = 'agent' | 'watchdog';
export type EndpointReleaseStatus = 'draft' | 'published' | 'revoked';
export type EndpointRing = 'pilot' | 'it' | 'all';

/** 版本登錄(GET /api/endpoint/releases);sha256、sizeBytes 由主機讀檔計算 */
export interface EndpointRelease {
  releaseId: string;
  component: EndpointReleaseComponent;
  version: string;
  fileName: string;
  sha256: string;
  sizeBytes: number;
  signerThumbprints: string[];
  status: EndpointReleaseStatus;
  notes: string | null;
  createdBy: { emp: string; name: string | null };
  createdAt: string;
  publishedByEmp: string | null;
  publishedAt: string | null;
  revokedByEmp: string | null;
  revokedAt: string | null;
  /** 撤回回應才有:因此被改為「不升級」的環 */
  clearedRings?: EndpointRing[];
}

/** 版本檔目錄中尚未登錄的檔案(GET /api/endpoint/releases/files) */
export interface EndpointReleaseFile {
  component: EndpointReleaseComponent;
  version: string;
  fileName: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface EndpointRingProgress {
  total: number;
  atTarget: number;
  inProgress: number;
  failed: number;
  waiting: number;
}

/** 發佈環 × 元件的目標版本與進度(GET /api/endpoint/release-rings) */
export interface EndpointRingTarget {
  ring: EndpointRing;
  component: EndpointReleaseComponent;
  targetVersion: string | null;
  targetSetAt: string | null;
  updatedBy: { emp: string | null; name: string | null };
  updatedAt: string;
  progress: EndpointRingProgress;
}

export type EndpointUpgradeState = 'pending' | 'downloading' | 'verifying' | 'installing' | 'succeeded' | 'failed' | 'rolled_back';

/** 電腦的升級狀態(GET /api/endpoint/devices/{id}/upgrade) */
export interface EndpointDeviceUpgrade {
  deviceId: string;
  ring: EndpointRing;
  upgrades: {
    component: EndpointReleaseComponent;
    currentVersion: string | null;
    targetVersion: string | null;
    /** forced = agent.upgrade 指定的版本 */
    targetSource: 'forced' | 'ring' | null;
    state: EndpointUpgradeState | null;
    attempts: number;
    errorCode: string | null;
    errorMessage: string | null;
    forcedBy: string | null;
    updatedAt: string | null;
  }[];
}

export type EndpointAlertRule =
  'offline_long' | 'disk_low' | 'hardware_changed' | 'agent_restarts' | 'cert_expiring' | 'clock_skew' | 'agent_tampered' | 'agent_silent';

/** 告警(GET /api/endpoint/alerts;RustIt P5-MONITOR-DESIGN §4) */
export interface EndpointAlert {
  alertId: string;
  deviceId: string;
  computerName: string;
  rule: EndpointAlertRule | string;
  severity: 'warn' | 'critical';
  state: 'open' | 'resolved';
  openedAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  resolvedBy: 'auto' | 'manual' | null;
  resolvedByEmp: string | null;
  resolvedByName: string | null;
  resolveNote: string | null;
  /** 規則的數值與依據(端點回報的內容,一律以文字顯示) */
  detail: unknown;
}

export interface EndpointAlertPage {
  items: EndpointAlert[];
  nextCursor: string | null;
}

/** 健康走勢(GET /api/endpoint/devices/{deviceId}/health;5 分鐘分桶) */
export interface EndpointHealthSeries {
  deviceId: string;
  bucketSec: number;
  points: { at: string; cpuPct: number | null; memUsedPct: number | null; diskMinFreePct: number | null }[];
}

/** 電腦清單(GET /api/endpoint/devices;後端分頁,依電腦名稱排序) */
export interface EndpointDevicePage {
  items: EndpointDevice[];
  total: number;
  page: number;
  pageSize: number;
}

/** Agent 最新一份資產快照(rustit-collector ComputerInfo,鍵名轉 camelCase;RustIt docs/contracts/inventory.schema.json) */
export interface EndpointInventory {
  system: {
    hostName: string;
    userName: string;
    domain: string;
    partOfDomain: boolean;
    manufacturer: string;
    model: string;
    osName: string;
    osVersion: string;
    osDisplayVersion: string;
    osBuild: string;
    arch: string;
    bootTime: number;
  };
  identity: { biosSerial: string; biosVendor: string; biosVersion: string; boardManufacturer: string; boardProduct: string; boardSerial: string; systemUuid: string };
  cpu: { name: string; cores: number; logical: number; maxMhz: number };
  memoryTotal: number;
  memoryModules: { slot: string; capacity: number; speedMhz: number; manufacturer: string; partNumber: string }[];
  physicalDisks: { model: string; serial: string; size: number; interface: string; mediaType: string }[];
  volumes: { mountPoint: string; label: string; fileSystem: string; total: number; available: number; removable: boolean }[];
  gpus: { name: string; driverVersion: string; resolution: string }[];
  network: { description: string; mac: string; ips: string[]; gateways: string[]; dns: string[]; dhcpEnabled: boolean }[];
  software: { name: string; version: string; publisher: string; installDate: string }[];
  security: { antivirus: { name: string; enabled: boolean; upToDate: boolean }[]; recentHotfixes: { id: string; description: string; installedOn: string }[] };
  usb: { storagePolicy: 'Allowed' | 'Blocked' | 'Unknown' | string; storageHistory: { friendlyName: string; serial: string }[] };
  rustdesk: { installed: boolean; version: string; exePath: string; id: string; customServer: string };
  collectMs: number;
  warnings: string[];
}

/** 電腦詳情(GET /api/endpoint/devices/{deviceId}) */
export interface EndpointDeviceDetail extends EndpointDevice {
  /** 尚未回報資產時為 null */
  inventory: EndpointInventory | null;
  collectedAt: string | null;
  /** 端點 − 主機(毫秒);超過 ±5 分鐘會記 clock_skew 事件 */
  clockSkewMs?: number | null;
  /** 硬體指紋相同、未合併、未退役的其他裝置(RustIt P3) */
  suspectedDuplicates?: { deviceId: string; computerName: string; status: string; firstSeenAt: string; lastSeenAt: string }[];
  /** 裝置憑證到期日(RustIt P5) */
  certNotAfter?: string | null;
  /** Watchdog 最近一次回報(RustIt P5-2;尚未回報為 null) */
  watchdog?: EndpointWatchdog | null;
  /** 未結束的告警(RustIt P5) */
  alerts?: EndpointAlert[];
}

/** 電腦事件(GET /api/endpoint/devices/{deviceId}/events;新到舊,nextCursor 分頁) */
export interface EndpointDeviceEvent {
  id: number;
  type: string;
  /** 端點事件為端點上的發生時間 */
  occurredAt: string;
  /** 端點事件的主機收到時間;主機稽核為 null */
  receivedAt: string | null;
  detail: string | null;
  data: unknown;
}

export interface EndpointDeviceEventPage {
  items: EndpointDeviceEvent[];
  nextCursor: string | null;
}
/** 端點指令類型(RustIt docs/contracts/command-kinds.md;目前只開放 basic) */
export type EndpointCommandKind =
  | 'inventory.collect'
  | 'agent.diagnose'
  | 'logs.collect'
  | 'agent.log_level'
  | 'message.show'
  | 'agent.restart'
  | 'agent.upgrade'
  | 'software.install'
  | 'software.uninstall'
  | 'system.reboot'
  | 'system.reboot.cancel';
export type EndpointCommandState = 'queued' | 'sent' | 'acked' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'expired';

/** 指令附檔(logs.collect 的日誌 zip;保存 14 天) */
export interface EndpointCommandFile {
  fileId: string;
  fileName: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
}

/** 指令(GET /api/endpoint/commands/{commandId};result 依類型不同,一律以文字顯示) */
export interface EndpointCommand {
  commandId: string;
  batchId: string | null;
  /** 所屬批次狀態(RustIt P7);待核可的單台批次(同一人 24 小時累計超過門檻)也會是 pending_approval */
  batchState?: EndpointBatchState | null;
  deviceId: string;
  computerName: string;
  kind: EndpointCommandKind | string;
  level: 'basic' | 'admin';
  params: Record<string, unknown>;
  state: EndpointCommandState;
  progress: number | null;
  result: Record<string, unknown> | null;
  errorCode: string | null;
  errorMessage: string | null;
  expiresAt: string;
  sendCount: number;
  createdBy: { emp: string; name: string | null };
  requestId: string | null;
  createdAt: string;
  sentAt: string | null;
  ackedAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  /** 只有單筆查詢才回傳 */
  files?: EndpointCommandFile[];
}

/** 指令清單(新到舊;nextCursor 為下一頁游標) */
export interface EndpointCommandPage {
  items: EndpointCommand[];
  nextCursor: string | null;
}

// ---------- 軟體派送(RustIt P7;P7-SOFTWARE-DESIGN §3.5) ----------

export type EndpointSoftwareStatus = 'draft' | 'tested' | 'published' | 'revoked';
export type EndpointInstallerType = 'msi' | 'inno' | 'nsis' | 'burn' | 'exe';
export type EndpointDetectType = 'msi_product_code' | 'display_name';
export type EndpointRebootPolicy = 'never' | 'required';
export type EndpointBatchState = 'pending_approval' | 'running' | 'done' | 'rejected' | 'expired';

export interface EndpointSoftware {
  packageId: string;
  name: string;
  version: string;
  /** 軟體庫內相對路徑 {軟體}/{版本}/{檔名} */
  fileName: string;
  sha256: string;
  sizeBytes: number;
  installerType: EndpointInstallerType;
  installArgs: string | null;
  uninstallArgs: string | null;
  detectType: EndpointDetectType;
  detectValue: string;
  rebootPolicy: EndpointRebootPolicy;
  signerThumbprints: string[];
  observedSigners: string[];
  licenseLimit: number | null;
  /** 資料範圍內已安裝台數;只有已發佈套件才算,MSI 產品代碼無法計算為 null */
  installedCount: number | null;
  status: EndpointSoftwareStatus;
  notes: string | null;
  createdBy: { emp: string; name: string | null };
  createdAt: string;
  updatedByEmp: string | null;
  updatedAt: string | null;
  testedByEmp: string | null;
  testedAt: string | null;
  publishedBy: { emp: string; name: string | null } | null;
  publishedAt: string | null;
  revokedByEmp: string | null;
  revokedAt: string | null;
  /** 撤回時尚未送出而取消的安裝指令數(只有 revoke 回應有) */
  canceledCommands?: number;
}

export interface EndpointSoftwareFile {
  fileName: string;
  software: string;
  version: string;
  sizeBytes: number;
  modifiedAt: string;
}

export interface EndpointSoftwareTestResult {
  commandId: string;
  deviceId: string;
  computerName: string;
  state: string;
  errorCode: string | null;
  exitCode: number | null;
  signer: string | null;
  signerSubject: string | null;
  detected: boolean | null;
  /** 可作為 mark-tested 的依據 */
  qualifies: boolean;
  createdByEmp: string;
  finishedAt: string | null;
}

export interface EndpointSoftwareDetail extends EndpointSoftware {
  testResults: EndpointSoftwareTestResult[];
  installedDevices: { deviceId: string; computerName: string; name: string; version: string | null }[];
}

export interface EndpointDeployResult {
  batchId: string;
  state: EndpointBatchState;
  requiresApproval: boolean;
  commands: { deviceId: string; commandId: string; state: string }[];
}

/** 指令批次(GET /batches、/batches/{id};params 為建立批次時的參數) */
export interface EndpointBatch {
  batchId: string;
  kind: string;
  level: string;
  params: Record<string, unknown>;
  targetCount: number;
  maxConcurrent: number;
  state: EndpointBatchState;
  requiresApproval: boolean;
  approvalExpiresAt: string | null;
  approvedBy: { emp: string; name: string | null } | null;
  approvedAt: string | null;
  rejectedBy: { emp: string; name: string | null } | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  createdBy: { emp: string; name: string | null };
  createdAt: string;
  counts: Record<string, number>;
}

export interface EndpointBatchPage {
  items: EndpointBatch[];
  nextCursor: string | null;
}
