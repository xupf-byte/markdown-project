import { Marked } from 'marked'
import { gfmHeadingId } from 'marked-gfm-heading-id'
import markedKatex from 'marked-katex-extension'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import type { OutlineItem } from '../types'

/* ------------------------------------------------------------------ */
/* Marked 实例：GFM + 标题锚点 + KaTeX 数学公式 + 代码高亮                */
/* ------------------------------------------------------------------ */

/* breaks: true —— 段落内的单个换行渲染为 <br>。
   CommonMark 默认把软换行折叠成空格，中文笔记里习惯单换行断句，
   且未用围栏包裹的配置片段会因此被压成一行、缩进结构全丢。 */
const marked = new Marked({ gfm: true, breaks: true })

marked.use(gfmHeadingId())
marked.use(
  markedKatex({
    throwOnError: false,
    nonStandard: true,
    output: 'html'
  }) as never
)

marked.use({
  renderer: {
    code(token: { text: string; lang?: string }) {
      const info = (token.lang || '').trim()
      const lang = info.split(/\s+/)[0]
      if (lang === 'mermaid') {
        return `<div class="mermaid">${escapeHtml(token.text)}</div>`
      }
      let html: string
      if (lang && hljs.getLanguage(lang)) {
        html = hljs.highlight(token.text, { language: lang }).value
      } else {
        html = hljs.highlightAuto(token.text).value
      }
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
      return `<div class="code-wrap">${label}<pre class="hljs"><code>${html}</code></pre></div>`
    }
  }
})

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ------------------------------------------------------------------ */
/* 预览容错：给「没写代码围栏的配置片段」自动补围栏                        */
/*                                                                     */
/* 背景：很多人会把 yaml / properties / ini 直接贴在正文里而不加 ```。   */
/* 没有围栏时 Markdown 会按普通段落解析，带来三个连锁问题：               */
/*   1. 段落内的单换行被折叠成空格 → 缩进结构丢失，整块挤成一行；         */
/*   2. `  # 注释` 缩进 0–3 格时会被合法地解析成 ATX 标题；              */
/*   3. 行被并进同一段落后反引号的配对范围跨过原行边界 → 行内代码识别不全。*/
/* 这里只在渲染前补围栏，源文件不动。                                     */
/* ------------------------------------------------------------------ */

