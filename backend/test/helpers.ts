/** 測試共用:建立獨立資料目錄的 itapp-api,並提供登入與帶 Cookie / CSRF 的呼叫 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

export const PASSWORD = 'Passw0rd!';

export interface Session {
  cookie: string;
  csrf: string;
}

export async function createTestApp(env: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'itapp-test-'));
  const app: FastifyInstance = await buildApp(loadConfig({ IT_ENV: 'dev', DATA_DIR: dir, LOG_LEVEL: 'silent', BFF_MODE: 'mock', ...env }));

  const sessionOf = (res: { cookies: unknown }): Session => {
    const cookies = res.cookies as { name: string; value: string }[];
    return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '), csrf: cookies.find((c) => c.name === 'it_csrf')?.value ?? '' };
  };

  async function login(username: string, password = PASSWORD): Promise<Session> {
    const res = await app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username, password } });
    assert.equal(res.statusCode, 200, res.body);
    return sessionOf(res);
  }

  function call(s: Session, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) {
    return app.inject({ method, url, payload, headers: { cookie: s.cookie, ...(method !== 'GET' ? { 'x-csrf-token': s.csrf } : {}) } });
  }

  async function close() {
    await app.close();
    await rm(dir, { recursive: true, force: true });
  }

  return { app, login, call, sessionOf, close };
}
