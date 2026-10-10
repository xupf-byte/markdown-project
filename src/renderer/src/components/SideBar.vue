<script setup lang="ts">
import { computed, provide, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Document,
  FolderAdd,
  FolderOpened,
  Link,
  Plus,
  Refresh,
  StarFilled,
  Upload
} from '@element-plus/icons-vue'
import { useVaultStore } from '../stores/vault'
import { revealExternalFile, type ExternalDoc } from '../storage'
import type { DocNode } from '../types'
import { TREE_CTX } from './tree-context'
import TreeNode from './TreeNode.vue'

const emit = defineEmits<{ (e: 'open-search'): void; (e: 'open-trash'): void }>()

const vault = useVaultStore()

const filter = ref('')
const dragId = ref('')
const rootDragOver = ref(false)

/* ---------------- 树上下文 ---------------- */

provide(TREE_CTX, {
  activeId: computed(() => vault.currentId),
  expanded: computed(() => vault.expanded),
  dirtyIds: computed(() => vault.dirtyIds),
  dragId,

  onOpen(node) {
    vault.open(node.id)
  },

  onToggle(node) {
    if (node.type === 'folder') vault.toggleExpand(node.id)
  },

  onNewDoc(parentId) {
    vault
      .createNode('file', parentId)
      .then(() => ElMessage.success('已新建文档'))
      .catch((e) => ElMessage.error(String(e?.message ?? e)))
  },

  onNewFolder(parentId) {
    vault
      .createNode('folder', parentId)
      .then(() => ElMessage.success('已新建文件夹'))
      .catch((e) => ElMessage.error(String(e?.message ?? e)))
  },

  async onRename(node) {
    try {
      const { value } = await ElMessageBox.prompt('输入新的名称', '重命名', {
        inputValue: node.name,
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        inputValidator: (v: string) => (v && v.trim() ? true : '名称不能为空')
      })
      await vault.renameNode(node.id, value.trim())
      ElMessage.success('已重命名')
    } catch (e: any) {
      if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message))
    }
  },

  async onDelete(node) {
    try {
      await ElMessageBox.confirm(
        node.type === 'folder'
          ? `将「${node.name}」及其中的所有内容移入回收站？`
          : `将「${node.name}」移入回收站？`,
        '删除确认',
        { type: 'warning', confirmButtonText: '移入回收站', cancelButtonText: '取消' }
      )
      await vault.deleteNode(node.id)
      ElMessage.success('已移入回收站，可在回收站中恢复')
    } catch (e: any) {
      if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message))
    }
  },

  async onTags(node) {
    const current = (vault.files.find((f) => f.id === node.id)?.tags ?? []).join(', ')
    try {
      const { value } = await ElMessageBox.prompt('多个标签用英文逗号分隔', '编辑标签', {
        inputValue: current,
        confirmButtonText: '保存',
        cancelButtonText: '取消'
      })
      await vault.setTags(node.id, value.split(',').map((s) => s.trim()).filter(Boolean))
      ElMessage.success('标签已更新')
    } catch (e: any) {
      if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message))
    }
  },

  async onFavorite(node) {
    await vault.toggleFavorite(node.id)
  },

  onReveal(node) {
    if (window.api?.isElectron) window.api.showItemInFolder(node.id)
    else ElMessage.info('浏览器版本暂不支持打开所在目录')
  },

  async onMove(id, target) {
    try {
      await vault.moveNode(id, target)
      ElMessage.success('已移动')
    } catch (e: any) {
      ElMessage.error(String(e?.message ?? e))
    }
  }
})

/* ---------------- 本地派生数据 ---------------- */

const keyword = computed(() => filter.value.trim().toLowerCase())

/** 带过滤的文件树（仅前端过滤，保留匹配项的父链） */
const filteredTree = computed<DocNode[]>(() => {
  const kw = keyword.value
  if (!kw) return vault.tree
  const filterNode = (nodes: DocNode[]): DocNode[] => {
    const out: DocNode[] = []
    for (const n of nodes) {
      if (n.type === 'file') {
        if (n.name.toLowerCase().includes(kw)) out.push(n)
      } else {
        const kids = filterNode(n.children)
        if (kids.length || n.name.toLowerCase().includes(kw)) out.push({ ...n, children: kids })
      }
    }
    return out
  }
  return filterNode(vault.tree)
})

const isEmpty = computed(() => vault.tree.length === 0)

async function onRootDrop(e: DragEvent) {
  e.preventDefault()
  rootDragOver.value = false
  if (dragId.value) await vault.moveNode(dragId.value, null)
  dragId.value = ''
}

function newNode(type: 'file' | 'folder') {
  vault.createNode(type, null)
}

async function doImport() {
  const n = await vault.importMarkdowns(null)
  if (n) ElMessage.success(`已导入 ${n} 个文件`)
}

async function doSwitch() {
  const ok = await vault.switchWorkspace()
  if (ok) ElMessage.success('工作区已切换')
}

async function doOpenFile() {
  try {
    const n = await vault.pickExternal()
    if (n) ElMessage.success(`已打开 ${n} 个工作区外的文件`)
  } catch (e: any) {
    ElMessage.error(String(e?.message ?? e))
  }
}

