/**
 * 權限目錄(程式內定義,AGENT.md §5 權限代碼 {module}.{resource}.{action}):
 *   - 職級(LEVELS):admin / manager / senior / engineer,rank 決定可管理的對象(只能管理 rank 較低者)
 *   - 權限(PERMISSIONS):type=page 為頁面 / 選單可見,type=button 為按鈕與對應的寫入 API
 *   - 選單(MENUS):兩層,第二層以 permission 決定是否可見;頁面內的 Tab 由前端路由定義
 * 職級 × 權限的對應、權限的部門限制存在資料檔(可在「角色與按鈕權限」頁設定),預設值見 DEFAULT_*。
 * 新增權限代碼時同步更新前端用到的 v-can / meta.permission,並在 docs/DevelopmentProcess 留紀錄。
 */

export type LevelCode = 'admin' | 'manager' | 'senior' | 'engineer';

export interface Level {
  code: LevelCode;
  name: string;
  rank: number;
  description: string;
}

export const LEVELS: Level[] = [
  { code: 'admin', name: '系統管理員', rank: 99, description: 'IT 管理系統維運,固定擁有全部權限(不可調整,避免鎖死)' },
  { code: 'manager', name: '主管', rank: 30, description: '課級以上主管:人員管理、核可發佈、權限設定' },
  { code: 'senior', name: '高級工程師', rank: 20, description: '負責發佈與上游維護,可檢視權限設定' },
  { code: 'engineer', name: '一般工程師', rank: 10, description: '日常檢視與查詢' },
];

export const LEVEL_CODES = LEVELS.map((l) => l.code);
export const levelOf = (code: LevelCode) => LEVELS.find((l) => l.code === code)!;

export type PermissionType = 'page' | 'button';

export interface PermissionDef {
  code: string;
  name: string;
  module: 'dashboard' | 'bff' | 'sys';
  type: PermissionType;
  description: string;
}

export const MODULES = [
  { code: 'dashboard', name: '總覽' },
  { code: 'bff', name: 'Gateway 管理' },
  { code: 'sys', name: '系統管理' },
] as const;

export const PERMISSIONS: PermissionDef[] = [
  { code: 'dashboard.view', name: '檢視儀表板', module: 'dashboard', type: 'page', description: '首頁儀表板與卡片' },

  { code: 'bff.route.read', name: '檢視服務與路由', module: 'bff', type: 'page', description: '上游服務、API 路由、發佈版本' },
  { code: 'bff.route.export', name: '匯出路由清單', module: 'bff', type: 'button', description: '下載 CSV' },
  { code: 'bff.route.publish', name: '發佈 / 回滾', module: 'bff', type: 'button', description: '發佈草稿路由、回滾到上一版' },
  { code: 'bff.upstream.edit', name: '編輯上游服務', module: 'bff', type: 'button', description: '調整上游逾時、目標位址' },
  { code: 'bff.rbac.read', name: '檢視 BFF 權限', module: 'bff', type: 'page', description: '角色權限矩陣、權限反查、關係圖' },
  { code: 'bff.rbac.edit', name: '設定 BFF 角色權限', module: 'bff', type: 'button', description: '調整 Gateway 角色擁有的權限' },

  { code: 'sys.user.read', name: '檢視人員', module: 'sys', type: 'page', description: '非系統管理員只看得到自己部門' },
  { code: 'sys.user.create', name: '新增人員', module: 'sys', type: 'button', description: '建立 IT 管理系統帳號' },
  { code: 'sys.user.edit', name: '編輯人員', module: 'sys', type: 'button', description: '調整姓名、部門、職級' },
  { code: 'sys.user.disable', name: '停用 / 啟用人員', module: 'sys', type: 'button', description: '停用後立即登出' },
  { code: 'sys.user.reset-password', name: '重設密碼', module: 'sys', type: 'button', description: '產生一次性臨時密碼' },
  { code: 'sys.dept.read', name: '檢視部門', module: 'sys', type: 'page', description: '部門清單與人數' },
  { code: 'sys.dept.edit', name: '編輯部門', module: 'sys', type: 'button', description: '新增部門、修改名稱與主管' },
  { code: 'sys.perm.read', name: '檢視角色與按鈕權限', module: 'sys', type: 'page', description: '職級 × 權限矩陣、部門限制' },
  { code: 'sys.perm.edit', name: '設定角色與按鈕權限', module: 'sys', type: 'button', description: '調整職級權限與部門限制' },
  { code: 'sys.audit.read', name: '檢視稽核紀錄', module: 'sys', type: 'page', description: '操作紀錄與登入紀錄' },
];

export const PERMISSION_CODES = new Set(PERMISSIONS.map((p) => p.code));

/** 預設職級權限(admin 固定全部,不列) */
export const DEFAULT_LEVEL_PERMISSIONS: Record<Exclude<LevelCode, 'admin'>, string[]> = {
  manager: [
    'dashboard.view',
    'bff.route.read',
    'bff.route.export',
    'bff.route.publish',
    'bff.rbac.read',
    'bff.rbac.edit',
    'sys.user.read',
    'sys.user.create',
    'sys.user.edit',
    'sys.user.disable',
    'sys.user.reset-password',
    'sys.dept.read',
    'sys.perm.read',
    'sys.audit.read',
  ],
  senior: [
    'dashboard.view',
    'bff.route.read',
    'bff.route.export',
    'bff.route.publish',
    'bff.upstream.edit',
    'bff.rbac.read',
    'sys.user.read',
    'sys.dept.read',
    'sys.perm.read',
  ],
  engineer: ['dashboard.view', 'bff.route.read', 'bff.rbac.read', 'sys.user.read', 'sys.dept.read'],
};

/** 預設部門限制:權限 → 允許的部門(未列出 = 不限部門) */
export const DEFAULT_DEPT_RESTRICTIONS: Record<string, string[]> = {
  'bff.route.publish': ['DEV', 'SYS'],
  'bff.upstream.edit': ['NET', 'SYS'],
  'bff.rbac.edit': ['SYS', 'SEC'],
};

export interface MenuItem {
  key: string;
  title: string;
  path: string;
  permission: string;
}

export interface MenuGroup {
  key: string;
  title: string;
  icon: string;
  children: MenuItem[];
}

export const MENUS: MenuGroup[] = [
  {
    key: 'overview',
    title: '總覽',
    icon: 'dashboard',
    children: [{ key: 'dashboard', title: '儀表板', path: '/dashboard', permission: 'dashboard.view' }],
  },
  {
    key: 'gateway',
    title: 'Gateway 管理',
    icon: 'gateway',
    children: [
      { key: 'gw-services', title: '服務與路由', path: '/gateway/services', permission: 'bff.route.read' },
      { key: 'gw-rbac', title: 'BFF 權限', path: '/gateway/rbac', permission: 'bff.rbac.read' },
    ],
  },
  {
    key: 'system',
    title: '系統管理',
    icon: 'settings',
    children: [
      { key: 'sys-users', title: '人員與部門', path: '/system/users', permission: 'sys.user.read' },
      { key: 'sys-perms', title: '角色與按鈕權限', path: '/system/permissions', permission: 'sys.perm.read' },
      { key: 'sys-audit', title: '稽核紀錄', path: '/system/audit', permission: 'sys.audit.read' },
    ],
  },
];

/** 依權限過濾選單;沒有任何可見子項目的群組不回傳 */
export function menusFor(permissions: Set<string>): MenuGroup[] {
  return MENUS.map((g) => ({ ...g, children: g.children.filter((c) => permissions.has(c.permission)) })).filter((g) => g.children.length);
}
