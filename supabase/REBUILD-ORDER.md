# Rebuilding this database from the repository

**This is rebuild documentation. It is not a production runbook.** The live
database is already in the state described here. Do **not** reapply these
migrations to production — several are not idempotent in combination, and
re-running the chain would drop and recreate live policies.

Use this when standing up a **new** database: a local `supabase start`
environment, a disposable verification project, or a restore onto empty
Postgres.

## ⚠ The trap: filename order is wrong, and it fails silently

The SQL files in the repository root are a historical record, not a replayable
chain. Sorting them by name, or reasoning about which one "supersedes" which,
produces a **broken schema that still appears to work**.

The specific failure, observed while building a local environment on
11 October 2026:

- `supabase-schema.sql` ends with
  `alter table public.guidelines disable row level security;`
- The only file that re-enables it — and the only file that creates
  `guidelines_public_read` — is **`supabase-migration-readonly-lockdown.sql`**.
- `supabase-migration-public-write-access.sql` does *not* enable RLS. It only
  adds `INSERT`/`UPDATE` policies. Its name invites the assumption that it
  replaced the lockdown; it did not.

Omitting the lockdown migration therefore leaves **`public.guidelines` with RLS
switched off**. Every policy on the table is then ignored, including the
editor-allowlist write policies, so *any* caller holding the anon key can read
**and write** every row. Nothing errors. `\d guidelines` looks fine. The
application behaves normally. The only visible symptom is
`pg_class.relrowsecurity = false`, which nothing surfaces unless you ask.

This was found because a local rebuild was verified against `pg_policies`
before any test was run. It would not have been found by using the app.

## Tested order

Applied in this order and verified to reproduce production's policy state
exactly:

| # | File | Why it must be here |
|---|---|---|
| 1 | `supabase-schema.sql` | Creates `guidelines`, `set_updated_at()`, triggers, indexes. **Leaves RLS disabled.** |
| 2 | `supabase-migration-readonly-lockdown.sql` | **Load-bearing.** Enables RLS on `guidelines` and creates `guidelines_public_read`. Nothing else does either. |
| 3 | `supabase-migration-add-changelog-with-rls.sql` | `guideline_changelog` + its RLS. FK needs (1). |
| 4 | `supabase-migration-add-content-hash.sql` | Adds `content_hashes`, `last_change_check`. Must precede (9), which inserts them. |
| 5 | `supabase-migration-editorial-metadata.sql` | Adds `source_type`, `guidance_status`, `scope_note`, `editorial_review_date`, `inclusion_reason` and their CHECKs. Its backfills affect 0 rows on an empty database, which is correct. |
| 6 | `supabase-migration-extend-link-verification-states.sql` | **Added 2026-10-12. Without it a rebuild does not match production.** Replaces the four-state `guidelines_link_verification_check` from (1) with the live eight-state version. `scripts/map-link-status.ts` and `scripts/flag-dead-links.ts` write `moved`, `withdrawn`, `superseded` and `blocked`; a four-state schema rejects those writes. Corresponds to ledger entry `20260910195751 extend_link_verification_states`, whose SQL was missing from this repository. |
| 7 | `supabase-migration-public-write-access.sql` | Historical: grants anon `INSERT`/`UPDATE`. Kept in the chain so (9)'s `drop policy` statements have something to drop and the end state is reached the same way production reached it. |
| 8 | `supabase-migration-soft-delete-and-mandatory-notes.sql` | Revokes anon `DELETE`; adds the non-blank change-note CHECK. |
| 9 | `supabase/migrations/20261011_create_staging_and_editor_roles.sql` | Drops the anon write policies, adds `is_editor()`, the editor-only write policies, `staged_guidelines` and `approve_staged_guideline()`. |

Do **not** apply `supabase-migration-add-changelog.sql` — it predates the RLS
model and creates the same table with no RLS at all. The
`...-with-rls` variant at (3) replaces it.

`supabase-data-remediation-*.sql` are one-off data fixes, not schema. They are
not part of a rebuild.

`supabase/recovery/guidelines_backup_20260713.sql` is **not** part of a
rebuild either. It reconstructs the DDL for an ad-hoc July snapshot table that
exists in production but that no migration creates. Apply it only when
restoring a backup set that includes that table's data; see
"Restoring from a backup" below.

### The second gap this chain still does not close

Applying (1)–(9) reproduces production's tables, policies, functions and
grants, verified by fingerprint diff on 2026-10-12 — but it does **not**
recreate `public.guidelines_backup_20260713`, because nothing in the
repository ever created it. A rebuild intended to match production
object-for-object needs `supabase/recovery/guidelines_backup_20260713.sql` as
a tenth, optional step.

### Restoring from a backup

Schema comes from this chain; data comes from the backup set. Order:

