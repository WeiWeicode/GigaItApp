/** 顯示用格式與對照(頁面共用,避免各頁各寫一套) */

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function fromNow(iso: string | null | undefined): string {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return '剛剛';
  if (s < 3600) return `${Math.floor(s / 60)} 分鐘前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小時前`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)} 天前`;
  return fmtTime(iso);
}

export const METHOD_TONE: Record<string, string> = { GET: 'success', POST: 'primary', PUT: 'warning', PATCH: 'warning', DELETE: 'danger', '*': 'neutral' };
export const AUTH_MODE: Record<string, { label: string; tone: string; icon: string }> = {
  public: { label: '公開', tone: 'warning', icon: 'globe' },
  authenticated: { label: '登入即可', tone: 'info', icon: 'user' },
  permission: { label: '需權限', tone: 'violet', icon: 'key' },
};
export const ROUTE_STATUS: Record<string, { label: string; tone: string }> = {
  published: { label: '已發佈', tone: 'success' },
  draft: { label: '草稿', tone: 'warning' },
  deprecated: { label: '已棄用', tone: 'neutral' },
  disabled: { label: '停用', tone: 'danger' },
};
export const LEVEL_TONE: Record<string, string> = { admin: 'danger', manager: 'violet', senior: 'primary', engineer: 'cyan' };

/** 稽核動作的中文說明 */
export const ACTION_LABEL: Record<string, string> = {
  login: '登入',
  logout: '登出',
  'password.change': '變更密碼',
  'user.create': '新增人員',
  'user.update': '編輯人員',
  'user.disable': '停用人員',
  'user.enable': '啟用人員',
  'user.reset-password': '重設密碼',
  'user.demo-remove': '移除示範帳號',
  'dept.create': '新增部門',
  'dept.update': '編輯部門',
  'rbac.level.update': '調整職級權限',
  'rbac.dept-restriction.update': '調整部門限制',
  'bff.release.publish': '發佈 Gateway 路由',
  'bff.rbac.update': '調整 BFF 角色權限',
};
