import { IdbFs } from './idb-fs'
import { NodeFs } from './node-fs'
import { VaultStorage } from './vault'
import { WELCOME_MD } from './welcome'

export * from './fslike'
export * from './paths'
export * from './external'
export { VaultStorage, isMarkdown, stripExt, ASSETS_DIR, META_DIR, TRASH_DIR } from './vault'

export interface VaultBoot {
  vault: VaultStorage
  /** 当前存储后端描述，用于界面状态栏展示 */
  backend: string
  root: string
  /** 是否运行在 Electron 中（决定能否访问真实文件系统 / 原生菜单） */
  isElectron: boolean
}

let current: VaultBoot | null = null

export function getVault(): VaultBoot {
  if (!current) throw new Error('文档库尚未初始化')
  return current
}

export async function createVault(): Promise<VaultBoot> {
  if (typeof window !== 'undefined' && window.api?.isElectron) {
    const { root } = await window.api.getVault()
    const vault = new VaultStorage(new NodeFs(window.api, root))
    await vault.init()
    current = { vault, backend: '本地文件系统', root, isElectron: true }
    return current
  }

  const fs = new IdbFs()
  await fs.open()
  const vault = new VaultStorage(fs)
  await vault.init()
  const existing = await vault.flatFiles()
  if (existing.length === 0) {
    await vault.create(null, '欢迎使用 飞儿MD', 'file', WELCOME_MD)
  }
  current = { vault, backend: '浏览器 IndexedDB', root: fs.rootLabel, isElectron: false }
  return current
}

/** 切换工作区（仅 Electron） */
export async function switchVault(): Promise<VaultBoot | null> {
  if (!window.api?.isElectron) return null
  const res = await window.api.chooseVault()
  if (!res) return null
  const vault = new VaultStorage(new NodeFs(window.api, res.root))
  await vault.init()
  current = { vault, backend: '本地文件系统', root: res.root, isElectron: true }
  return current
}
