import type { DocNode, NodeType, SearchHit, TrashItem, VaultMeta } from '../types'
import { baseName, joinPath, normalize, parentOf, type FsLike } from './fslike'

export const META_DIR = '.mdnotes'
export const TRASH_DIR = `${META_DIR}/trash`
export const ASSETS_DIR = `${META_DIR}/assets`
const META_FILE = `${META_DIR}/meta.json`
const TRASH_META_FILE = `${META_DIR}/trash.json`

const MD_EXTS = ['.md', '.markdown']

export function isMarkdown(name: string): boolean {
  const lower = name.toLowerCase()
  return MD_EXTS.some((e) => lower.endsWith(e))
}

export function stripExt(name: string): string {
  const i = name.lastIndexOf('.')
  return i > 0 ? name.slice(0, i) : name
}

interface TrashRecord {
  originPath: string
  name: string
  type: NodeType
  deletedAt: number
}

const EMPTY_META: VaultMeta = { tags: {}, favorites: [], expanded: [] }

/**
 * 统一文档库：树构建、增删改查、回收站、标签、收藏、全文搜索。
 * 完全构建在 FsLike 之上，与具体后端（文件系统 / IndexedDB）解耦。
 */
export class VaultStorage {
  private meta: VaultMeta = { ...EMPTY_META }
  private trashMeta: Record<string, TrashRecord> = {}

  constructor(public readonly fs: FsLike) {}

  /* ---------------- 初始化 ---------------- */

  async init(): Promise<void> {
    await this.fs.mkdir(META_DIR)
    await this.fs.mkdir(TRASH_DIR)
    await this.fs.mkdir(ASSETS_DIR)
    this.meta = { ...EMPTY_META, ...(await this.readJson<VaultMeta>(META_FILE, EMPTY_META)) }
    this.meta.tags ||= {}
    this.meta.favorites ||= []
    this.meta.expanded ||= []
    this.trashMeta = await this.readJson<Record<string, TrashRecord>>(TRASH_META_FILE, {})
  }

  private async readJson<T>(path: string, fallback: T): Promise<T> {
    try {
      const raw = await this.fs.readFile(path)
      return raw ? (JSON.parse(raw) as T) : fallback
    } catch {
      return fallback
    }
  }

  private async saveMeta(): Promise<void> {
    await this.fs.writeFile(META_FILE, JSON.stringify(this.meta, null, 2))
  }

  private async saveTrashMeta(): Promise<void> {
    await this.fs.writeFile(TRASH_META_FILE, JSON.stringify(this.trashMeta, null, 2))
  }

  /* ---------------- 文件树 ---------------- */

  async tree(): Promise<DocNode[]> {
    return this.walk('', null)
  }

  private async walk(rel: string, parentId: string | null): Promise<DocNode[]> {
    let entries: { name: string; dir: boolean }[] = []
    try {
      entries = await this.fs.readdir(rel)
    } catch {
      return []
    }
    const nodes: DocNode[] = []
    for (const e of entries) {
      if (e.name.startsWith('.') || e.name === '__placeholder__') continue
      const id = joinPath(rel, e.name)
      let st = null
      try {
        st = await this.fs.stat(id)
      } catch {
        st = null
      }
      if (e.dir) {
        nodes.push({
          id,
          name: e.name,
          rawName: e.name,
          type: 'folder',
          parentId,
          children: await this.walk(id, id),
          size: 0,
          mtime: st?.mtime ?? 0,
          tags: [],
          favorite: false
        })
      } else {
        if (!isMarkdown(e.name)) continue
        nodes.push({
          id,
          name: stripExt(e.name),
          rawName: e.name,
          type: 'file',
          parentId,
          children: [],
          size: st?.size ?? 0,
          mtime: st?.mtime ?? 0,
          tags: this.meta.tags[id] ?? [],
          favorite: this.meta.favorites.includes(id)
        })
      }
    }
    return nodes.sort(compareNode)
  }

