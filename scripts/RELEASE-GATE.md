# Local release gate (SAF-9 / SAF-12 / SAF-17)

Run from the checkout you want to validate, after installing its pinned dependencies:

    npm run release:check
    npm run release
    npm run release:check -- --base origin/main
    node scripts/release-gate.mjs --base <local-commit-or-ref> --timeout-ms 120000

Nothing fetches or updates Git refs. The default base is the locally cached
origin/main, whose resolved SHA is recorded. Choose an explicit SHA when the
comparison base must be reproducible. Missing history is a HOLD, not success.

## Output and exit codes

Every run creates a new ignored directory under reports/release-gate/ with:

- report.md: readable results, log links, changed-file scope and required actions.
- report.json: schemaVersion 1; exact HEAD, dirty-tree fingerprint, base SHA,
  runtime, direct dependency versions, lockfile SHA-256, individual commands,
  exit codes, durations, assertion counts, failures and human-review holds.
- One log per check and a fresh bundle/ directory for this run only.

Exit 0 / PASS: automated checks passed on a stable clean candidate with no
scope-triggered review holds. This never authorises deployment or publication.

Exit 1 / FAIL: at least one executed check failed or timed out. All remaining
checks still run so the first failure cannot hide later failures.

Exit 2 / HOLD: evidence or tooling is missing, test output is inconclusive, the
candidate is dirty/changed during validation, or scoped human review is required.

A report is evidence for its recorded HEAD AND candidate fingerprint. Do not
reuse it after changing source, even when HEAD is unchanged. Reports are not
overwritten and there is no mutable "latest passed" marker.

## Checks

1. Compare tracked, staged, unstaged and untracked scope with the explicit base.
   Check tracked diffs with Git and new files for trailing/EOF whitespace.
2. Refuse default/production Vite environment files before reading candidate
   contents; child processes receive basic OS variables, not inherited database,
   Supabase, GitHub, AWS, Vite or Node-injection settings.
3. Check installed direct dependency versions against package-lock.json. Record
   the lockfile hash. This is not a replacement for npm ci on a fresh checkout.
4. Run script TypeScript checks, all project TypeScript references without
   incremental build-cache writes, and lint.
5. Build a fresh production-mode Vite/PWA bundle into this run's bundle folder.
   Require index.html, manifest.webmanifest and sw.js. Scan generated text for
   privileged-key/JWT patterns and UUID-shaped identities, reporting filenames
   without printing suspected credential values. Old dist output cannot pass
   this check.
6. Run every declared offline suite independently. Also include new root
   scripts/tests/*.test.ts, *.test.mjs and *.test.ps1 suites that were omitted
   from the package command. Integration/local-supabase subdirectories are
   never auto-selected. Node suites use a deterministic TAP reporter.
7. Preserve earlier failures across multiple assertion summaries, including
   mixed TAP/legacy output. Missing, ambiguous, skipped, TODO or cancelled
   assertions produce HOLD; nonzero exits or failed assertions produce FAIL.
8. Run checks on a byte-verified temporary copy of candidate inputs. Observe
   both the original and execution copy throughout the checks, including edits
   restored before completion. Any observed mutation, observer error, final
   content difference or Git-state difference invalidates the evidence.

The supported package contracts are deliberately explicit: tsc -b && vite build,
oxlint, and tsc --noEmit -p tsconfig.scripts.json. Offline command entries must
name root test files through tsx or node --test. Operational scripts, shell
expressions, nested integration suites, duplicate entries and unknown test
extensions fail closed. Extend the reviewed adapter rather than silently
ignoring a new build or test contract.

PowerShell suites require powershell.exe on Windows or pwsh elsewhere. Missing
required tools are reported; the gate never downloads dependencies or tools.
Uppercase and underscore-containing suite names are included; unsupported root
test names, types and symlinks block rather than silently disappear.

## Human review and runtime evidence

Changes to SQL/database/backup/deployment procedures, the catalogue, editorial
security/publication paths, workflows, UI/PWA, retrieval identity/scope or the
release-validator/toolchain itself create explicit holds with affected paths
and actions. Documentation under database/procedure directories is conservatively
included. The gate cannot approve its own validation-policy changes.
Diff scope uses `--no-renames`, retaining both the deleted source and destination
of sensitive-file moves. Search terminology changes require clinical review.

Safa retains clinical-content and release approval. A local build cannot verify
live RLS, editor permissions, migration effects, database contents, source-access
permission, publisher HTML, browser accessibility or service-worker updates.
Those need separately authorised review or runtime tests. No permission is
inferred from supplying an acknowledgement flag; none exists.

## Safety boundaries and limitations

- No seed, export, live discover/detect-changes, stage, approve, backup, restore,
  SQL, migration, GitHub workflow, remote Git or deployment command is invoked.
- The gate runs repository-designated offline test code. This is not an OS
  network sandbox: review newly added/modified tests before executing them.
  Existing offline suites can use loopback mock servers.
- A trusted Node preload rejects non-loopback socket connections before DNS;
  exact localhost is pinned to loopback. This is defence in depth, not a security
  boundary against malicious native processes or code that replaces the guard.
- Execution copies share installed dependencies and read-only Git history.
  Native filesystem observations are platform dependent and may conservatively
  HOLD on observer failure. They cannot certify an adversarial operating system.
- Default and production .env files block the run; do not provide production
  credentials. Run from an isolated checkout with no private configuration.
- Common credential, JWT, bearer-token and credential-URL patterns are redacted
  before logs are persisted. Redaction cannot recognise every possible secret;
  logs can still contain source diagnostics. Review before sharing.
- Source guards are useful static checks, not browser or database behaviour tests.
- No existing failure is automatically waived as "pre-existing". Its log and
  status remain visible until the failure is independently resolved.
- Each child has a configurable deadline (1 second to 15 minutes; default
  2 minutes). Suites remain responsible for cleaning up their own subprocesses.
- The gate creates local report/build outputs only; it does not stage or commit.

## Tests for the gate

    npm run test:release-gate

The regression suite covers command allowlisting, omitted/new suites, stripped
environment settings, assertion parsing, false-success prevention, real child
timeouts, failure continuation, required review holds, bundle leakage detection,
missing Git history, untracked EOF whitespace, dependency mismatch and source
mutation at unchanged HEAD. It uses synthetic inputs and temporary files,
without databases or live services.

`node --test scripts/tests/release-gate-adversarial.test.mjs` also exercises the
full gate with synthetic tool stubs: a clean control, earlier failures, skips,
restored edits, ignored-input edits, sensitive renames and redacted diagnostics.
These controls complement the real application run; they do not replace it.

## Generated handoff artifacts

Root `FINAL-INTEGRATION-REPORT.md`, `FINAL-RELEASE-CHECKLIST.md`,
`OWNER-DECISIONS.md`, `FINAL-HANDOFF.md`, `final-integration.patch` and its SHA-256
sidecar are ignored outputs, delivered separately from implementation source.
This avoids a patch containing itself or reports changing the validated source
fingerprint. Force-adding any of these artifacts creates a review hold. Their
referenced source fingerprint and patch digest must be checked before reuse.

draft-owner.test.ts additionally checks both LF and CRLF source and verifies
that removing the owner read or draft reset still makes its guard fail.
