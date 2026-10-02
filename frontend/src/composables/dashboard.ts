/**
 * 儀表板資料(依區塊拆開,前端依 Tab 與捲動位置按需載入):
 *   overview / tickets → itapp-api 經 BFF 的 /api/it/dashboard/*(Gateway 路由 it.dashboard.*,權限 it.dashboard.read)
 *   最近操作          → BFF 稽核 /api/admin/audit-logs(有 gw.admin.audit.read 才看得到全部,否則不顯示)
 *   Gateway 概況      → BFF 管理 API(上游、路由、角色 / 權限、待發佈草稿)即時統計
 *   團隊工作          → BFF 部門樹:登入者所在部門(直屬人數)與其各下層部門(含下層人數)
 */
import { audit, gw, rbac, type DeptNode } from '@/api/admin';
import { can, GW } from '@/api/auth';
import { http } from '@/api/http';
import type { AuditEntry, DashboardGateway, DashboardOverview, DashboardTeam, DashboardWork } from '@/api/types';

export const loadOverview = () => http.get<DashboardOverview>('/api/it/dashboard/overview');

export const loadTickets = () => http.get<Pick<DashboardWork, 'mockSections' | 'tickets'>>('/api/it/dashboard/work');

/** 最近 8 筆管理操作;沒有稽核權限時回傳 null(畫面不顯示) */
export async function loadActivity(): Promise<AuditEntry[] | null> {
  if (!can(GW.auditRead)) return null;
  const r = await audit.operations({ page: 1, pageSize: 8 });
  return r.items.map((a) => ({
    id: a.auditId,
    at: a.occurredAt,
    type: 'operation',
    actor: a.actorName ?? '—',
    action: a.action,
    target: a.entityId,
    result: 'success',
    detail: null,
    ip: a.actorIp,
  }));
}

export async function loadGateway(): Promise<DashboardGateway> {
  const [ups, routes, roles, perms, preview] = await Promise.all([
    gw.upstreams(),
    gw.routes({ page: 1, pageSize: 200 }),
    can(GW.rbacRead) ? rbac.roles() : null,
    can(GW.rbacRead) ? rbac.permissions() : null,
    can(GW.release) ? gw.releasePreview() : null,
  ]);
  const live = routes.items.filter((r) => r.status !== 'disabled');
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  return {
    mockSections: [],
    gateway: {
      source: 'live',
      upstreams: ups.items.filter((u) => u.isEnabled).length,
      routes: live.length,
      published: live.filter((r) => r.status === 'published').length,
      draft: preview?.drafts.length ?? live.filter((r) => r.status === 'draft').length,
      deprecated: live.filter((r) => r.status === 'deprecated').length,
      permissions: perms?.items.length ?? 0,
      roles: roles?.items.length ?? 0,
      liveVersion: preview?.currentVersion ?? null,
      bySystem: [...count(live.map((r) => r.systemCode))].map(([system, n]) => ({ system, count: n })),
      byAuthMode: [...count(live.map((r) => r.authMode))].map(([mode, n]) => ({ mode, count: n })),
    },
    services: [],
  };
}

export async function loadTeam(deptCode: string | null): Promise<DashboardTeam & { unit: string | null }> {
  const r = await rbac.departments();
  // 登入者所在部門即「團隊」;有下層部門時以各下層部門分別顯示
  const find = (list: DeptNode[]): DeptNode | null => {
    for (const n of list) {
      const hit = n.deptCode === deptCode ? n : find(n.children);
      if (hit) return hit;
    }
    return null;
  };
  const unit = find(r.items);
  const total = (n: DeptNode): number => n.userCount + n.children.reduce((s, c) => s + total(c), 0);
  // 部門本身只算直屬人數,下層部門各自算含下層的人數
  const rows = unit
    ? [
        ...(unit.userCount || !unit.children.length ? [{ code: unit.deptCode, name: unit.name, members: unit.userCount }] : []),
        ...unit.children.map((d) => ({ code: d.deptCode, name: d.name, members: total(d) })),
      ]
    : [];
  return {
    mockSections: ['tickets'],
    unit: unit ? `${unit.name}(${unit.deptCode})` : null,
    departments: rows.map((d) => ({ ...d, open: 0, closed: 0 })),
  };
}
