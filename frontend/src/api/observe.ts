/**
 * 架構觀測(giga-observe,Gateway MONITORING-PLAN W9-10):經 BFF /api/observe/*(系統代碼 observe)
 *   observe.data.read  架構圖、統計、告警、紀錄摘要
 *   observe.log.body   單筆紀錄明細(含 request / response body,可能有個資)
 * giga-observe 的回應格式為 { success, data, pagination? },這裡取出 data。
 * 路由尚未在 Gateway 發佈時回 404 ROUTE_NOT_FOUND:畫面顯示「尚未接入」,不當成錯誤。
 */
import { ApiError, http, type Query } from './http';

export type HealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

export interface ServiceHealth {
  status: HealthStatus;
  since: string | null;
  lastHeartbeatAt: string | null;
  lastProbeOkAt: string | null;
  lastErrorAt?: string | null;
  stats1h: { total: number; error: number; avgMs: number };
  stats5m: { total: number; error: number; errorRate: number };
  version?: string | null;
  uptimeSec?: number | null;
  deps: { name: string; ok: boolean; latencyMs: number | null }[];
}

export interface ObserveService {
  id: string;
  name: string;
  type: string;
  layer: string;
  stack: string[];
  team: string;
  owner: string;
  lifecycle: string;
  links: { repo?: string };
  health: ServiceHealth;
}

export interface Topology {
  services: ObserveService[];
  edges: { from: string; to: string; label?: string }[];
  unregistered: string[];
}

export interface LogSummary {
  id: string;
  serviceId: string;
  ts: string;
  level: 'info' | 'warn' | 'error';
  kind: 'http' | 'job' | 'web';
  method: string;
  path: string;
  pathTemplate: string | null;
  status: number;
  durationMs: number;
  traceId: string | null;
  userId: string | null;
  meta: Record<string, string | number | boolean | null> | null;
  errorMessage: string | null;
}

export interface ServiceDetail extends ObserveService {
  description: string;
  monitor: { enabled: boolean; healthUrl?: string };
  recentLogs: LogSummary[];
  recentErrors: LogSummary[];
  dependencies: { upstream: { id: string; status: HealthStatus; label?: string }[]; downstream: { id: string; status: HealthStatus; label?: string }[] };
}

export interface LogDetail {
  id: string;
  serviceId: string;
  ts: string;
  level: string;
  kind: string;
  traceId: string | null;
  request: {
    method: string;
    path: string;
    pathTemplate: string;
    query: unknown;
    body: unknown;
    bodySize: number;
    bodyTruncated: boolean;
    headers: Record<string, unknown>;
    ip: string | null;
    userId: string | null;
  };
  actions: { seq: number; type: string; target: string; durationMs: number | null; note: string; ok: boolean }[];
  response: { status: number; body: unknown; bodySize: number; bodyTruncated: boolean; durationMs: number };
  error?: { name: string; message: string; stack: string; code: string | null } | null;
  meta?: Record<string, unknown>;
  bodyTrimmedAt?: string;
}

export interface ErrorGroup {
  serviceId: string;
  method: string;
  pathTemplate: string;
  status: number;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sampleLogId: string | null;
  sampleErrorMessage: string | null;
}

export interface TodayStats {
  entryServiceId: string;
  today: { total: number; errors: number; availability: number | null; avgMs: number | null; p95Ms: number | null } | null;
  yesterday: { total: number; errors: number; availability: number | null; avgMs: number | null; p95Ms: number | null } | null;
  hourly: { ts: string; total: number; errors: number; avgMs: number | null }[];
}

export interface UpstreamStat {
  upstream: string;
  total: number;
  errors: number;
  errorRate: number;
  availability: number | null;
  p95Ms: number | null;
  lastAt: string | null;
}

export interface Alert {
  id: string;
  category: 'system' | 'security';
  severity: 'critical' | 'warning';
  title: string;
  detail: string;
  serviceId?: string;
  ip?: string;
  since: string | null;
}

