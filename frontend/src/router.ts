/**
 * 路由(History 模式,base = /it/):
 *   第一層:選單群組(總覽 / Gateway 管理 / 系統管理),對應後端 MENUS
 *   第二層:功能頁(TabbedPage),meta 定義標題與 Tab
 *   第三層:Tab = 子路由(重新整理停在同一個 Tab)
 * meta.permission:缺少權限時導向 /403(前端體驗;後端 API 仍會檢查)。
 */
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { can, loadMe } from './api/auth';
import AppLayout from './layouts/AppLayout.vue';
import TabbedPage from './layouts/TabbedPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    permission?: string;
    title?: string;
    description?: string;
    icon?: string;
    eyebrow?: string;
    tab?: string;
    tabs?: { label: string; to: string; icon?: string; permission?: string }[];
  }
}

const routes: RouteRecordRaw[] = [
  { path: '/login', component: () => import('./pages/Login.vue'), meta: { public: true, title: '登入' } },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: TabbedPage,
        meta: {
          permission: 'dashboard.view',
          title: '儀表板',
          eyebrow: 'Overview',
          description: '服務健康、Gateway 設定與團隊工作的即時概況',
          icon: 'dashboard',
          tabs: [
            { label: '營運總覽', to: '/dashboard', icon: 'activity' },
            { label: 'Gateway 概況', to: '/dashboard/gateway', icon: 'gateway' },
            { label: '團隊工作', to: '/dashboard/team', icon: 'users' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/dashboard/Overview.vue'), meta: { tab: '營運總覽' } },
          { path: 'gateway', component: () => import('./pages/dashboard/GatewaySummary.vue'), meta: { tab: 'Gateway 概況' } },
          { path: 'team', component: () => import('./pages/dashboard/Team.vue'), meta: { tab: '團隊工作' } },
        ],
      },
      {
        path: 'gateway/services',
        component: TabbedPage,
        meta: {
          permission: 'bff.route.read',
          title: '服務與路由',
          eyebrow: 'Gateway',
          description: 'Gateway BFF 的上游服務、API 路由與發佈版本',
          icon: 'route',
          tabs: [
            { label: '上游服務', to: '/gateway/services', icon: 'server' },
            { label: 'API 路由', to: '/gateway/services/routes', icon: 'route' },
            { label: '發佈版本', to: '/gateway/services/releases', icon: 'release' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/Upstreams.vue'), meta: { tab: '上游服務' } },
          { path: 'routes', component: () => import('./pages/gateway/Routes.vue'), meta: { tab: 'API 路由' } },
          { path: 'releases', component: () => import('./pages/gateway/Releases.vue'), meta: { tab: '發佈版本' } },
        ],
      },
      {
        path: 'gateway/rbac',
        component: TabbedPage,
        meta: {
          permission: 'bff.rbac.read',
          title: 'BFF 權限',
          eyebrow: 'Gateway',
          description: 'Gateway 角色 × 權限的視覺化、反查與設定',
          icon: 'shield',
          tabs: [
            { label: '角色權限矩陣', to: '/gateway/rbac', icon: 'grid' },
            { label: '權限反查', to: '/gateway/rbac/who-can-access', icon: 'search' },
            { label: '關係圖', to: '/gateway/rbac/graph', icon: 'graph' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/RoleMatrix.vue'), meta: { tab: '角色權限矩陣' } },
          { path: 'who-can-access', component: () => import('./pages/gateway/WhoCanAccess.vue'), meta: { tab: '權限反查' } },
          { path: 'graph', component: () => import('./pages/gateway/RbacGraph.vue'), meta: { tab: '關係圖' } },
        ],
      },
      {
        path: 'system/users',
        component: TabbedPage,
        meta: {
          permission: 'sys.user.read',
          title: '人員與部門',
          eyebrow: 'System',
          description: 'IT 管理系統的帳號、職級與部門',
          icon: 'users',
          tabs: [
            { label: '人員', to: '/system/users', icon: 'users' },
            { label: '部門', to: '/system/users/departments', icon: 'building', permission: 'sys.dept.read' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Users.vue'), meta: { tab: '人員' } },
          { path: 'departments', component: () => import('./pages/system/Departments.vue'), meta: { tab: '部門', permission: 'sys.dept.read' } },
        ],
      },
      {
        path: 'system/permissions',
        component: TabbedPage,
        meta: {
          permission: 'sys.perm.read',
          title: '角色與按鈕權限',
          eyebrow: 'System',
          description: '職級 × 權限,再依部門限制,得出每個人看得到的選單與按鈕',
          icon: 'key',
          tabs: [
            { label: '職級權限', to: '/system/permissions', icon: 'grid' },
            { label: '部門限制', to: '/system/permissions/departments', icon: 'building' },
            { label: '權限試算', to: '/system/permissions/preview', icon: 'eye' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/LevelMatrix.vue'), meta: { tab: '職級權限' } },
          { path: 'departments', component: () => import('./pages/system/DeptRestrictions.vue'), meta: { tab: '部門限制' } },
          { path: 'preview', component: () => import('./pages/system/PermissionPreview.vue'), meta: { tab: '權限試算' } },
        ],
      },
      {
        path: 'system/audit',
        component: TabbedPage,
        meta: {
          permission: 'sys.audit.read',
          title: '稽核紀錄',
          eyebrow: 'System',
          description: '登入與所有設定變更的紀錄',
          icon: 'audit',
          tabs: [
            { label: '操作紀錄', to: '/system/audit', icon: 'audit' },
            { label: '登入紀錄', to: '/system/audit/logins', icon: 'login' },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Audit.vue'), props: { type: 'operation' }, meta: { tab: '操作紀錄' } },
          { path: 'logins', component: () => import('./pages/system/Audit.vue'), props: { type: 'login' }, meta: { tab: '登入紀錄' } },
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

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  const me = await loadMe().catch(() => null);
  if (!me) return { path: '/login', query: to.fullPath !== '/' && to.fullPath !== '/dashboard' ? { redirect: to.fullPath } : {} };
  // 任一層缺少權限 → 403
  const need = to.matched.map((r) => r.meta.permission).filter((p): p is string => !!p);
  if (need.some((p) => !can(p))) {
    // 首頁沒有權限時改導向第一個可見選單
    if (to.path === '/dashboard') {
      const first = me.menus[0]?.children[0]?.path;
      if (first) return first;
    }
    return '/403';
  }
  return true;
});
