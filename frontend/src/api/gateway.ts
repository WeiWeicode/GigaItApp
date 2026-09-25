/**
 * Gateway BFF 呼叫(端點管理;Gateway docs/ENDPOINT-AGENT-GUIDE.md §8、Gateway PRD Q27):
 *   - 端點資料以 BFF 權限為準;本系統的權限只決定選單與按鈕是否顯示
 *   - 身分是 Gateway 的登入狀態(gn_at Cookie,同網域由瀏覽器自動帶上),與本系統的登入(it_at)分開
 *   - 目前只有唯讀 GET,不需要 CSRF;401 不自動換發 Token,由頁面引導重新登入 Gateway。
 *     之後加入下指令等寫入功能時改用 @giganexus/web-kit(CSRF、Token 自動更新,Gateway FRONTEND-GUIDE §6)
 */
import { ApiError } from './http';

export interface GatewayMe {
  user: { employeeNo: string; name: string; authType: 'ad' | 'local' };
  permissions: string[];
}

/** Agent 基本資料(Gateway ENDPOINT-AGENT-GUIDE §8.3 草案) */
export interface EndpointDevice {
  deviceId: string;
  computerName: string;
  certDn: string;
  certFingerprint: string;
  online: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
}

export async function gatewayGet<T>(path: `/api/${string}`): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', '無法連線 Gateway,請確認網路', null);
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
    const e = (data ?? {}) as { code?: string; message?: string; requestId?: string };
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText, e.requestId ?? requestId);
  }
  return data as T;
}

/** Gateway 入口網登入頁,登入後回到目前頁面(Gateway FRONTEND-GUIDE §7.1) */
export function gatewayLoginUrl(): string {
  return `/login?redirect=${encodeURIComponent(location.pathname + location.search)}`;
}
