# Security — access model

## Summary

**Guideline content is editable only by named editor accounts.** Writing
requires signing in, and the signed-in account's UUID must appear in
`public.is_editor()` — a hardcoded allowlist in the database. Everyone else,
signed in or not, has read-only access. This applies to the REST API as much
as to the browser: there is no path that bypasses it short of the
service-role key.

Deliberately **not** a role check. `auth.role() = 'authenticated'` would grant
write access to anyone able to self-register if public sign-ups were ever
enabled on the project. The allowlist holds regardless of that setting.

Two further safeguards bound what a single edit can do: entries can be
**archived but not deleted**, and **every edit requires a change note**. See
"Safeguards".

This replaced a period of **fully public, unauthenticated editing** — see
"History". That was a deliberate decision at the time, not a
misconfiguration, and it was reversed for the reasons in "Why this changed".

## Live state (verified 11 October 2026 by querying `pg_policies`)

Read back from the database after the migration ran — not inferred from the
migration file.

| Table | RLS | Policies | Effect for an anonymous visitor |
|---|---|---|---|
| `public.guidelines` | enabled | `guidelines_public_read` (SELECT, anon+auth), `guidelines_editor_insert` (INSERT, `is_editor()`), `guidelines_editor_update` (UPDATE, `is_editor()`) — **no DELETE policy** | **read only** |
| `public.guideline_changelog` | enabled | `changelog_public_read` (SELECT, anon+auth), `changelog_editor_insert` (INSERT, `is_editor()`), plus a not-blank CHECK | **read only** |
| `public.staged_guidelines` | enabled | `staged_guidelines_editor_read` (SELECT, `is_editor()`) — **no write policy at all** | **no access** |

Six policies in total, and **no anonymous write policy on any table**. Both
functions are present: `is_editor()` (SECURITY INVOKER) and
`approve_staged_guideline()` (SECURITY DEFINER).

`auth.users` holds one account (`safa.dubai@gmail.com`, created 9 September
2026), and it is the only UUID in `is_editor()`. Confirmed live that
`is_editor()` returns true for a session signed in as that account through the
public anon key.

## Why this changed

The previous model was documented here as a deliberate decision, and it was.
What made it untenable was not the decision but a drift between the record and
reality:

- `supabase-migration-readonly-lockdown.sql` and
  `supabase-migration-public-write-access.sql` both exist in the repo root and
  describe opposite postures, with nothing in the filename or the repo saying
  which one is live.
- A later brief described the project as being "under a strict read-only
  lockdown" with `WRITES_ENABLED = false`. Both halves were false: the
  lockdown had been superseded, and the flag was `true`. The belief that the
  catalogue was locked down survived for some time alongside a live,
  world-writable table.

The specific risk is clinical, not reputational: 231 rows of orthopaedic
guidance, linked from a hospital context, that any anonymous caller could
rewrite with one `curl`, leaving no record of who did it. A wrong dose or a
swapped pathway reads exactly like a right one.

## What this means in practice

- The anon key remains public by design — it ships in every JS bundle and is a
  literal in `src/lib/supabase.ts` and `.github/workflows/deploy.yml`. It is
  not a secret and cannot be made one. **It now grants SELECT and nothing
  else.** It is a routing credential, not a permission.
- Writes are attributable. Every write carries the editor's `auth.uid()`, and
  `staged_guidelines.reviewed_by` records who approved each published
  candidate. This is new — under the previous model, `updated_at` recorded
  only *when*.
- Deletion is still not possible for anyone — see "Safeguards".
- Revoking access does not need a redeploy or a policy change. Empty the
  allowlist and every write path closes at once:

  ```sql
  create or replace function public.is_editor() returns boolean
    language sql stable security invoker set search_path = public, pg_temp
    as $$ select false $$;
  ```

### What the client does and does not know

`src/lib/editor-session.ts` deliberately does **not** mirror the allowlist
UUIDs into the bundle. Duplicating them would create a second source of truth
that can drift from the policy, and it would buy nothing — a signed-in
non-editor is already refused by Postgres.

