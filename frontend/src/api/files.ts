/**
 * 附件服務 file-api(giga-file-service docs/API.md §2;經 Gateway BFF /api/file/*,權限 file.*)。
 * 「Gateway 管理 › 檔案管理」頁使用;上傳 POST /api/file/files 由 Gateway Nginx 驗證後直送 file-api(D4-B),單檔上限 30 MB(D3)。
 */
import { http, withQuery } from './http';
import type { Paged } from './admin';

export interface FileItem {
  fileUuid: string;
  originalName: string;
  ext: string | null;
  mime: string | null;
  sizeBytes: number;
  sha256: string;
  sourceSystem: string;
  sourceApp: string | null;
  refType: string | null;
  refNo: string | null;
  companyId: string | null;
  uploadedBy: string;
  createdAt: string;
  boundAt: string | null;
  backupStatus: 'pending' | 'done' | 'failed';
  backupAt: string | null;
}

export interface StorageStats {
  files: number;
  bytes: number;
  temp: number;
  backup: { pending: number; done: number; failed: number };
  failedItems: { fileUuid: string; originalName: string; createdAt: string }[];
  /** basis host = Windows 主機磁碟(實際可用);filesystem = 只有檔案根目錄所在檔案系統(WSL 虛擬磁碟,僅供參考) */
  capacity: { totalBytes: number; freeBytes: number; basis: 'host' | 'filesystem'; filesystem: { totalBytes: number; freeBytes: number } } | null;
}

export interface FileQuery {
  refNo?: string;
  refType?: string;
  sourceSystem?: string;
  uploadedBy?: string;
  page: number;
  pageSize: number;
}

/** 單檔上限(giga-file-service D3:30 MB;Nginx 直送,不受 BFF 10 MB 限制) */
export const UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
export const UPLOAD_MAX_FILES = 10;

export const files = {
  list: (q: FileQuery) => http.get<Paged<FileItem>>('/api/file/files', { query: { ...q } }),
  upload: (picked: File[], fields: { refType?: string; refNo?: string; sourceApp?: string }) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) if (v) fd.append(k, v);
    for (const f of picked) fd.append('file', f, f.name);
    return http.post<{ items: FileItem[] }>('/api/file/files', fd);
  },
  bind: (uuids: string[], refNo: string, refType?: string) =>
    http.post<{ bound: number }>('/api/file/files/bind', { uuids, refNo, ...(refType ? { refType } : {}) }),
  remove: (uuid: string) => http.delete(`/api/file/files/${uuid}`),
  storage: () => http.get<StorageStats>('/api/file/storage'),
  /** 下載 / 預覽網址(同網域 Cookie;GET 不需 CSRF) */
  contentUrl: (uuid: string, inline = false) => withQuery(`/api/file/files/${uuid}/content`, inline ? { inline: 1 } : undefined),
};

export const BACKUP_STATUS: Record<FileItem['backupStatus'], { label: string; tone: string }> = {
  pending: { label: '待備份', tone: 'warning' },
  done: { label: '已備份', tone: 'success' },
  failed: { label: '備份失敗', tone: 'danger' },
};

/** 可在瀏覽器預覽的類型(與 file-api file-types.ts 的 inline 清單一致;SVG 不預覽) */
export const PREVIEWABLE = new Set(['pdf', 'png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);
