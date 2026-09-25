/** BFF 權限資料:矩陣 / 反查 / 關係圖三個 Tab 共用(30 秒內切換不重打 API;儲存後強制重新載入) */
import { computed, ref, shallowRef } from 'vue';
import { http } from '@/api/http';
import type { BffRbac } from '@/api/types';

const data = shallowRef<BffRbac | null>(null);
const loading = ref(false);
const error = ref<Error | null>(null);
let loadedAt = 0;

async function load(force = false) {
  if (!force && data.value && Date.now() - loadedAt < 30_000) return;
  loading.value = true;
  error.value = null;
  try {
    data.value = await http.get<BffRbac>('/bff/rbac', { query: { refresh: force ? 1 : undefined } });
    loadedAt = Date.now();
  } catch (e) {
    error.value = e as Error;
  } finally {
    loading.value = false;
  }
}

export function useBffRbac() {
  load();
  /** role → Set(permission) */
  const grants = computed(() => {
    const m = new Map<string, Set<string>>();
    for (const rp of data.value?.rolePermissions ?? []) {
      if (!m.has(rp.role)) m.set(rp.role, new Set());
      m.get(rp.role)!.add(rp.permission);
    }
    return m;
  });
  /** 依系統分組的權限 */
  const bySystem = computed(() => {
    const g = new Map<string, BffRbac['permissions']>();
    for (const p of data.value?.permissions ?? []) {
      if (!g.has(p.systemCode)) g.set(p.systemCode, []);
      g.get(p.systemCode)!.push(p);
    }
    return [...g.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([system, perms]) => ({ system, perms: perms.sort((a, b) => a.code.localeCompare(b.code)) }));
  });
  return { data, loading, error, grants, bySystem, reload: () => load(true) };
}
