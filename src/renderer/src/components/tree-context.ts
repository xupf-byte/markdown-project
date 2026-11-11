import type { InjectionKey, Ref } from 'vue'
import type { DocNode } from '../types'

export interface TreeContext {
  activeId: Ref<string>
  expanded: Ref<string[]>
  dragId: Ref<string>
  dirtyIds: Ref<string[]>
  /** 正在内联重命名的节点 id（空串 = 无） */
  renamingId: Ref<string>
  onOpen(node: DocNode): void
  onToggle(node: DocNode): void
  onNewDoc(parentId: string | null): void
  onNewFolder(parentId: string | null): void
  /** 进入内联重命名态（右键菜单 / F2 / 双击都走这里） */
  onRename(node: DocNode): void
  /** 退出内联重命名态，不落盘 */
  onEndRename(): void
  /** 提交内联重命名：name 已 trim，与原名相同时由实现方忽略 */
  onCommitRename(node: DocNode, name: string): void
  onDelete(node: DocNode): void
  onTags(node: DocNode): void
  onFavorite(node: DocNode): void
  onReveal(node: DocNode): void
  onMove(id: string, target: string | null): void
}

export const TREE_CTX: InjectionKey<TreeContext> = Symbol('mdnotes-tree-context')