/** 首行必须是顶格的 `key:` / `key: value`（键名限 ASCII，中文全角「：」不会命中） */
const RE_KEY_HEAD = /^[A-Za-z_][\w.-]*\s*:(\s|$)/
/** 配置块内允许的续行：键值行（可缩进）、注释行、列表项 */
const RE_KEY_ANY = /^\s*[A-Za-z_][\w.-]*\s*:(\s|$)/
const RE_COMMENT = /^\s*#/
const RE_LIST_ITEM = /^\s*-\s/
/** 代码围栏边界 */
const RE_FENCE = /^\s{0,3}(```|~~~)/

export function autoFenceConfig(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let inFence = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (RE_FENCE.test(line)) {
      inFence = !inFence
      out.push(line)
      i++
      continue
    }
    if (inFence) {
      out.push(line)
      i++
      continue
    }

    if (RE_KEY_HEAD.test(line)) {
      // 只在前一行是空行 / 标题时才认定为一个新块，
      // 避免把正文段落里的某一行误判成配置开头。
      const prev = i > 0 ? lines[i - 1] : null
      const atBlockStart =
        prev === null || !prev.trim() || /^\s{0,3}#{1,6}\s/.test(prev)

      if (atBlockStart) {
        let j = i
        const block: string[] = []
        let indented = false
        while (j < lines.length) {
          const l = lines[j]
          if (!l.trim()) break
          if (!(RE_KEY_ANY.test(l) || RE_COMMENT.test(l) || RE_LIST_ITEM.test(l))) break
          if (/^\s/.test(l)) indented = true
          block.push(l)
          j++
        }
        // 至少要 2 行、且存在缩进，才认为是配置片段而不是普通短句
        if (block.length >= 2 && indented) {
          out.push('```yaml', ...block, '```')
          i = j
          continue
        }
      }
    }

    out.push(line)
    i++
  }

  return out.join('\n')
}

/* ------------------------------------------------------------------ */
/* 预览容错 2：把「单个反引号包裹的多行内容」还原成代码块                  */
/*                                                                     */
/* 背景：不少笔记习惯用单个 ` 而不是 ``` 包住整段代码 / 配置。而对           */
/* CommonMark 来说，code span 不能跨空行 —— 空行会终结段落，于是那一段里   */
/* 的反引号永远配不上对，后果是三重的：                                   */
/*   1. 反引号原样显示出来，整块内容根本没被当成代码；                     */
/*   2. `  # 注释`（缩进 0–3 格）落在了代码跨度之外，是合法的 ATX 标题，   */
/*      而且标题可以中断段落 → 注释被渲染成一级大标题；                   */
/*   3. 块内 `&lt;groupId&gt;` 这类内容会被当成 HTML 解析，清洗后整段丢失。  */
/* 这里在渲染前识别这种块并补上围栏，源文件不动。                          */
/* ------------------------------------------------------------------ */

/** 行首 1–2 个反引号，且本行后面不再出现反引号（即未闭合）；3 个及以上由 RE_FENCE 处理 */
const RE_TICKS_OPEN = /^(`{1,2})([^`]*)$/
/** 顶层 ATX 标题 —— 缩进的 `  # 注释` 不会命中 */
const RE_HEADING = /^#{1,6}(\s|$)/
/** 代码特征：有缩进 / 尖括号花括号分号等号 / 形如 `键:` 结尾 / shebang / 常见关键字 */
const RE_CODEISH =
  /(^\s{2,}\S|[<>{};=]|:\s*$|^#!|\b(?:public|private|class|interface|enum|record|function|def|const|let|var|return|import|package)\b)/
/** 扫描收尾行时允许跨越的最大行数：防止一个漏写的反引号吞掉整篇文档 */
const MAX_TICK_SPAN = 300

/** 粗判语言用于高亮，拿不准就交给 highlight.js 自动识别 */
function guessLang(body: string[]): string {
  const first = (body.find((l) => l.trim()) || '').trim()
  const all = body.join('\n')
  if (/^<\?xml|^<![A-Za-z]|^<[A-Za-z][\w:-]*[\s>/]/.test(first)) return 'xml'
  if (
    /^(?:import|package)\s+[\w.*]+\s*;?\s*$/.test(first) ||
    /\b(?:public|private|protected)\s+(?:class|interface|enum|record)\b/.test(all)
  ) {
    return 'java'
  }
  if (
    /^#!/.test(first) ||
    /^(?:export|sudo|source|cd|npm|pnpm|yarn|git|docker|brew|chmod|mkdir|curl|echo|mvn|gradle)\s/.test(
      first
    )
  ) {
    return 'bash'
  }
  if (/^[A-Za-z_$][\w.$-]*\s*:(\s|$)/.test(first)) return 'yaml'
  if (/^[[{]/.test(first)) return 'json'
  return ''
}

/**
 * 把「用单个 / 两个反引号包裹的多行内容」还原成 ``` 代码块。
 *
 * 判定：某行以反引号串开头、本行内不再出现反引号（未闭合），
 * 且随后能找到一行以同长度反引号串结尾 —— 认定为一个代码块。
 * 收尾行里反引号之后的内容会被忽略（作者习惯把结束符写在行尾）。
 */
export function autoFenceTicks(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let inFence = false
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (RE_FENCE.test(line)) {
      inFence = !inFence
      out.push(line)
      i++
      continue
    }
    if (inFence) {
      out.push(line)
      i++
      continue
    }

    const open = RE_TICKS_OPEN.exec(line)
    if (open) {
      const closeRe = new RegExp(`${'`'.repeat(open[1].length)}\\s*$`)
      let j = i + 1
      let closeAt = -1
      let codeish = false

      while (j < lines.length && j - i <= MAX_TICK_SPAN) {
        const l = lines[j]
        if (RE_FENCE.test(l)) break // 撞上真正的围栏，放弃
        if (closeRe.test(l)) {
          closeAt = j
          break
        }
        // 还没看到任何代码特征就撞上顶层标题 → 大概率不是代码块，放弃
        if (RE_HEADING.test(l) && !codeish) break
        if (RE_CODEISH.test(l)) codeish = true
        j++
      }

      if (closeAt > i) {
        const body: string[] = []
        if (open[2].trim()) body.push(open[2])
        body.push(...lines.slice(i + 1, closeAt))
        const tail = lines[closeAt].replace(closeRe, '')
        if (tail.trim()) body.push(tail)

        // 至少 2 行有效内容，避免把「一行写一半」的正文误判成代码块
        if (body.filter((l) => l.trim()).length >= 2) {
          out.push('```' + guessLang(body), ...body, '```')
          i = closeAt + 1
          continue
        }
      }
    }

    out.push(line)
    i++
  }

  return out.join('\n')
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

export interface RenderOptions {
  /** 预览容错：自动补全代码块（默认开启，仅影响渲染结果，不改磁盘文件） */
  autoFence?: boolean
}

export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const src =
    options.autoFence === false
      ? (source ?? '')
      : autoFenceConfig(autoFenceTicks(source ?? ''))
  const raw = marked.parse(src, { async: false }) as string
  return DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
    ADD_ATTR: ['target', 'rel', 'data-processed'],
    ADD_TAGS: ['math', 'semantics', 'annotation', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub']
  })
}

/** 从渲染后的 HTML 中提取大纲（id 与渲染结果完全一致，保证锚点可跳转） */
export function buildOutline(html: string): OutlineItem[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = doc.querySelectorAll('h1, h2, h3, h4, h5, h6')
  return Array.from(nodes).map((el, i) => ({
    id: el.id || `heading-${i}`,
    text: (el.textContent || '').trim(),
    level: Number(el.tagName.slice(1)),
    line: 0
  }))
}

/* ------------------------------------------------------------------ */
/* Mermaid：按需动态加载，避免拖慢首屏                                    */
/* ------------------------------------------------------------------ */

let mermaidTheme: string | null = null

export async function renderMermaid(container: HTMLElement, dark: boolean): Promise<void> {
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>('.mermaid:not([data-processed])')
  )
  if (!nodes.length) return
  try {
    const mermaid = (await import('mermaid')).default
    const theme = dark ? 'dark' : 'default'
    if (mermaidTheme !== theme) {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme,
        fontFamily: 'inherit'
      })
      mermaidTheme = theme
    }
    await mermaid.run({ nodes })
  } catch (err) {
    console.warn('[mermaid] 渲染失败', err)
    nodes.forEach((n) => {
      n.setAttribute('data-processed', 'true')
      n.classList.add('mermaid-error')
    })
  }
}

/* ------------------------------------------------------------------ */
/* 统计                                                                */
/* ------------------------------------------------------------------ */

export interface DocStats {
  chars: number
  words: number
  lines: number
  readMinutes: number
}

export function statsOf(text: string): DocStats {
  const chars = text.length
  const cjk = (text.match(/[\u4e00-\u9fa5]/g) || []).length
  const latin = (text.match(/[A-Za-z0-9]+/g) || []).length
  const words = cjk + latin
  const lines = text ? text.split('\n').length : 0
  return { chars, words, lines, readMinutes: Math.max(1, Math.round(words / 350)) }
}
