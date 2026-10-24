# Deployment runbook: review-queue upgrade (20261024 + 20261025)

For: whoever applies `20261024_discovery_review_queue.sql` and `20261025_reject_open_candidate.sql` to production and deploys the matching app and scripts. Read `DISCOVERY-QUEUE-CONTRACT.md` for what the upgrade does.

**Status:** rehearsed on a disposable local Supabase with synthetic, production-shaped data (§8). **Never applied to production.** Every step below is a decision for the project owner.

## 1. Before anything: freeze staging

From the start of §3 until §6 is complete:

- **No staging run of any kind.** The "Guideline & Provider Sync" workflow schedule must stay disabled (it is today: manual dispatch only). Do not dispatch it, and do not run `npx tsx scripts/stage-candidates.ts` locally from any checkout.
  - The OLD script against the upgraded database fails its whole batch (23505) as soon as one document is already open. When it doesn't fail, it files rows in the old lowercased shape.
  - The NEW script against the old database exits 1 and writes nothing.
  - Rehearsed: R2, R6.
- No ad-hoc SQL inserts into `staged_guidelines`.
- Editors may keep using the deployed app; it keeps working at every step (§4).

## 2. PR #174 (paused)

#174 (`20261013_stage_detected_changes.sql`) is **not** a prerequisite. It conflicts with 20261024 in either order (status CHECK, `approve_staged_guideline`, the one-open-row index), so it must stay unapplied.

- 20261024 refuses to run if #174's objects exist (preflight P2).
- #174 has **no** reverse guard. Never apply it after this upgrade without first rebasing it onto 20261024/20261025.

## 3. Backups (and what they cannot do)

1. Take a logical backup immediately before step 1, stored outside the repo (`backups/` is gitignored):
   - data: `pg_dump --data-only -t public.guidelines -t public.guideline_changelog -t public.staged_guidelines`;
   - schema: `pg_dump --schema-only -n public`.
2. Separately, check which platform backups the project's plan actually provides (daily backups or point-in-time recovery). Don't assume either exists, and don't treat an untested restore as a rollback plan.
3. **Restore limitations:**
   - Restoring the pre-upgrade dump discards every queue decision made after it.
   - The new evidence and decision tables refuse UPDATE, DELETE and TRUNCATE by trigger. Removing or rewriting their contents needs the table owner to disable or drop those triggers, so export them first (`DISCOVERY-QUEUE-CONTRACT.md` §5; migration header "Append-only: threat model").
   - Once any row is `resolved` or uses a new category, the old CHECK constraints cannot be restored.
   - The production project is currently paused. Restoring it is its own decision and is out of scope here.

## 4. Read-only preflight (production)

Run `supabase/DEPLOY-PREFLIGHT-READONLY.sql`. It contains only SELECT statements; prefer a session forced read-only:

```sh
PGOPTIONS='-c default_transaction_read_only=on' psql "$DB_URL" -f supabase/DEPLOY-PREFLIGHT-READONLY.sql
```

You can also paste one numbered query at a time into the SQL editor. Record P5 and P10 for comparison afterwards.

