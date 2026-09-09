import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from "path"

/**
 * Injects the service-role key into src/lib/supabase.ts as __LOCAL_EDITOR_KEY__.
 *
 * Deliberately a plugin rather than Vite's `define`: `define` is applied only
 * at build time. In dev Vite leaves the identifier untouched (verified against
 * Vite 8.1 by fetching the transformed module from the dev server), which would
 * have left local editing silently dead — the exact failure this whole design
 * depends on NOT happening. One mechanism, applied identically in both modes,
 * with the VALUE — not the mechanism — carrying the serve-only gate.
 */
function localEditorKeyPlugin(key: string): Plugin {
  // Compared via path.resolve so this works with either path separator —
  // Vite hands ids over with forward slashes even on Windows.
  const TARGET = path.resolve(__dirname, 'src/lib/supabase.ts')
  return {
    name: 'ortho-hub:local-editor-key',
    enforce: 'pre',
    transform(code, id) {
      if (path.resolve(id.split('?')[0]) !== TARGET) return null
      if (!code.includes('__LOCAL_EDITOR_KEY__')) return null
      return { code: code.replaceAll('__LOCAL_EDITOR_KEY__', JSON.stringify(key)), map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // ── Local-editor mode ──────────────────────────────────────────────────────
  // Editing is a LOCAL-ONLY capability: the write path exists when you run
  // `npm run dev` on your own machine, and does not exist at all in the
  // deployed public site.
  //
  // That guarantee is enforced HERE, at the bundler, rather than by a runtime
  // `if`. The service-role key is read from .env.local (gitignored) and
  // injected only when command === 'serve'. Every `vite build` — local or CI —
  // substitutes the empty string instead, so the key cannot be inlined into a
  // production bundle even by accident, and src/lib/supabase.ts then falls
  // back to the public anon key and reports LOCAL_EDITOR_MODE === false.
  //
  // Deliberately NOT a VITE_-prefixed variable: prefixed vars are exposed to
  // client code in every mode, which is exactly the property we do not want
  // for this key. Keeping it unprefixed means the ONLY route into the bundle
  // is the plugin above, gated on `command`.
  //
  // Regression-tested by scripts/tests/write-access.test.ts, which greps the
  // built dist/ for this key whenever a build is present.
  const env = loadEnv(mode, process.cwd(), '')
  const localEditorKey = command === 'serve' ? (env.SUPABASE_SERVICE_ROLE_KEY || '') : ''

  return {
    base: '/ortho-guidelines-hub/',
    plugins: [
      localEditorKeyPlugin(localEditorKey),
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
  }
})
