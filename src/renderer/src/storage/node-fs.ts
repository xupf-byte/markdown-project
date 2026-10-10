import type { MdNotesApi } from '../../../preload/index'
import type { FsEntry, FsLike, FsStat } from './fslike'

/**
 * Electron 环境下把 preload 暴露的 IPC 桥接成 FsLike。
 * 主进程侧做了路径越界校验，渲染进程只传相对路径。
 */
export class NodeFs implements FsLike {
  readonly kind = 'node' as const
  rootLabel: string

  constructor(private api: MdNotesApi, root: string) {
    this.rootLabel = root
  }

  readFile(rel: string): Promise<string> {
    return this.api.readFile(rel)
  }

  writeFile(rel: string, data: string): Promise<void> {
    return this.api.writeFile(rel, data)
  }

  readBinary(rel: string): Promise<string> {
    return this.api.readBinary(rel)
  }

  writeBinary(rel: string, base64: string): Promise<void> {
    return this.api.writeBinary(rel, base64)
  }

  mkdir(rel: string): Promise<void> {
    return this.api.mkdir(rel)
  }

  readdir(rel: string): Promise<FsEntry[]> {
    return this.api.readdir(rel)
  }

  remove(rel: string, recursive = false): Promise<void> {
    return this.api.remove(rel, recursive)
  }

  rename(from: string, to: string): Promise<void> {
    return this.api.rename(from, to)
  }

  async stat(rel: string): Promise<FsStat | null> {
    return this.api.stat(rel)
  }

  async exists(rel: string): Promise<boolean> {
    return this.api.exists(rel)
  }
}
