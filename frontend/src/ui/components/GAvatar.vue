<script setup lang="ts">
/** 頭像:取姓名最後一字(中文)或前兩字母,顏色依名稱固定 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 34 });
const GRADS = [
  ['#6366f1', '#22d3ee'],
  ['#a855f7', '#ec4899'],
  ['#10b981', '#22d3ee'],
  ['#f59e0b', '#ef4444'],
  ['#3b82f6', '#a855f7'],
];
const initials = computed(() => {
  const n = props.name.trim();
  return /[一-鿿]/.test(n) ? n.slice(-2) : n.slice(0, 2).toUpperCase();
});
const bg = computed(() => {
  const [a, b] = GRADS[[...props.name].reduce((s, c) => s + c.charCodeAt(0), 0) % GRADS.length]!;
  return `linear-gradient(135deg, ${a}, ${b})`;
});
</script>

<template>
  <span class="g-avatar" :style="{ width: `${size}px`, height: `${size}px`, background: bg, fontSize: `${Math.round(size * 0.36)}px` }">{{ initials }}</span>
</template>

<style scoped>
.g-avatar {
  display: inline-grid;
  place-items: center;
  flex: none;
  border-radius: 30%;
  color: #fff;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.3),
    0 4px 12px rgb(0 0 0 / 0.12);
}
</style>