The consequence, stated plainly: a signed-in non-editor **is shown the write
controls** and gets a clear refusal on save. The UI predicts the database's
answer; it does not make it. `scripts/tests/write-access.test.ts` asserts no
account UUID appears in `src/` or in a built `dist/`.

### The silent-refusal trap

Worth knowing if you touch the write paths. A blocked `INSERT` returns error
`42501`. A blocked `UPDATE` returns **no error at all** — RLS filters the row
out of the statement's scope, so PostgREST reports a successful update of
nothing. Taken at face value, that tells an editor their clinical edit was
saved when the database discarded it.

`guidelinesService.update` and `.archive` therefore use `.select('id')` and
treat a zero-row result as a failure. Any new write path must do the same.

## Safeguards

### 1. Soft delete

`guidelines` has **no DELETE policy for any role**, so a `DELETE` affects zero
rows however it is issued. The app's "Remove" action performs
`UPDATE ... SET archived = true` instead. The row physically remains and is
restored with one statement:

```sql
select id, topic from public.guidelines where archived = true;   -- find
update public.guidelines set archived = false where id = '<id>'; -- restore
```

`guidelinesService.getAll()` filters on `archived = false`, and it is the only
read path in the app, so archived entries are absent from the list, search,
grouping, the catalogue and duplicate detection without any per-view work. The
merge flow archives the losing row rather than deleting it, for the same reason.

### 2. Mandatory change notes

Changes are attributable now, but the note is still what records **why**.

- **In the UI** — the edit and add form has a required Change note field and
  the Save button stays disabled until it is non-empty.
- **In the database** — `guideline_changelog_description_not_blank`
  (`length(btrim(description)) > 0`) rejects empty and whitespace-only notes,
  so this holds for direct API callers too. `approve_staged_guideline()`
  rejects a blank note before it writes anything.
- **Single-click actions** ("Mark link checked today", the link-status
  dropdown, archiving, merging) generate their own note, prefixed
  `Automatic:`.
- Notes are append-only and capped at 500 characters. `guideline_changelog`
  has an INSERT policy but deliberately no UPDATE or DELETE policy, so no
  editor can alter or remove a note through the API. This remains the only
  tamper-resistant record in the system.

#### What the note requirement does and does not guarantee

- **Guaranteed:** no note can be blank, whoever writes it and however.
- **Guaranteed for published candidates:** `approve_staged_guideline()` writes
  the guideline, the note and the queue update in one transaction. A candidate
  cannot be published without its note — all three land or none do.
- **Still not guaranteed for ordinary edits:** PostgREST issues the guideline
  write and the note write as two separate requests, so an editor using curl
  can `PATCH` a guideline and never post a note. The UI always writes both and
  reports loudly if the note fails after the guideline succeeded.

  Closing that gap needs the same treatment the approve path got: a second
  `SECURITY DEFINER` RPC taking the patch and the note together, with direct
  `UPDATE` then revoked. The blast radius is much smaller now that only named
  editors can write at all. Tracked in `FOLLOW-UPS.md`.

## The staging queue

`public.staged_guidelines` holds unreviewed scraper output. It is **not**
publicly readable, unlike the catalogue — these are candidates nobody has yet
judged to be in scope, and publishing them by accident is the thing the queue
exists to prevent.

