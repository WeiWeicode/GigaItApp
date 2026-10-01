/**
 * 種子資料(第一次啟動時建立):部門、管理員 itadmin、實際 IT 人員、預設職級權限與部門限制。
 * 示範帳號(虛構資料)只在 dev 建立,供單元測試驗證權限;test / prod 不建立,既有資料檔啟動時自動移除。
 * IT_STAFF 為實際 IT 人員(不填 Email)。密碼取自 ITAPP_SEED_PASSWORD(_FILE),dev 預設 Passw0rd!。
 */
import { hashPassword } from '../auth/password.js';
import type { ItEnv } from '../config.js';
import { DEFAULT_DEPT_RESTRICTIONS, DEFAULT_LEVEL_PERMISSIONS, type LevelCode } from '../rbac/catalog.js';
import type { Department, Store, StoreData, User } from './store.js';

export const SEED_DEPARTMENTS: Department[] = [
  { code: 'NET', name: '網管課', description: '網路、防火牆、Wi-Fi、VPN', leadEmployeeNo: 'S100010' },
  { code: 'SYS', name: '系統課', description: '伺服器、虛擬化、AD、Gateway 維運', leadEmployeeNo: 'S100001' },
  { code: 'DEV', name: '程式開發課', description: 'MES、HRM、入口網與內部系統開發', leadEmployeeNo: 'S100030' },
  { code: 'SEC', name: '資安課', description: '弱點掃描、端點防護、稽核', leadEmployeeNo: 'S100040' },
];

type SeedUser = [employeeNo: string, name: string, deptCode: string, level: LevelCode, title: string, disabled?: boolean];

/** 各部署區都有的管理員(實際人員帳號被鎖或忘記密碼時,以此登入重設) */
const SEED_ADMIN: SeedUser = ['itadmin', 'IT 系統管理員', 'SYS', 'admin', '系統管理員'];

/** 示範帳號(虛構資料,只在 dev 建立);SEED_DEPARTMENTS 的部門主管指向其中幾位 */
const DEMO_USERS: SeedUser[] = [
  ['S100001', '陳主管', 'SYS', 'manager', '經理'],
  ['S100020', '張家豪', 'SYS', 'senior', '資深系統工程師'],
  ['S100021', '李怡君', 'SYS', 'engineer', '系統工程師'],
  ['S100010', '林志偉', 'NET', 'manager', '課長'],
  ['S100011', '黃志明', 'NET', 'senior', '資深網路工程師'],
  ['S100012', '吳佳穎', 'NET', 'engineer', '網路工程師'],
  ['S100030', '王建民', 'DEV', 'manager', '課長'],
  ['S100031', '劉建宏', 'DEV', 'senior', '資深軟體工程師'],
  ['S100032', '蔡承恩', 'DEV', 'engineer', '軟體工程師'],
  ['S100033', '許雅筑', 'DEV', 'engineer', '軟體工程師'],
  ['S100040', '周子翔', 'SEC', 'senior', '資深資安工程師'],
  ['S100041', '鄭雅婷', 'SEC', 'engineer', '資安工程師', true],
];

/** 實際 IT 人員(dev 接在示範帳號之後,不影響既有 id) */
export const IT_STAFF: SeedUser[] = [
  ['V112001', '蔣佳緯', 'SYS', 'admin', '系統管理員'],
  ['S112009', '蔣佳緯', 'SYS', 'admin', '系統管理員'],
  ['S094009', '鄭智寬', 'SYS', 'admin', '系統管理員'],
];
const DEMO_NOS = new Set(DEMO_USERS.map(([employeeNo]) => employeeNo));

export async function buildSeed(password: string | null, env: ItEnv): Promise<StoreData> {
  if (!password) throw new Error('第一次啟動需要 ITAPP_SEED_PASSWORD_FILE(建立種子帳號用)');
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  const demo = env === 'dev';
  const users: User[] = [SEED_ADMIN, ...(demo ? DEMO_USERS : []), ...IT_STAFF].map(([employeeNo, name, deptCode, level, title, disabled], i) => ({
    id: i + 1,
    employeeNo,
    name,
    email: DEMO_NOS.has(employeeNo) ? `${employeeNo.toLowerCase()}@example.test` : null,
    title,
    deptCode,
    level,
    passwordHash: hash,
    isDisabled: !!disabled,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
    lastLoginAt: null,
  }));
  return {
    version: 1,
    departments: SEED_DEPARTMENTS.map((d) => ({ ...d, leadEmployeeNo: demo ? d.leadEmployeeNo : null })),
    users,
    levelPermissions: structuredClone(DEFAULT_LEVEL_PERMISSIONS),
    deptRestrictions: structuredClone(DEFAULT_DEPT_RESTRICTIONS),
    audit: [],
    bffMockRolePermissions: null,
  };
}

/**
 * 既有資料檔啟動時同步種子人員:
 *   test / prod 移除示範帳號(工號與姓名都和種子相同才移除,避免誤刪同工號的實際人員),指向被移除者的部門主管改為未指定;
 *   再補齊尚未存在的實際 IT 人員。稽核紀錄保留。
 */
export async function syncSeedUsers(store: Store, password: string | null, env: ItEnv): Promise<{ added: string[]; removed: string[] }> {
  const demoNames = new Map(DEMO_USERS.map(([no, name]) => [no.toUpperCase(), name]));
  const removed = env === 'dev' ? [] : store.data.users.filter((u) => demoNames.get(u.employeeNo.toUpperCase()) === u.name).map((u) => u.employeeNo);
  if (removed.length) {
    const gone = new Set(removed);
    await store.mutate((d) => {
      d.users = d.users.filter((u) => !gone.has(u.employeeNo));
      for (const dept of d.departments) if (dept.leadEmployeeNo && gone.has(dept.leadEmployeeNo)) dept.leadEmployeeNo = null;
    });
    store.addAudit({ type: 'operation', actor: 'system', action: 'user.demo-remove', target: null, result: 'success', detail: removed.join('、'), ip: null });
  }

  const existingNos = new Set(store.data.users.map((u) => u.employeeNo.toUpperCase()));
  const missing = IT_STAFF.filter(([no]) => !existingNos.has(no.toUpperCase()));
  if (missing.length === 0) return { added: [], removed };

  const hash = password ? await hashPassword(password) : store.data.users[0]?.passwordHash;
  if (!hash) return { added: [], removed };

  const now = new Date().toISOString();
  let maxId = store.data.users.reduce((m, u) => Math.max(m, u.id), 0);

  await store.mutate((d) => {
    for (const [employeeNo, name, deptCode, level, title] of missing) {
      maxId += 1;
      d.users.push({
        id: maxId,
        employeeNo,
        name,
        email: null,
        title,
        deptCode,
        level,
        passwordHash: hash,
        isDisabled: false,
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      });
    }
  });
  return { added: missing.map(([no]) => no), removed };
}
