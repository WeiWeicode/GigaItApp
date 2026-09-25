/**
 * docs/Gherkin 場景的自動化驗證(標記 @auto 的場景)。測試名稱以「feature 檔 / 場景名稱」命名,方便對照。
 * app.test.ts 為第一版的基本行為測試;兩者皆使用獨立的暫存資料目錄。
 */
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createTestApp, PASSWORD } from './helpers.js';

let t: Awaited<ReturnType<typeof createTestApp>>;
before(async () => (t = await createTestApp()));
after(async () => t.close());

const userId = async (emp: string) => {
  const admin = await t.login('itadmin');
  return ((await t.call(admin, 'GET', '/it/api/users')).json().items as { id: number; employeeNo: string }[]).find((u) => u.employeeNo === emp)!.id;
};

describe('auth/login.feature', () => {
  it('連續 5 次密碼錯誤後鎖定 15 分鐘', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100030', password: 'wrong' } });
      assert.equal(r.json().code, 'ITAPP_LOGIN_FAILED');
    }
    const r = await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100030', password: PASSWORD } });
    assert.equal(r.statusCode, 423);
    assert.equal(r.json().code, 'ITAPP_ACCOUNT_LOCKED');
  });

  it('工號不分大小寫', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'ITADMIN', password: PASSWORD } });
    assert.equal(r.statusCode, 200);
  });

  it('缺少必要欄位回 400 ITAPP_VALIDATION_FAILED', async () => {
    const r = await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'itadmin' } });
    assert.equal(r.statusCode, 400);
    assert.equal(r.json().code, 'ITAPP_VALIDATION_FAILED');
  });

  it('登入成功與失敗都寫入登入紀錄', async () => {
    await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100020', password: 'nope' } });
    const admin = await t.login('itadmin');
    const items = (await t.call(admin, 'GET', '/it/api/audit?type=login&q=S100020')).json().items as { result: string }[];
    assert.ok(items.some((a) => a.result === 'failure'));
  });
});

describe('auth/session.feature', () => {
  it('變更密碼:目前密碼錯誤或不符政策時拒絕;成功後其他 Session 失效、目前頁面維持登入', async () => {
    const other = await t.login('S100011');
    const s = await t.login('S100011');
    assert.equal((await t.call(s, 'POST', '/it/api/auth/password', { currentPassword: 'x', newPassword: 'abc12345' })).statusCode, 400);
    assert.equal((await t.call(s, 'POST', '/it/api/auth/password', { currentPassword: PASSWORD, newPassword: 'abcdefgh' })).statusCode, 400);
    const ok = await t.call(s, 'POST', '/it/api/auth/password', { currentPassword: PASSWORD, newPassword: 'NewPass123' });
    assert.equal(ok.statusCode, 200);
    assert.equal((await t.call(other, 'GET', '/it/api/auth/me')).statusCode, 401);
    assert.equal((await t.call(t.sessionOf(ok), 'GET', '/it/api/auth/me')).statusCode, 200);
    await t.login('S100011', 'NewPass123');
  });

  it('找不到的 API 回 404 ITAPP_NOT_FOUND', async () => {
    const r = await t.app.inject({ method: 'GET', url: '/it/api/nope' });
    assert.equal(r.json().code, 'ITAPP_NOT_FOUND');
  });
});

describe('rbac/effective-permission.feature', () => {
  it('系統管理員固定擁有全部 17 項權限', async () => {
    const s = await t.login('itadmin');
    const me = (await t.call(s, 'GET', '/it/api/auth/me')).json();
    assert.equal(me.permissions.length, 17);
    assert.equal(me.dataScope, 'all');
  });

  it('按鈕權限不足時 details 指出所需權限', async () => {
    const s = await t.login('S100032');
    const r = await t.call(s, 'POST', '/it/api/users', { employeeNo: 'T9', name: 'x', deptCode: 'DEV', level: 'engineer' });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().details.permission, 'sys.user.create');
  });

  it('選單只回傳有權限的項目,且不回傳空群組', async () => {
    const s = await t.login('S100012');
    const me = (await t.call(s, 'GET', '/it/api/auth/me')).json();
    const keys = me.menus.flatMap((g: { children: { key: string }[] }) => g.children.map((c) => c.key));
    assert.ok(keys.includes('sys-users'));
    assert.ok(!keys.includes('sys-perms') && !keys.includes('sys-audit'));
    assert.equal(me.dataScope, 'dept');
  });

  it('權限試算:同職級不同部門的結果不同', async () => {
    const s = await t.login('S100001');
    const sec = (await t.call(s, 'GET', '/it/api/rbac/preview?level=senior&dept=SEC')).json().permissions as string[];
    const dev = (await t.call(s, 'GET', '/it/api/rbac/preview?level=senior&dept=DEV')).json().permissions as string[];
    assert.ok(!sec.includes('bff.route.publish'));
    assert.ok(dev.includes('bff.route.publish'));
  });
});

