#!/usr/bin/env bash
# ============================================================================
# scripts/backup/snapshot-dump.sh: runs INSIDE a PostgreSQL 17 container,
# started by Backup-Public.ps1. Never run it on the host.
#
# ONE consistent snapshot for everything it writes:
#   1. Session A opens a REPEATABLE READ, READ ONLY transaction and exports
#      its snapshot (pg_export_snapshot).
#   2. In that SAME transaction it writes source-fingerprint.txt
#      (fingerprint.sql): row counts and md5s, structure, policies, privileges.
#   3. While A stays open, pg_dump --snapshot=<that id> dumps schema `public`
#      (definitions AND data) into one custom-format file, from exactly the
#      state the fingerprint describes.
#   4. A rolls back. Nothing is written to the database at any point.
#
# Connection: libpq environment only (PGHOST PGPORT PGUSER PGDATABASE
# PGSSLMODE PGAPPNAME). The password arrives as PGPASSWORD, passed to
# `docker run -e PGPASSWORD` by NAME, so it is never on a command line.
# Output: /backup (a fresh empty host directory). Procedure files: /procedure.
# ============================================================================
set -euo pipefail

OUT=/backup
PROC=/procedure
fail() { echo "[snapshot-dump] FAILED: $*" >&2; exit 1; }

[ -d "$OUT" ] || fail "$OUT is not mounted"
[ -z "$(ls -A "$OUT")" ] || fail "$OUT is not empty; a backup never overwrites another"
for v in PGHOST PGUSER PGDATABASE; do [ -n "${!v:-}" ] || fail "$v is not set"; done
[ -n "${PGPASSWORD:-}" ] || fail "PGPASSWORD is not set"
[ -f "$PROC/fingerprint.sql" ] || fail "$PROC/fingerprint.sql missing"

echo "[snapshot-dump] pg_dump: $(pg_dump --version)   target: ${PGUSER}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE} sslmode=${PGSSLMODE:-prefer}"

work=$(mktemp -d)
ctl="$work/ctl"
mkfifo "$ctl"
# Session A reads its commands from the FIFO, so it stays connected (and its
# transaction stays open) until this script writes "rollback" and closes it.
psql -X -q -At -v ON_ERROR_STOP=1 <"$ctl" >"$work/session.log" 2>&1 &
session=$!
exec 3>"$ctl"
cleanup() { exec 3>&- 2>/dev/null || true; kill "$session" 2>/dev/null || true; rm -rf "$work"; }
trap cleanup EXIT

cat >&3 <<SQL
begin transaction isolation level repeatable read, read only;
\o $work/snapshot-id
select pg_export_snapshot();
\o $OUT/source-fingerprint.txt
\i $PROC/fingerprint.sql
\o $work/ready
select 'ready';
\o
SQL

# Wait for the fingerprint to finish (or the session to die), at most 10 min.
for _ in $(seq 1 1200); do
  [ -s "$work/ready" ] && break
  kill -0 "$session" 2>/dev/null || { cat "$work/session.log" >&2; fail "session A ended before the snapshot was ready"; }
  sleep 0.5
done
[ -s "$work/ready" ] || fail "timed out waiting for the snapshot fingerprint"
snapshot=$(tr -d '[:space:]' <"$work/snapshot-id")
[ -n "$snapshot" ] || fail "no snapshot id"
grep -q '^info.read_only|on$' "$OUT/source-fingerprint.txt" || fail "session A was not read-only"
echo "$snapshot" >"$OUT/snapshot-id.txt"
echo "[snapshot-dump] snapshot $snapshot exported; fingerprint written ($(wc -l <"$OUT/source-fingerprint.txt") lines)"

# The dump, from the same snapshot. pg_dump's own transaction is read-only too.
pg_dump --snapshot="$snapshot" --schema=public --format=custom --no-password \
  --file="$OUT/public.dump" || fail "pg_dump failed (nothing usable was written)"
pg_restore --list "$OUT/public.dump" >"$OUT/public.toc.txt"

echo "rollback;" >&3
exec 3>&-
wait "$session" || { cat "$work/session.log" >&2; fail "session A did not end cleanly"; }
trap - EXIT
rm -rf "$work"
echo "[snapshot-dump] done: $(du -h "$OUT/public.dump" | cut -f1) dump, $(grep -c ' TABLE DATA ' "$OUT/public.toc.txt") table-data entries"
