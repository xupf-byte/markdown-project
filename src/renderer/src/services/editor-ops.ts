export interface EditResult {
  text: string
  selStart: number
  selEnd: number
}

/** 行内包裹，支持再次点击取消（toggle） */
export function wrapInline(
  text: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string
): EditResult {
  const sel = text.slice(start, end)
  const outerStart = start - before.length
  const outerEnd = end + after.length
  const alreadyWrapped =
    outerStart >= 0 && text.slice(outerStart, start) === before && text.slice(end, outerEnd) === after

  if (alreadyWrapped) {
    return {
      text: text.slice(0, outerStart) + sel + text.slice(outerEnd),
      selStart: outerStart,
      selEnd: outerStart + sel.length
    }
  }

  if (!sel) {
    const body = placeholder
    return {
      text: text.slice(0, start) + before + body + after + text.slice(end),
      selStart: start + before.length,
      selEnd: start + before.length + body.length
    }
  }

  return {
    text: text.slice(0, start) + before + sel + after + text.slice(end),
    selStart: start + before.length,
    selEnd: start + before.length + sel.length
  }
}

/** 对选中行加/去前缀（列表、引用、标题等） */
export function prefixLines(
  text: string,
  start: number,
  end: number,
  prefix: string,
  ordered = false
): EditResult {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const nlIdx = text.indexOf('\n', end)
  const lineEnd = nlIdx === -1 ? text.length : nlIdx
  const lines = text.slice(lineStart, lineEnd).split('\n')

  const markerRe = /^(\s*)(?:[-*+]\s+|\d+\.\s+|>\s+|#{1,6}\s+)?([\s\S]*)$/

  const allMarked = lines.every((line) => {
    if (!line.trim()) return true
    const indent = line.match(/^\s*/)?.[0] ?? ''
    const rest = line.slice(indent.length)
    return ordered ? /^\d+\.\s+/.test(rest) : rest.startsWith(prefix)
  })

  let counter = 0
  const next = lines.map((line) => {
    if (!line.trim()) return line
    const m = line.match(markerRe)!
    const indent = m[1]
    const body = m[2].replace(/\s+$/, '')
    if (allMarked) return indent + body
    counter += 1
    return ordered ? `${indent}${counter}. ${body}` : `${indent}${prefix}${body}`
  })

  const newBlock = next.join('\n')
  return {
    text: text.slice(0, lineStart) + newBlock + text.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + newBlock.length
  }
}

/** 设置整块标题级别（# ~ ######） */
export function setHeading(
  text: string,
  start: number,
  end: number,
  level: number
): EditResult {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1
  const idx = text.indexOf('\n', end)
  const lineEnd = idx === -1 ? text.length : idx
  const lines = text.slice(lineStart, lineEnd).split('\n')
  const hashes = '#'.repeat(level)
  const next = lines.map((line) => {
    const stripped = line.replace(/^\s*#{1,6}\s+/, '')
    return `${hashes} ${stripped}`
  })
  const newBlock = next.join('\n')
  return {
    text: text.slice(0, lineStart) + newBlock + text.slice(lineEnd),
    selStart: lineStart,
    selEnd: lineStart + newBlock.length
  }
}

/** 在光标处插入块级内容（前后自动补空行） */
export function insertBlock(
  text: string,
  start: number,
  end: number,
  block: string,
  selectInner?: [number, number]
): EditResult {
  const needsLeading = start > 0 && text[start - 1] !== '\n'
  const leading = needsLeading ? '\n\n' : ''
  const payload = leading + block + '\n'
  const inserted = text.slice(0, start) + payload + text.slice(end)
  const base = start + leading.length
  if (selectInner) {
    return {
      text: inserted,
      selStart: base + selectInner[0],
      selEnd: base + selectInner[1]
    }
  }
  return { text: inserted, selStart: base + block.length, selEnd: base + block.length }
}

/** 行内样式（字体颜色 / 背景色）支持的属性 */
export type StyleProp = 'color' | 'background-color'

const SPAN_OPEN_TAIL = /<span\s+style="([^"]*)">$/

interface StyleDecl {
  prop: string
  value: string
}

