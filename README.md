# 飞儿MD · 跨平台 Markdown 笔记应用

![飞儿MD](build/icon.png)

Electron + Vue 3 打造的桌面端 Markdown 编辑器。左侧文件树、中间编辑区、右侧实时预览，支持文档的新建 / 编辑 / 删除 / 重命名 / 移动 / 回收站恢复，以及 GFM、数学公式、代码高亮、Mermaid 图表。

![亮色主题](docs/screenshot-light.png)

## 功能清单

### 文档管理
- 新建文档 / 新建文件夹（支持任意层级）
- 重命名、删除（软删除进回收站）、拖拽移动到指定文件夹
- 回收站：恢复、单独彻底删除、一键清空
- 多标签页（含未保存标记），中键快速关闭
- 收藏置顶、标签分类、最近修改排序

### 编辑体验
- 分栏实时预览 / 纯编辑 / 纯预览 三种视图，滚动位置双向同步
- 工具栏：标题、粗体、斜体、删除线、行内代码、引用、无序/有序/任务列表、链接、图片、表格、代码块、公式、Mermaid、分隔线
- 快捷键：`⌘B` 加粗、`⌘I` 斜体、`⌘K` 链接、`⌘`` 行内代码、`Tab` 缩进
- 回车自动续写列表标记，空列表项自动退出列表
- 粘贴图片自动存入文档库并插入引用（Electron 与浏览器均可用）
- 撤销 / 重做、自动保存（防抖 600ms）、异常退出保护
- 大纲（TOC）导航，点击跳转

### 渲染能力
- GFM：表格、任务列表（可直接勾选回写源文件）、删除线、自动链接
- 代码高亮（highlight.js，亮暗双主题适配）
- 数学公式（KaTeX）：`$行内$` 与 `$$块级$$`
- 图表（Mermaid）：流程图、时序图、甘特图等，动态加载不拖慢首屏
- 输出经 DOMPurify 清洗；标题自动生成锚点 id，支持 `#锚点` 与相对路径 `.md` 互跳
- 单换行按原样换行（不会被折叠成空格）
- **预览增强**：自动补全代码块 —— 未写围栏的配置片段、用单个 ` 包裹的多行代码（可在「偏好设置 → 预览增强」关闭）

### 检索与导出
- 全局搜索：文件名 + 正文全文，命中高亮，点击定位到具体行
- 导出：Markdown / HTML（独立自包含）/ PDF（系统打印）
- 导入：批量导入本地 `.md` 文件
- **打开工作区外的文件**：访达右键「打开方式 → 飞儿MD」（或 `⌘O`），原地编辑原文件、自动保存写回原路径

### 平台与主题
- 亮色 / 暗色 / 跟随系统，一键循环切换
- 原生菜单与快捷键接入（macOS `hiddenInset` 标题栏）
- 存储适配器抽象：同一套业务逻辑可跑在真实文件系统或浏览器 IndexedDB 上

## 预览渲染的三个约定

导入外部 `.md` 时，最常见的观感落差来自 Markdown 自身的规则。本项目对这三类做了容错处理：

**1. 单换行按原样换行（`breaks: true`）**

CommonMark 规定段落内的单个换行是"软换行"，渲染时折叠成一个**空格**。中文笔记里习惯用单换行断句，
且没有加围栏的配置片段会因此整块被压成一行、缩进结构全丢。所以预览开启 `breaks`。

**2. 单个反引号包裹的多行内容 → 还原成代码块**

很多笔记习惯用单个 `` ` ``（而不是 ```` ``` ````）包住整段代码 / 配置。对 CommonMark 来说，
code span **不能跨空行** —— 空行会终结段落，于是那一段里的反引号永远配不上对，引出三重后果：

1. 反引号原样显示，整块内容根本没被当成代码；
2. `  # 注释`（缩进 0–3 格）**落在代码跨度之外**，是合法的 ATX 标题，而且标题可以中断段落
   → 注释被渲染成一级大标题（这正是"行内代码里的 `#` 注释变标题"的成因）；
3. 块内 `&lt;groupId&gt;` 这类内容会被当成 HTML 解析，清洗后整段丢失。

判定规则：某行**以反引号开头、且本行内不再出现反引号**（未闭合），且随后能找到一行**以同长度反引号结尾**
—— 即认定为一个代码块。所以：

- 单行行内代码 `` `npm run dev` ``、一行里多处行内代码，都不受影响；
- 已经用 ```` ``` ```` 围栏包好的内容不受影响；
- 扫描会在撞到 ```` ``` ```` 围栏、或"还没看到任何代码特征就撞上顶层标题"时放弃，
  并有 **300 行**上限，避免一个漏写的反引号吞掉整篇文档；
