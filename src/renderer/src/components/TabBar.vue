<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Close } from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'
import { externalPath, isExternalId } from '../storage'
import type { DocNode } from '../types'

const vault = useVaultStore()

/** 横向滚动容器 */
const barRef = ref<HTMLElement | null>(null)

const tabs = computed(() =>
  vault.openTabs.map((id) => ({
    id,
    node: vault.files.find((f: DocNode) => f.id === id),
    name: vault.files.find((f: DocNode) => f.id === id)?.name ?? id.split('/').pop() ?? id,
    dirty: vault.dirtyIds.includes(id),
    external: isExternalId(id),
    /** 悬停提示：外部文件直接给出磁盘上的绝对路径 */
    hint: isExternalId(id) ? externalPath(id) : id
  }))
)

function onClose(e: MouseEvent, id: string) {
  e.stopPropagation()
  vault.closeTab(id)
}

function onMiddle(e: MouseEvent, id: string) {
  if (e.button === 1) {
    e.preventDefault()
    vault.closeTab(id)
  }
}

/**
 * 标签右键菜单。
 * 菜单本身由 App.vue 统一渲染（与文件树右键共用一套），这里只负责派发事件，
 * 位置用 clientX/clientY —— 菜单容器是 position: fixed，与视口坐标同一坐标系。
 * 关闭「左/右」以**被右键的标签**为基准（与浏览器习惯一致），不是以当前激活标签为基准。
 */
function onContext(e: MouseEvent, id: string) {
  const list = vault.openTabs
  const idx = list.indexOf(id)
  window.dispatchEvent(
    new CustomEvent('mdnotes:contextmenu', {
      detail: {
        x: e.clientX,
        y: e.clientY,
        menu: [
          { label: '关闭当前页', run: () => void vault.closeTab(id) },
          { label: '关闭全部', run: () => void vault.closeAllTabs() },
          {
            label: '关闭当前左边',
            disabled: idx <= 0,
            run: () => void vault.closeTabsLeft(id)
          },
          {
            label: '关闭当前右边',
            disabled: idx < 0 || idx >= list.length - 1,
            run: () => void vault.closeTabsRight(id)
          }
        ]
      }
    })
  )
}

/**
 * 把当前激活的标签滚动进可视区域。
 * 只改 `scrollLeft`，不用 `scrollIntoView` —— 后者会连带滚动外层容器/整个窗口，
 * 标签多了以后会出现「点个标签整页跳动」。
 */
function revealActive() {
  const bar = barRef.value
  if (!bar) return
  const el = bar.querySelector<HTMLElement>('.tab.is-active')
  if (!el) return
  const barRect = bar.getBoundingClientRect()
  const elRect = el.getBoundingClientRect()
  // 完全可见就不动，避免无谓抖动
  if (elRect.left >= barRect.left && elRect.right <= barRect.right) return
  const pad = 8
  if (elRect.left < barRect.left) {
    bar.scrollLeft -= barRect.left - elRect.left + pad
  } else {
    bar.scrollLeft += elRect.right - barRect.right + pad
  }
}

// currentId 变化（切换 / 新开标签追加到末尾）与标签增删都重新定位。
// 用字符串做 key，避免 getter 每次返回新数组导致重复触发。
watch(
  () => `${vault.currentId}\u0000${tabs.value.length}`,
  () => {
    void nextTick(revealActive)
  },
  { immediate: true }
)

// 窗口变窄时激活标签可能被推出视野
function onResize() {
  void nextTick(revealActive)
}
onMounted(() => window.addEventListener('resize', onResize))
onBeforeUnmount(() => window.removeEventListener('resize', onResize))
</script>

<template>
  <div v-if="tabs.length" ref="barRef" class="tabbar">
    <div
      v-for="t in tabs"
      :key="t.id"
      class="tab"
      :class="{ 'is-active': t.id === vault.currentId }"
      :title="t.hint"
      @click="vault.open(t.id)"
      @mousedown="onMiddle($event, t.id)"
      @contextmenu.prevent="onContext($event, t.id)"
    >
      <span v-if="t.dirty" class="dirty-dot" />
      <span v-if="t.external" class="ext-flag">外部</span>
      <span class="tab-name">{{ t.name }}</span>
      <el-icon class="tab-close" :size="12" @click="onClose($event, t.id)"><Close /></el-icon>
    </div>
  </div>
</template>

<style scoped>
.ext-flag {
  flex: 0 0 auto;
  font-size: 10px;
  line-height: 15px;
  padding: 0 4px;
  margin-right: 2px;
  border-radius: 4px;
  color: #409eff;
  background: rgba(64, 158, 255, 0.14);
}
</style>
