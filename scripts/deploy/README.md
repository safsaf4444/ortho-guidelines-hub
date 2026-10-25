# Applying the review-queue migrations

Applies `supabase/migrations/20261024_discovery_review_queue.sql`, then `20261025_reject_open_candidate.sql`, to the production database. Each is applied as the **exact file** with psql from Docker's PostgreSQL 17 image, and each step sits behind a **read-only gate**.

Run it only when the owner has approved the migration step. The script is a **dry run** unless `-Apply` is given.

| File | Role |
|---|---|
| `Apply-Migrations-Psql.ps1` | Host wrapper: checks the target, the file hashes and the record folder; prompts for the password; starts the container; writes `record.json` |
| `apply-sequence.sh` | Runs inside the container: gate 0 → 20261024 → gate 1 → 20261025 → gate 2. Stops at the first failure and establishes the state read-only. With `-Inspect`, it runs only the gates |
| `../../supabase/POST-MIGRATION-GATE-READONLY.sql` | The gate. Stage 0 checks the pre-upgrade state, stage 1 the exact intermediate state, stage 2 the final state. Every stage also checks that the catalogue, changelog, queue size and editor count are unchanged |
| `apply-migrations.ts` | **On hold.** The Management API route; see below |

## Why psql and not the Management API

The Management API endpoint (`POST /v1/projects/{ref}/database/migrations`) does not document how it handles an SQL error inside a file's own `BEGIN … COMMIT`. That covers the OpenAPI spec, the docs, and the open-source MCP client, which only forwards `{name, query}` and treats a non-2xx response as failure.

That behaviour can't be tested safely here: there is no local Management API, and the owner did not approve any cloud or branch resources.

## What psql's error handling does and does not establish

psql's documented behaviour (PostgreSQL 17, `app-psql`):
- **ON_ERROR_STOP:** "processing will instead stop immediately … psql will exit, returning error code 3".
- **Exit Status:** "2 if the connection to the server went bad".

What that means for the outcome:
- **A statement that fails before COMMIT** aborts the transaction, and the server never commits it.
- **A lost connection, a cancel (Ctrl+C) or a killed container does NOT prove a rollback.** If COMMIT had already been sent, the server may have committed it, and only the reply was lost.

So the outcome is **never inferred from an exit code**:
- After any non-zero exit, the gates establish the **actual** state read-only.
- If the run itself was interrupted, run `-Inspect` (below) before doing anything else.
- Nothing is ever retried automatically.

## Timeouts (transaction-local)

Each migration starts with:

```sql
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
```

`SET LOCAL` lasts only until that transaction's COMMIT or ROLLBACK, so nothing persists on the pooled server connection. The rehearsal checks this: a new session shows both settings back at `0`.

- **`lock_timeout = 5s`**
  - **What it protects against:** 20261024 needs `ACCESS EXCLUSIVE` on `staged_guidelines`. While it waits for that lock, every later reader of the table queues behind it, including the editor dashboard.
  - **What it does:** five seconds is long enough to ride out an ordinary short read, and short enough that a blocked migration fails, and rolls back, instead of stalling the app.
  - **Rehearsed:** a held lock made 20261024 fail at line 564 (`canceling statement due to lock timeout`). The whole run ended in 7.3 s, and gate 0 verified that nothing had committed.
- **`statement_timeout = 60s`**
  - Each statement in these files is DDL or a small read on tables with 0 to 231 rows, so it takes well under a second.
  - Sixty seconds bounds a stall without failing a slow but healthy run. It applies per statement, not to the whole file.

## Verified behaviour (local rehearsal, 44/44)

Run: `npx tsx scripts/tests/local-supabase/run.ts migrate --stop`. It uses the same script, image, files and gates as production, against a production-shaped disposable stack: 231 guidelines, a changelog, and one open queue row.

