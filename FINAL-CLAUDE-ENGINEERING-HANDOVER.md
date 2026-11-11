# Final Claude engineering handover: editorial governance

12 November 2026. **Status: LOCAL ENGINEERING PASS (maximum attainable). PRODUCTION HOLD.**

This handover lets the project continue without Claude or VS Code. Every command below runs from a plain terminal in a checkout of the branch. The work was done by an AI assistant. It is **not** independent human security, clinical or accessibility acceptance.

## 1. Commits and branch

| Item | Value |
|---|---|
| Branch | `fix/governance-final-review-conditions` (local only, never pushed) |
| Code commit | `2d93be4779fb01e8b55c3c8c18dec3a9d5b8ba64` |
| This handover | The commit that adds this file, directly on top of `2d93be4` |
| Baseline | `962fca4c71065a3988f93d2643b78031c6974699`. Review verdict CONDITIONAL PASS, in `INDEPENDENT-ACCEPTANCE-962fca4.md` (session scratchpad, see §9) |
| Lineage | `2f60bd8` (Search V2 static release candidate), then `d905a4e`, `be49dd4`, `daba18f`, `dc07256`, `962fca4` and `2d93be4` |
| Catalogue | 231 guidelines, unchanged. No data file changed |
| Original static preview | `ORTHO-STATIC-PREVIEW-2f60bd86.zip`, SHA-256 `AE840D1B09DAF82FE022800E91ED5A4C8B2DC40C24526FC565A26A0569E30C82`, unchanged and untouched |

Nothing was pushed, merged or deployed. No production Supabase, Cloudflare or Railway was contacted, and no clinical content was published.

## 2. Changed files (`962fca4..2d93be4`, 23 files, +541/−71)

| Area | Files |
|---|---|
| Database proposal | `supabase/proposals/20261107_editorial_governance_hardening.sql` |
| Scope contract (new) | `scripts/lib/scope-contract.ts`. Consumers: `scripts/lib/url-alternatives.ts`, `scripts/lib/ingestion.ts`, `scripts/stage-discovery.ts` |
| Release-gate observer | `scripts/lib/release-monitor.mjs` |
| App | `src/App.tsx`, `src/components/PublicationReceipts.tsx`, `src/components/ReviewDashboard.tsx` |
| New tests | `scripts/tests/governance/final-conditions.security.mjs`, `scripts/tests/scope-contract.test.ts`, `scripts/tests/editor-final-conditions.e2e.ts` |
| Changed tests | `governance/{f1-f5,final-blockers,scope-classification,legacy-alias}.security.mjs` (assertions changed; see §3, "Changed assertions"). `release-gate.test.mjs` (2 added). `governance/{contracts,postgres}.test.mjs`, `db-harness.mjs` (lint only). `governance/run.mjs` (registers the new suite) |
| Docs and scripts | `scripts/tests/governance/README.md`, `package.json` (adds `scope-contract.test.ts` to `test:offline`, and a new `test:editor-final-conditions`) |

## 3. Findings: red on `962fca4`, green on `2d93be4`

Each red run used the new test against unchanged `962fca4` code, either in a clean detached worktree or a fresh lab built from the `962fca4` proposal.

