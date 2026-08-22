-- Adds change-detection support to the existing guidelines table.
-- Safe to run more than once (IF NOT EXISTS guards).
-- Run this once in Supabase -> SQL Editor.

alter table public.guidelines
  add column if not exists content_hashes jsonb not null default '{}'::jsonb;

comment on column public.guidelines.content_hashes is
  'Map of { url: sha256-hash-of-visible-text } for every URL attached to this row (primary, fallback, version links). Written by scripts/detect-changes.ts, used to detect real content changes between scheduled runs.';

alter table public.guidelines
  add column if not exists last_change_check date;

comment on column public.guidelines.last_change_check is
  'Date the automated change-detection script last successfully checked this row (distinct from link_last_verified, which is only updated on a human-approved verification).';
