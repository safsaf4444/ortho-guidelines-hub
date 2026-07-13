-- Orthopaedic Guidelines Hub — Supabase schema
-- Paste this into the Supabase SQL editor (Dashboard → SQL Editor → New query).

create table if not exists public.guidelines (
  id                    text        primary key,
  section               text        not null,
  type                  text        not null,
  topic                 text        not null,
  sub_group             text,
  source                text        not null,
  summary               text,
  notes                 text,
  status                text        not null,
  regional_variation    boolean     not null default false,
  local_overlay_needed  boolean     not null default false,
  last_checked          date,
  cross_listed_in       jsonb       not null default '[]'::jsonb,
  priority              text,
  archived              boolean     not null default false,
  source_access_status  text,
  link_verification_status text     not null default 'unchecked',
  link_last_verified    date,
  link_verification_notes text,
  versions              jsonb       not null default '[]'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  -- Status values match both static data and the UI dropdown options
  constraint guidelines_status_check
    check (status in (
      'Live', 'Archived', 'Flagged',
      'To source', 'Drafted', 'Reviewed', 'Under review'
    )),
  constraint guidelines_priority_check
    check (priority in ('high', 'medium', 'low') or priority is null),
  constraint guidelines_source_access_check
    check (source_access_status in ('accessible', 'login-required', 'broken') or source_access_status is null),
  constraint guidelines_link_verification_check
    check (link_verification_status in ('unchecked', 'needs-review', 'broken', 'verified'))
);

-- Auto-update updated_at whenever a row is modified
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_guidelines_updated_at on public.guidelines;

create trigger set_guidelines_updated_at
  before update on public.guidelines
  for each row execute function public.set_updated_at();

-- Indexes for common access patterns
create index if not exists idx_guidelines_section on public.guidelines(section);
create index if not exists idx_guidelines_status  on public.guidelines(status);

-- RLS: disabled for prototype phase.
-- To add read-only public access later:
--   alter table public.guidelines enable row level security;
--   create policy "read_all"   on public.guidelines for select using (true);
--   create policy "write_auth" on public.guidelines for all   using (auth.uid() is not null);
alter table public.guidelines disable row level security;

-- ─── Migration: link verification fields (content-quality phase) ──────────────
-- Safe to re-run. Adds columns if this table already existed before this change,
-- then backfills link_verification_status from the older source_access_status
-- field so no review history is lost.

alter table public.guidelines
  add column if not exists link_verification_status text not null default 'unchecked',
  add column if not exists link_last_verified date,
  add column if not exists link_verification_notes text;

do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'guidelines' and constraint_name = 'guidelines_link_verification_check'
  ) then
    alter table public.guidelines
      add constraint guidelines_link_verification_check
      check (link_verification_status in ('unchecked', 'needs-review', 'broken', 'verified'));
  end if;
end $$;

update public.guidelines
set link_verification_status = case source_access_status
  when 'accessible'      then 'verified'
  when 'broken'           then 'broken'
  when 'login-required'   then 'needs-review'
  else 'unchecked'
end
where link_verification_status = 'unchecked' and source_access_status is not null;
