export interface FsEntry {
  name: string
  dir: boolean
}

export interface FsStat {
  dir: boolean
  size: number
  mtime: number
}

/**
 * 存储适配器的最小抽象。
 * 上层 VaultStorage 只依赖这 8 个原语，因此同一套业务逻辑
 * 既能跑在 Electron（真实文件系统）上，也能跑在浏览器（IndexedDB 虚拟文件系统）上。
 */
export interface FsLike {
  readonly kind: 'node' | 'idb'
  /** 展示用的根路径 */
  readonly rootLabel: string
  readFile(rel: string): Promise<string>
  writeFile(rel: string, data: string): Promise<void>
  /** 读取二进制文件，返回 base64（用于图片） */
  readBinary(rel: string): Promise<string>
  /** 写入二进制文件，入参为 base64 */
  writeBinary(rel: string, base64: string): Promise<void>
  mkdir(rel: string): Promise<void>
  readdir(rel: string): Promise<FsEntry[]>
  remove(rel: string, recursive?: boolean): Promise<void>
  rename(from: string, to: string): Promise<void>
  stat(rel: string): Promise<FsStat | null>
  exists(rel: string): Promise<boolean>
}

/** 规范化相对路径：去掉首尾斜杠、折叠多余斜杠 */
export function normalize(rel: string): string {
  return (rel || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s && s !== '.')
    .join('/')
}

export function parentOf(rel: string): string {
  const n = normalize(rel)
  const i = n.lastIndexOf('/')
  return i < 0 ? '' : n.slice(0, i)
}

export function baseName(rel: string): string {
  const n = normalize(rel)
  const i = n.lastIndexOf('/')
  return i < 0 ? n : n.slice(i + 1)
}

export function joinPath(parent: string, name: string): string {
  const p = normalize(parent)
  return p ? `${p}/${name}` : name
}
