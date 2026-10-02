/**
 * 經 Gateway BFF 轉入的儀表板 API(/api/it/*,giga-Portal PRD I1、G5;Gateway 路由登記在 deploy/gateway-rbac.yaml,權限 it.dashboard.read):
 *   GET /api/it/dashboard/overview   KPI、24 小時流量、告警(營運總覽 Tab 上半部)
 *   GET /api/it/dashboard/work       近期工單(營運總覽 Tab 下半部,捲動到才載入)
 * 權限由 BFF 檢查後才轉入,本服務只驗證內部 Token。Gateway 統計、部門人數、最近操作改由前端直接讀 BFF 管理 API。
 * 監控、工單、告警整合開發中:回傳空清單,前端顯示「開發中」。
 */
import type { FastifyPluginAsync } from 'fastify';
import { GATEWAY_PREFIX } from '../gateway/plugin.js';

const itDashboardRoutes: FastifyPluginAsync = async (app) => {
  const P = `${GATEWAY_PREFIX}/dashboard`;
  const opts = { config: { gateway: true } };

  app.get(`${P}/overview`, opts, async () => ({
    generatedAt: new Date().toISOString(),
    mockSections: [],
    kpis: [],
    traffic: [],
    alerts: [],
  }));

  app.get(`${P}/work`, opts, async () => ({
    generatedAt: new Date().toISOString(),
    mockSections: ['tickets'],
    tickets: [],
  }));
};

export default itDashboardRoutes;
