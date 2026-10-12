-- ============================================================================
-- DDL for public.guidelines_backup_20260713 — recovery use only
-- ============================================================================
-- THIS TABLE IS NOT BEING DROPPED, and this file does not drop it. It exists
-- in production and stays there. This file exists so that the 171 rows already
-- captured in the backup set are RESTORABLE, which they were not: a restore
-- driven by supabase/REBUILD-ORDER.md creates no such table, so both the data
-- loader and the grants file failed against it during the 2026-10-11 drill.
--
-- NOT part of a normal rebuild. Apply this only when restoring a backup whose
-- data set includes data/guidelines_backup_20260713.json.
--
-- ── What this table is ──────────────────────────────────────────────────────
-- An ad-hoc snapshot of public.guidelines taken on 13 July 2026, created
-- outside the migration chain — no repository file creates it and the
-- migration ledger does not record it. Captured state (read-only,
-- 2026-10-12):
--
--   rows         171          (production guidelines now holds 231)
--   columns      22           (production guidelines now has 29)
--   constraints  none
--   indexes      none         -- no primary key: `id` is NOT unique-enforced
--   RLS          enabled, FORCED = false
--   policies     NONE
--   owner        postgres
--   id fingerprint  bbf5f8012801648b85728de1230729a6
--
-- Every column is nullable with no default, and there are no constraints or
-- indexes. That is the signature of `create table ... as select * from
-- public.guidelines`: CTAS copies column names and types but carries over no
-- constraint, default, index or not-null marking. The DDL below reproduces
-- that shape exactly rather than tidying it, because the point is to match
-- what the backed-up rows came out of.
--
-- ── A standing issue this table has, flagged not fixed ──────────────────────
-- RLS is enabled with NO policy. The Supabase linter reports this as
-- rls_enabled_no_policy. With RLS on and no policy, anon and authenticated
-- SELECT nothing — but the table-level grants on it are the same wide set the
-- other tables carry. It holds a 60-rows-behind copy of the catalogue and is
-- not referenced by any application code. Whether it should continue to exist
-- is a separate decision, deliberately not taken here.
-- ============================================================================

create table if not exists public.guidelines_backup_20260713 (
  id text,
  section text,
  type text,
  topic text,
  sub_group text,
  source text,
  summary text,
  notes text,
  status text,
  regional_variation boolean,
  local_overlay_needed boolean,
  last_checked date,
  cross_listed_in jsonb,
  priority text,
  archived boolean,
  source_access_status text,
  versions jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  link_verification_status text,
  link_last_verified date,
  link_verification_notes text
);

comment on table public.guidelines_backup_20260713 is
  'Ad-hoc snapshot of public.guidelines taken 2026-07-13, created outside the migration chain. 171 rows, 22 columns, no constraints or indexes. Not referenced by application code. DDL reconstructed from the live catalogue on 2026-10-12 so that backed-up rows remain restorable.';

-- Reproduce the live security posture: RLS on, no policy. Do NOT add a policy
-- here — production has none, and inventing one would change semantics.
alter table public.guidelines_backup_20260713 enable row level security;

-- Table grants, matching production. See the note above: these are wide
-- because every table in this schema carries the platform default, not
-- because this table needs them.
grant delete, insert, references, select, trigger, truncate, update
  on public.guidelines_backup_20260713 to anon, authenticated, service_role;

-- ============================================================================
-- Verify after applying, against the capture above:
--   select count(*) from public.guidelines_backup_20260713;              -- 171 once loaded
--   select md5(string_agg(id,'|' order by id))
--     from public.guidelines_backup_20260713;   -- bbf5f8012801648b85728de1230729a6
--   select relrowsecurity, relforcerowsecurity
--     from pg_class where oid='public.guidelines_backup_20260713'::regclass;  -- t, f
--   select count(*) from pg_policies
--    where tablename='guidelines_backup_20260713';                        -- 0
-- ============================================================================
