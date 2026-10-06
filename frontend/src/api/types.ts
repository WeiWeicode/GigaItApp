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
  /** active / disabled */
  status: string;
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
}

/** Agent 最新一份資產快照(rustit-collector ComputerInfo,鍵名轉 camelCase;RustIt docs/contracts/inventory.schema.json) */
export interface EndpointInventory {
  system: { hostName: string; userName: string; domain: string; manufacturer: string; model: string; osName: string; osDisplayVersion: string; osBuild: string; arch: string; bootTime: number };
  identity: { biosSerial: string; systemUuid: string; boardManufacturer: string; boardProduct: string };
  cpu: { name: string; cores: number; logical: number; maxMhz: number };
  memoryTotal: number;
  memoryModules: { slot: string; capacity: number; speedMhz: number; manufacturer: string }[];
  physicalDisks: { model: string; size: number; interface: string; mediaType: string }[];
  volumes: { mountPoint: string; label: string; fileSystem: string; total: number; available: number; removable: boolean }[];
  gpus: { name: string; resolution: string }[];
  network: { description: string; mac: string; ips: string[]; gateways: string[]; dhcpEnabled: boolean }[];
  software: { name: string; version: string; publisher: string }[];
  security: { antivirus: { name: string; enabled: boolean; upToDate: boolean }[]; recentHotfixes: { id: string; installedOn: string }[] };
  warnings: string[];
}

/** 電腦詳情(GET /api/endpoint/devices/{deviceId}) */
export interface EndpointDeviceDetail extends EndpointDevice {
  /** 尚未回報資產時為 null */
  inventory: EndpointInventory | null;
  collectedAt: string | null;
}
