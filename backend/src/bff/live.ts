/**
 * BFF live 來源(BFF_MODE=live):以 Gateway 服務帳號登入 BFF(POST /api/auth/login),
 * 保存 gn_at / gn_rt / gn_csrf Cookie 後呼叫唯讀管理 API;401 時先 Refresh,失敗再重新登入一次。
 *
 * 服務帳號需具備 gw.admin.route.read、gw.admin.rbac.read(BFF 以使用者權限檢查,API Key 目前只開放路由查詢)。
 * /api/admin/demo/*、/api/admin/db/* 只在 BFF 的 dev / test 註冊;正式區需等 BFF 管理 API(PRD §8.7 / P2-3)。
 * 寫入類操作(角色權限、發佈)BFF 尚未提供 API,一律回 ITAPP_BFF_NOT_SUPPORTED,不假裝成功。
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import { AppError } from '../errors.js';
import type { BffOverview, BffRbac, BffRelease, BffRoute, BffSource, BffWhoCanAccess } from './types.js';

interface TablePage<T> {
  items: T[];
  total: number;
}

const PAGE_SIZE = 100;

export class LiveBffSource implements BffSource {
  readonly mode = 'live' as const;
  private readonly cookies = new Map<string, string>();
  private signingIn: Promise<void> | null = null;

  constructor(
    private readonly cfg: Config['bff'],
    private readonly log: FastifyBaseLogger,
  ) {}

  private cookieHeader(): string {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private keepCookies(res: Response): void {
    for (const c of res.headers.getSetCookie()) {
      const [pair = ''] = c.split(';');
      const i = pair.indexOf('=');
      if (i <= 0) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value && !/max-age=0|expires=thu, 01 jan 1970/i.test(c)) this.cookies.set(name, value);
      else this.cookies.delete(name);
    }
  }

  private async fetch(path: string, init: RequestInit = {}): Promise<Response> {
    try {
      const res = await fetch(`${this.cfg.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', Cookie: this.cookieHeader(), ...(init.headers as Record<string, string>) },
        signal: AbortSignal.timeout(this.cfg.timeoutMs),
      });
      this.keepCookies(res);
      return res;
    } catch (err) {
      this.log.warn({ err: (err as Error).message, path }, '無法連線 BFF');
      throw new AppError('ITAPP_BFF_UNAVAILABLE');
    }
  }

  private async bffError(res: Response, path: string): Promise<AppError> {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string; requestId?: string };
    this.log.warn({ status: res.status, code: body.code, requestId: body.requestId, path }, 'BFF 回應錯誤');
    return new AppError('ITAPP_BFF_UNAVAILABLE', `BFF 回應 ${res.status} ${body.code ?? ''} ${body.message ?? ''}`.trim(), {
      bffStatus: res.status,
      bffCode: body.code,
      bffRequestId: body.requestId,
    });
  }

  private signIn(): Promise<void> {
    this.signingIn ??= (async () => {
      // 先試 Refresh(不消耗登入限流),失敗才以帳密登入
      if (this.cookies.has('gn_rt')) {
        const r = await this.fetch('/api/auth/refresh', { method: 'POST', headers: { 'X-CSRF-Token': this.cookies.get('gn_csrf') ?? '' } });
        if (r.ok) return;
      }
      this.cookies.clear();
      const res = await this.fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: this.cfg.serviceUser, password: this.cfg.servicePassword }),
      });
      if (!res.ok) throw await this.bffError(res, '/api/auth/login');
      this.log.info({ user: this.cfg.serviceUser }, '已以服務帳號登入 BFF');
    })().finally(() => (this.signingIn = null));
    return this.signingIn;
  }

  private async get<T>(path: string): Promise<T> {
    if (!this.cookies.has('gn_at')) await this.signIn();
    let res = await this.fetch(path);
    if (res.status === 401) {
      await this.signIn();
      res = await this.fetch(path);
    }
    if (!res.ok) throw await this.bffError(res, path);
    return (await res.json()) as T;
  }

  /** 讀取 BFF 資料表檢視(分頁讀完) */
  private async table<T>(name: string): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const r = await this.get<TablePage<T>>(`/api/admin/db/tables/${name}?page=${page}&pageSize=${PAGE_SIZE}`);
      out.push(...r.items);
      if (out.length >= r.total || !r.items.length) return out;
    }
  }

  async overview(): Promise<BffOverview> {
    const c = await this.get<BffOverview & { permissions: unknown; roles: unknown }>('/api/admin/demo/catalog');
    return {
      upstreams: c.upstreams.map(({ id: _id, ...u }: BffOverview['upstreams'][number] & { id?: number }) => u),
      policies: c.policies,
      release: c.release,
    };
  }

  async routes(): Promise<BffRoute[]> {
    const r = await this.get<{ items: (BffRoute & { gherkin?: string })[] }>('/api/admin/routes/catalog');
    return r.items.map(({ gherkin: _g, ...route }) => route);
  }

  async releases(page: number, pageSize: number): Promise<{ items: BffRelease[]; total: number }> {
    // BFF 資料表檢視本身支援分頁,直接取需要的那一頁
    const r = await this.get<TablePage<Record<string, unknown>>>(`/api/admin/db/tables/config_release?page=${page}&pageSize=${pageSize}`);
    return {
      total: r.total,
      items: r.items.map((x) => ({
        releaseId: Number(x.release_id),
        note: (x.note as string | null) ?? null,
        publishedBy: String(x.published_by),
        publishedAt: String(x.published_at),
        rolledBackFrom: (x.rolled_back_from as number | null) ?? null,
        diff: typeof x.diff_summary === 'string' ? (JSON.parse(x.diff_summary) as BffRelease['diff']) : null,
      })),
    };
  }

  async rbac(): Promise<BffRbac> {
    type Row = Record<string, unknown>;
    const [roles, perms, rp, rag, rc, companies] = await Promise.all([
      this.table<Row>('role'),
      this.table<Row>('permission'),
      this.table<Row>('role_permission'),
      this.table<Row>('role_ad_group'),
      this.table<Row>('role_company'),
      this.table<Row>('company').catch(() => [] as Row[]),
    ]);
    const roleCode = new Map(roles.map((r) => [r.role_id, String(r.code)]));
    const permCode = new Map(perms.map((p) => [p.permission_id, String(p.code)]));
    const compName = new Map(companies.map((c) => [c.company_id, String(c.comp_name)]));
    return {
      roles: roles
        .sort((a, b) => Number(a.role_id) - Number(b.role_id))
        .map((r) => ({ code: String(r.code), name: String(r.name), description: (r.description as string | null) ?? null, isSystem: !!r.is_system })),
      permissions: perms.map((p) => ({
        code: String(p.code),
        name: String(p.name),
        systemCode: String(p.system_code),
        description: (p.description as string | null) ?? null,
      })),
      rolePermissions: rp.flatMap((x) => {
        const role = roleCode.get(x.role_id);
        const permission = permCode.get(x.permission_id);
        return role && permission ? [{ role, permission }] : [];
      }),
      roleAdGroups: rag.flatMap((x) => (roleCode.has(x.role_id) ? [{ role: roleCode.get(x.role_id)!, adGroupDn: String(x.ad_group_dn) }] : [])),
      roleCompanies: rc.flatMap((x) =>
        roleCode.has(x.role_id) ? [{ role: roleCode.get(x.role_id)!, company: compName.get(x.company_id) ?? `#${String(x.company_id)}` }] : [],
      ),
    };
  }

  whoCanAccess(permission: string): Promise<BffWhoCanAccess> {
    return this.get<BffWhoCanAccess>(`/api/admin/demo/who-can-access?permission=${encodeURIComponent(permission)}`);
  }

  async setRolePermissions(): Promise<void> {
    throw new AppError('ITAPP_BFF_NOT_SUPPORTED', 'BFF 尚未提供角色權限編輯 API(PRD §8.7 / P2-3),請暫以 Gateway CLI 調整');
  }

  async publish(): Promise<BffRelease> {
    throw new AppError('ITAPP_BFF_NOT_SUPPORTED', 'BFF 尚未提供發佈 API(PRD §8.7 / P2-3),請暫以 Gateway CLI 發佈');
  }
}
