/**
 * 路由(History 模式,base = /it/):
 *   第一層:選單群組(總覽 / Gateway 管理 / 端點管理 / 系統管理),定義在 api/auth.ts 的 MENU
 *   第二層:功能頁(TabbedPage),meta 定義標題與 Tab
 *   第三層:Tab = 子路由(重新整理停在同一個 Tab)
 * 守衛(giga-Portal PRD FR-2.5、FR-2.6,Gateway FRONTEND-GUIDE §7.4):
 *   未登入 Gateway → 入口網 /login?redirect=/it/...;沒有 it.app.access → 導回入口網 /;
 *   任一層缺少 meta.permission(選單權限)或 meta.requires(該頁的 BFF 讀取權限)→ /403。前端只是體驗,BFF 一定會再檢查。
 */
import { redirectToLogin } from '@giganexus/web-kit';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { can, canAll, EP, FILE, GW, IT, loadMe, NOTIFY, OBS, setPageHasTab, UI } from './api/auth';
import { hasCurrentApp } from './composables/apps';
import AppLayout from './layouts/AppLayout.vue';
import TabbedPage from './layouts/TabbedPage.vue';

declare module 'vue-router' {
  interface RouteMeta {
    public?: boolean;
    permission?: string;
    /** 該頁需要的 BFF 讀取權限(全部具備才可進入) */
    requires?: readonly string[];
    title?: string;
    description?: string;
    icon?: string;
    eyebrow?: string;
    tab?: string;
    tabs?: { label: string; to: string; icon?: string; permission?: string; wip?: boolean }[];
    /** 開發中的佔位 Tab:不綁 Tab 權限代碼,有該選單即可看到(ENDPOINT-MENU-PLAN §2) */
    wip?: boolean;
  }
}

/** 開發中 Tab 的子路由:共用 WipFeature 佔位頁,內容由 props 傳入;功能做好時換成正式頁面並登記 Tab 代碼 */
function wipTab(path: string, tab: string, props: { summary: string; plan?: string[]; docs?: string[] }): RouteRecordRaw {
  return { path, component: () => import('./pages/WipFeature.vue'), props, meta: { tab, wip: true } };
}

