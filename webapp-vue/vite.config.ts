import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const backend = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
const proxy = Object.fromEntries(
  ['/api', '/oauth2', '/login', '/logout'].map((p) => [p, { target: backend, changeOrigin: true }]),
)

export default defineConfig({
  plugins: [
    VueRouter(), // ⚠️ must come before vue()
    vue(),
    tailwindcss(),
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { proxy },
})