- **Written only** by the sync GitHub Action, using
  `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS. The table has no
  INSERT/UPDATE/DELETE policy, so no browser client can write to it in any
  role.
- **Read** by named editors only.
- **Emptied** one way: `approve_staged_guideline(uuid, jsonb, text)`, a
  `SECURITY DEFINER` function gated on the same `is_editor()` allowlist, with
  `EXECUTE` revoked from `public` and `anon`. It locks the queue row, refuses
  an already-processed candidate, and publishes atomically.

An unauthenticated read of this table returns an **empty list, not an error**.
The app distinguishes "sign in to see the queue" from "the queue is empty"
explicitly for that reason — see `src/lib/staged-service.ts`.

## Keys

- **anon key** — public, ships in the browser bundle. Carries SELECT on
  `guidelines` and `guideline_changelog`, and nothing more.
- **service_role key** — bypasses RLS entirely. Used only by `scripts/*.ts`
  server-side and in GitHub Actions. It is **not** used by the browser client
  in any mode and must never be added to `.github/workflows/deploy.yml`.

### Regression test

`scripts/tests/write-access.test.ts` (in `npm run test:offline`) asserts that:

- the write gate requires all three conditions, and that exactly one of its
  eight input combinations permits a write;
- each failure mode stays separately explainable — notably that an offline
  reader is never told to go and sign in;
- `App.tsx` folds the editor session into its gate and mounts a sign-in
  control, so the gate is reachable rather than a dead end;
- no service-role key, JWT-shaped string, or editor account UUID appears
  anywhere in a built `dist/`;
- `vite.config.ts` injects no key into the bundle;
- sessions persist, without which every reload would drop `auth.uid()`.

This file previously asserted the *opposite* in part — it deliberately did not
claim the public was locked out, because under the public-editing model that
claim would have been false.

## History

This site has had five access models. The current one is the fifth.

1. **Read-only lockdown** (`supabase-migration-readonly-lockdown.sql`) — RLS
   on, a single public SELECT policy, no writes for anyone.
2. **Local-only editing** — editing worked when a maintainer ran the app with
   a service-role key injected by `vite dev`; the deployed site had no write
   path. Magic-link sign-in and an editor UUID allowlist were built and then
   removed in favour of (3).
3. **Public editing** (`supabase-migration-public-write-access.sql`) — anon
   granted insert/update/delete; write controls rendered for every visitor.
   The service-role injection was removed entirely, so local and production
   used the identical anon client and identical permissions.
4. **Public editing, bounded**
   (`supabase-migration-soft-delete-and-mandatory-notes.sql`) — revoked the
   anon DELETE policy from (3) and added the not-blank CHECK on change notes.
   Editing stayed open to everyone.
5. **Editor allowlist** (current; applied 11 October 2026) —
   `supabase/migrations/20261011_create_staging_and_editor_roles.sql` drops the
   anonymous write policies, gates writes on `public.is_editor()`, adds the
   editor-only staging queue, and adds the atomic approve RPC. Sign-in returns
   to the app as `src/components/EditorAuthControl.tsx` — the same filename
   removed in (2), now email + password rather than magic link, because a magic
   link needs its redirect URL registered in the dashboard and its
   implicit-flow callback arrives in the URL hash this app uses for routing.

## Account administration

- **Sign-in** — email + password, via the padlock in the header.
- **Changing a password** — the key icon beside the signed-in badge. Requires
  the current password: `updateUser({ password })` alone does not ask for it,
  so without that step any live session (an unlocked laptop, a borrowed ward
  machine, a restored tab) would be enough to seize the only account that can
  edit the catalogue. See `editorAuth.changePassword`.
- **Forgotten password** — "Set or reset my password by email" in the sign-in
  panel. The emailed link returns to the app and is parsed by
  `consumeRecoveryLink()`; `detectSessionInUrl` stays off so the auth client
  never competes with this app's own routing hash. The redirect origin must be
  registered under Authentication → URL Configuration → Redirect URLs.
- **Recovery email rate limits** — Supabase's default shared SMTP sender
  allows only a few messages per hour, and it has already been hit once. A
  custom SMTP sender removes the limit; until then, treat email recovery as
  best-effort.
- **Admin bypass, when email is unavailable** — the service-role key can set a
  password directly via `auth.admin.updateUserById`. This was used once, on 11
  October 2026, to break the rate-limit deadlock. If it is needed again: keep
  the credential out of the script file (pass it through an environment
  variable), verify the result by signing in with the **anon** key rather than
  trusting the write, delete the script afterwards, and rotate the password
  through the UI once in. A password that has passed through a shell
  invocation should not remain the standing one.
