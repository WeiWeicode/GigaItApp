<script setup lang="ts">
/** 品牌標誌(節點連線圖形,象徵 Gateway 串接各系統) */
withDefaults(defineProps<{ size?: number }>(), { size: 40 });
</script>

<template>
  <span class="g-logo" :style="{ width: `${size}px`, height: `${size}px` }">
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M10 11h12M10 11l6 11M22 11l-6 11" />
      <circle cx="10" cy="11" r="3" />
      <circle cx="22" cy="11" r="3" />
      <circle cx="16" cy="22" r="3" />
    </svg>
  </span>
</template>

<style scoped>
.g-logo {
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 30%;
  background: var(--grad-brand);
  box-shadow: var(--shadow-glow);
}
svg {
  width: 70%;
  height: 70%;
}
path {
  fill: none;
  stroke: rgb(255 255 255 / 0.75);
  stroke-width: 2;
  stroke-linecap: round;
}
circle {
  fill: #fff;
}
</style>
