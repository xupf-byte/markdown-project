<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useVaultStore } from '../stores/vault'
import { useSettingsStore } from '../stores/settings'
import { extOf } from '../storage/paths'
import * as ops from '../services/editor-ops'

const vault = useVaultStore()
const settings = useSettingsStore()

const ta = ref<HTMLTextAreaElement | null>(null)
const emit = defineEmits<{ (e: 'scroll', ratio: number): void }>()

const content = computed({
  get: () => vault.content,
  set: (v: string) => vault.setContent(v)
})

const fontStyle = computed(() => ({ fontSize: `${settings.fontSize}px` }))

/* ---------------- 格式化 ---------------- */

function applyEdit(fn: (t: string, s: number, e: number) => ops.EditResult) {
  const el = ta.value
  if (!el) return
  const res = fn(vault.content, el.selectionStart, el.selectionEnd)
  vault.setContent(res.text)
  const start = res.selStart
  const end = res.selEnd
  nextTick(() => {
    el.focus()
    el.setSelectionRange(start, end)
  })
}

function handleCmd(name: string) {
  const el = ta.value
  switch (name) {
    case 'bold':
      applyEdit((t, s, e) => ops.wrapInline(t, s, e, '**', '**', '粗体'))
      break
    case 'italic':
      applyEdit((t, s, e) => ops.wrapInline(t, s, e, '*', '*', '斜体'))
      break
    case 'strike':
      applyEdit((t, s, e) => ops.wrapInline(t, s, e, '~~', '~~', '删除线'))
      break
    case 'code':
      applyEdit((t, s, e) => ops.wrapInline(t, s, e, '`', '`', 'code'))
      break
    case 'h1':
    case 'h2':
    case 'h3':
      applyEdit((t, s, e) => ops.setHeading(t, s, e, Number(name[1])))
      break
    case 'quote':
      applyEdit((t, s, e) => ops.prefixLines(t, s, e, '> '))
      break
    case 'ul':
      applyEdit((t, s, e) => ops.prefixLines(t, s, e, '- '))
      break
    case 'ol':
      applyEdit((t, s, e) => ops.prefixLines(t, s, e, '', true))
      break
    case 'task':
      applyEdit((t, s, e) => ops.prefixLines(t, s, e, '- [ ] '))
      break
    case 'link':
      applyEdit(ops.insertLink)
      break
    case 'image':
      applyEdit(ops.insertImage)
      break
    case 'table':
      applyEdit((t, s, e) => ops.insertBlock(t, s, e, ops.TABLE_SNIPPET))
      break
    case 'math':
      applyEdit((t, s, e) => ops.insertBlock(t, s, e, ops.MATH_SNIPPET))
      break
    case 'mermaid':
      applyEdit((t, s, e) => ops.insertBlock(t, s, e, ops.MERMAID_SNIPPET))
      break
    case 'codeblock':
      applyEdit((t, s, e) => ops.insertBlock(t, s, e, ops.CODE_SNIPPET, [4, 4]))
      break
    case 'hr':
      applyEdit((t, s, e) => ops.insertBlock(t, s, e, '---'))
      break
    case 'undo':
      el?.focus()
      document.execCommand('undo')
      break
    case 'redo':
      el?.focus()
      document.execCommand('redo')
      break
  }
}

defineExpose({ handleCmd, scrollToRatio, focus: () => ta.value?.focus() })

/* ---------------- 键盘快捷键 ---------------- */

function onKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'b') {
    e.preventDefault()
    handleCmd('bold')
    return
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'i') {
    e.preventDefault()
    handleCmd('italic')
    return
  }
  if (mod && !e.shiftKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    handleCmd('link')
    return
  }
  if (mod && e.key === '`') {
    e.preventDefault()
    handleCmd('code')
    return
  }
  if (mod && e.shiftKey && e.key.toLowerCase() === 'x') {
    e.preventDefault()
    handleCmd('strike')
    return
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    const el = ta.value!
    const s = el.selectionStart
    const next = `${vault.content.slice(0, s)}  ${vault.content.slice(el.selectionEnd)}`
    vault.setContent(next)
    nextTick(() => {
      el.setSelectionRange(s + 2, s + 2)
    })
    return
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    if (continueList()) e.preventDefault()
  }
}

