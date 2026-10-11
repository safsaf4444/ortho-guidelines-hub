# Orthopaedic Guidelines Hub

© 2026 Safa Paravakkal. All rights reserved. No licence is granted to reproduce or reuse this code or content structure without permission.

**Live app: https://safsaf4444.github.io/ortho-guidelines-hub/**

A curated, mobile-friendly directory of current orthopaedic guidance for doctors — combining national guidance, specialist society guidance, and local pathways. A navigation tool and quick-reference hub for ward, on-call, and clinic use; not a replacement for source guidance or clinical judgement.

Built with React + TypeScript + Vite, backed by Supabase (with automatic fallback to bundled static data when no database is configured).

## Supabase setup

The app works without a database (falls back to static data), but to enable database mode:

1. Copy `.env.example` to `.env.local`.
2. In [Supabase](https://app.supabase.com) → your project → **Project Settings → API**, copy:
   - **Project URL** (the base URL, e.g. `https://abcdefgh.supabase.co` — not the `/rest/v1/...` endpoint) → `VITE_SUPABASE_URL`
   - **anon / publishable key** → `VITE_SUPABASE_ANON_KEY`
   - **service_role key** (keep secret, never in browser code) → `SUPABASE_SERVICE_ROLE_KEY`
3. Run the schema in the Supabase SQL editor: paste the contents of `supabase-schema.sql` and execute.
4. Seed the database: `npm run seed`
5. Start the app: `npm run dev`

`VITE_*` variables are exposed to the frontend bundle — only put the anon key there, never the service role key. `SUPABASE_SERVICE_ROLE_KEY` is read by `scripts/*.ts` and — when present — by `npm run dev` to enable local editing. It is never included in a build; see [SECURITY.md](SECURITY.md).

## Security — current status

**Status: guideline content is editable only by named editor accounts.**
Verified live on 11 October 2026 — there is no anonymous write policy on any
table.

Read [SECURITY.md](SECURITY.md) before changing anything in this area.

- **How it is enforced:** writing requires signing in, and the account's UUID
  must be listed in `public.is_editor()` — a hardcoded allowlist in the
  database, checked by RLS on every write. Not `auth.role() = 'authenticated'`,
  which would admit anyone able to self-register. Applied by
  `supabase/migrations/20261011_create_staging_and_editor_roles.sql`.
- **What the public can do:** read everything, and nothing else. The catalogue
  and its changelog stay publicly readable with no account; the staging queue
  is editor-only.
- **App:** write controls require all three of `WRITES_ENABLED`, a live
  database, and an editor session (`src/lib/write-access.ts`). None of them is
  the security control — the permission lives in RLS. To revoke write access
  outright, empty `public.is_editor()`; that takes effect immediately for every
  client with no redeploy.
- **Sign-in** is email + password, via `src/components/EditorAuthControl.tsx`
  in the header. Editor accounts are created by hand in the Supabase dashboard;
  there is no sign-up, and an account alone grants nothing. The same control
  handles password changes (current password required) and email recovery — see
  "Account administration" in SECURITY.md, including the rate limit on
  Supabase's default email sender.
- **Staging queue:** `staged_guidelines` holds unreviewed scraper output,
  readable by editors only and writable only by the sync GitHub Action's
  service-role key. Publishing goes through the atomic
  `approve_staged_guideline()` RPC, which writes the guideline, its change note
  and the queue update in one transaction.
- **No secret is shipped.** Permissions are granted via RLS using the ordinary
  public anon key, which now carries `SELECT` and nothing more. The
  service-role key is not in any bundle, and
  `scripts/tests/write-access.test.ts` fails the build if it — or an editor
  account UUID — ever appears.

  Browsing, search, filtering, section/provider grouping, cross-references,
  the catalogue and the static fallback are unchanged, and need no account.

## Data remediation ordering

`src/data/guidelines-data.ts` is **generated** from the live Supabase DB by
`npm run export-static` — it must not be hand-edited into a divergent source of
truth. Dead-link and other data fixes therefore land in the DB first, then flow
back into the static fallback by regeneration.

For the pending `supabase-data-remediation-batch1.sql` (seven safe mechanical
dead-link fixes), the required order is:

1. **Public write access is already closed** (as of 11 October 2026), which is
   the precondition this step existed to enforce — remediation SQL asserts
   preconditions about row contents, and an anonymous caller can no longer
   change those rows underneath it while it runs.
2. Run `supabase-data-remediation-batch1.sql` once, by hand, in the Supabase SQL
   editor (it is transactional and fails closed on a precondition mismatch).
3. Run `npm run export-static` to regenerate `src/data/guidelines-data.ts` from
   the now-updated DB.
4. Commit the regenerated static fallback in a **separate follow-up PR**.
5. Rerun `npm run flag-dead-links` to confirm the fixed links now pass.

## Progressive Web App (PWA)

The app is installable as a PWA. A service worker (via `vite-plugin-pwa`) caches the app shell so it loads quickly and can open without a network connection.

**What is cached:** only the static app shell — the HTML, the compiled JS/CSS bundle (which includes the bundled guidance content), the icons, and the web manifest. No live or dynamic data and no cross-origin requests are cached; Google Fonts load from the network and fall back to system fonts when offline.

**Not a full offline clinical app.** Because the guidance content is compiled into the cached bundle, it stays viewable offline — but this is a convenience cache, not a live clinical source. When offline, the app shows a banner reminding you that you are viewing a cached copy; always confirm against the live source guidance. This remains a navigation and quick-reference hub, not a substitute for source guidance or clinical judgement.

**Installing:**

- **Desktop (Chrome / Edge):** click the install icon in the address bar, or use the browser menu → *Install Orthopaedic Guidelines Hub*. It opens in its own window. (Firefox desktop does not offer install; the app still works in the browser tab.)
- **Android (Chrome):** browser menu → *Install app* / *Add to Home screen*.
- **iPhone / iPad (Safari):** there is no automatic prompt — tap the **Share** button, then *Add to Home Screen*.

**How updates propagate:** the service worker uses `autoUpdate`. Each successful deploy produces newly hashed assets; when an installed or open app next loads, the new version is fetched and activated automatically in the background. Users get the latest content on their next visit or reload — there is no manual update step and no update prompt.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
