import { contextBridge, ipcRenderer } from 'electron'

export interface DirEntry {
  name: string
  dir: boolean
}

export interface StatResult {
  dir: boolean
  size: number
  mtime: number
}

/** 工作区外的文件（访达「打开方式」／「打开文件…」） */
export interface ExternalFile {
  path: string
  name: string
}

const api = {
  /* 工作区 */
  getVault: (): Promise<{ root: string }> => ipcRenderer.invoke('vault:get'),
  chooseVault: (): Promise<{ root: string } | null> => ipcRenderer.invoke('vault:choose'),

  /* 文件系统（路径均为相对工作区根目录） */
  readFile: (rel: string): Promise<string> => ipcRenderer.invoke('fs:readFile', rel),
  writeFile: (rel: string, data: string): Promise<void> => ipcRenderer.invoke('fs:writeFile', rel, data),
  readBinary: (rel: string): Promise<string> => ipcRenderer.invoke('fs:readBinary', rel),
  writeBinary: (rel: string, base64: string): Promise<void> =>
    ipcRenderer.invoke('fs:writeBinary', rel, base64),
  mkdir: (rel: string): Promise<void> => ipcRenderer.invoke('fs:mkdir', rel),
  readdir: (rel: string): Promise<DirEntry[]> => ipcRenderer.invoke('fs:readdir', rel),
  remove: (rel: string, recursive = false): Promise<void> => ipcRenderer.invoke('fs:remove', rel, recursive),
  rename: (from: string, to: string): Promise<void> => ipcRenderer.invoke('fs:rename', from, to),
  stat: (rel: string): Promise<StatResult | null> => ipcRenderer.invoke('fs:stat', rel),
  exists: (rel: string): Promise<boolean> => ipcRenderer.invoke('fs:exists', rel),

  /* 系统对话框 */
  saveText: (name: string, content: string, ext: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:saveText', name, content, ext),
  openText: (ext: string): Promise<{ name: string; content: string }[]> =>
    ipcRenderer.invoke('dialog:openText', ext),
  showItemInFolder: (rel: string): Promise<void> => ipcRenderer.invoke('shell:showItem', rel),
  setTheme: (theme: 'light' | 'dark' | 'system'): Promise<void> => ipcRenderer.invoke('theme:set', theme),

  /* 外部文件：绝对路径，仅限系统或用户显式交给本应用的文件 */
  openExternalDialog: (): Promise<ExternalFile[]> => ipcRenderer.invoke('file:openDialog'),
  readExternal: (abs: string): Promise<string> => ipcRenderer.invoke('file:read', abs),
  writeExternal: (abs: string, data: string): Promise<{ mtime: number; size: number }> =>
    ipcRenderer.invoke('file:write', abs, data),
  statExternal: (abs: string): Promise<{ exists: boolean; size: number; mtime: number }> =>
    ipcRenderer.invoke('file:stat', abs),
  revealExternal: (abs: string): Promise<void> => ipcRenderer.invoke('file:reveal', abs),
  readExternalBinary: (abs: string): Promise<string> => ipcRenderer.invoke('file:readBinary', abs),
  writeExternalBinary: (abs: string, base64: string): Promise<void> =>
    ipcRenderer.invoke('file:writeBinary', abs, base64),

  /* 渲染层就绪握手 + 系统投递文件 */
  notifyReady: (): Promise<boolean> => ipcRenderer.invoke('app:renderer-ready'),
  onOpenFiles: (cb: (files: ExternalFile[]) => void) => {
    const handler = (_e: unknown, files: ExternalFile[]) => cb(files)
    ipcRenderer.on('app:open-files', handler)
    return () => ipcRenderer.removeListener('app:open-files', handler)
  },

  /* 原生菜单指令 */
  onMenuCommand: (cb: (cmd: { action: string; payload?: unknown }) => void) => {
    const handler = (_e: unknown, cmd: { action: string; payload?: unknown }) => cb(cmd)
    ipcRenderer.on('menu:command', handler)
    return () => ipcRenderer.removeListener('menu:command', handler)
  },

  isElectron: true as const,
  platform: process.platform
}

contextBridge.exposeInMainWorld('api', api)

export type MdNotesApi = typeof api
