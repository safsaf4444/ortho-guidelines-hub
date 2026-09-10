-- ============================================================================
-- Safeguards on top of public write access:
--   1. Soft delete — anon can no longer destroy rows, only archive them.
--   2. Change notes can never be blank.
-- ============================================================================
-- Runs after supabase-migration-public-write-access.sql. Editing remains
-- public and unauthenticated; this narrows the blast radius of that decision.
-- ============================================================================

-- ── 1. Revoke anonymous DELETE on guidelines ────────────────────────────────
-- Dropping the policy is sufficient: with RLS enabled and no DELETE policy,
-- Postgres denies DELETE for anon and authenticated. A `DELETE` with no filter
-- can therefore no longer wipe the catalogue.
--
-- The app's "Delete" action now performs UPDATE ... SET archived = true
-- instead, which the existing guidelines_public_update policy already allows.
-- The row physically remains and is recoverable with:
--     update public.guidelines set archived = false where id = '<id>';
--
-- `archived` already exists (boolean not null default false, see
-- supabase-schema.sql) and is already mapped in both directions by
-- src/lib/guidelines-mapper.ts, so no column change is needed.
drop policy if exists guidelines_public_delete on public.guidelines;

-- ── 2. Change notes must not be blank ───────────────────────────────────────
-- Enforced at the database, so it holds for anyone hitting the REST API
-- directly with curl — not only for the UI. `btrim` means whitespace-only
-- notes are rejected too.
--
-- SCOPE, stated honestly: this guarantees a note is never EMPTY. It does not
-- and cannot guarantee that every guideline UPDATE is accompanied by a note —
-- PostgREST issues the guideline write and the note write as two separate
-- requests, so a direct API caller can still PATCH a guideline and simply not
-- post a note. Closing that gap properly needs both writes moved into a single
-- SECURITY DEFINER function (RPC) with direct UPDATE revoked from anon. See
-- SECURITY.md, "What the note requirement does and does not guarantee".
alter table public.guideline_changelog
  drop constraint if exists guideline_changelog_description_not_blank;

alter table public.guideline_changelog
  add constraint guideline_changelog_description_not_blank
  check (length(btrim(description)) > 0);

comment on constraint guideline_changelog_description_not_blank
  on public.guideline_changelog is
  'A change note must contain something. Blank and whitespace-only notes are rejected at the database layer, so this holds for direct API callers as well as the UI.';

-- ============================================================================
-- After running, expect:
--   guidelines           -> 3 policies: public_read, public_insert,
--                           public_update.  NO delete policy.  RLS enabled.
--   guideline_changelog  -> 2 policies: public_read, public_insert, plus the
--                           not-blank CHECK constraint.  Still append-only.
-- ============================================================================


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
--   -- restore hard delete for anon (NOT recommended)
--   create policy guidelines_public_delete on public.guidelines
--     for delete to anon, authenticated using (true);
--   alter table public.guideline_changelog
--     drop constraint if exists guideline_changelog_description_not_blank;
-- commit;
--
-- To find archived rows:
--   select id, topic from public.guidelines where archived = true;
-- To restore one:
--   update public.guidelines set archived = false where id = '<id>';
-- ============================================================================
