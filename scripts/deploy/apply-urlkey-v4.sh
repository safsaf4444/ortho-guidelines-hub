#!/usr/bin/env bash
# ============================================================================
# scripts/deploy/apply-urlkey-v4.sh: runs INSIDE a PostgreSQL 17 container,
# started by Apply-UrlKeyV4-Psql.ps1. Never run it on the host.
#
# url-key v4 only (supabase/migrations/20261104_url_key_unreserved_decoding.sql),
# each step behind supabase/URL-KEY-V4-GATE-READONLY.sql. MODE:
#
#   apply     gate 0 (v3 state)  → migration (psql -f, ON_ERROR_STOP=1) → gate 1 (v4 state)
#   rollback  gate 1 (v4 state)  → URL-KEY-V4-ROLLBACK.sql                → gate 0 (v3 state)
#   inspect   gates only, read-only; reports which state the database is in
#
# What psql's exit code does and does not establish (as apply-sequence.sh):
# a statement that FAILS before COMMIT aborts the transaction; a lost
# connection, cancel or killed container does NOT prove a rollback, because
# COMMIT may already have run. So after any non-zero exit the ACTUAL state is
# established read-only with the gates:
#   the "before" gate passes → nothing of the step is in the database;
#   the "after"  gate passes → the step IS committed despite the error;
#   neither                  → state unknown: stop and inspect.
# The migration and the rollback each refuse (55000, rolled back) when a
# stored queue or hold key would move; that refusal is classified the same way.
# There is no retry and no repair. Migration history is NOT written.
#
# Inputs (environment only): PGHOST PGPORT PGUSER PGDATABASE PGSSLMODE
# PGAPPNAME, PGPASSWORD (passed by NAME), MODE, SHA_MIG SHA_GATE SHA_RB,
# EXPECT_GUIDELINES EXPECT_CHANGELOG EXPECT_STAGED EXPECT_EDITORS EXPECT_HOLDS,
# and for MODE=rollback PRE_V4_HOLDS (the apply record's expected.holds).
# Files: /sql (read-only copies made and hashed by the host script).
# Output: /record/transcript.log and /record/steps.tsv.
#
# Transactions: the gate, the file and the second gate are THREE separate psql
# sessions, so three separate transactions. Only the file itself is atomic
# (one BEGIN … COMMIT, with its own refusals and an in-transaction post-check).
# Once psql exits 0 after the file, its COMMIT was acknowledged: a later gate
# failure does NOT undo it. Nothing here ever reverses a committed change.
#
# Exit codes:
#   0   apply: v4 applied, gates 0 and 1 passed | rollback: v3 restored, gates 1 and 0 passed
#   10  PREFLIGHT REFUSED, nothing sent: hashes or inputs, or the "before" gate
#       failed while the database is NOT already in the target state
#   11  the step failed or refused; the "before" gate re-passes, which VERIFIES
#       that NOTHING of it committed (the file is one transaction)
#   12  the step COMMITTED (psql exit 0: COMMIT acknowledged) but the "after"
#       gate FAILED. The change stays in place; NOT reversed. Inspect read-only.
#   13  the step errored but the "after" gate passes: it IS committed
#   14  ALREADY in the target state (the "after" gate passes, the "before" one
#       does not): nothing sent. E.g. a repeat -Apply on a v4 database.
#   19  the step errored and neither gate passes: state UNKNOWN
#   40 / 41 / 49   inspect: v3 state / v4 state / neither (UNKNOWN)
# ============================================================================
set -uo pipefail

SQL=/sql
REC=/record
MIG="$SQL/20261104_url_key_unreserved_decoding.sql"
GATE="$SQL/URL-KEY-V4-GATE-READONLY.sql"
RB="$SQL/URL-KEY-V4-ROLLBACK.sql"

