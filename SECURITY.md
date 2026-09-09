# Security — access model

## Current live state (verified against the Supabase project, not assumed)

Verified 8 September 2026 by querying `pg_policies`/`pg_class` directly and by
attempting real writes with the public anon key (see "Evidence" below).

- `public.guidelines` — RLS **enabled**, exactly one policy:
  `guidelines_public_read` (SELECT, `anon`+`authenticated`, `using (true)`),
  applied by `supabase-migration-readonly-lockdown.sql`. **There is no
  insert/update/delete policy, so every write by anon or authenticated is
  denied.** 231 rows.
- `public.guideline_changelog` — created by
  `supabase-migration-add-changelog-with-rls.sql`. RLS **enabled**, exactly one
  policy: `changelog_public_read` (SELECT). **No write policy**, so inserts,
  updates and deletes are denied for anon and authenticated alike — append-only
  is enforced at the database layer for every non-service caller.
- `auth.users` — **0 rows, and expected to stay that way.** This app has no
  sign-in of any kind.

## Access model (intentional)

**Reads are public.** All 231 guidelines, the changelog, and the read-only
Pending Review dashboard. This is by design and unaffected by everything below.

**Writes are local-only.** Editing happens when a maintainer runs the hub on
their own machine with `npm run dev`. The deployed site at
`safsaf4444.github.io/ortho-guidelines-hub/` has no write path at all.

Three independent layers, outer to inner:

1. **Database (authoritative).** RLS is enabled on both tables and neither has
   a write policy. A direct REST call with the public anon key cannot write,
   regardless of anything in the app. This is the real security boundary.
2. **Bundle contents (structural).** The write path needs the service-role key,
   which bypasses RLS. That key is injected into the client **only** by
   `vite.config.ts`'s `localEditorKeyPlugin`, and only when
   `command === 'serve'`. Every `vite build` — local or CI — substitutes the
   empty string. A deployed bundle therefore holds only the public anon key,
   and cannot write even if its UI were forced to render.
3. **UI gate (convenience).** Every write control is gated
   `WRITES_ENABLED && canEdit`, where `canEdit` is `LOCAL_EDITOR_MODE` from
   `src/lib/supabase.ts` — true only when a service-role key was injected.
   Centralised in `src/lib/write-access.ts` so the controls and the write
   handlers can never disagree.

Note that layer 3 is *not* a security boundary and no longer removes the write
UI from the production bundle (the gate reads a runtime import inside
components, so the minifier cannot fold it). The write markup ships inert:
it never renders, because `canEdit` is false at the root and threaded down, and
every write it could attempt is denied by layer 1 anyway.

## Keys

- The **anon key** is public by design — it ships in the browser bundle and is
  a literal in `src/lib/supabase.ts` and `.github/workflows/deploy.yml`. RLS is
  what protects writes, not the secrecy of this key.
- The **service_role key** bypasses RLS. It is used by:
  - `scripts/*.ts` server-side, in GitHub Actions (seed, upsert-verified,
    export-static, detect-changes, approve-change, dedupe-db); and
  - **the local dev browser build only** — this is new, and is what makes
    local editing work without any sign-in.

  It lives in `.env.local`, which is gitignored (`*.local`). It is **not** a
  `VITE_`-prefixed variable, deliberately: prefixed variables are exposed to
  client code in every mode, which is exactly the property this key must not
  have. The only route into a bundle is the serve-gated plugin above.

  `.github/workflows/deploy.yml` does not pass it, and must never be changed to.

### Regression test

`scripts/tests/write-access.test.ts` (in `npm run test:offline`) greps the
entire built `dist/` tree for the service-role key and for any JWT-shaped
string whenever a build is present, and asserts the serve-only gate is still in
`vite.config.ts`. Run `npm run build` before `npm run test:offline` to exercise
it.

## Evidence (8 September 2026)

Writes attempted against the live project using the public anon key — the exact
key in the deployed bundle:

| Attempt | Result |
|---|---|
| `PATCH /guidelines?id=eq.pelvic-fracture` | HTTP 200, **0 rows affected** — RLS `USING` matched nothing |
| `DELETE /guidelines?id=eq.pelvic-fracture` | HTTP 200, **0 rows affected**; table still 231 rows |
| `POST /guideline_changelog` | HTTP 401, `42501 new row violates row-level security policy` |
| `GET /guideline_changelog` | HTTP 200 — public read works as intended |

Note the update/delete cases return **200, not 403**. PostgREST reports zero
matched rows rather than an authorization error when RLS filters the row set.
The row was confirmed byte-identical afterwards. A 200 here is not a successful
write.

## What was removed, and why

Magic-link sign-in (`signInWithOtp`), the editor UUID allowlist and the
`VITE_EDITOR_UUIDS` build variable were **removed**, not disabled. The modules
`src/lib/auth.ts`, `src/lib/magic-link.ts`, `src/lib/editor-allowlist.ts` and
`src/components/EditorAuthControl.tsx` are deleted; see git history.

That design required an `auth.uid() = any(array[...])` write policy on
`guidelines` — i.e. a write path reachable from the public internet, guarded by
one account's credentials. Local-only editing needs no accounts, no allowlist
to keep in sync between app and database, no redirect URLs, no email delivery,
and adds **no** write policy. The public security posture is identical to the
read-only lockdown that preceded it.

The trade-off accepted: anyone holding both a checkout and the service-role key
can edit. That is the same trust boundary the `scripts/*.ts` tooling has always
had.

## Rollback

- **App layer:** a normal `git revert`. No data migration is involved.
- **Disable editing everywhere, including locally:** set `WRITES_ENABLED` to
  `false` in `src/App.tsx`, or remove `SUPABASE_SERVICE_ROLE_KEY` from
  `.env.local`. Either is sufficient on its own.
- **Database:** the commented `ROLLBACK` block at the bottom of
  `supabase-migration-add-changelog-with-rls.sql` drops `changelog_public_read`
  and the `guideline_changelog` table. It does not touch
  `guidelines_public_read`, which predates it. `guidelines` is not modified by
  that migration at all, so there is nothing to undo on it.
- **Make the changelog non-public:** `drop policy changelog_public_read on
  public.guideline_changelog;`. Reads then fail closed and the app degrades to
  its honest "not available" state (`src/lib/changelog-load.ts`).
