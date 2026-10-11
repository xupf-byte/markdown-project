<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Document, FolderAdd, Link, Search } from '@element-plus/icons-vue'
import { useVaultStore } from './stores/vault'
import { useSettingsStore } from './stores/settings'
import TitleBar from './components/TitleBar.vue'
import SideBar from './components/SideBar.vue'
import TabBar from './components/TabBar.vue'
import MarkdownToolbar from './components/MarkdownToolbar.vue'
import EditorPane from './components/EditorPane.vue'
import PreviewPane from './components/PreviewPane.vue'
import OutlinePanel from './components/OutlinePanel.vue'
import StatusBar from './components/StatusBar.vue'
import SearchDialog from './components/SearchDialog.vue'
import TrashDialog from './components/TrashDialog.vue'
import SettingsDialog from './components/SettingsDialog.vue'

const vault = useVaultStore()
const settings = useSettingsStore()

const editorRef = ref<InstanceType<typeof EditorPane> | null>(null)
const previewRef = ref<InstanceType<typeof PreviewPane> | null>(null)

const showSearch = ref(false)
const showTrash = ref(false)
const showSettings = ref(false)

/** 取消订阅主进程转发的「打开方式」文件 */
let offOpenFiles: (() => void) | null = null

const mode = computed(() => settings.previewMode)
const showEditor = computed(() => !!vault.currentId && mode.value !== 'preview')
const showPreview = computed(() => !!vault.currentId && mode.value !== 'edit')

/* ---------------- 滚动同步 ---------------- */

let scrollLock = false

function onEditorScroll(ratio: number) {
  if (scrollLock || mode.value !== 'split') return
  scrollLock = true
  previewRef.value?.scrollToRatio(ratio)
  requestAnimationFrame(() => (scrollLock = false))
}

function onPreviewScroll(ratio: number) {
  if (scrollLock || mode.value !== 'split') return
  scrollLock = true
  editorRef.value?.scrollToRatio(ratio)
  requestAnimationFrame(() => (scrollLock = false))
}

async function onOutlineJump(id: string, line: number) {
  if (line) {
    vault.jumpLine = line
    return
  }
  previewRef.value?.scrollToId(id)
}

/* ---------------- 工具栏 ---------------- */

function onToolbarCmd(name: string, value?: string) {
  editorRef.value?.handleCmd(name, value)
}

/* ---------------- 当前节点操作 ---------------- */

async function renameCurrent() {
  const node = vault.currentNode
  if (!node) return
  try {
    const { value } = await ElMessageBox.prompt('输入新的名称', '重命名', {
      inputValue: node.name,
      confirmButtonText: '确定',
      cancelButtonText: '取消'
    })
    await vault.renameNode(node.id, value.trim())
    ElMessage.success('已重命名')
  } catch (e: any) {
    if (e !== 'cancel' && e?.message) ElMessage.error(String(e.message))
  }
}

