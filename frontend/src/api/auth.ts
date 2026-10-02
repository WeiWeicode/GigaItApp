/**
 * 登入狀態與權限:Gateway 單一入口(giga-Portal PRD D2、I1–I3),資料來源為 web-kit 快取的 GET /api/auth/me。
 *   - 本系統的選單權限(it.*,kind = menu,上層 it.app.access)由 deploy/gateway-rbac.yaml 登記到 BFF(I2)
 *   - 資料與按鈕權限 = BFF 管理 API 的權限(gw.admin.*):按鈕權限即 API 權限,BFF 一定會再檢查
 * 頁面 / 選單可見 = 選單權限 ∩ 該頁需要的 BFF 讀取權限(兩者都有才顯示,避免看得到頁面卻全部 403)。
 */
import { computed } from 'vue';
import { loadMe as kitLoadMe, logout as kitLogout, useAuth as kitUseAuth, type Me as KitMe } from '@giganexus/web-kit';

/** 應用登記(Gateway PRD §8.3.3) */
export interface AppEntry {
  code: string;
  name: string;
  basePath: string;
  icon: string;
}
export type Me = KitMe & { apps?: AppEntry[] };

/** 本系統的權限代碼(登記在 deploy/gateway-rbac.yaml;系統代碼 it) */
export const IT = {
  app: 'it.app.access',
  dashboard: 'it.dashboard.read',
  gwService: 'it.gw-service.read',
  gwRbac: 'it.gw-rbac.read',
  endpointDevice: 'it.endpoint-device.read',
  sysUser: 'it.sys-user.read',
  sysRole: 'it.sys-role.read',
  sysAudit: 'it.sys-audit.read',
} as const;

/** BFF 管理 API 的權限(Gateway PRD §8.7;按鈕 = API) */
export const GW = {
  upstreamRead: 'gw.admin.upstream.read',
  upstreamWrite: 'gw.admin.upstream.write',
  routeRead: 'gw.admin.route.read',
  routeWrite: 'gw.admin.route.write',
  release: 'gw.admin.release',
  rbacRead: 'gw.admin.rbac.read',
  rbacWrite: 'gw.admin.rbac.write',
  userRead: 'gw.admin.user.read',
  userWrite: 'gw.admin.user.write',
  userSync: 'gw.admin.user.sync',
  companyRead: 'gw.admin.company.read',
  auditRead: 'gw.admin.audit.read',
} as const;

const kit = kitUseAuth();
const MAX_AGE_MS = 5 * 60 * 1000;
let loadedAt = 0;

/**
 * 取得目前使用者:換頁時超過 5 分鐘未更新就重新取得,讓權限調整生效(與 giga-Portal composables/session.ts 相同)。
 * 回傳 null = 未登入;BFF 無法連線時丟出錯誤。
 */
export async function loadMe(force = false): Promise<Me | null> {
  const stale = force || Date.now() - loadedAt > MAX_AGE_MS;
  const me = (await kitLoadMe(stale)) as Me | null;
  if (stale && me) loadedAt = Date.now();
  return me;
}

export function can(code: string): boolean {
  return kit.can(code);
}
export function canAll(codes: readonly string[] | undefined): boolean {
  return !codes || codes.every((c) => kit.can(c));
}

export interface MenuItem {
  key: string;
  title: string;
  path: string;
  /** 選單權限(it.*) */
  permission: string;
  /** 該頁需要的 BFF 讀取權限 */
  requires?: readonly string[];
}
export interface MenuGroup {
  key: string;
  title: string;
  icon: string;
  children: MenuItem[];
}

/** 兩層選單(第三層 Tab 在 router.ts 的 meta);順序同 gateway-rbac.yaml 的 sort */
const MENU: readonly MenuGroup[] = [
  { key: 'overview', title: '總覽', icon: 'dashboard', children: [{ key: 'dashboard', title: '儀表板', path: '/dashboard', permission: IT.dashboard }] },
  {
    key: 'gateway',
    title: 'Gateway 管理',
    icon: 'gateway',
    children: [
      { key: 'services', title: '服務與路由', path: '/gateway/services', permission: IT.gwService, requires: [GW.upstreamRead, GW.routeRead] },
      { key: 'rbac', title: 'BFF 權限', path: '/gateway/rbac', permission: IT.gwRbac, requires: [GW.rbacRead] },
    ],
  },
  {
    key: 'endpoint',
    title: '端點管理',
    icon: 'monitor',
    children: [{ key: 'devices', title: '電腦清單', path: '/endpoint/devices', permission: IT.endpointDevice }],
  },
  {
    key: 'system',
    title: '系統管理',
    icon: 'settings',
    children: [
      { key: 'users', title: '人員與部門', path: '/system/users', permission: IT.sysUser, requires: [GW.userRead] },
      { key: 'permissions', title: '角色與按鈕權限', path: '/system/permissions', permission: IT.sysRole, requires: [GW.rbacRead] },
      { key: 'audit', title: '稽核紀錄', path: '/system/audit', permission: IT.sysAudit, requires: [GW.auditRead] },
    ],
  },
];

export function useAuth() {
  return {
    me: computed(() => kit.me.me as Me | null),
    user: kit.user,
    permissions: kit.permissions,
    menus: computed(() =>
      MENU.map((g) => ({ ...g, children: g.children.filter((c) => can(c.permission) && canAll(c.requires)) })).filter((g) => g.children.length),
    ),
    can,
    canAll,
    loadMe,
    logout: kitLogout,
  };
}
