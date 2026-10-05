/**
 * Gateway BFF 管理 API(Gateway PRD §8.7;以使用者本人的登入呼叫,寫入的稽核記錄實際操作人)。
 * 回應形狀對應 giga-api-gateway-bff/bff/src/modules/admin/*.ts;修改與停用需帶 rowVer(樂觀鎖,不符回 409 VERSION_CONFLICT)。
 * 路由、上游、限流政策的修改只寫資料庫,於「發佈版本」發佈後才生效(PRD §8.4.3)。
 */
import { http, type Query } from './http';

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ───────── 上游 / 路由 / 限流 ─────────

export interface UpstreamTarget {
  targetId: number;
  baseUrl: string;
  weight: number;
  isEnabled: boolean;
}
export interface Upstream {
  upstreamId: number;
  code: string;
  name: string;
  systemCode: string;
  protocol: string;
  lbStrategy: string;
  timeoutMs: number;
  retryCount: number;
  circuitFailThreshold: number;
  healthCheckPath: string | null;
  tlsVerify: boolean;
  forwardCookies: boolean;
  owner: string | null;
  project: string | null;
  isEnabled: boolean;
  description: string | null;
  updatedAt: string;
  updatedBy: string;
  rowVer: string;
  /** 未停用的路由數 */
  routes: number;
  /** 本區(GW_ENV)位址 */
  targets: UpstreamTarget[];
}
export type UpstreamInput = Partial<
  Pick<
    Upstream,
    'name' | 'systemCode' | 'timeoutMs' | 'retryCount' | 'circuitFailThreshold' | 'healthCheckPath' | 'owner' | 'project' | 'description' | 'isEnabled'
  >
> & { targets?: { baseUrl: string; weight?: number; isEnabled?: boolean }[] };

export interface RouteRow {
  routeId: number;
  routeCode: string;
  name: string;
  systemCode: string;
  method: string;
  publicPath: string;
  routeType: 'proxy' | 'aggregate' | 'mock';
  upstreamCode: string | null;
  authMode: 'public' | 'authenticated' | 'permission' | 'api_key';
  permissionCode: string | null;
  status: 'draft' | 'published' | 'deprecated' | 'disabled';
  source: string;
  tags: string | null;
  updatedAt: string;
  updatedBy: string;
  rowVer: string;
}
export interface RouteDetail extends RouteRow {
  upstreamId: number | null;
  upstreamMethod: string | null;
  upstreamPath: string | null;
  rateLimitPolicyId: number | null;
  rateLimitPolicy: string | null;
  timeoutMs: number | null;
  cacheTtlSec: number | null;
  auditLevel: string;
  owner: string | null;
  description: string | null;
  gherkin: string | null;
  mockResponse: unknown;
  steps: { stepKey: string; stepOrder: number; upstreamCode: string; method: string; pathTemplate: string; required: boolean }[];
}
export type RouteInput = Partial<
  Pick<
    RouteDetail,
    | 'name'
    | 'systemCode'
    | 'method'
    | 'publicPath'
    | 'routeType'
    | 'upstreamId'
    | 'upstreamPath'
    | 'authMode'
    | 'permissionCode'
    | 'rateLimitPolicyId'
    | 'timeoutMs'
    | 'description'
    | 'tags'
  >
> & { routeCode?: string; status?: 'draft' | 'deprecated' };

export interface RouteTestResult {
  routeCode: string;
  routeStatus: string;
  authMode: string;
  permissionCode: string | null;
  /** 目前使用者實際呼叫時是否會被允許 */
  wouldBeAllowed: boolean;
  request: { method: string; path: string };
  upstream?: { code: string; method: string; path: string; targets: string[] };
  response?: { status: number; headers: Record<string, string>; body: unknown; truncated: boolean };
  error?: { code: string; message: string };
  durationMs?: number;
}

export interface RoutePolicy {
  policyId: number;
  code: string;
  limitCount: number;
  windowSec: number;
  keyBy: 'user' | 'ip' | 'client' | 'route';
  burst: number | null;
  routes: number;
  rowVer: string;
}

export interface ReleaseDiff {
  added: string[];
  modified: string[];
  removed: string[];
  upstreamsChanged: boolean;
  policiesChanged: boolean;
}
export interface Release {
  version: number;
  publishedBy: string;
  publishedAt: string;
  note: string | null;
  rolledBackFrom: number | null;
  diff: ReleaseDiff | null;
}
export interface ReleasePreview {
  currentVersion: number;
  drafts: { routeId: number; routeCode: string; name: string; updatedAt: string; updatedBy: string }[];
  diff: ReleaseDiff;
  changed: boolean;
}

