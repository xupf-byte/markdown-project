import { app, BrowserWindow, ipcMain, dialog, Menu, shell, nativeTheme } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'

const APP_NAME = '飞儿MD'
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json')

let mainWindow: BrowserWindow | null = null
let vaultRoot = ''

/* ------------------------------------------------------------------ */
/* 外部文件通道                                                          */
/*                                                                      */
/* 访达「打开方式」或系统对话框交过来的文件位于任意目录，必然越出          */
/* vaultRoot，因此单独走一条以绝对路径为准的通道。所有路径必须先经         */
/* authorizeExternal 登记，后续读写一律用 resolveExternal 二次校验。        */
/* ------------------------------------------------------------------ */

const MD_EXTS = ['.md', '.markdown']
const allowedExternal = new Set<string>()

/** 登记一个由系统或用户显式指定的文件路径 */
function authorizeExternal(input: string): string {
  const abs = path.resolve(input)
  const ext = path.extname(abs).toLowerCase()
  if (!MD_EXTS.includes(ext)) throw new Error(`不支持的文件类型：${ext || '无扩展名'}`)
  allowedExternal.add(abs)
  return abs
}

/** 取出已登记的外部路径；类型不符或未登记直接拒绝 */
function resolveExternal(input: string): string {
  const abs = path.resolve(input)
  const ext = path.extname(abs).toLowerCase()
  if (!MD_EXTS.includes(ext)) throw new Error(`不支持的文件类型：${ext || '无扩展名'}`)
  if (!allowedExternal.has(abs)) throw new Error('该路径尚未被授权访问')
  return abs
}

const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']

/**
 * 外部文档旁边的图片资源（粘贴图片时存在 `<文件名>.assets/`）。
 * 只放行「已授权 md 文件所在目录及其子目录」下的图片，避免把授权扩成任意路径。
 */
function resolveExternalAsset(input: string): string {
  const abs = path.resolve(input)
  const ext = path.extname(abs).toLowerCase()
  if (!IMAGE_EXTS.includes(ext)) throw new Error(`不支持的资源类型：${ext || '无扩展名'}`)
  for (const file of allowedExternal) {
    if (abs.startsWith(path.dirname(file) + path.sep)) return abs
  }
  throw new Error('该资源目录尚未被授权')
}

/** 系统投递过来、尚未送达渲染层的文件（冷启动时 open-file 会早于 ready 触发） */
const pendingOpen: string[] = []
let rendererReady = false

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  pendingOpen.push(filePath)
  flushOpenFiles()
})

function normalizeExternal(file: string): { path: string; name: string } | null {
  try {
    const abs = authorizeExternal(file)
    return { path: abs, name: path.basename(abs) }
  } catch {
    return null
  }
}

/** 把排队的文件交给渲染层（窗口就绪前只排队，不丢） */
function flushOpenFiles(): void {
  if (!mainWindow || !rendererReady || !pendingOpen.length) return
  const files = pendingOpen
    .splice(0)
    .map(normalizeExternal)
    .filter((x): x is { path: string; name: string } => !!x)
  if (!files.length) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.focus()
  mainWindow.webContents.send('app:open-files', files)
}

/** Windows / Linux 通过命令行参数投递文件 */
function filesFromArgv(argv: string[]): string[] {
  return argv.filter((a) => !a.startsWith('-') && MD_EXTS.includes(path.extname(a).toLowerCase()))
}

/* ------------------------------------------------------------------ */
/* 应用设置持久化（当前仓库路径 / 主题）                                  */
/* ------------------------------------------------------------------ */

interface AppSettings {
  vaultRoot?: string
  theme?: 'light' | 'dark' | 'system'
}

async function readSettings(): Promise<AppSettings> {
  try {
    return JSON.parse(await fs.readFile(SETTINGS_FILE(), 'utf-8'))
  } catch {
    return {}
  }
}

async function writeSettings(patch: AppSettings): Promise<void> {
  const next = { ...(await readSettings()), ...patch }
  await fs.mkdir(path.dirname(SETTINGS_FILE()), { recursive: true })
  await fs.writeFile(SETTINGS_FILE(), JSON.stringify(next, null, 2), 'utf-8')
}

