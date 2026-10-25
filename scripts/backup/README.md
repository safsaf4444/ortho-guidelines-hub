# Backup and restore check: schema `public`

A read-only logical backup of the Supabase database's `public` schema (definitions and data), and a check that it restores correctly into a **disposable local Supabase**.

It uses Docker's PostgreSQL 17 tools (`public.ecr.aws/supabase/postgres:17.11.0.004`, `pg_dump 17.11`). Nothing is installed on the host. This is the "Backups" step of `supabase/DEPLOYMENT-RUNBOOK.md` §3.

Run it only when the owner approves the backup step. Nothing here writes to the source database.

| File | Role |
|---|---|
| `Backup-Public.ps1` | Host wrapper: destination and encryption checks, password prompt, runs the container, writes `manifest.json` |
| `snapshot-dump.sh` | Runs inside the container: one exported snapshot for both the fingerprint and the dump |
| `fingerprint.sql` | The comparison basis, run on both the source snapshot and the restored copy |
| `restore-verify.ts` | Restores into the disposable local Supabase, compares the two fingerprints, then removes the database |

## Why one snapshot

Separate schema and data dumps, or "before" counts run as their own queries, each see a different moment. So `snapshot-dump.sh` works like this:

1. One session opens `BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY` and calls `pg_export_snapshot()`.
2. In **that same transaction** it writes `source-fingerprint.txt`, the output of `fingerprint.sql`:
   - each table's row count and an md5 over every row;
   - columns, constraints, indexes, triggers and functions;
   - policies, RLS flags, comments;
   - table, function and schema privileges, and default privileges.
3. While that transaction stays open, `pg_dump --snapshot=<id> --schema=public --format=custom` writes `public.dump` from **exactly that state**.
4. The session rolls back.

The restore check compares the restored copy with `source-fingerprint.txt`, so both sides describe the same instant.

Rehearsed: a writer inserted rows throughout the backup. The live table moved from 35 to 209 rows during the dump; the snapshot held 170, and the restored copy matched it line for line.

## Before you start

1. **Approval** for the backup step (runbook §3).
2. **Docker Desktop running.** The image above is already present locally (pulled by the local test stack).
3. **Connection details**, which are not secrets: Dashboard → **Connect** → **Session pooler**.
   - host: `aws-…-eu-central-1.pooler.supabase.com`
   - port: `5432`
   - user: `postgres.xutjahmbyrvifcltpxxu`

   Use the session pooler, not the transaction pooler: the exported snapshot needs one session held open. The direct host is IPv6-only on the free plan.
4. **The database password.** You type it at the prompt. It is never put in a file, an argument, chat, or the repo.
   - If you don't know it, resetting it (Dashboard → Database → Settings) is a production change that needs its own approval.
5. **The destination**, outside the repo and outside OneDrive. Desktop and Documents are redirected into OneDrive on this machine, so use e.g. `C:\Users\safad\OrthoBackups`. The script refuses a path inside the repo or any OneDrive folder.
6. **Encryption of the destination drive.** This is not verified yet: checking BitLocker or Device encryption needs administrator rights, and this is Windows 11 Home.
   - Either open **PowerShell as Administrator** and run `manage-bde -status C:`, expecting `Conversion Status: Fully Encrypted` and `Protection Status: Protection On`. Then run the backup from that elevated window: the script re-checks and records `verified`.
   - Or decide to accept an unverified drive and pass `-AcceptUnverifiedEncryption`. The manifest records `destinationEncryption: unverified`.

   The script refuses without one or the other. Nothing here claims encryption it has not verified.

## Run the backup (you, in your own PowerShell window)

```powershell
cd "C:\Users\safad\OneDrive\Desktop\Building Projects\NHS projects\Ortho guidelines hub"
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\backup\Backup-Public.ps1 `
  -PoolerHost '<session pooler host>' -DbUser 'postgres.xutjahmbyrvifcltpxxu' `
  -Destination 'C:\Users\safad\OrthoBackups'
# add -AcceptUnverifiedEncryption only if you have decided to (see above)
```

**Secret handling**
- The script prompts `Database password for … (not shown)`; type it there.
- It is held as a SecureString and copied into the environment variable `PGPASSWORD` only for the duration of `docker run -e PGPASSWORD`. Passing the variable by name keeps the value off every command line and out of PowerShell history.
- A `finally` block deletes the variable and zeroes the plain-text copy, even after a failure.
- While the container runs (seconds), `docker inspect` on this machine could show the value. The container is removed (`--rm`) when the dump ends.
- The connection is TLS (`sslmode=require`): encrypted, but the server certificate is not verified. That is a limitation. `-SslMode disable` is refused for a remote host, and `-Credential` (used only by the local test) is refused for a remote host.

