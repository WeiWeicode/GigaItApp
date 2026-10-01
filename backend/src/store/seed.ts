/**
 * 種子資料(第一次啟動時建立):部門、示範帳號、預設職級權限與部門限制。
 * 示範帳號皆為虛構資料;IT_STAFF 為實際 IT 人員(不填 Email)。密碼取自 ITAPP_SEED_PASSWORD(_FILE),dev 預設 Passw0rd!。
 */
import { hashPassword } from '../auth/password.js';
import { DEFAULT_DEPT_RESTRICTIONS, DEFAULT_LEVEL_PERMISSIONS, type LevelCode } from '../rbac/catalog.js';
import type { Department, StoreData, User } from './store.js';

export const SEED_DEPARTMENTS: Department[] = [
  { code: 'NET', name: '網管課', description: '網路、防火牆、Wi-Fi、VPN', leadEmployeeNo: 'S100010' },
  { code: 'SYS', name: '系統課', description: '伺服器、虛擬化、AD、Gateway 維運', leadEmployeeNo: 'S100001' },
  { code: 'DEV', name: '程式開發課', description: 'MES、HRM、入口網與內部系統開發', leadEmployeeNo: 'S100030' },
  { code: 'SEC', name: '資安課', description: '弱點掃描、端點防護、稽核', leadEmployeeNo: 'S100040' },
];

const SEED_USERS: [string, string, string, LevelCode, string, boolean?][] = [
  ['itadmin', 'IT 系統管理員', 'SYS', 'admin', '系統管理員'],
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

/** 實際 IT 人員(接在示範帳號之後,不影響既有 id) */
const IT_STAFF: [string, string, string, LevelCode, string][] = [
  ['V112001', '蔣佳緯', 'SYS', 'admin', '系統管理員'],
  ['S112009', '蔣佳緯', 'SYS', 'admin', '系統管理員'],
];
const STAFF_NOS = new Set(IT_STAFF.map(([employeeNo]) => employeeNo));

export async function buildSeed(password: string | null): Promise<StoreData> {
  if (!password) throw new Error('第一次啟動需要 ITAPP_SEED_PASSWORD_FILE(建立種子帳號用)');
  const hash = await hashPassword(password);
  const now = new Date().toISOString();
  const users: User[] = [...SEED_USERS, ...IT_STAFF].map(([employeeNo, name, deptCode, level, title, disabled], i) => ({
    id: i + 1,
    employeeNo,
    name,
    email: employeeNo === 'itadmin' || STAFF_NOS.has(employeeNo) ? null : `${employeeNo.toLowerCase()}@example.test`,
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
    departments: structuredClone(SEED_DEPARTMENTS),
    users,
    levelPermissions: structuredClone(DEFAULT_LEVEL_PERMISSIONS),
    deptRestrictions: structuredClone(DEFAULT_DEPT_RESTRICTIONS),
    audit: [],
    bffMockRolePermissions: null,
  };
}
