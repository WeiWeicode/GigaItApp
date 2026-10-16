<script setup lang="ts">
/**
 * 主框架:左側兩層選單(群組 → 功能,依 Gateway 權限過濾,api/auth.ts)、上方列(麵包屑、通知鈴鐺、主題、應用切換、使用者)、內容區。
 * 通知(Gateway NOTIFY-PLAN):NotifyHost 連 /ws/notify?app=itapp,新公告以 Toast / 對話框提示;鈴鐺顯示未讀數。
 * 頁面內的第三層切換使用 Tab(見 TabbedPage.vue)。窄螢幕時選單改為抽屜。
 * 側欄收合時只顯示群組圖示,滑鼠移上(或鍵盤聚焦、點擊)在右側浮出該群組的功能清單。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useAuth } from '@/api/auth';
import NotifyBell from '@/components/notify/NotifyBell.vue';
import NotifyHost from '@/components/notify/NotifyHost.vue';
import { appsOf, CURRENT_APP } from '@/composables/apps';
import { useTheme } from '@/composables/theme';

const { me, menus, logout } = useAuth();
const { theme, toggle } = useTheme();
const route = useRoute();

const COLLAPSE_KEY = 'itapp.sidebar.collapsed';
const collapsed = ref(readCollapsed());
function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
watch(collapsed, (v) => {
  flyout.value = null;
  try {
    localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* 無法保存時只影響下次開啟 */
  }
});
const drawer = ref(false);
const openGroups = ref<Set<string>>(new Set(menus.value.map((g) => g.key)));
const userMenu = ref(false);

const activeItem = computed(() => {
  for (const g of menus.value) for (const c of g.children) if (route.path === c.path || route.path.startsWith(`${c.path}/`)) return { group: g, item: c };
  return null;
});
const crumbs = computed(() => {
  const out: string[] = [];
  if (activeItem.value) out.push(activeItem.value.group.title, activeItem.value.item.title);
  const tab = route.meta.tab as string | undefined;
  if (tab) out.push(tab);
  else if (!activeItem.value && route.meta.title) out.push(route.meta.title as string);
  return out;
});

function toggleGroup(key: string) {
  const s = new Set(openGroups.value);
  if (s.has(key)) s.delete(key);
  else s.add(key);
  openGroups.value = s;
}

// ---- 收合時的浮出選單 ----
const flyout = ref<{ key: string; top: number; left: number } | null>(null);
const flyoutGroup = computed(() => menus.value.find((g) => g.key === flyout.value?.key) ?? null);
let closeTimer: ReturnType<typeof setTimeout> | undefined;
/** 抽屜模式(窄螢幕)下側欄已展開,不需浮出選單 */
const flyoutEnabled = () => collapsed.value && !matchMedia('(max-width: 960px)').matches;

function openFlyout(key: string, el: HTMLElement) {
  if (!flyoutEnabled()) return;
  clearTimeout(closeTimer);
  const r = el.getBoundingClientRect();
  const count = menus.value.find((g) => g.key === key)?.children.length ?? 0;
  // 預估高度,避免超出視窗底部
  const height = 56 + count * 42;
  flyout.value = { key, top: Math.max(8, Math.min(r.top - 6, innerHeight - height - 8)), left: r.right + 10 };
}
function scheduleClose() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => (flyout.value = null), 180);
}
function keepOpen() {
  clearTimeout(closeTimer);
}
/** 收合時點擊只負責打開(滑鼠移入與聚焦時已打開,不做切換以免一點就關);關閉靠移開、Esc 或換頁 */
function onGroupClick(key: string, el: HTMLElement) {
  if (!flyoutEnabled()) return toggleGroup(key);
  openFlyout(key, el);
}
onBeforeUnmount(() => clearTimeout(closeTimer));

watch(
  () => route.fullPath,
  () => {
    drawer.value = false;
    userMenu.value = false;
    flyout.value = null;
    if (activeItem.value) openGroups.value = new Set([...openGroups.value, activeItem.value.group.key]);
  },
);

// 應用切換:Gateway /api/auth/me 的 apps(單一入口,切換不需再登入)
const apps = computed(() => appsOf(me.value));

/** 登出:web-kit 呼叫 BFF 登出後導向入口網登入頁 */
const doLogout = () => logout();
</script>

