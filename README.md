# Orthopaedic Guidelines Hub

© 2026 Safa Paravakkal. All rights reserved. No licence is granted to reproduce or reuse this code or content structure without permission.

**Live app: https://safsaf4444.github.io/ortho-guidelines-hub/**

A curated index of orthopaedic guidance and reference resources. The bundled snapshot contains 231 entries generated on 10 September 2026, not 231 independently verified current guidelines. Consult original publishers and local policy; clinical, rights and institutional acceptance remain outstanding.

Built with React + TypeScript + Vite, backed by Supabase (with automatic fallback to bundled static data when no database is configured).

## Local acceptance work

Use isolated worktrees and credential-free local tests. Do not run seed, export, upsert or migration commands as part of preview preparation. Those commands contact or change databases and require separate authorisation. Never place service-role keys in frontend configuration.

The existing static-preview configuration disables database use, but the application still imports editorial modules. It is NOT the separate reader-only import boundary requested for release. `vite.reader-boundary.config.ts` deliberately fails until that boundary is extracted. See STATIC-READER-PLAN.md. No public deployment is authorised.

## Security — current status

**Status: guideline content is editable only by named editor accounts.**
Historical verification claim dated 11 October 2026 (not reverified for the current target) — there is no anonymous write policy on any
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

## Rebuilding the database from this repository

The root `supabase-migration-*.sql` files are a historical record, **not** a
replayable chain: sorting them by filename produces a schema with RLS switched
off on `guidelines`, silently. The tested order, the reason
`supabase-migration-readonly-lockdown.sql` is load-bearing, and read-only
verification queries are in
[supabase/REBUILD-ORDER.md](supabase/REBUILD-ORDER.md).

That document is for standing up a NEW database (local or disposable). Do not
reapply the chain to production.

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

**How updates propagate:** the service worker uses prompt mode. A newly waiting worker triggers a refresh prompt; accepting it activates the update and reloads. Offline caching does not make publisher documents available offline or certify their currency.

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
