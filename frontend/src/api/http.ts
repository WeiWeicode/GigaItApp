/**
 * HTTP client(全站唯一,頁面不直接呼叫 fetch):
 *   - API 位址為同網域相對路徑 /it/api/...(= BASE_URL + 'api'),Cookie 由瀏覽器自動帶上,前端不接觸 Token
 *   - 非 GET/HEAD/OPTIONS 帶 X-CSRF-Token(= it_csrf Cookie)
 *   - 401 → 通知 auth 模組清除登入狀態並導向 /login?redirect=...
 *   - 錯誤統一為 ApiError { status, code, message, requestId, details }
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly requestId: string | null,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const API_BASE = `${import.meta.env.BASE_URL}api`;
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

export function readCookie(name: string): string | undefined {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return hit ? decodeURIComponent(hit.slice(name.length + 1)) : undefined;
}

let onUnauthenticated: (() => void) | null = null;
/** auth 模組註冊:收到 401 時的處理(清除狀態並導向登入頁) */
export function setUnauthenticatedHandler(fn: () => void): void {
  onUnauthenticated = fn;
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  /** 登入 / me 查詢自行處理 401,不自動導向 */
  silent401?: boolean;
}

export async function request<T = unknown>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const m = method.toUpperCase();
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (!SAFE.has(m)) {
    const csrf = readCookie('it_csrf');
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const qs = opts.query
    ? new URLSearchParams(
        Object.entries(opts.query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)]),
      ).toString()
    : '';
  const url = `${API_BASE}${path}${qs ? `?${qs}` : ''}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: m,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK_ERROR', '無法連線伺服器,請確認網路', null);
  }
  const requestId = res.headers.get('X-Request-Id');
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const e = (data ?? {}) as { code?: string; message?: string; requestId?: string; details?: unknown };
    if (res.status === 401 && !opts.silent401) onUnauthenticated?.();
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText, e.requestId ?? requestId, e.details);
  }
  return data as T;
}

export const http = {
  get: <T = unknown>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
  post: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
  put: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
  patch: <T = unknown>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
};

/** 錯誤訊息附 requestId,方便回報時查日誌 */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) return `${e.message}${e.requestId ? `(requestId ${e.requestId.slice(0, 12)})` : ''}`;
  return e instanceof Error ? e.message : String(e);
}