**Output** (a new folder `public-<UTC timestamp>`, permissions limited to your user, files read-only):

| File | Contents |
|---|---|
| `public.dump` | custom-format dump of schema `public`: definitions, data, privileges, policies, default privileges |
| `public.toc.txt` | its table of contents (`pg_restore --list`) |
| `snapshot-id.txt` | the exported snapshot both were taken from |
| `source-fingerprint.txt` | the fingerprint of that same snapshot |
| `manifest.json` | source host and user (no password), tool versions, scope, encryption status, SHA-256 of every file |

If anything fails, the folder gets a `FAILED.txt` and no manifest, and it is not a backup. Rehearsed: a broken fingerprint query stopped the run before the dump.

**Record** in the deployment record: the folder name, the `manifest.json` SHA-256 values, and the `rows.*` lines of `source-fingerprint.txt`. Expected now: `guidelines` 231, `guideline_changelog` 0, `staged_guidelines` 0, `guidelines_backup_20260713` 171. Re-check rather than assume.

## Verify the backup restores (local only)

```powershell
npx tsx scripts/backup/restore-verify.ts "C:\Users\safad\OrthoBackups\public-<timestamp>"
```

1. Checks every file against `manifest.json`. A mismatch refuses before anything is restored (rehearsed with a tampered dump).
2. Starts or resets the **disposable** local Supabase (`ortho-disc-test`, `127.0.0.1:54321`).
   - Not plain `postgres`: the dump's grants and policies name `anon`, `authenticated` and `service_role`, its functions call `auth.uid()`, and it restores default privileges for `supabase_admin`.
   - The script reads every role and schema the dump needs **from the dump** and refuses if the target lacks one.
3. Restores **as `supabase_admin`**, in a single transaction that stops on the first error, **into the target's existing `public` schema**. Only the dump's `CREATE SCHEMA public` entry is skipped. Before restoring, the target's own default privileges in `public` are cleared.

   Each of these was needed in the rehearsal:
   - restoring as `postgres` is not allowed to recreate the `supabase_admin` default privileges;
   - re-creating the schema loses its built-in `USAGE` for `PUBLIC`;
   - keeping the target's defaults silently added `anon` EXECUTE on the security-definer functions.

   The dump then reinstates production's own default privileges.
4. Runs `fingerprint.sql` on the restored copy (read-only) and compares it with `source-fingerprint.txt`, line for line. Only `info.` lines, such as server version and time, are excluded. **MATCH** means every count, row md5, structure, policy and privilege line is equal (rehearsed: 50 of 50).
5. Removes the disposable database (`supabase stop --no-backup`) and confirms nothing is left. Re-checks the backup files' hashes, so they are untouched. Writes `restore-check-<UTC>.json` into the backup folder.

`--keep-stack` leaves the restored database running for inspection. Clean up afterwards with `npx tsx scripts/tests/local-supabase/run.ts stop`.

The whole procedure is rehearsed locally by `npx tsx scripts/tests/local-supabase/run.ts backup --stop` (Windows; about 10 minutes; production-shaped local source, no production contact).

## Cleanup

- **Keep** the backup folder. Nothing in this procedure deletes it.
- `restore-verify.ts` removes only the disposable local database. If a run was interrupted, run `npx tsx scripts/tests/local-supabase/run.ts stop`.
- Retention and off-machine copies are the owner's decision. Copy only to encrypted storage, never into the repo or OneDrive.

## Limitations

- **Editor-account recovery is not covered.** `auth.users` and `auth.identities` are deliberately not exported in this pass. After a disaster, restoring `public` brings back the catalogue, changelog, queue, policies and functions, but not the editor's login.
  - The editor account would have to be re-created in Supabase Auth, as a new user with a **new UUID**.
  - `public.is_editor()` would then need its allowlist updated to that UUID. That is a reviewed database change, not part of the restore. Until then, no one can edit.
- **Scope is `public` only.** Roles, extensions and other schemas (`auth`, `storage`, `vault`, …) are not included. Production uses no extension objects from `public`; the restore target must be a Supabase database.
- **Free plan:** there are no platform backups or point-in-time recovery to fall back on. This logical dump is the backup.
- **Not yet run against production.** The pooler's support for an exported snapshot across two sessions (session mode) is expected but unproven. If it fails, the run stops with `FAILED.txt` and writes no backup.
