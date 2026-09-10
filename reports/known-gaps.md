# Known-gaps register

Append-only. One row per topic that was searched for and not found, or found
only partially. Rows are added by `npx tsx scripts/log-gap.ts` and are never
edited or deleted — to correct an entry, append a new row that supersedes it.

This exists because an absent topic and a topic that was checked and found to
have no published UK guidance look identical from the outside. Only the second
is a finding, and only this file records the difference.

**Coverage values:** `covered` · `partially-covered` · `not-covered` · `no-uk-source`

**Why a file and not a database table:** deliberate. The register is editorial
working-out rather than published content, it benefits from being reviewable in
a diff, and it costs no schema change, RLS policy or migration. Revisit if it
ever needs to be searchable from the app itself.

| Date | Topic searched | Coverage | Evidence checked | Decision | By |
| --- | --- | --- | --- | --- | --- |