async function deleteCurrent() {
  const node = vault.currentNode
  if (!node) return
  try {
    await ElMessageBox.confirm(`将「${node.name}」移入回收站？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '移入回收站',
      cancelButtonText: '取消'
    })
    await vault.deleteNode(node.id)
    ElMessage.success('已移入回收站')
  } catch {
    /* 取消 */
  }
}

/* ---------------- 菜单 / 快捷键 ---------------- */

async function runAction(action: string) {
  switch (action) {
    case 'new-doc':
      await vault.createNode('file', null)
      break
    case 'new-folder':
      await vault.createNode('folder', null)
      break
    case 'rename':
      await renameCurrent()
      break
    case 'delete':
      await deleteCurrent()
      break
    case 'save':
      await vault.saveAll()
      ElMessage.success('已保存')
      break
    case 'search':
    case 'replace':
      showSearch.value = true
      break
    case 'trash':
      showTrash.value = true
      break
    case 'settings':
      showSettings.value = true
      break
    case 'toggle-sidebar':
      settings.toggleSidebar()
      break
    case 'toggle-outline':
      settings.toggleOutline()
      break
    case 'toggle-preview':
      settings.setPreviewMode(mode.value === 'split' ? 'preview' : mode.value === 'preview' ? 'edit' : 'split')
      break
    case 'toggle-theme':
      settings.cycleTheme()
      break
    case 'export':
      await exportAs()
      break
    case 'import':
      await doImport()
      break
    case 'open-file':
      await openExternal()
      break
    case 'choose-vault':
      await chooseVault()
      break
    case 'about':
      ElMessage.info('飞儿MD v0.1.0 · Electron + Vue 3')
      break
  }
}

async function exportAs() {
  if (!vault.currentId) return ElMessage.warning('请先打开一个文档')
  try {
    const { value } = await ElMessageBox.prompt('选择导出格式', '导出', {
      inputType: 'radio',
      inputValue: 'md',
      inputOptions: [
        { label: 'Markdown (.md)', value: 'md' },
        { label: 'HTML (.html)', value: 'html' },
        { label: 'PDF（系统打印）', value: 'pdf' }
      ],
      confirmButtonText: '导出',
      cancelButtonText: '取消'
    })
    if (value === 'md') await vault.exportMarkdown()
    else if (value === 'html') await vault.exportHtml()
    else await vault.exportPdf()
  } catch {
    /* 取消 */
  }
}

async function doImport() {
  const n = await vault.importMarkdowns(null)
  if (n) ElMessage.success(`已导入 ${n} 个文件`)
}

/** 打开工作区外的文件（原地读写原文件） */
async function openExternal() {
  try {
    const n = await vault.pickExternal()
    if (n) ElMessage.success(`已打开 ${n} 个工作区外的文件`)
  } catch (e: any) {
    ElMessage.error(String(e?.message ?? e))
  }
}

async function chooseVault() {
  if (!vault.isElectron) return ElMessage.info('浏览器预览模式不支持切换工作区')
  const ok = await vault.switchWorkspace()
  if (ok) ElMessage.success('工作区已切换')
}

/** 访达「打开方式」把文件交给应用时，由主进程转发到这里 */
async function onSystemOpenFiles(files: { path: string; name: string }[]) {
  if (!files.length) return
  try {
    const n = await vault.openExternalFiles(files)
    if (n) ElMessage.success(`已打开 ${n} 个文件`)
  } catch (e: any) {
    ElMessage.error(String(e?.message ?? e))
  }
}

function onGlobalKeydown(e: KeyboardEvent) {
  if (window.api?.isElectron) return
  const mod = e.metaKey || e.ctrlKey
  if (!mod) return
  const key = e.key.toLowerCase()
  const map: Record<string, string> = {
    n: e.shiftKey ? 'new-folder' : 'new-doc',
    f: 'search',
    e: 'export',
    i: 'import',
    o: e.shiftKey ? 'choose-vault' : 'open-file',
    s: 'save',
    p: 'toggle-preview',
    j: 'toggle-theme',
    b: 'toggle-sidebar'
  }
  const action = map[key]
  if (action) {
    e.preventDefault()
    runAction(action)
  }
}

/* ---------------- 右键菜单 ---------------- */

interface CtxMenu {
  x: number
  y: number
  menu: { label: string; run: () => void }[]
}
const ctx = ref<CtxMenu | null>(null)

function onContextMenuEvent(e: Event) {
  const detail = (e as CustomEvent).detail as CtxMenu
  ctx.value = detail
}

function closeCtx() {
  ctx.value = null
}

const ctxStyle = computed(() => {
  if (!ctx.value) return {}
  const maxLeft = Math.max(8, window.innerWidth - 230)
  const maxTop = Math.max(8, window.innerHeight - ctx.value.menu.length * 34 - 16)
  return {
    left: `${Math.min(ctx.value.x, maxLeft)}px`,
    top: `${Math.min(ctx.value.y, maxTop)}px`
  }
})

function runCtx(item: { run: () => void }) {
  closeCtx()
  item.run()
}

/* ---------------- 生命周期 ---------------- */

async function onBeforeUnload() {
  await vault.saveAll()
}

onMounted(async () => {
  settings.init()
  await vault.boot()
  await vault.loadTrash()
  window.addEventListener('mdnotes:contextmenu', onContextMenuEvent)
  window.addEventListener('click', closeCtx)
  window.addEventListener('keydown', onGlobalKeydown)
  window.addEventListener('beforeunload', onBeforeUnload)

  if (window.api?.isElectron) {
    // 先挂监听，再告诉主进程「已就绪」——冷启动时系统投递的文件这时才会补发过来
    offOpenFiles = window.api.onOpenFiles(onSystemOpenFiles)
    await window.api.notifyReady()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('mdnotes:contextmenu', onContextMenuEvent)
  window.removeEventListener('click', closeCtx)
  window.removeEventListener('keydown', onGlobalKeydown)
  window.removeEventListener('beforeunload', onBeforeUnload)
  offOpenFiles?.()
})
</script>

<template>
  <div class="app-shell">
    <TitleBar @open-settings="showSettings = true" />

    <div class="body-row">
      <SideBar
        v-if="settings.sidebarVisible"
        @open-search="showSearch = true"
        @open-trash="showTrash = true"
      />

      <div class="workbench">
        <TabBar />

        <MarkdownToolbar v-if="vault.currentId" @cmd="onToolbarCmd" />

        <div v-if="vault.currentExternal?.missing" class="ext-warn">
          <span>原文件已不在 <code>{{ vault.currentExternal.absPath }}</code>，保存时会重新创建</span>
          <el-button size="small" text @click="vault.reloadCurrentExternal()">重试读取</el-button>
        </div>

        <div class="split-row">
          <template v-if="vault.currentId">
            <div v-if="showEditor" class="pane pane-editor">
              <EditorPane ref="editorRef" @scroll="onEditorScroll" />
            </div>
            <div v-if="showPreview" class="pane pane-preview">
              <PreviewPane ref="previewRef" @scroll="onPreviewScroll" />
            </div>
            <OutlinePanel v-if="settings.outlineVisible" @jump="onOutlineJump" />
          </template>

          <div v-else class="empty-state">
            <el-icon :size="42" color="var(--text-3)"><Document /></el-icon>
            <h3>还没有打开任何文档</h3>
            <p>
              从左侧选择一个文件，或新建一篇笔记开始写作<br />
              支持 GFM 表格 · 任务列表 · 代码高亮 · KaTeX 公式 · Mermaid 图表
            </p>
            <div style="display: flex; gap: 10px; margin-top: 6px">
              <el-button type="primary" :icon="Document" @click="runAction('new-doc')">
                新建文档
              </el-button>
              <el-button :icon="FolderAdd" @click="runAction('new-folder')">新建文件夹</el-button>
              <el-button v-if="vault.isElectron" :icon="Link" @click="openExternal">打开文件</el-button>
              <el-button :icon="Search" @click="showSearch = true">搜索</el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <StatusBar />

    <SearchDialog v-model="showSearch" @jump="onOutlineJump" />
    <TrashDialog v-model="showTrash" />
    <SettingsDialog v-model="showSettings" />

    <div
      v-if="ctx"
      class="ctx-menu"
      :style="ctxStyle"
      @click.stop
    >
      <button v-for="(item, i) in ctx.menu" :key="i" class="ctx-item" @click="runCtx(item)">
        {{ item.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.pane-preview {
  overflow: hidden;
}

.ext-warn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px;
  font-size: 12.5px;
  color: #b07b12;
  background: rgba(230, 162, 60, 0.12);
  border-bottom: 1px solid var(--border);
}
.ext-warn code {
  font-size: 12px;
}

.ctx-menu {
  position: fixed;
  z-index: 4000;
  min-width: 200px;
  padding: 5px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: var(--shadow);
}
.ctx-item {
  display: block;
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  color: var(--text-1);
  font-size: 13px;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.ctx-item:hover {
  background: var(--bg-hover);
}
</style>
