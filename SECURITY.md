# Security — access model

## Summary

**Guideline content on this site is publicly editable by anyone, with no
sign-in.** Any visitor to https://safsaf4444.github.io/ortho-guidelines-hub/
can add and edit clinical guideline entries. So can anyone using the REST
API directly, with no browser involved.

Two safeguards bound the damage a single edit can do: entries can be
**archived but not deleted**, and **every edit requires a change note**. See
"Safeguards" below. Neither restricts who may edit.

This is a **deliberate, explicit decision by the site owner**, taken after the
trade-off was set out in full. It is not an oversight, a misconfiguration, or
a bug. If you are reviewing this repository and expected a read-only public
site, that was the previous model — see "History" below.

## Current live state (verified against the Supabase project, not assumed)

Verified 9 September 2026 by querying `pg_policies` and by performing a real
insert/update/delete round-trip with the public anon key.

| Table | RLS | Policies | Effect for an anonymous visitor |
|---|---|---|---|
| `public.guidelines` | enabled | `guidelines_public_read` (SELECT), `guidelines_public_insert` (INSERT), `guidelines_public_update` (UPDATE) — **no DELETE policy** | read, create and edit; **cannot destroy a row** |
| `public.guideline_changelog` | enabled | `changelog_public_read` (SELECT), `changelog_public_insert` (INSERT), plus a not-blank CHECK constraint | read and append a non-empty note; **cannot** edit or delete existing notes |

`auth.users` is empty and expected to stay empty. There is no sign-in of any
kind in the application.

## What this means in practice

- The anon key is public by design — it ships in every JS bundle and is a
  literal in `src/lib/supabase.ts` and `.github/workflows/deploy.yml`. It is
  not a secret and cannot be made one.
- Therefore a single `curl` command with that key can modify or delete any of
  the 231 guideline rows. No browser, no UI, no rate limit.
- **There is no record of who made a change.** No accounts, no IP logging in
  the application layer, no attribution. `guidelines.updated_at` records only
  *when* a row last changed.
- Deletion is **not** possible — see "Safeguards" below. The worst a visitor
  can do is archive an entry or overwrite its text, both of which are
  recoverable.
- The exposure is a property of the database, not of the deployed frontend.
  It began the moment the RLS policies were applied and is unaffected by which
  bundle is deployed or by the `WRITES_ENABLED` flag in the app.

### What still holds

- **The changelog is append-only.** `guideline_changelog` has an INSERT policy
  but deliberately no UPDATE or DELETE policy, so with RLS enabled Postgres
  denies both. Anyone can add a note; nobody can alter or remove one through
  the public API. This is the only tamper-resistant record in the system.
- **No secret key is shipped.** Public write access is granted by RLS, which is
  the correct mechanism. The service-role key is not in any bundle — see the
  regression test below. This matters: if it ever were shipped, dropping the
  RLS policies would no longer close the write path.
- **Backups exist** under `backups/` (gitignored, local only). With soft
  delete in place these are now the second line of recovery rather than the
  first — un-archiving is. Worth confirming they are current regardless.

## Safeguards

Two limits sit on top of public write access. Neither restricts *who* may
edit — that is deliberately unrestricted — they limit how much damage a single
edit can do and make sure it leaves a trace.

### 1. Soft delete

`guidelines` has **no DELETE policy**, so a `DELETE` from anon affects zero
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

This converts the one irreversible action into a reversible one: vandalism now
costs a single UPDATE to undo, not a restore from backup.

### 2. Mandatory change notes

There are no accounts, so a change can never be attributed to a person. A
required note is what replaces attribution: every write records **what**
changed and **why**, even though **who** is unknowable.

- **In the UI** — the edit and add form has a required Change note field and
  the Save button stays disabled until it is non-empty.
- **In the database** — `guideline_changelog_description_not_blank`
  (`length(btrim(description)) > 0`) rejects empty and whitespace-only notes,
  so this holds for direct API callers too, not only the UI. Verified: empty
  and whitespace notes return `23514`, a missing field returns `23502`.
- **Single-click actions** ("Mark link checked today", the link-status
  dropdown, archiving, merging) generate their own note, prefixed
  `Automatic:`, so the invariant "every write leaves a changelog entry" holds
  without demanding typed prose for one click.
- Notes are append-only and capped at 500 characters.

#### What the note requirement does and does not guarantee

Stated plainly, because the difference matters:

- **Guaranteed:** no note can be blank, whoever writes it and however.
- **Not guaranteed:** that every guideline change is accompanied by a note.
  PostgREST issues the guideline write and the note write as two separate
  requests, so someone using curl can `PATCH` a guideline and simply never
  post a note. The UI always writes both, and reports loudly if the note fails
  after the guideline succeeded — but the UI is not the only way in.

Closing that gap needs both writes moved into a single `SECURITY DEFINER`
function (an RPC that takes the patch and the note, validates the note, and
writes both in one transaction) with direct `UPDATE`/`INSERT` on `guidelines`
then revoked from anon. That is the correct fix and is not yet implemented.

## Keys

- **anon key** — public, ships in the browser bundle. Now carries full
  read/write/delete permission on `guidelines` via the policies above.
- **service_role key** — bypasses RLS. Used only by `scripts/*.ts` server-side
  and in GitHub Actions. It is **not** used by the browser client at all any
  more, in any mode, and must never be added to
  `.github/workflows/deploy.yml`.

### Regression test

`scripts/tests/write-access.test.ts` (in `npm run test:offline`) asserts that
no service-role key and no JWT-shaped string appears anywhere in a built
`dist/`, that `vite.config.ts` injects no key into the bundle, and that the
removed sign-in UI has not returned. It deliberately no longer asserts that the
public cannot write — that assumption is now intentionally false.

## Rollback — closing public write access again

Immediate, takes effect for every client at once, no redeploy required:

```sql
begin;
  drop policy if exists guidelines_public_insert  on public.guidelines;
  drop policy if exists guidelines_public_update  on public.guidelines;
  drop policy if exists guidelines_public_delete  on public.guidelines;
  drop policy if exists changelog_public_insert   on public.guideline_changelog;
commit;
```

This restores the previous posture: public read, no writes for anon. The read
policies are untouched, so the site keeps working as a reference. Setting
`WRITES_ENABLED = false` in `src/App.tsx` hides the write controls but does
**not** close the write path — only dropping the policies does that.

## History

This site has had four access models. The current one is the fourth.

1. **Read-only lockdown** (`supabase-migration-readonly-lockdown.sql`) — RLS
   on, a single public SELECT policy, no writes for anyone.
2. **Local-only editing** — editing worked when a maintainer ran the app on
   their own machine with a service-role key injected by `vite dev`; the
   deployed site had no write path and no write policy existed. Magic-link
   sign-in and an editor UUID allowlist were built and then removed in favour
   of this; see git history for `src/lib/auth.ts`,
   `src/lib/editor-allowlist.ts` and `src/components/EditorAuthControl.tsx`.
3. **Public editing** (current) —
   `supabase-migration-public-write-access.sql` grants anon
   insert/update/delete, and the app's write controls render for every
   visitor. The service-role injection was removed entirely, so local and
   production now use the identical anon client and identical permissions.
4. **Public editing, bounded** (current) —
   `supabase-migration-soft-delete-and-mandatory-notes.sql` revokes the anon
   DELETE policy granted in (3) and adds the not-blank CHECK on change
   notes. Editing stays open to everyone; destroying a row and making an
   unexplained edit through the UI both stop being possible.