const routes: RouteRecordRaw[] = [
  { path: '/unavailable', component: () => import('./pages/Unavailable.vue'), meta: { public: true, title: '暫時無法連線' } },
  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        component: TabbedPage,
        meta: {
          permission: IT.dashboard,
          title: '儀表板',
          eyebrow: 'Overview',
          description: '服務健康、Gateway 設定與團隊工作的即時概況',
          icon: 'dashboard',
          tabs: [
            { label: '營運總覽', to: '/dashboard', icon: 'activity', permission: UI.dashOverview },
            { label: 'Gateway 概況', to: '/dashboard/gateway', icon: 'gateway', permission: UI.dashGateway },
            { label: '團隊工作', to: '/dashboard/team', icon: 'users', permission: UI.dashTeam },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/dashboard/Overview.vue'), meta: { tab: '營運總覽', permission: UI.dashOverview } },
          {
            path: 'gateway',
            component: () => import('./pages/dashboard/GatewaySummary.vue'),
            meta: { tab: 'Gateway 概況', permission: UI.dashGateway, requires: [GW.upstreamRead, GW.routeRead] },
          },
          { path: 'team', component: () => import('./pages/dashboard/Team.vue'), meta: { tab: '團隊工作', permission: UI.dashTeam, requires: [GW.rbacRead] } },
        ],
      },
      {
        path: 'notify',
        component: TabbedPage,
        meta: {
          permission: IT.notify,
          title: '通知中心',
          eyebrow: 'Notify',
          description: '公司公告與個人通知;有發布權限者可發布公告並查看已讀情形(Gateway NOTIFY-PLAN)',
          icon: 'bell',
          tabs: [
            { label: '我的通知', to: '/notify', icon: 'bell', permission: UI.notifyInbox },
            { label: '公告查詢', to: '/notify/archive', icon: 'search', permission: UI.notifyArchive },
            { label: '發布公告', to: '/notify/publish', icon: 'send', permission: UI.notifyPublish },
            { label: '發布紀錄', to: '/notify/history', icon: 'list', permission: UI.notifyHistory },
            { label: '通知設定', to: '/notify/settings', icon: 'settings', permission: UI.notifySettings },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/notify/Inbox.vue'), meta: { tab: '我的通知', permission: UI.notifyInbox } },
          { path: 'archive', component: () => import('./pages/notify/Archive.vue'), meta: { tab: '公告查詢', permission: UI.notifyArchive } },
          { path: 'publish', component: () => import('./pages/notify/Publish.vue'), meta: { tab: '發布公告', permission: UI.notifyPublish } },
          { path: 'history', component: () => import('./pages/notify/History.vue'), meta: { tab: '發布紀錄', permission: UI.notifyHistory } },
          {
            path: 'settings',
            component: () => import('./pages/notify/Settings.vue'),
            meta: { tab: '通知設定', permission: UI.notifySettings, requires: [NOTIFY.settingsRead] },
          },
        ],
      },
      {
        path: 'gateway/services',
        component: TabbedPage,
        meta: {
          permission: IT.gwService,
          requires: [GW.upstreamRead, GW.routeRead],
          title: '服務與路由',
          eyebrow: 'Gateway',
          description: 'Gateway BFF 的上游服務、API 路由、限流政策與發佈版本;修改後於「發佈版本」發佈才生效',
          icon: 'route',
          tabs: [
            { label: '上游服務', to: '/gateway/services', icon: 'server', permission: UI.svcUpstreams },
            { label: 'API 路由', to: '/gateway/services/routes', icon: 'route', permission: UI.svcRoutes },
            { label: '發佈版本', to: '/gateway/services/releases', icon: 'release', permission: UI.svcReleases },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/Upstreams.vue'), meta: { tab: '上游服務', permission: UI.svcUpstreams } },
          { path: 'routes', component: () => import('./pages/gateway/Routes.vue'), meta: { tab: 'API 路由', permission: UI.svcRoutes } },
          {
            path: 'releases',
            component: () => import('./pages/gateway/Releases.vue'),
            meta: { tab: '發佈版本', permission: UI.svcReleases, requires: [GW.release] },
          },
        ],
      },
      {
        path: 'gateway/rbac',
        component: TabbedPage,
        meta: {
          permission: IT.gwRbac,
          requires: [GW.rbacRead],
          title: '權限查詢',
          eyebrow: 'Gateway · 唯讀',
          description: '查看誰擁有哪些權限、某條 API 誰能呼叫(角色、部門、個人);只能查看,設定請到「系統管理 › 權限設定」',
          icon: 'eye',
          tabs: [
            { label: '角色權限總覽', to: '/gateway/rbac', icon: 'grid', permission: UI.rbacMatrix },
            { label: '誰能存取', to: '/gateway/rbac/who-can-access', icon: 'search', permission: UI.rbacWho },
            { label: '關係圖', to: '/gateway/rbac/graph', icon: 'graph', permission: UI.rbacGraph },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/gateway/RoleMatrix.vue'), meta: { tab: '角色權限總覽', permission: UI.rbacMatrix } },
          { path: 'who-can-access', component: () => import('./pages/gateway/WhoCanAccess.vue'), meta: { tab: '誰能存取', permission: UI.rbacWho } },
          { path: 'graph', component: () => import('./pages/gateway/RbacGraph.vue'), meta: { tab: '關係圖', permission: UI.rbacGraph } },
        ],
      },
      {
        path: 'gateway/observe',
        component: TabbedPage,
        meta: {
          permission: IT.gwObserve,
          requires: [OBS.read],
          title: '架構觀測',
          eyebrow: 'Gateway · 監控',
          description: '各服務的健康狀態、請求紀錄、錯誤與 Nginx 流量(giga-observe);架構圖每 15 秒自動更新',
          icon: 'workflow',
          tabs: [
            { label: '架構圖', to: '/gateway/observe', icon: 'workflow', permission: UI.obsMap },
            { label: '紀錄', to: '/gateway/observe/logs', icon: 'list', permission: UI.obsLogs },
            { label: '錯誤', to: '/gateway/observe/errors', icon: 'alert', permission: UI.obsErrors },
            { label: '流量與來源 IP', to: '/gateway/observe/traffic', icon: 'globe', permission: UI.obsTraffic },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/observe/ArchitectureMap.vue'), meta: { tab: '架構圖', permission: UI.obsMap } },
          { path: 'logs', component: () => import('./pages/observe/Logs.vue'), meta: { tab: '紀錄', permission: UI.obsLogs } },
          { path: 'errors', component: () => import('./pages/observe/Errors.vue'), meta: { tab: '錯誤', permission: UI.obsErrors } },
          { path: 'traffic', component: () => import('./pages/observe/Traffic.vue'), meta: { tab: '流量與來源 IP', permission: UI.obsTraffic } },
        ],
      },
      {
        path: 'gateway/files',
        component: TabbedPage,
        meta: {
          permission: IT.gwFile,
          title: '檔案管理',
          eyebrow: 'Gateway · 附件服務',
          description: '共用附件服務 file-api:上傳、下載、綁定單號、刪除、BPM 表單附件、舊系統匯入檔案與 NAS 備份狀態(giga-file-service);檔案清單只列自己上傳的或同公司的檔案',
          icon: 'folder',
          tabs: [
            { label: '檔案清單', to: '/gateway/files', icon: 'folder', permission: UI.fileObjects },
            { label: 'BPM 附件', to: '/gateway/files/bpm', icon: 'workflow', permission: UI.fileBpm },
            { label: '舊系統', to: '/gateway/files/legacy', icon: 'boxes', permission: UI.fileLegacy },
            { label: '儲存與備份', to: '/gateway/files/storage', icon: 'database', permission: UI.fileStorage },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/files/Files.vue'), meta: { tab: '檔案清單', permission: UI.fileObjects, requires: [FILE.objectRead] } },
          { path: 'bpm', component: () => import('./pages/files/Bpm.vue'), meta: { tab: 'BPM 附件', permission: UI.fileBpm, requires: [FILE.bpmRead] } },
          { path: 'legacy', component: () => import('./pages/files/Legacy.vue'), meta: { tab: '舊系統', permission: UI.fileLegacy, requires: [FILE.legacyRead] } },
          {
            path: 'storage',
            component: () => import('./pages/files/Storage.vue'),
            meta: { tab: '儲存與備份', permission: UI.fileStorage, requires: [FILE.storageRead] },
          },
        ],
      },
      // 端點管理(ENDPOINT-MENU-PLAN §2、§3.3):端點儀表板 / 電腦管理 / 資產管理 / 軟體管理 / 資安政策 / Agent 管理 / 報表;〔開發中〕Tab 用 wipTab()
      {
        path: 'endpoint/dashboard',
        component: TabbedPage,
        meta: {
          permission: IT.endpointDashboard,
          title: '端點儀表板',
          eyebrow: 'Endpoint',
          description: '端點電腦的整體概況:在線狀態、告警、待核可與派送結果',
          icon: 'gauge',
          tabs: [{ label: '總覽', to: '/endpoint/dashboard', icon: 'activity', wip: true }],
        },
        children: [
          wipTab('', '總覽', {
            summary: '進入端點管理的落點:一眼看出電腦總數、在線 / 離線、未結告警、待核可批次與 24 小時內失敗的指令,並列出需要處理的電腦。',
            plan: [
              '第一版:指標列 + 最近 10 筆未結告警(需 RustIt 新增 GET /v1/dashboard/summary,依公司範圍過濾、快取 60 秒)',
              '第二版:健康清單(磁碟不足、記憶體長期偏高、超過 7 天未回報)、作業系統與 Agent 版本分佈、近 7 天派送成功 / 失敗',
            ],
            docs: ['GigaItApp docs/ENDPOINT-MENU-PLAN.md §2.1、§4 M3–M4'],
          }),
        ],
      },
      {
        path: 'endpoint/devices',
        component: TabbedPage,
        meta: {
          permission: IT.endpointDevice,
          title: '電腦管理',
          eyebrow: 'Endpoint',
          description: '經 Gateway BFF 取得的 Agent 基本資料;資料權限以 Gateway 為準',
          icon: 'monitor',
          tabs: [
            { label: '電腦清單', to: '/endpoint/devices', icon: 'monitor', permission: UI.devList },
            { label: '指令紀錄', to: '/endpoint/devices/commands', icon: 'list', permission: UI.cmdList },
            { label: '告警', to: '/endpoint/devices/alerts', icon: 'bell', permission: UI.alertList },
            { label: '待核可', to: '/endpoint/devices/batches', icon: 'clock', permission: UI.batchList },
            { label: '遠端協助', to: '/endpoint/devices/remote', icon: 'headset', wip: true },
            { label: '報修單', to: '/endpoint/devices/tickets', icon: 'wrench', wip: true },
            { label: '未安裝 Agent 電腦', to: '/endpoint/devices/unmanaged', icon: 'monitor-off', wip: true },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/endpoint/Devices.vue'), meta: { tab: '電腦清單', permission: UI.devList } },
          { path: 'commands', component: () => import('./pages/endpoint/Commands.vue'), meta: { tab: '指令紀錄', permission: UI.cmdList, requires: [EP.deviceRead] } },
          {
            path: 'alerts',
            component: () => import('./pages/endpoint/Alerts.vue'),
            meta: { tab: '告警', permission: UI.alertList, requires: [EP.deviceRead] },
          },
          {
            path: 'batches',
            component: () => import('./pages/endpoint/Batches.vue'),
            meta: { tab: '待核可', permission: UI.batchList, requires: [EP.deviceRead] },
          },
          wipTab('remote', '遠端協助', {
            summary: '以 RustDesk 遠端協助使用者:自架 hbbs / hbbr、派送 RustDesk、密碼加密保存、一鍵連線並留下稽核紀錄;使用者端顯示「IT 正在連線」。',
            docs: ['RustIt docs/PLATFORM-PLAN.md §9 路線圖(RustDesk 遠端協助)、RustIt docs/PRD.md §6'],
          }),
          wipTab('tickets', '報修單', {
            summary: '處理使用者從使用者端程式或入口網送出的報修單;送單時自動帶入電腦資訊與截圖。',
            docs: ['RustIt docs/PLATFORM-PLAN.md §4.8(P8-3 報修入口)、§9 路線圖(報修單後端)、RustIt docs/PRD.md §4.1'],
          }),
          wipTab('unmanaged', '未安裝 Agent 電腦', {
            summary: '與 AD 電腦帳號、DHCP 租約或網段掃描比對,列出應該安裝卻還沒安裝 Agent 的電腦。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.1'],
          }),
        ],
      },
      {
        path: 'endpoint/assets',
        component: TabbedPage,
        meta: {
          permission: IT.endpointAsset,
          title: '資產管理',
          eyebrow: 'Endpoint',
          description: '電腦與周邊設備的財產資料、保管人、生命週期與盤點',
          icon: 'tag',
          tabs: [
            { label: '資產登錄', to: '/endpoint/assets', icon: 'tag', wip: true },
            { label: '資產盤點', to: '/endpoint/assets/inventory', icon: 'clipboard-check', wip: true },
            { label: '周邊設備', to: '/endpoint/assets/peripherals', icon: 'printer', wip: true },
            { label: '廠商與地點', to: '/endpoint/assets/vendors', icon: 'map-pin', wip: true },
          ],
        },
        children: [
          wipTab('', '資產登錄', {
            summary: '登錄電腦與資產的財產編號、購入日、保固到期、狀態(使用中 / 庫存 / 維修 / 報廢)與保管人、部門(人事資料取自入口網)。舊系統資料不匯入,上線後重新登錄。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.1(保管人)、§2.2', 'GigaItApp docs/ENDPOINT-MENU-PLAN.md §8-6'],
          }),
          wipTab('inventory', '資產盤點', {
            summary: '以盤點批次進行:匯出清單 → 現場勾稽(可掃 QR Code)→ 產生差異報表。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.2'],
          }),
          wipTab('peripherals', '周邊設備', {
            summary: '手動登錄螢幕、印表機等不是電腦的資產,並關聯到電腦或保管人(目前只有電腦附帶的螢幕資訊)。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.2'],
          }),
          wipTab('vendors', '廠商與地點', {
            summary: '廠商與地點(廠區 / 樓層)主檔,供資產登錄選用;組織與人員沿用 Gateway 的資料。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.2'],
          }),
        ],
      },
      {
        path: 'endpoint/software',
        component: TabbedPage,
        meta: {
          permission: IT.endpointSoftware,
          title: '軟體管理',
          eyebrow: 'Endpoint',
          description: '軟體目錄、上傳與簽章、派送,以及各電腦已安裝的軟體與 Windows 更新',
          icon: 'package',
          tabs: [
            { label: '軟體目錄與派送', to: '/endpoint/software', icon: 'send', permission: UI.swList },
            { label: '上傳與簽章', to: '/endpoint/software/uploads', icon: 'shield', permission: UI.swUpload },
            { label: '已安裝軟體', to: '/endpoint/software/installed', icon: 'boxes', wip: true },
            { label: 'Windows 更新', to: '/endpoint/software/updates', icon: 'download', wip: true },
            { label: '授權報表', to: '/endpoint/software/licenses', icon: 'key', wip: true },
            { label: '禁用軟體', to: '/endpoint/software/blocked', icon: 'ban', wip: true },
            { label: '軟體使用率', to: '/endpoint/software/usage', icon: 'gauge', wip: true },
          ],
        },
        children: [
          {
            path: '',
            component: () => import('./pages/endpoint/Software.vue'),
            meta: { tab: '軟體目錄與派送', permission: UI.swList, requires: [EP.deviceRead] },
          },
          {
            path: 'uploads',
            component: () => import('./pages/endpoint/SoftwareUploads.vue'),
            meta: { tab: '上傳與簽章', permission: UI.swUpload, requires: [EP.softwareManage] },
          },
          wipTab('installed', '已安裝軟體', {
            summary: '全公司已安裝軟體彙總:軟體名稱、版本數、安裝台數,點開看哪些電腦有裝(目前電腦清單只能用軟體名稱篩選)。',
            plan: ['需 RustIt 新增彙總 API GET /v1/software/installed'],
            docs: ['GigaItApp docs/ENDPOINT-MENU-PLAN.md §2.3、§4 M4'],
          }),
          wipTab('updates', 'Windows 更新', {
            summary: '批次移除 Windows 更新(KB):輸入 KB 編號 → 查出哪些電腦有安裝 → 建立批次移除;單台入口在電腦詳情「安全」Tab。',
            docs: ['RustIt docs/KB-UNINSTALL-DESIGN.md U4', 'GigaItApp docs/ENDPOINT-MENU-PLAN.md §2.3、§4 M5'],
          }),
          wipTab('licenses', '授權報表', {
            summary: '依已安裝軟體統計授權使用量,並提供資產總表、硬體變更、安全狀態等報表,可匯出 Excel。',
            docs: ['RustIt docs/PLATFORM-PLAN.md §9 路線圖(報表)、RustIt docs/PRD.md §4.3'],
          }),
          wipTab('blocked', '禁用軟體', {
            summary: '維護禁用軟體清單;先做「偵測到禁用軟體就告警」,封鎖執行屬於「資安政策 › 執行軟體控管」。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.3'],
          }),
          wipTab('usage', '軟體使用率', {
            summary: '由 Agent 蒐集各程式在前景的使用時間,找出很少用、可以回收的授權;涉及隱私,上線前需公告。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.3'],
          }),
        ],
      },
      {
        path: 'endpoint/policy',
        component: TabbedPage,
        meta: {
          permission: IT.endpointPolicy,
          title: '資安政策',
          eyebrow: 'Endpoint',
          description: '下發到端點電腦的控管政策',
          icon: 'shield',
          tabs: [
            { label: 'USB 儲存控管', to: '/endpoint/policy', icon: 'usb', wip: true },
            { label: '原則與套用對象', to: '/endpoint/policy/targets', icon: 'list', wip: true },
            { label: '防火牆規則', to: '/endpoint/policy/firewall', icon: 'brick-wall', wip: true },
            { label: '外接網卡與無線網路', to: '/endpoint/policy/network', icon: 'wifi', wip: true },
            { label: '執行軟體控管', to: '/endpoint/policy/app-control', icon: 'shield-ban', wip: true },
            { label: '弱點分析(CVE)', to: '/endpoint/policy/vulnerabilities', icon: 'bug', wip: true },
            { label: '稽核紀錄', to: '/endpoint/policy/audit', icon: 'audit', wip: true },
          ],
        },
        children: [
          wipTab('', 'USB 儲存控管', {
            summary: 'USB 儲存裝置控管:下發策略(policy.apply 指令)、白名單、違規事件。目前 Agent 只記錄 USB 插拔事件(電腦詳情「事件」Tab),不封鎖。',
            docs: ['RustIt docs/PLATFORM-PLAN.md §9 路線圖(USB 儲存控管)、RustIt docs/PRD.md §5.2'],
          }),
          wipTab('targets', '原則與套用對象', {
            summary: '所有資安政策共用的框架:建立原則 → 選套用對象(公司 / 部門 / 電腦群組 / 單台)→ 以 policy.apply 指令下發 → Agent 回報是否生效。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.4'],
          }),
          wipTab('firewall', '防火牆規則', {
            summary: '下發 Windows 防火牆規則,由 Agent 以系統權限套用並回報結果。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.4'],
          }),
          wipTab('network', '外接網卡與無線網路', {
            summary: '禁止使用外接網卡,無線網路只允許白名單內的網路。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.4'],
          }),
          wipTab('app-control', '執行軟體控管', {
            summary: '禁止執行指定程式(可設免安裝軟體的例外);採用 Windows 內建的 AppLocker / WDAC 原則,不自行攔截程式。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.4'],
          }),
          wipTab('vulnerabilities', '弱點分析(CVE)', {
            summary: '把各電腦的已安裝軟體轉成 CPE,比對離線匯入的 NVD / CVE 資料,列出每台電腦的弱點與嚴重度。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.5'],
          }),
          wipTab('audit', '稽核紀錄', {
            summary: '需法務與隱私公告確認後才開發;範圍包含檔案存取、網頁傳輸、即時通訊、螢幕擷取與列印紀錄。需求方決定列入但最後做。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.4、§2.5', 'RustIt docs/PLATFORM-PLAN.md B5', 'GigaItApp docs/ENDPOINT-MENU-PLAN.md §8-6'],
          }),
        ],
      },
      {
        path: 'endpoint/agent',
        component: TabbedPage,
        meta: {
          permission: IT.endpointAgent,
          title: 'Agent 管理',
          eyebrow: 'Endpoint',
          description: '端點監控程式(Agent / Watchdog)與使用者端程式的版本、發佈環與設定',
          icon: 'cpu',
          tabs: [
            { label: 'Agent 版本', to: '/endpoint/agent', icon: 'package', permission: UI.releaseList },
            { label: '使用者端程式', to: '/endpoint/agent/desktop', icon: 'app-window', wip: true },
            { label: 'Agent 設定', to: '/endpoint/agent/settings', icon: 'settings', wip: true },
          ],
        },
        children: [
          {
            path: '',
            component: () => import('./pages/endpoint/Releases.vue'),
            meta: { tab: 'Agent 版本', permission: UI.releaseList, requires: [EP.deviceRead] },
          },
          wipTab('desktop', '使用者端程式', {
            summary: '使用者端程式(托盤、通知、我的電腦、嵌入 Gateway 網頁應用)的版本與發佈;與監控 MSI 各自發版。',
            docs: ['RustIt docs/PLATFORM-PLAN.md §4.8(P8)'],
          }),
          wipTab('settings', 'Agent 設定', {
            summary: '檢視主機下發給 Agent 的設定(回報間隔、USB 事件開關等)與信任的簽章者清單。',
            docs: ['GigaItApp docs/ENDPOINT-MENU-PLAN.md §2.4', 'RustIt docs/PLATFORM-PLAN.md §6(AgentSettings)'],
          }),
        ],
      },
      {
        path: 'endpoint/reports',
        component: TabbedPage,
        meta: {
          permission: IT.endpointReport,
          title: '報表',
          eyebrow: 'Endpoint',
          description: '端點資產、軟體授權、硬體變更與安全狀態的報表與排程寄送',
          icon: 'chart',
          tabs: [
            { label: '報表中心', to: '/endpoint/reports', icon: 'chart', wip: true },
            { label: '報表訂閱', to: '/endpoint/reports/subscriptions', icon: 'mail', wip: true },
          ],
        },
        children: [
          wipTab('', '報表中心', {
            summary: '資產總表、軟體授權、硬體變更、安全狀態等報表,可匯出 Excel / CSV(由後端產生,不在瀏覽器整理全部資料)。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.1(匯出)、§2.6', 'RustIt docs/PLATFORM-PLAN.md §9 路線圖(報表)'],
          }),
          wipTab('subscriptions', '報表訂閱', {
            summary: '排程把報表以 Excel 寄給指定的人(經 Gateway 通知逐人寄送,不寄群組信箱)。',
            docs: ['RustIt docs/SMARTIT-FEATURE-BACKLOG.md §2.6'],
          }),
        ],
      },
      // 舊網址(拆分前的 Tab;書籤、群組貼過的連結)保留一個版本週期(ENDPOINT-MENU-PLAN §3.3)
      { path: 'endpoint/devices/software', redirect: (to) => ({ path: '/endpoint/software', query: to.query, hash: to.hash }) },
      { path: 'endpoint/devices/software-uploads', redirect: (to) => ({ path: '/endpoint/software/uploads', query: to.query, hash: to.hash }) },
      { path: 'endpoint/devices/releases', redirect: (to) => ({ path: '/endpoint/agent', query: to.query, hash: to.hash }) },
      {
        path: 'system/users',
        component: TabbedPage,
        meta: {
          permission: IT.sysUser,
          requires: [GW.userRead],
          title: '人員與部門',
          eyebrow: 'System',
          description: 'Gateway 使用者(人員同步自 BPM / LOS)、個別指派角色與部門樹',
          icon: 'users',
          tabs: [
            { label: '人員', to: '/system/users', icon: 'users', permission: UI.userList },
            { label: '部門', to: '/system/users/departments', icon: 'building', permission: UI.userDepts },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Users.vue'), meta: { tab: '人員', permission: UI.userList } },
          {
            path: 'departments',
            component: () => import('./pages/system/Departments.vue'),
            meta: { tab: '部門', permission: UI.userDepts, requires: [GW.rbacRead] },
          },
        ],
      },
      {
        path: 'system/permissions',
        component: TabbedPage,
        meta: {
          permission: IT.sysRole,
          requires: [GW.rbacRead],
          title: '權限設定',
          eyebrow: 'System · 編輯',
          description: '設定各應用的選單 / Tab / 按鈕權限給誰:角色(依公司、部門、職級、職稱自動指派)、部門(含職級門檻)或個人',
          icon: 'key',
          tabs: [
            { label: '角色權限', to: '/system/permissions', icon: 'grid', permission: UI.roleRolePerm },
            { label: '角色與指派規則', to: '/system/permissions/roles', icon: 'shield', permission: UI.roleRules },
            { label: '部門權限', to: '/system/permissions/departments', icon: 'building', permission: UI.roleDept },
            { label: '個人權限', to: '/system/permissions/users', icon: 'user', permission: UI.roleUser },
            { label: '權限試算', to: '/system/permissions/preview', icon: 'eye', permission: UI.rolePreview },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/AppPermissions.vue'), meta: { tab: '角色權限', permission: UI.roleRolePerm } },
          { path: 'roles', component: () => import('./pages/system/RoleRules.vue'), meta: { tab: '角色與指派規則', permission: UI.roleRules } },
          { path: 'departments', component: () => import('./pages/system/DeptPermissions.vue'), meta: { tab: '部門權限', permission: UI.roleDept } },
          { path: 'users', component: () => import('./pages/system/UserPermissions.vue'), meta: { tab: '個人權限', permission: UI.roleUser } },
          { path: 'preview', component: () => import('./pages/system/PermissionPreview.vue'), meta: { tab: '權限試算', permission: UI.rolePreview } },
        ],
      },
      {
        path: 'system/menus',
        component: TabbedPage,
        meta: {
          permission: IT.sysMenu,
          requires: [GW.rbacRead],
          title: '選單管理',
          eyebrow: 'System · 編輯',
          description: '各應用的選單 / Tab / 按鈕清單:改名稱、排序、上層,新增或刪除;要授予誰請到「權限設定」',
          icon: 'list',
          tabs: [{ label: '選單 / Tab / 按鈕', to: '/system/menus', icon: 'list', permission: UI.menuList }],
        },
        children: [{ path: '', component: () => import('./pages/system/MenuManage.vue'), meta: { tab: '選單 / Tab / 按鈕', permission: UI.menuList } }],
      },
      {
        path: 'system/audit',
        component: TabbedPage,
        meta: {
          permission: IT.sysAudit,
          requires: [GW.auditRead],
          title: '稽核紀錄',
          eyebrow: 'System',
          description: 'Gateway 的管理操作與登入紀錄(預設最近 30 天)',
          icon: 'audit',
          tabs: [
            { label: '操作紀錄', to: '/system/audit', icon: 'audit', permission: UI.auditOps },
            { label: '登入紀錄', to: '/system/audit/logins', icon: 'login', permission: UI.auditLogins },
          ],
        },
        children: [
          { path: '', component: () => import('./pages/system/Audit.vue'), props: { type: 'operation' }, meta: { tab: '操作紀錄', permission: UI.auditOps } },
          {
            path: 'logins',
            component: () => import('./pages/system/Audit.vue'),
            props: { type: 'login' },
            meta: { tab: '登入紀錄', permission: UI.auditLogins },
          },
        ],
      },
      { path: '403', component: () => import('./pages/Forbidden.vue'), meta: { title: '沒有權限' } },
      { path: ':pathMatch(.*)*', component: () => import('./pages/NotFound.vue'), meta: { title: '找不到頁面' } },
    ],
  },
];

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior: () => ({ top: 0 }),
});

