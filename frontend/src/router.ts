/**
 * 路由(History 模式,base = /it/):
 *   第一層:選單群組(總覽 / Gateway 管理 / 端點管理 / 系統管理),定義在 api/auth.ts 的 MENU
 *   第二層:功能頁(TabbedPage),meta 定義標題與 Tab
 *   第三層:Tab = 子路由(重新整理停在同一個 Tab)
 * 守衛(giga-Portal PRD FR-2.5、FR-2.6,Gateway FRONTEND-GUIDE §7.4):
 *   未登入 Gateway → 入口網 /login?redirect=/it/...;沒有 it.app.access → 導回入口網 /;
 *   任一層缺少 meta.permission(選單權限)或 meta.requires(該頁的 BFF 讀取權限)→ /403。前端只是體驗,BFF 一定會再檢查。
 */
import { redirectToLogin } from '@giganexus/web-kit';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { can, canAll, FILE, GW, IT, loadMe, NOTIFY, OBS, setPageHasTab, UI } from './api/auth';
import { hasCurrentApp } from './composables/apps';
import AppLayout from './layouts/AppLayout.vue';
import TabbedPage from './layouts/TabbedPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    permission?: string;
    /** 該頁需要的 BFF 讀取權限(全部具備才可進入) */
    requires?: readonly string[];
    title?: string;
    description?: string;
    icon?: string;
    eyebrow?: string;
    tab?: string;
    tabs?: { label: string; to: string; icon?: string; permission?: string }[];
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/unavailable', component: () => import('./pages/Unavailable.vue'), meta: { public: true, title: '暫時無法連線' } },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: TabbedPage,
        meta: {
          permission: IT.dashboard,
          title: '儀表板',
          eyebrow: 'Overview',
          description: '服務健康、Gateway 設定與團隊工作的即時概況',
          icon: 'dashboard',
          tabs: [
            { label: '營運總覽', to: '/dashboard', icon: 'activity', permission: UI.dashOverview },
            { label: 'Gateway 概況', to: '/dashboard/gateway', icon: 'gateway', permission: UI.dashGateway },
            { label: '團隊工作', to: '/dashboard/team', icon: 'users', permission: UI.dashTeam },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/dashboard/Overview.vue'), meta: { tab: '營運總覽', permission: UI.dashOverview } },
          {
            path: 'gateway',
            component: () => import('./pages/dashboard/GatewaySummary.vue'),
            meta: { tab: 'Gateway 概況', permission: UI.dashGateway, requires: [GW.upstreamRead, GW.routeRead] },
          },
          { path: 'team', component: () => import('./pages/dashboard/Team.vue'), meta: { tab: '團隊工作', permission: UI.dashTeam, requires: [GW.rbacRead] } },
        ],
      },
      {
        path: 'notify',
        component: TabbedPage,
        meta: {
          permission: IT.notify,
          title: '通知中心',
          eyebrow: 'Notify',
          description: '公司公告與個人通知;有發布權限者可發布公告並查看已讀情形(Gateway NOTIFY-PLAN)',
          icon: 'bell',
          tabs: [
            { label: '我的通知', to: '/notify', icon: 'bell', permission: UI.notifyInbox },
            { label: '公告查詢', to: '/notify/archive', icon: 'search', permission: UI.notifyArchive },
            { label: '發布公告', to: '/notify/publish', icon: 'send', permission: UI.notifyPublish },
            { label: '發布紀錄', to: '/notify/history', icon: 'list', permission: UI.notifyHistory },
            { label: '通知設定', to: '/notify/settings', icon: 'settings', permission: UI.notifySettings },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/notify/Inbox.vue'), meta: { tab: '我的通知', permission: UI.notifyInbox } },
          { path: 'archive', component: () => import('./pages/notify/Archive.vue'), meta: { tab: '公告查詢', permission: UI.notifyArchive } },
          { path: 'publish', component: () => import('./pages/notify/Publish.vue'), meta: { tab: '發布公告', permission: UI.notifyPublish } },
          { path: 'history', component: () => import('./pages/notify/History.vue'), meta: { tab: '發布紀錄', permission: UI.notifyHistory } },
          {
            path: 'settings',
            component: () => import('./pages/notify/Settings.vue'),
            meta: { tab: '通知設定', permission: UI.notifySettings, requires: [NOTIFY.settingsRead] },
          },
        ],
      },
      {
        path: 'gateway/services',
        component: TabbedPage,
        meta: {
          permission: IT.gwService,
          requires: [GW.upstreamRead, GW.routeRead],
          title: '服務與路由',
          eyebrow: 'Gateway',
          description: 'Gateway BFF 的上游服務、API 路由、限流政策與發佈版本;修改後於「發佈版本」發佈才生效',
          icon: 'route',
          tabs: [
            { label: '上游服務', to: '/gateway/services', icon: 'server', permission: UI.svcUpstreams },
            { label: 'API 路由', to: '/gateway/services/routes', icon: 'route', permission: UI.svcRoutes },
            { label: '發佈版本', to: '/gateway/services/releases', icon: 'release', permission: UI.svcReleases },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/Upstreams.vue'), meta: { tab: '上游服務', permission: UI.svcUpstreams } },
          { path: 'routes', component: () => import('./pages/gateway/Routes.vue'), meta: { tab: 'API 路由', permission: UI.svcRoutes } },
          {
            path: 'releases',
            component: () => import('./pages/gateway/Releases.vue'),
            meta: { tab: '發佈版本', permission: UI.svcReleases, requires: [GW.release] },
          },
        ],
      },
      {
        path: 'gateway/rbac',
        component: TabbedPage,
        meta: {
          permission: IT.gwRbac,
          requires: [GW.rbacRead],
          title: '權限查詢',
          eyebrow: 'Gateway · 唯讀',
          description: '查看誰擁有哪些權限、某條 API 誰能呼叫(角色、部門、個人);只能查看,設定請到「系統管理 › 權限設定」',
          icon: 'eye',
          tabs: [
            { label: '角色權限總覽', to: '/gateway/rbac', icon: 'grid', permission: UI.rbacMatrix },
            { label: '誰能存取', to: '/gateway/rbac/who-can-access', icon: 'search', permission: UI.rbacWho },
            { label: '關係圖', to: '/gateway/rbac/graph', icon: 'graph', permission: UI.rbacGraph },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/RoleMatrix.vue'), meta: { tab: '角色權限總覽', permission: UI.rbacMatrix } },
          { path: 'who-can-access', component: () => import('./pages/gateway/WhoCanAccess.vue'), meta: { tab: '誰能存取', permission: UI.rbacWho } },
          { path: 'graph', component: () => import('./pages/gateway/RbacGraph.vue'), meta: { tab: '關係圖', permission: UI.rbacGraph } },
        ],
      },
      {
        path: 'gateway/observe',
        component: TabbedPage,
        meta: {
          permission: IT.gwObserve,
          requires: [OBS.read],
          title: '架構觀測',
          eyebrow: 'Gateway · 監控',
          description: '各服務的健康狀態、請求紀錄、錯誤與 Nginx 流量(giga-observe);架構圖每 15 秒自動更新',
          icon: 'workflow',
          tabs: [
            { label: '架構圖', to: '/gateway/observe', icon: 'workflow', permission: UI.obsMap },
            { label: '紀錄', to: '/gateway/observe/logs', icon: 'list', permission: UI.obsLogs },
            { label: '錯誤', to: '/gateway/observe/errors', icon: 'alert', permission: UI.obsErrors },
            { label: '流量與來源 IP', to: '/gateway/observe/traffic', icon: 'globe', permission: UI.obsTraffic },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/observe/ArchitectureMap.vue'), meta: { tab: '架構圖', permission: UI.obsMap } },
          { path: 'logs', component: () => import('./pages/observe/Logs.vue'), meta: { tab: '紀錄', permission: UI.obsLogs } },
          { path: 'errors', component: () => import('./pages/observe/Errors.vue'), meta: { tab: '錯誤', permission: UI.obsErrors } },
          { path: 'traffic', component: () => import('./pages/observe/Traffic.vue'), meta: { tab: '流量與來源 IP', permission: UI.obsTraffic } },
        ],
      },
      {
        path: 'gateway/files',
        component: TabbedPage,
        meta: {
          permission: IT.gwFile,
          title: '檔案管理',
          eyebrow: 'Gateway · 附件服務',
          description: '共用附件服務 file-api:上傳、下載、綁定單號、刪除、BPM 表單附件與 NAS 備份狀態(giga-file-service);檔案清單只列自己上傳的或同公司的檔案',
          icon: 'folder',
          tabs: [
            { label: '檔案清單', to: '/gateway/files', icon: 'folder', permission: UI.fileObjects },
            { label: 'BPM 附件', to: '/gateway/files/bpm', icon: 'workflow', permission: UI.fileBpm },
            { label: '儲存與備份', to: '/gateway/files/storage', icon: 'database', permission: UI.fileStorage },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/files/Files.vue'), meta: { tab: '檔案清單', permission: UI.fileObjects, requires: [FILE.objectRead] } },
          { path: 'bpm', component: () => import('./pages/files/Bpm.vue'), meta: { tab: 'BPM 附件', permission: UI.fileBpm, requires: [FILE.bpmRead] } },
          {
            path: 'storage',
            component: () => import('./pages/files/Storage.vue'),
            meta: { tab: '儲存與備份', permission: UI.fileStorage, requires: [FILE.storageRead] },
          },
        ],
      },
      {
        path: 'endpoint/devices',
        component: TabbedPage,
        meta: {
          permission: IT.endpointDevice,
          title: '電腦清單',
          eyebrow: 'Endpoint',
          description: '經 Gateway BFF 取得的 Agent 基本資料;資料權限以 Gateway 為準',
          icon: 'monitor',
          tabs: [{ label: '電腦清單', to: '/endpoint/devices', icon: 'monitor', permission: UI.devList }],
        },
        children: [{ path: '', component: () => import('./pages/endpoint/Devices.vue'), meta: { tab: '電腦清單', permission: UI.devList } }],
      },
      {
        path: 'system/users',
        component: TabbedPage,
        meta: {
          permission: IT.sysUser,
          requires: [GW.userRead],
          title: '人員與部門',
          eyebrow: 'System',
          description: 'Gateway 使用者(人員同步自 BPM / LOS)、個別指派角色與部門樹',
          icon: 'users',
          tabs: [
            { label: '人員', to: '/system/users', icon: 'users', permission: UI.userList },
            { label: '部門', to: '/system/users/departments', icon: 'building', permission: UI.userDepts },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Users.vue'), meta: { tab: '人員', permission: UI.userList } },
          {
            path: 'departments',
            component: () => import('./pages/system/Departments.vue'),
            meta: { tab: '部門', permission: UI.userDepts, requires: [GW.rbacRead] },
          },
        ],
      },
      {
        path: 'system/permissions',
        component: TabbedPage,
        meta: {
          permission: IT.sysRole,
          requires: [GW.rbacRead],
          title: '權限設定',
          eyebrow: 'System · 編輯',
          description: '設定各應用的選單 / Tab / 按鈕權限給誰:角色(依公司、部門、職級、職稱自動指派)、部門(含職級門檻)或個人',
          icon: 'key',
          tabs: [
            { label: '角色權限', to: '/system/permissions', icon: 'grid', permission: UI.roleRolePerm },
            { label: '角色與指派規則', to: '/system/permissions/roles', icon: 'shield', permission: UI.roleRules },
            { label: '部門權限', to: '/system/permissions/departments', icon: 'building', permission: UI.roleDept },
            { label: '個人權限', to: '/system/permissions/users', icon: 'user', permission: UI.roleUser },
            { label: '權限試算', to: '/system/permissions/preview', icon: 'eye', permission: UI.rolePreview },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/AppPermissions.vue'), meta: { tab: '角色權限', permission: UI.roleRolePerm } },
          { path: 'roles', component: () => import('./pages/system/RoleRules.vue'), meta: { tab: '角色與指派規則', permission: UI.roleRules } },
          { path: 'departments', component: () => import('./pages/system/DeptPermissions.vue'), meta: { tab: '部門權限', permission: UI.roleDept } },
          { path: 'users', component: () => import('./pages/system/UserPermissions.vue'), meta: { tab: '個人權限', permission: UI.roleUser } },
          { path: 'preview', component: () => import('./pages/system/PermissionPreview.vue'), meta: { tab: '權限試算', permission: UI.rolePreview } },
        ],
      },
      {
        path: 'system/menus',
        component: TabbedPage,
        meta: {
          permission: IT.sysMenu,
          requires: [GW.rbacRead],
          title: '選單管理',
          eyebrow: 'System · 編輯',
          description: '各應用的選單 / Tab / 按鈕清單:改名稱、排序、上層,新增或刪除;要授予誰請到「權限設定」',
          icon: 'list',
          tabs: [{ label: '選單 / Tab / 按鈕', to: '/system/menus', icon: 'list', permission: UI.menuList }],
        },
        children: [{ path: '', component: () => import('./pages/system/MenuManage.vue'), meta: { tab: '選單 / Tab / 按鈕', permission: UI.menuList } }],
      },
      {
        path: 'system/audit',
        component: TabbedPage,
        meta: {
          permission: IT.sysAudit,
          requires: [GW.auditRead],
          title: '稽核紀錄',
          eyebrow: 'System',
          description: 'Gateway 的管理操作與登入紀錄(預設最近 30 天)',
          icon: 'audit',
          tabs: [
            { label: '操作紀錄', to: '/system/audit', icon: 'audit', permission: UI.auditOps },
            { label: '登入紀錄', to: '/system/audit/logins', icon: 'login', permission: UI.auditLogins },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Audit.vue'), props: { type: 'operation' }, meta: { tab: '操作紀錄', permission: UI.auditOps } },
          {
            path: 'logins',
            component: () => import('./pages/system/Audit.vue'),
            props: { type: 'login' },
            meta: { tab: '登入紀錄', permission: UI.auditLogins },
          },
        ],
      },
      { path: '403', component: () => import('./pages/Forbidden.vue'), meta: { title: '沒有權限' } },
      { path: ':pathMatch(.*)*', component: () => import('./pages/NotFound.vue'), meta: { title: '找不到頁面' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

type TabMeta = { to: string; permission?: string };
/** 功能頁中第一個有權限的 Tab(Tab 權限 ∩ 該 Tab 子路由需要的讀取權限);沒有 Tab 定義時回頁面本身 */
function firstTab(page: RouteRecordRaw): string | null {
  const tabs = (page.meta?.tabs as TabMeta[] | undefined) ?? [];
  if (!tabs.length) return `/${page.path}`;
  for (const t of tabs) {
    if (t.permission && !can(t.permission)) continue;
    const child = (page.children ?? []).find((c) => `/${page.path}${c.path ? `/${c.path}` : ''}` === t.to);
    if (!child || canAll(child.meta?.requires)) return t.to;
  }
  return null;
}

setPageHasTab((path) => {
  const rec = (routes[1]!.children ?? []).find((r) => `/${r.path}` === path);
  return !rec || firstTab(rec) !== null;
});

/** 第一個可見的功能頁與 Tab(首頁沒有權限時改到這裡) */
function firstAllowed(): string | null {
  for (const r of routes[1]!.children ?? []) {
    if (!r.meta?.permission || r.path === '403') continue;
    if (can(r.meta.permission) && canAll(r.meta.requires)) {
      const t = firstTab(r);
      if (t) return t;
    }
  }
  return null;
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  let me;
  try {
    me = await loadMe();
  } catch {
    // BFF 無法連線(非 401):顯示維護頁,不導向登入
    return { path: '/unavailable', query: { redirect: to.fullPath } };
  }
  if (!me) {
    redirectToLogin();
    return false;
  }
  // 應用層守衛:沒有 IT 管理系統的應用權限 → 回入口網(不可停在本系統造成迴圈)
  if (!hasCurrentApp(me)) {
    location.assign('/');
    return false;
  }
  // 頁面守衛:任一層缺少選單權限或 BFF 讀取權限 → 403
  const denied = to.matched.some((r) => (r.meta.permission && !can(r.meta.permission)) || !canAll(r.meta.requires));
  if (denied) {
    // 有此功能頁、只是目前的 Tab 沒權限:改到同頁第一個有權限的 Tab
    const page = to.matched[1];
    const pageOk = page && (!page.meta.permission || can(page.meta.permission)) && canAll(page.meta.requires);
    if (pageOk) {
      const rec = (routes[1]!.children ?? []).find((r) => `/${r.path}` === page.path);
      const t = rec ? firstTab(rec) : null;
      if (t && t !== to.path) return t;
    }
    if (to.path === '/dashboard') {
      const first = firstAllowed();
      if (first && first !== '/dashboard') return first;
    }
    return '/403';
  }
  return true;
});
