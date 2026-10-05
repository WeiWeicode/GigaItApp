/**
 * 部門權限 / 個人權限共用:應用選擇 + 該應用的權限樹(應用 → 選單 → Tab → 按鈕,層數不限)攤平成表格列。
 *   GET /api/admin/apps、/api/admin/permissions?tree=1&app=
 * 另有 API_SCOPE(「API 權限」):沒有畫面的純 API 權限(含寫入),依系統分組(系統列只是分組標題,不可授予)。
 */
import { computed, ref, watch } from 'vue';
import { rbac, type PermNode } from '@/api/admin';
import { useAsync } from './useAsync';

export const KIND: Record<string, { label: string; tone: string }> = {
  app: { label: '應用', tone: 'success' },
  group: { label: '目錄', tone: 'neutral' },
  menu: { label: '選單', tone: 'primary' },
  tab: { label: 'Tab', tone: 'cyan' },
  button: { label: '按鈕', tone: 'violet' },
  api: { label: 'API', tone: 'neutral' },
};

/** ancestors:可授予的上層(略過選單目錄 group);descendants:全部下層 */
export type FlatPerm = { node: PermNode; depth: number; ancestors: string[]; descendants: string[] };
/** 選單目錄只用來分組與命名,不可授予(Gateway PRD §8.3.4) */
export const isGroup = (n: { kind: string }) => n.kind === 'group';

/** app 的特殊值:純 API 權限(BFF grants API 同值) */
export const API_SCOPE = '@api';

/** 純 API 權限依系統分組成樹:系統為分組列(kind = group,不可授予) */
async function apiTree(): Promise<{ items: PermNode[] }> {
  const items = (await rbac.permissions()).items.filter((p) => p.kind === 'api');
  const bySys = new Map<string, PermNode[]>();
  for (const p of items.sort((a, b) => a.code.localeCompare(b.code)))
    bySys.set(p.systemCode, [...(bySys.get(p.systemCode) ?? []), { code: p.code, name: p.name, kind: 'api', sort: null, children: [] }]);
  return {
    items: [...bySys.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sys, children]) => ({ code: `${API_SCOPE}.${sys}`, name: `系統 ${sys}`, kind: 'group', sort: null, children })),
  };
}

export function useAppPermTree() {
  const apps = useAsync(() => rbac.apps());
  const app = ref('');
  watch(
    () => apps.data.value,
    (a) => {
      if (!app.value && a?.items[0]) app.value = a.items.find((x) => x.code === 'it')?.code ?? a.items[0].code;
    },
  );
  const appOptions = computed(() => [
    ...(apps.data.value?.items ?? []).map((a) => ({ label: `${a.name}(${a.basePath})`, value: a.code })),
    { label: 'API 權限(無畫面,含寫入)', value: API_SCOPE },
  ]);
  const tree = useAsync(() => (app.value === API_SCOPE ? apiTree() : rbac.permissionTree(app.value)), { immediate: false });
  watch(app, (v) => v && tree.reload());

  const flat = computed<FlatPerm[]>(() => {
    const out: FlatPerm[] = [];
    const desc = (n: PermNode): string[] => n.children.flatMap((c) => [c.code, ...desc(c)]);
    const walk = (l: PermNode[], depth: number, ancestors: string[]) =>
      l.forEach((n) => {
        out.push({ node: n, depth, ancestors, descendants: desc(n) });
        walk(n.children, depth + 1, isGroup(n) ? ancestors : [...ancestors, n.code]);
      });
    walk(tree.data.value?.items ?? [], 0, []);
    return out;
  });

  return { apps, app, appOptions, tree, flat };
}
