/**
 * 登入狀態與權限(全域單例):啟動時呼叫一次 GET /it/api/auth/me 並快取。
 * 前端依權限隱藏按鈕只是使用體驗,真正的檢查在 itapp-api(每支寫入 API 都會再檢查)。
 */
import { computed, reactive } from 'vue';
import { ApiError, http, setUnauthenticatedHandler } from './http';

export interface MenuItem {
  key: string;
  title: string;
  path: string;
  permission: string;
}
export interface MenuGroup {
  key: string;
  title: string;
  icon: string;
  children: MenuItem[];
}
export interface Me {
  user: { id: number; employeeNo: string; name: string; email: string | null; title: string | null; lastLoginAt: string | null };
  department: { code: string; name: string } | null;
  level: { code: 'admin' | 'manager' | 'senior' | 'engineer'; name: string; rank: number };
  permissions: string[];
  menus: MenuGroup[];
  dataScope: 'all' | 'dept';
}

const state = reactive<{ me: Me | null; loading: Promise<Me | null> | null }>({ me: null, loading: null });
const permSet = computed(() => new Set(state.me?.permissions ?? []));

export async function loadMe(force = false): Promise<Me | null> {
  if (state.me && !force) return state.me;
  state.loading ??= http
    .get<Me>('/auth/me', { silent401: true })
    .then((me) => (state.me = me))
    .catch((e: unknown) => {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return (state.me = null);
      throw e;
    })
    .finally(() => (state.loading = null));
  return state.loading;
}

export async function login(username: string, password: string): Promise<Me> {
  const me = await http.post<Me>('/auth/login', { username, password }, { silent401: true });
  state.me = me;
  return me;
}

export async function logout(): Promise<void> {
  await http.post('/auth/logout', undefined, { silent401: true }).catch(() => undefined);
  state.me = null;
}

export function clearSession(): void {
  state.me = null;
}

export function can(code: string): boolean {
  return permSet.value.has(code);
}

export function useAuth() {
  return {
    me: computed(() => state.me),
    user: computed(() => state.me?.user ?? null),
    menus: computed(() => state.me?.menus ?? []),
    can,
    loadMe,
    login,
    logout,
  };
}

/** 由 main.ts 呼叫:401 時清除狀態並導向登入頁(保留目前位置) */
export function installAuthRedirect(goLogin: () => void): void {
  setUnauthenticatedHandler(() => {
    if (!state.me) return;
    state.me = null;
    goLogin();
  });
}
