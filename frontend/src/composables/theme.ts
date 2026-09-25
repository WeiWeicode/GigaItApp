/**
 * 明亮 / 黑暗主題:設定 <html data-theme>。
 * 使用者選擇存在 localStorage(個人偏好,非機密;讀寫失敗時退回系統設定)。
 */
import { ref } from 'vue';

export type Theme = 'light' | 'dark';
const KEY = 'itapp.theme';

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* 無痕模式等情況無法讀取,改用系統設定 */
  }
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const theme = ref<Theme>(initial());

function apply(t: Theme) {
  document.documentElement.dataset.theme = t;
}

export function initTheme(): void {
  apply(theme.value);
}

export function useTheme() {
  function set(t: Theme) {
    theme.value = t;
    apply(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* 無法保存時只影響下次開啟 */
    }
  }
  return { theme, set, toggle: () => set(theme.value === 'dark' ? 'light' : 'dark') };
}
