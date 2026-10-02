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

/** Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8.3 草案) */
export interface EndpointDevice {
  deviceId: string;
  computerName: string;
  certDn: string;
  certFingerprint: string;
  online: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}
