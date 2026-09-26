/**
 * Gateway BFF 管理資料(視覺化與設定):
 *   GET  /it/api/bff/overview                    上游、限流政策、線上版本            bff.route.read
 *   GET  /it/api/bff/routes                      API 路由清單(後端篩選 + 分頁)       bff.route.read
 *   GET  /it/api/bff/releases                    發佈版本(分頁,由新到舊)           bff.route.read
 *   POST /it/api/bff/releases                    發佈(mock 模擬;live 尚未支援)     bff.route.publish
 *   GET  /it/api/bff/rbac                        角色、權限、角色權限、AD 群組、公司   bff.rbac.read
 *   GET  /it/api/bff/rbac/who-can-access         權限反查                            bff.rbac.read
 *   PUT  /it/api/bff/rbac/roles/:role/permissions 設定角色權限(mock;live 尚未支援) bff.rbac.edit
 * 查詢參數 refresh=1 略過快取。清單一律分頁回傳,不讓瀏覽器一次下載全部(AGENT.md §7.1)。
 * BFF 的路由查詢沒有分頁(上限 200),itapp-api 快取整份後再依條件篩選、分頁給前端。
 */
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, currentUser } from '../auth/plugin.js';
import type { BffService } from '../bff/service.js';
import type { Store } from '../store/store.js';
import { matchesQ, pageProps, paginate } from './paging.js';

type Refresh = { Querystring: { refresh?: string } };
const refreshQs = { type: 'object', properties: { refresh: { type: 'string', enum: ['0', '1'] } } } as const;

const bffRoutes: FastifyPluginAsync<{ bff: BffService; store: Store }> = async (app, { bff, store }) => {
  const P = `${API_PREFIX}/bff`;
  const meta = () => ({ source: bff.mode, fetchedAt: new Date().toISOString() });

  app.get<Refresh>(`${P}/overview`, { config: { permission: 'bff.route.read' }, schema: { querystring: refreshQs } }, async (req) => ({
    ...meta(),
    ...(await bff.overview(req.query.refresh === '1')),
  }));

  type RouteQuery = {
    refresh?: string;
    q?: string;
    system?: string;
    upstream?: string;
    authMode?: string;
    status?: string;
    permission?: string;
    page: number;
    pageSize: number;
  };
  app.get<{ Querystring: RouteQuery }>(
    `${P}/routes`,
    {
      config: { permission: 'bff.route.read' },
      schema: {
        querystring: {
          type: 'object',
          properties: {
            ...refreshQs.properties,
            q: { type: 'string', maxLength: 100 },
            system: { type: 'string', maxLength: 30 },
            upstream: { type: 'string', maxLength: 60 },
            authMode: { type: 'string', enum: ['public', 'authenticated', 'permission'] },
            status: { type: 'string', maxLength: 20 },
            permission: { type: 'string', maxLength: 100 },
            ...pageProps(500),
          },
        },
      },
    },
    async (req) => {
      const { q, system, upstream, authMode, status, permission, page, pageSize } = req.query;
      const all = await bff.routes(req.query.refresh === '1');
      const rows = all.filter(
        (r) =>
          (!system || r.systemCode === system) &&
          (!upstream || r.upstream === upstream) &&
          (!authMode || r.authMode === authMode) &&
          (!status || r.status === status) &&
          (!permission || r.permissionCode === permission) &&
          matchesQ(q, [r.routeCode, r.name, r.publicPath, r.permissionCode, r.tags, r.project]),
      );
      const distinct = (xs: (string | null)[]) => [...new Set(xs.filter((x): x is string => !!x))].sort();
      return {
        ...meta(),
        ...paginate(rows, page, pageSize),
        // 篩選下拉選單的選項(不必為了選項下載全部路由)
        facets: { systems: distinct(all.map((r) => r.systemCode)), upstreams: distinct(all.map((r) => r.upstream)), totalAll: all.length },
      };
    },
  );

  app.get<{ Querystring: { refresh?: string; page: number; pageSize: number } }>(
    `${P}/releases`,
    { config: { permission: 'bff.route.read' }, schema: { querystring: { type: 'object', properties: { ...refreshQs.properties, ...pageProps(50, 10) } } } },
    async (req) => {
      const { page, pageSize } = req.query;
      return { ...meta(), ...(await bff.releases(page, pageSize, req.query.refresh === '1')), page, pageSize };
    },
  );

  app.post<{ Body: { note: string } }>(
    `${P}/releases`,
    {
      config: { permission: 'bff.route.publish' },
      schema: {
        body: { type: 'object', required: ['note'], additionalProperties: false, properties: { note: { type: 'string', minLength: 1, maxLength: 200 } } },
      },
    },
    async (req) => {
      const u = currentUser(req);
      const release = await bff.publish(req.body.note, u.employeeNo);
      store.addAudit({
        type: 'operation',
        actor: u.employeeNo,
        action: 'bff.release.publish',
        target: `#${release.releaseId}`,
        result: 'success',
        detail: req.body.note,
        ip: req.ip,
      });
      return { ...meta(), release };
    },
  );

  app.get<Refresh>(`${P}/rbac`, { config: { permission: 'bff.rbac.read' }, schema: { querystring: refreshQs } }, async (req) => ({
    ...meta(),
    ...(await bff.rbac(req.query.refresh === '1')),
  }));

  app.get<{ Querystring: { permission: string } }>(
    `${P}/rbac/who-can-access`,
    {
      config: { permission: 'bff.rbac.read' },
      schema: { querystring: { type: 'object', required: ['permission'], properties: { permission: { type: 'string', minLength: 1, maxLength: 100 } } } },
    },
    async (req) => ({ ...meta(), ...(await bff.whoCanAccess(req.query.permission)) }),
  );

  app.put<{ Params: { role: string }; Body: { permissions: string[] } }>(
    `${P}/rbac/roles/:role/permissions`,
    {
      config: { permission: 'bff.rbac.edit' },
      schema: {
        body: {
          type: 'object',
          required: ['permissions'],
          additionalProperties: false,
          properties: { permissions: { type: 'array', maxItems: 500, items: { type: 'string', maxLength: 100 } } },
        },
      },
    },
    async (req) => {
      const u = currentUser(req);
      await bff.setRolePermissions(req.params.role, req.body.permissions);
      store.addAudit({
        type: 'operation',
        actor: u.employeeNo,
        action: 'bff.rbac.update',
        target: req.params.role,
        result: 'success',
        detail: `${req.body.permissions.length} 項權限`,
        ip: req.ip,
      });
      return { ...meta(), ok: true };
    },
  );
};

export default bffRoutes;
