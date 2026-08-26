-- ============================================================================
-- PREPARED, NOT RUN. Add editor-only writes + editor-only changelog
-- (additive, idempotent)
-- ============================================================================
-- This file is checked in for review. It has NOT been executed against the
-- live project as part of this branch — see SECURITY.md "Manual
-- prerequisites" for the steps that must happen first (create the editor
-- Auth user via magic-link sign-in, replace the placeholder UUID below, set
-- VITE_EDITOR_UUIDS) and the order they must happen in.
--
-- Run ONCE in Supabase -> SQL Editor, by hand, when ready. Safe to re-run
-- (guards + drop/create).
--
-- ── Current live state this migration builds on (verified via Supabase
--    advisors + pg_tables/pg_policies before writing this) ───────────────────
--   * public.guidelines already has RLS ENABLED with exactly one policy:
--     guidelines_public_read (SELECT, anon+authenticated, using (true)).
--     Applied by supabase-migration-readonly-lockdown.sql. There is currently
--     NO insert/update/delete policy, so ALL writes — including from an
--     eventual editor — are denied. This migration only ADDS the missing
--     write policy; it does not touch or re-create guidelines_public_read.
--   * public.guideline_changelog does NOT exist yet.
--
-- BEFORE RUNNING: replace 'REPLACE-WITH-EDITOR-UUID' below with the real
-- Auth UUID of each approved editor (Supabase -> Authentication -> Users,
-- after they've signed in once via magic link — see SECURITY.md). Left as
-- the placeholder, it is not a valid UUID, so every policy check errors on
-- cast and every write is denied — fails closed, not open. Multiple editors
-- are supported: add more UUIDs to the `any (array[...])` list.
--
-- The service_role key (used only by scripts/*.ts, server-side) bypasses RLS
-- entirely, so seed / upsert-verified / export-static / detect-changes /
-- approve-change keep working regardless of this migration.
-- ============================================================================

-- ── 1. Changelog table (new; does not exist on the live DB yet) ─────────────
create table if not exists public.guideline_changelog (
  id uuid primary key default gen_random_uuid(),
  guideline_id text not null references public.guidelines(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.guideline_changelog is
  'Append-only free-text edit history for guidelines. One row per note. No update/delete policy exists, so RLS denies both — append-only is enforced at the DB layer. Read is editor-only, not public — see changelog_editor_read below.';

create index if not exists guideline_changelog_guideline_id_idx
  on public.guideline_changelog(guideline_id);
create index if not exists guideline_changelog_created_at_idx
  on public.guideline_changelog(created_at desc);

alter table public.guideline_changelog enable row level security;

-- Editor-only READ. Deliberately NOT public — this differs from an earlier
-- draft of this migration (prepared in a prior, reverted branch) that made
-- the changelog publicly readable like `guidelines`. Editorial change notes
-- may reference draft/unpublished reasoning, so read access follows write
-- access here: same allowlist, same "authenticated AND in the list" shape.
drop policy if exists changelog_editor_read on public.guideline_changelog;
create policy changelog_editor_read
  on public.guideline_changelog
  for select
  to authenticated
  using (auth.uid() = any (array['REPLACE-WITH-EDITOR-UUID']::uuid[]));

-- INSERT only, editor only. Deliberately NO update/delete policy — RLS then
-- denies update and delete for everyone (append-only).
drop policy if exists changelog_editor_insert on public.guideline_changelog;
create policy changelog_editor_insert
  on public.guideline_changelog
  for insert
  to authenticated
  with check (auth.uid() = any (array['REPLACE-WITH-EDITOR-UUID']::uuid[]));

-- ── 2. guidelines: ADD the missing editor-write policy. Do NOT touch RLS
--      enable state or guidelines_public_read — both already live. ─────────
-- IMPORTANT: do NOT loosen this to `auth.uid() is not null`. Supabase
-- magic-link sign-in has no admin approval step — anyone who can receive an
-- email can obtain a valid session. The policy must name the explicit,
-- pre-approved editor UUID(s), not "is authenticated".
--
-- "for all" here only matters for INSERT/UPDATE/DELETE in practice — SELECT
-- is already granted publicly by guidelines_public_read, and permissive
-- policies are OR'd together, so this policy's own (redundant) select grant
-- changes nothing observable.
drop policy if exists guidelines_editor_write on public.guidelines;
create policy guidelines_editor_write
  on public.guidelines
  for all
  to authenticated
  using      (auth.uid() = any (array['REPLACE-WITH-EDITOR-UUID']::uuid[]))
  with check (auth.uid() = any (array['REPLACE-WITH-EDITOR-UUID']::uuid[]));

-- ============================================================================
-- After running: verify in Supabase -> Authentication/Policies that
--   guidelines           has 2 policies (public_read, editor_write)
--   guideline_changelog  has 2 policies (editor_read, editor_insert) — NOT
--                        publicly readable, unlike guidelines
-- and that RLS shows ENABLED on both.
-- ============================================================================


-- ============================================================================
-- ROLLBACK — reverts exactly what this migration added, nothing pre-existing
-- ============================================================================
-- begin;
--
-- drop policy if exists guidelines_editor_write on public.guidelines;
-- -- guidelines_public_read is NOT touched — it predates this migration and
-- -- stays in place; the table remains readable and write-locked, same as
-- -- before this migration ran.
--
-- drop policy if exists changelog_editor_insert on public.guideline_changelog;
-- drop policy if exists changelog_editor_read   on public.guideline_changelog;
-- drop table if exists public.guideline_changelog;
--
-- commit;
-- ============================================================================
