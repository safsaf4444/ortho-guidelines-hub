# Final workflow retirement

Baseline: f266acdcf25f1fe6fa741d52dcbc6250c4d986f3.

The active detect-changes.yml was removed. A non-executable retirement record is
kept in .github/retired-workflows/detect-changes.md. There are no scheduled,
manual, reusable or other triggers, jobs, service-role handoffs or write permissions
in that record. Git history preserves the original workflow.

scripts/detect-changes.ts and its unconditional direct-maintenance-disabled guard
are unchanged. The legacy catalogue-update body remains unreachable. No replacement
publication, correction or archive workflow is activated. An audited replacement
requires human D4 approval; this retirement does not decide D4.

The new offline regression scans every active workflow for detector callers and
retirement-record references, checks the trigger-free record, checks the guard,
and executes the guarded entry point under the network blocker, expecting exit 1.
The existing editorial test now expects only guideline-sync to receive a service-role
key. That remaining credential-bearing workflow is not expanded or authorised by
this change and remains a security review item.

Reproduce: node --test scripts/tests/release-hardening.test.mjs, plus test:offline.
See reports/release-hardening for fresh execution logs and final release evidence.
No workflows were changed remotely. Production remains HOLD.
