/**
 * 資料儲存(基本框架階段):單一 JSON 檔 {DATA_DIR}/itapp.json,程式啟動時載入到記憶體。
 *   - 寫入以「暫存檔 + rename」原子替換,多個寫入依序排隊
 *   - 只適合單一實例;要多實例或正式上線時改接資料庫(repository 介面不變)
 * 第一次啟動(檔案不存在)時建立種子資料(seed.ts)。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LevelCode } from '../rbac/catalog.js';

export interface Department {
  code: string;
  name: string;
  description: string;
  /** 部門主管工號(可空) */
  leadEmployeeNo: string | null;
}

export interface User {
  id: number;
  employeeNo: string;
  name: string;
  email: string | null;
  title: string | null;
  deptCode: string;
  level: LevelCode;
  passwordHash: string;
  isDisabled: boolean;
  /** 停用、重設密碼時遞增,使既有 Session 失效 */
  tokenVersion: number;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AuditEntry {
  id: number;
  at: string;
  type: 'operation' | 'login';
  actor: string;
  action: string;
  target: string | null;
  result: 'success' | 'failure';
  detail: string | null;
  ip: string | null;
}

export interface StoreData {
  version: 1;
  departments: Department[];
  users: User[];
  /** 職級 → 權限代碼(admin 固定全部,不存) */
  levelPermissions: Record<Exclude<LevelCode, 'admin'>, string[]>;
  /** 權限 → 允許的部門代碼(未列出 = 不限部門) */
  deptRestrictions: Record<string, string[]>;
  audit: AuditEntry[];
  /** BFF_MODE=mock 時,在 IT 管理系統內調整的 BFF 角色權限(role → permission codes) */
  bffMockRolePermissions: Record<string, string[]> | null;
}

const AUDIT_LIMIT = 2000;

export class Store {
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    private readonly file: string,
    public data: StoreData,
  ) {}

  static async open(dataDir: string, seed: () => Promise<StoreData>): Promise<{ store: Store; created: boolean }> {
    const file = join(dataDir, 'itapp.json');
    await mkdir(dataDir, { recursive: true });
    try {
      const data = JSON.parse(await readFile(file, 'utf8')) as StoreData;
      return { store: new Store(file, data), created: false };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      const store = new Store(file, await seed());
      await store.save();
      return { store, created: true };
    }
  }

  /** 修改資料並寫回檔案;fn 內丟出錯誤時不寫入 */
  async mutate<T>(fn: (data: StoreData) => T): Promise<T> {
    const result = fn(this.data);
    await this.save();
    return result;
  }

  save(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 1);
    this.queue = this.queue.then(async () => {
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, snapshot, 'utf8');
      await rename(tmp, this.file);
    });
    return this.queue;
  }

  nextUserId(): number {
    return this.data.users.reduce((m, u) => Math.max(m, u.id), 0) + 1;
  }

  addAudit(entry: Omit<AuditEntry, 'id' | 'at'>): void {
    const id = (this.data.audit[0]?.id ?? 0) + 1;
    this.data.audit.unshift({ id, at: new Date().toISOString(), ...entry });
    if (this.data.audit.length > AUDIT_LIMIT) this.data.audit.length = AUDIT_LIMIT;
    void this.save();
  }
}
