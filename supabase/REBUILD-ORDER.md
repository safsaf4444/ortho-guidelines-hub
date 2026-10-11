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
| 4 | `supabase-migration-add-content-hash.sql` | Adds `content_hashes`, `last_change_check`. Must precede (8), which inserts them. |
| 5 | `supabase-migration-editorial-metadata.sql` | Adds `source_type`, `guidance_status`, `scope_note`, `editorial_review_date`, `inclusion_reason` and their CHECKs. Its backfills affect 0 rows on an empty database, which is correct. |
| 6 | `supabase-migration-public-write-access.sql` | Historical: grants anon `INSERT`/`UPDATE`. Kept in the chain so (8)'s `drop policy` statements have something to drop and the end state is reached the same way production reached it. |
| 7 | `supabase-migration-soft-delete-and-mandatory-notes.sql` | Revokes anon `DELETE`; adds the non-blank change-note CHECK. |
| 8 | `supabase/migrations/20261011_create_staging_and_editor_roles.sql` | Drops the anon write policies, adds `is_editor()`, the editor-only write policies, `staged_guidelines` and `approve_staged_guideline()`. |

Do **not** apply `supabase-migration-add-changelog.sql` — it predates the RLS
model and creates the same table with no RLS at all. The
`...-with-rls` variant at (3) replaces it.

`supabase-data-remediation-*.sql` are one-off data fixes, not schema. They are
not part of a rebuild.

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
