# Security — access model

## Summary

**Guideline content on this site is publicly editable by anyone, with no
sign-in.** Any visitor to https://safsaf4444.github.io/ortho-guidelines-hub/
can add, edit and delete clinical guideline entries. So can anyone using the
REST API directly, with no browser involved.

This is a **deliberate, explicit decision by the site owner**, taken after the
trade-off was set out in full. It is not an oversight, a misconfiguration, or
a bug. If you are reviewing this repository and expected a read-only public
site, that was the previous model — see "History" below.

## Current live state (verified against the Supabase project, not assumed)

Verified 9 September 2026 by querying `pg_policies` and by performing a real
insert/update/delete round-trip with the public anon key.

| Table | RLS | Policies | Effect for an anonymous visitor |
|---|---|---|---|
| `public.guidelines` | enabled | `guidelines_public_read` (SELECT), `guidelines_public_insert` (INSERT), `guidelines_public_update` (UPDATE), `guidelines_public_delete` (DELETE) | full read/write/delete |
| `public.guideline_changelog` | enabled | `changelog_public_read` (SELECT), `changelog_public_insert` (INSERT) | read and append; **cannot** edit or delete existing notes |

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
- Deletion is unrestricted. A `DELETE` with no filter would remove every row.
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
- **Backups exist** under `backups/` (gitignored, local only). Restoring from
  one is the recovery path if content is vandalised or mass-deleted.

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

This site has had three access models. The current one is the third.

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
