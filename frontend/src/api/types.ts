/** 後端回應型別(對應 backend/src/routes/*、backend/src/bff/types.ts) */

export type Source = { source: 'mock' | 'live'; fetchedAt: string };

export interface BffUpstream {
  code: string;
  name: string;
  systemCode: string;
  timeoutMs: number;
  targets: { baseUrl: string; environment: string }[];
  routes: Record<string, number>;
}
export interface BffPolicy {
  code: string;
  limitCount: number;
  windowSec: number;
  keyBy: string;
}
export interface BffOverview extends Source {
  upstreams: BffUpstream[];
  policies: BffPolicy[];
  release: { liveVersion: number | null; redisVersion: number | null; draftRoutes: number };
}
export interface BffRoute {
  routeCode: string;
  name: string;
  systemCode: string;
  method: string;
  publicPath: string;
  routeType: string;
  upstream: string | null;
  /** 開發專案(repo 資料夾名稱);未登記或非 proxy 路由為 null */
  project: string | null;
  upstreamPath: string | null;
  authMode: string;
  permissionCode: string | null;
  status: string;
  tags: string | null;
  description: string | null;
  /** 行為規格(Gherkin 場景文字) */
  gherkin: string | null;
}
export interface BffRelease {
  releaseId: number;
  note: string | null;
  publishedBy: string;
  publishedAt: string;
  rolledBackFrom: number | null;
  diff: { added: string[]; modified: string[]; removed: string[]; upstreamsChanged: boolean; policiesChanged: boolean } | null;
}
export interface BffRbac extends Source {
  roles: { code: string; name: string; description: string | null; isSystem: boolean }[];
  permissions: { code: string; name: string; systemCode: string; description: string | null }[];
  rolePermissions: { role: string; permission: string }[];
  roleAdGroups: { role: string; adGroupDn: string }[];
  roleCompanies: { role: string; company: string }[];
}
export interface BffWhoCanAccess extends Source {
  permission: string;
  exists: boolean;
  name?: string;
  roles: { code: string; name: string; everyone: boolean; adGroups: string[]; companies: string[]; users: string[] }[];
}

export type LevelCode = 'admin' | 'manager' | 'senior' | 'engineer';
export interface Level {
  code: LevelCode;
  name: string;
  rank: number;
  description: string;
}
export interface Department {
  code: string;
  name: string;
  description: string;
  leadEmployeeNo: string | null;
}
export interface UserRow {
  id: number;
  employeeNo: string;
  name: string;
  email: string | null;
  title: string | null;
  deptCode: string;
  level: LevelCode;
  isDisabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}
export interface PermissionDef {
  code: string;
  name: string;
  module: string;
  type: 'page' | 'button';
  description: string;
}
export interface RbacCatalog {
  levels: Level[];
  modules: { code: string; name: string }[];
  departments: { code: string; name: string }[];
  permissions: PermissionDef[];
  levelPermissions: Record<LevelCode, string[]>;
  deptRestrictions: Record<string, string[]>;
  menus: { key: string; title: string; icon: string; children: { key: string; title: string; path: string; permission: string }[] }[];
}
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
/** 儀表板依區塊拆成多支 API,依 Tab 與捲動位置按需載入(backend/src/routes/dashboard.ts) */
export interface DashboardOverview {
  generatedAt: string;
  mockSections: string[];
  kpis: { key: string; label: string; value: number; unit: string; delta: number; trend: number[]; tone: string }[];
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

/** 後端分頁回應 */
export interface PagedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
export type BffRoutePage = Source & PagedResponse<BffRoute> & { facets: { systems: string[]; upstreams: string[]; totalAll: number } };
export type BffReleasePage = Source & PagedResponse<BffRelease>;