/* ------------------------------------------------------------------ */
/* 路径安全：所有渲染进程传来的路径都相对仓库根，禁止越界                   */
/* ------------------------------------------------------------------ */

function safeJoin(rel: string): string {
  const root = path.resolve(vaultRoot)
  const full = path.resolve(root, rel || '.')
  const diff = path.relative(root, full)
  if (diff.startsWith('..') || path.isAbsolute(diff)) {
    throw new Error(`非法路径（越出工作区）: ${rel}`)
  }
  return full
}

/* ------------------------------------------------------------------ */
/* 初始化默认仓库                                                        */
/* ------------------------------------------------------------------ */

async function ensureVault(): Promise<string> {
  const settings = await readSettings()
  let root = settings.vaultRoot
  if (!root) {
    root = path.join(app.getPath('documents'), 'MarkdownNotes')
  }
  await fs.mkdir(root, { recursive: true })
  // 首次使用写入一份欢迎文档
  const welcome = path.join(root, '欢迎使用 飞儿MD.md')
  try {
    await fs.access(welcome)
  } catch {
    await fs.writeFile(welcome, WELCOME_DOC, 'utf-8')
  }
  vaultRoot = root
  await writeSettings({ vaultRoot: root })
  return root
}

const WELCOME_DOC = `# 欢迎使用 飞儿MD

这是一款跨平台的 Markdown 笔记应用。左侧是文件树，中间是编辑区，右侧是实时预览。

## 常用操作

- **新建文档**：\`⌘/Ctrl + N\`
- **新建文件夹**：\`⇧⌘/Ctrl + Shift + N\`
- **重命名**：在文件树上右键，或按 \`F2\`
- **删除**：\`⌘/Ctrl + Backspace\`（进入回收站，可恢复）
- **全局搜索**：\`⌘/Ctrl + F\`
- **导出**：\`⌘/Ctrl + E\`

## 语法速览

| 语法 | 效果 |
| --- | --- |
| \`# 标题\` | 一级标题 |
| \`**粗体**\` | **粗体** |
| \`- 列表\` | 无序列表 |
| \`> 引用\` | 引用块 |

- [x] 已支持任务列表
- [ ] 待办事项

\`\`\`js
// 代码高亮
function hello(name) {
  console.log(\`Hello, \${name}!\`)
}
\`\`\`

## 数学公式

行内公式 $E = mc^2$，块级公式：

$$
\\int_{0}^{\\infty} e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}
$$

## 流程图

\`\`\`mermaid
graph LR
  A[新建文档] --> B[编辑内容]
  B --> C[实时预览]
  C --> D[导出 / 分享]
\`\`\`

> 提示：所有改动都会自动保存，无需手动操作。
`

/* ------------------------------------------------------------------ */
/* 创建窗口                                                              */
/* ------------------------------------------------------------------ */

