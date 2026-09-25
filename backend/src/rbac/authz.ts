/**
 * 有效權限 = 職級權限 ∩ 部門限制(AGENT.md §5):
 *   - admin 固定擁有全部權限
 *   - 其他職級:取 levelPermissions[level],再排除「有部門限制且使用者部門不在清單內」的權限
 * 資料範圍:admin 看全部,其他人只看自己部門(人員清單等)。
 */
import type { StoreData, User } from '../store/store.js';
import { levelOf, menusFor, PERMISSIONS, type MenuGroup } from './catalog.js';

export type DataScope = 'all' | 'dept';

export function effectivePermissions(data: StoreData, user: Pick<User, 'level' | 'deptCode'>): Set<string> {
  if (user.level === 'admin') return new Set(PERMISSIONS.map((p) => p.code));
  const granted = data.levelPermissions[user.level] ?? [];
  return new Set(
    granted.filter((code) => {
      const depts = data.deptRestrictions[code];
      return !depts?.length || depts.includes(user.deptCode);
    }),
  );
}

export const dataScopeOf = (user: Pick<User, 'level'>): DataScope => (user.level === 'admin' ? 'all' : 'dept');

/** 是否可管理對象:admin 可管理全部;其他人只能管理同部門且職級較低者 */
export function canManage(actor: Pick<User, 'level' | 'deptCode'>, target: Pick<User, 'level' | 'deptCode'>): boolean {
  if (actor.level === 'admin') return true;
  return actor.deptCode === target.deptCode && levelOf(actor.level).rank > levelOf(target.level).rank;
}

export interface Me {
  user: { id: number; employeeNo: string; name: string; email: string | null; title: string | null; lastLoginAt: string | null };
  department: { code: string; name: string } | null;
  level: { code: string; name: string; rank: number };
  permissions: string[];
  menus: MenuGroup[];
  dataScope: DataScope;
}

export function buildMe(data: StoreData, user: User): Me {
  const perms = effectivePermissions(data, user);
  const dept = data.departments.find((d) => d.code === user.deptCode);
  const level = levelOf(user.level);
  return {
    user: { id: user.id, employeeNo: user.employeeNo, name: user.name, email: user.email, title: user.title, lastLoginAt: user.lastLoginAt },
    department: dept ? { code: dept.code, name: dept.name } : null,
    level: { code: level.code, name: level.name, rank: level.rank },
    permissions: [...perms].sort(),
    menus: menusFor(perms),
    dataScope: dataScopeOf(user),
  };
}