type TabMeta = { to: string; permission?: string; wip?: boolean };
/** 功能頁中第一個有權限的 Tab(Tab 權限 ∩ 該 Tab 子路由需要的讀取權限;開發中 Tab 一律可看);沒有 Tab 定義時回頁面本身 */
function firstTab(page: RouteRecordRaw): string | null {
  const tabs = (page.meta?.tabs as TabMeta[] | undefined) ?? [];
  if (!tabs.length) return `/${page.path}`;
  for (const t of tabs) {
    if (t.wip) return t.to;
    if (t.permission && !can(t.permission)) continue;
    const child = (page.children ?? []).find((c) => `/${page.path}${c.path ? `/${c.path}` : ''}` === t.to);
    if (!child || canAll(child.meta?.requires)) return t.to;
  }
  return null;
}

setPageHasTab((path) => {
  const rec = (routes[1]!.children ?? []).find((r) => `/${r.path}` === path);
  return !rec || firstTab(rec) !== null;
});

/** 第一個可見的功能頁與 Tab(首頁沒有權限時改到這裡) */
function firstAllowed(): string | null {
  for (const r of routes[1]!.children ?? []) {
    if (!r.meta?.permission || r.path === '403') continue;
    if (can(r.meta.permission) && canAll(r.meta.requires)) {
      const t = firstTab(r);
      if (t) return t;
    }
  }
  return null;
}