  /** 扁平化文件列表 */
  async flatFiles(): Promise<DocNode[]> {
    const out: DocNode[] = []
    const visit = (list: DocNode[]) => {
      for (const n of list) {
        if (n.type === 'file') out.push(n)
        else visit(n.children)
      }
    }
    visit(await this.tree())
    return out
  }

  /* ---------------- 读 / 写 ---------------- */

  async read(id: string): Promise<string> {
    return this.fs.readFile(id)
  }

  async write(id: string, content: string): Promise<void> {
    await this.fs.writeFile(id, content)
  }

  private async uniquePath(parentId: string, name: string): Promise<string> {
    let candidate = joinPath(parentId, name)
    let i = 1
    while (await this.fs.exists(candidate)) {
      const dot = name.lastIndexOf('.')
      const stem = dot > 0 ? name.slice(0, dot) : name
      const ext = dot > 0 ? name.slice(dot) : ''
      candidate = joinPath(parentId, `${stem} ${i}${ext}`)
      i++
    }
    return candidate
  }

  async create(
    parentId: string | null,
    name: string,
    type: NodeType,
    content = ''
  ): Promise<string> {
    const parent = parentId ?? ''
    const clean = sanitizeName(name)
    if (!clean) throw new Error('名称不能为空')
    if (type === 'folder') {
      const id = await this.uniquePath(parent, clean)
      await this.fs.mkdir(id)
      return id
    }
    const fileName = isMarkdown(clean) ? clean : `${clean}.md`
    const id = await this.uniquePath(parent, fileName)
    await this.fs.writeFile(id, content)
    return id
  }

  async rename(id: string, newName: string): Promise<string> {
    const clean = sanitizeName(newName)
    if (!clean) throw new Error('名称不能为空')
    const st = await this.fs.stat(id)
    const parent = parentOf(id)
    let target: string
    if (st?.dir) {
      target = joinPath(parent, clean)
    } else {
      target = joinPath(parent, isMarkdown(clean) ? clean : `${clean}.md`)
    }
    if (normalize(target) === normalize(id)) return id
    if (await this.fs.exists(target)) throw new Error(`已存在同名项目：${clean}`)
    await this.fs.rename(id, target)
    await this.migrateMeta(id, target)
    return target
  }

  /** 移动节点到新父目录（用于拖拽） */
  async move(id: string, newParentId: string | null): Promise<string> {
    const parent = newParentId ?? ''
    if (parent === id || parent.startsWith(`${id}/`)) {
      throw new Error('不能把文件夹移动到它自己内部')
    }
    const target = await this.uniquePath(parent, baseName(id))
    await this.fs.rename(id, target)
    await this.migrateMeta(id, target)
    return target
  }

