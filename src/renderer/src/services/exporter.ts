/** 导出 / 导入：Electron 走原生对话框，浏览器走 Blob 下载与 file input 兜底 */

export interface ImportedFile {
  name: string
  content: string
}

function downloadBrowser(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportText(
  filename: string,
  content: string,
  ext: 'md' | 'html' | 'txt' | 'json'
): Promise<string | null> {
  if (window.api?.isElectron) {
    return window.api.saveText(filename, content, ext)
  }
  const mime =
    ext === 'html' ? 'text/html;charset=utf-8' : ext === 'json' ? 'application/json' : 'text/plain;charset=utf-8'
  downloadBrowser(filename, content, mime)
  return filename
}

export async function importFiles(): Promise<ImportedFile[]> {
  if (window.api?.isElectron) {
    return window.api.openText('md')
  }
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.md,.markdown,.txt,text/markdown'
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      const out: ImportedFile[] = []
      for (const f of files) out.push({ name: f.name, content: await f.text() })
      resolve(out)
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

/** 打印为 PDF（Electron 与浏览器都支持的系统打印对话框） */
export function exportPdf(title: string, bodyHtml: string, themeCss: string): void {
  const frame = document.createElement('iframe')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)

  const doc = frame.contentDocument!
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeAttr(title)}</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; color:#1f2328; line-height:1.7; font-size:14px; }
  h1,h2,h3,h4 { line-height:1.35; margin:1.2em 0 .6em; }
  h1 { font-size:1.9em; border-bottom:1px solid #e5e7eb; padding-bottom:.3em; }
  h2 { font-size:1.5em; border-bottom:1px solid #eef0f2; padding-bottom:.25em; }
  code { background:#f3f4f6; padding:.15em .35em; border-radius:4px; font-size:.9em; }
  pre { background:#f6f8fa; padding:12px 14px; border-radius:8px; overflow:auto; }
  pre code { background:none; padding:0; }
  blockquote { margin:1em 0; padding:.2em 1em; border-left:4px solid #d0d7de; color:#57606a; }
  table { border-collapse:collapse; width:100%; margin:1em 0; }
  th,td { border:1px solid #d0d7de; padding:6px 10px; text-align:left; }
  img { max-width:100%; }
  .code-lang { display:none; }
  ${themeCss}
</style></head><body>${bodyHtml}</body></html>`)
  doc.close()

  frame.onload = () => {
    setTimeout(() => {
      frame.contentWindow?.focus()
      frame.contentWindow?.print()
      setTimeout(() => frame.remove(), 800)
    }, 300)
  }
}

function escapeAttr(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] as string)
}

/** 生成独立可用的 HTML 文件（内嵌样式，便于分享） */
export function buildStandaloneHtml(title: string, bodyHtml: string, extraCss = ''): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeAttr(title)}</title>
<style>
  :root { color-scheme: light dark; }
  body { max-width: 820px; margin: 40px auto; padding: 0 20px;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    line-height: 1.75; color:#1f2328; background:#fff; }
  h1,h2 { border-bottom:1px solid #e5e7eb; padding-bottom:.3em; }
  code { background:#f3f4f6; padding:.15em .35em; border-radius:4px; }
  pre { background:#f6f8fa; padding:14px; border-radius:8px; overflow:auto; }
  pre code { background:none; padding:0; }
  blockquote { border-left:4px solid #d0d7de; margin:1em 0; padding:.2em 1em; color:#57606a; }
  table { border-collapse:collapse; width:100%; }
  th,td { border:1px solid #d0d7de; padding:6px 10px; }
  img { max-width:100%; }
  .code-lang { float:right; font-size:12px; color:#8b949e; }
  @media (prefers-color-scheme: dark) {
    body { background:#0d1117; color:#e6edf3; }
    h1,h2 { border-color:#30363d; }
    code { background:#161b22; }
    pre { background:#161b22; }
    blockquote { border-color:#30363d; color:#8b949e; }
    th,td { border-color:#30363d; }
  }
  ${extraCss}
</style>
</head>
<body>${bodyHtml}</body>
</html>`
}
