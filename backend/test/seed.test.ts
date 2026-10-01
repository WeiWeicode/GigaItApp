/**
 * 種子人員:示範帳號只在 dev 建立;test / prod 既有資料檔啟動時移除示範帳號、補齊實際 IT 人員。
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { buildSeed, syncSeedUsers } from '../src/store/seed.js';
import { Store } from '../src/store/store.js';
import { PASSWORD } from './helpers.js';

const dirs: string[] = [];
after(async () => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

async function openStore(env: 'dev' | 'test') {
  const dir = await mkdtemp(join(tmpdir(), 'itapp-seed-'));
  dirs.push(dir);
  return (await Store.open(dir, () => buildSeed(PASSWORD, env))).store;
}

const nos = (store: Store) => store.data.users.map((u) => u.employeeNo);

describe('種子人員', () => {
  it('test 區新建資料檔只有 itadmin 與實際 IT 人員,部門主管未指定', async () => {
    const store = await openStore('test');
    assert.deepEqual(nos(store), ['itadmin', 'V112001', 'S112009', 'S094009']);
    assert.ok(store.data.departments.every((d) => d.leadEmployeeNo === null));
  });

  it('dev 保留示範帳號,啟動同步不移除', async () => {
    const store = await openStore('dev');
    assert.ok(nos(store).includes('S100001'));
    assert.deepEqual(await syncSeedUsers(store, PASSWORD, 'dev'), { added: [], removed: [] });
  });

  it('test 區既有資料檔:移除示範帳號、清除指向他們的部門主管、補齊實際人員並寫入稽核', async () => {
    const store = await openStore('dev');
    await store.mutate((d) => {
      d.users = d.users.filter((u) => u.employeeNo !== 'S094009');
      // 同工號但姓名不同(實際人員)不可誤刪
      d.users.find((u) => u.employeeNo === 'S100033')!.name = '實際人員';
    });

    const result = await syncSeedUsers(store, PASSWORD, 'test');
    assert.deepEqual(result.added, ['S094009']);
    assert.equal(result.removed.length, 11);
    assert.deepEqual(nos(store), ['itadmin', 'S100033', 'V112001', 'S112009', 'S094009']);
    assert.ok(store.data.departments.every((d) => d.leadEmployeeNo === null));
    assert.equal(store.data.audit[0]?.action, 'user.demo-remove');

    // 再次啟動不重複處理
    assert.deepEqual(await syncSeedUsers(store, PASSWORD, 'test'), { added: [], removed: [] });
  });
});