describe('rbac/permission-settings.feature', () => {
  it('主管可檢視但不能調整權限設定', async () => {
    const s = await t.login('S100001');
    assert.equal((await t.call(s, 'GET', '/it/api/rbac/catalog')).statusCode, 200);
    assert.equal((await t.call(s, 'PUT', '/it/api/rbac/levels/engineer/permissions', { permissions: [] })).json().code, 'ITAPP_PERMISSION_DENIED');
  });

  it('不存在的權限代碼回 400 並列出', async () => {
    const admin = await t.login('itadmin');
    const r = await t.call(admin, 'PUT', '/it/api/rbac/levels/engineer/permissions', { permissions: ['x.y.z'] });
    assert.equal(r.statusCode, 400);
    assert.deepEqual(r.json().details.unknown, ['x.y.z']);
  });

  it('設定部門限制後立即生效;清空即不限部門', async () => {
    const admin = await t.login('itadmin');
    const dev = await t.login('S100031');
    const has = async () => ((await t.call(dev, 'GET', '/it/api/auth/me')).json().permissions as string[]).includes('bff.route.export');
    assert.equal(await has(), true);
    assert.equal((await t.call(admin, 'PUT', '/it/api/rbac/permissions/bff.route.export/departments', { departments: ['NET'] })).statusCode, 200);
    assert.equal(await has(), false);
    await t.call(admin, 'PUT', '/it/api/rbac/permissions/bff.route.export/departments', { departments: [] });
    assert.equal(await has(), true);
    assert.equal((await t.call(admin, 'PUT', '/it/api/rbac/permissions/bff.route.export/departments', { departments: ['XXX'] })).statusCode, 400);
  });
});

describe('system/users.feature', () => {
  it('人員清單由後端篩選與分頁', async () => {
    const admin = await t.login('itadmin');
    const r = (await t.call(admin, 'GET', '/it/api/users?pageSize=2')).json();
    assert.equal(r.items.length, 2);
    assert.ok(r.total >= 13);
    const dev = (await t.call(admin, 'GET', '/it/api/users?dept=DEV&level=engineer')).json();
    assert.ok(dev.total > 0 && dev.items.every((u: { deptCode: string; level: string }) => u.deptCode === 'DEV' && u.level === 'engineer'));
    assert.equal((await t.call(admin, 'GET', '/it/api/users?q=劉建宏')).json().total, 1);
    // 主管指定其他部門也只會得到自己部門的資料
    const mgr = await t.login('S100010');
    assert.equal((await t.call(mgr, 'GET', '/it/api/users?dept=DEV')).json().total, 0);
  });

  it('新增人員回傳一次性臨時密碼,可用來登入;工號重複回 409', async () => {
    const mgr = await t.login('S100010');
    const r = await t.call(mgr, 'POST', '/it/api/users', { employeeNo: 'T100001', name: '測試網管', deptCode: 'NET', level: 'engineer' });
    assert.equal(r.statusCode, 201, r.body);
    const temp = r.json().tempPassword as string;
    assert.equal(temp.length, 12);
    await t.login('T100001', temp);
    assert.equal((await t.call(mgr, 'POST', '/it/api/users', { employeeNo: 't100001', name: 'x', deptCode: 'NET', level: 'engineer' })).statusCode, 409);
  });

  it('主管不能在其他部門新增人員,也不能指派同級職級', async () => {
    const mgr = await t.login('S100010');
    const other = await t.call(mgr, 'POST', '/it/api/users', { employeeNo: 'T100002', name: 'x', deptCode: 'DEV', level: 'engineer' });
    assert.equal(other.json().code, 'ITAPP_DATA_ACCESS_DENIED');
    const same = await t.call(mgr, 'POST', '/it/api/users', { employeeNo: 'T100003', name: 'x', deptCode: 'NET', level: 'manager' });
    assert.equal(same.json().code, 'ITAPP_DATA_ACCESS_DENIED');
  });

  it('重設密碼後舊密碼失效、臨時密碼可登入', async () => {
    const mgr = await t.login('S100010');
    const id = await userId('S100012');
    const r = await t.call(mgr, 'POST', `/it/api/users/${id}/reset-password`);
    assert.equal(r.statusCode, 200);
    const bad = await t.app.inject({ method: 'POST', url: '/it/api/auth/login', payload: { username: 'S100012', password: PASSWORD } });
    assert.equal(bad.statusCode, 401);
    await t.login('S100012', r.json().tempPassword);
  });

  it('不能停用自己', async () => {
    const admin = await t.login('itadmin');
    const id = await userId('itadmin');
    assert.equal((await t.call(admin, 'POST', `/it/api/users/${id}/disable`)).statusCode, 400);
  });
});

