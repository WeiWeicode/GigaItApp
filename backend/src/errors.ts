/**
 * 錯誤格式 { code, message, requestId, details? }(AGENT.md §5)。
 * 代碼一律以 ITAPP_ 開頭,新增代碼先登記在此表;前端依 code 判斷,message 可直接顯示。
 */
export const ERROR_CODES = {
  ITAPP_VALIDATION_FAILED: [400, '參數驗證失敗'],
  ITAPP_UNAUTHENTICATED: [401, '請先登入'],
  ITAPP_INTERNAL_TOKEN_INVALID: [401, '內部 Token 無效'],
  ITAPP_LOGIN_FAILED: [401, '帳號或密碼錯誤'],
  ITAPP_PERMISSION_DENIED: [403, '您沒有此功能的權限'],
  ITAPP_DATA_ACCESS_DENIED: [403, '您沒有此筆資料的權限'],
  ITAPP_CSRF_INVALID: [403, '頁面已過期,請重新整理'],
  ITAPP_ACCOUNT_DISABLED: [403, '帳號已停用,請洽 IT 主管'],
  ITAPP_ACCOUNT_LOCKED: [423, '登入失敗次數過多,請 15 分鐘後再試'],
  ITAPP_NOT_FOUND: [404, '找不到資料'],
  ITAPP_CONFLICT: [409, '資料已存在或已被修改'],
  ITAPP_BFF_NOT_SUPPORTED: [501, 'Gateway BFF 尚未提供此管理 API'],
  ITAPP_BFF_UNAVAILABLE: [502, 'Gateway BFF 暫時無法連線'],
  ITAPP_INTERNAL_ERROR: [500, '系統發生錯誤'],
} as const satisfies Record<string, readonly [number, string]>;

export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message ?? ERROR_CODES[code][1]);
    this.status = ERROR_CODES[code][0];
  }
}

export function errorBody(code: string, message: string, requestId: string, details?: unknown) {
  return details === undefined ? { code, message, requestId } : { code, message, requestId, details };
}