export const gw = {
  upstreams: () => http.get<{ environment: string; items: Upstream[] }>('/api/admin/upstreams'),
  createUpstream: (body: UpstreamInput & { code: string; name: string; systemCode: string }) => http.post<Upstream>('/api/admin/upstreams', body),
  updateUpstream: (id: number, rowVer: string, body: UpstreamInput) => http.patch<Upstream>(`/api/admin/upstreams/${id}`, { ...body, rowVer }),
  healthCheck: (id: number) =>
    http.post<{ upstream: string; path: string; results: { baseUrl: string; ok: boolean; status: number | null; ms: number; error?: string }[] }>(
      `/api/admin/upstreams/${id}/health-check`,
    ),
  routes: (query: { q?: string; system?: string; status?: string; upstreamId?: number; page: number; pageSize: number }) =>
    http.get<Paged<RouteRow>>('/api/admin/routes', { query }),
  route: (id: number) => http.get<RouteDetail>(`/api/admin/routes/${id}`),
  createRoute: (body: RouteInput) => http.post<RouteDetail>('/api/admin/routes', body),
  updateRoute: (id: number, rowVer: string, body: RouteInput) => http.patch<RouteDetail>(`/api/admin/routes/${id}`, { ...body, rowVer }),
  disableRoute: (id: number, rowVer: string) => http.delete<RouteDetail>(`/api/admin/routes/${id}`, { query: { rowVer } }),
  /** 試打(以目前使用者身分呼叫本區上游,草稿亦可;PRD §8.7 v0.11) */
  testRoute: (id: number, body: { path?: string; method?: string; query?: string; body?: unknown }) =>
    http.post<RouteTestResult>(`/api/admin/routes/${id}/test`, body),
  routeWho: (id: number) => http.get<{ route: RouteRow; summary: string; access: WhoCanAccess | null }>(`/api/admin/routes/${id}/who-can-access`),
  policies: () => http.get<{ items: RoutePolicy[] }>('/api/admin/rate-limit-policies'),
  releases: () => http.get<{ items: Release[] }>('/api/admin/releases'),
  releasePreview: () => http.get<ReleasePreview>('/api/admin/releases/preview'),
  publish: (note: string) => http.post<{ version: number; diff: ReleaseDiff; redisSynced: boolean }>('/api/admin/releases', { note }),
  rollback: (version: number, note: string) => http.post<{ version: number; rolledBackFrom: number }>(`/api/admin/releases/${version}/rollback`, { note }),
};

// ───────── 權限 / 角色 / 規則 ─────────

export interface Permission {
  permissionId: number;
  code: string;
  name: string;
  systemCode: string;
  description: string | null;
  kind: 'app' | 'menu' | 'tab' | 'button' | 'api' | string;
  parentCode: string | null;
  sort: number | null;
  rowVer: string;
}
export interface PermNode {
  code: string;
  name: string;
  kind: string;
  sort: number | null;
  children: PermNode[];
}
export interface Role {
  roleId: number;
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: number;
  rules: number;
  adGroups: number;
  companies: number;
  rowVer: string;
}
export interface RoleRule {
  ruleId: number;
  companyId: number | null;
  deptCode: string | null;
  includeSubDepts: boolean;
  jobLevels: string[] | null;
  title: string | null;
  description: string | null;
  isEnabled: boolean;
  updatedAt: string;
  updatedBy: string;
}
export type RoleRuleInput = Partial<Omit<RoleRule, 'ruleId' | 'updatedAt' | 'updatedBy'>>;
export interface WhoCanAccess {
  permission: string;
  exists: boolean;
  name?: string;
  kind?: string;
  roles: {
    code: string;
    name: string;
    everyone: boolean;
    adGroups: string[];
    companies: string[];
    rules: { ruleId: number; company: string | null; deptCode: string | null; includeSubDepts: boolean; jobLevels: string[] | null; title: string | null }[];
    users: { employeeNo: string; name: string; validTo: string | null }[];
  }[];
  /** 直接授予的部門 / 個人(v0.12) */
  direct?: {
    departments: { deptCode: string; name: string; jobTier: string; includeSubDepts: boolean }[];
    users: { employeeNo: string; name: string; validTo: string | null; reason: string | null }[];
  };
  apiClients: { code: string; name: string; active: boolean }[];
}
/** 職級門檻(GET /api/admin/job-tiers):全員 / 課級 / 理級 / 處級以上;maxLevel = 職級上限(含),null = 不限 */
export interface JobTier {
  code: string;
  name: string;
  maxLevel: number | null;
}
export interface DeptPermissions {
  deptCode: string;
  name: string;
  includeSubDepts: boolean;
  direct: { code: string; jobTier: string }[];
  /** 自上層部門(含下層)繼承,不能在此取消 */
  inherited: { code: string; jobTier: string; fromDept: string; fromName: string }[];
}
export interface UserPermissionGrant {
  code: string;
  /** null = 永久 */
  validTo: string | null;
  reason: string | null;
  createdBy?: string;
  createdAt?: string;
}
export interface UserPermissions {
  user: {
    userId: number;
    employeeNo: string;
    displayName: string;
    deptCode: string | null;
    department: string | null;
    title: string | null;
    jobLevel: string | null;
  };
  grants: UserPermissionGrant[];
}
export interface AppReg {
  code: string;
  name: string;
  basePath: string;
  icon: string | null;
  sort: number;
  permissionCode: string;
  isEnabled: boolean;
}
export interface DeptNode {
  deptCode: string;
  name: string;
  companyId: number | null;
  userCount: number;
  children: DeptNode[];
}
export interface Company {
  companyId: number;
  compName: string;
  fullName?: string | null;
  empPrefix?: string | null;
  isEnabled: boolean;
  users?: number;
  domains?: string[];
  roles?: string[];
}
export interface RoleSource {
  code: string;
  /** default / ad_group / company / rule / user */
  sources: string[];
  ruleIds: number[];
}
export interface RbacPreview {
  subject: Record<string, unknown>;
  roles: RoleSource[];
  permissions: string[];
  apps: { code: string; name: string; basePath: string; icon: string | null }[];
}