<template>
  <div class="shell" :class="{ collapsed, drawer }">
    <div class="scrim" @click="drawer = false" />
    <aside class="sidebar glass">
      <div class="brand">
        <GLogo :size="40" />
        <div class="brand-text">
          <strong>GigaNexus</strong>
          <span>IT 管理系統</span>
        </div>
      </div>

      <nav class="nav" aria-label="主選單">
        <div
          v-for="g in menus"
          :key="g.key"
          class="group"
          :class="{ open: openGroups.has(g.key), current: activeItem?.group.key === g.key, hover: flyout?.key === g.key }"
          @mouseenter="openFlyout(g.key, ($event.currentTarget as HTMLElement).querySelector('.group-btn')!)"
          @mouseleave="scheduleClose"
        >
          <button
            type="button"
            class="group-btn"
            :aria-expanded="collapsed ? flyout?.key === g.key : openGroups.has(g.key)"
            :aria-haspopup="collapsed ? 'menu' : undefined"
            @click="onGroupClick(g.key, $event.currentTarget as HTMLElement)"
            @focus="openFlyout(g.key, $event.currentTarget as HTMLElement)"
            @keydown.esc="flyout = null"
          >
            <span class="gi"><GIcon :name="g.icon" :size="19" /></span>
            <span class="gt">{{ g.title }}</span>
            <GIcon name="chevron-down" :size="15" class="chev" />
          </button>
          <div class="items">
            <div class="items-inner">
              <RouterLink v-for="c in g.children" :key="c.key" :to="c.path" class="item" :class="{ active: activeItem?.item.key === c.key }">
                <i class="bullet" />
                <span>{{ c.title }}</span>
              </RouterLink>
            </div>
          </div>
        </div>
      </nav>

      <div class="side-foot">
        <button type="button" class="collapse-btn" :aria-label="collapsed ? '展開選單' : '收合選單'" @click="collapsed = !collapsed">
          <GIcon :name="collapsed ? 'panel-open' : 'panel-close'" :size="18" />
          <span class="gt">收合選單</span>
        </button>
      </div>
    </aside>

    <div class="main-col">
      <header class="topbar glass">
        <GButton class="burger" variant="ghost" square icon="menu" aria-label="開啟選單" @click="drawer = true" />
        <ol class="crumbs" aria-label="目前位置">
          <li v-for="(c, i) in crumbs" :key="i" :class="{ last: i === crumbs.length - 1 }">{{ c }}</li>
        </ol>
        <div class="spacer" />
        <NotifyBell />
        <GButton
          variant="ghost"
          square
          :icon="theme === 'dark' ? 'sun' : 'moon'"
          :aria-label="theme === 'dark' ? '切換明亮模式' : '切換黑暗模式'"
          @click="toggle"
        />
        <GAppSwitcher :apps="apps" :current="CURRENT_APP" />
        <div class="user" @keydown.esc="userMenu = false">
          <button type="button" class="user-btn" :aria-expanded="userMenu" @click="userMenu = !userMenu">
            <GAvatar :name="me?.user.name ?? '?'" :size="34" />
            <span class="who hide-sm">
              <strong>{{ me?.user.name }}</strong>
              <span>{{ me?.user.department ?? '未指定部門' }}{{ me?.user.title ? ` · ${me.user.title}` : '' }}</span>
            </span>
            <GIcon name="chevron-down" :size="15" class="faint" />
          </button>
          <Transition name="pop">
            <div v-if="userMenu" class="menu glass glass-edge" role="menu">
              <div class="menu-head">
                <GAvatar :name="me?.user.name ?? '?'" :size="42" />
                <div>
                  <strong>{{ me?.user.name }}</strong>
                  <div class="faint small mono">{{ me?.user.employeeNo }}</div>
                </div>
              </div>
              <div class="menu-tags">
                <GBadge tone="primary" icon="building">{{ me?.user.department ?? '未指定部門' }}</GBadge>
                <GBadge tone="violet" icon="shield">{{ me?.roles.length }} 個角色</GBadge>
                <GBadge tone="cyan" icon="key">{{ me?.permissions.length }} 項權限</GBadge>
              </div>
              <a class="menu-item" role="menuitem" href="/"><GIcon name="home" />回員工入口網</a>
              <button type="button" class="menu-item" role="menuitem" @click="toggle">
                <GIcon :name="theme === 'dark' ? 'sun' : 'moon'" />{{ theme === 'dark' ? '明亮模式' : '黑暗模式' }}
              </button>
              <button type="button" class="menu-item danger" role="menuitem" @click="doLogout"><GIcon name="logout" />登出</button>
            </div>
          </Transition>
          <div v-if="userMenu" class="menu-scrim" @click="userMenu = false" />
        </div>
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="page" mode="out-in">
            <component :is="Component" :key="route.matched[1]?.path" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <NotifyHost />

    <Teleport to="body">
      <Transition name="flyout">
        <div
          v-if="flyout && flyoutGroup"
          class="flyout glass glass-edge"
          role="menu"
          :aria-label="flyoutGroup.title"
          :style="{ top: `${flyout.top}px`, left: `${flyout.left}px` }"
          @mouseenter="keepOpen"
          @mouseleave="scheduleClose"
          @keydown.esc="flyout = null"
          @focusout="($event.relatedTarget as HTMLElement | null)?.closest('.flyout, .group-btn') || scheduleClose()"
        >
          <p class="fly-title"><GIcon :name="flyoutGroup.icon" :size="15" />{{ flyoutGroup.title }}</p>
          <RouterLink
            v-for="c in flyoutGroup.children"
            :key="c.key"
            :to="c.path"
            class="fly-item"
            :class="{ active: activeItem?.item.key === c.key }"
            role="menuitem"
          >
            <i class="bullet" />{{ c.title }}
          </RouterLink>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  min-height: 100vh;
  padding: 14px;
  gap: 14px;
}
.sidebar {
  position: sticky;
  top: 14px;
  flex: none;
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  height: calc(100vh - 28px);
  border-radius: var(--radius-xl);
  transition: width 280ms var(--ease);
  overflow: hidden;
  z-index: 20;
}
.collapsed .sidebar {
  width: var(--sidebar-w-collapsed);
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 18px 16px;
}
.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
  white-space: nowrap;
}
.brand-text strong {
  font-size: var(--fs-lg);
  letter-spacing: -0.01em;
}
.brand-text span {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.nav {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 12px;
}
.group {
  margin-bottom: 4px;
}
.group-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 44px;
  padding: 0 10px;
  border: 0;
  border-radius: 12px;
  background: none;
  font: inherit;
  font-weight: 650;
  color: var(--text-2);
  cursor: pointer;
  white-space: nowrap;
  transition:
    background var(--dur),
    color var(--dur);
}
.group-btn:hover {
  background: var(--glass-soft);
  color: var(--text);
}
.group.current .group-btn {
  color: var(--text);
}
.gi {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  transition: all var(--dur);
}
.group.current .gi {
  color: #fff;
  background: var(--grad-brand);
  box-shadow: 0 6px 18px rgb(99 102 241 / 0.4);
}
.gt {
  flex: 1;
  text-align: left;
  overflow: hidden;
}
.chev {
  transition: transform var(--dur) var(--ease);
  color: var(--text-3);
}
.group.open .chev {
  transform: rotate(180deg);
}
.items {
  display: grid;
  grid-template-rows: 0fr;
  transition: grid-template-rows 280ms var(--ease);
}
.group.open .items {
  grid-template-rows: 1fr;
}
.items-inner {
  overflow: hidden;
  padding-left: 26px;
  position: relative;
}
.items-inner::before {
  content: '';
  position: absolute;
  left: 25px;
  top: 4px;
  bottom: 8px;
  width: 1px;
  background: var(--line-strong);
}
.item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  margin: 2px 0;
  padding: 0 12px 0 18px;
  border-radius: 10px;
  color: var(--text-2);
  font-weight: 550;
  white-space: nowrap;
  text-decoration: none;
  transition: all var(--dur);
}
.item:hover {
  color: var(--text);
  background: var(--glass-soft);
  text-decoration: none;
}
.bullet {
  position: absolute;
  left: -4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--bg);
  border: 1.5px solid var(--line-strong);
  transition: all var(--dur);
}
.item.active {
  color: var(--text);
  background: var(--glass-strong);
  box-shadow:
    var(--shadow-sm),
    inset 0 0 0 1px var(--glass-border-2);
}
.item.active .bullet {
  background: var(--c-primary);
  border-color: var(--c-primary);
  box-shadow: 0 0 0 4px rgb(99 102 241 / 0.2);
}
/* 收合:只顯示群組圖示,子項目以浮出方式隱藏 */
.collapsed .brand-text,
.collapsed .gt,
.collapsed .chev,
.collapsed .items {
  display: none;
}
.collapsed .group-btn {
  justify-content: center;
  padding: 0;
}
.collapsed .group.hover .group-btn {
  background: var(--glass-soft);
  color: var(--text);
}
/* 浮出選單(Teleport 到 body,以 fixed 定位在收合側欄右側) */
.flyout {
  position: fixed;
  z-index: 40;
  min-width: 200px;
  padding: 8px;
  border-radius: var(--radius-md);
  background: var(--glass-strong);
  box-shadow: var(--shadow-lg);
}
/* 側欄與浮出選單之間的空隙也算在滑鼠範圍內,移過去不會關閉 */
.flyout::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  width: 14px;
}
.fly-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 2px 8px 6px;
  font-size: var(--fs-xs);
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--text-3);
}
.fly-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 38px;
  padding: 0 12px;
  border-radius: 10px;
  color: var(--text-2);
  font-weight: 550;
  white-space: nowrap;
  text-decoration: none;
  transition: all var(--dur);
}
.fly-item .bullet {
  position: static;
}
.fly-item:hover,
.fly-item:focus-visible {
  color: var(--text);
  background: var(--glass-soft);
  text-decoration: none;
}
.fly-item.active {
  color: var(--text);
  background: var(--glass-hover);
  box-shadow: inset 0 0 0 1px var(--glass-border-2);
}
.fly-item.active .bullet {
  background: var(--c-primary);
  border-color: var(--c-primary);
  box-shadow: 0 0 0 4px rgb(99 102 241 / 0.2);
}
.flyout-enter-active,
.flyout-leave-active {
  transition:
    opacity 160ms var(--ease),
    transform 160ms var(--ease);
}
.flyout-enter-from,
.flyout-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
.collapsed .brand {
  justify-content: center;
  padding-inline: 0;
}
.side-foot {
  padding: 10px 12px 14px;
  border-top: 1px solid var(--line);
}
.collapse-btn {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  height: 40px;
  padding: 0 16px;
  border: 0;
  border-radius: 10px;
  background: none;
  color: var(--text-3);
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
}
.collapsed .collapse-btn {
  justify-content: center;
  padding: 0;
}
.collapse-btn:hover {
  color: var(--text);
  background: var(--glass-soft);
}

