/**
 * 經 Gateway BFF 轉入的 API(/api/it/*,giga-Portal PRD I1、G5;Gateway BACKEND-GUIDE §4.2):
 *   - 身分只取 X-Internal-Token(ES256、iss = giganexus-bff、aud = 服務代碼 itapp-api、exp,容許 30 秒誤差),公鑰取自 BFF JWKS
 *   - 權限由 BFF 依路由表檢查後才轉入(路由 it.dashboard.*,權限 it.dashboard.read);本服務不再檢查自有 Session / CSRF
 *   - 路由以 { config: { gateway: true } } 宣告;自有登入(auth/plugin.ts)略過這些路由
 * 驗證使用 @giganexus/backend-sdk 的 createTokenVerifier(公司 GitLab npm Registry,Gateway BACKEND-GUIDE §11.6)。
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { createTokenVerifier, INTERNAL_TOKEN_HEADER, type GatewayIdentity } from '@giganexus/backend-sdk';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';

export const GATEWAY_PREFIX = '/api/it';
export { INTERNAL_TOKEN_HEADER };
export type { GatewayIdentity };

declare module 'fastify' {
  interface FastifyContextConfig {
    /** true:經 Gateway BFF 轉入,只驗證 X-Internal-Token */
    gateway?: boolean;
  }
  interface FastifyRequest {
    identity: GatewayIdentity | null;
  }
}

async function gatewayPlugin(app: FastifyInstance, { config }: { config: Config }) {
  const { jwksUrl, serviceCode } = config.gateway;
  const verify = jwksUrl ? createTokenVerifier({ jwksUrl, audience: serviceCode }) : null;
  app.decorateRequest('identity', null);

  app.addHook('onRequest', async (req) => {
    if (!req.routeOptions.url || !req.routeOptions.config.gateway) return;
    const token = req.headers[INTERNAL_TOKEN_HEADER];
    if (typeof token !== 'string' || !token) throw new AppError('ITAPP_INTERNAL_TOKEN_INVALID', '缺少內部 Token(本 API 只接受經 Gateway 轉入的請求)');
    if (!verify) {
      req.log.error('未設定 GW_JWKS_URL,無法驗證內部 Token');
      throw new AppError('ITAPP_INTERNAL_TOKEN_INVALID');
    }
    try {
      req.identity = await verify(token);
    } catch (err) {
      // 只有 Token 驗證失敗才回 401;Gateway 收到會視為設定錯誤並告警(BACKEND-GUIDE §5.3)
      req.log.warn({ err: (err as Error).message }, '內部 Token 驗證失敗');
      throw new AppError('ITAPP_INTERNAL_TOKEN_INVALID');
    }
  });
}

export default fp(gatewayPlugin, { name: 'itapp-gateway' });

/** 目前經 Gateway 轉入的使用者(已通過 onRequest 驗證的路由才可呼叫) */
export function currentIdentity(req: FastifyRequest): GatewayIdentity {
  if (!req.identity) throw new AppError('ITAPP_INTERNAL_TOKEN_INVALID');
  return req.identity;
}
