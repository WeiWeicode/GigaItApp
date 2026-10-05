<script setup lang="ts">
/**
 * 選單管理(Gateway PRD §8.3.4):各應用的「應用 → 選單 → Tab → 按鈕」權限清單,改名稱 / 排序 / 上層 / 說明,新增或刪除。
 *   資料:GET /api/admin/apps、/api/admin/permissions(清單模式,含 rowVer)
 *   寫入:POST /api/admin/permissions、PATCH/DELETE /api/admin/permissions/:code(需 gw.admin.rbac.write)
 * 程式(gateway-rbac.yaml / OpenAPI x-permissions)只負責首次登記;登記後以此頁為準,CI 套用不再覆寫名稱、上層與排序。
 * 名稱會出現在權限設定與 /api/auth/me 的 menus,本系統的側欄與頁首也以它為準。要授予誰請到「權限設定」。
 */
import { computed, reactive, ref, watch } from 'vue';
import { rbac, type Permission } from '@/api/admin';
import { can, UI } from '@/api/auth';
import { describeError } from '@/api/http';
import { KIND } from '@/composables/appPermTree';
import { ICON_NAMES } from '@/ui/icons';
import { useAsync } from '@/composables/useAsync';
import { confirm, toast } from '@/ui';

const apps = useAsync(() => rbac.apps());
const app = ref('');
watch(
  () => apps.data.value,
  (a) => {
    if (!app.value && a?.items[0]) app.value = a.items.find((x) => x.code === 'it')?.code ?? a.items[0].code;
  },
);
const appOptions = computed(() => (apps.data.value?.items ?? []).map((a) => ({ label: `${a.name}(${a.basePath})`, value: a.code })));
const perms = useAsync(() => rbac.permissions());

type Row = { p: Permission; depth: number; descendants: string[] };
/** 所選應用的權限樹(以應用的 app 權限為根),依 sort、代碼排序後攤平 */
const rows = computed<Row[]>(() => {
  const root = apps.data.value?.items.find((a) => a.code === app.value)?.permissionCode;
  const list = perms.data.value?.items ?? [];
  const byCode = new Map(list.map((p) => [p.code, p]));
  if (!root || !byCode.has(root)) return [];
  const children = new Map<string, Permission[]>();
  for (const p of list) if (p.parentCode && p.parentCode !== p.code) children.set(p.parentCode, [...(children.get(p.parentCode) ?? []), p]);
  const order = (a: Permission, b: Permission) => (a.sort ?? 32767) - (b.sort ?? 32767) || a.code.localeCompare(b.code);
  const desc = (code: string, seen = new Set<string>()): string[] =>
    (children.get(code) ?? []).flatMap((c) => (seen.has(c.code) ? [] : (seen.add(c.code), [c.code, ...desc(c.code, seen)])));
  const out: Row[] = [];
  const walk = (p: Permission, depth: number, seen: Set<string>) => {
    if (seen.has(p.code)) return;
    seen.add(p.code);
    out.push({ p, depth, descendants: desc(p.code) });
    [...(children.get(p.code) ?? [])].sort(order).forEach((c) => walk(c, depth + 1, seen));
  };
  walk(byCode.get(root)!, 0, new Set());
  return out;
});

const KIND_OPTIONS = [
  { label: '目錄(只分組,不可授予)', value: 'group' },
  { label: '選單', value: 'menu' },
  { label: 'Tab', value: 'tab' },
  { label: '按鈕', value: 'button' },
];
const canWrite = computed(() => can(UI.menuEdit));
const reload = () => Promise.all([perms.reload(), apps.reload()]);

