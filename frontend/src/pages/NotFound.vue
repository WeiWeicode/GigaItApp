<template>
  <GCard class="state">
    <GEmpty icon="search" tone="info" title="找不到這個頁面" description="網址可能打錯了,或功能已經搬家。">
      <GButton variant="primary" icon="dashboard" @click="$router.push('/')">回首頁</GButton>
    </GEmpty>
  </GCard>
</template>

<style scoped>
.state {
  max-width: 640px;
  margin: 48px auto;
}
</style>
