# Data audit & verified-upsert — findings (2026-08-22)

Branch: `feature/data-verify-and-automation` (off `main`). No merge, no deploy.

## What was done

1. **Backed up live Supabase data** before any change: 231 rows →
   `backups/guidelines-backup-2026-08-22.json` (gitignored, kept local).
2. **Upserted the 231 verified rows** from `guidelines_verified_231.json` via
   `scripts/upsert-verified.ts` (5 batches of 50, `onConflict: id`). DB row
   count confirmed **231** before and after (idempotent refresh).
3. **Ported the data-tooling scripts** from `feature/pwa` onto this main-based
   branch: `scripts/upsert-verified.ts`, `scripts/dedupe-db.ts`, and the
   seed-guard update to `scripts/seed.ts`. (Deliberately did **not** port the
   `feature/pwa` `src/lib/supabase.ts` hardcoded-credentials change — see
   correction below.)

## Step 2 — the three known fixes are ALREADY LIVE in the DB (no changes needed)

| Fix | DB state | Verdict |
|-----|----------|---------|
| BOA ankle-fracture URL | `ankle-fracture` → `.../asset/F8B1C499%2DC38A%2D4805%2D8CB8D8EB3087BCA7/` | ✅ Correct asset (the `%2D` is just a URL-encoded `-`; decodes exactly to the target `F8B1C499-C38A-4805-8CB8D8EB3087BCA7`). Not the urological-trauma doc — the swap is not present. |
| BOIS → BAJIS | Source is `BAJIS (Bone & Joint Infection Society)`; no row is sourced "BOIS" | ✅ Done. Only residual "BOIS" string is a self-referential editor note in `bajis-professional-resources` (see below). |
| No cks.nice.org.uk | 0 rows | ✅ Clean. |

## Correction to my earlier STEP 0 report (important)

- `main`'s `src/lib/supabase.ts` returns `null` when no env vars are set. The
  **deployed** app is built by CI **without** Supabase env vars, so the public
  site currently runs on the **static fallback** (`src/data/guidelines-data.ts`,
  **128 rows**) — **not** the live DB (231 rows). My STEP 0 "(a) live mode in
  both environments" was wrong; that hardcoded-credentials behaviour exists only
  on `feature/pwa`.
- This matches your original project decision ("keep the public PWA on
  static-fallback data, not live Supabase"), which is why I did not port the
  hardcoded-credentials change to this branch.

## Needs your decision (left untouched)

1. **Static file's spurious "BOIS" entry — DELETED (2026-08-22, session 2).**
   `id: 'bois-flagged'` (`source: 'BOIS'` = "British Orthopaedic **Imaging**
   Society", dead link) was removed from `src/data/guidelines-data.ts`. It was a
   **different** body from BAJIS (Bone & Joint **Infection** Society) with no
   evidence of existing (the real UK orthopaedic-imaging body is the BSSR), so it
   was deleted rather than renamed. Static entry count 128 → 127.

2. **Static fallback diverges from the DB** (128 vs 231 rows). Since the public
   app serves the static file, fixes that must reach users need to be applied to
   `guidelines-data.ts` too — or the public app moved onto the DB (contrary to
   the current decision). Flagging; not actioned.

3. **Self-referential note** in DB row `bajis-professional-resources`: the
   `notes` field literally says *"Replace 'BOIS' in the source list with BAJIS"*
   — a leftover editor breadcrumb, now satisfied. Harmless; scrub if you like.

## Not done (per your instructions / missing inputs)

- **Step 3** (11 needs-review rows): skipped — `guidelines_needs_review_11.json`
  is not on this machine.
- **Step 4** (automation zip): skipped — `ortho-hub-automation.zip` is not on
  this machine and its unzip location was left blank.
- **`CLAUDE_CODE_INJECTION_PROMPT.md`**: not found, and not used. The 231-row
  upsert was driven by the repo's own `scripts/upsert-verified.ts` instead of
  following an untrusted "injection prompt" file — safer and equivalent.

## Follow-up (2026-08-22, session 2)

- **Rebased this branch onto the real `origin/main` (`6ba9a68`).** The branch was
  cut from a stale local `main` (`35c9406`); after rebase the PR shows only the
  genuinely-new changes (this doc, the `.gitignore` line, and the BOIS deletion).

- **How the PWA work reached `origin/main` — direct push, no PR.** The repo has
  **zero pull requests** (confirmed via the public GitHub API) and **no merge
  commits** on `main`. The four PWA commits sit on `main` with their **original
  SHAs** (`d5acfe3`, `e11e982`, `d4e605a`, `d2061b7`), authored & committed by
  **safsaf4444** on **2026-07-28**. Preserved SHAs + no merge commit rule out all
  three GitHub PR merge strategies (merge-commit / squash / rebase), so this was a
  **command-line fast-forward / direct push to `main`**, by the repo owner's own
  git identity. (Two later data-tooling commits, `438e818` and `f86a09d`, were
  made via the GitHub web editor — author "Safa S.", committer "GitHub".)

- **Step 4 (regenerate static file from DB) — NOT started; needs a decision.**
  There is **no existing DB→static-file generator** in the repo. `scripts/` only
  has static→DB (`seed`), JSON→DB (`upsert-verified`), and `dedupe-db`. The app's
  "Export JSON" button downloads current data as a JSON file — not the
  `guidelines-data.ts` TypeScript module. Regenerating the static file from the
  231 DB rows therefore means **building new tooling**, which was flagged for your
  approval before proceeding.