  /** 重命名/移动后同步标签、收藏、展开状态里的路径 */
  private async migrateMeta(from: string, to: string): Promise<void> {
    const fix = (p: string) => (p === from ? to : p.startsWith(`${from}/`) ? to + p.slice(from.length) : p)
    const tags: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(this.meta.tags)) tags[fix(k)] = v
    this.meta.tags = tags
    this.meta.favorites = [...new Set(this.meta.favorites.map(fix))]
    this.meta.expanded = [...new Set(this.meta.expanded.map(fix))]
    await this.saveMeta()
  }

  /* ---------------- 回收站 ---------------- */

  async trash(id: string): Promise<void> {
    const st = await this.fs.stat(id)
    if (!st) throw new Error('目标不存在')
    const stamp = Date.now()
    const target = `${TRASH_DIR}/${stamp}__${baseName(id)}`
    await this.fs.rename(id, target)
    this.trashMeta[target] = {
      originPath: id,
      name: baseName(id),
      type: st.dir ? 'folder' : 'file',
      deletedAt: stamp
    }
    delete this.meta.tags[id]
    this.meta.favorites = this.meta.favorites.filter((f) => f !== id)
    this.meta.expanded = this.meta.expanded.filter((e) => e !== id)
    await Promise.all([this.saveTrashMeta(), this.saveMeta()])
  }

  async listTrash(): Promise<TrashItem[]> {
    let entries: { name: string; dir: boolean }[] = []
    try {
      entries = await this.fs.readdir(TRASH_DIR)
    } catch {
      entries = []
    }
    return entries
      .map((e) => {
        const id = `${TRASH_DIR}/${e.name}`
        const rec = this.trashMeta[id]
        return {
          id,
          name: rec?.name ?? e.name.replace(/^\d+__/, ''),
          type: (e.dir ? 'folder' : 'file') as NodeType,
          originPath: rec?.originPath ?? e.name.replace(/^\d+__/, ''),
          deletedAt: rec?.deletedAt ?? (Number(e.name.split('__')[0]) || 0)
        }
      })
      .sort((a, b) => b.deletedAt - a.deletedAt)
  }

  async restore(trashId: string): Promise<string> {
    const rec = this.trashMeta[trashId]
    const origin = rec?.originPath ?? baseName(trashId).replace(/^\d+__/, '')
    const parent = parentOf(origin)
    if (parent) await this.fs.mkdir(parent).catch(() => undefined)
    const target = await this.uniquePath(parent, baseName(origin))
    await this.fs.rename(trashId, target)
    delete this.trashMeta[trashId]
    await this.saveTrashMeta()
    return target
  }

  async purge(trashId: string): Promise<void> {
    await this.fs.remove(trashId, true)
    delete this.trashMeta[trashId]
    await this.saveTrashMeta()
  }

  async emptyTrash(): Promise<void> {
    const items = await this.listTrash()
    for (const it of items) await this.fs.remove(it.id, true)
    this.trashMeta = {}
    await this.saveTrashMeta()
  }

  /* ---------------- 标签 / 收藏 / 展开 ---------------- */

  async setTags(id: string, tags: string[]): Promise<void> {
    const clean = [...new Set(tags.map((t) => t.trim()).filter(Boolean))]
    if (clean.length) this.meta.tags[id] = clean
    else delete this.meta.tags[id]
    await this.saveMeta()
  }

  async toggleFavorite(id: string): Promise<boolean> {
    const set = new Set(this.meta.favorites)
    const next = !set.has(id)
    if (next) set.add(id)
    else set.delete(id)
    this.meta.favorites = [...set]
    await this.saveMeta()
    return next
  }

  async setExpanded(paths: string[]): Promise<void> {
    this.meta.expanded = [...new Set(paths)]
    await this.saveMeta()
  }

  expandedPaths(): string[] {
    return [...this.meta.expanded]
  }

  allTags(): { tag: string; count: number }[] {
    const counter = new Map<string, number>()
    for (const list of Object.values(this.meta.tags)) {
      for (const t of list) counter.set(t, (counter.get(t) ?? 0) + 1)
    }
    return [...counter.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
  }

  /* ---------------- 搜索 ---------------- */

  async search(keyword: string, limit = 100): Promise<SearchHit[]> {
    const kw = keyword.trim()
    if (!kw) return []
    const lower = kw.toLowerCase()
    const files = await this.flatFiles()
    const hits: SearchHit[] = []
    for (const f of files) {
      if (hits.length >= limit) break
      if (f.name.toLowerCase().includes(lower)) {
        hits.push({ id: f.id, name: f.name, snippet: f.id, field: 'name', line: 1 })
      }
      let content = ''
      try {
        content = await this.fs.readFile(f.id)
      } catch {
        continue
      }
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lower)) {
          hits.push({
            id: f.id,
            name: f.name,
            snippet: makeSnippet(lines[i], lower),
            field: 'content',
            line: i + 1
          })
          break
        }
      }
      if (hits.length >= limit) break
    }
    return hits
  }
}

/* ---------------- 工具函数 ---------------- */

export function compareNode(a: DocNode, b: DocNode): number {
  if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
  return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true })
}

export function sanitizeName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim()
}

function makeSnippet(line: string, lowerKeyword: string): string {
  const idx = line.toLowerCase().indexOf(lowerKeyword)
  const start = Math.max(0, idx - 30)
  const end = Math.min(line.length, idx + lowerKeyword.length + 50)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < line.length ? '…' : ''
  return `${prefix}${line.slice(start, end).trim()}${suffix}`
}
