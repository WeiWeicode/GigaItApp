/**
 * 登入 API(自有帳號,不經 Gateway 單一入口):
 *   POST /it/api/auth/login      工號 + 密碼;連續失敗 5 次鎖定 15 分鐘
 *   POST /it/api/auth/logout
 *   GET  /it/api/auth/me         使用者、部門、職級、有效權限、可見選單
 *   POST /it/api/auth/password   變更自己的密碼
 */
import type { FastifyPluginAsync } from 'fastify';
import { AppError } from '../errors.js';
import { buildMe } from '../rbac/authz.js';
import type { Store } from '../store/store.js';
import { hashPassword, verifyPassword, checkPasswordPolicy } from './password.js';
import { API_PREFIX, currentUser } from './plugin.js';

const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60 * 1000;

const loginBody = {
  type: 'object',
  required: ['username', 'password'],
  additionalProperties: false,
  properties: { username: { type: 'string', minLength: 1, maxLength: 64 }, password: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

const passwordBody = {
  type: 'object',
  required: ['currentPassword', 'newPassword'],
  additionalProperties: false,
  properties: { currentPassword: { type: 'string', maxLength: 256 }, newPassword: { type: 'string', minLength: 1, maxLength: 256 } },
} as const;

const authRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  /** 工號(小寫)→ 失敗次數與鎖定到期 */
  const failures = new Map<string, { count: number; lockedUntil: number }>();

  app.post<{ Body: { username: string; password: string } }>(
    `${API_PREFIX}/auth/login`,
    { config: { public: true }, schema: { body: loginBody } },
    async (req, reply) => {
      const key = req.body.username.trim().toLowerCase();
      const f = failures.get(key);
      if (f && f.lockedUntil > Date.now()) throw new AppError('ITAPP_ACCOUNT_LOCKED');

      const user = store.data.users.find((u) => u.employeeNo.toLowerCase() === key);
      // 帳號不存在也做一次雜湊比對,避免以回應時間猜測帳號
      const ok = await verifyPassword(user?.passwordHash ?? store.data.users[0]!.passwordHash, req.body.password);
      if (!user || !ok) {
        const count = (f?.count ?? 0) + 1;
        failures.set(key, { count, lockedUntil: count >= MAX_FAILURES ? Date.now() + LOCK_MS : 0 });
        store.addAudit({ type: 'login', actor: key, action: 'login', target: null, result: 'failure', detail: user ? '密碼錯誤' : '帳號不存在', ip: req.ip });
        throw new AppError('ITAPP_LOGIN_FAILED');
      }
      if (user.isDisabled) {
        store.addAudit({ type: 'login', actor: user.employeeNo, action: 'login', target: null, result: 'failure', detail: '帳號已停用', ip: req.ip });
        throw new AppError('ITAPP_ACCOUNT_DISABLED');
      }
      failures.delete(key);
      await store.mutate(() => (user.lastLoginAt = new Date().toISOString()));
      store.addAudit({ type: 'login', actor: user.employeeNo, action: 'login', target: null, result: 'success', detail: null, ip: req.ip });
      await app.sessions.issue(reply, user);
      return buildMe(store.data, user);
    },
  );

  app.post(`${API_PREFIX}/auth/logout`, { config: { public: true } }, async (req, reply) => {
    // 已過期或無效的 Session 也允許登出(清除 Cookie)
    const token = req.cookies.it_at;
    const claims = token ? await app.sessions.verify(token) : null;
    if (claims) {
      app.sessions.deny(claims.jti, claims.exp);
      const user = store.data.users.find((u) => u.id === claims.userId);
      if (user) store.addAudit({ type: 'login', actor: user.employeeNo, action: 'logout', target: null, result: 'success', detail: null, ip: req.ip });
    }
    app.sessions.clear(reply);
    return reply.code(204).send();
  });

  app.get(`${API_PREFIX}/auth/me`, async (req) => buildMe(store.data, currentUser(req)));

  app.post<{ Body: { currentPassword: string; newPassword: string } }>(
    `${API_PREFIX}/auth/password`,
    { schema: { body: passwordBody } },
    async (req, reply) => {
      const user = currentUser(req);
      if (!(await verifyPassword(user.passwordHash, req.body.currentPassword))) throw new AppError('ITAPP_VALIDATION_FAILED', '目前密碼不正確');
      const policy = checkPasswordPolicy(req.body.newPassword);
      if (policy) throw new AppError('ITAPP_VALIDATION_FAILED', policy);
      const hash = await hashPassword(req.body.newPassword);
      await store.mutate(() => {
        user.passwordHash = hash;
        user.tokenVersion += 1;
        user.updatedAt = new Date().toISOString();
      });
      store.addAudit({
        type: 'operation',
        actor: user.employeeNo,
        action: 'password.change',
        target: user.employeeNo,
        result: 'success',
        detail: null,
        ip: req.ip,
      });
      // tokenVersion 已變更,換發新 Session 讓目前頁面維持登入
      await app.sessions.issue(reply, user);
      return { ok: true };
    },
  );
};

export default authRoutes;
