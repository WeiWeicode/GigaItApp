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
  api_key: { label: 'API Key', tone: 'cyan', icon: 'fingerprint' },
};
export const ROUTE_STATUS: Record<string, { label: string; tone: string }> = {
  published: { label: '已發佈', tone: 'success' },
  draft: { label: '草稿', tone: 'warning' },
  deprecated: { label: '已棄用', tone: 'neutral' },
  disabled: { label: '停用', tone: 'danger' },
};
/** Gateway 稽核動作(gw.audit_log.action)的中文說明;未列出者顯示原代碼 */
export const ACTION_LABEL: Record<string, string> = {
  'upstream.create': '新增上游',
  'upstream.update': '修改上游',
  'upstream.disable': '停用上游',
  'route.create': '新增路由',
  'route.update': '修改路由',
  'route.disable': '停用路由',
  'route.steps': '修改聚合步驟',
  'route.test': '試打路由',
  'route.import': '匯入路由',
  'route.import.preview': '匯入預覽',
  'rate_limit.create': '新增限流政策',
  'rate_limit.update': '修改限流政策',
  'rate_limit.delete': '刪除限流政策',
  'release.publish': '發佈',
  'release.rollback': '回滾',
  'permission.create': '新增權限',
  'permission.update': '修改權限',
  'permission.delete': '刪除權限',
  'role.create': '新增角色',
  'role.update': '修改角色',
  'role.delete': '刪除角色',
  'role.apply': '套用角色(CLI)',
  'role.permissions.replace': '設定角色權限',
  'role.ad_groups.replace': '設定 AD 群組對應',
  'role.rule.create': '新增指派規則',
  'role.rule.update': '修改指派規則',
  'role.rule.delete': '刪除指派規則',
  'user.update': '修改使用者',
  'user.revoke_sessions': '強制登出',
  'company.ad_domains': '設定公司網域',
  'company.roles': '設定公司預設角色',
  'local.create': '代建本機帳號',
  'local.approve': '核准註冊',
  'local.reset': '重設密碼',
  'local.unlock': '解除鎖定',
  'local.disable': '停用本機帳號',
  'client.create': '建立 API Key',
  'client.rotate': '換發 API Key',
  'client.disable': '停用 API Key',
  'config.apply': '套用設定(CLI)',
  'app.apply': '應用登記(CLI)',
  'department.sync': '部門同步',
  'employee_sync.trigger': '觸發人員同步',
  'notify.template.create': '新增通知範本',
  'notify.template.update': '修改通知範本',
};

/** 登入紀錄事件(gw.auth_log.event) */
export const AUTH_EVENT: Record<string, { label: string; tone: string }> = {
  login_success: { label: '登入成功', tone: 'success' },
  login_fail: { label: '登入失敗', tone: 'danger' },
  logout: { label: '登出', tone: 'neutral' },
  refresh: { label: '換發 Token', tone: 'neutral' },
  account_locked: { label: '帳號鎖定', tone: 'danger' },
  token_reuse_detected: { label: 'Token 重複使用', tone: 'danger' },
  password_changed: { label: '變更密碼', tone: 'info' },
  password_reset: { label: '重設密碼', tone: 'info' },
  pw_reset_requested: { label: '申請重設密碼', tone: 'info' },
  pw_reset_skipped: { label: '重設密碼略過', tone: 'warning' },
  register_requested: { label: '申請註冊', tone: 'info' },
  register_pending: { label: '註冊待審核', tone: 'warning' },
  register_verified: { label: '註冊完成', tone: 'success' },
  register_rejected: { label: '註冊被拒', tone: 'danger' },
  legacy_migrated: { label: '舊帳號遷移', tone: 'info' },
};