[ -d "$REC" ] || { echo "[v4] /record is not mounted" >&2; exit 10; }
step() { printf '%s\t%s\t%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >> "$REC/steps.tsv"; echo "[v4] $1: $2"; }
stop() { step "RESULT" "exit $1: $2"; exit "$1"; }

main() {
for v in PGHOST PGUSER PGDATABASE PGPASSWORD MODE SHA_MIG SHA_GATE SHA_RB EXPECT_GUIDELINES EXPECT_CHANGELOG EXPECT_STAGED EXPECT_EDITORS EXPECT_HOLDS; do
  [ -n "${!v:-}" ] || stop 10 "$v is not set"
done
case "$MODE" in apply|rollback|inspect) ;; *) stop 10 "MODE must be apply, rollback or inspect" ;; esac
if [ "$MODE" = "rollback" ]; then [ -n "${PRE_V4_HOLDS:-}" ] || stop 10 "PRE_V4_HOLDS is not set (required for rollback)"; fi
export PGCLIENTENCODING=UTF8

check_sha() { local got; got=$(sha256sum "$1" | cut -d' ' -f1); [ "$got" = "$2" ] || stop 10 "sha256 of $(basename "$1") is $got, expected $2"; step "sha256" "$(basename "$1") $got"; }
check_sha "$MIG" "$SHA_MIG"
check_sha "$GATE" "$SHA_GATE"
check_sha "$RB" "$SHA_RB"

echo "[v4] mode=$MODE  psql: $(psql --version)  target: ${PGUSER}@${PGHOST}:${PGPORT:-5432}/${PGDATABASE} sslmode=${PGSSLMODE:-prefer}"

gate() {
  psql -X -q -v ON_ERROR_STOP=1 -v stage="$1" \
       -v expect_guidelines="$EXPECT_GUIDELINES" -v expect_changelog="$EXPECT_CHANGELOG" \
       -v expect_staged="$EXPECT_STAGED" -v expect_editors="$EXPECT_EDITORS" -v expect_holds="$EXPECT_HOLDS" \
       -f "$GATE"
}
run_file() { local f="$1"; shift; psql -X -v ON_ERROR_STOP=1 --echo-errors "$@" -f "$f"; }

if [ "$MODE" = "inspect" ]; then
  step "MODE" "inspect: read-only gates only; nothing is sent"
  gate 0 && stop 40 "gate 0 passes: url-key v3 state (20261104 not applied)"
  gate 1 && stop 41 "gate 1 passes: url-key v4 state (20261104 applied)"
  stop 49 "neither gate passes: state UNKNOWN; compare the FAIL lines above"
fi

if [ "$MODE" = "apply" ]; then before=0; after=1; file="$MIG"; else before=1; after=0; file="$RB"; fi

gate "$before"; g=$?
if [ $g -ne 0 ]; then
  # Read-only: is it already in the target state (e.g. a repeat run)?
  gate "$after" && stop 14 "already in the target state: gate $after passes, gate $before does not; NOTHING was sent"
  stop 10 "PREFLIGHT REFUSED: gate $before (expected starting state) did not pass (psql exit $g); NOTHING was sent"
fi
step "gate$before" "passed"

step "$MODE" "sending $(basename "$file")"
if [ "$MODE" = "rollback" ]; then run_file "$file" -v pre_v4_holds="$PRE_V4_HOLDS"; else run_file "$file"; fi; m=$?
if [ $m -ne 0 ]; then
  step "$MODE" "psql exit $m; classifying read-only"
  gate "$before" && stop 11 "$(basename "$file") FAILED or REFUSED (psql exit $m); gate $before passes: NOTHING of it committed."
  gate "$after" && stop 13 "$(basename "$file") errored (psql exit $m) but gate $after passes: it IS COMMITTED."
  stop 19 "$(basename "$file") errored (psql exit $m) and neither gate passes: state UNKNOWN. Inspect read-only."
fi
step "$MODE" "psql exit 0"

gate "$after"; g=$?
[ $g -eq 0 ] || stop 12 "$(basename "$file") COMMITTED (COMMIT acknowledged) but gate $after did NOT pass (psql exit $g). The change is NOT reversed. Run -Inspect read-only and stop."
step "gate$after" "passed"
stop 0 "$MODE complete; gates $before and $after passed. Migration history NOT written."
}

main 2>&1 | tee -a "$REC/transcript.log"
exit "${PIPESTATUS[0]}"