| Finding | Correction | Red (`962fca4`) | Green (`2d93be4`) |
|---|---|---|---|
| **P2-1** Focus fell to `<body>` during and after a refused or unconfirmed Publish | Focus is parked on a focusable `role=status` line (`data-testid=publication-status`) while the request is in flight. On a non-completion it returns to Publish (or the change note). States announced: "Publishing…" and "Publication did not complete…". Success still closes the dialog and restores focus to the invoking button | `editor-final-conditions`: focus on BODY in both P2-1 scenarios; the suite totalled 18 passed, 10 failed | 42/0 |
| **P2-2** A producer-declared navigation or surface role suppressed new holds | `_governance_alias_trust` returns only `comparison-only…`. Declared roles are kept as `comparison-only; producer-declared <scope> role unverified; equivalence not established`. No exemption path exists; any exemption is a D3 decision | `final-conditions.security`: 11 passed, 19 failed (all P2-2 cases published) | 30/0 |
| **P2-3** Scope contract split three ways | One module, `scope-contract.ts`. SQL refuses `surface` where no `surface_url` is recorded (sync evidence, staged versions). Each producer imports its subset | `scope-contract.test`: 10 passed, 9 failed; DB suite as above | 19/0; 30/0 |
| **P3-1** Omitted scope was not treated as document-level at staging | `coalesce(a->>'scope','document')='document'` | DB suite case failed | passes |
| **P3-2** Legacy scoped rows were honoured as navigation-only | Same classifier: recorded, never exempt. README corrected | DB suite cases failed | pass |
| **P3-3** Unscoped shared index pages over-hold | **Kept**: this errs on the safe side. Documented as the operational cost pending D3 | n/a | n/a |
| **P3-4** A just-published candidate stayed in the queue | App bumps `queueVersion` after a confirmed publication. The dashboard refetches without remounting, so drafts are kept | e2e: queue not re-read (`reads 2 → 2`) | passes |
| **P3-5** Backdrop click mid-flight, two status regions, primary-only receipt hint, `forbid_mutation` search_path, lint | Backdrop ignored while submitting (Escape and Cancel still dismiss safely). One live region. The hint checks every proposed, staged, observed and alternative URL. `alter function forbid_mutation() set search_path=pg_catalog,pg_temp`. 5 safe lint fixes | e2e and DB cases failed | pass |
| **P3-6** `release-gate-adversarial` failed and hid 20 suites | Root cause: on this Windows host, merely **reading** `scripts/discover.ts` raises a metadata-only `fs.watch` "change" (reproduced by a standalone diagnostic). The observer now ignores notifications whose size and mtime are unchanged; any write, including write-and-restore, is still observed | Failed 3/3 runs. Unit regression: 27 passed, 1 failed | Adversarial suite passes, 12 tamper observations verified. Unit suite 28/28. **Full `test:offline` chain passes end to end** |

