/**
 * 啟動 itapp-api。設定見 .env.example;部署區差異見 AGENT.md §4。
 */
import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = await buildApp(config);
await app.listen({ host: '0.0.0.0', port: config.port });
app.log.info({ env: config.env, bffMode: config.bff.mode, dataDir: config.dataDir }, 'itapp-api 已啟動');

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    app.close().then(() => process.exit(0));
  });
