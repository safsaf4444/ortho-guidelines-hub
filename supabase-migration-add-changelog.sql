-- Adds a lightweight, append-only edit-history log for guidelines.
-- Safe to run more than once (IF NOT EXISTS guards).
-- Run this once in Supabase -> SQL Editor.
--
-- Scope (deliberate): free-text notes with a timestamp, one row per note.
-- This is NOT a diff/versioning/rollback system — entries are append-only and
-- there is intentionally no update/delete path in the app.
--
-- guideline_id is `text` to match public.guidelines.id (text primary key).

create table if not exists public.guideline_changelog (
  id uuid primary key default gen_random_uuid(),
  guideline_id text not null references public.guidelines(id) on delete cascade,
  description text not null,
  created_at timestamptz not null default now()
);

comment on table public.guideline_changelog is
  'Append-only free-text edit history for guidelines. One row per note. No diff/rollback — see Feature 2 scope decision.';

create index if not exists guideline_changelog_guideline_id_idx
  on public.guideline_changelog(guideline_id);

create index if not exists guideline_changelog_created_at_idx
  on public.guideline_changelog(created_at desc);
