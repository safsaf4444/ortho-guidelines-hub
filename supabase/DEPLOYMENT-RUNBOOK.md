# Deployment runbook: review-queue upgrade (20261024 + 20261025)

For: whoever applies `20261024_discovery_review_queue.sql` and `20261025_reject_open_candidate.sql` to production and deploys the matching app and scripts. Read `DISCOVERY-QUEUE-CONTRACT.md` for what the upgrade does.

**Status:** rehearsed on a disposable local Supabase with synthetic, production-shaped data (§8). **Never applied to production.** Every step below is a decision for the project owner.

## 1. Before anything: freeze staging

From the start of §3 until §6 is complete:

- **No staging run of any kind.** The "Guideline & Provider Sync" workflow schedule must stay disabled (it is today: manual dispatch only). Do not dispatch it, and do not run `npx tsx scripts/stage-candidates.ts` locally from any checkout. Do not run `scripts/stage-discovery.ts` in write mode either; its dry run makes no database contact and is always safe.
  - The OLD script against the upgraded database fails its whole batch (23505) as soon as one document is already open. When it doesn't fail, it files rows in the old lowercased shape.
  - The NEW script against the old database exits 1 and writes nothing.
  - Rehearsed: R2, R6.
- No ad-hoc SQL inserts into `staged_guidelines`.
- **Keep "Detect guideline changes" (`detect-changes.yml`) from running in the window.** It is scheduled on `main` for Mondays at 06:00 UTC. It never touches the queue, but it updates `guidelines.content_hashes` and `last_change_check`, so a run between step 0 and step 3 changes the P10 fingerprint and makes the "P10 unchanged" check fail for a reason unrelated to the upgrade. Avoid that slot, or have the owner disable the workflow for the window.
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

Run `supabase/DEPLOY-PREFLIGHT-READONLY.sql` as a whole file. Every check is a SELECT, and the file enforces read-only itself: it opens one `READ ONLY` transaction and ends with `ROLLBACK`, so Postgres would refuse any write in it and nothing can be committed. A forced read-only session adds a second layer:

```sh
PGOPTIONS='-c default_transaction_read_only=on' psql "$DB_URL" -f supabase/DEPLOY-PREFLIGHT-READONLY.sql
```

- **P0 must say `on`.** Otherwise stop.
- If one check errors, every later check prints "current transaction is aborted". Stop and investigate; P4 explains most such errors.
- Pasting one numbered query into the SQL editor runs it **outside** that wrapper. The query is still a SELECT, but nothing then enforces read-only.

Record P1's `at` value (the rejection-gap check in §5 step 3 needs it), and P5 and P10 for comparison afterwards.