- 语言按首行自动判断（xml / java / bash / yaml / json），拿不准就交给 highlight.js 自动识别。

**3. 未写围栏的配置片段自动补代码块**

yaml / properties / ini 直接贴在正文里时，除了行被合并，同样会有上面第 2、3 条的问题。
判定条件是**连续 ≥2 行、每行都是 `key:` / `key: value` / `#` / `-` 形式、且至少一行带缩进，
同时首行顶格且前一行是空行或标题**。中文段落（用全角 `：`）、无缩进的 `Time: 10:30` 两行、
列表、引用块、正文里的冒号行都不会被误伤。

三者都只作用于**渲染**，磁盘上的 `.md` 文件不会被改动；可在「偏好设置 → 预览增强」整体关闭，
关闭后回到严格 CommonMark 行为。

修复前后对照：`docs/fix-backtick-yaml-on.png` / `docs/fix-backtick-yaml-off.png`（第 2 条）、
`docs/fix-autofence-on.png` / `docs/fix-autofence-off.png`（第 3 条）。

## 从访达「打开方式」打开文件

把 `飞儿MD.app` 拖进 `/Applications`（或直接双击运行一次）后，任意文件夹里的 `.md` 都会在右键
**打开方式** 里出现「飞儿MD」。也可以直接在应用里按 `⌘O`，或在文件菜单选「打开文件…」。

**它的行为是「原地编辑」，不是「导入」**：

| | 行为 |
| --- | --- |
| 文件位置 | 就地读写，不复制、不移动到工作区 |
| 保存 | 自动保存与 `⌘S` 都写回**原路径** |
| 标签页 | 带「外部」标记，悬停显示绝对路径 |
| 侧边栏 | 独立「外部文件」分组，显示所在目录（右键在访达中显示） |
| 状态栏 | 显示「工作区外文件」与文件所在目录 |
| 回收站 / 重命名 | 不参与 —— 避免误动工作区外的真实文件 |

同时打开多个文件时不会起多个进程：应用带单实例锁，第二次「打开方式」会把文件送到**已有窗口**开成新标签页。
冷启动时系统投递的文件路径会先排队，等界面就绪后再补投，不会丢。

**权限边界**：主进程对工作区内的路径有越界校验（`safePath`），工作区外的路径则单独走一条白名单通道
（`authorizeExternal` / `resolveExternal`）—— 只有系统投递或用户在对话框里选中的文件才被登记，
之后每一次读写还会二次校验；粘贴图片写入的 `<文件名>.assets/` 也仅限「已授权文件所在目录及其子目录」。
未经登记的同目录 `.md` 一样会被拒绝。

**若右键菜单里没出现**：确认 App 在 `/Applications` 下，然后执行一次

```bash
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
  -f /Applications/飞儿MD.app
```

## 快速开始

```bash
npm install

# 桌面应用开发（Electron 窗口 + 热更新）
npm run dev

# 浏览器预览（使用 IndexedDB 虚拟文件系统，不需要 Electron）
npm run web

# 生产构建
npm run build

# 打包 macOS 安装包（构建 → 打包 → 签名 → 封 DMG）
npm run dist:mac     # → release/飞儿MD-<版本>-arm64.dmg 与 release/mac-arm64/飞儿MD.app
npm run dist:win     # → release/*.exe
npm run dist:linux   # → release/*.AppImage
```

> 若本机 npm 受沙箱影响安装失败，可显式指定可写的缓存目录：
> `npm_config_cache="$PWD/.npm-cache" npm install --no-audit --no-fund`

## macOS 打包说明

`npm run dist:mac` 走的是 `scripts/package-mac.sh`，顺序是**先打包 → 再 ad-hoc 签名 → 最后封 DMG**，原因是：

- electron-builder 的 mac 目标只支持「真实证书签名」或「完全跳过签名」，**不支持 ad-hoc 签名**；
- 而 Apple Silicon 上签名缺失或失效的 App 会被系统直接拒绝启动。

所以必须在 electron-builder 打完包之后单独补一次 ad-hoc 签名，再封装 DMG —— 否则 DMG 里装的会是签名失效的 `.app`。

### 首次打开会被 Gatekeeper 拦？

- **本机自己构建的产物直接双击即可**，不会带隔离标记；
- **从网络下载 / 传给别人的 DMG** 会带上隔离标记，首次打开可能提示「无法验证开发者」。此时在 App 上**右键 → 打开**，或执行
  `xattr -dr com.apple.quarantine /Applications/飞儿MD.app` 即可。

要彻底消除该提示，需要 Apple Developer 账号的 Developer ID 证书做正式签名 + 公证（notarization）。

