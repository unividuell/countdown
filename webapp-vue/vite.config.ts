import { defineConfig } from 'vite'
import VueRouter from 'vue-router/vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const backend = process.env.VITE_API_PROXY_TARGET ?? 'http://localhost:8080'
// changeOrigin:false keeps the browser's Host (localhost:5173) on the proxied request,
// so the backend builds same-origin URLs (OAuth2 redirect_uri + post-login redirect)
// pointing back at the SPA — not at the backend port. With changeOrigin:true the backend
// sees Host=localhost:8080, GitHub then redirects the browser to :8080, and the user lands
// on the backend (no UI) after login. The GitHub OAuth App callback must therefore be
// registered on the SPA origin: http://localhost:5173/login/oauth2/code/github
const proxy = Object.fromEntries(
  ['/api', '/oauth2', '/login', '/logout'].map((p) => [
    p,
    { target: backend, changeOrigin: false },
  ]),
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
