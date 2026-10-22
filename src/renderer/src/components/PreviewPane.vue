<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useVaultStore } from '../stores/vault'
import { useSettingsStore } from '../stores/settings'
import { renderMermaid } from '../services/markdown'
import { copyText } from '../services/clipboard'
import { parentOf } from '../storage/fslike'
import { resolveRel } from '../storage/paths'

const vault = useVaultStore()
const settings = useSettingsStore()

const body = ref<HTMLElement | null>(null)
const emit = defineEmits<{ (e: 'scroll', ratio: number): void }>()

/** 已解析过的图片：工作区路径 -> dataURL */
const imageCache = new Map<string, string>()

/** 复制按钮的「已复制」回显定时器 */
const copyTimers = new WeakMap<HTMLElement, number>()

async function enhance() {
  const el = body.value
  if (!el) return

  await renderMermaid(el, settings.isDark)
  await resolveImages(el)
  injectCopyButtons(el)
}

/**
 * 给每个代码块注入「复制」按钮。
 *
 * 刻意放在预览增强阶段（而不是渲染 HTML 里）：导出的 HTML / PDF 复用同一份
 * 渲染结果，塞进去的按钮在静态文件里没有意义，也没有点击逻辑。
 */
function injectCopyButtons(el: HTMLElement) {
  el.querySelectorAll<HTMLElement>('.code-wrap').forEach((wrap) => {
    if (wrap.querySelector('.code-copy')) return
    if (!wrap.querySelector('pre')) return
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'code-copy'
    btn.textContent = '复制'
    btn.title = '复制代码'
    wrap.appendChild(btn)
  })
}

function flashCopyState(btn: HTMLElement, label: string) {
  const prev = copyTimers.get(btn)
  if (prev) window.clearTimeout(prev)

  btn.textContent = label
  btn.classList.toggle('is-done', label === '已复制')
  const timer = window.setTimeout(() => {
    btn.textContent = '复制'
    btn.classList.remove('is-done')
    copyTimers.delete(btn)
  }, 1200)
  copyTimers.set(btn, timer)
}

async function copyCodeBlock(btn: HTMLElement) {
  const wrap = btn.closest('.code-wrap')
  // 用 textContent 而不是 innerHTML：只复制代码原文，不带高亮标签
  const code = wrap?.querySelector('pre code')?.textContent ?? ''
  if (!code.trim()) {
    ElMessage.warning('这个代码块是空的')
    return
  }
  const ok = await copyText(code)
  flashCopyState(btn, ok ? '已复制' : '复制失败')
  if (!ok) ElMessage.error('复制失败，请手动选中复制')
}

async function resolveImages(el: HTMLElement) {
  const imgs = Array.from(el.querySelectorAll('img'))
  const dir = parentOf(vault.currentId)
  for (const img of imgs) {
    const src = img.getAttribute('src') || ''
    if (!src || /^(https?:|data:|blob:|file:)/i.test(src)) continue
    if (img.dataset.resolved) continue
    const target = resolveRel(dir, src)
    const cached = imageCache.get(target)
    if (cached) {
      img.src = cached
      img.dataset.resolved = '1'
      continue
    }
    const base64 = await vault.readAsset(target)
    if (!base64) continue
    const mime = /\.jpe?g$/i.test(target) ? 'image/jpeg' : /\.gif$/i.test(target) ? 'image/gif' : /\.svg$/i.test(target) ? 'image/svg+xml' : /\.webp$/i.test(target) ? 'image/webp' : 'image/png'
    const dataUrl = `data:${mime};base64,${base64}`
    imageCache.set(target, dataUrl)
    img.src = dataUrl
    img.dataset.resolved = '1'
  }
}

watch(
  () => vault.renderedHtml,
  () => nextTick(enhance)
)

/**
 * 换文档时预览区必须回到顶部。
 *
 * 否则容器会沿用上一篇文档的 scrollTop（被 clamp 到新文档的 max），
 * 分栏模式下这个位置又会通过滚动比例同步把编辑区一起推到底部。
 * 用 contentEpoch 而非 currentId，避免重命名把长文档的阅读位置清掉。
 */
watch(
  () => vault.contentEpoch,
  () => {
    nextTick(() => {
      if (body.value) body.value.scrollTop = 0
    })
  }
)

watch(
  () => settings.isDark,
  () => {
    body.value?.querySelectorAll('.mermaid[data-processed]').forEach((n) => {
      n.removeAttribute('data-processed')
      n.innerHTML = ''
    })
    nextTick(enhance)
  }
)

function onClick(e: MouseEvent) {
  const target = e.target as HTMLElement

  // 代码块复制按钮
  const copyBtn = target.closest<HTMLElement>('.code-copy')
  if (copyBtn) {
    e.preventDefault()
    e.stopPropagation()
    void copyCodeBlock(copyBtn)
    return
  }

  // 任务列表勾选 -> 同步回 Markdown 源
  if (target.tagName === 'INPUT' && (target as HTMLInputElement).type === 'checkbox') {
    e.preventDefault()
    toggleTask(Array.from(body.value?.querySelectorAll<HTMLInputElement>('input[type=checkbox]') ?? []).indexOf(target as HTMLInputElement))
    return
  }

  const anchor = target.closest('a')
  if (!anchor) return
  const href = anchor.getAttribute('href') || ''
  if (!href) return
  e.preventDefault()

  if (/^https?:/i.test(href)) {
    window.open(href, '_blank')
    return
  }
  if (href.startsWith('#')) {
    body.value?.querySelector(`[id="${CSS.escape(href.slice(1))}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (/^[^:]+\.md(#.*)?$/i.test(href)) {
    const [path, hash] = href.split('#')
    const targetId = resolveRel(parentOf(vault.currentId), path)
    vault.open(targetId).then(() => {
      if (hash) body.value?.querySelector(`[id="${CSS.escape(hash)}"]`)?.scrollIntoView()
    })
    return
  }
  ElMessage.info(`暂不支持打开：${href}`)
}

function toggleTask(index: number) {
  if (index < 0) return
  const lines = vault.content.split('\n')
  let n = 0
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*([-*+])\s+)\[([ xX])\](.*)$/)
    if (!m) continue
    if (n === index) {
      const checked = m[3].toLowerCase() === 'x'
      lines[i] = `${m[1]}[${checked ? ' ' : 'x'}]${m[4]}`
      vault.setContent(lines.join('\n'))
      return
    }
    n++
  }
}

function onScroll() {
  const el = body.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  emit('scroll', max > 0 ? el.scrollTop / max : 0)
}

function scrollToRatio(ratio: number) {
  const el = body.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  el.scrollTop = max * ratio
}

function scrollToId(id: string) {
  const el = body.value?.querySelector(`[id="${CSS.escape(id)}"]`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

defineExpose({ scrollToRatio, scrollToId })

onBeforeUnmount(() => imageCache.clear())
</script>

<template>
  <div ref="body" class="markdown-body" @click="onClick" @scroll="onScroll">
    <div v-html="vault.renderedHtml" />
  </div>
</template>

<style scoped>
.markdown-body {
  flex: 1;
  overflow: auto;
}
</style>