| Check | Safe result | If not |
|---|---|---|
| P1 | The database you intend | Stop |
| P2 (#174 objects) | all `f` | **Stop:** reconcile #174 first |
| P3 (already applied?) | all `f` | Investigate; never re-run blindly |
| P4 (prerequisites) | all `t` | Stop: the 20261011/20261012 state is missing |
| P6, P7 | no rows | Stop: the migration would fail its CHECKs and roll back |
| P8 (possible duplicate open documents) | no rows | An editor inspects them. If two really are one document, reject all but one through the current app, then rerun P8. |
| P9 | `t` and the expected number of editors | Fix the allowlist first |
| P10 | (record it) | — |

P8 uses a coarser key than the migration, so "no rows" guarantees the migration's duplicate check passes. Even if something is missed, the migration refuses and rolls back completely, as shown in rehearsal R4.

## 5. Order, and what each step looks like

| Step | Action | Old app (deployed) | New app | Old script | New script |
|---|---|---|---|---|---|
| 0 | Freeze (§1), backup (§3), preflight (§4) | works | — | must not run | must not run |
| 1 | Apply `20261024_discovery_review_queue.sql` (one transaction) | works: list, approve, reject pending | not deployed yet | **must not run** (23505 batch failures) | not deployed yet |
| 2 | Apply `20261025_reject_open_candidate.sql` (requires step 1) | works (2-argument reject is still accepted) | not deployed yet | must not run | not deployed yet |
| 3 | Verify: the queries at the end of each migration; preflight P3 = `t,t,t`; P10 unchanged from step 0 | works | — | — | — |
| 4 | Merge the branch to `main` (this deploys the frontend via `deploy.yml`) | replaced | works | — | deployed |
| 5 | First staging: manual dispatch with `dry_run = true`, then `false` | — | shows results | — | runs |

Expect many `POSSIBLE_SAME_DOCUMENT` rows on the first live run, wherever catalogue links differ only in letter case from the providers' links. That is the intended visibility, not an error.

**Expected temporary "feature unavailable" behaviour (if the order slips):**

- **New app deployed before step 1:** the review queue shows "Review queue feature unavailable" instead of listing items. It is not shown as an empty queue, and nothing is written.
- **New app between steps 1 and 2:** rejecting a deferred item, or confirming an open follow-up, shows "Feature unavailable" and writes nothing. Everything else works.
- **New script before step 1:** exits 1 with "stage_sync_candidates failed; NOTHING was filed".

## 6. Rollback limits

Prefer fixing forward. Each migration file ends with its rollback notes.

- **A failed apply needs no rollback.** Each migration is one transaction, and a refusal leaves no partial schema (rehearsed: schema, data and catalogue fingerprints were unchanged).
- **After success:**
  - Rolling back 20261025 restores the 2-argument reject. Any 'reject' log entries block restoring the old action CHECK.
  - Rolling back 20261024 drops the evidence, decision and hold tables (export them first). It also needs every row back inside the old status and category lists.
  - The new app or script on a rolled-back database degrades to "feature unavailable" or exit 1 (§5). Revert the app as well.
- Rows filed by the new script keep `primary_url` exactly as published. The old app and script handle them, because they match on `candidate_id`.
- No rollback undoes a staging run. Its rows are ordinary queue rows.

## 7. After the upgrade

Re-run `DEPLOY-PREFLIGHT-READONLY.sql`. P3 should be all `t`; P4's `has_reject_2arg` is now `f`, which is expected; P10 should equal the step-0 value.

Keep #174 paused. Re-enabling the schedule is a separate, explicit decision.

## 8. Rehearsal evidence (local, synthetic)

The rehearsal ran on 2026-10-25 and passed 48 of 48 checks. It used a disposable local Supabase and synthetic data only.

**Starting state:** the REBUILD-ORDER chain plus both 20261012 migrations, with no upgrade applied.

**Synthetic data, filed through the old code:**
- The **old** `stage-candidates.ts` (from `origin/main`, unmodified) filed nine rows, including:
  - DNN `?ver=` and encoded-space URLs;
  - a BOA asset GUID;
  - an NHFD query-identity URL;
  - two providers finding the same document, which created a duplicate open pair.
- Decisions through the **old** functions: one approved and published, two rejected, and one deferred by direct SQL.

**What the rehearsal showed:**
- **Compatibility at every step:** old app, new app, old script and new script, as tabled in §5.
- **Preflight:** it ran in a session forced read-only, where a test write was refused. P8 found the duplicate pair.
- **20261024 with the duplicate present:**
  - It refused and named the duplicate.
  - Schema, queue rows, catalogue and changelog were all byte-identical afterwards, with no partial objects left.
- **Remedy:** one duplicate was rejected through the normal path, and P8 came back clean.
- **20261024 then applied, and:**
  - every row's original fields were unchanged;
  - both keys were backfilled;
  - every row is marked pre-migration;
  - the accepted row, its guideline and the rejection notes were intact;
  - the UK-FALCON hold was present.
- **20261025 then applied:**
  - the old 2-argument reject still works;
  - the deferred row became rejectable, and the rejection was logged.
- **Catalogue and changelog fingerprints** were unchanged across the whole upgrade.

**Not covered:**
- real production data and volume;
- Supabase-hosted platform differences;
- the deployed old app's UI (its exact data calls were exercised, not its screens);
- `pg_dump` and restore themselves.