function onRevealExternal(doc: ExternalDoc) {
  if (doc.missing) return ElMessage.warning('文件已不在原位置')
  revealExternalFile(doc.absPath)
}
</script>

<template>
  <aside class="sidebar">
    <div class="side-head">
      <el-tooltip content="新建文档 (⌘N)" placement="bottom">
        <el-button size="small" :icon="Document" @click="newNode('file')" />
      </el-tooltip>
      <el-tooltip content="新建文件夹 (⇧⌘N)" placement="bottom">
        <el-button size="small" :icon="FolderAdd" @click="newNode('folder')" />
      </el-tooltip>
      <div class="side-actions">
        <el-tooltip content="打开文件 (⌘O)" placement="bottom">
          <el-button size="small" :icon="Link" :disabled="!vault.isElectron" @click="doOpenFile" />
        </el-tooltip>
        <el-tooltip content="导入 Markdown" placement="bottom">
          <el-button size="small" :icon="Upload" @click="doImport" />
        </el-tooltip>
        <el-tooltip content="打开工作区" placement="bottom">
          <el-button size="small" :icon="FolderOpened" :disabled="!vault.isElectron" @click="doSwitch" />
        </el-tooltip>
        <el-tooltip content="刷新" placement="bottom">
          <el-button size="small" :icon="Refresh" @click="vault.refresh()" />
        </el-tooltip>
      </div>
    </div>

    <div style="padding: 0 10px 8px">
      <el-input
        v-model="filter"
        size="small"
        placeholder="筛选文件树"
        clearable
        @keydown.enter="emit('open-search')"
      />
    </div>

    <div class="tree-scroll" @dragover.prevent="rootDragOver = true" @dragleave="rootDragOver = false" @drop="onRootDrop">
      <div v-if="vault.favorites.length" class="side-section-title">收藏</div>
      <div
        v-for="f in vault.favorites"
        :key="`fav-${f.id}`"
        class="tree-node"
        :class="{ 'is-active': f.id === vault.currentId }"
        :style="{ paddingLeft: '8px' }"
        @click="vault.open(f.id)"
      >
        <el-icon :size="12" color="#e6a23c"><StarFilled /></el-icon>
        <span class="label">{{ f.name }}</span>
      </div>

      <div v-if="vault.allTags.length" class="side-section-title">标签</div>
      <div v-if="vault.allTags.length" style="display: flex; flex-wrap: wrap; gap: 6px; padding: 2px 8px 6px">
        <span
          v-for="t in vault.allTags"
          :key="t.tag"
          class="badge"
          style="cursor: pointer"
          @click="filter = t.tag"
        >
          {{ t.tag }} · {{ t.count }}
        </span>
      </div>

      <template v-if="vault.externalDocs.length">
        <div class="side-section-title">外部文件</div>
        <div
          v-for="d in vault.externalDocs"
          :key="d.id"
          class="ext-node"
          :class="{ 'is-active': d.id === vault.currentId }"
          :title="d.absPath"
          @click="vault.open(d.id)"
          @contextmenu.prevent="onRevealExternal(d)"
        >
          <el-icon :size="12" :color="d.missing ? '#e6a23c' : '#409eff'"><Link /></el-icon>
          <div class="ext-text">
            <div class="ext-name">{{ d.name }}</div>
            <div class="ext-dir">{{ d.missing ? '文件已不在原位置' : d.dir }}</div>
          </div>
        </div>
        <div class="muted" style="font-size: 11px; padding: 2px 12px 6px">
          在工作区外，改动会直接写回原文件
        </div>
      </template>

      <div class="side-section-title">文件</div>

      <div v-if="isEmpty" class="empty-hint">
        <p class="muted" style="font-size: 12.5px; line-height: 1.9; padding: 0 10px">
          还没有任何文档<br />点击上方 <el-icon :size="12"><Plus /></el-icon> 新建，或导入已有 Markdown
        </p>
      </div>

      <template v-else>
        <TreeNode v-for="node in filteredTree" :key="node.id" :node="node" :depth="0" />
        <div
          v-if="filteredTree.length === 0"
          class="muted"
          style="font-size: 12px; padding: 8px 12px"
        >
          没有匹配「{{ filter }}」的文件
        </div>
      </template>
    </div>

    <div class="side-foot">
      <el-button text size="small" :icon="Delete" @click="emit('open-trash')">
        回收站
        <span v-if="vault.trashItems.length" class="badge" style="margin-left: 4px">
          {{ vault.trashItems.length }}
        </span>
      </el-button>
    </div>
  </aside>
</template>

<style scoped>
.side-foot {
  flex: 0 0 auto;
  border-top: 1px solid var(--border);
  padding: 6px 8px;
}

.ext-node {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 6px 2px;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
}
.ext-node:hover,
.ext-node.is-active {
  background: var(--bg-hover);
}
.ext-text {
  min-width: 0;
  flex: 1;
}
.ext-name {
  font-size: 13px;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ext-dir {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
