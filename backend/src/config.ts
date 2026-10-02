/**
 * 設定(AGENT.md §4 部署區):部署區只有 dev / test / prod 三個值。
 * 機密一律以 <NAME>_FILE 指向 Docker secret;prod 只接受 _FILE,dev 可直接給值。
 * 缺少必要設定時啟動失敗,不要加預設值繞過檢查。
 */
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type ItEnv = 'dev' | 'test' | 'prod';
export type BffMode = 'mock' | 'live';

export interface Config {
  env: ItEnv;
  port: number;
  logLevel: string;
  dataDir: string;
  jwtSecret: Uint8Array;
  cookieSecure: boolean;
  sessionTtlSec: number;
  /** 首次啟動建立種子帳號用的密碼(資料檔已存在時不使用) */
  seedPassword: string | null;
  /** 經 Gateway BFF 轉入的 /api/it/*(giga-Portal PRD I1、G5):驗證 X-Internal-Token 用 */
  gateway: {
    /** 服務代碼 = Gateway 上游代碼 = 內部 Token 的 aud */
    serviceCode: string;
    /** BFF JWKS;未設定時 /api/it/* 一律回 401(無法驗證) */
    jwksUrl: string | null;
  };
  bff: {
    mode: BffMode;
    baseUrl: string | null;
    serviceUser: string | null;
    servicePassword: string | null;
    timeoutMs: number;
    cacheTtlSec: number;
  };
}

const ENVS: ItEnv[] = ['dev', 'test', 'prod'];

/** 讀取機密:<NAME>_FILE 優先;prod 不接受直接給值 */
export function readSecret(env: NodeJS.ProcessEnv, name: string, itEnv: ItEnv): string | null {
  const file = env[`${name}_FILE`];
  if (file) return readFileSync(file, 'utf8').trim();
  const value = env[name];
  if (value && itEnv === 'prod') throw new Error(`${name} 在 prod 只接受 ${name}_FILE(Docker secret)`);
  return value || null;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const itEnv = (env.IT_ENV ?? 'dev') as ItEnv;
  if (!ENVS.includes(itEnv)) throw new Error(`IT_ENV 只能是 dev / test / prod:${env.IT_ENV}`);

  const port = Number(env.PORT ?? 51291);
  if (!Number.isInteger(port) || port < 51200 || port > 51300) throw new Error(`PORT 必須在 51200–51300(BACKEND-GUIDE.md §3):${env.PORT}`);

  let secret = readSecret(env, 'ITAPP_JWT_SECRET', itEnv);
  if (!secret) {
    if (itEnv !== 'dev') throw new Error('缺少 ITAPP_JWT_SECRET_FILE');
    // dev 未設定時每次啟動隨機產生(重啟後需重新登入)
    secret = randomBytes(32).toString('base64url');
  }
  if (secret.length < 32) throw new Error('ITAPP_JWT_SECRET 至少 32 字元');

  const mode = (env.BFF_MODE ?? 'mock') as BffMode;
  if (mode !== 'mock' && mode !== 'live') throw new Error(`BFF_MODE 只能是 mock / live:${env.BFF_MODE}`);
  const baseUrl = env.BFF_BASE_URL?.replace(/\/+$/, '') || null;
  const serviceUser = env.BFF_SERVICE_USER || null;
  const servicePassword = readSecret(env, 'BFF_SERVICE_PASSWORD', itEnv);
  if (mode === 'live' && (!baseUrl || !serviceUser || !servicePassword))
    throw new Error('BFF_MODE=live 需要 BFF_BASE_URL、BFF_SERVICE_USER、BFF_SERVICE_PASSWORD(_FILE)');

  return {
    env: itEnv,
    port,
    logLevel: env.LOG_LEVEL ?? (itEnv === 'dev' ? 'debug' : 'info'),
    dataDir: resolve(env.DATA_DIR ?? 'data'),
    jwtSecret: new TextEncoder().encode(secret),
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : itEnv !== 'dev',
    sessionTtlSec: Number(env.SESSION_TTL_SEC ?? 8 * 3600),
    seedPassword: readSecret(env, 'ITAPP_SEED_PASSWORD', itEnv) ?? (itEnv === 'dev' ? 'Passw0rd!' : null),
    gateway: {
      serviceCode: env.SERVICE_CODE ?? 'itapp-api',
      jwksUrl: env.GW_JWKS_URL || null,
    },
    bff: {
      mode,
      baseUrl,
      serviceUser,
      servicePassword,
      timeoutMs: Number(env.BFF_TIMEOUT_MS ?? 8000),
      cacheTtlSec: Number(env.BFF_CACHE_TTL_SEC ?? 30),
    },
  };
}
