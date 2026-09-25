/** IT 管理系統權限目錄:職級權限 / 部門限制 / 權限試算三個 Tab 共用 */
import { computed, ref, shallowRef } from 'vue';
import { http } from '@/api/http';
import type { RbacCatalog } from '@/api/types';

const data = shallowRef<RbacCatalog | null>(null);
const loading = ref(false);
const error = ref<Error | null>(null);
let loadedAt = 0;

async function load(force = false) {
  if (!force && data.value && Date.now() - loadedAt < 30_000) return;
  loading.value = true;
  error.value = null;
  try {
    data.value = await http.get<RbacCatalog>('/rbac/catalog');
    loadedAt = Date.now();
  } catch (e) {
    error.value = e as Error;
  } finally {
    loading.value = false;
  }
}

export function useRbacCatalog() {
  load();
  const byModule = computed(() =>
    (data.value?.modules ?? []).map((m) => ({ ...m, perms: (data.value?.permissions ?? []).filter((p) => p.module === m.code) })).filter((m) => m.perms.length),
  );
  return { data, loading, error, byModule, reload: () => load(true) };
}