router.beforeEach(async (to) => {
  if (to.meta.public) return true;
  let me;
  try {
    me = await loadMe();
  } catch {
    // BFF 無法連線(非 401):顯示維護頁,不導向登入
    return { path: '/unavailable', query: { redirect: to.fullPath } };
  }
  if (!me) {
    redirectToLogin();
    return false;
  }
  // 應用層守衛:沒有 IT 管理系統的應用權限 → 回入口網(不可停在本系統造成迴圈)
  if (!hasCurrentApp(me)) {
    location.assign('/');
    return false;
  }
  // 頁面守衛:任一層缺少選單權限或 BFF 讀取權限 → 403
  const denied = to.matched.some((r) => (r.meta.permission && !can(r.meta.permission)) || !canAll(r.meta.requires));
  if (denied) {
    // 有此功能頁、只是目前的 Tab 沒權限:改到同頁第一個有權限的 Tab
    const page = to.matched[1];
    const pageOk = page && (!page.meta.permission || can(page.meta.permission)) && canAll(page.meta.requires);
    if (pageOk) {
      const rec = (routes[1]!.children ?? []).find((r) => `/${r.path}` === page.path);
      const t = rec ? firstTab(rec) : null;
      if (t && t !== to.path) return t;
    }
    if (to.path === '/dashboard') {
      const first = firstAllowed();
      if (first && first !== '/dashboard') return first;
    }
    return '/403';
  }
  return true;
});
