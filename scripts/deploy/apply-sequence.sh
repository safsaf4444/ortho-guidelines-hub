#!/usr/bin/env bash
# ============================================================================
# scripts/deploy/apply-sequence.sh: runs INSIDE a PostgreSQL 17 container,
# started by Apply-Migrations-Psql.ps1. Never run it on the host.
#
# Applies the two review-queue migrations as EXACT files with psql, each
# behind a read-only gate (supabase/POST-MIGRATION-GATE-READONLY.sql):
#
#   gate 0  expected pre-upgrade state            fail → stop, nothing sent
#   M1      20261024 (psql -f, ON_ERROR_STOP=1)
#   gate 1  exact intermediate state               fail → stop, M2 NOT sent
#   M2      20261025 (psql -f, ON_ERROR_STOP=1)
#   gate 2  final state
#
# Error handling is psql's documented behaviour, not an API's: with
# ON_ERROR_STOP=1 psql stops at the first failing statement and exits 3
# (2 = connection lost, 1 = other fatal error). Each migration's statements sit
# between its own BEGIN and COMMIT, so stopping before COMMIT and closing the
# connection leaves nothing committed. That is not taken on trust: after any
# non-zero exit the state is CLASSIFIED read-only with the gates:
#   the "before" gate passes → the step verifiably committed nothing;
#   the "after"  gate passes → the step committed despite the error
#                               (e.g. the connection dropped after COMMIT);
#   neither                  → state unknown: stop and inspect.
# There is no retry and no repair: every failure stops the sequence.
#
# Migration history (supabase_migrations.schema_migrations) is NOT written.
#
# Inputs (environment only): PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE
# PGAPPNAME, PGPASSWORD (passed by NAME), SHA_M1 SHA_M2 SHA_GATE,
# EXPECT_GUIDELINES EXPECT_CHANGELOG EXPECT_STAGED EXPECT_EDITORS.
# Files: /sql (read-only copies made and hashed by the host script).
# Output: /record/transcript.log and /record/steps.tsv.
#
# Exit codes:
#   0   both applied, all three gates passed
#   10  refused before sending anything (hashes, inputs or gate 0)
#   11  M1 failed; gate 0 verifies NOTHING of it committed
#   12  M1 committed (exit 0) but gate 1 FAILED; M2 not sent
#   13  M1 errored but gate 1 passes: M1 IS committed; M2 not sent
#   19  M1 errored; neither gate passes: state UNKNOWN; M2 not sent
#   21  M2 failed; gate 1 verifies M1 committed and NOTHING of M2
#   22  M2 committed (exit 0) but gate 2 FAILED
#   23  M2 errored but gate 2 passes: M2 IS committed
#   29  M2 errored; neither gate passes: state UNKNOWN
# ============================================================================
set -uo pipefail

SQL=/sql
REC=/record
M1="$SQL/20261024_discovery_review_queue.sql"
M2="$SQL/20261025_reject_open_candidate.sql"
GATE="$SQL/POST-MIGRATION-GATE-READONLY.sql"

[ -d "$REC" ] || { echo "[apply] /record is not mounted" >&2; exit 10; }
step() { printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$REC/steps.tsv"; echo "[apply] $1: $2"; }
stop() { step "RESULT" "exit $1: $2"; exit "$1"; }

main() {
for v in PGHOST PGUSER PGDATABASE PGPASSWORD SHA_M1 SHA_M2 SHA_GATE EXPECT_GUIDELINES EXPECT_CHANGELOG EXPECT_STAGED EXPECT_EDITORS; do
  [ -n "${!v:-}" ] || stop 10 "$v is not set"
done
export PGCLIENTENCODING=UTF8   # the files are UTF-8; no client-side conversion

# The exact bytes, re-checked inside the container.
check_sha() { local got; got=$(sha256sum "$1" | cut -d' ' -f1); [ "$got" = "$2" ] || stop 10 "sha256 of $(basename "$1") is $got, expected $2"; step "sha256" "$(basename "$1") $got"; }
check_sha "$M1" "$SHA_M1"
check_sha "$M2" "$SHA_M2"
check_sha "$GATE" "$SHA_GATE"

echo "[apply] psql: $(psql --version)   target: ${PGUSER}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE} sslmode=${PGSSLMODE:-prefer}"

# gate <stage>: 0 = passed, otherwise psql's exit code.
gate() {
  psql -X -q -v ON_ERROR_STOP=1 -v stage="$1" \
       -v expect_guidelines="$EXPECT_GUIDELINES" -v expect_changelog="$EXPECT_CHANGELOG" \
       -v expect_staged="$EXPECT_STAGED" -v expect_editors="$EXPECT_EDITORS" \
       -f "$GATE"
}
# migrate <file>: the exact file, nothing added; stops at the first error.
migrate() {
  psql -X -v ON_ERROR_STOP=1 --echo-errors -f "$1"
}

gate 0; g=$?
[ $g -eq 0 ] || stop 10 "gate 0 (expected pre-upgrade state) did not pass (psql exit $g); NOTHING was sent"
step "gate0" "passed"

step "M1" "sending $(basename "$M1")"
migrate "$M1"; m=$?
if [ $m -ne 0 ]; then
  step "M1" "psql exit $m; classifying read-only"
  gate 0 && stop 11 "M1 FAILED (psql exit $m); gate 0 passes: NOTHING of M1 committed. M2 not sent."
  gate 1 && stop 13 "M1 errored (psql exit $m) but gate 1 passes: M1 IS COMMITTED. M2 not sent."
  stop 19 "M1 errored (psql exit $m) and neither gate 0 nor gate 1 passes: state UNKNOWN. M2 not sent. Inspect read-only."
fi
step "M1" "psql exit 0"

gate 1; g=$?
[ $g -eq 0 ] || stop 12 "M1 committed but gate 1 did NOT pass (psql exit $g). M2 NOT sent."
step "gate1" "passed"

step "M2" "sending $(basename "$M2")"
migrate "$M2"; m=$?
if [ $m -ne 0 ]; then
  step "M2" "psql exit $m; classifying read-only"
  gate 1 && stop 21 "M2 FAILED (psql exit $m); gate 1 passes: M1 committed, NOTHING of M2 committed."
  gate 2 && stop 23 "M2 errored (psql exit $m) but gate 2 passes: M2 IS COMMITTED."
  stop 29 "M2 errored (psql exit $m) and neither gate 1 nor gate 2 passes: state UNKNOWN. Inspect read-only."
fi
step "M2" "psql exit 0"

gate 2; g=$?
[ $g -eq 0 ] || stop 22 "M2 committed but gate 2 did NOT pass (psql exit $g)."
step "gate2" "passed"
stop 0 "both migrations applied; gates 0, 1 and 2 passed. Migration history NOT written."
}

# Everything is shown and saved; the pipeline's status is main's (stop's exit code).
main 2>&1 | tee -a "$REC/transcript.log"
exit "${PIPESTATUS[0]}"
