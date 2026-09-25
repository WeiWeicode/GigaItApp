/**
 * 人員與部門:
 *   GET   /it/api/users?q=&dept=&level=&page=&pageSize=   人員清單(非 admin 只看自己部門;後端篩選 + 分頁)   sys.user.read
 *   POST  /it/api/users                         新增人員(回傳一次性臨時密碼)       sys.user.create
 *   PATCH /it/api/users/:id                     編輯姓名、職稱、部門、職級           sys.user.edit
 *   POST  /it/api/users/:id/disable | enable    停用 / 啟用                         sys.user.disable
 *   POST  /it/api/users/:id/reset-password      重設密碼(回傳一次性臨時密碼)       sys.user.reset-password
 *   GET   /it/api/departments                   部門與人數(依職級統計)             sys.dept.read
 *   POST  /it/api/departments                   新增部門                            sys.dept.edit
 *   PATCH /it/api/departments/:code             修改名稱、說明、主管                 sys.dept.edit
 * 寫入類操作:只能管理同部門且職級較低者(admin 例外),不可把人設成比自己高或同級的職級。
 */
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { API_PREFIX, currentUser } from '../auth/plugin.js';
import { generateTempPassword, hashPassword } from '../auth/password.js';
import { AppError } from '../errors.js';
import { canManage, dataScopeOf } from '../rbac/authz.js';
import { LEVEL_CODES, LEVELS, levelOf, type LevelCode } from '../rbac/catalog.js';
import type { Store, User } from '../store/store.js';
import { matchesQ, pageProps, paginate } from './paging.js';

const publicUser = (u: User) => ({
  id: u.id,
  employeeNo: u.employeeNo,
  name: u.name,
  email: u.email,
  title: u.title,
  deptCode: u.deptCode,
  level: u.level,
  isDisabled: u.isDisabled,
  createdAt: u.createdAt,
  updatedAt: u.updatedAt,
  lastLoginAt: u.lastLoginAt,
});

const userFields = {
  name: { type: 'string', minLength: 1, maxLength: 50 },
  email: { type: ['string', 'null'], maxLength: 120 },
  title: { type: ['string', 'null'], maxLength: 50 },
  deptCode: { type: 'string', minLength: 1, maxLength: 20 },
  level: { type: 'string', enum: LEVEL_CODES },
} as const;

type UserInput = { name: string; email?: string | null; title?: string | null; deptCode: string; level: LevelCode };

