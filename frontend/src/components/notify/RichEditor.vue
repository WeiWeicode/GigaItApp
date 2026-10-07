<script setup lang="ts">
/**
 * 公告內文編輯器(Tiptap,Gateway NOTIFY-PLAN §6.7):只啟用白名單內的功能,輸出 HTML(v-model)。
 *   標題 H2–H4、粗體 / 斜體 / 底線 / 刪除線、文字顏色(限定色盤)、清單、引用、表格、連結、圖片、分隔線、對齊、復原 / 重做
 *   圖片:工具列上傳、貼上或拖曳 → POST /api/notify/assets → 以回傳的站內網址插入(不接受外部圖片網址)
 *   連結:只接受 https:、mailto: 與站內路徑;BFF 儲存前會再清洗一次
 */
import { notifyApi } from '@giganexus/web-kit';
import Image from '@tiptap/extension-image';
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table';
import TextAlign from '@tiptap/extension-text-align';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import StarterKit from '@tiptap/starter-kit';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import { onBeforeUnmount, ref, watch } from 'vue';
import { toast } from '@/ui';

const props = defineProps<{ maxImageBytes?: number; placeholder?: string }>();
const html = defineModel<string>({ default: '' });

const LINK_OK = /^(https:|mailto:|\/(?!\/))/i;
/** 色盤(與 BFF 白名單:# 色碼) */
const COLORS = ['#dc2626', '#ea580c', '#ca8a04', '#16a34a', '#2563eb', '#7c3aed'];

const uploading = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const linkOpen = ref(false);
const linkUrl = ref('');
const colorOpen = ref(false);

async function upload(files: File[]): Promise<void> {
  const images = files.filter((f) => f.type.startsWith('image/'));
  if (!images.length) return;
  uploading.value = true;
  try {
    for (const f of images) {
      if (props.maxImageBytes && f.size > props.maxImageBytes) {
        toast.warning(`圖片「${f.name}」超過 ${(props.maxImageBytes / 1024 / 1024).toFixed(1)} MB`);
        continue;
      }
      const r = await notifyApi.uploadAsset(f);
      editor.value?.chain().focus().setImage({ src: r.url, alt: f.name }).run();
    }
  } catch (e) {
    toast.fromError(e, '圖片上傳失敗');
  } finally {
    uploading.value = false;
  }
}

