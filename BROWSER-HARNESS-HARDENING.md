# Browser harness hardening

Baseline B: f266acdc; comparison A: 4746066.

B's native modal drawer checks are retained: 320/375/767px, forward/reverse focus
order, native modality, background focus/pointer rejection, browser accessibility
tree exclusion, Escape/close/backdrop/navigation focus restoration, reopening,
mobile grouping with 231 records, resize to 768px, and offline reopening.

Restored from A: allowlisted OS environment variables and JSON assertion evidence.
Both Vite and browser child processes use safeEnvironment; inherited credentials,
VITE settings, proxies and NODE_OPTIONS are excluded. The runner rejects private
.env files that Vite could otherwise load. Only synthetic unreachable loopback API
configuration is supplied. Browser requests outside the preview origin are blocked;
unexpected origins fail the test. The known Google Fonts references in development
HTML are aborted, as in A; they are removed entirely by the static-preview build. No application files were changed.

The launcher resolves its repository with fileURLToPath(import.meta.url), sets cwd
explicitly, uses argument arrays without a shell, drains no unbounded pipes and
waits for Vite shutdown. Each viewport has independent cleanup and failure capture.
reports/navigation-drawer/assertions.json contains stable ordered IDs, named
assertions and pass/fail records. Failure paths emit JSON and a failing exit status.
Screenshots remain in the same directory. The offline regression tests verify
allowlisting and deterministic successful/failed assertion serialization.

Run from any cwd: node <absolute-path>/scripts/tests/mobile-drawer.e2e.mjs.
Default browser is installed Edge; UI_BROWSER can select an installed Playwright
channel. Install locked dependencies before running in a fresh checkout. This
Windows checkout has spaces in its path; local dependencies are reused via an
ignored node_modules junction. No download or package mutation is required here.

Other frozen browser suites are unchanged. This host uses a report-local import
adapter to select installed Edge and restrict DNS. Full commands and exit codes
are recorded in reports/release-hardening/*-results.json.
