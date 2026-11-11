<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Document, Folder, FolderOpened, MoreFilled, StarFilled } from '@element-plus/icons-vue'
import type { DocNode } from '../types'
import { TREE_CTX } from './tree-context'

const props = defineProps<{ node: DocNode; depth: number }>()
const ctx = inject(TREE_CTX)!

const open = computed(() => props.node.type === 'folder' && ctx.expanded.value.includes(props.node.id))
const active = computed(() => ctx.activeId.value === props.node.id)
const dragOver = ref(false)

/* ---------------- 内联重命名 ---------------- */

const editing = computed(() => ctx.renamingId.value === props.node.id)
const draft = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
/** 本次编辑是否已收尾（提交 / 取消 / 失焦 三者只允许生效一次） */
let finished = false

watch(editing, async (on) => {
  if (!on) return
  draft.value = props.node.name
  finished = false
  await nextTick()
  const el = inputEl.value
  if (!el) return
  // 先聚焦再全选：直接 select() 在部分 Chromium 版本里不会同时抢到焦点
  el.focus()
  el.select()
})

function finishEdit(save: boolean) {
  if (finished) return
  finished = true
  const name = draft.value.trim()
  const original = props.node.name
  ctx.onEndRename()
  if (!save) return
  if (!name) {
    ElMessage.warning('名称不能为空')
    return
  }
  if (name === original) return
  ctx.onCommitRename(props.node, name)
}

function onRenameKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    // 中文输入法上屏时的回车是在确认候选词，不能当成提交
    if (e.isComposing) return
    e.preventDefault()
    finishEdit(true)
  } else if (e.key === 'Escape') {
    e.preventDefault()
    finishEdit(false)
  } else if (e.key === 'Tab') {
    e.preventDefault()
    finishEdit(true)
  }
}

/* ---------------- 单击 / 双击 ---------------- */

/**
 * 文件夹的单击延迟 250ms 才切换展开态。
 * 双击必然先来两次 click，延迟后这两次 click 会被 dblclick 取消掉，
 * 于是双击改名时文件夹不会「展开→收起」闪一下。
 * 文件单击没有副作用（open 幂等），所以不延迟，保持手感。
 */
let folderTimer: number | null = null

function clearFolderTimer() {
  if (folderTimer != null) {
    window.clearTimeout(folderTimer)
    folderTimer = null
  }
}

function onClick() {
  if (editing.value) return
  if (props.node.type === 'file') {
    ctx.onOpen(props.node)
    return
  }
  if (folderTimer != null) return
  folderTimer = window.setTimeout(() => {
    folderTimer = null
    ctx.onToggle(props.node)
  }, 250)
}

function onDblClick(e: MouseEvent) {
  e.stopPropagation()
  clearFolderTimer()
  if (editing.value) return
  ctx.onRename(props.node)
}

onBeforeUnmount(clearFolderTimer)

function onContext(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const menu = [
    { label: '打开', run: () => (props.node.type === 'folder' ? ctx.onToggle(props.node) : ctx.onOpen(props.node)) },
    ...(props.node.type === 'folder'
      ? [
          { label: '新建文档', run: () => ctx.onNewDoc(props.node.id) },
          { label: '新建文件夹', run: () => ctx.onNewFolder(props.node.id) }
        ]
      : []),
    { label: '重命名', run: () => ctx.onRename(props.node) },
    { label: '编辑标签…', run: () => ctx.onTags(props.node) },
    {
      label: props.node.favorite ? '取消收藏' : '加入收藏',
      run: () => ctx.onFavorite(props.node)
    },
    { label: '在文件夹中显示', run: () => ctx.onReveal(props.node) },
    { label: '删除（移入回收站）', run: () => ctx.onDelete(props.node) }
  ]
  window.dispatchEvent(new CustomEvent('mdnotes:contextmenu', { detail: { x: e.clientX, y: e.clientY, menu } }))
}

function onDragStart(e: DragEvent) {
  if (editing.value) {
    e.preventDefault()
    return
  }
  ctx.dragId.value = props.node.id
  e.dataTransfer?.setData('text/plain', props.node.id)
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  if (props.node.type !== 'folder') return
  if (!ctx.dragId.value || ctx.dragId.value === props.node.id) return
  e.preventDefault()
  dragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
}

function onDrop(e: DragEvent) {
  if (props.node.type !== 'folder') return
  e.preventDefault()
  e.stopPropagation()
  dragOver.value = false
  const id = ctx.dragId.value
  if (id && id !== props.node.id) ctx.onMove(id, props.node.id)
  ctx.dragId.value = ''
}

function onDragLeave() {
  dragOver.value = false
}
</script>

<template>
  <div>
    <div
      class="tree-node"
      :class="{ 'is-active': active, 'is-dragover': dragOver, 'is-editing': editing }"
      :style="{ paddingLeft: `${6 + depth * 14}px` }"
      :draggable="!editing"
      @click="onClick"
      @dblclick="onDblClick"
      @contextmenu="onContext"
      @dragstart="onDragStart"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <span
        class="tree-caret"
        :class="{ leaf: node.type === 'file' }"
        @click.stop="ctx.onToggle(node)"
      >
        {{ open ? '▾' : '▸' }}
      </span>
      <el-icon :size="14" :color="node.type === 'folder' ? '#e0a825' : 'var(--text-3)'">
        <FolderOpened v-if="open" />
        <Folder v-else-if="node.type === 'folder'" />
        <Document v-else />
      </el-icon>
      <input
        v-if="editing"
        ref="inputEl"
        v-model="draft"
        class="rename-input"
        type="text"
        spellcheck="false"
        autocomplete="off"
        @keydown.stop="onRenameKeydown"
        @blur="finishEdit(true)"
        @click.stop
        @mousedown.stop
        @dblclick.stop
      />
      <template v-else>
        <span class="label" :title="node.id">{{ node.name }}</span>
        <el-icon v-if="node.favorite" :size="12" color="#e6a23c"><StarFilled /></el-icon>
        <span class="tree-dot" v-if="ctx.dirtyIds.value.includes(node.id)" />
        <span class="row-actions">
          <el-icon :size="14" @click.stop="onContext($event as MouseEvent)"><MoreFilled /></el-icon>
        </span>
      </template>
    </div>

    <template v-if="node.type === 'folder' && open">
      <TreeNode v-for="child in node.children" :key="child.id" :node="child" :depth="depth + 1" />
      <div
        v-if="!node.children.length"
        class="tree-node muted"
        :style="{ paddingLeft: `${20 + depth * 14}px`, fontSize: '12px', cursor: 'default' }"
      >
        空文件夹
      </div>
    </template>
  </div>
</template>
