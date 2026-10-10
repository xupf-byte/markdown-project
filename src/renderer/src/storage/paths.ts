import { normalize } from './fslike'

/** 解算相对路径：把 baseDir 下的相对引用转成工作区根路径 */
export function resolveRel(baseDir: string, rel: string): string {
  const raw = (rel || '').trim().replace(/^<|>$/g, '')
  if (!raw || /^(https?:|data:|blob:|file:|\/)/i.test(raw)) return raw
  const stack = normalize(baseDir).split('/').filter(Boolean)
  for (const part of raw.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

/** 从 baseDir 指向 target 的相对路径 */
export function relativeTo(baseDir: string, target: string): string {
  const from = normalize(baseDir).split('/').filter(Boolean)
  const to = normalize(target).split('/').filter(Boolean)
  let i = 0
  while (i < from.length && i < to.length && from[i] === to[i]) i++
  const up = from.length - i
  return [...Array(up).fill('..'), ...to.slice(i)].join('/') || '.'
}

export function extOf(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i)
  return m ? m[1].toLowerCase() : ''
}

export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif']
