import { defineConfig } from 'vitest/config'
import VueRouter from 'vue-router/vite'
import vue from '@vitejs/plugin-vue'
import Icons from 'unplugin-icons/vite'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [
    VueRouter(), // ⚠️ must come before vue()
    vue(),
    Icons({ compiler: 'vue3', scale: 1 }),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    environment: 'happy-dom',
    globals: true,
    env: { TZ: 'UTC' },
    setupFiles: ['src/__tests__/setup.ts'],
    // happy-dom ≥ 21 refuses iframes (SSRF guard); modern-screenshot's style sandbox is one,
    // on about:blank. Specs load no untrusted HTML.
    environmentOptions: { happyDOM: { settings: { enableIframePageLoading: true } } },
  },
})