// ---- 新增 / 編輯 ----
const modal = ref<'add' | 'edit' | null>(null);
const editing = ref<Permission | null>(null);
const form = reactive({ code: '', name: '', kind: 'menu', parentCode: '', sort: '', description: '', icon: '' });
/** 圖示用於應用 / 目錄 / 選單(Tab、按鈕不顯示圖示) */
const ICON_OPTIONS = [{ label: '(不設定)', value: '' }, ...ICON_NAMES.map((n) => ({ label: n, value: n }))];
const showIcon = computed(() => ['app', 'group', 'menu'].includes(form.kind));
// ---- 綁定的 API 權限(擁有此節點即一併擁有;選單只能綁讀取,Tab / 按鈕不限) ----
const includes = ref<Set<string>>(new Set());
const showIncludes = computed(() => ['menu', 'tab', 'button'].includes(form.kind));
const incQ = ref('');
const allSystems = ref(false);
const systemOf = (code: string) => code.split('.')[0]!;
/** 此應用相關的系統:應用本身的系統,加上此應用其他節點已綁定的 API 所屬系統(例:IT 管理系統 → it、gw) */
const relatedSystems = computed(() => {
  const out = new Set<string>();
  if (rows.value[0]) out.add(systemOf(rows.value[0].p.code));
  for (const r of rows.value) for (const c of r.p.includes ?? []) out.add(systemOf(c));
  return out;
});
/** 已綁定此 API 的其他節點(顯示用) */
const boundBy = computed(() => {
  const m = new Map<string, string[]>();
  for (const r of rows.value) for (const c of r.p.includes ?? []) if (r.p.code !== editing.value?.code) m.set(c, [...(m.get(c) ?? []), r.p.name]);
  return m;
});
const readApis = computed(() =>
  (perms.data.value?.items ?? [])
    .filter((p) => p.kind === 'api' && (form.kind !== 'menu' || p.code.endsWith('.read')))
    .filter((p) => allSystems.value || relatedSystems.value.has(p.systemCode) || includes.value.has(p.code))
    .filter((p) => !incQ.value.trim() || p.code.includes(incQ.value.trim()) || p.name.includes(incQ.value.trim()))
    .sort((a, b) => a.code.localeCompare(b.code)),
);
function toggleInclude(code: string, on: boolean) {
  const s = new Set(includes.value);
  if (on) s.add(code);
  else s.delete(code);
  includes.value = s;
}
const sameSet = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
const saving = ref(false);
const isRoot = computed(() => editing.value?.kind === 'app');
/** 上層選項:不可選自己與自己的下層(避免循環) */
const parentOptions = computed(() => {
  const self = editing.value ? rows.value.find((r) => r.p.code === editing.value!.code) : null;
  const banned = new Set(self ? [self.p.code, ...self.descendants] : []);
  // 目錄只能掛在應用或其他目錄底下
  const allowed = form.kind === 'group' ? ['app', 'group'] : ['app', 'group', 'menu', 'tab'];
  return rows.value
    .filter((r) => !banned.has(r.p.code) && allowed.includes(r.p.kind))
    .map((r) => ({ label: `${'　'.repeat(r.depth)}${r.p.name}(${r.p.code})`, value: r.p.code }));
});
function openAdd(parent?: Permission) {
  const p = parent ?? rows.value[0]?.p;
  editing.value = null;
  Object.assign(form, {
    code: `${p ? p.code.split('.')[0] : app.value}.`,
    name: '',
    kind: p && p.kind === 'menu' ? 'tab' : p && p.kind === 'tab' ? 'button' : 'menu',
    parentCode: p?.code ?? '',
    sort: '',
    description: '',
    icon: '',
  });
  includes.value = new Set();
  incQ.value = '';
  allSystems.value = false;
  modal.value = 'add';
}
function openEdit(p: Permission) {
  editing.value = p;
  Object.assign(form, {
    code: p.code,
    name: p.name,
    kind: p.kind,
    parentCode: p.parentCode ?? '',
    sort: p.sort === null ? '' : String(p.sort),
    description: p.description ?? '',
    icon: p.icon ?? '',
  });
  includes.value = new Set(p.includes ?? []);
  incQ.value = '';
  allSystems.value = false;
  modal.value = 'edit';
}
async function submit() {
  saving.value = true;
  try {
    const sort = form.sort.trim() === '' ? null : Number(form.sort);
    const description = form.description.trim() || null;
    const icon = showIcon.value ? form.icon || null : null;
    if (modal.value === 'add') {
      await rbac.createPermission({
        code: form.code.trim(),
        name: form.name.trim(),
        kind: form.kind,
        parentCode: form.parentCode || null,
        sort,
        description,
        icon,
      });
      if (showIncludes.value && includes.value.size) await rbac.setIncludes(form.code.trim(), [...includes.value]);
      toast.success('已新增', form.code.trim());
    } else {
      const p = editing.value!;
      const body: Parameters<typeof rbac.updatePermission>[2] = {};
      if (form.name.trim() !== p.name) body.name = form.name.trim();
      if (description !== (p.description ?? null)) body.description = description;
      if (sort !== p.sort) body.sort = sort;
      if (icon !== (p.icon ?? null)) body.icon = icon;
      if (!isRoot.value) {
        if (form.kind !== p.kind) body.kind = form.kind;
        if ((form.parentCode || null) !== p.parentCode) body.parentCode = form.parentCode || null;
      }
      const includesChanged = showIncludes.value && !sameSet(includes.value, p.includes ?? []);
      if (!Object.keys(body).length && !includesChanged) {
        modal.value = null;
        return;
      }
      if (Object.keys(body).length) await rbac.updatePermission(p.code, p.rowVer, body);
      // 隨附權限變更:擁有此選單的人下次請求即生效(全體權限版本遞增)
      if (includesChanged) await rbac.setIncludes(p.code, [...includes.value]);
      toast.success('已儲存', body.name ? `${p.name} → ${body.name}(使用者約 5 分鐘內或重新整理後看到新名稱)` : p.code);
    }
    modal.value = null;
    await perms.reload();
  } catch (e) {
    toast.fromError(e, '儲存失敗');
  } finally {
    saving.value = false;
  }
}
async function remove(r: Row) {
  if (r.descendants.length) {
    toast.error('請先刪除下層', `「${r.p.name}」底下還有 ${r.descendants.length} 項`);
    return;
  }
  const ok = await confirm({
    title: `刪除「${r.p.name}」?`,
    message: `${r.p.code} 會一併從所有角色、部門與個人權限移除;仍被 API 路由或應用使用時無法刪除。`,
    confirmText: '刪除',
    tone: 'danger',
  });
  if (!ok) return;
  try {
    await rbac.deletePermission(r.p.code, r.p.rowVer);
    toast.success('已刪除', r.p.code);
    await perms.reload();
  } catch (e) {
    toast.fromError(e, '刪除失敗');
  }
}
const loadError = computed(() => apps.error.value ?? perms.error.value);
</script>