| Check | Safe result | If not |
|---|---|---|
| P0 | `on` | Stop: the checks are not running read-only |
| P1 | The database you intend | Stop |
| P2 (#174 objects) | all `f` | **Stop:** reconcile #174 first |
| P3 (already applied?) | all `f` | Investigate; never re-run blindly |
| P4 (prerequisites) | all `t` | Stop: the 20261011/20261012 state is missing |
| P6, P7 | no rows | Stop: the migration would fail its CHECKs and roll back |
| P8 (possible duplicate open documents) | no rows | An editor inspects them. If two really are one document, reject all but one through the current app, then rerun P8. |
| P9 | `t` and the expected number of editors | Fix the allowlist first |
| P10 | (record it) | — |
| P11 (open candidates for a held document) | no rows, or rows an editor has looked at | Not a blocker. Once 20261024 is applied these rows cannot be published (RQ002); before it, nothing stops them, so an editor should not publish them in the meantime. Rejecting them is always allowed. |

P8 uses a coarser key than the migration, so "no rows" guarantees the migration's duplicate check passes. Even if something is missed, the migration refuses and rolls back completely, as shown in rehearsal R4.

## 5. Order, and what each step looks like

| Step | Action | Old app (deployed) | New app | Old script | New script |
|---|---|---|---|---|---|
| 0 | Freeze (§1), backup (§3), preflight (§4) | works | — | must not run | must not run |
| 1 | Apply `20261024_discovery_review_queue.sql` (one transaction) | works: list, approve, reject pending | not deployed yet | **must not run** (23505 batch failures) | not deployed yet |
| 2 | Apply `20261025_reject_open_candidate.sql` (requires step 1), **immediately after step 1** (see "History gap" below) | works (2-argument reject is still accepted) | not deployed yet | must not run | not deployed yet |
| 3 | Verify: the queries at the end of each migration; preflight P3 = `t,t,t`; P10 unchanged from step 0; the rejection-gap check below | works | — | — | — |
| 4 | Merge the branch to `main` (this deploys the frontend via `deploy.yml`) | replaced | works | — | deployed |
| 5 | First staging: manual dispatch with `dry_run = true`, then `false`. Discovery reports are staged separately, only when the owner chooses: `stage-discovery.ts` dry run first, then `--write --target <url> --allow-remote-target`. | — | shows results | — | runs |

Expect many `POSSIBLE_SAME_DOCUMENT` rows on the first live run, wherever catalogue links differ only in letter case from the providers' links. That is the intended visibility, not an error.

From step 1, `approve_staged_guideline` refuses a held document (RQ002), whichever app calls it. The old app shows that refusal as a generic save error; the new app names the hold.

**History gap between steps 1 and 2.** Until 20261025 is applied, rejections go through the old function, which writes no decision-log entry. A rejection made in that window is recorded only on the queue row (status, reason, reviewer and time), and nothing back-fills the log: it is append-only, and an entry written later would misstate when it was logged.

- Keep the window short: apply step 2 right after step 1, and ask editors not to reject anything in between.
- At step 3, list what fell into the gap, and note each row in the deployment record:

  ```sh
  psql "$DB_URL" -v since='<P1 at from step 0>' -f supabase/POST-UPGRADE-REJECTION-GAP-READONLY.sql
  ```

  - The file is read-only in the same way as the preflight (G0 must say `on`).
  - G1 lists every rejection since that time that has no log entry. It over-lists rather than misses: rejections between the preflight and step 1 also appear, and they predate the log anyway.
  - In the SQL editor, replace `:'since'` with the quoted timestamp.

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

Re-run `DEPLOY-PREFLIGHT-READONLY.sql`. P3 should be all `t`; P4's `has_reject_2arg` is now `f`, which is expected; P10 should equal the step-0 value. P11 still lists any held open rows until an editor rejects them; they cannot be published.

Keep #174 paused. Re-enabling the schedule is a separate, explicit decision.

## 8. Rehearsal evidence (local, synthetic)

The rehearsal is tracked in `scripts/tests/local-supabase/rehearsal.ts` and runs with `npx tsx scripts/tests/local-supabase/run.ts rehearsal` (see that folder's README). It uses a disposable local Supabase and synthetic data only. The old code comes from `f2b71d9`, main before this branch.

- 2026-10-24, first run: 48 of 48.
- After the preflight gained its read-only wrapper: 54 of 54.
- Latest, after editorial holds were enforced at approval and the rejection-gap check was added: 68 of 68.

**Starting state:** the REBUILD-ORDER chain plus both 20261012 migrations, with no upgrade applied.

**Synthetic data, filed through the old code:**
- The **old** `stage-candidates.ts` (from `origin/main`, unmodified) filed nine rows, including:
  - DNN `?ver=` and encoded-space URLs;
  - a BOA asset GUID;
  - an NHFD query-identity URL;
  - two providers finding the same document, which created a duplicate open pair.
- Decisions through the **old** functions: one approved and published, two rejected, and one deferred by direct SQL.
- The old script also filed the UK-FALCON report as a pending row. Nothing stopped that before the upgrade; the hold arrives with 20261024.

**What the rehearsal showed:**
- **Compatibility at every step:** old app, new app, old script and new script, as tabled in §5.
- **Preflight:**
  - It ran in a session forced read-only, where a test write was refused. P8 found the duplicate pair.
  - Run **without** `PGOPTIONS`, it still ran read-only (P0 = `on`). A write injected into the file before its final `ROLLBACK` was refused by Postgres, and the catalogue and changelog fingerprints were unchanged.
  - P11 listed the held UK-FALCON row, and only that row.
- **20261024 with the duplicate present:**
  - It refused and named the duplicate.
  - Schema, queue rows, catalogue and changelog were all byte-identical afterwards, with no partial objects left.
- **Remedy:** one duplicate was rejected through the normal path, and P8 came back clean.
- **20261024 then applied, and:**
  - every row's original fields were unchanged;
  - both keys were backfilled;
  - every row is marked pre-migration;
  - the accepted row, its guideline and the rejection notes were intact;
  - the UK-FALCON hold was present, and the held legacy row's match key equals the hold key.
- **Step 1 (20261024 only):**
  - Approving the held legacy row was refused (RQ002). Nothing was published, the row stayed pending, and nothing was logged.
  - An old-app rejection left no decision-log entry. This is the history gap.
- **20261025 then applied:**
  - the old 2-argument reject still works;
  - the deferred row became rejectable, and the rejection was logged;
  - the held row is still refused.
- **Rejection-gap check** (`POST-UPGRADE-REJECTION-GAP-READONLY.sql`, since the step-0 P1 time):
  - It ran read-only (G0 = `on`).
  - It listed exactly the two unlogged rejections made since step 0: the duplicate clean-up and the step-1 old-app rejection.
  - It listed nothing when run from a time after the gap.
- **Catalogue and changelog fingerprints** were unchanged across the whole upgrade.

**Not covered:**
- real production data and volume;
- Supabase-hosted platform differences;
- the deployed old app's UI (its exact data calls were exercised, not its screens);
- `pg_dump` and restore themselves.

## 9. Discovery staging (after the upgrade; the owner's decision)

`scripts/stage-discovery.ts` stages one discovery report (written by `scripts/discover.ts`) into the review queue. **No workflow runs it, and no weekly or other schedule is activated by this branch.** The "Guideline & Provider Sync" workflow stays manual-dispatch only. Running the adapter, and enabling any schedule, are separate decisions.

**Commands**

```sh
# Dry run (default): no database contact, no .env read. Always safe.
npx tsx scripts/stage-discovery.ts reports/discovery-<stamp>.json
npx tsx scripts/stage-discovery.ts reports/discovery-<stamp>.json --compare-sync candidates.json   # BOFAS comparison
# Write: all of these are required; nothing falls back to SUPABASE_URL, VITE_* or .env files.
SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/stage-discovery.ts reports/discovery-<stamp>.json   --write --target <supabase-url> --allow-remote-target --out stage-discovery-result.json [--timeout-ms 30000]
```

- `--allow-remote-target` is required for any non-loopback target.
- Without `--write`, `--target` is ignored, and the run makes no database requests. Verified with a decoy server passed as both `--target` and `SUPABASE_URL`: 0 requests.
- **Validated before any database contact.** Every entry is checked first: non-object entries, timestamps, URLs, arrays and each class's evidence shape. A bad entry is `invalid`; nothing about it is sent.
- **Repeated `discoveryId`s:**
  - An identical repeat is listed as `duplicate` and submitted once.
  - The same id with different content is a `conflict`: none of those copies is submitted.
- **Every write request is bounded** by `--timeout-ms`, covering headers and body (default 30000; 1000 to 300000).
  - **`unconfirmed`:** a timeout, a lost connection, or a gateway 5xx without a database error code. The database **may have committed** the item.
  - The adapter never retries automatically. It stops there, and every later item is `not-attempted`.
  - To reconcile, re-run the same report: same run id. An item that was committed comes back `existing` / `already_recorded`, and nothing is filed twice.
  - `--out` records each item's report position, identity key, and whether it is retryable.
- **Exit codes:**
  - **0:** every item ended `staged`, `existing`, `already_open`, `held`, `duplicate`, `not-owner` or `provider-not-ok`.
  - **1:** at least one item was `invalid`, `conflict`, `unsupported`, `failed`, `unconfirmed`, `not-attempted` or `unowned`, or the report could not be read.
  - **2:** a missing flag or key, or a refused target. Nothing is submitted, and no WRITE banner is printed.
- **Retrying the same report is safe.** Retryable outcomes are `failed`, `unconfirmed` and `not-attempted`. `invalid`, `conflict`, `unsupported` and `unowned` need the report or the configuration changed.

**Outcome counts observed (2026-10-24/25)**

| Run | Result |
|---|---|
| Dry run, the real report `discovery-2026-10-24T00-45-41-732Z.json` (BOFAS only) | 5 `not-owner` (4 `POSSIBLE_NEW_EDITION`, 1 `NEW_GUIDELINE`, the UK-FALCON report); 0 submitted; comparison: 5 discovery-only, 0 shared with the current `candidates.json` |
| Local stack, synthetic report A, first write | 3 `staged` (one of each class), 1 `held` (UK-FALCON), 1 `not-owner` (BOFAS), 1 `provider-not-ok`, 1 retirement report-only; exit 0 |
| Same report again, and with only `generatedAt` changed | 3 `existing`, evidence `already_recorded`, same run id, nothing added |
| New sweep (new `discoveredAt` on the candidates) | new run id; 3 `existing` with evidence appended; editor decisions unchanged; no new rows |
| Partial failure, then retry | 2 `staged` + 1 `failed` (exit 1, no row left behind); retry: 1 `staged` + 2 `existing` (exit 0) |
| Contradictory or unowned report | 1 `unsupported` (database 22023: already catalogued), 1 `invalid` (edition without evidence, caught before the database), 1 `unsupported` (retirement-type class), 1 `unowned`; exit 1; nothing written |
| Malformed report | a null entry and a bad timestamp: 2 `invalid`; an identical repeat: 1 `duplicate`, submitted once; the same id with different content: 2 `conflict`, neither written; 2 valid items `staged`; exit 1 |
| Response lost after the server committed (proxy drops the reply; `--timeout-ms 2000`) | 1 `staged`, 1 `unconfirmed` (the row and sighting WERE committed), 1 `not-attempted`; sent once, not retried; exit 1. Retry of the same report: 2 `existing` / `already_recorded` + 1 `staged`; exactly one row and one sighting per item; exit 0 |

These come from `npx tsx scripts/tests/local-supabase/run.ts adapter` (83/83), which runs the actual script.

**Provider ownership: script-enforced, with limits**

`scripts/lib/staging-ownership.ts` gives each provider exactly one staging producer. Both `stage-candidates.ts` and `stage-discovery.ts` consult it.

| Provider | Staged by |
|---|---|
| BOA, BSG, BSSH | `sync-providers` |
| **BOFAS** | **`sync-providers`.** The move to discovery is *awaiting approval* and is not active; discovery shows BOFAS only as `not-owner`, plus the dry-run comparison. |
| NHS EBI, BESS | `discover` |

- A provider owned by the other producer is reported `not-owner`.
- A provider with no owner is reported `unowned` and fails the run.
- **Limits:**
  - It is enforced by the two scripts, not by the database. A direct service-role call to `stage_sync_candidates` or `stage_discovery_candidate` bypasses it.
  - It does not change what was filed before: rows already staged by either producer stay as they are.
  - Even across producers, the database's one-open-row-per-document rule still prevents duplicate *open* rows.

**Run identity: discovery and sync differ**

| | `stage-discovery.ts` | `stage-candidates.ts` |
|---|---|---|
| Run id | `discover:` + sha256 of the canonical submitted payloads (keys sorted, candidates sorted by `discoveryId`). Each payload carries its candidate's `discoveredAt`. | `sync-providers:<generatedAt>:` + sha256 of the raw `candidates.json` bytes |
| Change only `generatedAt`, or reformat the file | **Same** run id: nothing re-recorded | **New** run id: one extra sighting per item, never a new row |
| New sweep | New run id: sightings appended to existing rows | New run id: the same |

The sync rule is unchanged on this branch. In both paths, queue rows are idempotent by candidate id and document; the run id only decides whether a sighting is recorded again.
