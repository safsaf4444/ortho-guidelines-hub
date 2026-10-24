# Local Supabase tests (review queue)

These tests run the review-queue migrations, scripts and dashboard against a **disposable local Supabase**. They never contact production:

- The stack is the CLI project in `./supabase` (project id `ortho-disc-test`; API `http://127.0.0.1:54321`).
- Keys come from `supabase status` for that project. These are the CLI's local demo keys. Nothing reads `.env` or `.env.local`.
- Every suite refuses to run unless its URL is a loopback address. The browser test also aborts every non-loopback request, and fails if any `*.supabase.co` request is attempted.
- All data is synthetic. The catalogue is seeded from `src/data/guidelines-data.ts`, and `public.is_editor()` is redefined **in the local database only** to allow local test accounts.

| Suite | What it covers | Schema |
|---|---|---|
| `integration` | `scripts/tests/integration/discovery-queue.local.test.ts`: keys, permissions, staging, evidence validation, holds, approval, history, the real sync scripts | 20261024 |
| `integration-25` | The same suite, plus section 9 (rejecting open rows) | 20261024 + 20261025 |
| `e2e` | `e2e.ts`: the real app (Vite) in Chromium. Covers queue actions, holds, draft privacy, and "feature unavailable" states | Old schema, then 20261024, then 20261025 |
| `adapter` | `discovery-adapter.ts`: the **actual** `scripts/stage-discovery.ts` and `scripts/stage-candidates.ts`, run as an operator would. Covers dry run (a decoy server proves zero requests), write-mode refusals, verbatim evidence, retry, re-stamped `generatedAt`, a new sweep, editor decisions left unchanged, partial-failure retry, competing producers, and ownership on both paths | 20261024 + 20261025 |
| `rehearsal` | `rehearsal.ts`: `supabase/DEPLOYMENT-RUNBOOK.md` step by step, run with the **old** scripts (from `REHEARSAL_OLD_REF`, default `f2b71d9`) and with the new ones. Covers the preflight, the history-gap query and compatibility at every step | Old schema, then upgraded |

## Prerequisites

- Node and `npm ci`.
  - `playwright` is a devDependency pinned to exactly **1.55.0** (no caret).
  - It has no install scripts, so `npm ci`, including in CI and in `deploy.yml`, downloads no browser.
  - Keep the pin exact. A version change also changes the Chromium build that `npx playwright install chromium` fetches.
- Docker Desktop or a Docker daemon, running.
- Chromium for Playwright, once per machine: `npx playwright install chromium`.
  - It installs into Playwright's default cache. Set `PLAYWRIGHT_BROWSERS_PATH` to put it elsewhere; the runner passes that variable through.
- Git, for the rehearsal's copy of the old scripts.

The pinned Supabase CLI (`supabase@2.119.0`) is fetched by `npx` on first use.

## Run

From the repository root:

```sh
npx tsx scripts/tests/local-supabase/run.ts all --stop
```

- Instead of `all`, name suites: `integration`, `integration-25`, `e2e`, `rehearsal`, `adapter`.
- Each suite starts the stack if it is not running, or resets its database if it is. Each then prepares the schema it needs.
- Output is printed and saved to `scripts/tests/local-supabase/.work/logs/<suite>.log`.
- The exit code is 1 if any suite fails.
- The first start pulls Docker images and takes several minutes.

## Clean up

```sh
npx tsx scripts/tests/local-supabase/run.ts stop
```

- This stops the stack and deletes its data (`supabase stop --no-backup`). It then reports how many containers, volumes and networks are left; all three should be 0.
- `--stop` after the suites does the same.
- `.work/` is gitignored. Delete it whenever you like.
- Quit Docker if you started it only for this.

## Notes

- The rehearsal extracts `scripts/stage-candidates.ts` and `scripts/lib/ingestion.ts` from `REHEARSAL_OLD_REF` with `git show` into `.work/rehearsal/old`.
- Old and new scripts both run from an empty `.work/rehearsal/run` directory. Their environment holds only `PATH`, temp variables, the loopback `SUPABASE_URL` and the local service key.
- The e2e serves the app on `127.0.0.1:5199`. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set to the local stack; process env overrides `.env.local` in Vite.
- On failure the e2e saves a screenshot to `.work/e2e-failure.png`.
