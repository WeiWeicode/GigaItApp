/**
 * IT 管理系統自身的角色與按鈕權限:
 *   GET /it/api/rbac/catalog                          職級、部門、權限、職級權限、部門限制、選單   sys.perm.read
 *   PUT /it/api/rbac/levels/:level/permissions        設定職級權限(admin 固定全部,不可調整)     sys.perm.edit
 *   PUT /it/api/rbac/permissions/:code/departments    設定權限的部門限制(空陣列 = 不限部門)     sys.perm.edit
 *   GET /it/api/rbac/preview?level=&dept=             試算某職級 + 部門的有效權限與選單           sys.perm.read
 * 調整後立即生效(權限每次請求由資料檔計算)。
 */
import type { FastifyPluginAsync } from 'fastify';
import { API_PREFIX, currentUser } from '../auth/plugin.js';
import { AppError } from '../errors.js';
import { effectivePermissions } from '../rbac/authz.js';
import { LEVEL_CODES, LEVELS, MENUS, menusFor, MODULES, PERMISSION_CODES, PERMISSIONS, type LevelCode } from '../rbac/catalog.js';
import type { Store } from '../store/store.js';

const rbacRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  const P = `${API_PREFIX}/rbac`;

  app.get(`${P}/catalog`, { config: { permission: 'sys.perm.read' } }, async () => ({
    levels: LEVELS,
    modules: MODULES,
    departments: store.data.departments.map(({ code, name }) => ({ code, name })),
    permissions: PERMISSIONS,
    levelPermissions: { admin: PERMISSIONS.map((p) => p.code), ...store.data.levelPermissions },
    deptRestrictions: store.data.deptRestrictions,
    menus: MENUS,
  }));

  app.put<{ Params: { level: LevelCode }; Body: { permissions: string[] } }>(
    `${P}/levels/:level/permissions`,
    {
      config: { permission: 'sys.perm.edit' },
      schema: {
        params: { type: 'object', properties: { level: { type: 'string', enum: LEVEL_CODES } } },
        body: {
          type: 'object',
          required: ['permissions'],
          additionalProperties: false,
          properties: { permissions: { type: 'array', maxItems: 200, items: { type: 'string', maxLength: 60 } } },
        },
      },
    },
    async (req) => {
      const { level } = req.params;
      if (level === 'admin') throw new AppError('ITAPP_VALIDATION_FAILED', '系統管理員固定擁有全部權限,不可調整');
      const unknown = req.body.permissions.filter((p) => !PERMISSION_CODES.has(p));
      if (unknown.length) throw new AppError('ITAPP_VALIDATION_FAILED', '含有不存在的權限代碼', { unknown });
      const perms = [...new Set(req.body.permissions)].sort();
      await store.mutate((d) => (d.levelPermissions[level] = perms));
      store.addAudit({
        type: 'operation',
        actor: currentUser(req).employeeNo,
        action: 'rbac.level.update',
        target: level,
        result: 'success',
        detail: `${perms.length} 項權限`,
        ip: req.ip,
      });
      return { level, permissions: perms };
    },
  );

  app.put<{ Params: { code: string }; Body: { departments: string[] } }>(
    `${P}/permissions/:code/departments`,
    {
      config: { permission: 'sys.perm.edit' },
      schema: {
        body: {
          type: 'object',
          required: ['departments'],
          additionalProperties: false,
          properties: { departments: { type: 'array', maxItems: 50, items: { type: 'string', maxLength: 20 } } },
        },
      },
    },
    async (req) => {
      const { code } = req.params;
      if (!PERMISSION_CODES.has(code)) throw new AppError('ITAPP_NOT_FOUND', '找不到此權限');
      const known = new Set(store.data.departments.map((d) => d.code));
      const unknown = req.body.departments.filter((d) => !known.has(d));
      if (unknown.length) throw new AppError('ITAPP_VALIDATION_FAILED', '含有不存在的部門', { unknown });
      const depts = [...new Set(req.body.departments)].sort();
      await store.mutate((d) => {
        if (depts.length) d.deptRestrictions[code] = depts;
        else delete d.deptRestrictions[code];
      });
      store.addAudit({
        type: 'operation',
        actor: currentUser(req).employeeNo,
        action: 'rbac.dept-restriction.update',
        target: code,
        result: 'success',
        detail: depts.length ? depts.join(', ') : '不限部門',
        ip: req.ip,
      });
      return { permission: code, departments: depts };
    },
  );

  app.get<{ Querystring: { level: LevelCode; dept: string } }>(
    `${P}/preview`,
    {
      config: { permission: 'sys.perm.read' },
      schema: {
        querystring: {
          type: 'object',
          required: ['level', 'dept'],
          properties: { level: { type: 'string', enum: LEVEL_CODES }, dept: { type: 'string', maxLength: 20 } },
        },
      },
    },
    async (req) => {
      const perms = effectivePermissions(store.data, { level: req.query.level, deptCode: req.query.dept });
      return { permissions: [...perms].sort(), menus: menusFor(perms) };
    },
  );
};

export default rbacRoutes;
