# Integration handover: Search V2 + public UI + governance

12 November 2026. **Status: LOCAL ENGINEERING PASS (maximum attainable). PRODUCTION HOLD.** Work done by an AI assistant. It is not independent human security, clinical or accessibility acceptance. Nothing was pushed, merged into an original branch or deployed. No production Supabase, Cloudflare or Railway was contacted, and no clinical content was published.

## 1. Commits and branches

| Phase | Branch (local) | Commit | Base |
|---|---|---|---|
| 1. Governance review conditions | `fix/governance-final-review-conditions` | code `2d93be4`; handover `334c7f6` (`FINAL-CLAUDE-ENGINEERING-HANDOVER.md`) | `962fca4` |
| 2. Mobile drawer focus (on the Codex line) | `fix/public-ui-drawer-focus` | `fc1b44a9b3432cef0230e3e797aedb81ceddaefe` | `336b08a` (Codex worktree untouched) |
| 3. Integration plan (written before combining) | `integrate/search-v2-public-ui-governance` | `e9758f8` (`INTEGRATION-PLAN-SEARCH-V2-PUBLIC-UI.md`) | `334c7f6` |
| 4. Integrated local release candidate | `integrate/search-v2-public-ui-governance` | **`35f79f49977aba3b6f3128266345d1ec4b2271f0`**; this handover is committed on top | `e9758f8` |

Unchanged originals:
- `fix/public-ui-responsive` at `336b08a`.
- `fix/final-qa-release-candidate` at `2f60bd8`.
- `fix/governance-conditional-followup` at `962fca4`.
- The original static preview ZIP: SHA-256 `AE840D1B…E30C82`, rechecked after each phase.

## 2. Changed files

- **`fc1b44a`** (vs `336b08a`): `src/App.tsx`, `scripts/tests/mobile-drawer.e2e.mjs` (new), `package.json`. +125/−15.
- **`35f79f4` + `e9758f8`** (vs `334c7f6`): `INTEGRATION-PLAN-SEARCH-V2-PUBLIC-UI.md`, `src/App.tsx`, `src/index.css`, `scripts/tests/mobile-drawer.e2e.mjs` (Search V2 adaptation), `package.json`. +175/−4.
- **Unchanged against `2f60bd8`** (verified by `git diff`):
  - `src/lib/search/*`;
  - `src/data/*`, including the 231 guidelines;
  - `src/lib/supabase.ts`;
  - `src/lib/supabase-config.ts`.
- **Phase 1 files** are listed in `FINAL-CLAUDE-ENGINEERING-HANDOVER.md` §2.

## 3. Search V2 ancestry and conflict summary

`962fca4` (and so `334c7f6`) descends from `2f60bd8`; the governance line already contains Search V2. `336b08a` forked from `caf34be` independently. The full conflict matrix (C1–C10) is in `INTEGRATION-PLAN-SEARCH-V2-PUBLIC-UI.md`. In brief:

**Kept from Search V2:**
- the Search V2 engine (**no substring search imported**);
- the explicit-configuration Supabase client. The `336b08a` line falls back to the **production project URL** when unconfigured; that fallback was not imported;
- governance and the editor;
- the search label, live result count and Clear filters;
- card markup and the focus outline.

**Ported from the public UI line:**
- the modal mobile drawer: inert background and a Tab trap;
- the grouping control at every width;
- `main` `min-w-0`;
- `.public-browse` sizing, wrapping and small-text contrast.

**Not run as-is:** Codex's `public-ui.mjs`. It selects `textbox` and `[role=button]`, while Search V2 uses `searchbox` and native buttons. Its requirements are covered by `public-ui.e2e.ts` and the adapted `mobile-drawer.e2e.mjs`.

**Out of scope:** reconciling the non-UI differences between the `139c745..07337cd` commits and their consolidated forms in Search V2 (URL-key v4 deploy scripts, `ingestion.ts`, `sync-providers.ts`, rollback SQL). The owner must reconcile these separately.

## 4. Red/green evidence

