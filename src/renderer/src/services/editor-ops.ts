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
