/**
 * 應用切換與應用層守衛(giga-Portal PRD FR-2.3、FR-2.5,Gateway PRD §8.3.3、FRONTEND-GUIDE §7.4):
 * 應用清單取自 Gateway /api/auth/me 的 apps(已依權限過濾;Gateway G3 已上線)。
 * 舊版 BFF 沒有 apps 時退回以 it.app.access 判斷,只顯示本系統。
 */
import type { AppEntry, Me } from '@/api/auth';
import { IT } from '@/api/auth';

export const CURRENT_APP = 'it';

export function appsOf(me: Me | null): AppEntry[] {
  if (!me) return [];
  if (Array.isArray(me.apps)) return me.apps;
  return me.permissions.includes(IT.app) ? [{ code: 'it', name: 'IT 管理系統', basePath: '/it/', icon: 'monitor' }] : [];
}

/** 應用層守衛:沒有本系統的應用權限 → 導回入口網(FR-2.5) */
export function hasCurrentApp(me: Me | null): boolean {
  return appsOf(me).some((a) => a.code === CURRENT_APP);
}
