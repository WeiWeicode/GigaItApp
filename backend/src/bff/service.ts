/**
 * BFF 資料服務:依 BFF_MODE 選擇來源,唯讀資料快取 BFF_CACHE_TTL_SEC 秒(預設 30),寫入後清除快取。
 */
import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../config.js';
import type { Store } from '../store/store.js';
import { LiveBffSource } from './live.js';
import { MockBffSource } from './mock.js';
import type { BffOverview, BffRbac, BffRelease, BffRoute, BffSource, BffWhoCanAccess } from './types.js';

export class BffService {
  private readonly source: BffSource;
  private readonly cache = new Map<string, { at: number; value: Promise<unknown> }>();

  constructor(
    private readonly cfg: Config['bff'],
    store: Store,
    log: FastifyBaseLogger,
  ) {
    this.source = cfg.mode === 'live' ? new LiveBffSource(cfg, log) : new MockBffSource(store);
  }

  get mode() {
    return this.source.mode;
  }

  private cached<T>(key: string, load: () => Promise<T>, refresh = false): Promise<T> {
    const hit = this.cache.get(key);
    if (!refresh && hit && Date.now() - hit.at < this.cfg.cacheTtlSec * 1000) return hit.value as Promise<T>;
    const value = load();
    this.cache.set(key, { at: Date.now(), value });
    // 失敗不快取
    value.catch(() => this.cache.delete(key));
    return value;
  }

  overview(refresh?: boolean): Promise<BffOverview> {
    return this.cached('overview', () => this.source.overview(), refresh);
  }
  routes(refresh?: boolean): Promise<BffRoute[]> {
    return this.cached('routes', () => this.source.routes(), refresh);
  }
  releases(page: number, pageSize: number, refresh?: boolean): Promise<{ items: BffRelease[]; total: number }> {
    return this.cached(`releases:${page}:${pageSize}`, () => this.source.releases(page, pageSize), refresh);
  }
  rbac(refresh?: boolean): Promise<BffRbac> {
    return this.cached('rbac', () => this.source.rbac(), refresh);
  }
  whoCanAccess(permission: string): Promise<BffWhoCanAccess> {
    return this.cached(`who:${permission}`, () => this.source.whoCanAccess(permission));
  }

  async setRolePermissions(role: string, permissions: string[]): Promise<void> {
    await this.source.setRolePermissions(role, permissions);
    this.cache.clear();
  }

  async publish(note: string, actor: string): Promise<BffRelease> {
    const r = await this.source.publish(note, actor);
    this.cache.clear();
    return r;
  }
}
