import { defineStore } from 'pinia'
import type { PreviewMode, ThemeMode } from '../types'

const LS_KEY = 'mdnotes.settings'

interface Persisted {
  theme: ThemeMode
  previewMode: PreviewMode
  sidebarVisible: boolean
  outlineVisible: boolean
  autoSave: boolean
  autoFence: boolean
  fontSize: number
}

function readPersisted(): Partial<Persisted> {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}')
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => {
    const p = readPersisted()
    return {
      theme: (p.theme ?? 'system') as ThemeMode,
      previewMode: (p.previewMode ?? 'split') as PreviewMode,
      sidebarVisible: p.sidebarVisible ?? true,
      outlineVisible: p.outlineVisible ?? false,
      autoSave: p.autoSave ?? true,
      /** 预览容错：给未写围栏的配置片段、用单个反引号包裹的多行代码自动补代码块 */
      autoFence: p.autoFence ?? true,
      fontSize: p.fontSize ?? 15,
      /** 当前实际是否为暗色（system 模式下跟随系统） */
      isDark: false,
      media: null as MediaQueryList | null
    }
  },

  actions: {
    persist() {
      const data: Persisted = {
        theme: this.theme,
        previewMode: this.previewMode,
        sidebarVisible: this.sidebarVisible,
        outlineVisible: this.outlineVisible,
        autoSave: this.autoSave,
        autoFence: this.autoFence,
        fontSize: this.fontSize
      }
      localStorage.setItem(LS_KEY, JSON.stringify(data))
    },

    init() {
      this.media = window.matchMedia('(prefers-color-scheme: dark)')
      this.media.addEventListener('change', () => {
        if (this.theme === 'system') this.applyTheme()
      })
      this.applyTheme()
    },

    applyTheme() {
      const dark = this.theme === 'dark' || (this.theme === 'system' && !!this.media?.matches)
      this.isDark = dark
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
      window.api?.setTheme?.(this.theme)
    },

    setTheme(t: ThemeMode) {
      this.theme = t
      this.applyTheme()
      this.persist()
    },

    cycleTheme() {
      const order: ThemeMode[] = ['system', 'light', 'dark']
      const next = order[(order.indexOf(this.theme) + 1) % order.length]
      this.setTheme(next)
    },

    setPreviewMode(m: PreviewMode) {
      this.previewMode = m
      this.persist()
    },

    toggleSidebar() {
      this.sidebarVisible = !this.sidebarVisible
      this.persist()
    },

    toggleOutline() {
      this.outlineVisible = !this.outlineVisible
      this.persist()
    },

    setFontSize(v: number) {
      this.fontSize = Math.min(22, Math.max(12, v))
      this.persist()
    }
  }
})
