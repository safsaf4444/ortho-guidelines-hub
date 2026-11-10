# Local governance security verification

This suite never accepts a database URL, production key or remote host. It uses
cached `postgres:17-alpine` (`--pull never`), a new Docker container, network
`none`, no published ports, a fixed disposable label, synthetic users and records.
The bootstrap's `auth.uid()`/`auth.role()` emulate JWT claims in PostgreSQL; this
is real database/RLS/RPC testing, not a Supabase Auth/PostgREST end-to-end test.

From an isolated checkout with the existing pinned dependencies and Docker:

```
node scripts/tests/governance/rehearse.mjs --lab=ortho-governance-your-unique-lab
node scripts/tests/governance/contracts.test.mjs --lab=ortho-governance-your-unique-lab
node scripts/tests/governance/postgres.test.mjs --lab=ortho-governance-your-unique-lab
node scripts/tests/governance/quarantine.test.mjs --lab=ortho-governance-your-unique-lab
```

Use a NEW lab name. Rehearsal refuses existing containers. All subsequent SQL
calls verify the disposable label, network isolation and absence of published
ports. The final quarantine test intentionally revokes publication/staging/checker
RPC permissions while retaining data and public reads; rerunning positive tests
after quarantine requires another new lab. No unowned container is reset/deleted.

The six contracts can also be run against an original-schema baseline lab:

```
node --input-type=module -e "import {setup} from './scripts/tests/governance/db-harness.mjs'; setup();" -- --lab=ortho-governance-baseline-unique
node scripts/tests/governance/contracts.test.mjs --lab=ortho-governance-baseline-unique
```

Those six tests are EXPECTED TO FAIL on the original source schema: they are the
red controls, not a release pass. Actual hardening is applied only by rehearsal,
from `supabase/proposals/20261107_editorial_governance_hardening.sql`.

Outputs are under `reports/governance-hardening/` (ignored). No real catalogue
record is seeded or approved. Canonical URL vectors are parsed as strings only;
no publisher URL is fetched. The evidence freshness policy is initially unset;
any one-day policy used in tests is explicitly synthetic and not a production
policy decision. No verifier credential/membership is granted to application roles.

## Transaction-isolation contract

Every governance path that takes the shared pipeline lock (approval, rejection,
resolution, staging, clinical review, rejection release, revision signals and the
queue/evidence triggers) must run at READ COMMITTED. Each statement after the lock
then takes a fresh snapshot, so evidence committed during the wait is seen.

A REPEATABLE READ or SERIALIZABLE snapshot predates the wait, and an evidence append
does not update the queue row, so it could validate stale evidence and publish. These
modes and READ UNCOMMITTED are refused with SQLSTATE `GV007` before any lock or write;
this includes a session or role `default_transaction_isolation` override.
`stage_sync_candidates` reports it per candidate as `failed` with code `GV007`.
Append-only evidence recorders and read-only receipt listings take no lock and make
no pipeline decision. The target's role and PostgREST settings are not verified here.

Comparison holds are order-independent: each trust classification of an alias is
retained, and one document-level observation requires comparison. A hold never
asserts that documents are equivalent, and navigation-only aliases create no hold.

## Scope-classification contract

Whether an alias is document-level or navigation-only is decided ONLY by an explicit
`scope` on the alternative or version, never by its label. A genuine document titled
"Oswestry Disability Index" or "Index finger fracture management" keeps its comparison
hold. Allowed values are `document`, `surface`, `index`, `fallback` and `navigation`;
any other value, including case variants, is refused with `GV005` at staging. A
signal with no scope, which includes all legacy rows, is comparison-only, so legacy
navigation pages may be over-held for review, never under-held.

`index`, `fallback` and `navigation` are navigation-only. `surface` (a publisher
index-page redirect) is navigation-only only when its `derivedFrom` is that evidence
row's own recorded `surface_url`. Any other surface claim is unverified and stays
comparison-only. This exempts nothing from duplicate checks: a candidate's own surface
URLs are still checked against the catalogue and unreleased rejections at
publication. `scope-classification.security.mjs` holds the regressions.

The proposed migration and read-only quarantine rollback are not in automatic
migration discovery. Do not run them on production. Review the migration plan,
legacy data, unknown live grants/functions, editor correction workflows, service
credential custody, issuer/freshness policy and rejection/version policy first.

After inspecting evidence, stop only this suite's labelled container explicitly.
Keep its data for review; do not use a global Docker cleanup or delete other labs.
