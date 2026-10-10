import type { DocNode } from '../types'

/**
 * 工作区外的文档。
 *
 * 这类文件由系统（访达「打开方式」）或用户（「打开文件…」对话框）显式交给应用，
 * 位置在磁盘任意目录，无法用「相对工作区根」的路径表达，因此单独用
 * `ext:<绝对路径>` 作为文档 id —— 冒号不可能出现在工作区相对路径里，天然不会冲突。
 *
 * 语义与「导入」相反：**原地读写原文件**，不复制、不移动、不进入回收站。
 */
export const EXT_PREFIX = 'ext:'

export interface ExternalDoc {
  /** `ext:<绝对路径>` */
  id: string
  absPath: string
  /** 界面展示名（不含扩展名） */
  name: string
  /** 磁盘上的真实文件名 */
  rawName: string
  /** 所在目录，用于在界面上标明来源 */
  dir: string
  mtime: number
  size: number
  /** 文件已不在磁盘上（被移走或删除） */
  missing: boolean
}

export interface ExternalFile {
  path: string
  name: string
}

export function isExternalId(id: string): boolean {
  return id.startsWith(EXT_PREFIX)
}

export function toExternalId(absPath: string): string {
  return `${EXT_PREFIX}${absPath}`
}

export function externalPath(id: string): string {
  return id.slice(EXT_PREFIX.length)
}

/** 当前运行环境是否支持访问工作区外的文件（仅 Electron） */
export function externalSupported(): boolean {
  return typeof window !== 'undefined' && !!window.api?.isElectron
}

export function makeExternalDoc(
  absPath: string,
  name?: string,
  stat?: { size: number; mtime: number }
): ExternalDoc {
  const rawName = name || absPath.split('/').pop() || absPath
  const dot = rawName.lastIndexOf('.')
  const cut = absPath.lastIndexOf('/')
  return {
    id: toExternalId(absPath),
    absPath,
    name: dot > 0 ? rawName.slice(0, dot) : rawName,
    rawName,
    dir: cut > 0 ? absPath.slice(0, cut) : '/',
    mtime: stat?.mtime ?? Date.now(),
    size: stat?.size ?? 0,
    missing: false
  }
}

/** 转成与文件树同构的节点，便于复用标签页 / 标题 / 状态栏等既有逻辑 */
export function externalToNode(doc: ExternalDoc): DocNode {
  return {
    id: doc.id,
    name: doc.name,
    rawName: doc.rawName,
    type: 'file',
    parentId: null,
    children: [],
    size: doc.size,
    mtime: doc.mtime,
    tags: [],
    favorite: false
  }
}

/**
 * 若绝对路径落在工作区内，返回它相对工作区根的路径，否则返回 null。
 * 用于避免「同一个文件既出现在文件树、又作为外部文件打开」造成两个入口。
 */
export function relativeInside(absPath: string, root: string): string | null {
  if (!root) return null
  const abs = absPath.replace(/\/+$/, '')
  const base = root.replace(/\/+$/, '')
  if (!base || abs === base) return null
  return abs.startsWith(`${base}/`) ? abs.slice(base.length + 1) : null
}

/* ---------------- IPC 包装 ---------------- */

export function pickExternalFiles(): Promise<ExternalFile[]> {
  if (!externalSupported()) return Promise.resolve([])
  return window.api!.openExternalDialog()
}

export function readExternalFile(absPath: string): Promise<string> {
  return window.api!.readExternal(absPath)
}

export function writeExternalFile(
  absPath: string,
  data: string
): Promise<{ mtime: number; size: number }> {
  return window.api!.writeExternal(absPath, data)
}

export function statExternalFile(
  absPath: string
): Promise<{ exists: boolean; size: number; mtime: number }> {
  return window.api!.statExternal(absPath)
}

export function revealExternalFile(absPath: string): void {
  void window.api?.revealExternal(absPath)
}

/** 读取外部文档旁边的图片（base64） */
export function readExternalBinary(absPath: string): Promise<string> {
  return window.api!.readExternalBinary(absPath)
}

/** 写入外部文档旁边的图片（base64） */
export function writeExternalBinary(absPath: string, base64: string): Promise<void> {
  return window.api!.writeExternalBinary(absPath, base64)
}
