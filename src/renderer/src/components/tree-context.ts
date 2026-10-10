import type { InjectionKey, Ref } from 'vue'
import type { DocNode } from '../types'

export interface TreeContext {
  activeId: Ref<string>
  expanded: Ref<string[]>
  dragId: Ref<string>
  dirtyIds: Ref<string[]>
  onOpen(node: DocNode): void
  onToggle(node: DocNode): void
  onNewDoc(parentId: string | null): void
  onNewFolder(parentId: string | null): void
  onRename(node: DocNode): void
  onDelete(node: DocNode): void
  onTags(node: DocNode): void
  onFavorite(node: DocNode): void
  onReveal(node: DocNode): void
  onMove(id: string, target: string | null): void
}

export const TREE_CTX: InjectionKey<TreeContext> = Symbol('mdnotes-tree-context')
