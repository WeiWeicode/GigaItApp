/**
 * itapp-api 基本行為:登入、CSRF、職級 × 部門按鈕權限、資料範圍、Session 失效、BFF(mock)。
 * 每個測試使用獨立的暫存資料目錄與種子資料(密碼 Passw0rd!,虛構帳號)。
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const PASSWORD = 'Passw0rd!';
let app: FastifyInstance;
let dir: string;

interface Session {
  cookie: string;
  csrf: string;
}

async function login(username: string, password = PASSWORD): Promise<Session> {
  const res = await app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username, password } });
  assert.equal(res.statusCode, 200, res.body);
  const cookies = res.cookies as { name: string; value: string }[];
  return { cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; '), csrf: cookies.find((c) => c.name === 'it_csrf')!.value };
}

function call(s: Session, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object, csrf = true) {
  return app.inject({ method, url, payload, headers: { cookie: s.cookie, ...(csrf && method !== 'GET' ? { 'x-csrf-token': s.csrf } : {}) } });
}

before(async () => {
  dir = await mkdtemp(join(tmpdir(), 'itapp-test-'));
  app = await buildApp(loadConfig({ IT_ENV: 'dev', DATA_DIR: dir, LOG_LEVEL: 'silent', BFF_MODE: 'mock' }));
});

after(async () => {
  await app.close();
  await rm(dir, { recursive: true, force: true });
});

describe('登入', () => {
  it('密碼錯誤回 401 ITAPP_LOGIN_FAILED', async () => {
    const res = await app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100001', password: 'wrong' } });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'ITAPP_LOGIN_FAILED');
    assert.ok(res.json().requestId);
  });

  it('停用帳號不可登入', async () => {
    const res = await app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100041', password: PASSWORD } });
    assert.equal(res.json().code, 'ITAPP_ACCOUNT_DISABLED');
  });

  it('未登入呼叫 API 回 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/it/api/auth/me' });
    assert.equal(res.statusCode, 401);
    assert.equal(res.json().code, 'ITAPP_UNAUTHENTICATED');
  });

  it('登入後 me 回傳職級、部門、權限與兩層選單;Cookie 為 httpOnly', async () => {
    const res = await app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 's100001', password: PASSWORD } });
    const at = (res.cookies as { name: string; httpOnly?: boolean; path?: string }[]).find((c) => c.name === 'it_at')!;
    assert.equal(at.httpOnly, true);
    assert.equal(at.path, '/it/api');
    const me = res.json();
    assert.equal(me.level.code, 'manager');
    assert.equal(me.department.code, 'SYS');
    assert.ok(me.permissions.includes('sys.user.create'));
    assert.ok(me.menus.every((g: { children: unknown[] }) => g.children.length > 0));
  });
});

describe('CSRF 與按鈕權限', () => {
  it('非 GET 未帶 X-CSRF-Token 回 403 ITAPP_CSRF_INVALID', async () => {
    const s = await login('S100001');
    const res = await call(s, 'POST', '/it/api/bff/releases', { note: 'x' }, false);
    assert.equal(res.json().code, 'ITAPP_CSRF_INVALID');
  });

  it('一般工程師不能新增人員(後端檢查,不只是前端隱藏按鈕)', async () => {
    const s = await login('S100032');
    const res = await call(s, 'POST', '/it/api/users', { employeeNo: 'T0001', name: '測試', deptCode: 'DEV', level: 'engineer' });
    assert.equal(res.statusCode, 403);
    assert.equal(res.json().code, 'ITAPP_PERMISSION_DENIED');
  });

  it('部門限制:資安課高級工程師沒有發佈權限,程式開發課高級工程師有', async () => {
    const sec = await login('S100040');
    assert.ok(!(await call(sec, 'GET', '/it/api/auth/me')).json().permissions.includes('bff.route.publish'));
    assert.equal((await call(sec, 'POST', '/it/api/bff/releases', { note: 'x' })).statusCode, 403);

    const dev = await login('S100031');
    const res = await call(dev, 'POST', '/it/api/bff/releases', { note: '測試發佈' });
    assert.equal(res.statusCode, 200, res.body);
    assert.equal(res.json().source, 'mock');
  });

  it('資料範圍:主管只看得到自己部門;系統管理員看全部', async () => {
    const mgr = await login('S100010');
    const items = (await call(mgr, 'GET', '/it/api/users')).json().items as { deptCode: string }[];
    assert.ok(items.length > 0 && items.every((u) => u.deptCode === 'NET'));
    const admin = await login('itadmin');
    assert.equal((await call(admin, 'GET', '/it/api/users')).json().scope, 'all');
  });

  it('主管不能管理其他部門或同級人員', async () => {
    const mgr = await login('S100010');
    // S100031 在 DEV
    assert.equal((await call(mgr, 'PATCH', '/it/api/users/9', { title: 'x' })).json().code, 'ITAPP_DATA_ACCESS_DENIED');
    // 不能把部屬升成主管
    assert.equal((await call(mgr, 'PATCH', '/it/api/users/6', { level: 'manager' })).json().code, 'ITAPP_DATA_ACCESS_DENIED');
  });
});

describe('Session 失效與權限調整', () => {
  it('停用後既有 Session 立即失效', async () => {
    const victim = await login('S100033');
    const admin = await login('itadmin');
    const target = (await call(admin, 'GET', '/it/api/users')).json().items.find((u: { employeeNo: string }) => u.employeeNo === 'S100033');
    assert.equal((await call(admin, 'POST', `/it/api/users/${target.id}/disable`)).statusCode, 200);
    assert.equal((await call(victim, 'GET', '/it/api/auth/me')).statusCode, 401);
    await call(admin, 'POST', `/it/api/users/${target.id}/enable`);
  });

  it('調整職級權限後立即生效;系統管理員權限不可調整', async () => {
    const admin = await login('itadmin');
    const eng = await login('S100021');
    assert.equal((await call(eng, 'GET', '/it/api/audit')).statusCode, 403);
    const catalog = (await call(admin, 'GET', '/it/api/rbac/catalog')).json();
    const perms = [...catalog.levelPermissions.engineer, 'sys.audit.read'];
    assert.equal((await call(admin, 'PUT', '/it/api/rbac/levels/engineer/permissions', { permissions: perms })).statusCode, 200);
    assert.equal((await call(eng, 'GET', '/it/api/audit')).statusCode, 200);
    assert.equal((await call(admin, 'PUT', '/it/api/rbac/levels/admin/permissions', { permissions: [] })).statusCode, 400);
  });

  it('登出後 Token 不可再使用', async () => {
    const s = await login('S100020');
    assert.equal((await call(s, 'POST', '/it/api/auth/logout')).statusCode, 204);
    assert.equal((await call(s, 'GET', '/it/api/auth/me')).statusCode, 401);
  });
});

describe('BFF(mock)', () => {
  it('權限矩陣與反查', async () => {
    const s = await login('S100001');
    const rbac = (await call(s, 'GET', '/it/api/bff/rbac')).json();
    assert.ok(rbac.roles.length > 0 && rbac.permissions.length > 0 && rbac.rolePermissions.length > 0);
    const who = (await call(s, 'GET', '/it/api/bff/rbac/who-can-access?permission=gw.admin.route.read')).json();
    assert.equal(who.exists, true);
    assert.ok(who.roles.some((r: { code: string }) => r.code === 'gw-it-admin'));
  });

  it('設定 BFF 角色權限(mock 模式寫入資料檔)', async () => {
    const s = await login('S100001');
    const res = await call(s, 'PUT', '/it/api/bff/rbac/roles/mes-operator/permissions', { permissions: ['mes.workorder.read'] });
    assert.equal(res.statusCode, 200, res.body);
    const rbac = (await call(s, 'GET', '/it/api/bff/rbac?refresh=1')).json();
    assert.deepEqual(
      rbac.rolePermissions.filter((x: { role: string }) => x.role === 'mes-operator').map((x: { permission: string }) => x.permission),
      ['mes.workorder.read'],
    );
    assert.equal((await call(s, 'PUT', '/it/api/bff/rbac/roles/mes-operator/permissions', { permissions: ['nope.x.y'] })).statusCode, 400);
  });

  it('儀表板標示模擬區塊並包含 Gateway 真實統計', async () => {
    const s = await login('S100032');
    const d = (await call(s, 'GET', '/it/api/dashboard/overview')).json();
    assert.ok(d.mockSections.includes('kpis'));
    assert.equal(d.kpis.length, 5);
    const g = (await call(s, 'GET', '/it/api/dashboard/gateway')).json();
    assert.equal(typeof g.gateway.routes, 'number');
  });
});
