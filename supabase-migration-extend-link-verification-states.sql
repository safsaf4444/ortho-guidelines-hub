-- ============================================================================
-- Extend guidelines_link_verification_check to the live set of states
-- ============================================================================
-- RECONSTRUCTED FROM PRODUCTION, NOT AUTHORED. Do not reapply to production:
-- production already has exactly this constraint. This file exists so that a
-- REBUILD can reach the same state, which it previously could not.
--
-- ── Why this file was missing ───────────────────────────────────────────────
-- supabase_migrations.schema_migrations records
--
--     20260910195751  extend_link_verification_states
--
-- but no SQL for it exists anywhere in this repository. It was applied out of
-- band, and the only definition of guidelines_link_verification_check in the
-- repo is in supabase-schema.sql, with the ORIGINAL four states. Nothing
-- altered it afterwards.
--
-- Found on 2026-10-11 by diffing a restore drill against production:
--
--     production : unchecked, verified, needs-review, broken,
--                  moved, withdrawn, superseded, blocked      (8)
--     rebuilt    : unchecked, needs-review, broken, verified   (4)
--
-- This is not cosmetic. scripts/map-link-status.ts and
-- scripts/flag-dead-links.ts write 'moved', 'withdrawn', 'superseded' and
-- 'blocked'. Against a database rebuilt from the documented chain those
-- writes fail with a check violation, so a restored database would silently
-- break link maintenance.
--
-- ── Provenance of the values ────────────────────────────────────────────────
-- The eight values and their order are copied verbatim from the live
-- constraint, captured read-only on 2026-10-12 with
--
--     select pg_get_constraintdef(oid) from pg_constraint
--      where conrelid = 'public.guidelines'::regclass
--        and conname  = 'guidelines_link_verification_check';
--
-- which returned:
--
--     CHECK ((link_verification_status = ANY (ARRAY[
--       'unchecked'::text, 'verified'::text, 'needs-review'::text,
--       'broken'::text, 'moved'::text, 'withdrawn'::text,
--       'superseded'::text, 'blocked'::text])))
--
-- convalidated = true. NO VALUE HERE WAS INVENTED, and none was added,
-- removed or reordered. If a future state is wanted, that is a separate
-- editorial decision and a separate migration.
-- ============================================================================

begin;

-- Idempotent and safe on a rebuild: the constraint always exists at this
-- point, created by supabase-schema.sql with the original four states.
alter table public.guidelines
  drop constraint if exists guidelines_link_verification_check;

alter table public.guidelines
  add constraint guidelines_link_verification_check
  check (link_verification_status in (
    'unchecked', 'verified', 'needs-review', 'broken',
    'moved', 'withdrawn', 'superseded', 'blocked'
  ));

comment on column public.guidelines.link_verification_status is
  'Result of the last automated reachability check, NOT a statement about clinical currency. Column default is ''unchecked''. The four states beyond the original set — moved, withdrawn, superseded, blocked — are written by scripts/map-link-status.ts and scripts/flag-dead-links.ts; a schema without them breaks those scripts.';

commit;

-- ============================================================================
-- After running, expect:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'guidelines_link_verification_check';
--   -- 8 values. Compare against the production capture quoted above.
--
--   -- And the behavioural check that actually matters, which is what the
--   -- original four-state schema failed:
--   insert into public.guidelines (id, section, type, topic, source, status,
--                                  link_verification_status)
--   values ('probe-moved','S','guideline','T','X','Live','moved');
--   -- must succeed, then roll it back.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (to the original four states — only meaningful on a rebuild, and
-- it will FAIL if any row already uses one of the four newer values)
-- ============================================================================
-- begin;
--   alter table public.guidelines
--     drop constraint if exists guidelines_link_verification_check;
--   alter table public.guidelines
--     add constraint guidelines_link_verification_check
--     check (link_verification_status in
--            ('unchecked', 'needs-review', 'broken', 'verified'));
-- commit;
-- ============================================================================