function createWindow(): void {
  rendererReady = false
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 900,
    minHeight: 600,
    show: false,
    title: APP_NAME,
    backgroundColor: '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow?.show())

  mainWindow.on('closed', () => {
    mainWindow = null
    rendererReady = false
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

/* ------------------------------------------------------------------ */
/* 原生菜单                                                              */
/* ------------------------------------------------------------------ */

function send(action: string, payload?: unknown): void {
  mainWindow?.webContents.send('menu:command', { action, payload })
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: 'about' as const },
              { type: 'separator' as const },
              { label: '偏好设置…', accelerator: 'CmdOrCtrl+,', click: () => send('settings') },
              { type: 'separator' as const },
              { role: 'hide' as const },
              { role: 'quit' as const }
            ]
          }
        ]
      : []),
    {
      label: '文件',
      submenu: [
        { label: '新建文档', accelerator: 'CmdOrCtrl+N', click: () => send('new-doc') },
        { label: '新建文件夹', accelerator: 'Shift+CmdOrCtrl+N', click: () => send('new-folder') },
        { type: 'separator' },
        { label: '重命名', accelerator: 'F2', click: () => send('rename') },
        { label: '删除（移入回收站）', accelerator: 'CmdOrCtrl+Backspace', click: () => send('delete') },
        { label: '回收站', accelerator: 'Shift+CmdOrCtrl+T', click: () => send('trash') },
        { type: 'separator' },
        { label: '打开文件…', accelerator: 'CmdOrCtrl+O', click: () => send('open-file') },
        { label: '打开工作区…', accelerator: 'Shift+CmdOrCtrl+O', click: () => send('choose-vault') },
        { label: '导入 Markdown 文件…', accelerator: 'CmdOrCtrl+I', click: () => send('import') },
        { label: '导出…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        ...(isMac ? [] : [{ type: 'separator' as const }, { role: 'quit' as const }])
      ]
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
        { type: 'separator' },
        { label: '全局搜索', accelerator: 'CmdOrCtrl+F', click: () => send('search') },
        { label: '查找替换', accelerator: 'CmdOrCtrl+H', click: () => send('replace') }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '切换侧边栏', accelerator: 'CmdOrCtrl+B', click: () => send('toggle-sidebar') },
        { label: '切换预览', accelerator: 'CmdOrCtrl+P', click: () => send('toggle-preview') },
        { label: '切换大纲', accelerator: 'Shift+CmdOrCtrl+O', click: () => send('toggle-outline') },
        { label: '切换主题', accelerator: 'CmdOrCtrl+J', click: () => send('toggle-theme') },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
        { role: 'toggleDevTools', label: '开发者工具' }
      ]
    },
    {
      label: '帮助',
      submenu: [
        { label: 'Markdown 语法参考', click: () => shell.openExternal('https://commonmark.org/help/') },
        { label: '关于 飞儿MD', click: () => send('about') }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/* ------------------------------------------------------------------ */
/* IPC：文件系统桥                                                       */
/* ------------------------------------------------------------------ */

function registerIpc(): void {
  ipcMain.handle('vault:get', () => ({ root: vaultRoot }))

  ipcMain.handle('vault:choose', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: '选择工作区目录',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths.length) return null
    vaultRoot = res.filePaths[0]
    await fs.mkdir(vaultRoot, { recursive: true })
    await writeSettings({ vaultRoot })
    return { root: vaultRoot }
  })

  ipcMain.handle('fs:readFile', async (_e, rel: string) => fs.readFile(safeJoin(rel), 'utf-8'))

  ipcMain.handle('fs:writeFile', async (_e, rel: string, data: string) => {
    const full = safeJoin(rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, data, 'utf-8')
  })

  ipcMain.handle('fs:readBinary', async (_e, rel: string) => {
    const buf = await fs.readFile(safeJoin(rel))
    return buf.toString('base64')
  })

  ipcMain.handle('fs:writeBinary', async (_e, rel: string, base64: string) => {
    const full = safeJoin(rel)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, Buffer.from(base64, 'base64'))
  })

  ipcMain.handle('fs:mkdir', async (_e, rel: string) => {
    await fs.mkdir(safeJoin(rel), { recursive: true })
  })

  ipcMain.handle('fs:readdir', async (_e, rel: string) => {
    const full = safeJoin(rel)
    const entries = await fs.readdir(full, { withFileTypes: true })
    return entries
      .filter((x) => !x.name.startsWith('.'))
      .map((x) => ({ name: x.name, dir: x.isDirectory() }))
  })

  ipcMain.handle('fs:remove', async (_e, rel: string, recursive: boolean) => {
    await fs.rm(safeJoin(rel), { recursive, force: true })
  })

  ipcMain.handle('fs:rename', async (_e, from: string, to: string) => {
    const dst = safeJoin(to)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    try {
      await fs.access(dst)
      throw new Error(`目标已存在: ${to}`)
    } catch (err: any) {
      if (err?.code !== 'ENOENT') throw err
    }
    await fs.rename(safeJoin(from), dst)
  })

  ipcMain.handle('fs:stat', async (_e, rel: string) => {
    try {
      const st = await fs.stat(safeJoin(rel))
      return { dir: st.isDirectory(), size: st.size, mtime: st.mtimeMs }
    } catch {
      return null
    }
  })

  ipcMain.handle('fs:exists', async (_e, rel: string) => {
    try {
      await fs.access(safeJoin(rel))
      return true
    } catch {
      return false
    }
  })

  /* 外部文件（绝对路径，仅限已登记的文件） */
  ipcMain.handle('file:openDialog', async () => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: '打开 Markdown 文件',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }]
    })
    if (res.canceled) return []
    return res.filePaths.map((p) => {
      const abs = authorizeExternal(p)
      return { path: abs, name: path.basename(abs) }
    })
  })

  ipcMain.handle('file:read', (_e, abs: string) => fs.readFile(resolveExternal(abs), 'utf-8'))

  ipcMain.handle('file:write', async (_e, abs: string, data: string) => {
    const full = resolveExternal(abs)
    await fs.writeFile(full, data, 'utf-8')
    const st = await fs.stat(full)
    return { mtime: st.mtimeMs, size: st.size }
  })

  ipcMain.handle('file:stat', async (_e, abs: string) => {
    // 授权/类型校验失败要抛出，不能和「文件不存在」混为一谈
    const full = resolveExternal(abs)
    try {
      const st = await fs.stat(full)
      return { exists: true, size: st.size, mtime: st.mtimeMs }
    } catch {
      return { exists: false, size: 0, mtime: 0 }
    }
  })

  ipcMain.handle('file:reveal', (_e, abs: string) => {
    shell.showItemInFolder(resolveExternal(abs))
  })

  /* 外部文件旁边的图片资源（二进制） */
  ipcMain.handle('file:readBinary', async (_e, abs: string) => {
    const buf = await fs.readFile(resolveExternalAsset(abs))
    return buf.toString('base64')
  })

  ipcMain.handle('file:writeBinary', async (_e, abs: string, base64: string) => {
    const full = resolveExternalAsset(abs)
    await fs.mkdir(path.dirname(full), { recursive: true })
    await fs.writeFile(full, Buffer.from(base64, 'base64'))
  })

  /* 渲染层就绪握手：早到的 open-file 请求在这里补投 */
  ipcMain.handle('app:renderer-ready', () => {
    rendererReady = true
    flushOpenFiles()
    return true
  })

  /* 系统交互 */
  ipcMain.handle('dialog:saveText', async (_e, defaultName: string, content: string, ext: string) => {
    const res = await dialog.showSaveDialog(mainWindow!, {
      title: '导出',
      defaultPath: defaultName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }]
    })
    if (res.canceled || !res.filePath) return null
    await fs.writeFile(res.filePath, content, 'utf-8')
    return res.filePath
  })

  ipcMain.handle('dialog:openText', async (_e, ext: string) => {
    const res = await dialog.showOpenDialog(mainWindow!, {
      title: '导入 Markdown',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Markdown', extensions: ext ? [ext] : ['md', 'markdown', 'txt'] }]
    })
    if (res.canceled) return []
    const out: { name: string; content: string }[] = []
    for (const p of res.filePaths) {
      out.push({ name: path.basename(p), content: await fs.readFile(p, 'utf-8') })
    }
    return out
  })

  ipcMain.handle('shell:showItem', async (_e, rel: string) => {
    shell.showItemInFolder(safeJoin(rel))
  })

  ipcMain.handle('theme:set', async (_e, theme: 'light' | 'dark' | 'system') => {
    nativeTheme.themeSource = theme
    await writeSettings({ theme })
  })
}

/* ------------------------------------------------------------------ */
/* 生命周期                                                              */
/* ------------------------------------------------------------------ */

/* 单实例：从访达反复「打开方式」时复用同一个窗口，而不是再起一个进程 */
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    for (const f of filesFromArgv(argv)) pendingOpen.push(f)
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
    flushOpenFiles()
  })

  app.whenReady().then(async () => {
    const settings = await readSettings()
    if (settings.theme) nativeTheme.themeSource = settings.theme

    // 冷启动时若由「打开方式」拉起，文件在 ready 之前就已排队
    for (const f of filesFromArgv(process.argv.slice(1))) pendingOpen.push(f)

    await ensureVault()
    registerIpc()
    buildMenu()
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
}