### 更换应用图标

`build/icon.icns` 由 `scripts/make-icon.py` 从源图生成，会按 macOS 图标网格裁成圆角矩形（内容区 824×824、圆角 185、四周透明留白）：

```bash
python3 scripts/make-icon.py <源图路径> build
```

依赖 Pillow，最后一步用系统 `iconutil` 封装。

## 项目结构

```
src/
├─ main/index.ts            Electron 主进程：窗口、原生菜单、文件系统 IPC（含路径越界校验）
├─ preload/index.ts         contextBridge 暴露的 window.api（唯一跨进程通道）
└─ renderer/
   ├─ index.html
   └─ src/
      ├─ App.vue            布局编排、滚动同步、菜单指令、右键菜单
      ├─ components/        TitleBar / SideBar / DocTree / TabBar / Toolbar / Editor / Preview / Outline / Dialogs
      ├─ stores/            Pinia：vault（文档库）、settings（偏好）
      ├─ services/          markdown（渲染）、editor-ops（编辑器操作）、exporter（导入导出）
      └─ storage/           存储适配层
         ├─ fslike.ts       8 个原语的最小抽象 + 路径工具
         ├─ node-fs.ts      Electron：IPC → 真实文件系统
         ├─ idb-fs.ts       浏览器：IndexedDB 虚拟文件系统
         ├─ vault.ts        统一文档库：树构建 / 增删改查 / 回收站 / 标签 / 搜索
         └─ paths.ts        相对路径解算（图片引用）
```

```
build/                     构建资源：icon.icns / icon.png（应用图标，由脚本生成）
scripts/
├─ make-icon.py            源图 → macOS 圆角图标（图标网格 824 + 圆角 185 + iconutil）
└─ package-mac.sh          macOS 打包流水线：构建 → 打包 → ad-hoc 签名 → 封 DMG
```

## 数据存放位置

| 环境 | 位置 |
| --- | --- |
| Electron | 默认 `~/Documents/MarkdownNotes`，可在「偏好设置 → 更换工作区」中切换 |
| 浏览器 | IndexedDB 数据库 `mdnotes-vault` |

> 应用对外的显示名是「飞儿MD」；内部标识符（`.mdnotes/` 元数据目录、`mdnotes-vault` 数据库名、`mdnotes.settings` 偏好键）保持原名不动，以免破坏既有数据的兼容性。

文档目录下会生成一个 `.mdnotes/` 隐藏目录，用于存放元数据（标签、收藏、展开状态）、回收站与粘贴的图片资源，不影响普通 Markdown 文件的正常使用 —— 你可以随时用其他编辑器打开同一目录。

## 技术栈

Electron 33 · Vue 3.5 · Pinia 2 · Element Plus 2.9 · Vite 5 · electron-vite 2
marked 14 · highlight.js 11 · KaTeX 0.16 · Mermaid 11 · DOMPurify 3 · electron-builder 25

## 验证状态

核心链路已在无头 Chromium 中端到端跑通（28/28 通过）：启动播种、新建文档、编辑与实时预览（GFM 加粗 / 行内代码 / 任务列表 / 表格）、KaTeX、代码高亮、Mermaid、自动保存、大纲、全文搜索、回车续写列表、右键菜单、重命名、删除→回收站→恢复、主题切换、新建文件夹、拖拽移动，全程无未捕获异常与控制台报错。

打包产物同样做过验证：`release/飞儿MD-0.1.0-arm64.dmg` 校验和有效，挂载后内含 `飞儿MD.app` 与 `/Applications` 快捷方式，`codesign --verify --deep --strict` 通过，并已从 DMG 内直接启动成功（菜单栏显示「飞儿 MD / 文件 / 编辑 / 视图 / 帮助」）。

预览渲染修复的验证（14/14 通过，Chrome DevTools 协议驱动真实页面）：

- 自动围栏算法单测 17/17：用户那份 yaml 的两个块被正确补围栏，8 个易误伤用例（中文全角冒号段落、英文单行冒号、无缩进两行键值、正文中的冒号行、列表、引用块、URL 行等）全部未被误伤，且**幂等**（对已围栏内容再跑一次结果不变）。
- 端到端：yaml 缩进结构完整保留、`# 注释`不再变成 `h1`、真正的 `##` 标题仍为 `h2`、行内代码 `` `api-key` `` 恢复识别、单换行被保留。
- 开关可来回切换：通过真实 UI 关闭后不再自动围栏、原缺陷如期复现（反证自动围栏确实是修复原因），重新打开后恢复；开关状态已持久化。
- 全程无未捕获异常、无控制台报错。