/** 回车自动续写列表标记；空项则退出列表 */
function continueList(): boolean {
  const el = ta.value
  if (!el) return false
  const pos = el.selectionStart
  if (pos !== el.selectionEnd) return false
  const text = vault.content
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1
  const line = text.slice(lineStart, pos)
  const m = line.match(/^(\s*)(?:([-*+])\s+\[([ xX])\]\s+|([-*+])\s+|(\d+)\.\s+)(.*)$/)
  if (!m) return false

  const indent = m[1]
  const body = m[6] ?? ''

  // 空列表项 -> 清掉标记，退出列表
  if (!body.trim()) {
    const newText = text.slice(0, lineStart) + indent + text.slice(pos)
    vault.setContent(newText)
    nextTick(() => el.setSelectionRange(lineStart + indent.length, lineStart + indent.length))
    return true
  }

  let marker: string
  if (m[2]) marker = `${m[2]} [ ] `
  else if (m[4]) marker = `${m[4]} `
  else marker = `${Number(m[5]) + 1}. `

  const insert = `\n${indent}${marker}`
  vault.setContent(text.slice(0, pos) + insert + text.slice(el.selectionEnd))
  const caret = pos + insert.length
  nextTick(() => {
    el.setSelectionRange(caret, caret)
    el.scrollTop = el.scrollHeight
  })
  return true
}

/* ---------------- 粘贴图片 ---------------- */

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

async function onPaste(e: ClipboardEvent) {
  const items = Array.from(e.clipboardData?.items ?? []).filter((i) => i.type.startsWith('image/'))
  if (!items.length) return
  e.preventDefault()
  for (const item of items) {
    const file = item.getAsFile()
    if (!file) continue
    try {
      const base64 = await fileToBase64(file)
      const ext = extOf(file.name) || (file.type.split('/')[1] ?? 'png')
      const rel = await vault.saveImage(base64, ext)
      const el = ta.value!
      const pos = el.selectionStart
      const snippet = `![图片](${rel})`
      vault.setContent(vault.content.slice(0, pos) + snippet + vault.content.slice(el.selectionEnd))
      nextTick(() => el.setSelectionRange(pos + snippet.length, pos + snippet.length))
      ElMessage.success('图片已保存到文档库')
    } catch (err: any) {
      ElMessage.error(`图片保存失败：${err?.message ?? err}`)
    }
  }
}

/* ---------------- 滚动同步 ---------------- */

function onScroll() {
  const el = ta.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  emit('scroll', max > 0 ? el.scrollTop / max : 0)
}

function scrollToRatio(ratio: number) {
  const el = ta.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  el.scrollTop = max * ratio
}

/* ---------------- 跳转到指定行 ---------------- */

watch(
  () => vault.jumpLine,
  (line) => {
    if (!line) return
    nextTick(() => {
      const el = ta.value
      if (!el) return
      const lines = vault.content.split('\n')
      let pos = 0
      const target = Math.min(line - 1, lines.length)
      for (let i = 0; i < target; i++) pos += lines[i].length + 1
      el.focus()
      el.setSelectionRange(pos, pos)
      el.scrollTop = Math.max(0, (pos / (vault.content.length || 1)) * el.scrollHeight - el.clientHeight / 3)
    })
    vault.jumpLine = 0
  }
)

onMounted(() => {
  nextTick(() => ta.value?.focus())
})
</script>

<template>
  <div class="editor-wrap">
    <textarea
      ref="ta"
      v-model="content"
      class="editor-textarea"
      :style="fontStyle"
      spellcheck="false"
      placeholder="开始书写 Markdown…&#10;&#10;支持 GFM、数学公式（$…$）、Mermaid 图表、代码高亮"
      @keydown="onKeydown"
      @paste="onPaste"
      @scroll="onScroll"
    />
  </div>
</template>
