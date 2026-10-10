import { defineStore } from 'pinia'
import {
  ASSETS_DIR,
  createVault,
  externalPath,
  externalSupported,
  externalToNode,
  isExternalId,
  makeExternalDoc,
  pickExternalFiles,
  readExternalBinary,
  readExternalFile,
  relativeInside,
  revealExternalFile,
  statExternalFile,
  switchVault,
  toExternalId,
  VaultStorage,
  writeExternalBinary,
  writeExternalFile,
  type ExternalDoc,
  type ExternalFile
} from '../storage'
import { parentOf } from '../storage/fslike'
import { relativeTo } from '../storage/paths'
import { useSettingsStore } from './settings'
import type { DocNode, NodeType, OutlineItem, SearchHit, TrashItem } from '../types'
import { buildOutline, renderMarkdown, statsOf } from '../services/markdown'
import { buildStandaloneHtml, exportPdf, exportText, importFiles } from '../services/exporter'

/** 存储实例不放进 Pinia state，避免被响应式代理包裹 */
let storage: VaultStorage | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null

export const useVaultStore = defineStore('vault', {
  state: () => ({
    ready: false,
    backend: '',
    root: '',
    isElectron: false,

    tree: [] as DocNode[],
    expanded: [] as string[],
    allTags: [] as { tag: string; count: number }[],

    currentId: '',
    openTabs: [] as string[],

    /** 工作区外的文档：id(`ext:<绝对路径>`) -> 元信息；是否显示取决于它是否在 openTabs 中 */
    externalMap: {} as Record<string, ExternalDoc>,

    content: '',
    /** 未落盘的草稿：id -> 内容 */
    buffers: {} as Record<string, string>,
    saving: false,
    lastSavedAt: 0,

    renderedHtml: '',
    outline: [] as OutlineItem[],

    searchKeyword: '',
    searchResults: [] as SearchHit[],
    searching: false,

    trashItems: [] as TrashItem[],

    /** 编辑区跳转到指定行的请求 */
    jumpLine: 0,
    statusText: ''
  }),

  getters: {
    /** 扁平化的文件列表（工作区文档 + 当前打开的外部文件） */
    files(state): DocNode[] {
      const out: DocNode[] = []
      const visit = (list: DocNode[]) => {
        for (const n of list) {
          if (n.type === 'file') out.push(n)
          else visit(n.children)
        }
      }
      visit(state.tree)
      for (const id of state.openTabs) {
        const doc = state.externalMap[id]
        if (doc) out.push(externalToNode(doc))
      }
      return out
    },

    /** 当前打开的工作区外文档 */
    externalDocs(state): ExternalDoc[] {
      return state.openTabs
        .map((id) => state.externalMap[id])
        .filter((d): d is ExternalDoc => !!d)
    },

    /** 当前文档是否是工作区外的文件 */
    currentIsExternal(state): boolean {
      return isExternalId(state.currentId)
    },

    /** 当前文档若是外部文件，返回它的元信息 */
    currentExternal(state): ExternalDoc | null {
      if (!isExternalId(state.currentId)) return null
      return state.externalMap[state.currentId] ?? null
    },

    /** 当前文件所在位置：外部文件显示其目录，工作区文档显示工作区根 */
    currentLocation(state): string {
      if (isExternalId(state.currentId)) {
        return state.externalMap[state.currentId]?.dir ?? ''
      }
      return state.root
    },

    currentNode(state): DocNode | null {
      return this.files.find((f) => f.id === state.currentId) ?? null
    },

    currentTitle(state): string {
      const n = this.files.find((f) => f.id === state.currentId)
      return n?.name ?? '未命名'
    },

    dirtyIds(state): string[] {
      return Object.keys(state.buffers)
    },

    isDirty(state): boolean {
      return !!state.currentId && state.buffers[state.currentId] != null
    },

    stats(state) {
      return statsOf(state.content)
    },

    saveState(state): 'empty' | 'saving' | 'dirty' | 'saved' {
      if (!state.currentId) return 'empty'
      if (state.saving) return 'saving'
      if (state.buffers[state.currentId] != null) return 'dirty'
      return 'saved'
    },

    favorites(state): DocNode[] {
      const out: DocNode[] = []
      const visit = (list: DocNode[]) => {
        for (const n of list) {
          if (n.type === 'file' && n.favorite) out.push(n)
          if (n.type === 'folder') visit(n.children)
        }
      }
      visit(state.tree)
      return out
    },

    recentFiles(state): DocNode[] {
      return this.files
        .slice()
        .sort((a, b) => b.mtime - a.mtime)
        .slice(0, 12)
    }
  },

  actions: {
    /* ---------------- 启动 ---------------- */

    async boot() {
      const info = await createVault()
      storage = info.vault
      this.backend = info.backend
      this.root = info.root
      this.isElectron = info.isElectron
      this.expanded = storage.expandedPaths()
      await this.refresh()
      this.ready = true
      if (!this.currentId && this.files.length) {
        await this.open(this.files[0].id)
      }
    },

    async switchWorkspace() {
      const info = await switchVault()
      if (!info) return false
      storage = info.vault
      this.backend = info.backend
      this.root = info.root
      this.expanded = storage.expandedPaths()
      // 外部文件与工作区无关，切工作区时保持打开
      const keepTabs = this.openTabs.filter(isExternalId)
      const keepMap: Record<string, ExternalDoc> = {}
      for (const id of keepTabs) if (this.externalMap[id]) keepMap[id] = this.externalMap[id]
      this.currentId = ''
      this.openTabs = keepTabs
      this.externalMap = keepMap
      this.buffers = Object.fromEntries(
        Object.entries(this.buffers).filter(([k]) => isExternalId(k))
      )
      this.content = ''
      await this.refresh()
      if (this.files.length) await this.open(this.files[0].id)
      return true
    },

    async refresh() {
      if (!storage) return
      this.tree = await storage.tree()
      this.allTags = storage.allTags()
    },

    /* ---------------- 打开 / 切换 ---------------- */

    async open(id: string) {
      if (isExternalId(id)) {
        const doc = this.externalMap[id]
        if (!doc) return
        if (!this.openTabs.includes(id)) this.openTabs.push(id)
        this.currentId = id
        const draft = this.buffers[id]
        if (draft != null) {
          this.content = draft
        } else {
          try {
            this.content = await readExternalFile(doc.absPath)
            this.patchExternal(id, { missing: false })
          } catch {
            this.content = ''
            this.patchExternal(id, { missing: true })
          }
        }
        this.renderNow()
        return
      }
      if (!storage) return
      if (!this.openTabs.includes(id)) this.openTabs.push(id)
      this.currentId = id
      const draft = this.buffers[id]
      this.content = draft != null ? draft : await storage.read(id)
      this.renderNow()
    },

    async closeTab(id: string) {
      if (this.buffers[id] != null) await this.save(id)
      this.openTabs = this.openTabs.filter((t) => t !== id)
      if (isExternalId(id)) this.forgetExternal(id)
      if (this.currentId === id) {
        const next = this.openTabs[this.openTabs.length - 1]
        if (next) await this.open(next)
        else {
          this.currentId = ''
          this.content = ''
          this.renderedHtml = ''
          this.outline = []
        }
      }
    },

    closeOtherTabs(id: string) {
      const keepExternal = this.externalMap[id]
      this.openTabs = [id]
      this.externalMap = keepExternal ? { [id]: keepExternal } : {}
      if (this.currentId !== id) this.open(id)
    },

    /* ---------------- 新建 / 重命名 / 移动 / 删除 ---------------- */

    async createNode(type: NodeType, parentId: string | null = null, name?: string) {
      if (!storage) return null
      const defaultName = type === 'folder' ? '新建文件夹' : '未命名文档'
      const id = await storage.create(parentId, name || defaultName, type, '')
      await this.refresh()
      if (parentId) await this.expand(parentId)
      if (type === 'file') await this.open(id)
      return id
    },

    async renameNode(id: string, name: string) {
      if (isExternalId(id)) throw new Error('这是工作区外的文件，请在「访达」中重命名')
      if (!storage) return
      const newId = await storage.rename(id, name)
      await this.refresh()
      if (this.currentId === id) {
        this.currentId = newId
        const buffers = { ...this.buffers }
        if (buffers[id] != null) {
          buffers[newId] = buffers[id]
          delete buffers[id]
          this.buffers = buffers
        }
      }
      this.openTabs = this.openTabs.map((t) => (t === id ? newId : t))
    },

    async moveNode(id: string, newParentId: string | null) {
      if (!storage) return
      const newId = await storage.move(id, newParentId)
      await this.refresh()
      if (newParentId) await this.expand(newParentId)
      const remap = (p: string) => (p === id ? newId : p.startsWith(`${id}/`) ? newId + p.slice(id.length) : p)
      this.openTabs = this.openTabs.map(remap)
      if (this.currentId) this.currentId = remap(this.currentId)
    },

    async deleteNode(id: string) {
      if (isExternalId(id)) throw new Error('工作区外的文件不会移入回收站，请在「访达」中处理')
      if (!storage) return
      await storage.trash(id)
      const affected = this.openTabs.filter((t) => t === id || t.startsWith(`${id}/`))
      for (const t of affected) {
        const buffers = { ...this.buffers }
        delete buffers[t]
        this.buffers = buffers
      }
      this.openTabs = this.openTabs.filter((t) => t !== id && !t.startsWith(`${id}/`))
      if (this.currentId === id || this.currentId.startsWith(`${id}/`)) {
        const next = this.openTabs[this.openTabs.length - 1]
        this.currentId = ''
        if (next) await this.open(next)
        else {
          this.content = ''
          this.renderedHtml = ''
          this.outline = []
        }
      }
      await this.refresh()
    },

    /* ---------------- 编辑与保存 ---------------- */

    setContent(text: string) {
      this.content = text
      if (this.currentId) {
        this.buffers = { ...this.buffers, [this.currentId]: text }
        this.scheduleSave()
      }
      this.scheduleRender()
    },

    scheduleSave() {
      if (!useSettingsStore().autoSave) return
      if (saveTimer) clearTimeout(saveTimer)
      saveTimer = setTimeout(() => this.save(), 600)
    },

    async save(id?: string) {
      const target = id ?? this.currentId
      if (!target) return
      const pending = this.buffers[target]
      if (pending == null) return
      if (!id) this.saving = true
      try {
        if (isExternalId(target)) {
          // 外部文件原地写回，不经过工作区
          const doc = this.externalMap[target]
          if (!doc) return
          const st = await writeExternalFile(doc.absPath, pending)
          this.patchExternal(target, { mtime: st.mtime, size: st.size, missing: false })
        } else {
          if (!storage) return
          await storage.write(target, pending)
          const node = this.files.find((f) => f.id === target)
          if (node) node.mtime = Date.now()
        }
        const next = { ...this.buffers }
        delete next[target]
        this.buffers = next
        this.lastSavedAt = Date.now()
      } finally {
        if (!id) this.saving = false
      }
    },

    async saveAll() {
      for (const id of Object.keys(this.buffers)) await this.save(id)
    },

    scheduleRender() {
      if (renderTimer) clearTimeout(renderTimer)
      renderTimer = setTimeout(() => this.renderNow(), 120)
    },

    renderNow() {
      const html = renderMarkdown(this.content, {
        autoFence: useSettingsStore().autoFence
      })
      this.renderedHtml = html
      this.outline = buildOutline(html)
    },

    /* ---------------- 标签 / 收藏 / 展开 ---------------- */

    async toggleFavorite(id: string) {
      if (!storage || isExternalId(id)) return
      await storage.toggleFavorite(id)
      await this.refresh()
    },

    async setTags(id: string, tags: string[]) {
      if (!storage || isExternalId(id)) return
      await storage.setTags(id, tags)
      await this.refresh()
    },

    async expand(id: string) {
      if (!storage) return
      if (!this.expanded.includes(id)) {
        this.expanded.push(id)
        await storage.setExpanded(this.expanded)
      }
    },

    async toggleExpand(id: string) {
      if (!storage) return
      const set = new Set(this.expanded)
      if (set.has(id)) set.delete(id)
      else set.add(id)
      this.expanded = [...set]
      await storage.setExpanded(this.expanded)
    },

    isExpanded(id: string) {
      return this.expanded.includes(id)
    },

    /* ---------------- 搜索 ---------------- */

    async search(keyword: string) {
      if (!storage) return
      this.searchKeyword = keyword
      if (!keyword.trim()) {
        this.searchResults = []
        return
      }
      this.searching = true
      try {
        this.searchResults = await storage.search(keyword)
      } finally {
        this.searching = false
      }
    },

    clearSearch() {
      this.searchKeyword = ''
      this.searchResults = []
    },

    async openSearchHit(hit: SearchHit) {
      await this.open(hit.id)
      if (hit.field === 'content') this.jumpLine = hit.line
    },

    /* ---------------- 回收站 ---------------- */

    async loadTrash() {
      if (!storage) return
      this.trashItems = await storage.listTrash()
    },

    async restore(trashId: string) {
      if (!storage) return
      await storage.restore(trashId)
      await Promise.all([this.refresh(), this.loadTrash()])
    },

    async purge(trashId: string) {
      if (!storage) return
      await storage.purge(trashId)
      await this.loadTrash()
    },

    async emptyTrash() {
      if (!storage) return
      await storage.emptyTrash()
      await this.loadTrash()
    },

    /* ---------------- 图片资源 ---------------- */

    async saveImage(base64: string, ext: string): Promise<string> {
      if (!storage) throw new Error('文档库未初始化')
      const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`

      // 外部文件：图片存到文档旁边的 `<文件名>.assets/`，Markdown 里用相对引用，保证可移植
      if (isExternalId(this.currentId)) {
        const doc = this.externalMap[this.currentId]
        if (!doc) throw new Error('外部文件已关闭')
        const assetId = `${parentOf(this.currentId)}/${doc.name}.assets/${name}`
        await writeExternalBinary(externalPath(assetId), base64)
        return relativeTo(parentOf(this.currentId), assetId)
      }

      const assetPath = `${ASSETS_DIR}/${name}`
      await storage.fs.writeBinary(assetPath, base64)
      return relativeTo(parentOf(this.currentId), assetPath)
    },

    async readAsset(rel: string): Promise<string | null> {
      if (!storage) return null
      try {
        if (isExternalId(rel)) return await readExternalBinary(externalPath(rel))
        return await storage.fs.readBinary(rel)
      } catch {
        return null
      }
    },

    /* ---------------- 工作区外的文件 ---------------- */

    /** 更新某个外部文档的元信息 */
    patchExternal(id: string, patch: Partial<ExternalDoc>) {
      const doc = this.externalMap[id]
      if (!doc) return
      this.externalMap = { ...this.externalMap, [id]: { ...doc, ...patch } }
    },

    /** 关闭标签页后清掉外部文档的元信息 */
    forgetExternal(id: string) {
      if (!this.externalMap[id]) return
      const next = { ...this.externalMap }
      delete next[id]
      this.externalMap = next
    },

    /**
     * 打开一批工作区外的文件（来自访达「打开方式」或「打开文件…」）。
     * 原地读写原文件，不复制、不移动；若文件恰好落在工作区内则按工作区文档打开，
     * 避免同一个文件出现两个入口。
     */
    async openExternalFiles(list: ExternalFile[]): Promise<number> {
      if (!list.length) return 0
      if (list.some((f) => relativeInside(f.path, this.root))) await this.refresh()

      let opened = 0
      for (const f of list) {
        const rel = relativeInside(f.path, this.root)
        if (rel && storage) {
          if (!this.openTabs.includes(rel)) this.openTabs.push(rel)
          await this.open(rel)
          opened++
          continue
        }

        const id = toExternalId(f.path)
        if (!this.externalMap[id]) {
          let stat = { size: 0, mtime: Date.now() }
          try {
            const s = await statExternalFile(f.path)
            stat = { size: s.size, mtime: s.mtime || Date.now() }
          } catch {
            /* 用默认值即可，打开时还会再试一次读取 */
          }
          this.externalMap = { ...this.externalMap, [id]: makeExternalDoc(f.path, f.name, stat) }
        }
        await this.open(id)
        opened++
      }
      return opened
    },

    /** 「打开文件…」：弹系统对话框选一批 md，走与「打开方式」相同的通道 */
    async pickExternal(): Promise<number> {
      if (!externalSupported()) throw new Error('浏览器预览模式不支持打开工作区外的文件')
      const files = await pickExternalFiles()
      if (!files.length) return 0
      return this.openExternalFiles(files)
    },

    /** 重新从磁盘载入当前外部文件（外部被其他程序改动后使用） */
    async reloadCurrentExternal(): Promise<void> {
      if (!this.currentIsExternal) return
      const doc = this.externalMap[this.currentId]
      if (!doc) return
      try {
        this.content = await readExternalFile(doc.absPath)
        this.buffers = Object.fromEntries(
          Object.entries(this.buffers).filter(([k]) => k !== this.currentId)
        )
        this.patchExternal(this.currentId, { missing: false })
      } catch {
        this.patchExternal(this.currentId, { missing: true })
      }
      this.renderNow()
    },

    /** 在访达中显示当前外部文件 */
    revealCurrent(): void {
      const doc = this.externalMap[this.currentId]
      if (doc) revealExternalFile(doc.absPath)
    },

    /* ---------------- 导入 / 导出 ---------------- */

    async importMarkdowns(parentId: string | null = null) {
      if (!storage) return 0
      const files = await importFiles()
      for (const f of files) {
        const name = f.name.replace(/\.(md|markdown|txt)$/i, '')
        await storage.create(parentId, name, 'file', f.content)
      }
      await this.refresh()
      if (files.length) await this.open(this.files[this.files.length - 1]?.id ?? this.currentId)
      return files.length
    },

    async exportMarkdown() {
      if (!this.currentId) return
      await this.save()
      await exportText(`${this.currentTitle}.md`, this.content, 'md')
    },

    async exportHtml() {
      if (!this.currentId) return
      const html = buildStandaloneHtml(
        this.currentTitle,
        renderMarkdown(this.content, { autoFence: useSettingsStore().autoFence })
      )
      await exportText(`${this.currentTitle}.html`, html, 'html')
    },

    async exportPdf() {
      if (!this.currentId) return
      exportPdf(
        this.currentTitle,
        renderMarkdown(this.content, { autoFence: useSettingsStore().autoFence }),
        ''
      )
    }
  }
})
