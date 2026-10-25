# Review-queue compatibility contract

Scope: `supabase/migrations/20261024_discovery_review_queue.sql`, `scripts/stage-candidates.ts`,
`scripts/sync-providers.ts` and `scripts/lib/ingestion.ts` on `feat/discovery-review-queue-schema`.

**Status:** verified on a disposable local Supabase only. **Not applied to production.** The
dashboard has been updated for this schema and verified against it locally with Playwright (see the checklist at the end).

## 1. Change reasons

The database CHECK accepts nine `change_reason` values. **Four** of them can be staged through an implemented function, and `NEW_GUIDELINE` is accepted by both staging functions. The other five have no staging function on this branch: only a direct SQL insert by the table owner or the service role could create them.

**Functions: what each accepts, and what is actually connected to it**

| Function (who may call it) | Accepts exactly | Connected producer or caller on this branch |
|---|---|---|
| `stage_sync_candidates` (service role) | `NEW_GUIDELINE`, `POSSIBLE_SAME_DOCUMENT`; pipeline `sync-providers` only | **Connected.** `sync-providers.ts` writes `candidates.json`, and `stage-candidates.ts` calls the function. It runs on manual workflow dispatch or locally, against a database with the migration, which today means local only. |
| `stage_discovery_candidate` (service role) | `NEW_GUIDELINE`, `POSSIBLE_NEW_EDITION`, `EDITION_TOKEN_CHANGED`; producer `discover` only; evidence validated (see "Discovery evidence" below) | **Connected, manually:** `scripts/stage-discovery.ts` stages one #220 report when an operator runs it in write mode against an explicit target (see "Discovery staging adapter" below). No workflow runs it. |
| `approve_staged_guideline` (editor) | `NEW_GUIDELINE` rows only, when `pending`, not linked to or matching a catalogue entry exactly or loosely, and not on the hold list (`RQ002`, checking both the row's document and the links being published). Each approval is logged in `staged_discovery_decisions` in the same transaction | Connected: dashboard Approve. |
| `reject_staged_candidate` (editor) | Without 20261025: any class, **`pending` only**. With `20261025_reject_open_candidate.sql`: any **open** row (`pending` or `deferred`); a row with an open follow-up needs `p_confirm_open_follow_up = true` (else `RQ001`); every rejection is logged with the previous status and outcome | Connected: dashboard Reject (with a confirmation checkbox for open follow-ups). |
| `resolve_discovery_candidate` (editor) | `POSSIBLE_NEW_EDITION`, `EDITION_TOKEN_CHANGED`, `POSSIBLE_SAME_DOCUMENT`; `pending` or `deferred` | Connected: dashboard decision buttons, a required note, and per-class actions from `src/lib/review-actions.ts`. |

**Editorial holds** (`discovery_staging_holds`, keyed on the loose match key; 20261024 seeds UK-FALCON):
- Both staging functions refuse to file a held document (outcome `held`).
- `approve_staged_guideline` refuses to publish one (`RQ002`), including a row filed before the migration, whose stored URL was lowercased. Its match key still equals the hold key.
- Rejecting or recording a decision on a held row is allowed; closing it is not publishing.
- The dashboard marks a held row "On hold", gives the reason, and withholds "Review & publish". The database is the authority; the UI only says so up front.
- Preflight P11 lists open rows for held documents before the upgrade.

**Discovery evidence** (`stage_discovery_candidate`), checked against the database catalogue. The migration header, "Discovery evidence validation", has the full rules.
- **Shape, on every call:**
  - `NEW_GUIDELINE` carries no `softMatch` or `tokenChange`.
  - `POSSIBLE_NEW_EDITION` carries `softMatch` naming the same entry.
  - `EDITION_TOKEN_CHANGED` carries `tokenChange` naming the same entry, with two different values.
- **Relationship, before a new row is filed:**
  - The named entry must exist.
  - `NEW_GUIDELINE` is refused if its document (or an observed redirect or canonical-host alternative) is catalogued, exactly or loosely.
  - `POSSIBLE_NEW_EDITION` may have any URL. It is refused only if it *is* a catalogued link, or loosely matches a different entry and not its own.
  - `EDITION_TOKEN_CHANGED` needs its URL, or an observed alternative, to match one of the entry's links.
- **Uncertainty is kept, not refused.** Every discovery sighting records `catalogue_relation` (`exact`, `loose`, `alternative` or `none`), and the dashboard's evidence panel shows it in words.
- Refusals are `22023` and write nothing.

**Each `change_reason`**

| `change_reason` | Staged by | Intended producer | New-entry approval | Resolve actions (open ones keep the row in the queue) |
|---|---|---|---|---|
| `NEW_GUIDELINE` | `stage_sync_candidates`, `stage_discovery_candidate` | `sync-providers` (connected); discovery (adapter, manual) | **Yes**, under the conditions above | — (approve or reject) |
| `POSSIBLE_SAME_DOCUMENT` | `stage_sync_candidates` | `sync-providers` (connected): a loose-only URL match | No (42809) | `same-document` closes it; `different-document` (open); `defer` (open) |
| `POSSIBLE_NEW_EDITION` | `stage_discovery_candidate` | discovery, #220 (adapter, manual) | No (42809) | `same-document`, `no-action` close it; `different-document`, `new-edition`, `defer` (open) |
| `EDITION_TOKEN_CHANGED` | `stage_discovery_candidate` | discovery, #220 (adapter, manual) | No (42809) | `acknowledged` closes it; `needs-document-check`, `defer` (open) |
| `CONTENT_DRIFT` | none on this branch | content-hash detector, #174 (paused) | No | — |
| `REVISED`, `WITHDRAWN`, `URL_MOVED`, `UNREACHABLE_LINK` | none | reserved; no producer | No | — |

Rejecting a deferred row needs `20261025_reject_open_candidate.sql`. Without it, the dashboard reports the action as "feature unavailable" and writes nothing.

Two places hold their own copies of the reason list:
- `ChangeReason` in `scripts/lib/ingestion.ts` has 7 members. It lacks the two discovery classes, which #220's report types carry.
- The dashboard's copy in `src/lib/candidates.ts` has all 9, with labels.

**Review statuses:**
- Open: `pending` and `deferred`. An open row holds its document's single queue slot.
- Closed: `accepted` (a new entry was published), `rejected`, and `resolved` (a decision was recorded and nothing was published).

## 2. Candidate-file versions (`candidates.json`)

| `schemaVersion` | Meaning | `stage-candidates.ts` |
|---|---|---|
| `2` | Current. Adds `POSSIBLE_SAME_DOCUMENT` and `documentComparison`. | Staged |
| `1` | Before 2026-10-24: a loose URL match counted as "catalogued". | **Refused before any database contact.** Exits 1 and writes nothing. The message says how to regenerate the file. |
| absent | Pre-contract file | Read. Only the structured `candidates` are staged; legacy `newCandidates` are never staged. Loose-only items in such a file arrive as `NEW_GUIDELINE`. The database refuses each of them (22023, naming the catalogue entry), so the run exits 1 with those items listed. They are never staged silently. |

**Regenerating a report:**
- **In CI:** the "Guideline & Provider Sync" workflow runs `sync-providers.ts` and `stage-candidates.ts` in the same job, so it always stages a freshly generated v2 file. The schedule is disabled; the workflow runs only on manual dispatch.
- **Locally:** run `npx tsx scripts/sync-providers.ts`. It reads provider sites and writes only `candidates.json`. Then run `DRY_RUN=true npx tsx scripts/stage-candidates.ts`, and drop `DRY_RUN` for a live run.

`src/lib/candidates.ts` declares `CANDIDATE_SCHEMA_VERSION = 2`. File mode does not validate the version.

Discovery reports from #220 have their own `schemaVersion` (v1). `scripts/stage-discovery.ts` stages them; it refuses any other version before doing anything.

**Discovery staging adapter** (`scripts/stage-discovery.ts`)
- **Modes:**
  - Dry run is the default. It makes no database contact and reads no `.env` file.
  - Writing needs `--write` and `--target <url>`. A non-loopback target also needs `--allow-remote-target`. The service key must be in `SUPABASE_SERVICE_ROLE_KEY`.
  - There is no URL fallback: `SUPABASE_URL` and the `VITE_` variables are never read.
- **What it submits:** the three discovery classes, verbatim. That covers the URL, alternatives, stated labels, soft-match or token evidence and notes; the database derives the keys and validates the evidence.
- **Never submitted, always listed:**
  - publisher retirement assertions (report-only);
  - any other class;
  - providers whose discovery run failed or was skipped;
  - providers it does not own.
- **Outcomes:** `staged`, `existing`, `already_open`, `held`, `unsupported` (refused by the database as unsupported or contradictory, or not a stageable class), `failed`, `not-owner`, `unowned`, `provider-not-ok`.
  - It exits 1 on `failed`, `unsupported` or `unowned`.
- **Run identity:** `discover:` + sha256 over the canonical JSON (keys sorted, candidates sorted by `discoveryId`) of the schema version and the exact payloads submitted.
  - The payloads include each candidate's own `discoveredAt`, the sweep time.
  - The report's `generatedAt`, `note`, coverage and fetch metadata, formatting and key order are excluded. So re-stamping or re-saving a report keeps the run id, and a retry adds no evidence.
  - A new sweep is a new run: its sightings are appended to the existing rows, never filed as new rows.
  - (The sync path's run id is unchanged. It still hashes the whole `candidates.json`, including its `generatedAt`.)

**Provider ownership** (`scripts/lib/staging-ownership.ts`): one staging producer per provider, consulted by both `stage-candidates.ts` and `stage-discovery.ts`.

| Provider | Staged by | Note |
|---|---|---|
| BOA, BSG, BSSH | `sync-providers` | Only sync has adapters for them |
| BOFAS | `sync-providers` | A transition to `discover` is **awaiting approval**. Until approved, discovery only shows BOFAS in a dry-run comparison (`--compare-sync candidates.json`). |
| NHS EBI, BESS | `discover` | Only discovery has adapters for them |

- A provider owned by the other producer is listed as `not-owner`.
- A provider in no row is listed as `unowned` and fails the run. Adding a provider is a decision, not a default.
- **Enforced by the scripts, not the database.** A direct service-role RPC call bypasses it.
- BOFAS remains owned by `sync-providers`. Switching it is the owner's decision; this branch does not.
- No workflow runs `stage-discovery.ts`, and no schedule is activated. Commands, observed outcome counts and the run-identity comparison with the sync path are in `DEPLOYMENT-RUNBOOK.md` §9.

## 3. Dependencies between migration, scripts and dashboard

| Combination | Result |
|---|---|
| New scripts + database **without** the migration | The `stage_sync_candidates` call fails. The script exits 1 and nothing is written. |
| **Old** `stage-candidates.ts` + migrated database | Its single INSERT fails the whole batch (23505) as soon as one document is already open under another ID. Otherwise it writes rows with `producer` NULL and a lowercased `primary_url`. Those rows are then treated as uncertain pre-migration rows. |
| New `sync-providers.ts` + old `stage-candidates.ts` | Refused by the old script's schema-version check, since v2 is not v1. Nothing is written. |
| Dashboard + migrated database (20261024 + 20261025) | **Verified locally** (Playwright against a disposable stack). It shows Pending and Deferred groups. Publish is offered only for `NEW_GUIDELINE` + `pending`, and App refuses to open the publish form otherwise. It offers per-class decisions, rejection with follow-up confirmation, and on-demand evidence and decision history. |
| Dashboard + 20261024 without 20261025 | Rejecting a deferred row, or confirming an open follow-up, shows "Feature unavailable" and writes nothing. Everything else works. |
| Dashboard + database WITHOUT 20261024 | The queue shows "Review queue feature unavailable", **not** an empty queue. **Merging the dashboard to `main` redeploys it, so the production queue is unavailable until 20261024 is applied there.** |

**Safe order:**
1. Confirm #174's migration is not applied.
2. Keep the sync workflow undispatched and don't run `stage-candidates.ts` locally.
3. Apply the migration.
4. Merge the scripts.
5. Dispatch with `dry_run = true`, then `false`.

The full order and the rollback limits are in the migration header.

## 4. Document identity and candidate IDs

**Identity key** (conservative): decides the one-open-row-per-document slot and "already catalogued" in `sync-providers`.
- Lowercases only the scheme and host.
- Uppercases the hex digits in `%XX` escapes.
- Removes `ver` parameters.
- Strips trailing slashes from the path only.
- Path, query and fragment keep their case.

**Match key** (loose, unchanged since v2): lowercases everything.
- Feeds candidate IDs, holds, and the comparison proposal.
- Also recognises pre-migration rows. Such matches are reported as `identityBasis: legacy-match-key`, never as exact.

Both keys are pinned in TypeScript and SQL by `scripts/tests/fixtures/url-key-vectors.json`.

**Candidate-ID collisions:** IDs come from the loose key, so two case-distinct documents can share one.

**Rule:** the second document is filed under `<id>~<first 12 hex of md5(identity key)>`. The outcome reports `candidateIdCollision`. Nothing is merged or dropped.

**Determinism, verified locally (integration section 8e):**
- The derived ID is a pure function of the requested ID and the document. The test recomputes it independently in Node and it matches.
- After the first filing, retries of the same report, later runs and **reversed input order** keep the same assignment. Each sighting lands on its own document's row.
- **Limit:** the *first* filing depends on arrival order. Whichever document is staged first takes the base ID. Within one call, input order is processing order. This is pinned by a test, not hidden.

## 5. PR #174 (paused)

#174 is **not** a prerequisite for this branch, and it stays paused. The two migrations conflict, so whichever is applied **second** must first be rebased onto the other:

- **`staged_guidelines_review_status_check`:** this branch adds `resolved`; #174 adds `superseded`. The later migration silently drops the earlier one's value.
- **`approve_staged_guideline()`:** both replace it. #174's version lacks the "linked to or held by an existing entry" refusal.
- **One-open-row index:** #174's detector inserts `CONTENT_DRIFT` rows and allows one open row per (guideline, URL). That collides with this branch's one-open-row-per-document index (23505) for cross-listed URLs and already-open documents.
- **`scripts/lib/ingestion.ts`:** a rebase of #174 must take this branch's version.
- **Enforcement:** this migration refuses (55000) to run on a database holding #174's objects. #174 has no reverse check.

## 6. Remaining work (not started)

**Dashboard support**
- [x] Add the three new reasons and the `resolved` status to `src/lib/candidates.ts` and `src/lib/staged-service.ts`, and give them labels.
- [x] Bump `src/lib/candidates.ts` `CANDIDATE_SCHEMA_VERSION` to 2. (File mode still does not validate it; that is undecided.)
- [x] Hide or disable Approve for non-`NEW_GUIDELINE` rows. The server already refuses them; the UI should not offer it.
- [x] Add resolve actions (`resolve_discovery_candidate`) with a required note, per the class table above.
- [x] Show the comparison for `POSSIBLE_SAME_DOCUMENT`: the matched entry, the catalogue link, the discovered link and the reason, read from `notes` and the evidence's `soft_match`.
- [x] Show the uncertainty flag (`legacy-match-key`) and candidate-ID collisions.
- [x] Decide whether `deferred` rows, and open rows with an outcome such as "awaiting re-filing", appear in the queue view.
- [x] Show the evidence and decision history (editors can read both tables).
- [x] Keep reject reasons and decision notes as drafts. They survive Cancel, a failed or refused attempt, and queue refreshes **within the page session, for the same account**. They do **not** survive a full browser reload, closing the tab, switching away from the review view, signing out, or another account signing in (including from another tab). They are not persisted anywhere. The same applies to card notes and an open Edit modal (`src/lib/draft-owner.ts`).
- [x] `reject_staged_candidate` accepts `deferred` rows. This is `20261025_reject_open_candidate.sql`: local only, not applied to production.

**Local end-to-end tests** (tracked in `scripts/tests/local-supabase/`; see its README)
- [x] Run the dashboard against the migrated local stack: load, reject, refused approve, and each resolve action, as an editor and as a non-editor.
- [ ] Run the real `sync-providers.ts` with its real adapters (network, read-only) into `stage-candidates.ts` against the local stack, and record how many comparison rows the current catalogue produces.
- [ ] Test the workflow's run sequence locally: dry run, then live, then rerun.
- [x] Rehearse the migration on synthetic, production-shaped data, including pre-migration rows, a held legacy row, the duplicate pre-flight and the rejection-gap check, without touching production (`run.ts rehearsal`). A copy of real production data has not been used.
- [x] Build a discovery staging adapter for `stage_discovery_candidate` and test it end to end (`run.ts adapter`: the actual script against a local stack).

## 7. Open decisions (deliberately unchanged on this branch)

Both behaviours below are documented here, not changed. Each needs a separate decision by the owner.

**A rejection is remembered per candidate id, not per document.**
- Candidate ids include the provider and the class:
  - sync: `makeCandidateId` in `scripts/lib/ingestion.ts`;
  - discovery: `makeDiscoveryId` in `scripts/lib/discovery-classification.ts`.
- So a rejected document comes back as a new pending row when:
  - a second provider lists it (cross-listing);
  - its class changes, for example `NEW_GUIDELINE` to `POSSIBLE_SAME_DOCUMENT` after a catalogue edit.
- While it is open, the one-open-row rule still stops duplicates. Main behaves the same way.
- Options: a per-document rejection memory, or a hold-like list fed by rejections.

**A pre-migration row is matched by the loose key.**
- Rows filed before 20261024 kept only a lowercased URL, so `_queue_row_for` matches them by match key.
- A document differing from such a row only in letter case is reported `already_open` against it, with `identityBasis: legacy-match-key`. It gets no row of its own until the old row closes.
- This is visible, never silent, but it can delay a genuinely distinct document.
- Options: leave it, since such rows close over time, or have editors re-file affected rows after the upgrade.
