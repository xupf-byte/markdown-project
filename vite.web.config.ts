import { resolve } from 'path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src')
    }
  },
  server: {
    port: 5199,
    host: '127.0.0.1'
  },
  build: {
    outDir: resolve(__dirname, 'web-dist'),
    emptyOutDir: true
  },
  plugins: [vue()]
})