const editor = useEditor({
  content: html.value,
  extensions: [
    StarterKit.configure({
      heading: { levels: [2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: 'https',
        protocols: ['mailto'],
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
        isAllowedUri: (url) => LINK_OK.test(url),
      },
    }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    Image.configure({ inline: false, allowBase64: false }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
  ],
  editorProps: {
    attributes: { class: 'gn-notify-content rich-area', 'aria-label': '公告內文' },
    // 貼上 / 拖曳圖片檔:上傳後插入(base64 圖片不接受)
    handlePaste: (_view, event) => {
      const files = [...(event.clipboardData?.files ?? [])];
      if (!files.some((f) => f.type.startsWith('image/'))) return false;
      void upload(files);
      return true;
    },
    handleDrop: (_view, event) => {
      const files = [...((event as DragEvent).dataTransfer?.files ?? [])];
      if (!files.some((f) => f.type.startsWith('image/'))) return false;
      void upload(files);
      return true;
    },
  },
  onUpdate: ({ editor: e }) => {
    html.value = e.isEmpty ? '' : e.getHTML();
  },
});

// 外部改值(載入草稿)時同步到編輯器
watch(html, (v) => {
  const e = editor.value;
  if (e && v !== (e.isEmpty ? '' : e.getHTML())) e.commands.setContent(v || '', { emitUpdate: false });
});
onBeforeUnmount(() => editor.value?.destroy());

function pickFiles(ev: Event) {
  const input = ev.target as HTMLInputElement;
  void upload([...(input.files ?? [])]);
  input.value = '';
}
function openLink() {
  linkUrl.value = (editor.value?.getAttributes('link').href as string | undefined) ?? '';
  linkOpen.value = true;
}
function applyLink() {
  const url = linkUrl.value.trim();
  const chain = editor.value?.chain().focus().extendMarkRange('link');
  if (!url) chain?.unsetLink().run();
  else if (!LINK_OK.test(url)) return toast.warning('連結只接受 https://、mailto: 或站內路徑(/ 開頭)');
  else chain?.setLink({ href: url }).run();
  linkOpen.value = false;
}
function setColor(c: string | null) {
  const chain = editor.value?.chain().focus();
  if (c) chain?.setColor(c).run();
  else chain?.unsetColor().run();
  colorOpen.value = false;
}

type Btn = { icon: string; label: string; run: () => void; active?: () => boolean; disabled?: () => boolean };
const e = () => editor.value!;
const groups: Btn[][] = [
  [
    { icon: 'h2', label: '大標題', run: () => e().chain().focus().toggleHeading({ level: 2 }).run(), active: () => e().isActive('heading', { level: 2 }) },
    { icon: 'h3', label: '小標題', run: () => e().chain().focus().toggleHeading({ level: 3 }).run(), active: () => e().isActive('heading', { level: 3 }) },
  ],
  [
    { icon: 'bold', label: '粗體', run: () => e().chain().focus().toggleBold().run(), active: () => e().isActive('bold') },
    { icon: 'italic', label: '斜體', run: () => e().chain().focus().toggleItalic().run(), active: () => e().isActive('italic') },
    { icon: 'underline', label: '底線', run: () => e().chain().focus().toggleUnderline().run(), active: () => e().isActive('underline') },
    { icon: 'strike', label: '刪除線', run: () => e().chain().focus().toggleStrike().run(), active: () => e().isActive('strike') },
  ],
  [
    { icon: 'list', label: '項目清單', run: () => e().chain().focus().toggleBulletList().run(), active: () => e().isActive('bulletList') },
    { icon: 'list-ordered', label: '編號清單', run: () => e().chain().focus().toggleOrderedList().run(), active: () => e().isActive('orderedList') },
    { icon: 'quote', label: '引用', run: () => e().chain().focus().toggleBlockquote().run(), active: () => e().isActive('blockquote') },
    { icon: 'minus', label: '分隔線', run: () => e().chain().focus().setHorizontalRule().run() },
  ],
  [
    { icon: 'align-left', label: '靠左', run: () => e().chain().focus().setTextAlign('left').run(), active: () => e().isActive({ textAlign: 'left' }) },
    { icon: 'align-center', label: '置中', run: () => e().chain().focus().setTextAlign('center').run(), active: () => e().isActive({ textAlign: 'center' }) },
    { icon: 'align-right', label: '靠右', run: () => e().chain().focus().setTextAlign('right').run(), active: () => e().isActive({ textAlign: 'right' }) },
  ],
  [
    { icon: 'link', label: '連結', run: openLink, active: () => e().isActive('link') },
    { icon: 'image', label: '插入圖片', run: () => fileInput.value?.click() },
    { icon: 'table', label: '插入表格', run: () => e().chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  ],
  [
    { icon: 'undo', label: '復原', run: () => e().chain().focus().undo().run(), disabled: () => !e().can().undo() },
    { icon: 'redo', label: '重做', run: () => e().chain().focus().redo().run(), disabled: () => !e().can().redo() },
  ],
];
const tableBtns: Btn[] = [
  { icon: 'table-row', label: '下方插入列', run: () => e().chain().focus().addRowAfter().run() },
  { icon: 'table-col', label: '右側插入欄', run: () => e().chain().focus().addColumnAfter().run() },
  { icon: 'minus', label: '刪除列', run: () => e().chain().focus().deleteRow().run() },
  { icon: 'x', label: '刪除欄', run: () => e().chain().focus().deleteColumn().run() },
  { icon: 'trash', label: '刪除表格', run: () => e().chain().focus().deleteTable().run() },
];
</script>

<template>
  <div class="rich glass-edge">
    <div v-if="editor" class="toolbar" role="toolbar" aria-label="格式">
      <template v-for="(g, gi) in groups" :key="gi">
        <button
          v-for="b in g"
          :key="b.icon"
          type="button"
          class="tb"
          :class="{ on: b.active?.() }"
          :title="b.label"
          :aria-label="b.label"
          :aria-pressed="b.active ? b.active() : undefined"
          :disabled="b.disabled?.() || (b.icon === 'image' && uploading)"
          @click="b.run"
        >
          <GIcon :name="b.icon" :size="16" />
        </button>
        <span v-if="gi === 1" class="color-wrap">
          <button type="button" class="tb" title="文字顏色" aria-label="文字顏色" @click="colorOpen = !colorOpen">
            <GIcon name="palette" :size="16" />
          </button>
          <span v-if="colorOpen" class="palette glass">
            <button v-for="c in COLORS" :key="c" type="button" class="sw" :style="{ background: c }" :aria-label="`顏色 ${c}`" @click="setColor(c)" />
            <button type="button" class="sw none" aria-label="預設顏色" title="預設顏色" @click="setColor(null)"><GIcon name="x" :size="12" /></button>
          </span>
        </span>
        <i class="sep" />
      </template>
      <template v-if="editor.isActive('table')">
        <button v-for="b in tableBtns" :key="b.label" type="button" class="tb" :title="b.label" :aria-label="b.label" @click="b.run">
          <GIcon :name="b.icon" :size="16" />
        </button>
      </template>
      <span v-if="uploading" class="xs faint uploading"><GIcon name="upload" :size="14" /> 上傳中…</span>
    </div>
    <EditorContent :editor="editor" />
    <p v-if="editor?.isEmpty && placeholder" class="ph faint small">{{ placeholder }}</p>
    <input ref="fileInput" type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden @change="pickFiles" />

    <GModal v-model:open="linkOpen" title="插入連結" icon="link" width="440px">
      <GInput v-model="linkUrl" label="網址" placeholder="https://… 或 /it/…;留空 = 移除連結" @keydown.enter="applyLink" />
      <template #footer>
        <GButton variant="secondary" @click="linkOpen = false">取消</GButton>
        <GButton icon="check" @click="applyLink">套用</GButton>
      </template>
    </GModal>
  </div>
</template>

<style scoped>
.rich {
  position: relative;
  border: 1px solid var(--field-border);
  border-radius: var(--radius-md);
  background: var(--field);
}
.rich:focus-within {
  border-color: var(--field-focus);
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  padding: 6px;
  border-bottom: 1px solid var(--line);
}
.tb {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 8px;
  background: none;
  color: var(--text-2);
  cursor: pointer;
}
.tb:hover:not(:disabled) {
  background: var(--glass-soft);
  color: var(--text);
}
.tb.on {
  background: color-mix(in srgb, var(--c-primary) 18%, transparent);
  color: var(--c-primary);
}
.tb:disabled {
  opacity: 0.4;
  cursor: default;
}
.sep {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--line);
}
.sep:last-of-type {
  display: none;
}
.color-wrap {
  position: relative;
}
.palette {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 5;
  display: flex;
  gap: 6px;
  padding: 8px;
  border-radius: 10px;
  background: var(--glass-strong);
  box-shadow: var(--shadow-md);
}
.sw {
  width: 22px;
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 6px;
  cursor: pointer;
}
.sw.none {
  display: grid;
  place-items: center;
  background: var(--glass-soft);
  color: var(--text-2);
}
.uploading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
}
.ph {
  position: absolute;
  top: 56px;
  left: 16px;
  margin: 0;
  pointer-events: none;
}
:deep(.rich-area) {
  min-height: 260px;
  max-height: 560px;
  overflow-y: auto;
  padding: 12px 16px;
  outline: none;
}
:deep(.rich-area .selectedCell) {
  background: color-mix(in srgb, var(--c-primary) 14%, transparent);
}
:deep(.rich-area img.ProseMirror-selectednode) {
  outline: 2px solid var(--c-primary);
}
</style>
