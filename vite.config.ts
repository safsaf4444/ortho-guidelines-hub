import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// https://vite.dev/config/
export default defineConfig({
  base: '/ortho-guidelines-hub/',
  plugins: [
    react(),
    VitePWA({
      // New builds activate automatically — no user-facing update prompt.
      registerType: 'autoUpdate',
      // Plugin injects the SW registration itself; no app-code changes needed.
      injectRegister: 'auto',
      // Phase 1's static public/manifest.webmanifest stays the single source of
      // truth. The plugin manages the service worker only, not the manifest.
      manifest: false,
      workbox: {
        // Precache the built app shell only. No runtimeCaching rules are
        // defined, so cross-origin requests (e.g. Google Fonts) stay
        // network-only and nothing dynamic is cached.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      // Service worker is exercised via `npm run build && npm run preview`,
      // not the dev server.
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
