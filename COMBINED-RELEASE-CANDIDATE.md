# Combined local candidate: Search V2, governance and Codex drawer

**Local candidate prepared; PRODUCTION HOLD.** This extends the existing integration plan and handover. It is not human security, clinical or accessibility acceptance, and it does not authorise deployment or migration.

## Preserved lineage and integration choice

- Frozen Search V2: `2f60bd86d0e875e5a707b390118af291645df844`.
- Completed governance remediation: code `2d93be4779fb01e8b55c3c8c18dec3a9d5b8ba64`, handover `334c7f627d001e05bc14a9c30999c80ba2d1ad40`. Its worktree was clean on inspection; no ongoing uncommitted remediation was found there. Original code, branches and evidence remain preserved.
- Existing combined integration: `474606619fde28a1bdd060b56237a07e52ed983c` (code `35f79f4`). It already descends from the frozen Search V2 and completed governance lineage, and already includes the responsive/grouping improvements. It used the separate `fc1b44a` drawer implementation.
- This candidate is a new worktree/branch, `integrate/codex-drawer-search-v2-governance`, based on `4746066`. The Codex native drawer from `d40285453835d9be587387ec57580185cf1229e6` is ported at the navigation seam. Its component matches that commit exactly after line-ending normalization. This is a selective port, not a merge of the older substring-search branch.

Only the earlier inline drawer focus manager/backdrop/inert wiring is replaced. Native modal dialog semantics now own modality; duplicate focus managers are removed. Search V2 filtering/ranking, result announcements, clinical statuses, skip link, card semantics, static-preview disconnection controls, receipts and publication behavior are preserved. The old and new drawer implementations are not both active.

The permanent native drawer regressions are adapted to Search V2's native card buttons. `test:mobile-drawer` stays self-contained. The public UI source guard follows the extracted modal component; its Windows path-with-spaces lookup is corrected using a file URL. No search expectation, benchmark label, weight, fixture or clinical content is changed.

## Regressions completed before the integration commit

| Check | Result |
| --- | --- |
| Complete package offline test chain | All 51 suites exit 0, including search, governance contracts/remediation, scope contracts and release-gate adversarial tests |
| Frozen rendered search | 77 passed, 0 failed |
| Public UI keyboard/accessibility/responsive | 47 passed, 0 failed, including 320–1440px |
| Native drawer | Pass at 320/375/767px: focus order/wrapping, browser AX tree, background keyboard/pointer blocking, all dismissal paths, navigation/reopening, desktop resize, offline interaction, grouping, 44px/16px controls and overflow |
| Extended responsive/contrast | 14 passed, 0 failed |
| Separate local static artifact/PWA | 24 passed, 0 failed: offline search, changed-worker update prompt, updated cache surviving offline reload |
| Synthetic receipt/editor integration | Receipts 12/0; actual editor 33/0; follow-up/race 46/0; final conditions 42/0 |
| Final UI and configuration/browser safety | 21/0 and 21/0 |
| Project and scripts typechecks, lint, production build | All exit 0; existing Fast Refresh, two deliberate unsafe-finally lint warnings and bundle-size warning remain |

All browser APIs were synthetic loopback mocks or disconnected static data; external connections were blocked. No production environment or real clinical publication was exercised. Frozen browser suites were run unchanged using a report-only Edge launch adapter; `tsx` needed an unsandboxed local test process because the sandbox cannot perform its user-identity lookup. Offline Node processes used the external-network guard. No dependency installation or download was needed.

An initial Windows pathname failure in the public UI test was fixed without changing assertions. Initial sandbox `tsx` startup failures and PowerShell stderr warning wrappers are retained in logs; authoritative build exit codes are in `build-results.json`, and successful offline outcomes are in `offline-results.json`.

## Integrity and evidence

`reports/combined-finalisation/INTEGRITY.json` verifies:

- Search engine, catalogue and frozen fixture files are unchanged against `2f60bd86`; all 231 guidelines remain intact.
- All **64** development benchmark per-query outcomes and all **16** held-out query arrays/ranks/targets match the frozen candidate evidence exactly (timing measurements excluded).
- Held-out fixture SHA-256 remains `244b62ebd897d8a8fb7c78be2239f3b65dcf353a2a22c41a605817254ff32fe5`.
- Governance SQL, service modules, producer helpers, review dashboard and publication receipt component are unchanged against `334c7f6`. The App diff is limited to navigation modality; publication handlers were not changed.
- The original static-preview ZIP remains `ae840d1b09daf82fe022800e91ed5a4c8b2dc40c24526fc565a26a0569e30c82`. Original preview/artifact files were not written. The tested artifact is separately generated inside this new worktree.

Evidence in the ignored `reports/combined-finalisation/` directory includes the full logs, results JSON, integrity checker and checksummed preservation copies of 21 governance/readiness evidence files. Original evidence remains in its original worktrees. Drawer screenshots are under `reports/navigation-drawer/`; the local static artifact is under `reports/combined-finalisation/static-preview/`.

## Remaining blockers and limits

The **PostgreSQL governance runtime gate was not rerun here**: Docker is unavailable in this session. Previously recorded governance runtime evidence was copied with checksums and preserved, but is historical, not a fresh combined-candidate DB pass. No SQL/service change was introduced to address that tooling gap. The clean-commit full release gate and its human review holds have not been waived or represented as passing.

Production remains blocked on independent human security/clinical acceptance, D1–D4 decisions, authorised target verification, manual assistive-technology/real-device testing, and the existing handover's unresolved non-UI retrieval reconciliation and workflow-adoption requirements. See `FINAL-CLAUDE-ENGINEERING-HANDOVER.md` and `INTEGRATION-HANDOVER.md`. This frontend port does not resolve those decisions or certify compatibility with an unverified production target.

No original branch was overwritten; no push, deployment, production access, governance policy change or Railway operation occurred.

## Local reproduction

From this worktree, run `node reports/combined-finalisation/run-offline.mjs`, `node reports/combined-finalisation/check-build.mjs`, and `npm.cmd run test:mobile-drawer`. The report-only offline runner executes the exact package test chain with an external-network guard and records individual exit codes. Run browser suites with `node --require ./scripts/lib/release-network.cjs --import ./reports/combined-finalisation/browser-override.mjs node_modules/tsx/dist/cli.mjs <suite>`; report-only launch adaptation selects installed Edge without modifying frozen suites. The native drawer runner selects Edge directly and restricts its preview to loopback. Other hosts may use their installed Playwright Chromium without the launch adapter.

Before any further release acceptance, rerun the isolated database gate in a Docker-capable local environment and the release gate on the exact committed candidate. Preserve the frozen original artifact and all outstanding HOLD decisions.
