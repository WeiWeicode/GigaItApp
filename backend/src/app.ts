/**
 * Fastify 應用程式(itapp-api):
 *   - /api/it/*:經 Gateway BFF 轉入(單一入口,giga-Portal PRD I1、G5),只驗證 X-Internal-Token(gateway/plugin.ts)
 *   - /it/api/*:過渡期保留的自有登入 API(Nginx 直通,auth/plugin.ts);前端已改用單一入口,測試區驗收後移除
 *   - 錯誤格式 { code, message, requestId, details? }
 *   - GET /healthz、/readyz 供 Docker 與 Nginx 檢查
 */
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import authPlugin, { API_PREFIX } from './auth/plugin.js';
import authRoutes from './auth/routes.js';
import { BffService } from './bff/service.js';
import type { Config } from './config.js';
import { AppError, errorBody } from './errors.js';
import gatewayPlugin from './gateway/plugin.js';
import auditRoutes from './routes/audit.js';
import bffRoutes from './routes/bff.js';
import dashboardRoutes from './routes/dashboard.js';
import itDashboardRoutes from './routes/it-dashboard.js';
import rbacRoutes from './routes/rbac.js';
import usersRoutes from './routes/users.js';
import { buildSeed, syncSeedUsers } from './store/seed.js';
import { Store } from './store/store.js';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: ['req.headers.cookie', 'req.headers["x-csrf-token"]', 'req.headers["x-internal-token"]', 'res.headers["set-cookie"]'],
    },
    // 沿用 Nginx 傳入的 X-Request-Id(格式不符時自行產生)
    requestIdHeader: false,
    genReqId: (req) => {
      const incoming = req.headers['x-request-id'];
      return typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID().replaceAll('-', '');
    },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  const { store, created } = await Store.open(config.dataDir, () => buildSeed(config.seedPassword, config.env));
  if (created) {
    app.log.info({ dataDir: config.dataDir }, '已建立種子資料');
  } else {
    const { added, removed } = await syncSeedUsers(store, config.seedPassword, config.env);
    if (removed.length) app.log.info({ removed }, '已移除示範帳號');
    if (added.length) app.log.info({ added }, '已補齊 IT 人員名單');
  }
  const bff = new BffService(config.bff, store, app.log);

  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.removeHeader('x-powered-by');
    reply.header('cache-control', 'no-store');
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof AppError) {
      if (err.status >= 500) req.log.error({ code: err.code, details: err.details }, err.message);
      return reply.status(err.status).send(errorBody(err.code, err.message, req.id, err.details));
    }
    const e = err as { validation?: { instancePath: string; message?: string }[]; statusCode?: number };
    if (e.validation)
      return reply.status(400).send(
        errorBody(
          'ITAPP_VALIDATION_FAILED',
          '參數驗證失敗',
          req.id,
          e.validation.map((v) => ({ field: v.instancePath.replace(/^\//, '') || '(body)', message: v.message ?? '' })),
        ),
      );
    if (e.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send(errorBody('ITAPP_VALIDATION_FAILED', '請求格式錯誤', req.id));
    req.log.error({ err }, '非預期錯誤');
    return reply.status(500).send(errorBody('ITAPP_INTERNAL_ERROR', '系統發生錯誤', req.id));
  });
  app.setNotFoundHandler((req, reply) => reply.status(404).send(errorBody('ITAPP_NOT_FOUND', '找不到此 API', req.id)));

  await app.register(gatewayPlugin, { config });
  await app.register(authPlugin, { config, store });

  const open = { config: { public: true }, logLevel: 'warn' as const };
  app.get('/healthz', open, async () => ({ status: 'ok' }));
  app.get('/readyz', open, async () => ({ status: 'ok', bffMode: bff.mode }));
  app.get(`${API_PREFIX}/healthz`, open, async () => ({ status: 'ok', env: config.env, bffMode: bff.mode }));

  await app.register(itDashboardRoutes);
  await app.register(authRoutes, { store });
  await app.register(dashboardRoutes, { store, bff });
  await app.register(bffRoutes, { store, bff });
  await app.register(usersRoutes, { store });
  await app.register(rbacRoutes, { store });
  await app.register(auditRoutes, { store });

  return app;
}
