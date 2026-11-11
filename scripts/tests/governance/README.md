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
asserts that documents are equivalent. No classification currently exempts an alias
from comparison (see below).

## Scope contract (one shared definition)

The contract is defined in three places that are cross-checked by
`scripts/tests/scope-contract.test.ts`:
- `scripts/lib/scope-contract.ts`;
- `_governance_scope_valid` in the proposal;
- the producer types and validators, which import their subset from the contract module.

Allowed values are `document`, `surface`, `index`, `fallback` and `navigation`. Any
other value, including case variants, is refused with `GV005` at staging. Labels are
display text and are never classified: a genuine document titled "Oswestry Disability
Index" keeps its comparison hold.

Producer restrictions:
- The discovery producer may declare `document` or `surface` on URL alternatives.
- `surface` is accepted only on discovery evidence that records a `surface_url`. It is refused (`GV005`) on sync evidence and on staged queue versions.
- Sync versions emit no scope today. If added, they are limited to `document`, `index`, `fallback` or `navigation`.
- In the staging contradiction check, an omitted scope is document-level (the conservative default).

**No producer claim exempts a link.** The scope, `derivedFrom` and `surfaceUrl` are all
chosen by the producer that submits them, so a navigation or surface role cannot be
substantiated inside the system (962fca4 review, P2-2). Each declared role is retained
verbatim as provenance, as `comparison-only; producer-declared <scope> role
unverified; equivalence not established`, and requires review exactly like document
evidence. Unscoped, malformed and legacy rows are comparison-only. Legacy rows that
already carry a valid-looking scope are treated the same as new claims: recorded, never
exempt. A navigation declaration is added beside any document observation and never
replaces it, and rejection sources are immutable.

The consequence is deliberate over-holding. A shared publisher index or fallback page
on a rejected candidate holds later candidates that list it, until a named editor
releases the rejection. Any exemption for verified or editor-attributed navigation
roles is the unsigned **D3** decision. It needs an approved role taxonomy, provenance
the producer cannot choose, and an audited, attributed editor action; none exists here.
The regressions are in `final-conditions.security.mjs`, `scope-classification.security.mjs`,
`final-blockers.security.mjs`, `f1-f5.security.mjs` and `legacy-alias.security.mjs`.

The proposed migration and read-only quarantine rollback are not in automatic
migration discovery. Do not run them on production. Review the migration plan,
legacy data, unknown live grants/functions, editor correction workflows, service
credential custody, issuer/freshness policy and rejection/version policy first.

After inspecting evidence, stop only this suite's labelled container explicitly.
Keep its data for review; do not use a global Docker cleanup or delete other labs.
