/**
 * 稽核紀錄(sys.audit.read):
 *   GET /it/api/audit?type=operation|login&q=&page=&pageSize=   由新到舊;page 從 1 開始、pageSize 上限 100
 */
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX } from '../auth/plugin.js';
import type { Store } from '../store/store.js';

const auditRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  app.get<{ Querystring: { type?: 'operation' | 'login'; q?: string; page: number; pageSize: number } }>(
    `${API_PREFIX}/audit`,
    {
      config: { permission: 'sys.audit.read' },
      schema: {
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['operation', 'login'] },
            q: { type: 'string', maxLength: 100 },
            page: { type: 'integer', minimum: 1, default: 1 },
            pageSize: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (req) => {
      const { type, page, pageSize } = req.query;
      const q = req.query.q?.trim().toLowerCase();
      const rows = store.data.audit.filter(
        (a) => (!type || a.type === type) && (!q || [a.actor, a.action, a.target, a.detail].some((v) => v?.toLowerCase().includes(q))),
      );
      return { items: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length, page, pageSize };
    },
  );
};

export default auditRoutes;
