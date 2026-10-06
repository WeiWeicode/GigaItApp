/**
 * 儀表板資料(依區塊拆開,前端依 Tab 與捲動位置按需載入):
 *   overview / tickets → itapp-api 經 BFF 的 /api/it/dashboard/*(Gateway 路由 it.dashboard.*,權限 it.dashboard.read)
 *   最近操作          → BFF 稽核 /api/admin/audit-logs(有 gw.admin.audit.read 才看得到全部,否則不顯示)
 *   Gateway 概況      → BFF 管理 API(上游、路由、角色 / 權限、待發佈草稿)即時統計
 *   團隊工作          → BFF 部門樹:登入者所在部門(直屬人數)與其各下層部門(含下層人數)
 *   API 呼叫 / 可用率 / 回應時間 / 流量 / 告警 / 上游服務健康 → 架構觀測 /api/observe/*(giga-observe,observe.data.read;
 *                       沒有權限或 Gateway 尚未發佈路由時回傳 null,畫面維持「開發中」,MONITORING-PLAN W9-11)
 */
import { audit, gw, rbac, type DeptNode } from '@/api/admin';
import { can, GW, OBS } from '@/api/auth';
import { http } from '@/api/http';
import { notConnected, observe } from '@/api/observe';
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
  const [ups, routes, roles, perms, preview, health] = await Promise.all([
    gw.upstreams(),
    gw.routes({ page: 1, pageSize: 200 }),
    can(GW.rbacRead) ? rbac.roles() : null,
    can(GW.rbacRead) ? rbac.permissions() : null,
    can(GW.release) ? gw.releasePreview() : null,
    // 上游服務健康:近 1 小時經 BFF 轉送的呼叫(giga-observe);取不到不影響其他統計
    can(OBS.read) ? observe.upstreams(1).catch(() => null) : null,
  ]);
  const live = routes.items.filter((r) => r.status !== 'disabled');
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return m;
  };
  const systemOf = (code: string) => ups.items.find((u) => u.code === code)?.systemCode ?? '—';
  const services = (health ?? []).map((h) => ({
    code: h.upstream,
    name: h.upstream,
    system: systemOf(h.upstream),
    p95: h.p95Ms ?? 0,
    availability: h.availability === null ? 0 : Math.round(h.availability * 10000) / 100,
    status: (h.errorRate >= 0.05 || (h.p95Ms ?? 0) > 1000 ? 'degraded' : 'healthy') as 'healthy' | 'degraded',
  }));
  return {
    mockSections: health ? [] : ['services'],
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
    services,
  };
}

/**
 * 營運總覽的 KPI、今日流量、系統告警(giga-observe):沒有 observe.data.read 或尚未接入時回傳 null
 * 「API 呼叫」以入口 BFF 的紀錄計(同一請求不重複算下游),日界線為台灣時間;待處理工單仍為開發中
 */
export async function loadObserveOverview(): Promise<DashboardOverview | null> {
  if (!can(OBS.read)) return null;
  try {
    const [t, a] = await Promise.all([observe.today(), observe.alerts()]);
    const today = t.today;
    const y = t.yesterday;
    // 昨日同時段樣本太少(< 50 次)時不比較,避免清晨出現上萬 % 的增減
    const comparable = (y?.total ?? 0) >= 50;
    const pct = (cur: number | null | undefined, prev: number | null | undefined) =>
      comparable && cur != null && prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : undefined;
    const kpis: DashboardOverview['kpis'] = [
      { key: 'calls', label: '今日 API 呼叫', value: (today?.total ?? 0).toLocaleString(), delta: pct(today?.total, y?.total), trend: t.hourly.map((h) => h.total), tone: 'primary', hint: '較昨日同時段' },
      {
        key: 'availability',
        label: '服務可用率',
        value: today?.availability == null ? '—' : (today.availability * 100).toFixed(2),
        unit: today?.availability == null ? '' : '%',
        delta: comparable && today?.availability != null && y?.availability != null ? Math.round((today.availability - y.availability) * 10000) / 100 : undefined,
        trend: t.hourly.map((h) => (h.total ? (h.total - h.errors) / h.total : 1)),
        tone: 'success',
        hint: '非 5xx 比例,較昨日',
      },
      {
        key: 'latency',
        label: '平均回應時間',
        value: today?.avgMs ?? '—',
        unit: today?.avgMs == null ? '' : 'ms',
        delta: pct(today?.avgMs, y?.avgMs),
        trend: t.hourly.map((h) => h.avgMs ?? 0),
        tone: 'cyan',
        hint: today?.p95Ms != null ? `p95 ${today.p95Ms} ms` : '較昨日',
      },
      { key: 'tickets', label: '待處理工單', value: '開發中', tone: 'neutral', hint: '工單整合開發中' },
      { key: 'alerts', label: '資安告警', value: a.counts.security, unit: '件', tone: a.counts.security ? 'warning' : 'success', hint: `近 ${a.windowMin} 分鐘;系統告警 ${a.counts.system} 件` },
    ];
    return {
      generatedAt: new Date().toISOString(),
      mockSections: ['tickets'],
      kpis,
      traffic: t.hourly.map((h) => ({ hour: new Date(h.ts).getHours(), requests: h.total, errors: h.errors })),
      alerts: a.items
        .filter((x) => x.category === 'system')
        .map((x) => ({ level: x.severity === 'critical' ? 'danger' : 'warning', title: `${x.title}:${x.detail}`, at: x.since ?? new Date().toISOString() })),
    };
  } catch (e) {
    if (notConnected(e)) return null;
    throw e;
  }
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
