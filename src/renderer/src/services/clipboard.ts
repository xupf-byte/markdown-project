/**
 * 复制文本到系统剪贴板。
 *
 * 三级回退，保证打包后的 Electron 与浏览器预览两种环境都能用：
 *   1. Electron：走 preload 暴露的 IPC，由主进程 clipboard 写入（最可靠，
 *      不依赖渲染进程的权限与 secure context）
 *   2. 浏览器：navigator.clipboard.writeText（依赖安全上下文）
 *   3. 最后兜底：隐藏 textarea + document.execCommand('copy')
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false

  if (window.api?.writeClipboard) {
    try {
      await window.api.writeClipboard(text)
      return true
    } catch {
      /* 继续回退 */
    }
  }

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      /* 继续回退 */
    }
  }

  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.top = '-9999px'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
