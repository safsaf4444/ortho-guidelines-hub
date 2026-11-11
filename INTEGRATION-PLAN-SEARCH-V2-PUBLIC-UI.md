# Integration plan: Search V2 + public UI + governance

12 November 2026. **This plan was written and committed before any branch content was combined.** Local only. PRODUCTION HOLD.

## 1. Ancestry (verified with `git merge-base`)

```
caf34be (origin/main, last fetched)
├── e76c839 → bcba834 → 1f2f419 → 2f60bd8  Search V2 static release candidate (fix/final-qa-release-candidate)
│     └── d905a4e → be49dd4 → daba18f → dc07256 → 962fca4 → 2d93be4 → 334c7f6   governance (fix/governance-final-review-conditions)
└── 139c745 → fd2349e → 9624389 → 07337cd → 336b08a   responsive public UI (fix/public-ui-responsive, Codex)
                                              └── fc1b44a   mobile drawer focus fix (fix/public-ui-drawer-focus)
```

| Pair | Merge base | Meaning |
|---|---|---|
| `336b08a`, `2f60bd8` | `caf34be` | Independent lines since `caf34be` |
| `336b08a`, `962fca4`/`334c7f6` | `caf34be` | Same |
| `2f60bd8`, `962fca4` | `2f60bd8` | **Governance already contains Search V2** |

**Integration base: `334c7f6`** (Search V2 + final governance). It is the only candidate that contains both Search V2 and the reviewed governance work. Starting from `336b08a` would replace Search V2 with the older substring filter, which is not permitted.

## 2. What each line contributes

| Area | Search V2 + governance (`334c7f6`) | Responsive UI (`336b08a` + `fc1b44a`) |
|---|---|---|
| Search | `src/lib/search/*` (engine, normalise, terminology, legacy, app-adapter), via `rankSearchGroups`. Held-out, benchmark and QA suites | `App.tsx` substring filter (`topic/summary/source.toLowerCase().includes(q)`). **Must not be imported** |
| Catalogue data | `src/data/guidelines-data.ts` blob `ebcbd09f6a…` | Same blob. **231 guidelines identical** |
| Supabase client | `src/lib/supabase-config.ts`: explicit configuration only; remote refused in local mode | `src/lib/supabase.ts` falls back to the **production project URL** when unconfigured. **Must not be imported** |
| Governance and editor | Proposal SQL, receipts, staged publication, review inbox, freshness view | Older editor without governance. **Must not be imported** |
| Search field | `<label>` + `type="search"` (role `searchbox`), live result count, Clear filters | `aria-label` on `type="text"` (role `textbox`) |
| Drawer | Inert while closed; focus in on open; Escape; focus restored on every close | Same, plus (fc1b44a) **inert background + Tab trap while open** |
| Grouping toggle | `hidden md:flex` (unavailable below md) | Visible at all widths |
| Toolbar wrap, filter label, `aria-pressed`, section buttons, focus outline | Present | Present (equivalent) |
| Empty state | Live result-count status + Clear filters | "No results" status + Clear filters button |
| Card | Native `<button>` title with overlay | `div role=button` with a key guard |
| Reading CSS | Global `:focus-visible` outline | `.public-browse` with 44px/16px inputs, `overflow-wrap:anywhere` and darker small text. Its blue focus outline duplicates Search V2's |
| Tests | `public-ui.e2e.ts` (overflow 320–1440, drawer basics), `final-ui`, editor suites, governance DB gate, offline | `public-ui.mjs` (needs an external server and Edge; selects `textbox` and `[role=button]`, so incompatible with Search V2 markup), `mobile-drawer.e2e.mjs` |
| Non-UI lineage (`139c745..07337cd`) | URL-key v4, deploy procedure and BSSH retrieval already present in a consolidated form. Several files differ in detail (deploy scripts, `ingestion.ts`, `sync-providers.ts`, rollback SQL) | Original commits |

## 3. Conflict matrix and decisions

| # | Item | Decision |
|---|---|---|
| C1 | Search implementation | **Keep Search V2.** Port no search code |
| C2 | `supabase.ts` production fallback | **Keep Search V2's explicit-config client** (a safety regression otherwise) |
| C3 | Drawer Tab escape while open (review finding) | **Port the fc1b44a behaviour** onto Search V2's drawer effect (inert background + Tab trap), after a red run on `334c7f6` |
| C4 | Grouping toggle on mobile | **Port** (`hidden md:flex` → `flex`). Overflow is checked by Search V2's 320–1440px suite |
| C5 | `main` `min-w-0` and `.public-browse` reading CSS (44px/16px inputs, overflow-wrap, small-text contrast) | **Port**, scoped to browse views. **Do not port** the duplicate blue `:focus-visible` rule; Search V2's indicator is tested |
| C6 | Empty state, search label, filter label, aria-pressed, toolbar wrap, section buttons | **Already equivalent** in Search V2; keep Search V2's |
| C7 | Card markup and key guard | **Keep Search V2's native button**; the guard is not applicable |
| C8 | `public-ui.mjs` | **Not run as-is** (selector incompatibility). Its requirements are covered by `public-ui.e2e.ts` plus the ported `mobile-drawer.e2e.mjs`, adapted to Search V2 markup |
| C9 | Non-UI lineage differences (URL-key v4 deploy scripts, `ingestion.ts`, `sync-providers.ts`, rollback SQL) | **Out of scope.** Needs a separate reconciliation by the owner. Nothing from `139c745..07337cd` is imported. The primary checkout also has uncommitted URL-key v4 edits, left untouched |
| C10 | Draft-owner source test on the 336b08a line fails under CRLF checkout | Not imported; Search V2's version is used |

## 4. Execution steps

1. This plan is the first commit on `integrate/search-v2-public-ui-governance`, based on `334c7f6`.
2. Red: copy `mobile-drawer.e2e.mjs` (adapted to Search V2 markup) and run it on unchanged `334c7f6`.
3. Port C3–C5 by hand into `src/App.tsx` and `src/index.css`.
4. Green, and every gate: offline (including search held-out, QA and benchmark); typecheck, lint, build; public UI; final UI; editor suites; local browser safety; backup safety; DB governance gate; static preview from the clean commit; preview ZIP hash.
5. Commit locally. No merge into any original branch, no push, no deploy.
