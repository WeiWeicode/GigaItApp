/**
 * 部門權限 / 個人權限共用:應用選擇 + 該應用的權限樹(應用 → 選單 → Tab → 按鈕,層數不限)攤平成表格列。
 *   GET /api/admin/apps、/api/admin/permissions?tree=1&app=
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

export function useAppPermTree() {
  const apps = useAsync(() => rbac.apps());
  const app = ref('');
  watch(
    () => apps.data.value,
    (a) => {
      if (!app.value && a?.items[0]) app.value = a.items.find((x) => x.code === 'it')?.code ?? a.items[0].code;
    },
  );
  const appOptions = computed(() => (apps.data.value?.items ?? []).map((a) => ({ label: `${a.name}(${a.basePath})`, value: a.code })));
  const tree = useAsync(() => rbac.permissionTree(app.value), { immediate: false });
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
