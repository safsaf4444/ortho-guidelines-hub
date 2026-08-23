-- ============================================================================
-- DATA REMEDIATION BATCH 2b — collapse duplicate version URLs  (DO NOT AUTO-RUN)
-- ============================================================================
-- Run ONCE, by hand, in Supabase -> SQL Editor. Nothing here has been executed.
-- Run this AFTER supabase-data-remediation-batch2.sql, or independently — the
-- two files touch disjoint sets of rows, so ordering between them does not matter.
--
-- Purpose: three rows carry version entries whose URLs are byte-identical to
-- another entry in the SAME row, so the UI renders the same destination twice
-- under two different labels. This removes the redundant entries and preserves
-- each dropped label in link_verification_notes, so no editorial information is
-- lost — only the duplicate link is.
--
-- IMPORTANT: every URL involved here is ALREADY LIVE (HTTP 200 on 2026-08-23).
-- This is a tidiness/data-quality fix, not a dead-link fix. Nothing about it is
-- urgent, and rolling it back costs nothing.
--
-- ─── THE INDEX-SHIFT HAZARD (why the delete order below is deliberate) ──────
-- `jsonb_array - integer` removes the element at that index and RE-INDEXES
-- everything after it. So deleting index 2 first would shift the old index 3
-- down into slot 2, and a subsequent `- 3` would then delete the WRONG element
-- (or nothing). Every multi-delete below therefore removes the HIGHER index
-- FIRST. Batch 1 only ever deleted a single element per row, so it never had
-- to deal with this.
--
-- Expressions are written as ((versions - 3) - 2) with explicit parentheses:
-- left-to-right evaluation already gives the correct order, but the parentheses
-- make the intent unmistakable to the next reader.
--
-- After running this: run `npm run export-static` to regenerate
-- src/data/guidelines-data.ts, then commit that in a separate follow-up PR.
--
-- Wrapped in a transaction; a failed precondition raises and rolls everything
-- back (fail closed) so a drifted DB is never half-updated.
-- ============================================================================

begin;

-- ── Preconditions: assert each duplicate pair is still EXACTLY as expected,
--    comparing the two indexes to each other rather than to a hardcoded URL so
--    the check stays honest even if the shared URL is later updated. ─────────
do $$
begin
  -- fls-db: expect 4 entries forming two duplicate pairs, 0==3 and 1==2.
  if not exists (select 1 from public.guidelines where id = 'fls-db'
                 and jsonb_array_length(versions) = 4
                 and versions->0->>'url' = versions->3->>'url'
                 and versions->1->>'url' = versions->2->>'url'
                 and versions->3->>'label' = 'FLS-DB web portal'
                 and versions->2->>'label' = 'FFFAP FLS resources')
    then raise exception 'Precondition failed: fls-db is not in the expected 4-entry two-duplicate-pair state'; end if;

  -- ros-clinical-quality-toolkits: expect 6 entries, 0==1.
  if not exists (select 1 from public.guidelines where id = 'ros-clinical-quality-toolkits'
                 and jsonb_array_length(versions) = 6
                 and versions->0->>'url' = versions->1->>'url'
                 and versions->1->>'label' = 'Fallback / index page')
    then raise exception 'Precondition failed: ros-clinical-quality-toolkits versions[0]/[1] are not the expected duplicate pair'; end if;

  -- girft-orthopaedic-surgery-report: expect 3 entries, 1==2.
  if not exists (select 1 from public.guidelines where id = 'girft-orthopaedic-surgery-report'
                 and jsonb_array_length(versions) = 3
                 and versions->1->>'url' = versions->2->>'url'
                 and versions->2->>'label' = 'BOA implementation guidance')
    then raise exception 'Precondition failed: girft-orthopaedic-surgery-report versions[1]/[2] are not the expected duplicate pair'; end if;
end $$;

-- ── 1. fls-db — 4 entries, only 2 distinct URLs. Remove indexes 3 THEN 2.
--     [0] "Current"               == [3] "FLS-DB web portal"        (RCP FFFAP page)
--     [1] "Fallback / index page" == [2] "FFFAP FLS resources"      (NHFD page)
--     Pair 0/3 was created by the 2026-08-22 Batch 1 remediation, which mapped
--     two different dead URLs onto one live page. Pair 1/2 is PRE-EXISTING and
--     was not caused by Batch 1.
--     Result: 4 entries -> 2, both distinct destinations retained.
update public.guidelines
set versions = ((versions - 3) - 2),
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 cleanup: collapsed duplicate version URLs. Removed "FLS-DB web portal" (byte-identical to "Current" after the 2026-08-22 RCP remediation — RCP consolidated the portal into the audit page) and "FFFAP FLS resources" (byte-identical to "Fallback / index page"; a pre-existing duplicate, not introduced by Batch 1). No destination lost: both distinct live URLs are retained.'
where id = 'fls-db'
  and jsonb_array_length(versions) = 4
  and versions->0->>'url' = versions->3->>'url'
  and versions->1->>'url' = versions->2->>'url';

-- ── 2. ros-clinical-quality-toolkits — remove the redundant fallback (index 1).
--     [0] "Current" == [1] "Fallback / index page" — a fallback pointing at the
--     same URL as the primary provides no fallback at all.
--     Result: 6 entries -> 5.
update public.guidelines
set versions = (versions - 1),
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 cleanup: removed the "Fallback / index page" version entry, whose URL was byte-identical to "Current" (the clinical quality toolkits index) and therefore offered no fallback. The four specific toolkit links on this row are untouched.'
where id = 'ros-clinical-quality-toolkits'
  and jsonb_array_length(versions) = 6
  and versions->0->>'url' = versions->1->>'url';

-- ── 3. girft-orthopaedic-surgery-report — remove the redundant entry (index 2).
--     [1] "Fallback / index page" == [2] "BOA implementation guidance", both the
--     BOA GIRFT page. "Fallback / index page" is kept because it sits at the
--     lower index and matches the convention used across the dataset; the more
--     descriptive label is preserved in the note below.
--     Result: 3 entries -> 2.
update public.guidelines
set versions = (versions - 2),
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 cleanup: removed the "BOA implementation guidance" version entry, whose URL was byte-identical to "Fallback / index page" (both https://www.boa.ac.uk/standards-guidance/getting-it-right-first-time.html). The BOA page does serve as the implementation guidance, so the label is recorded here rather than kept as a duplicate link.'
where id = 'girft-orthopaedic-surgery-report'
  and jsonb_array_length(versions) = 3
  and versions->1->>'url' = versions->2->>'url';

-- ── Post-change review (inspect before COMMIT) ─────────────────────────────
--    Expect: fls-db n_versions = 2, ros-clinical-quality-toolkits = 5,
--            girft-orthopaedic-surgery-report = 2, and n_distinct = n_versions
--            on every row (i.e. no duplicates left anywhere in these three).
select id,
       jsonb_array_length(versions) as n_versions,
       (select count(distinct v->>'url') from jsonb_array_elements(versions) v) as n_distinct_urls
from public.guidelines
where id in (
  'fls-db','ros-clinical-quality-toolkits','girft-orthopaedic-surgery-report'
)
order by id;

commit;
-- If anything above looks wrong, run `rollback;` instead of committing.
