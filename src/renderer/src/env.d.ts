/// <reference types="vite/client" />

import type { MdNotesApi } from '../../preload/index'

declare global {
  interface Window {
    /** Electron 环境下由 preload 注入；浏览器环境下为 undefined */
    api?: MdNotesApi
  }
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