1. Platform substrate. On a plain Postgres target the `anon`,
   `authenticated` and `service_role` roles, the `auth` schema, `auth.users`
   and `auth.uid()` do not exist and must be stubbed before (1). On a real
   Supabase project the platform supplies them.
2. Chain steps (1)–(9) above.
3. `supabase/recovery/guidelines_backup_20260713.sql`, **only** if the backup
   includes that table.
4. Load table data from the backup.
5. Apply the backup's `grants.sql`. Table and function grants are **not**
   carried by a `pg_dump --no-privileges` artefact, and are not created by
   this chain either beyond what each migration grants explicitly.
6. Verify, do not assume: row counts, a full-content fingerprint,
   `pg_class.relrowsecurity` on every table, the policy list, and
   `has_function_privilege` for `anon`/`authenticated`/`service_role`.

#### The editor account cannot be restored from a backup

`is_editor()` hardcodes an account UUID and checks only
`auth.uid() = <that UUID>` — it never checks that the account exists. On a
restored database with an empty `auth.users`, presenting that UUID makes
`is_editor()` return **true**, and the write then fails one layer deeper on
`staged_guidelines_reviewed_by_fkey` with SQLSTATE 23503. Demonstrated during
the 2026-10-12 drill; the approval RPC is atomic, so nothing is half-written.

So a restored database is complete and readable but has **no working
editor**, and restoring one is a manual step outside the backup:

- Create the editor account afresh through Supabase Auth.
- Read the UUID that account is actually assigned, then update the
  `is_editor()` allowlist to match it.

**Whether the original UUID can be preserved is unverified and must not be
assumed.** It has not been tested on this project, no procedure for it is
documented here, and the restore drill did not attempt it. Plan on the
account receiving a new UUID and on `is_editor()` needing an edit. Any rows
already referencing the old UUID in `reviewed_by` will point at an account
that no longer exists.

### For a local environment

Copy the files into `supabase/migrations/` under timestamp-prefixed names that
sort in the order above, then `supabase db reset`. Note that the lockdown file
must sort **between** (1) and (3) — e.g. `20260101500000_readonly_lockdown.sql`.

### Local-only editor allowlist

`is_editor()` ships with a production account UUID hardcoded. That account does
not exist in a fresh database. Apply a **local-only** overlay after (8) rather
than editing the migration:

```sql
create or replace function public.is_editor()
returns boolean language sql stable security invoker
set search_path = public, pg_temp
as $fn$ select auth.uid() = any (array['<your-local-test-user-uuid>'::uuid]); $fn$;
```

## Verification queries

Run all four after a rebuild. They are read-only.

### 1. RLS must be enabled on all three tables

```sql
select c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;
```

Expected — **`rls_enabled` must be `t` for all three.** An `f` on
`guidelines` is the symptom of the omitted lockdown migration:

```
 guideline_changelog  | t
 guidelines           | t
 staged_guidelines    | t
```

(`guidelines_backup_20260713` may also appear; it has RLS on and no policies,
so it is inaccessible to everyone, which is intended.)

### 2. Exactly these six policies

```sql
select tablename, policyname, cmd, roles::text
from pg_policies where schemaname = 'public'
order by tablename, cmd, policyname;
```

```
 guideline_changelog | changelog_editor_insert       | INSERT | {authenticated}
 guideline_changelog | changelog_public_read         | SELECT | {anon,authenticated}
 guidelines          | guidelines_editor_insert      | INSERT | {authenticated}
 guidelines          | guidelines_public_read        | SELECT | {anon,authenticated}
 guidelines          | guidelines_editor_update      | UPDATE | {authenticated}
 staged_guidelines   | staged_guidelines_editor_read | SELECT | {authenticated}
```

No `DELETE` policy on any table — archive-only. No `UPDATE`/`DELETE` on the
changelog — append-only. No write policy of any kind on `staged_guidelines`.

### 3. No anonymous write policy exists

```sql
select count(*) as anon_write_policies
from pg_policies
where schemaname = 'public'
  and cmd in ('INSERT','UPDATE','DELETE')
  and roles::text like '%anon%';
```

Expected: **`0`**. Any other number means an anon write path is open.

### 4. Both functions present, with the right security mode

```sql
select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('is_editor','approve_staged_guideline')
order by p.proname;
```

Expected: `approve_staged_guideline` with `security_definer = t`, `is_editor`
with `f`, and both carrying `search_path=public, pg_temp`.

## What these queries do and do not prove

They confirm the **configuration**. They do not exercise it. A behavioural
check needs real requests against synthetic fixtures, which belongs in a
disposable environment — never production, because a write-denial test that
fails is a write to live clinical data.

On 11 October 2026 that behavioural suite was run against a local stack built
with the order above: 50 database/API assertions and 18 browser assertions
passed, covering anonymous write denial with independent read-back, approval,
transaction rollback on two different controlled failures, archived-ID
collision, repeat approval of accepted and rejected candidates, and staging
retry idempotency.
