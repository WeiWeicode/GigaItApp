/**
 * 登入狀態與權限:Gateway 單一入口(giga-Portal PRD D2、I1–I3),資料來源為 web-kit 快取的 GET /api/auth/me。
 *   - 本系統的選單權限(it.*,kind = menu,上層 it.app.access)由 deploy/gateway-rbac.yaml 登記到 BFF(I2)
 *   - 資料與按鈕權限 = BFF 管理 API 的權限(gw.admin.*):按鈕權限即 API 權限,BFF 一定會再檢查
 * 頁面 / 選單可見 = 選單權限 ∩ 該頁需要的 BFF 讀取權限(兩者都有才顯示,避免看得到頁面卻全部 403)。
 */
import { computed } from 'vue';
import { hasIcon } from '@/ui/icons';
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
  sysMenu: 'it.sys-menu.read',
  sysAudit: 'it.sys-audit.read',
} as const;

/**
 * 本系統的 Tab / 按鈕權限(kind tab / button,掛在所屬選單下;登記在 deploy/gateway-rbac.yaml,名稱可在「選單管理」修改)。
 * 每個節點綁定它用到的 BFF API 權限(includes):授予 Tab / 按鈕即一併取得,BFF 仍會檢查 API 權限。
 */
export const UI = {
  dashOverview: 'it.dashboard.overview',
  dashGateway: 'it.dashboard.gateway',
  dashTeam: 'it.dashboard.team',
  svcUpstreams: 'it.gw-service.upstreams',
  svcUpstreamEdit: 'it.gw-service.upstream-edit',
  svcRoutes: 'it.gw-service.routes',
  svcRouteEdit: 'it.gw-service.route-edit',
  svcReleases: 'it.gw-service.releases',
  svcPublish: 'it.gw-service.publish',
  rbacMatrix: 'it.gw-rbac.matrix',
  rbacWho: 'it.gw-rbac.who',
  rbacGraph: 'it.gw-rbac.graph',
  devList: 'it.endpoint-device.list',
  userList: 'it.sys-user.users',
  userRoles: 'it.sys-user.roles',
  userRevoke: 'it.sys-user.revoke',
  userDisable: 'it.sys-user.disable',
  userDepts: 'it.sys-user.depts',
  roleRolePerm: 'it.sys-role.role-perm',
  roleRolePermEdit: 'it.sys-role.role-perm-edit',
  roleRules: 'it.sys-role.rules',
  roleRulesEdit: 'it.sys-role.rules-edit',
  roleDept: 'it.sys-role.dept',
  roleDeptEdit: 'it.sys-role.dept-edit',
  roleUser: 'it.sys-role.user',
  roleUserEdit: 'it.sys-role.user-edit',
  rolePreview: 'it.sys-role.preview',
  menuList: 'it.sys-menu.list',
  menuEdit: 'it.sys-menu.edit',
  auditOps: 'it.sys-audit.ops',
  auditLogins: 'it.sys-audit.logins',
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
/** 選單 / 頁面名稱:以 BFF 的權限名稱為準(「選單管理」可改名),沒有時用前端預設文字 */
export function menuTitle(permission: string | undefined, fallback: string): string {
  return kit.nameOf(permission) ?? fallback;
}
/** 選單 / 頁面圖示:以 BFF 為準(須是 ui/icons.ts 登記的名稱),沒有或不認得時用前端預設 */
export function menuIcon(permission: string | undefined, fallback: string): string {
  const icon = kit.menuOf(permission)?.icon;
  return hasIcon(icon) ? icon : fallback;
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
  /** BFF 的選單目錄代碼(kind = group,登記在 gateway-rbac.yaml;名稱 / 排序 / 圖示可在「選單管理」修改) */
  code: string;
  title: string;
  icon: string;
  children: MenuItem[];
}

/**
 * 兩層選單的預設值(第三層 Tab 在 router.ts 的 meta)。實際顯示以 BFF 為準(/api/auth/me 的 menus):
 * 大項的名稱 / 圖示 / 順序、頁面的名稱 / 順序,以及頁面歸在哪個大項(頁面在 BFF 的上層目錄);BFF 沒有資料時用這裡的值。
 */
const MENU: readonly MenuGroup[] = [
  {
    key: 'overview',
    code: 'it.group.overview',
    title: '總覽',
    icon: 'dashboard',
    children: [{ key: 'dashboard', title: '儀表板', path: '/dashboard', permission: IT.dashboard }],
  },
  {
    key: 'gateway',
    code: 'it.group.gateway',
    title: 'Gateway 管理',
    icon: 'gateway',
    children: [
      { key: 'services', title: '服務與路由', path: '/gateway/services', permission: IT.gwService, requires: [GW.upstreamRead, GW.routeRead] },
      { key: 'rbac', title: '權限查詢', path: '/gateway/rbac', permission: IT.gwRbac, requires: [GW.rbacRead] },
    ],
  },
  {
    key: 'endpoint',
    code: 'it.group.endpoint',
    title: '端點管理',
    icon: 'monitor',
    children: [{ key: 'devices', title: '電腦清單', path: '/endpoint/devices', permission: IT.endpointDevice }],
  },
  {
    key: 'system',
    code: 'it.group.system',
    title: '系統管理',
    icon: 'settings',
    children: [
      { key: 'users', title: '人員與部門', path: '/system/users', permission: IT.sysUser, requires: [GW.userRead] },
      { key: 'permissions', title: '權限設定', path: '/system/permissions', permission: IT.sysRole, requires: [GW.rbacRead] },
      { key: 'menus', title: '選單管理', path: '/system/menus', permission: IT.sysMenu, requires: [GW.rbacRead] },
      { key: 'audit', title: '稽核紀錄', path: '/system/audit', permission: IT.sysAudit, requires: [GW.auditRead] },
    ],
  },
];

/** 依 BFF 的目錄、名稱、排序組出側欄(可見 = 選單權限 ∩ 該頁的 BFF 讀取權限) */
function buildMenus(): MenuGroup[] {
  const defaults = new Map(MENU.map((g, i) => [g.code, { g, i }]));
  const buckets = new Map<string, (MenuItem & { sort: number | null; order: number })[]>();
  MENU.forEach((g, gi) =>
    g.children.forEach((c, ci) => {
      if (!can(c.permission) || !canAll(c.requires)) return;
      const m = kit.menuOf(c.permission);
      const parent = m?.parentCode ?? null;
      // 頁面在 BFF 掛到某個目錄(group)時歸到該目錄;否則用預設大項
      const group = parent && (defaults.has(parent) || kit.menuOf(parent)?.kind === 'group') ? parent : g.code;
      const list = buckets.get(group) ?? [];
      list.push({ ...c, title: m?.name ?? c.title, sort: m?.sort ?? null, order: gi * 100 + ci });
      buckets.set(group, list);
    }),
  );
  const bySort = <T extends { sort: number | null; order: number }>(a: T, b: T) =>
    a.sort !== null && b.sort !== null && a.sort !== b.sort ? a.sort - b.sort : a.order - b.order;
  return [...buckets.entries()]
    .map(([code, items]) => {
      const d = defaults.get(code);
      const m = kit.menuOf(code);
      return {
        key: d?.g.key ?? code,
        code,
        title: m?.name ?? d?.g.title ?? code,
        icon: hasIcon(m?.icon) ? m!.icon! : (d?.g.icon ?? 'layers'),
        sort: m?.sort ?? null,
        order: d?.i ?? 999,
        children: items.sort(bySort).map(({ sort: _s, order: _o, ...c }) => c),
      };
    })
    .sort(bySort)
    .map(({ sort: _s, order: _o, ...g }) => g);
}

export function useAuth() {
  return {
    me: computed(() => kit.me.me as Me | null),
    user: kit.user,
    permissions: kit.permissions,
    menus: computed(buildMenus),
    can,
    canAll,
    loadMe,
    logout: kitLogout,
  };
}