.main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.topbar {
  position: sticky;
  top: 14px;
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 10px;
  height: var(--topbar-h);
  padding: 0 12px 0 20px;
  border-radius: var(--radius-lg);
}
.burger {
  display: none;
}
.crumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: var(--fs-sm);
  color: var(--text-3);
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.crumbs li + li::before {
  content: '/';
  margin-right: 8px;
  opacity: 0.5;
}
.crumbs .last {
  color: var(--text);
  font-weight: 650;
}
.user {
  position: relative;
}
.user-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px 4px 4px;
  border: 0;
  border-radius: 14px;
  background: none;
  font: inherit;
  color: var(--text);
  cursor: pointer;
}
.user-btn:hover {
  background: var(--glass-soft);
}
.who {
  display: flex;
  flex-direction: column;
  text-align: left;
  line-height: 1.25;
}
.who strong {
  font-size: var(--fs-sm);
}
.who span {
  font-size: var(--fs-xs);
  color: var(--text-3);
}
.menu {
  position: absolute;
  right: 0;
  top: calc(100% + 10px);
  z-index: 30;
  width: 280px;
  padding: 8px;
  background: var(--glass-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
}
.menu-scrim {
  position: fixed;
  inset: 0;
  z-index: 25;
}
.menu-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
}
.menu-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 10px 10px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 6px;
}
.menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  height: 40px;
  padding: 0 12px;
  border: 0;
  border-radius: 10px;
  background: none;
  font: inherit;
  color: var(--text);
  cursor: pointer;
}
a.menu-item {
  text-decoration: none;
}
.menu-item:hover {
  background: var(--glass-soft);
}
.menu-item.danger {
  color: var(--c-danger);
}
.pop-enter-active,
.pop-leave-active {
  transition: all 180ms var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
.content {
  flex: 1;
  min-width: 0;
  padding: 6px 6px 24px;
}
.scrim {
  display: none;
}

@media (max-width: 960px) {
  .shell {
    padding: 10px;
  }
  .sidebar {
    position: fixed;
    top: 10px;
    left: 10px;
    bottom: 10px;
    height: auto;
    width: var(--sidebar-w) !important;
    transform: translateX(-110%);
    transition: transform 300ms var(--ease);
    background: var(--glass-strong);
  }
  .drawer .sidebar {
    transform: none;
  }
  .drawer .scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 19;
    background: var(--overlay);
    backdrop-filter: blur(4px);
  }
  .collapsed .brand-text,
  .collapsed .gt,
  .collapsed .chev {
    display: initial;
  }
  .collapsed .items {
    display: grid;
  }
  .side-foot {
    display: none;
  }
  .burger {
    display: inline-flex;
  }
  .topbar {
    top: 10px;
    padding-left: 8px;
  }
  .content {
    padding: 2px 0 20px;
  }
}
@media (max-width: 760px) {
  .hide-sm {
    display: none;
  }
}
</style>