<template>
  <div class="stack" style="--gap: 16px">
    <Teleport to="#page-actions" defer>
      <GButton icon="refresh" @click="reload">重新整理</GButton>
      <GButton v-if="canWrite" variant="primary" icon="plus" :disabled="!rows.length" @click="openAdd()">新增</GButton>
    </Teleport>

    <GCard padding="sm">
      <div class="row">
        <span class="muted small">應用</span>
        <GSelect v-model="app" :options="appOptions" icon="apps" />
        <span class="spacer" />
        <span class="faint xs">新增的代碼要由應用前端以同一代碼控制顯示才有作用;授予對象請到「權限設定」</span>
      </div>
    </GCard>

    <GCard v-if="loadError">
      <GEmpty tone="danger" icon="list" title="無法載入選單" :description="describeError(loadError)" />
    </GCard>
    <GCard v-else padding="none">
      <GSkeleton v-if="!perms.data.value || !apps.data.value" :lines="10" style="padding: 20px" />
      <GEmpty v-else-if="!rows.length" compact title="此應用尚未登記權限" />
      <table v-else class="tbl">
        <thead>
          <tr>
            <th>名稱 / 代碼</th>
            <th class="num">排序</th>
            <th>說明 / 綁定的 API</th>
            <th v-if="canWrite" class="ops" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.p.code">
            <td class="name" :style="{ '--depth': r.depth }">
              <GBadge :tone="KIND[r.p.kind]?.tone ?? 'neutral'" variant="outline">{{ KIND[r.p.kind]?.label ?? r.p.kind }}</GBadge>
              <GIcon v-if="r.p.icon" :name="r.p.icon" :size="16" class="muted" />
              <div class="pn">
                <span>{{ r.p.name }}</span>
                <code>{{ r.p.code }}</code>
              </div>
            </td>
            <td class="num">{{ r.p.sort ?? '—' }}</td>
            <td class="desc muted small">
              {{ r.p.description ?? '' }}
              <span v-if="r.p.includes?.length" class="incl-chips" :title="'綁定的 API:' + r.p.includes.join('、')">
                <GBadge v-for="c in r.p.includes" :key="c" tone="neutral">{{ c }}</GBadge>
              </span>
            </td>
            <td v-if="canWrite" class="ops">
              <GButton size="sm" variant="ghost" icon="edit" @click="openEdit(r.p)">編輯</GButton>
              <GButton v-if="r.p.kind !== 'button'" size="sm" variant="ghost" icon="plus" @click="openAdd(r.p)">下層</GButton>
              <GButton v-if="r.p.kind !== 'app'" size="sm" variant="ghost" square icon="x" title="刪除" @click="remove(r)" />
            </td>
          </tr>
        </tbody>
      </table>
    </GCard>

    <GModal
      :open="modal !== null"
      :title="modal === 'add' ? '新增選單 / Tab / 按鈕' : `編輯「${editing?.name}」`"
      icon="list"
      width="560px"
      @update:open="!$event && (modal = null)"
    >
      <form id="menu-form" class="stack" style="--gap: 14px" @submit.prevent="submit">
        <GSelect v-if="!isRoot" v-model="form.parentCode" label="上層" :options="parentOptions" required />
        <div class="grid" style="grid-template-columns: 1fr 140px; --gap: 12px">
          <GInput
            v-model="form.code"
            label="權限代碼"
            placeholder="例:it.report.export"
            :disabled="modal === 'edit'"
            required
            :hint="modal === 'add' ? '{系統}.{資源}.{動作},建立後不可改' : '代碼不可修改'"
          />
          <GSelect v-if="!isRoot" v-model="form.kind" label="類型" :options="KIND_OPTIONS" />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 120px; --gap: 12px">
          <GInput v-model="form.name" label="名稱" required />
          <GInput v-model="form.sort" label="排序" type="number" />
        </div>
        <div class="grid" style="grid-template-columns: 1fr 1fr; --gap: 12px">
          <GInput v-model="form.description" label="說明" />
          <div v-if="showIcon" class="icon-pick">
            <GSelect v-model="form.icon" label="圖示" :options="ICON_OPTIONS" />
            <span class="icon-preview" :title="form.icon || '未設定'"><GIcon v-if="form.icon" :name="form.icon" :size="20" /></span>
          </div>
        </div>
        <div v-if="showIncludes" class="incl-box">
          <div class="row" style="--gap: 8px; flex-wrap: wrap">
            <span class="small"
              ><b>{{ form.kind === 'menu' ? '此頁需要的 API 讀取權限' : form.kind === 'tab' ? '此 Tab 用到的 API' : '此按鈕呼叫的 API' }}</b
              >(綁定:擁有此項即一併擁有)</span
            >
            <span class="spacer" />
            <GCheckbox v-model="allSystems" label="顯示全部系統" />
            <GInput v-model="incQ" icon="search" placeholder="搜尋" clearable style="max-width: 160px" />
          </div>
          <p class="faint xs" style="margin: 0">
            {{ allSystems ? '列出全部系統的 API 權限' : `只列此應用相關的系統:${[...relatedSystems].join('、')}` }}
            · 選單只能綁讀取(.read);Tab / 按鈕可綁寫入
          </p>
          <div class="incl-list">
            <label v-for="a in readApis" :key="a.code" class="incl-item">
              <GCheckbox :model-value="includes.has(a.code)" :aria-label="a.code" @update:model-value="toggleInclude(a.code, $event)" />
              <span class="incl-text">
                <span
                  >{{ a.name }} <code class="faint xs">{{ a.code }}</code></span
                >
                <span v-if="a.routes?.length" class="routes">
                  <code v-for="r in a.routes.slice(0, 4)" :key="r.method + r.publicPath">{{ r.method }} {{ r.publicPath }}</code>
                  <span v-if="a.routes.length > 4" class="faint xs">等 {{ a.routes.length }} 支</span>
                </span>
                <span v-else class="faint xs">(尚無路由使用)</span>
                <span v-if="boundBy.get(a.code)" class="faint xs">已綁定於:{{ boundBy.get(a.code)!.join('、') }}</span>
              </span>
            </label>
            <p v-if="!readApis.length" class="faint xs" style="margin: 0">沒有符合的 API 權限</p>
          </div>
        </div>
        <p class="faint xs" style="margin: 0">
          {{
            form.kind === 'group'
              ? '目錄只用來把選單分組(名稱、排序、圖示),不需授予;底下有任一頁可見時才顯示。'
              : modal === 'add'
                ? '新權限不會自動授予任何人,建立後到「權限設定」勾選;綁定的 API 隨此項一併授予。'
                : '改名稱、圖示後,權限設定與使用 BFF 名稱的選單(例如本系統側欄)會跟著更新。'
          }}
        </p>
      </form>
      <template #footer>
        <GButton variant="ghost" @click="modal = null">取消</GButton>
        <GButton variant="primary" icon="save" type="submit" form="menu-form" :loading="saving">{{ modal === 'add' ? '新增' : '儲存' }}</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.incl-box {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.incl-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 260px;
  overflow: auto;
}
.incl-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  cursor: pointer;
}
.incl-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: var(--fs-sm);
  min-width: 0;
}
.routes {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.routes code {
  font-size: 11px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--glass);
  color: var(--text-2);
}
.incl-chips {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.icon-pick {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.icon-pick > :first-child {
  flex: 1;
}
.icon-preview {
  display: inline-grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid var(--line);
}
.tbl {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--fs-sm);
}
.tbl th {
  text-align: left;
  padding: 10px 12px;
  color: var(--text-3);
  font-weight: 600;
  border-bottom: 1px solid var(--line);
}
.tbl td {
  padding: 6px 12px;
  border-bottom: 1px solid var(--line);
  vertical-align: middle;
}
.name {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: calc(12px + var(--depth) * 22px) !important;
}
.pn {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.pn code {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.num {
  width: 70px;
  text-align: center !important;
}
.desc {
  max-width: 320px;
}
.ops {
  width: 1%;
  white-space: nowrap;
  text-align: right;
}
</style>
