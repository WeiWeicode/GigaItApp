/**
 * docs/Gherkin/auth/gateway-sso.feature 的 @auto 場景:經 Gateway BFF 轉入的 /api/it/* 只信任 X-Internal-Token。
 * 測試自建 ES256 金鑰與本機 JWKS 伺服器(模擬 BFF /.well-known/jwks.json)。
 */
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { createTestApp } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
let jwksServer: Server;
let key: CryptoKey;
let otherKey: CryptoKey;

before(async () => {
  const pair = await generateKeyPair('ES256');
  key = pair.privateKey;
  otherKey = (await generateKeyPair('ES256')).privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-1', alg: 'ES256', use: 'sig' };
  jwksServer = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((r) => jwksServer.listen(0, '127.0.0.1', r));
  const { port } = jwksServer.address() as AddressInfo;
  t = await createTestApp({ GW_JWKS_URL: `http://127.0.0.1:${port}/.well-known/jwks.json` });
});
after(async () => {
  await t.close();
  jwksServer.close();
});

function sign(opts: { aud?: string; iss?: string; exp?: string | number; with?: CryptoKey } = {}) {
  return new SignJWT({ emp: 'S112009', name: '測試', roles: ['it-admin'] })
    .setProtectedHeader({ alg: 'ES256', kid: 'test-1' })
    .setSubject('1')
    .setIssuer(opts.iss ?? 'giganexus-bff')
    .setAudience(opts.aud ?? 'itapp-api')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '60s')
    .sign(opts.with ?? key);
}
const get = (url: string, token?: string) => t.app.inject({ method: 'GET', url, headers: token ? { 'x-internal-token': token } : {} });

describe('auth/gateway-sso.feature', () => {
  it('未帶內部 Token 直接呼叫', async () => {
    const r = await get('/api/it/dashboard/overview');
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().code, 'ITAPP_INTERNAL_TOKEN_INVALID');
  });

  it('帶 BFF 簽發的內部 Token', async () => {
    const r = await get('/api/it/dashboard/overview', await sign());
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().kpis, []);
    const w = await get('/api/it/dashboard/work', await sign());
    assert.equal(w.statusCode, 200);
    assert.deepEqual(w.json().tickets, []);
  });

  it('內部 Token 不符時拒絕', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (const token of [await sign({ aud: 'go-mes' }), await sign({ iss: 'someone-else' }), await sign({ with: otherKey }), await sign({ exp: now - 120 })]) {
      const r = await get('/api/it/dashboard/work', token);
      assert.equal(r.statusCode, 401);
      assert.equal(r.json().code, 'ITAPP_INTERNAL_TOKEN_INVALID');
    }
  });

  it('內部 Token 不能拿來呼叫過渡期的自有登入 API', async () => {
    const r = await get('/it/api/auth/me', await sign());
    assert.equal(r.statusCode, 401);
    assert.equal(r.json().code, 'ITAPP_UNAUTHENTICATED');
  });
});

describe('未設定 GW_JWKS_URL', () => {
  it('/api/it/* 一律 401,不放行', async () => {
    const t2 = await createTestApp();
    try {
      const r = await t2.app.inject({ method: 'GET', url: '/api/it/dashboard/overview', headers: { 'x-internal-token': await sign() } });
      assert.equal(r.statusCode, 401);
      assert.equal(r.json().code, 'ITAPP_INTERNAL_TOKEN_INVALID');
    } finally {
      await t2.close();
    }
  });
});
