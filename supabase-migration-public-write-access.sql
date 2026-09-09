-- ============================================================================
-- Grant PUBLIC, UNAUTHENTICATED write access to guidelines and the changelog.
-- ============================================================================
-- ⚠ READ THIS BEFORE RUNNING. This migration deliberately removes the write
-- protection that supabase-migration-readonly-lockdown.sql put in place.
--
-- After this runs, ANY anonymous visitor to
-- https://safsaf4444.github.io/ortho-guidelines-hub/ — and anyone who has ever
-- seen the public anon key, which ships in every JS bundle and is a literal in
-- src/lib/supabase.ts and .github/workflows/deploy.yml — can INSERT, UPDATE and
-- DELETE any of the 231 clinical guideline rows, directly against the REST API,
-- with a single curl command and no browser involved.
--
-- There is no authentication, no allowlist, no rate limit and no record of who
-- made a change. The only trace is guidelines.updated_at.
--
-- This is a deliberate, explicit decision by the site owner (Safa), taken after
-- the trade-off was set out in full. It is NOT an oversight or a
-- misconfiguration. See SECURITY.md for the full access model and rollback.
--
-- NOTE ON TIMING: the exposure begins the moment this migration runs, NOT when
-- a new frontend is deployed. The anon key is already public, so the API is
-- open as soon as the policies exist, whatever the deployed bundle does.
-- ============================================================================

-- ── guidelines: INSERT / UPDATE / DELETE for anon ───────────────────────────
-- Matches exactly the operations the UI performs (src/lib/guidelines-service.ts):
--   create()  -> insert          (Add guideline)
--   update()  -> update          (Edit modal, "Mark link checked today", merge)
--   remove()  -> delete          (Delete, and the losing row in a merge)
-- SELECT is already granted by guidelines_public_read and is not touched here.

drop policy if exists guidelines_public_insert on public.guidelines;
create policy guidelines_public_insert
  on public.guidelines
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists guidelines_public_update on public.guidelines;
create policy guidelines_public_update
  on public.guidelines
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists guidelines_public_delete on public.guidelines;
create policy guidelines_public_delete
  on public.guidelines
  for delete
  to anon, authenticated
  using (true);

-- ── guideline_changelog: INSERT for anon ────────────────────────────────────
-- Read is already public (changelog_public_read). This adds the write half, so
-- the card-level "Add note" box works for everyone. Deliberately NO update or
-- delete policy: with RLS on and no policy, Postgres denies both, so the
-- changelog stays append-only even though anyone can append to it. That is the
-- one audit-trail property still standing after this migration.

drop policy if exists changelog_public_insert on public.guideline_changelog;
create policy changelog_public_insert
  on public.guideline_changelog
  for insert
  to anon, authenticated
  with check (true);

-- ============================================================================
-- After running, expect:
--   guidelines           -> 4 policies: public_read, public_insert,
--                           public_update, public_delete.  RLS enabled.
--   guideline_changelog  -> 2 policies: public_read, public_insert.
--                           RLS enabled. No update/delete policy (append-only).
-- ============================================================================


-- ============================================================================
-- ROLLBACK — restores the previous read-only posture in full.
-- Run this to immediately close public write access again. It takes effect at
-- once, for every client, with no redeploy needed.
-- ============================================================================
-- begin;
--   drop policy if exists guidelines_public_insert  on public.guidelines;
--   drop policy if exists guidelines_public_update  on public.guidelines;
--   drop policy if exists guidelines_public_delete  on public.guidelines;
--   drop policy if exists changelog_public_insert   on public.guideline_changelog;
--   -- guidelines_public_read and changelog_public_read are NOT touched: they
--   -- predate this migration and keep the site readable.
-- commit;
-- ============================================================================
