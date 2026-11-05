# Fail-closed local browser configuration

Base: caf34be9f52addb176a5d7ca863e8e2b4531fc42.
This patch changes local browser connectivity defaults. It does not change
deployment workflow configuration, production endpoint values, public keys,
server-side credentials, RLS, publication rules or database state.

## What was unsafe

src/lib/supabase.ts previously supplied independent production URL/key fallbacks.
Missing one or both Vite variables could therefore create a production client.
A copied production-valued .env.local could do the same. The client starts auth
session handling on creation, so even a stored local session can matter before
a developer clicks anything.

npm run build compiled those fallbacks into a production-mode bundle. Serving
that bundle with npm run preview was still local testing, even though
import.meta.env.PROD was true. Checking DEV alone would not solve preview,
mobile/LAN previews, or a production-configured bundle opened locally.

The frontend has one client creation site. Catalogue, changelog, staging and
editor-session services import that shared client. Server-side operational
scripts have separate explicit environment requirements and are untouched.

The existing shared checkout .env.local was inspected only for variable names
and whether its public frontend URL was loopback. It contains frontend URL/key
and a server-key variable; its URL is not loopback. No key value was printed or
used, no client was created from it, and the file was not modified or copied.
The isolated worktree contains no .env.local.

## Policy

- Missing, partial or malformed URL/key configuration: no client; static mode.
- Explicit local loopback URL plus public anon key: permitted locally.
- Non-loopback URLs require HTTPS and an explicit public key.
- Test mode (--mode test): remote database targets always refused, even when
  the local remote opt-in is set.
- Production-mode build at the existing documented deployment origin,
  https://safsaf4444.github.io: remote configuration must be explicitly supplied
  and syntactically valid. Accidental loopback configuration is refused there.
- Any other origin, including localhost, LAN addresses and local preview:
  remote connectivity is disabled by default, regardless of build mode.
- Deliberate remote access from a non-deployed app requires the exact string
  VITE_ALLOW_REMOTE_SUPABASE_IN_LOCAL=true plus explicit URL and public key.
  This is a separately authorised remote workflow, not an offline test.
- No browser origin (SSR/Node) or opaque origin: no client.

URLs must be HTTP(S) root URLs without userinfo, query or fragment; remote HTTP
is refused. localhost, IPv4 loopback and IPv6 ::1 are recognised without DNS.
DNS lookalikes are not loopback. A LAN API is remote for this policy and needs
HTTPS plus explicit remote opt-in; a local mobile preview remains static by
default.

Modern sb_publishable_ keys and legacy JWTs declaring role=anon are supported.
Secret prefixes, service_role JWTs and placeholders are refused. Validation is
syntactic and role-based, not a cryptographic key/server verification.

The production workflow already passes the URL/public key explicitly; it is
unchanged. Auth persistence, auto-refresh and recovery-hash handling are
unchanged for enabled clients. A future production custom domain would require
a reviewed update to the documented deployment-origin policy.

This is a connectivity guard, not an authorisation boundary. RLS and the editor
allowlist continue to control actual permissions.

## Normal local workflows

Static frontend/accessibility/freshness work:

    npm run dev

No database variables are needed. With missing variables, isSupabaseEnabled is
false and the app uses its static catalogue. Existing production-valued local
variables do not silently opt a local browser into remote access.

Disposable local database work, only when separately authorised:
copy .env.example to a private .env.local and supply the LOCAL stack's public
anon key with its loopback base URL. Never copy a server key into a VITE_ field.
No local database was started for this patch's validation.

If remote catalogue comparison or production editor/auth debugging is explicitly
approved, configure the URL/public key and the local remote opt-in intentionally,
restart/rebuild, and remove the opt-in afterwards. Preview uses compiled values:
changing shell variables after the bundle was built does not reconfigure it.

Do not assume a stale bundle or service worker from before this patch is safe.
Rebuild and use a fresh browser context or clear the old local service worker.
Browser automation should keep network isolation even with this guard.

## Tests

    npm run test:supabase-config
    npm run test:local-browser-safety

The pure configuration matrix is registered in test:offline. It creates no
Supabase clients and makes no network requests. Production-host strings are
paired only with synthetic test keys.

The standalone browser harness requires an installed Chromium, Chrome or Edge.
It downloads nothing, starts only loopback Vite servers, uses fresh browser
contexts, blocks service workers and intercepts all external HTTP/WebSockets.
Local API requests are fulfilled mocks, never actual Supabase calls.

Browser cases cover missing variables plus a stale synthetic session,
accidentally production-valued development inputs, an explicitly configured
mocked loopback API, test-mode override of remote opt-in, and a production-mode
bundle served through local preview. No real credentials are provided.

The existing disposable-Supabase E2E harness now starts Vite with --mode test.
It already explicitly supplies loopback values and blocks non-loopback HTTP.
That database-dependent harness was only type-checked, never executed here.

## Integration

1. Review and apply reports/local-supabase-fail-closed.patch to the expected base
   using git apply --check before git apply.
2. Keep .github/workflows/deploy.yml unchanged: its existing explicit build
   inputs retain the current production target.
3. Run the pure matrix, browser harness, type-checks, lint and local build with
   no private env files in an isolated checkout.
4. Merge package.json test-list additions with other workstreams rather than
   replacing their suites. No freshness or Discovery V2 files are in this patch.
5. Rebuild existing local previews; do not reuse a pre-patch production bundle.
6. Do not run seed, migrations, database rehearsals, publication or deployment
   merely to validate this local configuration change.

The original base has two CRLF-sensitive draft-owner source-guard failures on
Windows. This patch does not alter that unrelated test or the accessibility
worktree. Report them independently rather than hiding or repairing them here.
