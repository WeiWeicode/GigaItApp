/**
 * BFF mock 來源(BFF_MODE=mock,預設):資料取自本機 Gateway dev 環境的快照(mock-data.json,皆為虛構資料)。
 * 角色權限的調整存在資料檔 bffMockRolePermissions,發佈只新增一筆模擬版本,不會影響任何 Gateway。
 */
import { AppError } from '../errors.js';
import type { Store } from '../store/store.js';
import data from './mock-data.json' with { type: 'json' };
import type { BffOverview, BffRbac, BffRelease, BffRoute, BffSource, BffWhoCanAccess } from './types.js';

export class MockBffSource implements BffSource {
  readonly mode = 'mock' as const;
  private readonly releaseLog: BffRelease[] = structuredClone(data.releases) as BffRelease[];

  constructor(private readonly store: Store) {}

  async overview(): Promise<BffOverview> {
    return structuredClone({
      upstreams: data.upstreams,
      policies: data.policies,
      release: { ...data.release, liveVersion: this.releaseLog[0]?.releaseId ?? null, redisVersion: this.releaseLog[0]?.releaseId ?? null },
    }) as BffOverview;
  }

  async routes(): Promise<BffRoute[]> {
    return structuredClone(data.routes) as BffRoute[];
  }

  async releases(page: number, pageSize: number): Promise<{ items: BffRelease[]; total: number }> {
    return { items: structuredClone(this.releaseLog.slice((page - 1) * pageSize, page * pageSize)), total: this.releaseLog.length };
  }

  async rbac(): Promise<BffRbac> {
    const overrides = this.store.data.bffMockRolePermissions;
    const rolePermissions = overrides
      ? Object.entries(overrides).flatMap(([role, perms]) => perms.map((permission) => ({ role, permission })))
      : structuredClone(data.rolePermissions);
    return { roles: data.roles, permissions: data.permissions, rolePermissions, roleAdGroups: data.roleAdGroups, roleCompanies: data.roleCompanies };
  }

  async whoCanAccess(permission: string): Promise<BffWhoCanAccess> {
    const rbac = await this.rbac();
    const perm = rbac.permissions.find((p) => p.code === permission);
    if (!perm) return { permission, exists: false, roles: [] };
    const roleCodes = new Set(rbac.rolePermissions.filter((rp) => rp.permission === permission).map((rp) => rp.role));
    return {
      permission,
      exists: true,
      name: perm.name,
      roles: rbac.roles
        .filter((r) => roleCodes.has(r.code))
        .map((r) => ({
          code: r.code,
          name: r.name,
          everyone: r.code === 'employee',
          adGroups: rbac.roleAdGroups.filter((g) => g.role === r.code).map((g) => g.adGroupDn),
          companies: rbac.roleCompanies.filter((c) => c.role === r.code).map((c) => c.company),
          users: [],
        })),
    };
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    const rbac = await this.rbac();
    if (!rbac.roles.some((r) => r.code === role)) throw new AppError('ITAPP_NOT_FOUND', `找不到 BFF 角色 ${role}`);
    const known = new Set(rbac.permissions.map((p) => p.code));
    const unknown = permissions.filter((p) => !known.has(p));
    if (unknown.length) throw new AppError('ITAPP_VALIDATION_FAILED', '含有不存在的權限代碼', { unknown });
    await this.store.mutate((d) => {
      const current: Record<string, string[]> = {};
      for (const rp of rbac.rolePermissions) (current[rp.role] ??= []).push(rp.permission);
      current[role] = [...new Set(permissions)].sort();
      d.bffMockRolePermissions = current;
    });
  }

  async publish(note: string, actor: string): Promise<BffRelease> {
    const release: BffRelease = {
      releaseId: (this.releaseLog[0]?.releaseId ?? 0) + 1,
      note: `[模擬] ${note}`,
      publishedBy: actor,
      publishedAt: new Date().toISOString(),
      rolledBackFrom: null,
      diff: { added: [], modified: [], removed: [], upstreamsChanged: false, policiesChanged: false },
    };
    this.releaseLog.unshift(release);
    return release;
  }
}
