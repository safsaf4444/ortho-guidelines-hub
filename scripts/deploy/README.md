# Applying the review-queue migrations

Applies `supabase/migrations/20261024_discovery_review_queue.sql`, then `20261025_reject_open_candidate.sql`, to the production database. Each is applied as the **exact file** with psql from Docker's PostgreSQL 17 image, and each step sits behind a **read-only gate**.

Run it only when the owner has approved the migration step. The script is a **dry run** unless `-Apply` is given.

| File | Role |
|---|---|
| `Apply-Migrations-Psql.ps1` | Host wrapper: checks the target, the file hashes and the record folder; prompts for the password; starts the container; writes `record.json` |
| `apply-sequence.sh` | Runs inside the container: gate 0 → 20261024 → gate 1 → 20261025 → gate 2. Stops at the first failure and classifies the state |
| `../../supabase/POST-MIGRATION-GATE-READONLY.sql` | The gate. Stage 0 checks the pre-upgrade state, stage 1 the exact intermediate state, stage 2 the final state. Every stage also checks that the catalogue, changelog, queue size and editor count are unchanged |
| `apply-migrations.ts` | **On hold.** The Management API route; see below |

## Why psql and not the Management API

The Management API endpoint (`POST /v1/projects/{ref}/database/migrations`) does not document how it handles an SQL error inside a file's own `BEGIN … COMMIT`. That covers the OpenAPI spec, the docs, and the open-source MCP client, which only forwards `{name, query}` and treats a non-2xx response as failure.

That behaviour can't be tested safely here: there is no local Management API, and the owner did not approve any cloud or branch resources.

psql's behaviour is documented (PostgreSQL 17, `app-psql`):
- **ON_ERROR_STOP:** "processing will instead stop immediately … psql will exit, returning error code 3".
- **Exit Status:** "2 if the connection to the server went bad". In either case, the open transaction is never committed.

That is not taken on trust, though. After any non-zero exit, the gates classify the state read-only.

## Verified behaviour (local rehearsal, 34/34)

Run: `npx tsx scripts/tests/local-supabase/run.ts migrate --stop`. It uses the same script, image, files and gates as production, against a production-shaped disposable stack: 231 guidelines, a changelog, and one open queue row.

| Case | Exit | Verified |
|---|---|---|
| Success | 0 | gates 0/1/2 pass; data unchanged; steps in order |
| 20261024 fails at its **last GRANT** (event trigger, local only) | 11 | schema fingerprint identical to before; 20261025 never sent |
| 20261025 fails at its last GRANT | 21 | schema identical to a clean 20261024-only database |
| Already upgraded / wrong expected values | 10 | nothing sent; schema unchanged |
| One-byte file change, wrong user, remote host with a credential | 2 | refused before any connection |
| Drift after success (anon EXECUTE on approve; one catalogue row changed) | gate exit 3 | G16 / G30 fail |

## Exit codes

| Exit | Meaning |
|---|---|
| 0 | both migrations applied; all three gates passed |
| 2 | the host wrapper refused before sending anything (target, hashes, record folder, Docker) |
| 10 | refused before sending anything (hashes inside the container, or gate 0) |
| 11 | 20261024 failed; gate 0 verifies that **nothing** committed |
| 12 | 20261024 committed, but gate 1 failed; 20261025 not sent |
| 13 | 20261024 reported an error but **is committed** (gate 1 passes) |
| 19 | 20261024 errored; state unknown. Inspect read-only |
| 21 | 20261025 failed; gate 1 verifies that 20261024 committed and **nothing** of 20261025 |
| 22 | 20261025 committed, but gate 2 failed |
| 23 | 20261025 reported an error but **is committed** (gate 2 passes) |
| 29 | 20261025 errored; state unknown. Inspect read-only |

Every outcome stops. There is no retry and no repair.

## Run

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\deploy\Apply-Migrations-Psql.ps1 `
  -PoolerHost aws-0-eu-central-1.pooler.supabase.com -DbUser postgres.xutjahmbyrvifcltpxxu `
  -RecordDir C:\Users\safad\OrthoBackups `
  -ExpectGuidelines '<count:md5 from P10>' -ExpectChangelog '<count:md5 from P10>' `
  -ExpectStaged <P5 total> -ExpectEditors <P9>
# review the dry run, then add:  -Apply -ConfirmProject xutjahmbyrvifcltpxxu
```

- **Password:** prompted for without echo, the same way as in `scripts/backup/Backup-Public.ps1`.
- **Connection:** session pooler only (port 5432), TLS (`sslmode=require`). The server certificate is not verified.
- **Record:** a new folder, `migrate-<UTC>`, in the record folder. It holds the copied SQL (read-only), `log/transcript.log`, `log/steps.tsv` and `record.json`, and no credentials.

## Not done by this route

- **Migration history is not written.** `supabase_migrations.schema_migrations` will not list these two migrations. That matches 20261011/20261012, which were also applied outside the history. Recording them, for example with the documented `PUT /v1/projects/{ref}/database/migrations` ("upsert without applying"), is a separate decision.
- **The `notify pgrst, 'reload schema'` in 20261025 runs after its COMMIT.** If only that statement failed, the run would report exit 23 (committed, gate 2 passes). PostgREST would then need a schema reload.
- **No lock timeout is set.** A session-level `SET` could persist on a pooled connection. Hold the freeze: no editor sessions and no staging runs. If psql waits, Ctrl+C cancels the statement, and the transaction rolls back.