describe('system/departments.feature', () => {
  it('主管預設沒有編輯部門權限', async () => {
    const mgr = await t.login('S100001');
    assert.equal((await t.call(mgr, 'POST', '/it/api/departments', { code: 'OPS', name: '維運課' })).statusCode, 403);
  });

  it('新增部門:代碼格式錯誤 400、重複 409、主管工號須存在', async () => {
    const admin = await t.login('itadmin');
    assert.equal((await t.call(admin, 'POST', '/it/api/departments', { code: 'ops', name: '維運課' })).statusCode, 400);
    assert.equal((await t.call(admin, 'POST', '/it/api/departments', { code: 'OPS', name: '維運課', leadEmployeeNo: 'NOPE' })).statusCode, 400);
    assert.equal((await t.call(admin, 'POST', '/it/api/departments', { code: 'OPS', name: '維運課' })).statusCode, 201);
    assert.equal((await t.call(admin, 'POST', '/it/api/departments', { code: 'OPS', name: '維運課' })).statusCode, 409);
    const d = (await t.call(admin, 'GET', '/it/api/departments')).json().items.find((x: { code: string }) => x.code === 'OPS');
    assert.equal(d.memberCount, 0);
  });
});

describe('system/audit.feature', () => {
  it('寫入操作記錄操作人員、動作與對象;可分頁', async () => {
    const admin = await t.login('itadmin');
    const r = (await t.call(admin, 'GET', '/it/api/audit?type=operation&q=dept.create&pageSize=1')).json();
    assert.equal(r.pageSize, 1);
    assert.equal(r.items[0].actor, 'itadmin');
    assert.equal(r.items[0].target, 'OPS');
  });
});

