<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { http } from '@/api/http';
import { toast } from '@/ui';

const open = defineModel<boolean>('open', { default: false });
const form = reactive({ current: '', next: '', confirm: '' });
const error = ref<string | null>(null);
const saving = ref(false);

watch(open, (v) => {
  if (v) (Object.assign(form, { current: '', next: '', confirm: '' }), (error.value = null));
});

async function submit() {
  error.value = null;
  if (form.next !== form.confirm) return (error.value = '兩次輸入的新密碼不一致');
  saving.value = true;
  try {
    await http.post('/auth/password', { currentPassword: form.current, newPassword: form.next });
    toast.success('密碼已變更');
    open.value = false;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <GModal v-model:open="open" title="變更密碼" subtitle="至少 8 碼,需包含英文字母與數字" icon="lock" width="440px">
    <form id="pwd-form" class="stack" @submit.prevent="submit">
      <GInput v-model="form.current" label="目前密碼" type="password" autocomplete="current-password" required />
      <GInput v-model="form.next" label="新密碼" type="password" autocomplete="new-password" required />
      <GInput v-model="form.confirm" label="確認新密碼" type="password" autocomplete="new-password" required :error="error" />
    </form>
    <template #footer>
      <GButton variant="ghost" @click="open = false">取消</GButton>
      <GButton variant="primary" type="submit" form="pwd-form" :loading="saving">儲存</GButton>
    </template>
  </GModal>
</template>