const usersRoutes: FastifyPluginAsync<{ store: Store }> = async (app, { store }) => {
  function findUser(id: number): User {
    const u = store.data.users.find((x) => x.id === id);
    if (!u) throw new AppError('ITAPP_NOT_FOUND', '找不到此人員');
    return u;
  }

  /** 檢查可否管理對象,以及變更後的部門 / 職級是否在自己可指派的範圍 */
  function assertManageable(actor: User, target: Pick<User, 'level' | 'deptCode'>) {
    if (!canManage(actor, target)) throw new AppError('ITAPP_DATA_ACCESS_DENIED', '只能管理同部門且職級較低的人員');
  }

  function assertDept(code: string) {
    if (!store.data.departments.some((d) => d.code === code)) throw new AppError('ITAPP_VALIDATION_FAILED', `部門 ${code} 不存在`);
  }

  const audit = (req: FastifyRequest, action: string, target: string, detail: string | null = null) =>
    store.addAudit({ type: 'operation', actor: currentUser(req).employeeNo, action, target, result: 'success', detail, ip: req.ip });

  app.get<{ Querystring: { q?: string; dept?: string; level?: LevelCode; page: number; pageSize: number } }>(
    `${API_PREFIX}/users`,
    {
      config: { permission: 'sys.user.read' },
      schema: {
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 100 },
            dept: { type: 'string', maxLength: 20 },
            level: { type: 'string', enum: LEVEL_CODES },
            ...pageProps(100),
          },
        },
      },
    },
    async (req) => {
      const me = currentUser(req);
      const scope = dataScopeOf(me);
      const { q, dept, level, page, pageSize } = req.query;
      const rows = store.data.users.filter(
        (u) =>
          (scope === 'all' || u.deptCode === me.deptCode) &&
          (!dept || u.deptCode === dept) &&
          (!level || u.level === level) &&
          matchesQ(q, [u.employeeNo, u.name, u.email, u.title]),
      );
      const paged = paginate(rows, page, pageSize);
      return { scope, ...paged, items: paged.items.map(publicUser), levels: LEVELS, departments: store.data.departments };
    },
  );

  app.post<{ Body: UserInput & { employeeNo: string } }>(
    `${API_PREFIX}/users`,
    {
      config: { permission: 'sys.user.create' },
      schema: {
        body: {
          type: 'object',
          required: ['employeeNo', 'name', 'deptCode', 'level'],
          additionalProperties: false,
          properties: { employeeNo: { type: 'string', pattern: '^[A-Za-z0-9_-]{3,20}$' }, ...userFields },
        },
      },
    },
    async (req, reply) => {
      const me = currentUser(req);
      const b = req.body;
      assertDept(b.deptCode);
      assertManageable(me, b);
      if (store.data.users.some((u) => u.employeeNo.toLowerCase() === b.employeeNo.toLowerCase())) throw new AppError('ITAPP_CONFLICT', '工號已存在');
      const temp = generateTempPassword();
      const now = new Date().toISOString();
      const user: User = {
        id: store.nextUserId(),
        employeeNo: b.employeeNo,
        name: b.name,
        email: b.email ?? null,
        title: b.title ?? null,
        deptCode: b.deptCode,
        level: b.level,
        passwordHash: await hashPassword(temp),
        isDisabled: false,
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        lastLoginAt: null,
      };
      await store.mutate((d) => d.users.push(user));
      audit(req, 'user.create', user.employeeNo, `${b.deptCode} / ${levelOf(b.level).name}`);
      return reply.code(201).send({ user: publicUser(user), tempPassword: temp });
    },
  );

  app.patch<{ Params: { id: number }; Body: Partial<UserInput> }>(
    `${API_PREFIX}/users/:id`,
    {
      config: { permission: 'sys.user.edit' },
      schema: {
        params: { type: 'object', properties: { id: { type: 'integer' } } },
        body: { type: 'object', additionalProperties: false, minProperties: 1, properties: userFields },
      },
    },
    async (req) => {
      const me = currentUser(req);
      const u = findUser(req.params.id);
      assertManageable(me, u);
      const next = { level: req.body.level ?? u.level, deptCode: req.body.deptCode ?? u.deptCode };
      if (req.body.deptCode) assertDept(req.body.deptCode);
      assertManageable(me, next);
      await store.mutate(() => {
        Object.assign(u, req.body, { updatedAt: new Date().toISOString() });
      });
      audit(req, 'user.update', u.employeeNo, Object.keys(req.body).join(', '));
      return { user: publicUser(u) };
    },
  );

  for (const action of ['disable', 'enable'] as const) {
    app.post<{ Params: { id: number } }>(
      `${API_PREFIX}/users/:id/${action}`,
      { config: { permission: 'sys.user.disable' }, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } },
      async (req) => {
        const me = currentUser(req);
        const u = findUser(req.params.id);
        if (u.id === me.id) throw new AppError('ITAPP_VALIDATION_FAILED', '不能停用自己');
        assertManageable(me, u);
        await store.mutate(() => {
          u.isDisabled = action === 'disable';
          // 停用時讓既有 Session 立即失效
          if (u.isDisabled) u.tokenVersion += 1;
          u.updatedAt = new Date().toISOString();
        });
        audit(req, `user.${action}`, u.employeeNo);
        return { user: publicUser(u) };
      },
    );
  }

  app.post<{ Params: { id: number } }>(
    `${API_PREFIX}/users/:id/reset-password`,
    { config: { permission: 'sys.user.reset-password' }, schema: { params: { type: 'object', properties: { id: { type: 'integer' } } } } },
    async (req) => {
      const me = currentUser(req);
      const u = findUser(req.params.id);
      assertManageable(me, u);
      const temp = generateTempPassword();
      const hash = await hashPassword(temp);
      await store.mutate(() => {
        u.passwordHash = hash;
        u.tokenVersion += 1;
        u.updatedAt = new Date().toISOString();
      });
      audit(req, 'user.reset-password', u.employeeNo);
      return { tempPassword: temp };
    },
  );

  // ---------------- 部門 ----------------

  app.get(`${API_PREFIX}/departments`, { config: { permission: 'sys.dept.read' } }, async () => ({
    items: store.data.departments.map((d) => {
      const members = store.data.users.filter((u) => u.deptCode === d.code && !u.isDisabled);
      const lead = store.data.users.find((u) => u.employeeNo === d.leadEmployeeNo);
      return {
        ...d,
        leadName: lead?.name ?? null,
        memberCount: members.length,
        byLevel: Object.fromEntries(LEVEL_CODES.map((l) => [l, members.filter((m) => m.level === l).length])),
      };
    }),
  }));

  const deptFields = {
    name: { type: 'string', minLength: 1, maxLength: 30 },
    description: { type: 'string', maxLength: 200 },
    leadEmployeeNo: { type: ['string', 'null'], maxLength: 20 },
  } as const;
  type DeptInput = { name: string; description?: string; leadEmployeeNo?: string | null };

  const assertLead = (emp: string | null | undefined) => {
    if (emp && !store.data.users.some((u) => u.employeeNo === emp)) throw new AppError('ITAPP_VALIDATION_FAILED', `找不到主管工號 ${emp}`);
  };

  app.post<{ Body: DeptInput & { code: string } }>(
    `${API_PREFIX}/departments`,
    {
      config: { permission: 'sys.dept.edit' },
      schema: {
        body: {
          type: 'object',
          required: ['code', 'name'],
          additionalProperties: false,
          properties: { code: { type: 'string', pattern: '^[A-Z][A-Z0-9]{1,9}$' }, ...deptFields },
        },
      },
    },
    async (req, reply) => {
      if (store.data.departments.some((d) => d.code === req.body.code)) throw new AppError('ITAPP_CONFLICT', '部門代碼已存在');
      assertLead(req.body.leadEmployeeNo);
      const dept = { code: req.body.code, name: req.body.name, description: req.body.description ?? '', leadEmployeeNo: req.body.leadEmployeeNo ?? null };
      await store.mutate((d) => d.departments.push(dept));
      audit(req, 'dept.create', dept.code, dept.name);
      return reply.code(201).send({ department: dept });
    },
  );

  app.patch<{ Params: { code: string }; Body: Partial<DeptInput> }>(
    `${API_PREFIX}/departments/:code`,
    { config: { permission: 'sys.dept.edit' }, schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: deptFields } } },
    async (req) => {
      const dept = store.data.departments.find((d) => d.code === req.params.code);
      if (!dept) throw new AppError('ITAPP_NOT_FOUND', '找不到此部門');
      assertLead(req.body.leadEmployeeNo);
      await store.mutate(() => Object.assign(dept, req.body));
      audit(req, 'dept.update', dept.code, Object.keys(req.body).join(', '));
      return { department: dept };
    },
  );
};

export default usersRoutes;
