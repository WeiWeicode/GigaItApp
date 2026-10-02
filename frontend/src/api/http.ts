/**
 * HTTP client(全站唯一,頁面不直接呼叫 fetch):一律經 Gateway web-kit(giga-Portal PRD I1、Gateway FRONTEND-GUIDE §6)
 *   - 同網域 /api/...(BFF 管理 API /api/admin/*、本系統 /api/it/* 經 BFF 轉 itapp-api),Cookie 由瀏覽器自動帶上,前端不接觸 Token
 *   - 非 GET 自動帶 X-CSRF-Token(gn_csrf);401 先 Refresh 一次,失敗才導向入口網 /login?redirect=...
 *   - 錯誤統一為 ApiError { status, code, message, requestId, details }
 */
import { ApiError, http as kit, type RequestOptions } from '@giganexus/web-kit';

export { ApiError };

export type Query = Record<string, string | number | boolean | undefined | null>;
export type ApiPath = `/api/${string}`;
type Opts = RequestOptions & { query?: Query };

/** 組查詢字串:略過 undefined / null / 空字串 */
export function withQuery(path: string, query?: Query): string {
  if (!query) return path;
  const qs = new URLSearchParams(
    Object.entries(query)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => [k, String(v)]),
  ).toString();
  return qs ? `${path}?${qs}` : path;
}

export const http = {
  get: <T = unknown>(path: ApiPath, opts: Opts = {}) => kit.get<T>(withQuery(path, opts.query), opts),
  post: <T = unknown>(path: ApiPath, body?: unknown, opts: Opts = {}) => kit.post<T>(withQuery(path, opts.query), body, opts),
  put: <T = unknown>(path: ApiPath, body?: unknown, opts: Opts = {}) => kit.put<T>(withQuery(path, opts.query), body, opts),
  patch: <T = unknown>(path: ApiPath, body?: unknown, opts: Opts = {}) => kit.patch<T>(withQuery(path, opts.query), body, opts),
  delete: <T = unknown>(path: ApiPath, opts: Opts = {}) => kit.delete<T>(withQuery(path, opts.query), opts),
};

/** 錯誤訊息附 requestId,方便回報時查日誌;欄位錯誤(VALIDATION_FAILED 的 details)一併列出 */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    const fields = Array.isArray(e.details)
      ? (e.details as { field?: string; message?: string }[])
          .map((d) => [d.field, d.message].filter(Boolean).join(':'))
          .filter(Boolean)
          .join(';')
      : '';
    return `${e.message}${fields ? `(${fields})` : ''}${e.requestId ? `(requestId ${e.requestId.slice(0, 12)})` : ''}`;
  }
  if (e instanceof TypeError) return '無法連線伺服器,請確認網路';
  return e instanceof Error ? e.message : String(e);
}
