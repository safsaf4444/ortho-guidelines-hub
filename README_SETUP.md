# Change Detection + Approval Automation — setup guide

What this does, in one line: once a week, a robot checks every guideline link, opens a GitHub Issue
for anything that looks changed, and when you comment "approve" on that issue it updates the live
database itself. You never edit the database by hand for a routine update again.

## Files in this package, and where they go in your repo

```
scripts/detect-changes.ts        -> ortho-guidelines-hub/scripts/detect-changes.ts
scripts/approve-change.ts        -> ortho-guidelines-hub/scripts/approve-change.ts
scripts/blocked-sources.json     -> ortho-guidelines-hub/scripts/blocked-sources.json
.github/workflows/detect-changes.yml  -> ortho-guidelines-hub/.github/workflows/detect-changes.yml
.github/workflows/approve-change.yml  -> ortho-guidelines-hub/.github/workflows/approve-change.yml
supabase-migration-add-content-hash.sql -> run once in the Supabase SQL editor
```

## One-time setup (about 15 minutes)

1. **Run the migration.** Open Supabase -> SQL Editor -> paste and run
   `supabase-migration-add-content-hash.sql`. This adds one new column
   (`content_hashes`) to your existing `guidelines` table. Nothing else changes.

2. **Add repo secrets.** In your GitHub repo: Settings -> Secrets and variables -> Actions -> New
   repository secret. Add:
   - `SUPABASE_URL` (same value as `VITE_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY` (same one `upsert-verified.ts` already uses — never the anon key)

   You do NOT need to add a GitHub token — Actions provides one automatically.

3. **Turn on Issues** on the repo if they're currently off (Settings -> General -> Features -> Issues).

4. **Drop the files in** at the paths above, commit, push.

5. **Test it once manually** before waiting a week: go to the Actions tab -> "Detect guideline
   changes" -> "Run workflow" -> Run. Watch it complete, then check the Issues tab.

That's it — after this it runs on its own every Monday at 06:00 UTC (edit the `cron:` line in
`detect-changes.yml` to change the schedule).

## How the loop actually works

1. **Monday, automatically:** `detect-changes.yml` runs `scripts/detect-changes.ts`.
   - Pulls every guideline row from Supabase.
   - For every URL attached to that row (primary + fallback + version links), fetches the page
     and hashes the visible text.
   - Compares that hash to the one stored from last time.
     - **Same hash:** nothing happens, silently fine.
     - **Different hash:** opens a GitHub Issue titled `[Guideline update] <topic>` with the row
       ID, old vs new content preview, and the label `pending-guideline-update`.
     - **Can't be fetched at all** (401, 403, timeout, Cloudflare block) three runs in a row:
       the URL gets added to `blocked-sources.json` and is skipped by future automated runs —
       it needs a human to check it occasionally instead. This is the "keep a list of which
       ones, set aside" list you asked for — see below.

2. **You get notified** — GitHub already emails/notifies you (and anyone watching the repo) the
   moment an Issue is opened, no extra notification system needed.

3. **You review the issue.** Click through to the new URL, confirm it's a real content update
   and not, say, a redesign or an ad banner changing.

4. **You comment `approve`** on the issue (just that word, nothing else needed).
   - `approve-change.yml` fires, runs `scripts/approve-change.ts`.
   - It updates that row in Supabase: stores the new content hash, sets
     `link_verification_status = 'verified'`, sets `link_last_verified` to today, and appends a
     one-line note to `link_verification_notes` ("auto-verified via change detection, approved by
     <your GitHub username>, <date>").
   - The issue closes itself with a confirmation comment.
   - The live hub reflects the change immediately (or on next static-fallback rebuild, if you're
     relying on `guidelines-data.ts` rather than live Supabase reads).

   If instead the change looks wrong, comment `reject` — the script logs it as rejected and
   closes the issue without touching the database, so a bad detection can't accidentally go live.

## The "blocked sites" list

`scripts/blocked-sources.json` is seeded with the two sites already confirmed to block automated
access from your earlier verification work:

- **OTS (Orthopaedic Trauma Society)** — returns HTTP 401 to automated requests
- **BASK** — Cloudflare-blocked

Any other source that fails 3 checks running gets added here automatically, with the date and
reason. Nothing in this file is ever auto-removed — if a site starts working again you'll notice
it stops erroring and can manually delete its entry, or just leave it (it does no harm, it just
means that one URL is skipped and left for you to check by hand occasionally).

## Honest limitations, read before relying on this

- **This is weekly, not instant.** None of these society websites push live notifications, so
  "as soon as it updates" realistically means "within a week." You can tighten the schedule
  (daily, even) at the cost of more GitHub Actions minutes, but true real-time isn't possible
  without every source offering a webhook, which they don't.
- **A changed hash is a hint, not proof of a real guideline change.** Cookie banners, "last
  updated" timestamps embedded in the page, and layout tweaks can all trigger a false positive.
  This is exactly why there's a human-approval step — never wire this to auto-publish without
  someone looking, especially for anything NHS staff will read.
- **NICE is a special case worth doing properly.** NICE actually has a real syndication API
  (see https://www.nice.org.uk/reusing-our-content/nice-syndication-api) rather than requiring
  you to scrape their pages for changes. Since NICE is ~74 of your ~240 entries, applying for that
  API key (free, just needs a short form) and swapping NICE rows to use it instead of the generic
  scraper would make roughly a third of your dataset far more reliable. Not done in this first
  version — flagged as the next upgrade.
- **Field names may need a small tweak.** The script assumes your `versions` JSONB column holds
  an array of `{ label, url, date }` objects (matching what `upsert-verified.ts` writes, per your
  existing mapper). If `src/lib/guidelines-mapper.ts` uses different key names, open
  `scripts/detect-changes.ts` and adjust the one line marked `// ADJUST THIS` near the top.