| Case | Exit | Verified |
|---|---|---|
| Success | 0 | gates 0/1/2 pass; data unchanged; steps in order; `-Inspect` then reports 42 |
| 20261024 fails at its **last GRANT** (event trigger, local only) | 11 | schema fingerprint identical to before; 20261025 never sent |
| A lock 20261024 needs is held by another session | 11 | lock timeout after 5 s; schema identical; the timeouts did not persist |
| 20261025 fails at its last GRANT | 21 | schema identical to a clean 20261024-only database; `-Inspect` reports 41 |
| Already upgraded / wrong expected values | 10 | nothing sent; schema unchanged |
| `-Inspect` on the pre-upgrade database | 40 | read-only; nothing sent |
| One-byte file change, wrong user, remote host with a credential | 2 | refused before any connection |
| Drift after success (anon EXECUTE on approve; one catalogue row changed) | gate exit 3 | G16 / G30 fail |

Not rehearsed: a connection lost exactly at COMMIT. The ordering can't be reproduced deterministically. Exit codes 13/23 and 19/29 cover the case, and `-Inspect` settles it.

## Exit codes

| Exit | Meaning |
|---|---|
| 0 | both migrations applied; all three gates passed |
| 2 | the host wrapper refused before sending anything (target, hashes, record folder, Docker) |
| 10 | refused before sending anything (hashes inside the container, or gate 0) |
| 11 | 20261024 failed; gate 0 shows that **nothing** of it is in the database |
| 12 | 20261024 committed, but gate 1 failed; 20261025 not sent |
| 13 | 20261024 reported an error but **is committed** (gate 1 passes) |
| 19 | 20261024 errored; state unknown. Inspect read-only |
| 21 | 20261025 failed; gate 1 shows 20261024 committed and **nothing** of 20261025 |
| 22 | 20261025 committed, but gate 2 failed |
| 23 | 20261025 reported an error but **is committed** (gate 2 passes) |
| 29 | 20261025 errored; state unknown. Inspect read-only |
| 40 / 41 / 42 | `-Inspect`: pre-upgrade / 20261024 only / final state |
| 49 | `-Inspect`: no gate passes; state unknown |

Every outcome stops. There is no retry and no repair.

## Run

Dry run first: no Docker, no network, no password. The values are those of the 2026-10-25 preflight, re-checked read-only at 12:24 UTC.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\Apply-Migrations-Psql.ps1 -PoolerHost aws-0-eu-central-1.pooler.supabase.com -DbUser postgres.xutjahmbyrvifcltpxxu -RecordDir C:\Users\safad\OrthoBackups -ExpectGuidelines '231:460c6075209bfb1ed989032dac7e8950' -ExpectChangelog '0:d41d8cd98f00b204e9800998ecf8427e' -ExpectStaged 0 -ExpectEditors 1
```

- **To apply:** add `-Apply -ConfirmProject xutjahmbyrvifcltpxxu`, only with the owner's approval.
- **After any interrupted or uncertain run:** add `-Inspect -ConfirmProject xutjahmbyrvifcltpxxu` instead. It is read-only and sends no migration.
- **Password:** prompted for without echo, the same way as in `scripts/backup/Backup-Public.ps1`.
- **Connection:** session pooler only (port 5432), TLS (`sslmode=require`). The server certificate is not verified.
- **Record:** a new folder in the record folder, `migrate-<UTC>` (or `inspect-<UTC>`). It holds the copied SQL (read-only), `log/transcript.log`, `log/steps.tsv` and `record.json`, and no credentials.

## Migration history is NOT updated

Applying with this route does **not** write `supabase_migrations.schema_migrations`. The Dashboard's migration list and `list_migrations` will still show only the six migrations up to 20260910, the same as for 20261011/20261012, which were also applied outside the history.

Recording these two, for example with the documented `PUT /v1/projects/{ref}/database/migrations` ("upsert without applying"), is a separate decision. It needs a scoped token and its own approval.

## Other notes

- **The `notify pgrst, 'reload schema'` in 20261025 runs after its COMMIT.** If only that statement failed, the run would report exit 23 (committed, gate 2 passes). PostgREST would then need a schema reload.
- **Hold the freeze anyway:** no editor sessions and no staging runs. The timeouts make a collision fail cleanly; they do not make it impossible.
