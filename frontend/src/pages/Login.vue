<script setup lang="ts">
/** 登入頁(IT 管理系統自有帳號,不經 Gateway 單一入口) */
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { login } from '@/api/auth';
import { ApiError } from '@/api/http';
import { useTheme } from '@/composables/theme';

const route = useRoute();
const router = useRouter();
const { theme, toggle } = useTheme();

const username = ref('');
const password = ref('');
const loading = ref(false);
const error = ref<{ message: string; requestId: string | null } | null>(null);
const expired = computed(() => route.query.expired === '1');

/** 開發環境示範帳號(虛構資料,密碼 Passw0rd!) */
const DEMO = import.meta.env.DEV
  ? [
      { emp: 'itadmin', name: '系統管理員', tag: '全部權限' },
      { emp: 'S100001', name: '陳主管', tag: '系統課 · 主管' },
      { emp: 'S100031', name: '劉建宏', tag: '開發課 · 高級工程師' },
      { emp: 'S100040', name: '周子翔', tag: '資安課 · 高級工程師' },
      { emp: 'S100012', name: '吳佳穎', tag: '網管課 · 一般工程師' },
    ]
  : [];

async function submit() {
  error.value = null;
  loading.value = true;
  try {
    const me = await login(username.value.trim(), password.value);
    const back = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : null;
    router.replace(back ?? me.menus[0]?.children[0]?.path ?? '/403');
  } catch (e) {
    error.value = e instanceof ApiError ? { message: e.message, requestId: e.requestId } : { message: (e as Error).message, requestId: null };
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login">
    <div class="orb o1" />
    <div class="orb o2" />
    <div class="orb o3" />

    <GButton class="theme" variant="secondary" square :icon="theme === 'dark' ? 'sun' : 'moon'" aria-label="切換主題" @click="toggle" />

    <section class="hero">
      <div class="brand">
        <GLogo :size="44" />
        <span>GigaNexus</span>
      </div>
      <h1>IT 管理系統<br /><span class="gradient-text">Gateway · 權限 · 團隊</span></h1>
      <p class="lead">集中檢視 Gateway BFF 的服務、路由與權限,依職級與部門控管每一顆按鈕。</p>
      <ul class="feats">
        <li class="glass">
          <GIcon name="gateway" /><span><b>BFF 視覺化</b>上游、路由、發佈版本一目了然</span>
        </li>
        <li class="glass">
          <GIcon name="shield" /><span><b>權限關係圖</b>角色 → 權限 → API 一路追到底</span>
        </li>
        <li class="glass">
          <GIcon name="key" /><span><b>按鈕權限</b>主管 / 高級 / 一般工程師 × 部門</span>
        </li>
      </ul>
    </section>

    <section class="panel glass glass-edge">
      <header>
        <h2>登入</h2>
        <p class="muted">使用 IT 管理系統帳號(與入口網帳號分開)</p>
      </header>

      <div v-if="expired && !error" class="notice tone-warning"><GIcon name="clock" :size="16" />登入已逾時,請重新登入</div>

      <form class="stack" @submit.prevent="submit">
        <GInput v-model="username" label="工號" icon="user" size="lg" autocomplete="username" placeholder="例:S100001" required />
        <GInput v-model="password" label="密碼" icon="lock" type="password" size="lg" autocomplete="current-password" required />
        <div v-if="error" class="notice tone-danger" role="alert">
          <GIcon name="alert-circle" :size="16" />
          <span
            >{{ error.message }}<small v-if="error.requestId" class="mono">requestId {{ error.requestId.slice(0, 12) }}</small></span
          >
        </div>
        <GButton type="submit" variant="primary" size="lg" block :loading="loading" icon-right="login">登入</GButton>
      </form>

      <div v-if="DEMO.length" class="demo">
        <p class="faint xs">開發環境示範帳號(虛構資料,密碼 <code>Passw0rd!</code>)</p>
        <div class="demo-list">
          <button v-for="d in DEMO" :key="d.emp" type="button" class="demo-item" @click="((username = d.emp), (password = 'Passw0rd!'))">
            <GAvatar :name="d.name" :size="28" />
            <span
              ><b>{{ d.emp }}</b
              ><small>{{ d.tag }}</small></span
            >
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.login {
  position: relative;
  min-height: 100vh;
  display: grid;
  grid-template-columns: 1.1fr minmax(360px, 440px);
  align-items: center;
  gap: 56px;
  padding: 48px clamp(16px, 6vw, 96px);
  overflow: hidden;
}
.orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.55;
  pointer-events: none;
  animation: float 16s ease-in-out infinite alternate;
}
.o1 {
  width: 420px;
  height: 420px;
  left: -80px;
  top: -60px;
  background: var(--brand-1);
}
.o2 {
  width: 360px;
  height: 360px;
  right: 8%;
  bottom: -120px;
  background: var(--brand-2);
  animation-delay: -5s;
}
.o3 {
  width: 280px;
  height: 280px;
  left: 42%;
  top: 30%;
  background: var(--brand-3);
  opacity: 0.35;
  animation-delay: -9s;
}
@keyframes float {
  to {
    transform: translate(40px, 30px) scale(1.08);
  }
}
.theme {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 2;
}
.hero {
  position: relative;
  z-index: 1;
  max-width: 560px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 750;
  font-size: var(--fs-xl);
}
h1 {
  margin-top: 36px;
  font-size: clamp(34px, 4.4vw, 54px);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1.15;
}
.lead {
  margin: 18px 0 0;
  font-size: var(--fs-lg);
  color: var(--text-2);
  max-width: 480px;
}
.feats {
  list-style: none;
  padding: 0;
  margin: 32px 0 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.feats li {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
  border-radius: var(--radius-md);
  color: var(--c-primary);
}
.feats span {
  display: flex;
  flex-direction: column;
  color: var(--text-2);
  font-size: var(--fs-sm);
}
.feats b {
  color: var(--text);
  font-size: var(--fs-md);
}
.panel {
  position: relative;
  z-index: 1;
  padding: 36px 34px 30px;
  border-radius: var(--radius-xl);
  background: var(--glass-strong);
  box-shadow: var(--shadow-lg);
}
.panel header {
  margin-bottom: 24px;
}
.panel h2 {
  font-size: var(--fs-2xl);
  font-weight: 750;
}
.panel header p {
  margin: 6px 0 0;
}
.notice {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
  border-radius: var(--radius-sm);
  font-size: var(--fs-sm);
  color: var(--tone);
  background: color-mix(in srgb, var(--tone) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--tone) 28%, transparent);
}
form .notice {
  margin: 0;
}
.notice small {
  display: block;
  opacity: 0.75;
}
.demo {
  margin-top: 24px;
  padding-top: 18px;
  border-top: 1px dashed var(--line-strong);
}
.demo p {
  margin: 0 0 10px;
}
.demo-list {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.demo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  background: var(--glass-soft);
  font: inherit;
  color: var(--text);
  text-align: left;
  cursor: pointer;
  transition: all var(--dur);
}
.demo-item:hover {
  border-color: var(--field-focus);
  background: var(--glass-hover);
}
.demo-item span {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
  min-width: 0;
}
.demo-item b {
  font-size: var(--fs-sm);
  font-family: var(--font-mono);
}
.demo-item small {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
@media (max-width: 960px) {
  .login {
    grid-template-columns: minmax(0, 1fr);
    gap: 28px;
    padding: 72px 16px 32px;
  }
  .hero {
    max-width: none;
  }
  h1 {
    margin-top: 20px;
  }
  .feats {
    display: none;
  }
}
@media (max-width: 420px) {
  .panel {
    padding: 26px 20px;
  }
  .demo-list {
    grid-template-columns: 1fr;
  }
}
</style>
