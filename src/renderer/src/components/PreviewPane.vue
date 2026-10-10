<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { useVaultStore } from '../stores/vault'
import { useSettingsStore } from '../stores/settings'
import { renderMermaid } from '../services/markdown'
import { parentOf } from '../storage/fslike'
import { resolveRel } from '../storage/paths'

const vault = useVaultStore()
const settings = useSettingsStore()

const body = ref<HTMLElement | null>(null)
const emit = defineEmits<{ (e: 'scroll', ratio: number): void }>()

/** 已解析过的图片：工作区路径 -> dataURL */
const imageCache = new Map<string, string>()

async function enhance() {
  const el = body.value
  if (!el) return

  await renderMermaid(el, settings.isDark)
  await resolveImages(el)
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
