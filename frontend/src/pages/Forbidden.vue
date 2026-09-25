<template>
  <GCard class="state">
    <GEmpty icon="lock" tone="warning" title="沒有此功能的權限" description="您的職級或部門沒有這個頁面的權限。如需使用,請洽部門主管到「角色與按鈕權限」調整。">
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