describe('bff/bff-read.feature', () => {
  it('查詢不存在的權限回 exists=false', async () => {
    const s = await t.login('S100001');
    const r = (await t.call(s, 'GET', '/it/api/bff/rbac/who-can-access?permission=nope.x.y')).json();
    assert.equal(r.exists, false);
    assert.equal(r.source, 'mock');
  });

  it('BFF 無法連線:API 回 502,儀表板其他區塊照常', async () => {
    const live = await createTestApp({
      BFF_MODE: 'live',
      BFF_BASE_URL: 'http://127.0.0.1:9',
      BFF_SERVICE_USER: 'svc',
      BFF_SERVICE_PASSWORD: 'x',
      BFF_TIMEOUT_MS: '1000',
    });
    try {
      const s = await live.login('S100001');
      const r = await live.call(s, 'GET', '/it/api/bff/overview');
      assert.equal(r.statusCode, 502);
      assert.equal(r.json().code, 'ITAPP_BFF_UNAVAILABLE');
      assert.equal((await live.call(s, 'GET', '/it/api/dashboard/gateway')).statusCode, 502);
      // 其他區塊不呼叫 BFF,照常回應
      assert.equal((await live.call(s, 'GET', '/it/api/dashboard/overview')).json().kpis.length, 5);
      assert.equal((await live.call(s, 'GET', '/it/api/dashboard/team')).statusCode, 200);
      assert.equal((await live.call(s, 'GET', '/it/api/dashboard/work')).statusCode, 200);
    } finally {
      await live.close();
    }
  });

  it('路由清單由後端篩選與分頁,並回傳篩選選項', async () => {
    const s = await t.login('S100001');
    const page1 = (await t.call(s, 'GET', '/it/api/bff/routes?pageSize=5')).json();
    assert.equal(page1.items.length, 5);
    assert.equal(page1.total, 26);
    assert.equal(page1.facets.totalAll, 26);
    assert.ok(page1.facets.systems.includes('mes') && page1.facets.upstreams.includes('go-mes'));
    const page6 = (await t.call(s, 'GET', '/it/api/bff/routes?pageSize=5&page=6')).json();
    assert.equal(page6.items.length, 1);
    const dms = (await t.call(s, 'GET', '/it/api/bff/routes?system=dms&authMode=permission')).json();
    assert.ok(dms.total > 0 && dms.items.every((r: { systemCode: string; authMode: string }) => r.systemCode === 'dms' && r.authMode === 'permission'));
    const byPerm = (await t.call(s, 'GET', '/it/api/bff/routes?permission=mes.workorder.read')).json();
    assert.ok(byPerm.items.every((r: { permissionCode: string }) => r.permissionCode === 'mes.workorder.read'));
    assert.equal((await t.call(s, 'GET', '/it/api/bff/routes?q=work-orders')).json().total, 3);
    assert.equal((await t.call(s, 'GET', '/it/api/bff/routes?pageSize=501')).statusCode, 400);
  });

  it('發佈版本分頁(由新到舊)', async () => {
    const s = await t.login('S100001');
    const r = (await t.call(s, 'GET', '/it/api/bff/releases?pageSize=5')).json();
    assert.equal(r.items.length, 5);
    assert.ok(r.total >= 20);
    const r2 = (await t.call(s, 'GET', '/it/api/bff/releases?pageSize=5&page=2')).json();
    assert.ok(r2.items[0].releaseId < r.items[4].releaseId);
  });
});

describe('bff/bff-write.feature', () => {
  it('live 模式寫入回 501 ITAPP_BFF_NOT_SUPPORTED,不假裝成功', async () => {
    const live = await createTestApp({ BFF_MODE: 'live', BFF_BASE_URL: 'http://127.0.0.1:9', BFF_SERVICE_USER: 'svc', BFF_SERVICE_PASSWORD: 'x' });
    try {
      const s = await live.login('S100001');
      const r = await live.call(s, 'PUT', '/it/api/bff/rbac/roles/employee/permissions', { permissions: [] });
      assert.equal(r.statusCode, 501);
      assert.equal(r.json().code, 'ITAPP_BFF_NOT_SUPPORTED');
    } finally {
      await live.close();
    }
  });

  it('mock 模式發佈只新增模擬版本並寫入稽核', async () => {
    const dev = await t.login('S100031');
    const r = await t.call(dev, 'POST', '/it/api/bff/releases', { note: '測試' });
    assert.ok(r.json().release.note.startsWith('[模擬]'));
    const list = (await t.call(dev, 'GET', '/it/api/bff/releases')).json().items;
    assert.equal(list[0].releaseId, r.json().release.releaseId);
  });
});

describe('dashboard/dashboard.feature', () => {
  it('沒有稽核權限者,最近操作只顯示自己的', async () => {
    const s = await t.login('S100032');
    const d = (await t.call(s, 'GET', '/it/api/dashboard/work')).json();
    assert.equal(d.activityScope, 'self');
    assert.ok(d.activity.every((a: { actor: string }) => a.actor === 'S100032'));
  });

  it('同一天內模擬數值不跳動', async () => {
    const s = await t.login('S100032');
    const a = (await t.call(s, 'GET', '/it/api/dashboard/overview')).json();
    const b = (await t.call(s, 'GET', '/it/api/dashboard/overview')).json();
    assert.deepEqual(a.kpis, b.kpis);
  });
});
