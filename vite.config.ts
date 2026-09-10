import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

// NOTE: this config previously carried a `localEditorKeyPlugin` that injected
// the service-role key into the client for `vite dev` only, so that editing
// worked locally while the deployed site stayed read-only. That whole mechanism
// is gone: write access is now granted publicly at the database layer via RLS
// (supabase-migration-public-write-access.sql), so the ordinary public anon key
// is sufficient to write and NO secret is needed in any bundle, dev or prod.
//
// Keeping it would also have been actively harmful for testing: local dev would
// have written via service_role (which bypasses RLS) while production wrote via
// anon (which does not), so a passing local test would have proved nothing about
// the deployed site. Both now use the identical anon client.

// https://vite.dev/config/
export default defineConfig({
  base: '/ortho-guidelines-hub/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate'.
      //
      // Under autoUpdate the new worker installed and claimed clients, but the
      // page already open kept rendering the bytes it had — so a fresh deploy
      // looked stale, with no signal that anything had changed. That is the
      // root cause behind the stale-service-worker gotcha that has produced
      // false "verified" results here: the site had updated, the tab had not,
      // and nothing said so.
      //
      // In prompt mode the new worker waits, and src/lib/pwa-update.ts is told
      // exactly when one is waiting. The refresh prompt is then shown only when
      // a genuinely different build exists — never on a normal load, and never
      // on the first visit, where onOfflineReady fires instead.
      registerType: 'prompt',
      // Registration is done by hand in src/lib/pwa-update.ts so the app can
      // observe the update lifecycle. 'auto' would inject a second registration
      // and the two would race.
      injectRegister: null,
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
