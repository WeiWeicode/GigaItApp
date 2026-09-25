/**
 * 由 Gateway BFF 取得的管理資料(欄位對應 BFF 的 /api/admin/demo/catalog、/api/admin/routes/catalog、
 * /api/admin/db/tables/*、/api/admin/demo/who-can-access 回應;mock 與 live 回傳相同形狀)。
 */

export interface BffUpstream {
  code: string;
  name: string;
  systemCode: string;
  timeoutMs: number;
  targets: { baseUrl: string; environment: string }[];
  /** 路由狀態 → 數量 */
  routes: Record<string, number>;
}

export interface BffRoute {
  routeCode: string;
  name: string;
  systemCode: string;
  method: string;
  publicPath: string;
  routeType: 'proxy' | 'mock' | 'aggregate' | string;
  upstream: string | null;
  upstreamPath: string | null;
  authMode: 'public' | 'authenticated' | 'permission' | string;
  permissionCode: string | null;
  status: 'draft' | 'published' | 'deprecated' | 'disabled' | string;
  tags: string | null;
  description: string | null;
}

export interface BffPolicy {
  code: string;
  limitCount: number;
  windowSec: number;
  keyBy: string;
}

export interface BffRelease {
  releaseId: number;
  note: string | null;
  publishedBy: string;
  publishedAt: string;
  rolledBackFrom: number | null;
  diff: { added: string[]; modified: string[]; removed: string[]; upstreamsChanged: boolean; policiesChanged: boolean } | null;
}

export interface BffOverview {
  upstreams: BffUpstream[];
  policies: BffPolicy[];
  release: { liveVersion: number | null; redisVersion: number | null; draftRoutes: number };
}

export interface BffPermission {
  code: string;
  name: string;
  systemCode: string;
  description: string | null;
}

export interface BffRole {
  code: string;
  name: string;
  description: string | null;
  isSystem: boolean;
}

export interface BffRbac {
  roles: BffRole[];
  permissions: BffPermission[];
  rolePermissions: { role: string; permission: string }[];
  roleAdGroups: { role: string; adGroupDn: string }[];
  roleCompanies: { role: string; company: string }[];
}

export interface BffWhoCanAccess {
  permission: string;
  exists: boolean;
  name?: string;
  roles: { code: string; name: string; everyone: boolean; adGroups: string[]; companies: string[]; users: string[] }[];
}

/** 資料來源:mock(離線開發)或 live(以服務帳號呼叫 BFF) */
export interface BffSource {
  readonly mode: 'mock' | 'live';
  overview(): Promise<BffOverview>;
  routes(): Promise<BffRoute[]>;
  /** 發佈版本(由新到舊)分頁 */
  releases(page: number, pageSize: number): Promise<{ items: BffRelease[]; total: number }>;
  rbac(): Promise<BffRbac>;
  whoCanAccess(permission: string): Promise<BffWhoCanAccess>;
  /** 寫入類操作:BFF 尚未提供管理 API(PRD §8.7 / P2-3)時,live 模式丟出 ITAPP_BFF_NOT_SUPPORTED */
  setRolePermissions(role: string, permissions: string[]): Promise<void>;
  publish(note: string, actor: string): Promise<BffRelease>;
}