export interface Alerts {
  items: Alert[];
  counts: { system: number; security: number };
  windowMin: number;
}

export interface TrafficPoint {
  ts: string;
  total: number;
  status4xx: number;
  status5xx: number;
  unauthorized: number;
  forbidden: number;
  rateLimited: number;
  bytes: number;
  p95Ms: number;
}

export interface TopIp {
  ip: string;
  count: number;
  errors: number;
  denied: number;
  lastSeen: string;
}

export interface Vital {
  serviceId: string;
  name: string;
  p75: number;
  count: number;
}

interface Envelope<T> {
  success: boolean;
  data: T;
  pagination?: { limit: number; nextCursor: string | null; hasMore: boolean };
}

const get = <T>(path: `/api/observe/${string}`, query?: Query) => http.get<Envelope<T>>(path, { query }).then((r) => r.data);

/** 路由尚未發佈(或無權限以外的「找不到」)→ 視為尚未接入 */
export function notConnected(e: unknown): boolean {
  return e instanceof ApiError && (e.code === 'ROUTE_NOT_FOUND' || e.status === 404 || e.code === 'UPSTREAM_UNAVAILABLE');
}

export const observe = {
  topology: () => get<Topology>('/api/observe/topology'),
  service: (id: string) => get<ServiceDetail>(`/api/observe/services/${encodeURIComponent(id)}`),
  logs: (q: Query) =>
    http.get<Envelope<LogSummary[]>>('/api/observe/logs', { query: q }).then((r) => ({ items: r.data, nextCursor: r.pagination?.nextCursor ?? null, hasMore: !!r.pagination?.hasMore })),
  log: (id: string) => get<LogDetail>(`/api/observe/logs/${encodeURIComponent(id)}`),
  errors: (q: Query) => get<ErrorGroup[]>('/api/observe/errors', q),
  errorEvents: (g: Pick<ErrorGroup, 'serviceId' | 'method' | 'pathTemplate' | 'status'>) =>
    get<LogSummary[]>(`/api/observe/errors/${encodeURIComponent([g.serviceId, g.method, g.pathTemplate, g.status].join('|'))}/events`),
  today: () => get<TodayStats>('/api/observe/stats/today'),
  upstreams: (hours = 1) => get<UpstreamStat[]>('/api/observe/stats/upstreams', { hours }),
  alerts: () => get<Alerts>('/api/observe/alerts'),
  traffic: (q: Query = {}) => get<TrafficPoint[]>('/api/observe/traffic', q),
  topIps: (q: Query = {}) => get<TopIp[]>('/api/observe/traffic/top-ips', q),
  vitals: (hours = 24) => get<Vital[]>('/api/observe/web/vitals', { hours }),
};

/** 狀態顯示 */
export const HEALTH: Record<HealthStatus, { label: string; tone: string }> = {
  healthy: { label: '正常', tone: 'success' },
  degraded: { label: '異常', tone: 'warning' },
  down: { label: '失聯', tone: 'danger' },
  unknown: { label: '未回報', tone: 'neutral' },
};

/** 架構圖分層(與 giga-observe topology.json 的 layer 一致) */
export const LAYERS: { key: string; label: string; icon: string }[] = [
  { key: 'presentation', label: '展示層', icon: 'monitor' },
  { key: 'api', label: '接入 / API 層', icon: 'gateway' },
  { key: 'service', label: '核心服務', icon: 'boxes' },
  { key: 'data', label: '資料與儲存', icon: 'database' },
  { key: 'infra', label: '維運與基礎設施', icon: 'server' },
];

export const TYPE_LABEL: Record<string, string> = {
  frontend: '前端',
  backend: '後端',
  gateway: '閘道',
  database: '資料庫',
  cache: '快取',
  storage: '檔案儲存',
  devops: '維運 / 排程',
};
