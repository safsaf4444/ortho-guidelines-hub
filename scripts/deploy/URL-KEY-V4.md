# url-key v4: production procedure (PR #322)

This procedure applies `supabase/migrations/20261104_url_key_unreserved_decoding.sql` to production. Afterwards, both document keys decode escapes of RFC 3986 unreserved characters (`%2D` → `-`). It then ships PR #322's TypeScript change.

**Every production step below needs its own explicit approval.** Nothing here has been run against production.

| File | Role | sha256 |
|---|---|---|
| `supabase/migrations/20261104_url_key_unreserved_decoding.sql` | the migration (from PR #322) | `8c775bf8aab61b7235be7d911c8e6aa3eb310130f0e479bad590e3c1ab1e45a5` |
| `supabase/URL-KEY-V4-GATE-READONLY.sql` | read-only gate: stage 0 = exact v3 state, stage 1 = exact v4 state | recorded in the wrapper |
| `supabase/URL-KEY-V4-ROLLBACK.sql` | atomic return to v3; refuses if any stored key would move | recorded in the wrapper |
| `scripts/deploy/Apply-UrlKeyV4-Psql.ps1` + `apply-urlkey-v4.sh` | exact-file psql route (Docker PostgreSQL 17) | — |

**Unchanged:** `Apply-Migrations-Psql.ps1` and `POST-MIGRATION-GATE-READONLY.sql` stay as they are, as the route and the record for 20261024/20261025. That gate's G19 expects the v3 comments, so **it fails after v4, by design.** Use the v4 gate from then on.

**Same safeguards as the existing route:**
- exact bytes, checked three times;
- session pooler and `postgres.<ref>` only, with TLS;
- a no-echo password, passed to Docker by name;
- the outcome is never inferred from an exit code;
- no retry and no repair;
- migration history is **not written**;
- no `db push`, no Management API.

**v4 additions:**
- an explicit `-ConfirmMigration 20261104_url_key_unreserved_decoding`;
- an expected value for the holds;
- a separately confirmed rollback mode.

## 0. Preconditions
- PR #322 has been reviewed, and is **not yet merged**.
- **Freeze:** no `guideline-sync` dispatch and no `stage-discovery` run until step 6 is done. The scheduled `detect-changes` (Mon 06:00 UTC) and `dead-link-check` (Wed 03:00 UTC) don't use the document keys, but detect-changes rewrites catalogue rows. So run steps 1–5 well clear of it, and re-take the expected values after any run.
- Docker Desktop is running, and `public.ecr.aws/supabase/postgres:17.11.0.004` is present.

## 1. Fresh backup (separate approval)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\Backup-Public.ps1 -PoolerHost 'aws-0-eu-central-1.pooler.supabase.com' -DbUser 'postgres.xutjahmbyrvifcltpxxu' -Destination 'C:\Users\safad\OrthoBackups' -AcceptUnverifiedEncryption
npx tsx scripts/backup/restore-verify.ts "C:\Users\safad\OrthoBackups\public-<UTC>"
```

**Required result:** `restore-verify` reports **MATCH** (0 differences) against the backup's own snapshot fingerprint.

The backup must contain, and its fingerprint must show:
- **Rows** (count and md5) of every `public` table: `guidelines`, `guideline_changelog`, `staged_guidelines`, `staged_discovery_evidence`, `staged_discovery_decisions`, `discovery_staging_holds`, `guidelines_backup_20260713`.
- **The functions**, with their bodies, SECURITY DEFINER flag, `search_path` and EXECUTE grants: `document_match_key`, `document_identity_key`, `_url_strip_ver`, and the stage, resolve, approve and reject functions.
- **Table structure and access:** constraints (including `staged_guidelines_document_keys_derived`), indexes (including `staged_guidelines_one_open_per_document`), triggers (including the append-only triggers), policies, RLS flags, and table, schema and default privileges.

All of this was rehearsed on an **upgraded** database (`run.ts urlkey-v4`, section 8): the fingerprint covers all three review-queue tables, the v4 functions and the decoder; the dump contains the append-only triggers and the one-open-row index; and restore-verify reports MATCH.

**Not included, by design:** `auth.users`/`auth.identities`, roles, extensions, other schemas, and `supabase_migrations`. See `scripts/backup/README.md`.

**Validate against production:** the backup's `rows.guidelines` line must equal the value from step 2, taken immediately afterwards. If they differ, something wrote in between. Stop and repeat.

## 2. Read-only preflight, giving the expected values (separate approval)
Run read-only in a `begin transaction read only; … rollback;` wrapper:

```sql
select (select count(*)||':'||md5(coalesce(string_agg(g::text,'|' order by id),'')) from public.guidelines g)           as expect_guidelines,
       (select count(*)||':'||md5(coalesce(string_agg(c::text,'|' order by id),'')) from public.guideline_changelog c) as expect_changelog,
       (select count(*) from public.staged_guidelines)                                                                    as expect_staged,
       (length(pg_get_functiondef('public.is_editor()'::regprocedure))
        - length(replace(pg_get_functiondef('public.is_editor()'::regprocedure), '::uuid', ''))) / 6                       as expect_editors,
       (select count(*)||':'||md5(coalesce(string_agg(h::text,'|' order by match_key),'')) from public.discovery_staging_holds h) as expect_holds;
```

The wrapper's gate 0 then repeats every check below itself. Expected from the last read (2026-11-04):
- queue 0 rows;
- 1 hold (UK-FALCON, which contains only `%20`, so its key does not move);
- 0 queue rows or holds containing an unreserved escape;
- no new catalogue collisions (offline v3/v4 comparison of all 551 live catalogue URLs).

## 3. Dry run, then apply (separate approval for the apply)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\Apply-UrlKeyV4-Psql.ps1 -PoolerHost aws-0-eu-central-1.pooler.supabase.com -DbUser postgres.xutjahmbyrvifcltpxxu -RecordDir C:\Users\safad\OrthoBackups -ExpectGuidelines '<from 2>' -ExpectChangelog '<from 2>' -ExpectStaged <from 2> -ExpectEditors <from 2> -ExpectHolds '<from 2>'
# apply: the same, plus
#   -Apply -ConfirmProject xutjahmbyrvifcltpxxu -ConfirmMigration 20261104_url_key_unreserved_decoding
```

**Sequence:**
1. **Gate 0** checks the exact v3 state:
   - prerequisites present;
   - v3 comments, no decoder;
   - every stored queue and hold key equals its function;
   - **no queue row or hold contains an unreserved escape**, so v4 can move no stored key;
   - catalogue (every column, source links included), changelog, queue size, holds and editor count equal the expected values.
2. **The migration** runs as one transaction. Before redefining anything, it refuses (55000) if any stored queue or hold key would move, or if two different catalogue entries would newly share a key.
3. **Gate 1** checks the exact v4 state:
   - v4 comments, and both key bodies decode first;
   - the decoder is pinned, not SECURITY DEFINER, and not executable by PUBLIC, anon or authenticated;
   - self-tests pass (`%2d` decodes; `%2F`, `%20` and `%%341` are kept; `%76er` is `ver`);
   - the review-queue functions are intact;
   - the same unchanged-data checks as gate 0.

| Exit | Meaning | Action |
|---|---|---|
| 0 | **fully successful:** v4 applied, gates 0 and 1 passed | continue to 5 |
| 2 | refused by the wrapper (hashes, target, confirmations, Docker) before anything ran | fix the input; nothing to undo |
| 10 | **preflight refused:** gate 0 failed and the database is not already v4; the migration was not sent | read the FAIL lines; nothing to undo |
| 14 | **already v4:** gate 1 passes, gate 0 does not; nothing sent | nothing to do; record it |
| 11 | **migration failed or refused, nothing committed.** Gate 0 re-passes, which *verifies* this, because the file is one transaction | stop; the transcript names the cause |
| 12 | **migration committed, post-verification failed.** psql exited 0, so the server acknowledged COMMIT, but gate 1 did not pass. **The change stays in place: nothing reverses it automatically** | stop; `-Inspect` read-only; do not merge #322; decide separately between investigating and `-Rollback` |
| 13 | errored but **is** committed (gate 1 passes) | treat as applied; record it |
| 19 | errored, and neither gate passes: state unknown | `-Inspect`, read-only, before anything else |

### Transaction semantics

Gate 0, the migration and gate 1 run as **three separate psql sessions**, so they are three separate transactions. They are not one.
- **The migration itself is one transaction.** It holds its refusal checks, all its changes and its own post-check, between one `begin;` and one `commit;`. So it commits completely or not at all.
- **The gates are read-only snapshots** taken before and after.

Consequences:
- **"Nothing committed" (exit 11)** is stated only after gate 0 re-passes following the error. A committed migration would have created the decoder and the v4 comments and bodies, which fail gate 0. This is a verification, not an inference from the exit code.
- **"Committed" (exit 12)** rests on the server acknowledging COMMIT (psql exit 0). Gate 1 failing afterwards does **not** undo it. The v4 functions remain. The only way back is the separately approved `-Rollback`, or a backup restore.
- **Between the sessions,** another client could change data. Gate 1 would then fail at V30–V34 (exit 12) even though the migration is correct. That is why the freeze matters, and why exit 12 means "inspect", not "roll back".

## 4. Recovery

**If the migration fails (exit 11):** nothing committed, as verified read-only by gate 0. The old keys are untouched. No recovery is needed: fix the cause the refusal names (it lists the rows, holds or catalogue pairs) through a reviewed change, then start again from step 2.

**If the migration succeeded but must be withdrawn (separate approval):**

```powershell
... same arguments ... -Rollback -ConfirmProject xutjahmbyrvifcltpxxu -ConfirmRollback URL-KEY-V4-ROLLBACK
```

- **Sequence:** gate 1 → `URL-KEY-V4-ROLLBACK.sql` → gate 0.
- **What it does:** in one transaction, it restores the 20261024 bodies and comments byte for byte, and drops the decoder.
- **When it refuses:** it rolls back (exit 11, v4 intact) if any row filed **under v4** with an unreserved escape in its URL would change key under v3.
- **Rehearsed:**
  - the refusal fires with such a row present;
  - after a successful rollback, the functions are byte-identical to 20261024, the schema is identical to before, the catalogue is unchanged, and the old review-queue gate passes again (G19 included);
  - re-applying v4 afterwards produces identical definitions.
- **Do not force it.** Rows the rollback refuses on need their own reviewed plan.

**Restoring the backup** is the last resort, and is **not** a rollback. It discards every queue decision made after the backup, and the append-only tables need their triggers disabled by the owner. See `supabase/DEPLOYMENT-RUNBOOK.md` §3.

## 5. Post-checks (read-only)
- `-Inspect` must report **41** (v4).
- The catalogue, changelog, queue and holds values must equal step 2.
- `select public.document_match_key('https://www.boa.ac.uk/asset/a811fc01%2defc3') = public.document_match_key('https://www.boa.ac.uk/asset/A811FC01-EFC3/');` must return `t`.

## Release sequence and the dependency on PR #322

The order, each step under its own approval:
1. **Make the reviewed tooling available to the operator,** without deploying v4 application logic (see below).
2. **Fresh production backup**, verified with restore-verify (MATCH) (step 1).
3. **Read-only production preflight** (step 2).
4. **Apply the v4 SQL** with this wrapper (step 3).
5. **Verify the production v4 state** (step 5).
6. **Only then merge PR #322,** and verify the application deployment (step 6).

**The dependency:** this tooling cannot merge into `main` on its own.
- The wrapper reads, and hash-checks, `supabase/migrations/20261104_url_key_unreserved_decoding.sql`, and that file exists only on #322's branch.
- On `main` without it, the wrapper refuses (exit 2, "not found"). That is safe, but useless.
- Moving the migration file out of #322 and into the tooling PR would change #322.

**The smallest safe alternative:** the tooling does **not** need to be on `main` for the operator. It runs on the operator's machine.
1. Review the tooling as a **stacked PR whose base is `fix/url-key-unreserved-decoding`** (#322's branch).
2. For steps 2–5, the operator runs it from that PR's **exact reviewed commit**: `git checkout --detach <sha>`. The wrapper's recorded SHA-256 values pin the migration, gate and rollback bytes, so a different checkout cannot slip in other files.
3. At step 6, merge the stacked PR into #322's branch, then merge #322 into `main`. Both land together, after v4 is verified in production.

Nothing in `main`'s workflows applies migrations: deploy only builds the frontend, and there is no `db push`. So merging the SQL file at step 6 has no effect on the database.

## 6. Ship the code: merge PR #322 (separate approval)
Only after exit 0 and a passing step 5.
- **What ships:** merging deploys the frontend unchanged (the change is in `scripts/` only). From then on, `sync-providers`, `stage-candidates`, `stage-discovery` and `discover` compute v4 keys, matching the database.

**Partially completed release:**

The database recomputes both keys itself and **refuses (22023) any candidate whose producer-sent `primaryUrl`/`sourceUrlKey` differ from its own** (20261024, `stage_discovery_candidate` and `_stage_sync_candidate`). So during a mixed-version window, a staging run fails loudly on every URL with an unreserved escape (for example BOA's `%2d` links) rather than mis-filing it. Other URLs, whose keys are identical under v3 and v4, are unaffected. Still:
- **SQL applied, PR not merged:** the database is v4 and the scripts still v3. **Keep the freeze**: no guideline-sync and no stage-discovery until the merge. Nothing scheduled stages.
- **PR merged, SQL not applied** (wrong order): the scripts are v4 and the database v3. Same rule: no staging run. Either apply the SQL (steps 1–5) or revert the merge before any staging.
- **SQL applied, then withdrawn by rollback:** do not merge PR #322 until v4 is re-applied.

## 7. What this does not change
- Clinical content, catalogue entries and source links: verified unchanged by both gates, and in rehearsal.
- Evidence and decisions: no key columns.
- Discovery IDs: a raw-URL hash.
- Migration history: not written. Recording it is a separate decision.
