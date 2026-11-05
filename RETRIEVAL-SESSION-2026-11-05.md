# Retrieval development handover — 5 November 2026

## Work completed

Local branch: `feat/retrieval-bssh-validation`, based on `9624389` (PR #323).
No commits made. Five pre-existing modified deployment/rollback files were
carried into this branch unchanged; they are not part of this retrieval work.

- `scripts/sync-providers.ts`: BSSH now validates HTTP(S) PDF pathnames,
  accepts uppercase extensions, ignores malformed links without losing the rest
  of the page, and rejects search-query/preview/script links. Absolute publisher
  URLs are preserved; the existing shared URL-key implementation is unchanged.
- BSSH uses an anchor's verbatim `aria-label`, then `title`, when its visible
  text is empty or a recognised generic label. Meaningful visible text wins.
  Without better metadata, generic text remains visible for review. No filename
  titles, surrounding-prose inference, summaries or dates are invented.
- `scripts/lib/provider-fetch.ts`: all four sync DOM adapters now have a
  20-second deadline covering headers AND response-body consumption. HTTP errors
  cancel the response body; failures include the URL. No automatic retries.
- `scripts/tests/bssh-adapter.test.ts`: synthetic markup regression fixture
  covers title precedence, invalid URLs, uppercase PDF paths, query/fragment
  preservation, determinism and unchanged absolute source URLs.
- `scripts/tests/provider-fetch.test.ts`: loopback HTTP server exercises success,
  HTTP 503, stalled headers, stalled body and recovery/no retries; mocked fetch
  verifies all four adapters use a signal and the established User-Agent.
- `package.json`: added `test:provider-fetch`. Run it separately from
  `test:offline`; it binds a disposable loopback server.

## Confirmed architecture and offline baseline

Catalogue: **231 entries**, confirmed by executed ingestion/discovery tests.
The sync index reports 348 distinct version URLs; discovery reports 331 document
URL keys and 35 publisher labels. These are different counting methods.

The configured automated-provider union has ten entries. The following source
URLs and participation decisions come from repository code, not fresh website
verification. Counts below are **fixture counts, not current live totals**.

| Provider | Configured official surface | Method / owner | Offline baseline and gaps |
| --- | --- | --- | --- |
| BOA | https://www.boa.ac.uk/standards-guidance/boasts.html | Asset-link DOM parser; sync stages | Fixture 3; 56 checks passed. Partial BOASt index, not spoke-society coverage. Shared v4 keys handle unreserved escapes. |
| BSG | https://britishsarcomagroup.org.uk/guidelines-2/ | Divi guideline cards; sync stages | Fixture 3; 44 checks passed. Depends on scoped card markup. |
| BOFAS | https://www.bofas.org.uk/clinician/research/bofas-publications | PDF anchors; sync stages, discovery compares | Fixture 4; 53 checks passed. Discovery adds stated year labels. Round Table, Hyperbook and Registry output remain outside this adapter. |
| BSSH | https://www.bssh.ac.uk/professionals/guidelines.aspx | PDF paths; sync stages | Original fixture 4; 63 checks passed after this work. Sub-pages and journal citations remain outside scope. Generic titles without metadata remain noisy. |
| NHS EBI | https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/ and https://ebi.aomrc.org.uk/specialty/retired-guidance/ | Scoped intervention links; discovery stages | MSK fixture 2; combined discovery-adapter suite 60 checks passed. Retirement is publisher evidence, not an automatic catalogue status change. Other specialties and programme PDFs not covered. |
| BESS | https://bess.ac.uk/patient-care-pathways-and-guidelines/ | Accordion summary + PDF; discovery stages | Fixture 3; combined discovery-adapter suite passed. AJAX national-guidelines library and WPFD documents remain gaps. General RSS deliberately excluded. |
| ROS | https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/ | Offline PDF adapter only | Fixture 3; combined discovery-adapter suite passed. Awaiting access approval; no live requests. |
| GIRFT | No fetch surface configured; registry names gettingitrightfirsttime.co.uk and girft-interactivepathways.org.uk | Blocked for tested clients | Skipped by registry; historical HTTP 403 observations are not a current health check. |
| BASK | No fetch surface configured; registry names bask.ac.uk / baskonline.com | Blocked for tested clients | Historical bot challenges; no new access attempted. |
| OTS | No fetch surface configured; registry names orthopaedictrauma.org.uk | Blocked for tested clients | Historical HTTP 401; no new access attempted. |

`createRSSAdapter` is a reusable factory, not an additional configured publisher.
UK-FALCON is BOFAS output and a staging-hold example, not a separate provider.

Provider index parsers, fixture tests and registry decisions are separate from
catalogue publisher aliases (`src/lib/providers.ts`). Do not interpret the ten
configured entries as all publishers represented in the catalogue.

## Identity, review and workflow boundaries

- `scripts/lib/ingestion.ts` owns deterministic candidate IDs and shared match
  and conservative identity keys. SQL mirrors them. No replacement normaliser
  was introduced.
- `scripts/lib/edition-match.ts` compares discovery findings with catalogue URL
  keys and publisher/title evidence. Soft matches require comparison.
- `scripts/lib/staging-ownership.ts` already resolves BOFAS overlap: sync is the
  staging owner. Transfer to discovery is awaiting approval; both staging
  scripts enforce the owner table. No ownership change was needed.
- `stage_sync_candidates` / discovery RPCs preserve existing review outcomes,
  enforce one open row per document, consult holds and append evidence. Service
  credentials are privileged; the scripts, rather than those credentials,
  provide the staging-only boundary. Publishing remains an editor action.
- `guideline-sync.yml`: manual-only, dry-run input defaults true; weekly cron
  remains commented out. `discover.ts` has no enabled scheduled workflow.
- `detect-changes.yml`: Mondays 06:00 UTC, with manual dry-run option. No workflow
  was edited or dispatched.
- `detect-changes.ts` currently hashes whitespace-collapsed text after basic
  script/style/tag stripping. Navigation/timestamp noise remains possible.
  Its fetch timer ends at headers, leaving body reads unbounded; PDF URLs are
  also read as text. Changing fingerprints needs an explicit version/baseline
  plan to avoid flooding review. These paths were inspected, not executed.
- Discovery already has paced conditional HTTP reads, validator/body cache,
  declared partial coverage, explicit failures for unexpectedly empty surfaces,
  token observations and separate classification/staging contracts. Sync's
  empty-result handling is less strict and merits a follow-up regression test.

## Validation actually executed

| Command | Result |
| --- | --- |
| `node node_modules/tsx/dist/cli.mjs scripts/tests/bssh-adapter.test.ts` before changes | 51 passed, 0 failed |
| `npm run test:offline` after BSSH/timeout changes | 25 suites, 1,766 passed, 0 failed; exit 0 |
| Final BSSH suite after adding absolute-URL preservation assertion | 63 passed, 0 failed |
| `node node_modules/tsx/dist/cli.mjs scripts/tests/provider-fetch.test.ts` | 9 passed, 0 failed |
| `npm.cmd run typecheck:scripts` | Passed on final code |
| `npm.cmd run lint` | Exit 0; existing `src/App.tsx:133` React fast-refresh warning |
| `git diff --check` | Passed; Git emits existing CRLF conversion notices |

The full offline run had 62 BSSH assertions; the final focused rerun adds one
URL-preservation assertion. Do not count the focused reruns as new full-suite
results. Full-suite output is local/ignored:
`reports/retrieval-offline-2026-11-05.log`. Expected simulated-error diagnostics
appear in that successful log.

Initial sandbox Node execution failed in `uv_os_get_passwd`; approved execution
outside the sandbox succeeded. PowerShell's `npm.ps1` execution-policy refusal
was avoided using `npm.cmd`. No dependencies were installed.

No UI build/E2E was run: changes affect retrieval scripts. No SQL integration or
rollback rehearsal was run: Docker is unavailable on PATH and at the checked
standard installation path. No production database was contacted.

## Live-access baseline limitation

The web tool attempted these four robots files and returned inaccessible/internal
errors for all: `www.boa.ac.uk/robots.txt`, `www.bssh.ac.uk/robots.txt`,
`www.bofas.org.uk/robots.txt`, `britishsarcomagroup.org.uk/robots.txt`.
No provider page or document scraping followed. This is a limitation of this
session's access, not proof of provider failure. Current live result counts,
duplicates, missing publications and actual markup remain unverified. All HTTP
tests in the new suite use loopback or mocked fetch.

## PR #323 rollback P2

The incoming working tree already contains a proposed fix in five modified files:
`scripts/deploy/Apply-UrlKeyV4-Psql.ps1`, `scripts/deploy/URL-KEY-V4.md`,
`scripts/deploy/apply-urlkey-v4.sh`,
`scripts/tests/local-supabase/urlkey-v4-rehearsal.ts`, and
`supabase/URL-KEY-V4-ROLLBACK.sql`. They were left untouched.

Inspection supports the original concern: a hold stores only `match_key`, not
its original URL, so a decoded v4 hold cannot reveal whether its input had an
unreserved escape. The existing proposed patch compares the entire holds-table
fingerprint with the apply record before rollback; the wrapper requires that
record. This is a conservative approach to unknown provenance. Existing local
documentation claims reproduction, but **this session did not reproduce or
validate that claim**. Script type-checking includes the modified rehearsal.

Next: run `scripts/tests/local-supabase/run.ts urlkey-v4` with Docker available,
review record provenance and concurrent hold-write behaviour, and isolate those
existing edits on a rollback-fix branch before any PR update. Retrieval changes
are separate files, but this feature branch's worktree still carries those
pre-existing uncommitted edits; do not commit everything wholesale.

## Safety and next work

No push, remote GitHub changes, workflow dispatch, production SQL, backup,
restore, candidate staging, publication, source catalogue edits or clinical
summary changes occurred. `npm run seed` was never run. Local commits: none.

Recommended follow-ups: establish permitted live retrieval baselines; add a
fail-closed empty-index test to sync; run the rollback rehearsal; then design
versioned content fingerprints with explicit HTML/PDF handling. Deployment,
production operations, remote PR changes and BOFAS staging-owner transfer still
require Safa's explicit approval.
