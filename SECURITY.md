# Security — access model & editor sign-in

## Current live state (verified against the Supabase project, not assumed)

- `public.guidelines` already has RLS **enabled** with exactly one policy:
  `guidelines_public_read` (SELECT, `anon`+`authenticated`, `using (true)`).
  Applied by `supabase-migration-readonly-lockdown.sql`. **There is currently
  no insert/update/delete policy, so all writes are denied for everyone**,
  including an eventual editor, until the migration below is run.
- `public.guideline_changelog` does not exist yet.
- The client-side `WRITES_ENABLED` flag in `src/App.tsx` is hardcoded `false`
  and stays that way for the whole of this branch — it hides every write
  control regardless of RLS or sign-in state.

## Access model (intentional)

- **Public read is intentional**, including the read-only Pending Review
  dashboard. Reads are open by design and unaffected by anything below.
- **Writes are editor-only**, enforced in **three independent layers**, outer
  to inner:
  1. **`WRITES_ENABLED` (kill switch, UI):** a single hardcoded `false` in
     `src/App.tsx`. Flipping this is a deliberate, separate decision from
     granting any one person editor access — not made in this branch.
  2. **Database (authoritative):** Row Level Security policies on
     `public.guidelines` and `public.guideline_changelog`. Even a direct REST
     call with the public anon key cannot write, regardless of `WRITES_ENABLED`
     or `isEditor`.
  3. **`isEditor` (UI, convenience):** every write control additionally
     requires the signed-in user's Auth id to be in the explicit editor
     allowlist (`src/lib/editor-allowlist.ts`).

  Every write control in the UI is gated `WRITES_ENABLED && isEditor && ...`.
  **Neither UI layer is the security boundary** — RLS is. The UI layers only
  avoid showing/attempting a write that would fail server-side (or that the
  product isn't ready to expose) anyway.

## Why magic-link sign-in does not by itself grant write access

Supabase magic-link sign-in (`signInWithOtp`) has no admin-approval step —
anyone who can receive an email at an address can request a link and obtain a
valid session. So being *signed in* and being *an editor* are deliberately
different things:

- Sign-in → `userId` is set (`src/lib/auth.ts`).
- Editor → `userId` is additionally in `EDITOR_UUID_ALLOWLIST`
  (`src/lib/editor-allowlist.ts`), which is a fixed, hand-maintained list of
  specific Auth UUIDs — never "is authenticated" and never "self-registered".

The RLS policies enforce the identical rule server-side, against the same
UUIDs:

```sql
auth.uid() = any (array['<editor-uuid>', ...]::uuid[])
```

The changelog table has an editor-only SELECT policy and an editor-only
INSERT policy — no update or delete policy — so RLS denies updates and
deletes for everyone, enforcing **append-only** at the database layer. Note
this differs from an earlier draft of this migration (prepared in a prior,
reverted branch) that made the changelog publicly readable, the same as
`guidelines`: change notes may reference draft/unpublished reasoning, so read
access here follows write access instead.

## Keys

- The **anon key** is public by design (it ships in the browser bundle). RLS
  is what protects writes — not the secrecy of the anon key.
- The **service_role key** bypasses RLS and is used only server-side, by
  `scripts/*.ts` running in GitHub Actions (seed, upsert-verified,
  export-static, detect-changes, approve-change, dedupe-db). Confirmed absent
  from `src/` (and therefore from the browser bundle) by repo-wide search as
  of this review — `src/lib/auth.ts` only ever uses the anon-key client from
  `src/lib/supabase.ts`.

## Configuring the editor allowlist

`VITE_EDITOR_UUIDS` is a comma-separated list of Auth user UUIDs, read at
build time by `src/lib/editor-allowlist.ts`. It is **public build
configuration, not a secret** — knowing a UUID grants nothing by itself; RLS
is what actually checks it, server-side, against the signed-in session. Unset
or empty, it falls back to a placeholder that is not a valid UUID and so can
never match a real user: fails closed.

## Manual prerequisites (NOT performed by the agent — none of this has been run)

In order:

1. **Configure the Supabase Auth redirect URL** for the production site
   (Supabase dashboard → Authentication → URL Configuration → Redirect URLs),
   so a magic-link email sent in production redirects back to the live site
   rather than failing or redirecting to `localhost`. Must be done before any
   real editor can complete a production sign-in.
2. **The initial editor signs in once**, via the magic-link form
   (`src/components/EditorAuthControl.tsx`), using whichever environment has
   the redirect URL configured (local dev works out of the box; production
   needs step 1 first).
3. **Copy that user's Auth UUID** from Supabase → Authentication → Users.
4. **Edit the migration**: replace every `REPLACE-WITH-EDITOR-UUID` in
   `supabase-migration-add-editor-writes-and-changelog.sql` with that UUID
   (repeat the array entry for additional editors).
5. **Run the migration once** in Supabase → SQL Editor. It only *adds* the
   changelog table and the two editor policies — it does not touch or
   re-create the already-live `guidelines_public_read` policy.
6. **Set `VITE_EDITOR_UUIDS`** as a GitHub repository Actions **Variable**
   (not a secret) — repo → Settings → Secrets and variables → Actions →
   Variables — with the same UUID(s), comma-separated if more than one. Wire
   it into `.github/workflows/deploy.yml`'s build step the same way
   `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` already are (not done in this
   branch — deployment/workflow files are untouched here).
7. **Deliberately flip `WRITES_ENABLED` to `true`** in `src/App.tsx` — a
   separate decision from granting any one person editor access, made only
   when the product is ready to expose write controls at all.
8. Rebuild/redeploy.
9. **Verify** in the dashboard: RLS shows **enabled** on both tables;
   `guidelines` has `guidelines_public_read` + `guidelines_editor_write`;
   `guideline_changelog` has `changelog_editor_read` + `changelog_editor_insert`
   (not `changelog_public_read` — this table is editor-only, unlike
   `guidelines`).

Until step 5 runs, writes remain denied by RLS regardless of UI/auth state.
Until step 7, the UI stays fully hidden regardless of RLS or auth state. Both
fail closed independently. None of steps 1–8 are performed by this branch.

## Rollback

Reverting the app-layer change (this branch) is a normal revert — no data
migration involved, since `WRITES_ENABLED` stays `false` either way and no
write control is reachable before or after; a signed-in-but-not-editor state
is inert regardless.

Reverting the database migration (if it was later run) is documented at the
bottom of `supabase-migration-add-editor-writes-and-changelog.sql` as a
commented-out `ROLLBACK` block: it drops only the two policies and the
changelog table this migration adds, and explicitly does not touch
`guidelines_public_read`, which predates it and stays in place — the table
remains readable and write-locked afterward, exactly as it was before this
migration ran.