export const rbac = {
  permissions: (query: { system?: string } = {}) => http.get<{ items: Permission[] }>('/api/admin/permissions', { query }),
  permissionTree: (app?: string) => http.get<{ items: PermNode[] }>('/api/admin/permissions', { query: { tree: 1, app } }),
  createPermission: (body: { code: string; name: string; kind?: string; parentCode?: string | null; sort?: number | null; description?: string | null }) =>
    http.post<Permission>('/api/admin/permissions', body),
  updatePermission: (
    code: string,
    rowVer: string,
    body: { name?: string; kind?: string; parentCode?: string | null; sort?: number | null; description?: string | null },
  ) => http.patch<Permission>(`/api/admin/permissions/${encodeURIComponent(code)}`, { ...body, rowVer }),
  roles: () => http.get<{ items: Role[] }>('/api/admin/roles'),
  createRole: (body: { code: string; name: string; description?: string | null }) => http.post<Role>('/api/admin/roles', body),
  updateRole: (role: string, rowVer: string, body: { name?: string; description?: string | null }) =>
    http.patch<Role>(`/api/admin/roles/${encodeURIComponent(role)}`, { ...body, rowVer }),
  deleteRole: (role: string, rowVer: string) => http.delete(`/api/admin/roles/${encodeURIComponent(role)}`, { query: { rowVer } }),
  rolePermissions: (role: string) => http.get<{ role: string; permissions: string[] }>(`/api/admin/roles/${encodeURIComponent(role)}/permissions`),
  setRolePermissions: (role: string, permissions: string[]) =>
    http.put<{ role: string; permissions: string[] }>(`/api/admin/roles/${encodeURIComponent(role)}/permissions`, { permissions }),
  rules: (role: string) => http.get<{ role: string; items: RoleRule[] }>(`/api/admin/roles/${encodeURIComponent(role)}/rules`),
  createRule: (role: string, body: RoleRuleInput) => http.post<RoleRule>(`/api/admin/roles/${encodeURIComponent(role)}/rules`, body),
  updateRule: (role: string, ruleId: number, body: RoleRuleInput) => http.patch<RoleRule>(`/api/admin/roles/${encodeURIComponent(role)}/rules/${ruleId}`, body),
  deleteRule: (role: string, ruleId: number) => http.delete(`/api/admin/roles/${encodeURIComponent(role)}/rules/${ruleId}`),
  adGroups: (role: string) => http.get<{ role: string; items: { dn: string }[] }>(`/api/admin/roles/${encodeURIComponent(role)}/ad-groups`),
  setAdGroups: (role: string, groups: string[]) =>
    http.put<{ role: string; groups: string[] }>(`/api/admin/roles/${encodeURIComponent(role)}/ad-groups`, { groups }),
  whoCanAccess: (code: string) => http.get<WhoCanAccess>(`/api/admin/permissions/${encodeURIComponent(code)}/who-can-access`),
  apps: () => http.get<{ items: AppReg[] }>('/api/admin/apps'),
  departments: () => http.get<{ companies: { companyId: number; name: string }[]; items: DeptNode[]; syncedAt: string | null }>('/api/admin/departments'),
  preview: (body: { employeeNo?: string; company?: string; deptCode?: string; jobLevel?: string; title?: string }) =>
    http.post<RbacPreview>('/api/admin/rbac/preview', body),
  // 部門 / 個人權限(v0.12):直接授予,不經角色
  jobTiers: () => http.get<{ items: JobTier[] }>('/api/admin/job-tiers'),
  deptPermissionCounts: (app: string) => http.get<{ items: { deptCode: string; count: number }[] }>('/api/admin/dept-permissions', { query: { app } }),
  deptPermissions: (deptCode: string, app: string) =>
    http.get<DeptPermissions>(`/api/admin/dept-permissions/${encodeURIComponent(deptCode)}`, { query: { app } }),
  setDeptPermissions: (deptCode: string, body: { app: string; includeSubDepts: boolean; grants: { code: string; jobTier: string }[] }) =>
    http.put<DeptPermissions>(`/api/admin/dept-permissions/${encodeURIComponent(deptCode)}`, body),
  userPermissions: (id: string | number, app: string) =>
    http.get<UserPermissions>(`/api/admin/user-permissions/${encodeURIComponent(String(id))}`, { query: { app } }),
  directGrants: () =>
    http.get<{
      departments: { deptCode: string; name: string; jobTier: string; includeSubDepts: boolean; code: string }[];
      users: { employeeNo: string; name: string; validTo: string | null; code: string }[];
    }>('/api/admin/direct-grants'),
  setUserPermissions: (id: string | number, body: { app: string; grants: { code: string; validTo?: string | null; reason?: string | null }[] }) =>
    http.put<UserPermissions>(`/api/admin/user-permissions/${encodeURIComponent(String(id))}`, body),
};

