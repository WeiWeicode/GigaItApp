<script setup lang="ts">
/** 全站圖示:以名稱取用(新增圖示時在 ICONS 登記,頁面不直接 import lucide) */
import * as L from 'lucide-vue-next';
import { computed, type Component } from 'vue';

const ICONS: Record<string, Component> = {
  dashboard: L.LayoutDashboard,
  gateway: L.Network,
  settings: L.Settings,
  users: L.Users,
  user: L.User,
  shield: L.ShieldCheck,
  key: L.KeyRound,
  route: L.Route,
  server: L.Server,
  layers: L.Layers,
  activity: L.Activity,
  bell: L.Bell,
  sun: L.Sun,
  moon: L.Moon,
  logout: L.LogOut,
  login: L.LogIn,
  'chevron-down': L.ChevronDown,
  'chevron-right': L.ChevronRight,
  'chevron-left': L.ChevronLeft,
  menu: L.Menu,
  search: L.Search,
  plus: L.Plus,
  edit: L.Pencil,
  lock: L.Lock,
  unlock: L.LockOpen,
  refresh: L.RefreshCw,
  download: L.Download,
  check: L.Check,
  x: L.X,
  alert: L.TriangleAlert,
  'alert-circle': L.CircleAlert,
  info: L.Info,
  clock: L.Clock,
  release: L.GitBranch,
  eye: L.Eye,
  'eye-off': L.EyeOff,
  filter: L.Funnel,
  building: L.Building2,
  sparkles: L.Sparkles,
  database: L.Database,
  'trend-up': L.ArrowUpRight,
  'trend-down': L.ArrowDownRight,
  list: L.List,
  grid: L.LayoutGrid,
  graph: L.Share2,
  external: L.ExternalLink,
  'panel-close': L.PanelLeftClose,
  'panel-open': L.PanelLeftOpen,
  rocket: L.Rocket,
  audit: L.ScrollText,
  ticket: L.Ticket,
  gauge: L.Gauge,
  zap: L.Zap,
  'user-plus': L.UserPlus,
  'user-x': L.UserX,
  'user-check': L.UserCheck,
  reset: L.RotateCcw,
  'check-circle': L.CircleCheck,
  'x-circle': L.CircleX,
  workflow: L.Workflow,
  boxes: L.Boxes,
  fingerprint: L.Fingerprint,
  save: L.Save,
  undo: L.Undo2,
  globe: L.Globe,
  cpu: L.Cpu,
  wifi: L.Wifi,
  code: L.Code,
  minus: L.Minus,
  hash: L.Hash,
  calendar: L.Calendar,
};

const props = withDefaults(defineProps<{ name: string; size?: number; stroke?: number }>(), { size: 18, stroke: 1.9 });
const icon = computed(() => ICONS[props.name] ?? L.CircleAlert);
</script>

<template>
  <component :is="icon" class="g-icon" :size="size" :stroke-width="stroke" aria-hidden="true" />
</template>

<style scoped>
.g-icon {
  flex: none;
  vertical-align: middle;
}
</style>