| Change | Red | Green |
|---|---|---|
| Drawer focus on the Codex line | `mobile-drawer` on `336b08a`: 29 passed, 16 failed. Tab reached the header buttons and the background search field; focus was not moved in | `fc1b44a`: 45/0. Codex `public-ui.mjs` still passes at 320/375/768/1440 |
| Drawer, mobile grouping and reading size on Search V2 | `mobile-drawer` (Search V2 adaptation) on `334c7f6`: 39 passed, 14 failed. **The same Tab escape exists on the Search V2 line**, and the grouping control is unreachable on mobile | `35f79f4`: 57/0 |
| Governance (Phase 1) | See `FINAL-CLAUDE-ENGINEERING-HANDOVER.md` §3 | Same |

## 5. Regression matrix for the integrated candidate `35f79f4`

| Gate | Result |
|---|---|
| DB governance gate (fresh network-none labs) | rehearse 12; contracts 6; postgres 189; F1–F5 37; final blockers 76; scope 46; final conditions 30; preflight-inventory ok; quarantine 5; preflight 6; legacy 5. All pass |
| `test:offline` (full chain, including search held-out/QA/benchmark, release gate, scope contract) | exit 0 end to end |
| `typecheck:scripts`, `lint`, `build` | exit 0; lint 1 warning (the existing `App.tsx` fast-refresh notice) |
| Backup safety | 196/0 |
| Public UI, Search V2 (overflow 320–1440, drawer basics) | 47/0 |
| Mobile drawer (320/375/1024, keyboard, pointer, resize) | 57/0 |
| Search browser QA (previously unwired, run here) | 77/0 |
| Extended public UI (needs the built preview; run after the static build) | 14/0 |
| Receipts / real editor / editor follow-up / editor final conditions | 12 / 33 / 46 / 42 |
| Final UI (19 original + 2) | 21/21 |
| Local browser safety | 21/0 |
| Static preview, from the clean commit | build ok (14 files), e2e 24/0 |

**Incomplete:**
- The `336b08a` line's own `test:offline` stops at 2 pre-existing `draft-owner` source-regex failures. A CRLF checkout breaks their `\n}\n` pattern. They fail identically on untouched `336b08a` and were not imported.
- `url-key-v4-regressions.ts`, `integration/discovery-queue.local.test.ts` and `local-supabase/*` need a Supabase CLI stack and were not run.
- No real Supabase environment, no screen reader, no real mobile devices, Chromium only.

## 6. Production release blockers

1. Independent **human** security review of the governance SQL, grants and App publication path.
2. **Clinical acceptance** of the governance model and of every published status.
3. **D1–D4** policy decisions (see `FINAL-CLAUDE-ENGINEERING-HANDOVER.md` §6). D3 currently has no exemption, so shared navigation pages are deliberately over-held.
4. Authorised **target verification** of Supabase, Auth and PostgREST: isolation level, error codes, migration-role capability, function integrity and grants, URL-key v4 applied, preflight and timeouts, schema cache, Auth settings, backup and restore.
5. Retire or replace the `detect-changes.yml` direct catalogue updates before adopting governance.
6. **Manual accessibility testing:** NVDA/JAWS/VoiceOver, real devices and other browsers. Covers the editor dialog, the mobile drawer and the browse view.
7. Owner reconciliation of the non-UI differences between the `139c745..07337cd` commits and their consolidated forms (C9).
8. Explicit owner approval for any merge, push, migration or deployment. **PRODUCTION HOLD** remains until items 1–8 are complete.

## 7. Reproduce without Claude or VS Code

```powershell
git worktree add ..\ortho-integration integrate/search-v2-public-ui-governance; cd ..\ortho-integration; npm ci
npm run test:offline; npm run typecheck:scripts; npm run lint; npm run build
node scripts/tests/governance/run.mjs        # Docker, local postgres:17-alpine image, network none; docker stop the 3 labs it lists
npm run test:ui; npm run test:mobile-drawer; npx tsx scripts/tests/search-browser-qa.e2e.ts
npm run test:receipts; npm run test:actual-editor; npm run test:editor-followup; npm run test:editor-final-conditions
npm run test:final-ui; npm run test:local-browser-safety
node scripts/build-static-preview.mjs; node scripts/tests/static-preview.e2e.mjs; node scripts/tests/extended-public-ui.e2e.mjs
```

Red/green logs are in the session scratchpad under `phase2\`, `phase4\` and `final-conditions\`; `reports/` is gitignored. The scratchpad is `C:\Users\safad\AppData\Local\Temp\claude\7681f9dcf45cb92a\e6ebbd6e-13ae-431c-b657-44288985f295\scratchpad`, a temporary folder, so copy anything you need to keep.
