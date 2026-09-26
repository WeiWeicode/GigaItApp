/**
 * 應用切換(giga-Portal PRD FR-2.3、Gateway PRD §8.3.3、FRONTEND-GUIDE §7.4):與 giga-Portal `composables/apps.ts` 相同規則。
 * 資料來源是使用者的 Gateway 登入(/api/auth/me,gn_at Cookie),與本系統的登入(it_at)分開;沒有 Gateway 登入時不顯示應用切換。
 * me 尚無 apps(Gateway G3 未實作)時,**暫時**以 permissions 中的 app 權限對照 TEMP_APPS 推導。
 * TODO(Gateway G3 上線後):移除 TEMP_APPS 與推導,只用 me.apps。改單一入口(I1)後改用 web-kit 的 me。
 */
import { gatewayGet } from '@/api/gateway';

export const CURRENT_APP = 'it';

export interface AppEntry {
  code: string;
  name: string;
  basePath: string;
  icon: string;
}

/** 暫時做法:應用登記的對照表(正式資料在 Gateway gw.app);內容需與 giga-Portal 相同 */
export const TEMP_APPS: readonly (AppEntry & { permission: string })[] = [
  { code: 'portal', name: '員工入口網', basePath: '/', icon: 'home', permission: 'portal.app.access' },
  { code: 'it', name: 'IT 管理系統', basePath: '/it/', icon: 'monitor', permission: 'it.app.access' },
];

export function resolveApps(me: { apps?: AppEntry[]; permissions: string[] } | null): { apps: AppEntry[]; derived: boolean } {
  if (!me) return { apps: [], derived: false };
  if (Array.isArray(me.apps)) return { apps: me.apps, derived: false };
  const perms = new Set(me.permissions);
  return { apps: TEMP_APPS.filter((a) => perms.has(a.permission)).map(({ permission: _p, ...a }) => a), derived: true };
}

/** 讀取 Gateway 的 me;未登入 Gateway(401)或無法連線時回傳 null(不顯示應用切換,不影響本系統) */
export async function loadGatewayApps(): Promise<{ apps: AppEntry[]; derived: boolean }> {
  const me = await gatewayGet<{ apps?: AppEntry[]; permissions: string[] }>('/api/auth/me').catch(() => null);
  return resolveApps(me);
}
