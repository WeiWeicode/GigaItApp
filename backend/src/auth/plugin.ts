/**
 * 自有登入(不共用 Gateway 單一入口,AGENT.md §4):
 *   - it_at:Session JWT(HS256,httpOnly,SameSite=Strict,Path=/it/api),預設 8 小時,剩餘不到一半時自動換發
 *   - it_csrf:Double-submit CSRF Token(非 httpOnly,Path=/it/);非 GET 請求須帶 X-CSRF-Token 標頭
 *   - JWT 只放 userId、tokenVersion、jti;權限每次由資料檔計算,調整後立即生效
 *   - 停用 / 重設密碼時遞增 tokenVersion,既有 Session 立即失效;登出以 jti 拒絕清單處理
 *
 * 路由以 config 宣告存取規則:
 *   { config: { public: true } }           不需登入
 *   { config: { permission: 'sys.user.read' } }  需登入且具備權限(按鈕權限一律在後端再檢查一次)
 */
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { jwtVerify, SignJWT } from 'jose';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import { effectivePermissions } from '../rbac/authz.js';
import type { Store, User } from '../store/store.js';

export const COOKIE_AT = 'it_at';
export const COOKIE_CSRF = 'it_csrf';
export const API_PREFIX = '/it/api';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

declare module 'fastify' {
  interface FastifyContextConfig {
    public?: boolean;
    permission?: string;
  }
  interface FastifyRequest {
    user: User | null;
    permissions: Set<string>;
    session: { jti: string; exp: number } | null;
  }
  interface FastifyInstance {
    sessions: SessionService;
  }
}

export class SessionService {
  /** 已登出的 jti → 到期時間(秒);單一實例用記憶體即可 */
  private readonly denied = new Map<string, number>();

  constructor(private readonly config: Config) {}

  private cookieBase() {
    return { secure: this.config.cookieSecure, sameSite: 'strict' as const };
  }

  async issue(reply: FastifyReply, user: User): Promise<void> {
    const token = await new SignJWT({ tv: user.tokenVersion })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(user.id))
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${this.config.sessionTtlSec}s`)
      .setIssuer('itapp')
      .sign(this.config.jwtSecret);
    reply
      .setCookie(COOKIE_AT, token, { ...this.cookieBase(), httpOnly: true, path: API_PREFIX, maxAge: this.config.sessionTtlSec })
      .setCookie(COOKIE_CSRF, randomBytes(24).toString('base64url'), {
        ...this.cookieBase(),
        httpOnly: false,
        path: '/it/',
        maxAge: this.config.sessionTtlSec,
      });
  }

  clear(reply: FastifyReply): void {
    reply.clearCookie(COOKIE_AT, { ...this.cookieBase(), path: API_PREFIX }).clearCookie(COOKIE_CSRF, { ...this.cookieBase(), path: '/it/' });
  }

  async verify(token: string): Promise<{ userId: number; tv: number; jti: string; iat: number; exp: number } | null> {
    try {
      const { payload } = await jwtVerify(token, this.config.jwtSecret, { issuer: 'itapp', algorithms: ['HS256'] });
      if (!payload.jti || this.denied.has(payload.jti)) return null;
      return { userId: Number(payload.sub), tv: Number(payload.tv), jti: payload.jti, iat: payload.iat!, exp: payload.exp! };
    } catch {
      return null;
    }
  }

  deny(jti: string, exp: number): void {
    const now = Date.now() / 1000;
    for (const [k, e] of this.denied) if (e < now) this.denied.delete(k);
    this.denied.set(jti, exp);
  }
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

async function authPlugin(app: FastifyInstance, { config, store }: { config: Config; store: Store }) {
  await app.register(cookie);
  const sessions = new SessionService(config);
  app.decorate('sessions', sessions);
  app.decorateRequest('user', null);
  app.decorateRequest('permissions', null as unknown as Set<string>);
  app.decorateRequest('session', null);

  async function authenticate(req: FastifyRequest, reply: FastifyReply) {
    const token = req.cookies[COOKIE_AT];
    const claims = token ? await sessions.verify(token) : null;
    const user = claims && store.data.users.find((u) => u.id === claims.userId);
    if (!claims || !user || user.tokenVersion !== claims.tv) throw new AppError('ITAPP_UNAUTHENTICATED');
    if (user.isDisabled) throw new AppError('ITAPP_ACCOUNT_DISABLED');
    if (!SAFE_METHODS.has(req.method)) {
      const header = req.headers['x-csrf-token'];
      const csrf = req.cookies[COOKIE_CSRF];
      if (typeof header !== 'string' || !csrf || !sameToken(header, csrf)) throw new AppError('ITAPP_CSRF_INVALID');
    }
    // 滑動換發:剩餘時間不到一半時換新 Token(登出請求不換)
    const now = Date.now() / 1000;
    if (claims.exp - now < (claims.exp - claims.iat) / 2 && !req.url.endsWith('/auth/logout')) await sessions.issue(reply, user);
    req.user = user;
    req.permissions = effectivePermissions(store.data, user);
    req.session = { jti: claims.jti, exp: claims.exp };
  }

  app.addHook('onRequest', async (req, reply) => {
    // 找不到路由交給 404;宣告 public 的路由不驗證
    if (!req.routeOptions.url || req.routeOptions.config.public) return;
    await authenticate(req, reply);
    const perm = req.routeOptions.config.permission;
    if (perm && !req.permissions.has(perm)) throw new AppError('ITAPP_PERMISSION_DENIED', undefined, { permission: perm });
  });
}

export default fp(authPlugin, { name: 'itapp-auth' });

/** 目前登入者(已通過 onRequest 驗證的路由才可呼叫) */
export function currentUser(req: FastifyRequest): User {
  if (!req.user) throw new AppError('ITAPP_UNAUTHENTICATED');
  return req.user;
}
