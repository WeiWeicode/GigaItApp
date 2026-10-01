/**
 * 首頁儀表板(dashboard.view),依區塊拆成多支 API,前端依 Tab 與捲動位置按需載入(懶加載):
 *   GET /it/api/dashboard/overview   KPI、24 小時流量、告警                      (營運總覽 Tab 上半部)
 *   GET /it/api/dashboard/work       近期工單、最近操作                          (營運總覽 Tab 下半部,捲動到才載入)
 *   GET /it/api/dashboard/gateway    Gateway 統計(BFF)、上游 p95               (Gateway 概況 Tab)
 *   GET /it/api/dashboard/team       各部門成員數、工單數                        (團隊工作 Tab)
 * 只有 gateway 區塊會呼叫 BFF;BFF 無法連線時只有這支回 502,其他區塊不受影響。
 * 真實資料:Gateway 統計、部門人數、最近操作。模擬資料已清空,前端保留卡片並標示「開發中」。
 */
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, currentUser } from '../auth/plugin.js';
import type { BffService } from '../bff/service.js';
import type { Store } from '../store/store.js';

const dashboardRoutes: FastifyPluginAsync<{ store: Store; bff: BffService }> = async (app, { store, bff }) => {
  const P = `${API_PREFIX}/dashboard`;
  const opts = { config: { permission: 'dashboard.view' } };

  app.get(`${P}/overview`, opts, async () => {
    return {
      generatedAt: new Date().toISOString(),
      mockSections: [],
      kpis: [],
      traffic: [],
      alerts: [],
    };
  });

  app.get(`${P}/work`, opts, async (req) => {
    const me = currentUser(req);
    // 最近操作:有稽核權限看全部,否則只看自己的
    const canAudit = req.permissions.has('sys.audit.read');
    const activity = store.data.audit.filter((a) => canAudit || a.actor === me.employeeNo).slice(0, 8);
    return {
      generatedAt: new Date().toISOString(),
      mockSections: [],
      tickets: [],
      activity,
      activityScope: canAudit ? 'all' : 'self',
    };
  });

  app.get(`${P}/gateway`, opts, async () => {
    const [overview, routes, rbac] = await Promise.all([bff.overview(), bff.routes(), bff.rbac()]);
    const byStatus = (s: string) => routes.filter((r) => r.status === s).length;
    const bySystem = new Map<string, number>();
    for (const r of routes) bySystem.set(r.systemCode, (bySystem.get(r.systemCode) ?? 0) + 1);
    return {
      generatedAt: new Date().toISOString(),
      mockSections: [],
      gateway: {
        source: bff.mode,
        upstreams: overview.upstreams.length,
        routes: routes.length,
        published: byStatus('published'),
        draft: overview.release.draftRoutes,
        deprecated: byStatus('deprecated'),
        permissions: rbac.permissions.length,
        roles: rbac.roles.length,
        liveVersion: overview.release.liveVersion,
        bySystem: [...bySystem].map(([system, count]) => ({ system, count })),
        byAuthMode: ['public', 'authenticated', 'permission'].map((m) => ({ mode: m, count: routes.filter((r) => r.authMode === m).length })),
      },
      services: [],
    };
  });

  app.get(`${P}/team`, opts, async () => {
    const departments = store.data.departments.map((d) => ({
      code: d.code,
      name: d.name,
      members: store.data.users.filter((u) => u.deptCode === d.code && !u.isDisabled).length,
      open: 0,
      closed: 0,
    }));
    return {
      generatedAt: new Date().toISOString(),
      mockSections: [],
      departments,
    };
  });
};

export default dashboardRoutes;
