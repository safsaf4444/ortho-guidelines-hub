# Review-queue compatibility contract

Scope: `supabase/migrations/20261024_discovery_review_queue.sql`, `scripts/stage-candidates.ts`,
`scripts/sync-providers.ts` and `scripts/lib/ingestion.ts` on `feat/discovery-review-queue-schema`.

**Status:** verified on a disposable local Supabase only. **Not applied to production.** The
dashboard has not been changed and has not been run against this schema (see the checklist at the end).

## 1. Change reasons

The database CHECK accepts nine `change_reason` values. **Four** of them can be staged through an implemented function, and `NEW_GUIDELINE` is accepted by both staging functions. The other five have no staging function on this branch: only a direct SQL insert by the table owner or the service role could create them.

**Functions: what each accepts, and what is actually connected to it**

| Function (who may call it) | Accepts exactly | Connected producer or caller on this branch |
|---|---|---|
| `stage_sync_candidates` (service role) | `NEW_GUIDELINE`, `POSSIBLE_SAME_DOCUMENT`; pipeline `sync-providers` only | **Connected.** `sync-providers.ts` writes `candidates.json`, and `stage-candidates.ts` calls the function. It runs on manual workflow dispatch or locally, against a database with the migration, which today means local only. |
| `stage_discovery_candidate` (service role) | `NEW_GUIDELINE`, `POSSIBLE_NEW_EDITION`, `EDITION_TOKEN_CHANGED`; producer `discover` only | **Not connected.** Implemented and tested by direct calls. #220's `discover.ts` writes reports only, and no adapter calls this function. |
| `approve_staged_guideline` (editor) | `NEW_GUIDELINE` rows only, when `pending` and not linked to or matching a catalogue entry exactly or loosely | Connected: dashboard Approve. |
| `reject_staged_candidate` (editor) | Any class, **`pending` only** (`deferred` refused with 55000) | Connected: dashboard Reject. |
| `resolve_discovery_candidate` (editor) | `POSSIBLE_NEW_EDITION`, `EDITION_TOKEN_CHANGED`, `POSSIBLE_SAME_DOCUMENT`; `pending` or `deferred` | **Not connected.** There is no dashboard UI; it is tested by direct calls. |

**Each `change_reason`**

| `change_reason` | Staged by | Intended producer | New-entry approval | Resolve actions (open ones keep the row in the queue) |
|---|---|---|---|---|
| `NEW_GUIDELINE` | `stage_sync_candidates`, `stage_discovery_candidate` | `sync-providers` (connected); discovery (not connected) | **Yes**, under the conditions above | — (approve or reject) |
| `POSSIBLE_SAME_DOCUMENT` | `stage_sync_candidates` | `sync-providers` (connected): a loose-only URL match | No (42809) | `same-document` closes it; `different-document` (open); `defer` (open) |
| `POSSIBLE_NEW_EDITION` | `stage_discovery_candidate` | discovery, #220 (not connected) | No (42809) | `same-document`, `no-action` close it; `different-document`, `new-edition`, `defer` (open) |
| `EDITION_TOKEN_CHANGED` | `stage_discovery_candidate` | discovery, #220 (not connected) | No (42809) | `acknowledged` closes it; `needs-document-check`, `defer` (open) |
| `CONTENT_DRIFT` | none on this branch | content-hash detector, #174 (paused) | No | — |
| `REVISED`, `WITHDRAWN`, `URL_MOVED`, `UNREACHABLE_LINK` | none | reserved; no producer | No | — |

A deferred row cannot be rejected today, because `reject_staged_candidate` accepts only `pending` rows. It can only be resolved, and only if its class has resolve actions. The proposed fix is in the dashboard scope; it is not on this branch.

Two places hold their own copies of the reason list:
- `ChangeReason` in `scripts/lib/ingestion.ts` has 7 members. It lacks the two discovery classes, which #220's report types carry.
- The dashboard's copy in `src/lib/candidates.ts` has the original 6 only.

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

`src/lib/candidates.ts` still declares `CANDIDATE_SCHEMA_VERSION = 1`. It doesn't validate the version, but it needs updating with the dashboard work.

Discovery reports from #220 have their own `reportSchemaVersion`. No adapter yet stages them; `stage_discovery_candidate` exists but nothing calls it.

## 3. Dependencies between migration, scripts and dashboard

| Combination | Result |
|---|---|
| New scripts + database **without** the migration | The `stage_sync_candidates` call fails. The script exits 1 and nothing is written. |
| **Old** `stage-candidates.ts` + migrated database | Its single INSERT fails the whole batch (23505) as soon as one document is already open under another ID. Otherwise it writes rows with `producer` NULL and a lowercased `primary_url`. Those rows are then treated as uncertain pre-migration rows. |
| New `sync-providers.ts` + old `stage-candidates.ts` | Refused by the old script's schema-version check, since v2 is not v1. Nothing is written. |
| Dashboard + migrated database | **Not verified.** From the code: it loads only `pending` rows, so `deferred` and `resolved` rows are invisible. It shows an unknown `change_reason` as the raw value, because its label lookup falls back to the raw string. It offers Approve on every row, and the server refuses non-`NEW_GUIDELINE` rows with 42809. It has no UI for the resolve actions. |

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
- [ ] Add the three new reasons and the `resolved` status to `src/lib/candidates.ts` and `src/lib/staged-service.ts`, and give them labels.
- [ ] Bump `src/lib/candidates.ts` `CANDIDATE_SCHEMA_VERSION` to 2, and decide whether file mode should validate it.
- [ ] Hide or disable Approve for non-`NEW_GUIDELINE` rows. The server already refuses them; the UI should not offer it.
- [ ] Add resolve actions (`resolve_discovery_candidate`) with a required note, per the class table above.
- [ ] Show the comparison for `POSSIBLE_SAME_DOCUMENT`: the matched entry, the catalogue link, the discovered link and the reason, read from `notes` and the evidence's `soft_match`.
- [ ] Show the uncertainty flag (`legacy-match-key`) and candidate-ID collisions.
- [ ] Decide whether `deferred` rows, and open rows with an outcome such as "awaiting re-filing", appear in the queue view.
- [ ] Show the evidence and decision history (editors can read both tables).
- [ ] Decide whether `reject_staged_candidate` should accept `deferred` rows. Today it accepts only `pending`. That is a database change and is not part of this branch.

**Local end-to-end tests**
- [ ] Run the dashboard against the migrated local stack: load, reject, refused approve, and each resolve action, as an editor and as a non-editor.
- [ ] Run the real `sync-providers.ts` with its real adapters (network, read-only) into `stage-candidates.ts` against the local stack, and record how many comparison rows the current catalogue produces.
- [ ] Test the workflow's run sequence locally: dry run, then live, then rerun.
- [ ] Rehearse the migration against a copy of production-shaped data, including pre-migration rows and the duplicate pre-flight, without touching production.
- [ ] After #220 merges: build a discovery staging adapter for `stage_discovery_candidate` and test it end to end. Remove the known Hide-test failure by bringing in the new `main`.