function parseStyle(raw: string): StyleDecl[] {
  return raw
    .split(';')
    .map((d) => d.trim())
    .filter(Boolean)
    .map((d) => {
      const i = d.indexOf(':')
      return { prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim() }
    })
    .filter((d) => d.prop && d.value)
}

function serializeStyle(decls: StyleDecl[]): string {
  return decls.map((d) => `${d.prop}:${d.value}`).join(';')
}

/** 选区是否正好被某个 `<span style="…">…</span>` 包住；是则返回该标签的起始位置与已有声明 */
function enclosingSpan(
  text: string,
  start: number,
  end: number
): { tagStart: number; decls: StyleDecl[] } | null {
  const m = SPAN_OPEN_TAIL.exec(text.slice(0, start))
  if (!m || !text.slice(end).startsWith('</span>')) return null
  return { tagStart: start - m[0].length, decls: parseStyle(m[1]) }
}

/**
 * 给选区套上 / 取下 HTML 行内样式（字体颜色、背景色）。
 *
 * - `value` 非空：设置该属性；若当前已是同一属性同色 → 视为「再点一次取消」
 * - `value` 为空：移除该属性；若靠该属性单独支撑的 span 已无其他声明，整段 `<span>` 拆掉
 * - 未选中文字时插入占位文字并选中，方便直接输入
 *
 * 语法产物形如 `<span style="color:#e53935">文字</span>`：
 * 这是唯一被主流 Markdown 编辑器（VS Code / Typora / Obsidian）一致识别的写法，
 * 且当前渲染链路（marked + DOMPurify）实测原样保留该 style。
 */
export function applyInlineStyle(
  text: string,
  start: number,
  end: number,
  prop: StyleProp,
  value: string,
  placeholder = '文字'
): EditResult {
  const after = text.slice(end)
  const span = enclosingSpan(text, start, end)
  const body = span ? text.slice(start, end) : text.slice(start, end) || placeholder

  if (span) {
    const { tagStart, decls } = span
    const kept = decls.filter((d) => d.prop !== prop)
    const had = kept.length !== decls.length

    let next: StyleDecl[]
    if (!value) {
      if (!had) return { text, selStart: start, selEnd: end }
      next = kept
    } else {
      const same = decls.some(
        (d) => d.prop === prop && d.value.toLowerCase() === value.toLowerCase()
      )
      next = same ? kept : [...kept, { prop, value }]
    }

    // 没有剩余声明 → 整段 span 拆掉
    if (!next.length) {
      const closeEnd = end + '</span>'.length
      return {
        text: text.slice(0, tagStart) + body + text.slice(closeEnd),
        selStart: tagStart,
        selEnd: tagStart + body.length
      }
    }

    const open = `<span style="${serializeStyle(next)}">`
    return {
      text: text.slice(0, tagStart) + open + body + after,
      selStart: tagStart + open.length,
      selEnd: tagStart + open.length + body.length
    }
  }

  // 选区内没有可复用的 span
  if (!value) return { text, selStart: start, selEnd: end }
  const open = `<span style="${prop}:${value}">`
  return {
    text: text.slice(0, start) + open + body + '</span>' + after,
    selStart: start + open.length,
    selEnd: start + open.length + body.length
  }
}

/** 插入链接 */
export function insertLink(text: string, start: number, end: number): EditResult {
  const sel = text.slice(start, end) || '链接文字'
  const snippet = `[${sel}](https://)`
  const urlStart = start + sel.length + 3
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    selStart: urlStart,
    selEnd: urlStart + 8
  }
}

/** 插入图片 */
export function insertImage(text: string, start: number, end: number): EditResult {
  const sel = text.slice(start, end) || '图片描述'
  const snippet = `![${sel}](图片地址)`
  const urlStart = start + sel.length + 4
  return {
    text: text.slice(0, start) + snippet + text.slice(end),
    selStart: urlStart,
    selEnd: urlStart + 4
  }
}

export const TABLE_SNIPPET = `| 列 1 | 列 2 | 列 3 |
| --- | --- | --- |
| 内容 | 内容 | 内容 |`

export const MATH_SNIPPET = `$$
E = mc^2
$$`

export const MERMAID_SNIPPET = '```mermaid\ngraph LR\n  A[开始] --> B[结束]\n```'

export const CODE_SNIPPET = '```js\n\n```'
