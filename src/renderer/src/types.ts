export type NodeType = 'file' | 'folder'

export interface DocNode {
  /** 相对工作区根的路径，例如 `技术/笔记.md`；根为 `''` */
  id: string
  /** 界面展示名（文件自动去掉 .md 后缀） */
  name: string
  /** 磁盘上的真实文件名 */
  rawName: string
  type: NodeType
  parentId: string | null
  children: DocNode[]
  size: number
  mtime: number
  tags: string[]
  favorite: boolean
}

export interface TrashItem {
  /** 回收站内的路径 */
  id: string
  name: string
  type: NodeType
  /** 删除前的原始路径 */
  originPath: string
  deletedAt: number
}

export interface SearchHit {
  id: string
  name: string
  /** 命中的内容片段（含关键词上下文） */
  snippet: string
  /** 命中来源：标题 / 正文 */
  field: 'name' | 'content'
  line: number
}

export interface OutlineItem {
  id: string
  text: string
  level: number
  line: number
}

export type PreviewMode = 'edit' | 'split' | 'preview'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface VaultMeta {
  tags: Record<string, string[]>
  favorites: string[]
  expanded: string[]
}
