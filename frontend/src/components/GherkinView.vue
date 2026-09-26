<script setup lang="ts">
/** Gherkin 行為規格(BFF gw.api_route.gherkin):逐行顯示,醒目標示關鍵字、標籤與註解;純文字渲染,不使用 v-html */
import { computed } from 'vue';

const props = defineProps<{ text: string }>();

const KEYWORD =
  /^(\s*)(功能|場景大綱|場景|背景|例子|規則|假如|假設|當|那麼|而且|並且|但是|Feature|Scenario Outline|Scenario|Background|Examples|Rule|Given|When|Then|And|But)(\s*[::]|\s+)(.*)$/;

const lines = computed(() =>
  props.text.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (t.startsWith('#')) return { kind: 'comment', raw };
    if (t.startsWith('@')) return { kind: 'tag', raw };
    if (t.startsWith('|')) return { kind: 'table', raw };
    const m = KEYWORD.exec(raw);
    if (!m) return { kind: 'text', raw };
    // 有冒號的是區塊標題(功能 / 場景 / 背景…),其餘是步驟(假如 / 當 / 那麼…)
    return { kind: /[::]/.test(m[3]!) ? 'heading' : 'step', indent: m[1]!, keyword: m[2]! + m[3]!, rest: m[4]! };
  }),
);
</script>

<template>
  <pre
    class="gherkin"
  ><template v-for="(l, i) in lines" :key="i"><template v-if="l.kind === 'heading' || l.kind === 'step'">{{ l.indent }}<b :class="l.kind">{{ l.keyword }}</b>{{ l.rest }}</template><span v-else :class="l.kind">{{ l.raw }}</span>{{ '\n' }}</template></pre>
</template>

<style scoped>
.gherkin {
  margin: 0;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--glass-soft);
  border: 1px solid var(--line);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 360px;
  overflow: auto;
}
.heading {
  color: var(--c-primary);
}
.step {
  color: var(--c-violet);
}
.tag {
  color: var(--c-cyan);
}
.comment {
  color: var(--text-3);
  font-style: italic;
}
.table {
  color: var(--text-2);
}
</style>
