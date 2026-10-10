<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { Document, Folder, FolderOpened, MoreFilled, StarFilled } from '@element-plus/icons-vue'
import type { DocNode } from '../types'
import { TREE_CTX } from './tree-context'

const props = defineProps<{ node: DocNode; depth: number }>()
const ctx = inject(TREE_CTX)!

const open = computed(() => props.node.type === 'folder' && ctx.expanded.value.includes(props.node.id))
const active = computed(() => ctx.activeId.value === props.node.id)
const dragOver = ref(false)

function onClick(e: MouseEvent) {
  if (props.node.type === 'folder') ctx.onToggle(props.node)
  else ctx.onOpen(props.node)
}

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
      :class="{ 'is-active': active, 'is-dragover': dragOver }"
      :style="{ paddingLeft: `${6 + depth * 14}px` }"
      draggable="true"
      @click="onClick"
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
      <span class="label" :title="node.id">{{ node.name }}</span>
      <el-icon v-if="node.favorite" :size="12" color="#e6a23c"><StarFilled /></el-icon>
      <span class="tree-dot" v-if="ctx.dirtyIds.value.includes(node.id)" />
      <span class="row-actions">
        <el-icon :size="14" @click.stop="onContext($event as MouseEvent)"><MoreFilled /></el-icon>
      </span>
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
