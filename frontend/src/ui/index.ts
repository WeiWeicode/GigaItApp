/**
 * 全域 UI 套件:app.use(ui) 後所有 G* 元件、v-can 指令與 $can 在任何頁面可直接使用,不需各自 import。
 * 頁面不自行刻按鈕 / 卡片 / 表格樣式;需要新樣式時擴充這裡的元件或 styles/tokens.css。
 */
import type { App, Component, Directive } from 'vue';
import { watchEffect } from 'vue';
import { can } from '@/api/auth';
import './styles/tokens.css';
import './styles/base.css';

const components = import.meta.glob<{ default: Component }>(['./components/G*.vue', './charts/G*.vue'], { eager: true });

/**
 * v-can="'sys.user.create'":沒有權限時隱藏元素(只是使用體驗,後端仍會檢查)。
 * v-can:disable="'...'":沒有權限時改為停用並加上提示。
 */
const vCan: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    const stop = watchEffect(() => {
      const ok = can(binding.value);
      if (binding.arg === 'disable') {
        el.toggleAttribute('disabled', !ok);
        el.title = ok ? '' : `需要權限 ${binding.value}`;
      } else el.style.display = ok ? '' : 'none';
    });
    (el as HTMLElement & { __canStop?: () => void }).__canStop = stop;
  },
  unmounted(el) {
    (el as HTMLElement & { __canStop?: () => void }).__canStop?.();
  },
};

export default {
  install(app: App) {
    for (const [path, mod] of Object.entries(components)) {
      const name = path
        .split('/')
        .pop()!
        .replace(/\.vue$/, '');
      app.component(name, mod.default);
    }
    app.directive('can', vCan);
    app.config.globalProperties.$can = can;
  },
};

export { confirm, toast } from './feedback';
