/**
 * 架構觀測頁共用:定時更新(頁面在背景時暫停)
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

/** 每 intervalMs 呼叫一次 fn;分頁切到背景時不呼叫,回到前景立即更新一次 */
export function usePolling(fn: () => unknown, intervalMs = 15_000) {
  const lastAt = ref<Date | null>(null);
  let timer: ReturnType<typeof setInterval> | null = null;
  const tick = async () => {
    if (document.visibilityState !== 'visible') return;
    await fn();
    lastAt.value = new Date();
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') void tick();
  };
  onMounted(() => {
    lastAt.value = new Date();
    timer = setInterval(tick, intervalMs);
    document.addEventListener('visibilitychange', onVisible);
  });
  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
  });
  return { lastAt };
}

export const fmtClock = (d: Date | null) => (d ? d.toLocaleTimeString('zh-TW', { hour12: false }) : '—');

export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`;
}

export function fmtBytes(b: number): string {
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(1)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}

export const statusTone = (s: number) => (s >= 500 || s === 0 ? 'danger' : s >= 400 ? 'warning' : s >= 300 ? 'info' : 'success');