Red and green logs are in the session scratchpad under `final-conditions\red\` and `final-conditions\green\` (§9).

### Changed assertions (deliberate; all stricter)

The old assertions expected producer-declared exemptions, which P2-2 identified as the defect. Every changed assertion now expects **review** where it previously expected publication or navigation-only. Each one is commented in place.

- `f1-f5.security.mjs`: "F2 producer-declared shared index requires review".
- `final-blockers.security.mjs`:
  - "keeps each classification once" now expects one row per distinct declared role. Previously index and fallback collapsed into a single class. The check is order-independent and exact.
  - "producer-declared shared navigation page … requires review and keeps both claims".
- `scope-classification.security.mjs`: four R1/R2 exemption assertions now expect a held result. Three trust-text expectations were updated. All held assertions are unchanged.
- `legacy-alias.security.mjs`: the exact expected trust strings, in order.

No hold assertion was removed or loosened. Every test count went up or stayed the same.

## 4. Full regression matrix (`2d93be4`, 12 November 2026)

| Gate | Command | Result |
|---|---|---|
| Cold migration and rollback | `node scripts/tests/governance/run.mjs` (fresh network-none labs) | rehearse 12/0 |
| Contracts | ″ | 6/0 |
| PostgreSQL governance and concurrency | ″ | 189/0 |
| F1–F5 | ″ | 37/0 |
| Final blockers (isolation, alias order) | ″ | 76/0 |
| Scope classification | ″ | 46/0 |
| Final conditions (P2-2, P2-3, P3-*) | ″ | 30/0 |
| Preflight inventory, quarantine, compat preflight, legacy alias | ″ | ok, 5/0, 6/0, 5/0 |
| Offline (50 + 1 suites, including all search held-out/QA/benchmark, release gate and scope contract) | `npm run test:offline` | **Full chain exit 0 end to end** |
| Script typecheck | `npm run typecheck:scripts` | exit 0 |
| Lint | `npm run lint` | exit 0, 3 warnings (documented below) |
| Production build | `npm run build` | exit 0 |
| Backup safety | `powershell -File scripts/tests/backup-safety.test.ps1` | 196/0 |
| Public UI | `npm run test:ui` | 47/0 |
| Receipt fixture | `npm run test:receipts` | 12/0 |
| Real-App editor | `npm run test:actual-editor` | 33/0 |
| Editor follow-up (race, K1, K2) | `npm run test:editor-followup` | 46/0 |
| Editor final conditions (P2-1, P3-4, P3-5) | `npm run test:editor-final-conditions` | 42/0 |
| Final UI (19 original requirements + 2) | `npm run test:final-ui` | 21/21 |
| Local browser safety | `npm run test:local-browser-safety` | 21/0 |
| Static preview, from a clean commit | `node scripts/build-static-preview.mjs`, then `node scripts/tests/static-preview.e2e.mjs` | build ok (14 files), e2e 24/0 |

**Incomplete or not run:**
- Not wired to any gate: `extended-public-ui.e2e.mjs`, `search-browser-qa.e2e.ts`, `url-key-v4-regressions.ts`, `integration/discovery-queue.local.test.ts`, `local-supabase/*` (needs a Supabase CLI stack).
- No real Supabase, Auth or PostgREST environment.
- No screen reader; no browsers other than Chromium.

**Lint warnings kept:**
- Two `no-unsafe-finally`: deliberate guards that throw instead of deleting an unexpected path.
- `App.tsx` `only-export-components`: a dev-only fast-refresh notice.

Lab hygiene: `run.mjs` creates three labs and prints their names in `reports/f1-f5-remediation/DATABASE-GATE.json`. Stop them with `docker stop`. Never rerun a single suite on a lab after `quarantine.test.mjs` has run on it.

## 5. Scope contract and producer-trust limits

- **Accepted values:** `document`, `surface`, `index`, `fallback`, `navigation`. Anything else gives GV005. Labels are never classified.
- **Restrictions:**
  - Discovery alternatives: `document` or `surface`.
  - `surface` needs the recorded `surface_url` of discovery evidence.
  - Versions: no `surface`.
  - Omitted scope means document-level.
- **No exemption:** a producer-declared role is provenance only. The cost is over-holding: a shared publisher index or fallback page on a rejected candidate holds later candidates until an editor releases the rejection, and that release covers the whole rejection (D2).
- **Residual trust boundary:** any `service_role` holder can submit any allowed value, but no value can lift or avoid a hold. A producer can still submit misleading *document* evidence or omit evidence. That is a credential-custody and process issue, not something the schema can establish.
- **What an exemption would need (D3):**
  - an approved role taxonomy;
  - provenance the producer cannot choose, such as a DB-held registry of approved surface URLs per provider;
  - an audited, attributed editor RPC to confirm a role.

## 6. D1–D4 human decisions (none made here)

| Decision | Owner(s) | Safe default in force | If unresolved |
|---|---|---|---|
| **D1** Issuer, freshness, reviewer/publisher separation, retention | Clinical/editorial lead, security/service owner, privacy lead | `ortho_link_verifier` NOLOGIN with no members; `maximum_age` NULL, so availability receipts are ineligible. The same editor may review and publish, and reviews have no expiry; these are facts, not approvals | Availability statuses cannot publish. Single-person publication remains unapproved |
| **D2** Rejection memory and reconsideration | Clinical/editorial lead and security reviewer | No expiry. Attributed release of the **whole** rejection only | Over-holds accumulate with no per-alias remedy |
| **D3** Navigation vs document links | Source-provenance/editorial lead with security review | **No exemption at all** (this commit) | P3-3 over-holding continues |
| **D4** Editorial cutover and correction workflows | Product/clinical owner and release/security engineer | Static read-only. Direct create, correct and archive disabled | No supported correction route. `detect-changes.yml` direct updates would be refused after adoption |

Use the approval template in `D1-D4-DECISION-BRIEFS.md` (§9) to record each decision.

## 7. Target Supabase, Auth and PostgREST verification checklist

Each check needs separately authorised **read-only** access first. None was performed.

1. Role and database `default_transaction_isolation` for `authenticator`, `authenticated` and `service_role`, and the pooler mode. Every governance call must run at READ COMMITTED, or it fails with GV007.
2. How PostgREST reports custom SQLSTATEs (GV002–GV007, RQ002, 55000, 42501): HTTP status and `code` field. Client classification depends on it.
3. Migration-role capability:
   - `CREATE ROLE`;
   - `REVOKE CREATE ON SCHEMA public`;
   - triggers on existing tables;
   - `ALTER FUNCTION forbid_mutation` (owner).
4. Function integrity and inventory:
   - the bodies of `is_editor()`, `forbid_mutation()` and the URL-key helpers;
   - all SECURITY DEFINER functions and their `search_path`;
   - EXECUTE and default grants (including the staging, reject and resolve grants from 20261024/25), BYPASSRLS memberships and RLS policies.
5. URL-key v4 (`20261104`) applied in production. The proposal refuses to run otherwise.
6. Production data passes the embedded preflight within the 5 s lock and 60 s statement timeouts.
7. PostgREST schema-cache reload; helpers exposed but not executable by API roles.
8. Auth:
   - the editor allowlist;
   - JWT `sub`/`role` claims;
   - session expiry;
   - MFA and leaked-password protection (recorded as off).
9. A fresh verified backup, and a restore rehearsal in a target-equivalent environment.
10. Disable or replace `.github/workflows/detect-changes.yml` direct `guidelines` updates before adoption. Review service-role secret custody.

## 8. Remaining manual approvals before any release

- **Independent human security review** of the proposal SQL, grants and App publication path.
- **Clinical acceptance** of the governance model (D1–D4) and of every published clinical status.
- **Manual accessibility testing:**
  - NVDA or JAWS with Chrome/Edge, and VoiceOver with Safari, on the editor dialog (receipts, Publish flow, live regions) and the public UI;
  - real mobile devices;
  - browsers other than Chromium.
- **Authorised target verification** (§7), then explicit owner approval for any migration, merge or deployment.

## 9. Reproduce and continue without Claude or VS Code

```powershell
git worktree add ..\ortho-governance fix/governance-final-review-conditions   # or checkout the branch
cd ..\ortho-governance; npm ci                                                 # isolated checkout, no .env files
npm run test:offline; npm run typecheck:scripts; npm run lint; npm run build
node scripts/tests/governance/run.mjs     # needs Docker + local postgres:17-alpine image; network none
npm run test:ui; npm run test:receipts; npm run test:actual-editor; npm run test:editor-followup
npm run test:editor-final-conditions; npm run test:final-ui; npm run test:local-browser-safety
node scripts/build-static-preview.mjs; node scripts/tests/static-preview.e2e.mjs   # from a clean commit
```

Evidence locations on this machine (not committed; `reports/` is gitignored):
- **Review:** `…\scratchpad\independent-962fca4\INDEPENDENT-ACCEPTANCE-962fca4.md`, with logs and probes alongside.
- **Red/green logs:** `…\scratchpad\final-conditions\{red,green}\`.
- **Diagnostic:** `…\scratchpad\final-conditions\diag-watch.mjs`.
- **D1–D4 briefs:** `C:\Users\safad\AppData\Local\Temp\codex-final-independent-security-acceptance\reports\final-independent-acceptance\D1-D4-DECISION-BRIEFS.md`.

`…\scratchpad` is `C:\Users\safad\AppData\Local\Temp\claude\7681f9dcf45cb92a\e6ebbd6e-13ae-431c-b657-44288985f295\scratchpad`. It is a temporary folder: copy anything you need to keep.

**PRODUCTION HOLD** remains until all of the following are in place:
- independent human security and clinical acceptance;
- D1–D4 approvals;
- authorised target-environment verification.
