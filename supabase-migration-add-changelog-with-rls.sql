-- ============================================================================
-- Add the guideline changelog table, with RLS. Additive and idempotent.
-- ============================================================================
-- Supersedes supabase-migration-add-changelog.sql (which creates the same
-- table but predates the RLS lockdown and enables no RLS at all — do not run
-- that one). Run this ONCE in Supabase -> SQL Editor, or via the CLI.
--
-- ── What this migration deliberately does NOT do ────────────────────────────
-- An earlier draft of this file (named ...-add-editor-writes-and-changelog.sql)
-- also added a `guidelines_editor_write` RLS policy naming an approved editor's
-- Auth UUID, to support magic-link editor sign-in. That whole approach was
-- dropped: editing is now a LOCAL-ONLY capability performed through the
-- service-role key, which bypasses RLS entirely (see vite.config.ts and
-- src/lib/supabase.ts).
--
-- The consequence is deliberate and load-bearing:
--
--   * public.guidelines is NOT TOUCHED by this migration. It keeps exactly one
--     policy — guidelines_public_read (SELECT, anon+authenticated, using(true))
--     from supabase-migration-readonly-lockdown.sql — and still has NO write
--     policy of any kind. The public anon key shipped in the deployed bundle
--     therefore cannot INSERT, UPDATE or DELETE, whether through the app or by
--     calling the REST API directly.
--   * There are no Auth users, no editor allowlist and no write policy to keep
--     in sync. auth.users is empty and expected to stay empty.
--
-- So this migration does not widen write access at all. It only creates the
-- changelog table the app already expects (its absence is why the UI currently
-- reports "isn't available yet" — PGRST205).
-- ============================================================================

-- ── 1. Changelog table ──────────────────────────────────────────────────────
-- guideline_id is `text` to match public.guidelines.id (text primary key).
create table if not exists public.guideline_changelog (
  id uuid primary key default gen_random_uuid(),
  guideline_id text not null references public.guidelines(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.guideline_changelog is
  'Append-only free-text edit history for guidelines. One row per note. Publicly readable; writable only via the service-role key (no insert/update/delete policy exists), so append-only is enforced at the DB layer for every non-service caller.';

create index if not exists guideline_changelog_guideline_id_idx
  on public.guideline_changelog(guideline_id);
create index if not exists guideline_changelog_created_at_idx
  on public.guideline_changelog(created_at desc);

alter table public.guideline_changelog enable row level security;

-- ── 2. Public READ ──────────────────────────────────────────────────────────
-- DECISION, and the one thing here worth a second opinion: change notes are
-- readable by everyone, matching `guidelines` itself.
--
-- The earlier editor-sign-in draft made this editor-only, reasoning that notes
-- might reference draft or unpublished editorial thinking. That option no
-- longer exists in a useful form: with no Auth users at all, an "authenticated
-- editor only" policy would hide the changelog from literally every visitor,
-- leaving the app's Changelog tab and the per-card history permanently empty
-- on the live site.
--
-- So the real choice is public, or not shipped. Public wins: an audit trail of
-- what changed in clinical guidance is worth showing clinicians, and a single
-- editor writes every note and knows they are public.
--
-- To reverse: drop this policy. Reads then fail closed for anon and
-- authenticated alike, and the app already degrades honestly to its
-- "not available" state (see src/lib/changelog-load.ts).
drop policy if exists changelog_public_read on public.guideline_changelog;
create policy changelog_public_read
  on public.guideline_changelog
  for select
  to anon, authenticated
  using (true);

-- ── 3. No write policy, on purpose ──────────────────────────────────────────
-- With RLS enabled and no insert/update/delete policy, Postgres denies all
-- three for anon and authenticated. The only writer is the service-role key,
-- which bypasses RLS: scripts/*.ts server-side, and the local-only editor UI.
-- Do NOT add a write policy here without re-reading src/lib/supabase.ts —
-- adding one is what would put a write path on the public internet.

-- ============================================================================
-- After running, verify:
--   guidelines           -> 1 policy  (guidelines_public_read), RLS enabled
--   guideline_changelog  -> 1 policy  (changelog_public_read),  RLS enabled
-- Any write policy on `guidelines` means something has gone wrong.
-- ============================================================================


-- ============================================================================
-- ROLLBACK — reverts exactly what this migration added, nothing pre-existing
-- ============================================================================
-- begin;
--   drop policy if exists changelog_public_read on public.guideline_changelog;
--   drop table if exists public.guideline_changelog;
--   -- guidelines is untouched by this migration, so there is nothing to undo
--   -- on it: guidelines_public_read predates this file and stays in place.
-- commit;
-- ============================================================================
