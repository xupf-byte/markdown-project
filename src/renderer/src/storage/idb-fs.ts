import type { FsEntry, FsLike, FsStat } from './fslike'

/**
 * 浏览器环境下基于 IndexedDB 的虚拟文件系统。
 * 让同一套 UI / 业务代码可以在纯浏览器里运行（用于 Web 版与本地调试预览）。
 */

const DB_NAME = 'mdnotes-vault'
const DB_VERSION = 1
const STORE = 'entries'

interface EntryRecord {
  path: string
  dir: boolean
  content?: string
  /** 二进制文件（图片）的 base64 内容 */
  base64?: string
  mtime: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'path' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export class IdbFs implements FsLike {
  readonly kind = 'idb' as const
  readonly rootLabel = '浏览器存储（IndexedDB）'

  private db: IDBDatabase | null = null

  async open(): Promise<void> {
    if (!this.db) {
      this.db = await openDb()
      await this.cleanupPlaceholders()
    }
  }

  /** 清理历史版本遗留的占位目录记录 */
  private async cleanupPlaceholders(): Promise<void> {
    const records = await this.all()
    const stale = records.filter((r) => r.path.split('/').includes('__placeholder__')).map((r) => r.path)
    if (stale.length) await this.del(stale)
  }

  private tx(mode: IDBTransactionMode): IDBObjectStore {
    if (!this.db) throw new Error('IndexedDB 尚未初始化')
    return this.db.transaction(STORE, mode).objectStore(STORE)
  }

  private req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
  }

  private async get(path: string): Promise<EntryRecord | undefined> {
    return this.req<EntryRecord | undefined>(this.tx('readonly').get(path))
  }

  private async all(): Promise<EntryRecord[]> {
    return this.req<EntryRecord[]>(this.tx('readonly').getAll())
  }

  private async put(rec: EntryRecord): Promise<void> {
    await this.req(this.tx('readwrite').put(rec))
  }

  private async putMany(recs: EntryRecord[]): Promise<void> {
    const store = this.tx('readwrite')
    await Promise.all(recs.map((r) => this.req(store.put(r))))
  }

  private async del(keys: string[]): Promise<void> {
    const store = this.tx('readwrite')
    await Promise.all(keys.map((k) => this.req(store.delete(k))))
  }

  /** 自顶向下补建所有父目录记录 */
  private async ensureDirs(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean)
    const recs: EntryRecord[] = []
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/')
      const exists = await this.get(p)
      if (!exists) recs.push({ path: p, dir: true, mtime: Date.now() })
    }
    if (recs.length) await this.putMany(recs)
  }

  async readFile(rel: string): Promise<string> {
    const rec = await this.get(rel)
    if (!rec) throw new Error(`文件不存在: ${rel}`)
    if (rec.dir) throw new Error(`这是一个目录: ${rel}`)
    return rec.content ?? ''
  }

  async writeFile(rel: string, data: string): Promise<void> {
    await this.ensureDirs(rel)
    await this.put({ path: rel, dir: false, content: data, mtime: Date.now() })
  }

  async readBinary(rel: string): Promise<string> {
    const rec = await this.get(rel)
    if (!rec) throw new Error(`文件不存在: ${rel}`)
    return rec.base64 ?? ''
  }

  async writeBinary(rel: string, base64: string): Promise<void> {
    await this.ensureDirs(rel)
    await this.put({ path: rel, dir: false, base64, mtime: Date.now() })
  }

  async mkdir(rel: string): Promise<void> {
    if (!rel) return
    await this.ensureDirs(rel)
  }

  async readdir(rel: string): Promise<FsEntry[]> {
    const prefix = rel ? `${rel}/` : ''
    const records = await this.all()
    const out: FsEntry[] = []
    for (const r of records) {
      if (!r.path.startsWith(prefix)) continue
      const rest = r.path.slice(prefix.length)
      if (!rest || rest.includes('/')) continue
      out.push({ name: rest, dir: r.dir })
    }
    return out
  }

  async remove(rel: string, recursive = false): Promise<void> {
    const records = await this.all()
    const prefix = `${rel}/`
    const hit = records.filter((r) => r.path === rel || r.path.startsWith(prefix))
    if (!hit.length) return
    if (!recursive && hit.length > 1) throw new Error(`目录非空: ${rel}`)
    await this.del(hit.map((r) => r.path))
  }

  async rename(from: string, to: string): Promise<void> {
    const records = await this.all()
    const prefix = `${from}/`
    const hit = records.filter((r) => r.path === from || r.path.startsWith(prefix))
    if (!hit.length) throw new Error(`路径不存在: ${from}`)
    const target = await this.get(to)
    if (target) throw new Error(`目标已存在: ${to}`)
    await this.ensureDirs(to)
    await this.putMany(
      hit.map((r) => ({
        ...r,
        path: to + r.path.slice(from.length),
        mtime: Date.now()
      }))
    )
    await this.del(hit.map((r) => r.path))
  }

  async stat(rel: string): Promise<FsStat | null> {
    if (!rel) return { dir: true, size: 0, mtime: Date.now() }
    const rec = await this.get(rel)
    if (!rec) return null
    return { dir: rec.dir, size: rec.content?.length ?? 0, mtime: rec.mtime }
  }

  async exists(rel: string): Promise<boolean> {
    if (!rel) return true
    return !!(await this.get(rel))
  }
}
