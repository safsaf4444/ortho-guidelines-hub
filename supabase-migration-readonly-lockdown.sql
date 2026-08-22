-- ============================================================================
-- TEMPORARY READ-ONLY LOCKDOWN  (DO NOT AUTO-RUN)
-- ============================================================================
-- Run ONCE, by hand, in Supabase -> SQL Editor when you are ready.
--
-- Purpose: close the current public-write hole with the SMALLEST possible
-- change, while ALL decisions about who has editing access, ownership, and
-- long-term maintenance are DEFERRED pending governance / QI direction.
--
-- What it does:
--   * Enables Row Level Security on public.guidelines.
--   * Adds ONE policy: public read-only SELECT (anon + authenticated).
--   * Creates NO insert/update/delete policies.
--
-- Effect: once RLS is enabled with only a SELECT policy, Postgres denies every
-- INSERT/UPDATE/DELETE by default — so NOBODY (including the owner) can write
-- through the public anon key / Data API / app. This is intentional: the app is
-- read-only until an editor-access model is decided later.
--
-- NOT in scope (deliberately deferred):
--   * No Supabase Auth user, no editor UUID, no editor-restricted write policy.
--   * No guideline_changelog table/migration.
--   * The full Auth/editor implementation remains parked as a later follow-up.
--
-- Note: the service_role key (used only by scripts/*.ts) BYPASSES RLS, so
-- seed / upsert-verified / export-static / detect-changes keep working. The
-- anon key does NOT bypass RLS, so the browser app becomes read-only.
-- ============================================================================

begin;

-- Enable RLS (fails closed: anything without a matching permissive policy is denied)
alter table public.guidelines enable row level security;

-- Public read-only access. Re-runnable via drop-if-exists.
drop policy if exists guidelines_public_read on public.guidelines;
create policy guidelines_public_read
  on public.guidelines
  for select
  to anon, authenticated
  using (true);

-- Deliberately NO insert/update/delete policy — writes are denied for everyone.

commit;

-- After running: verify in Supabase -> Authentication/Policies that
--   public.guidelines shows RLS = ENABLED and has exactly ONE policy
--   (guidelines_public_read, SELECT). Confirm a write via the anon key is
--   rejected, and that browsing the app still works.