// ───────── 使用者 / 公司 ─────────

export interface UserRow {
  userId: number;
  employeeNo: string;
  displayName: string;
  email: string | null;
  deptCode: string | null;
  department: string | null;
  orgName: string | null;
  title: string | null;
  jobLevel: string | null;
  /** 人員同步建立、尚未登入過時為 null */
  authType: 'ad' | 'local' | null;
  adDomain: string | null;
  employmentStatus: string | null;
  isDisabled: boolean;
  lastLoginAt: string | null;
  localStatus: string | null;
}
export interface UserDetail extends Omit<UserRow, 'localStatus'> {
  rowVer: string;
  adGroups: string[];
  companies: { companyId: number; compName: string; deptCode: string | null; department: string | null; isPrimary: boolean; isVirtual: boolean }[];
  roles: { code: string; name: string; validFrom: string; validTo: string | null; reason: string | null; createdBy: string }[];
  localAccount: { status: string; failedCount: number; lockedAt: string | null; mustChangePassword: boolean } | null;
  sessions: number | null;
}
export interface EffectivePermissions {
  roles: RoleSource[];
  permissions: {
    code: string;
    name?: string;
    kind?: string;
    /** 授予此權限的角色 */
    grantedBy?: string[];
    /** 直接授予的部門(v0.12) */
    depts?: { deptCode: string; jobTier: string; includeSubDepts: boolean }[];
    /** 個人權限(v0.12) */
    personal?: { validTo: string | null; reason: string | null } | null;
  }[];
  apps: { code: string; name: string }[];
}

export const users = {
  list: (query: { q?: string; companyId?: number; deptCode?: string; disabled?: boolean; authType?: string; page: number; pageSize: number }) =>
    http.get<Paged<UserRow>>('/api/admin/users', { query: query as Query }),
  get: (id: string | number) => http.get<UserDetail>(`/api/admin/users/${id}`),
  update: (id: string | number, rowVer: string, body: { isDisabled?: boolean; roles?: { code: string; validTo?: string | null; reason?: string | null }[] }) =>
    http.patch<UserDetail>(`/api/admin/users/${id}`, { ...body, rowVer }),
  revokeSessions: (id: string | number) => http.post(`/api/admin/users/${id}/revoke-sessions`),
  effective: (id: string | number) => http.get<EffectivePermissions>(`/api/admin/users/${id}/effective-permissions`),
  companies: () => http.get<{ items: Company[] }>('/api/admin/companies'),
};

// ───────── 稽核 ─────────

export interface AuditRow {
  auditId: number;
  occurredAt: string;
  actorUserId: number | null;
  actorName: string | null;
  actorIp: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  before: unknown;
  after: unknown;
}
export interface AuthLogRow {
  logId: number;
  occurredAt: string;
  username: string;
  userId: number | null;
  authMethod: string | null;
  event: string;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
}

export const audit = {
  operations: (query: { actor?: string; action?: string; entityType?: string; from?: string; to?: string; page: number; pageSize: number }) =>
    http.get<Paged<AuditRow> & { from: string; to: string | null }>('/api/admin/audit-logs', { query }),
  logins: (query: { username?: string; event?: string; ip?: string; from?: string; to?: string; page: number; pageSize: number }) =>
    http.get<Paged<AuthLogRow> & { from: string; to: string | null }>('/api/admin/auth-logs', { query }),
};
