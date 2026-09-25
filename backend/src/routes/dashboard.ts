/**
 * 首頁儀表板(dashboard.view),依區塊拆成多支 API,前端依 Tab 與捲動位置按需載入(懶加載):
 *   GET /it/api/dashboard/overview   KPI、24 小時流量、告警                      (營運總覽 Tab 上半部)
 *   GET /it/api/dashboard/work       近期工單、最近操作                          (營運總覽 Tab 下半部,捲動到才載入)
 *   GET /it/api/dashboard/gateway    Gateway 統計(BFF)、上游 p95               (Gateway 概況 Tab)
 *   GET /it/api/dashboard/team       各部門成員數、工單數                        (團隊工作 Tab)
 * 只有 gateway 區塊會呼叫 BFF;BFF 無法連線時只有這支回 502,其他區塊不受影響。
 * 真實資料:Gateway 統計、部門人數、最近操作。模擬資料:KPI、流量、上游延遲、工單、告警(回應的 mockSections 標示)。
 * 模擬值以「日期 + 區塊」為種子產生,同一天內重新整理數字不會跳動。
 */
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, currentUser } from '../auth/plugin.js';
import type { BffService } from '../bff/service.js';
import type { Store } from '../store/store.js';

function rng(seed: string) {
  let h = 1779033703;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 3432918353);
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function series(rand: () => number, n: number, base: number, spread: number): number[] {
  let v = base;
  return Array.from({ length: n }, () => (v = Math.max(0, Math.round(v + (rand() - 0.45) * spread))));
}

const TICKET_TITLES = [
  ['NET', '3F 會議室 Wi-Fi 斷線'],
  ['SYS', 'AD 帳號鎖定解除'],
  ['DEV', 'MES 報工畫面逾時'],
  ['SEC', '弱點掃描高風險項目修補'],
  ['SYS', 'VM 磁碟空間不足告警'],
  ['DEV', '入口網公告排版異常'],
  ['NET', 'VPN 連線憑證更新'],
  ['SEC', '可疑登入來源調查'],
] as const;

const dashboardRoutes: FastifyPluginAsync<{ store: Store; bff: BffService }> = async (app, { store, bff }) => {
  const P = `${API_PREFIX}/dashboard`;
  const opts = { config: { permission: 'dashboard.view' } };
  const today = () => new Date().toISOString().slice(0, 10);

  app.get(`${P}/overview`, opts, async () => {
    const rand = rng(`${today()}:overview`);
    const calls = series(rand, 14, 82000, 14000);
    const latency = series(rand, 14, 118, 26);
    const pct = (xs: number[]) => +(((xs.at(-1)! - xs.at(-2)!) / xs.at(-2)!) * 100).toFixed(1);
    const kpis = [
      { key: 'calls', label: '今日 API 呼叫', value: calls.at(-1)!, unit: '次', delta: pct(calls), trend: calls, tone: 'primary' },
      {
        key: 'availability',
        label: '服務可用率',
        value: +(99.8 + rand() * 0.19).toFixed(2),
        unit: '%',
        delta: +(rand() * 0.1).toFixed(2),
        trend: series(rand, 14, 998, 3),
        tone: 'success',
      },
      { key: 'latency', label: '平均回應時間', value: latency.at(-1)!, unit: 'ms', delta: pct(latency), trend: latency, tone: 'info' },
      {
        key: 'tickets',
        label: '待處理工單',
        value: 12 + Math.floor(rand() * 14),
        unit: '件',
        delta: -Math.floor(rand() * 5),
        trend: series(rand, 14, 20, 6),
        tone: 'warning',
      },
      { key: 'alerts', label: '資安告警', value: Math.floor(rand() * 5), unit: '件', delta: 0, trend: series(rand, 14, 3, 3), tone: 'danger' },
    ];
    const traffic = Array.from({ length: 24 }, (_, h) => {
      const office = h >= 8 && h <= 18 ? 1 : 0.25;
      return { hour: h, requests: Math.round((2400 + rand() * 1600) * office), errors: Math.round(rand() * 30 * office) };
    });
    const alerts = [
      { level: 'warning', title: 'core-hrm p95 回應時間上升', at: new Date(Date.now() - 42 * 60_000).toISOString() },
      { level: 'info', title: '路由版本已發佈', at: new Date(Date.now() - 3 * 3600_000).toISOString() },
      { level: 'danger', title: 'VPN 閘道憑證 14 天後到期', at: new Date(Date.now() - 5 * 3600_000).toISOString() },
    ];
    return { generatedAt: new Date().toISOString(), mockSections: ['kpis', 'traffic', 'alerts'], kpis, traffic, alerts };
  });

  app.get(`${P}/work`, opts, async (req) => {
    const me = currentUser(req);
    const day = today();
    const rand = rng(`${day}:work`);
    const tickets = TICKET_TITLES.map(([dept, title], i) => ({
      id: `IT-${day.replaceAll('-', '').slice(2)}-${String(i + 1).padStart(3, '0')}`,
      title,
      dept,
      deptName: store.data.departments.find((d) => d.code === dept)?.name ?? dept,
      priority: (['high', 'medium', 'low'] as const)[Math.floor(rand() * 3)],
      status: (['open', 'in_progress', 'resolved'] as const)[Math.floor(rand() * 3)],
      updatedAt: new Date(Date.now() - Math.floor(rand() * 36) * 3600_000).toISOString(),
    }));
    // 最近操作:有稽核權限看全部,否則只看自己的
    const canAudit = req.permissions.has('sys.audit.read');
    const activity = store.data.audit.filter((a) => canAudit || a.actor === me.employeeNo).slice(0, 8);
    return { generatedAt: new Date().toISOString(), mockSections: ['tickets'], tickets, activity, activityScope: canAudit ? 'all' : 'self' };
  });

  app.get(`${P}/gateway`, opts, async () => {
    const rand = rng(`${today()}:gateway`);
    const [overview, routes, rbac] = await Promise.all([bff.overview(), bff.routes(), bff.rbac()]);
    const byStatus = (s: string) => routes.filter((r) => r.status === s).length;
    const bySystem = new Map<string, number>();
    for (const r of routes) bySystem.set(r.systemCode, (bySystem.get(r.systemCode) ?? 0) + 1);
    const services = overview.upstreams.map((u) => {
      const p95 = Math.round(60 + rand() * 260);
      return { code: u.code, name: u.name, system: u.systemCode, p95, availability: +(99 + rand()).toFixed(2), status: p95 > 280 ? 'degraded' : 'healthy' };
    });
    return {
      generatedAt: new Date().toISOString(),
      mockSections: ['services'],
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
      services,
    };
  });

  app.get(`${P}/team`, opts, async () => {
    const rand = rng(`${today()}:team`);
    const departments = store.data.departments.map((d) => ({
      code: d.code,
      name: d.name,
      members: store.data.users.filter((u) => u.deptCode === d.code && !u.isDisabled).length,
      open: 2 + Math.floor(rand() * 9),
      closed: 8 + Math.floor(rand() * 20),
    }));
    return { generatedAt: new Date().toISOString(), mockSections: ['departments.open', 'departments.closed'], departments };
  });
};

export default dashboardRoutes;
