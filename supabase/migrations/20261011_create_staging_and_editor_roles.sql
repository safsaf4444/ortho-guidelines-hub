-- ============================================================================
-- Staging queue, editor-allowlist writes, and the atomic approve RPC
-- ============================================================================
-- Applied to xutjahmbyrvifcltpxxu on 2026-10-11.
--
-- ── Why this migration exists ──────────────────────────────────────────────
-- Until this ran, the live policy state was:
--
--   guidelines           guidelines_public_read    SELECT  anon, authenticated
--                        guidelines_public_insert  INSERT  anon, authenticated  (true)
--                        guidelines_public_update  UPDATE  anon, authenticated  (true)
--   guideline_changelog  changelog_public_read     SELECT  anon, authenticated
--                        changelog_public_insert   INSERT  anon, authenticated  (true)
--
-- i.e. any anonymous visitor could insert or update any of the 231 clinical
-- guideline rows with one curl call against the public anon key, which ships
-- in every JS bundle. supabase-migration-public-write-access.sql was the
-- deployed state; supabase-migration-readonly-lockdown.sql had been
-- superseded. src/App.tsx also had WRITES_ENABLED = true.
--
-- This migration closes that. Writes now require being a named editor in
-- public.is_editor(), checked by RLS at the database layer — not by the UI.
-- ============================================================================

begin;

-- ── 0. The editor allowlist ────────────────────────────────────────────────
-- ONE place defines who may write. Policies and the approve RPC both call it,
-- so there is no way to satisfy one and not the other.
--
-- This is a hardcoded UUID allowlist, deliberately, NOT `auth.role() =
-- 'authenticated'`. The role check would grant write access to anyone who can
-- self-register, if public sign-ups are ever enabled on the project. The
-- allowlist holds regardless of the project's sign-up setting.
--
-- TO ADD AN EDITOR: create the Auth user (Dashboard -> Authentication ->
-- Users -> Add user), then re-run this function definition with their UUID
-- appended to the array. That is the only change needed — no policy DDL.
--
-- STABLE, so Postgres evaluates it once per statement rather than per row.
-- search_path is pinned so `auth` cannot be shadowed by a caller-created
-- schema.
create or replace function public.is_editor()
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select auth.uid() = any (array[
    -- safa.dubai@gmail.com — created 2026-09-09
    '61bfc1d3-0731-49e3-9513-00acf9b2d08b'::uuid
  ]);
$$;

comment on function public.is_editor() is
  'True when the current request is authenticated as one of the named editors. The single source of truth for write permission: every RLS write policy and approve_staged_guideline() call it. A hardcoded UUID allowlist, not a role check, so enabling public sign-ups cannot grant write access.';

-- Readable by both roles so the policies can call it under either.
-- Returns false (never errors) for anon, since auth.uid() is null there.
grant execute on function public.is_editor() to anon, authenticated;


-- ── 1. staged_guidelines — the ingestion waiting room ───────────────────────
-- Column shape mirrors StructuredCandidate in src/lib/candidates.ts (there is
-- no `StagedGuidelineCandidate` interface in the repo; StructuredCandidate is
-- the real contract, owned by scripts/lib/ingestion.ts). camelCase TS fields
-- map to snake_case columns the same way src/lib/guidelines-mapper.ts does it.

create table if not exists public.staged_guidelines (
  id                    uuid        primary key default gen_random_uuid(),

  -- The pipeline's own deterministic candidate id (StructuredCandidate.candidateId).
  -- UNIQUE so the GitHub Action can upsert on it and re-running the scraper
  -- does not duplicate the queue.
  candidate_id          text        not null unique,
  schema_version        integer     not null default 1,

  pipeline              text,
  provider              text        not null,
  provider_name         text,

  topic                 text        not null,
  -- Human-readable publisher label; `provider` is the adapter slug. Kept
  -- separate because the UI shows one and the pipeline keys on the other.
  source                text,
  summary               text,
  notes                 text,

  -- CandidateVersionLink[] — [{ label, url, date? }]
  versions              jsonb       not null default '[]'::jsonb,
  primary_url           text,

  change_reason         text        not null,
  review_status         text        not null default 'pending',

  discovered_at         timestamptz,
  provider_ref          text,

  -- Candidate the pipeline thinks this updates. text, not uuid: guidelines.id
  -- is a text slug (e.g. 'girft-bunions'), not a uuid.
  matched_guideline_id  text        references public.guidelines(id) on delete set null,

  -- Filled in by approve_staged_guideline(); the row this candidate became.
  resulting_guideline_id text       references public.guidelines(id) on delete set null,
  reviewed_at           timestamptz,
  reviewed_by           uuid        references auth.users(id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint staged_guidelines_change_reason_check
    check (change_reason in (
      'NEW_GUIDELINE', 'REVISED', 'WITHDRAWN',
      'CONTENT_DRIFT', 'URL_MOVED', 'UNREACHABLE_LINK'
    )),

  -- Exactly StructuredCandidate.reviewStatus in src/lib/candidates.ts, with no
  -- extra members. approve_staged_guideline() sets 'accepted'. If you add a
  -- status here, add it to that TS union in the same change.
  constraint staged_guidelines_review_status_check
    check (review_status in ('pending', 'accepted', 'rejected', 'deferred'))
);

comment on table public.staged_guidelines is
  'Ingestion waiting room. Written ONLY by the sync GitHub Action using the service-role key (no INSERT/UPDATE/DELETE policy exists, so RLS denies all three for anon and authenticated alike). Readable by named editors. Rows leave the queue via approve_staged_guideline().';

create index if not exists staged_guidelines_review_status_idx
  on public.staged_guidelines(review_status);
create index if not exists staged_guidelines_discovered_at_idx
  on public.staged_guidelines(discovered_at desc);

drop trigger if exists set_staged_guidelines_updated_at on public.staged_guidelines;
create trigger set_staged_guidelines_updated_at
  before update on public.staged_guidelines
  for each row execute function public.set_updated_at();

alter table public.staged_guidelines enable row level security;

-- SELECT for named editors only. The queue is pre-editorial material:
-- unreviewed scraper output not yet judged in scope, so it is NOT public the
-- way `guidelines` and `guideline_changelog` are.
drop policy if exists staged_guidelines_editor_read on public.staged_guidelines;
create policy staged_guidelines_editor_read
  on public.staged_guidelines
  for select
  to authenticated
  using (public.is_editor());

-- Deliberately NO insert/update/delete policy. With RLS enabled that denies
-- all three for anon AND authenticated. The GitHub Action writes with
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. The approve path writes
-- through the SECURITY DEFINER function in section 3, not through a policy.


-- ── 2. Close anonymous writes; re-grant to named editors ────────────────────
-- This is the section with immediate consequences for the live site.

-- 2a. Drop the anonymous write policies. This is the fix.
drop policy if exists guidelines_public_insert on public.guidelines;
drop policy if exists guidelines_public_update on public.guidelines;
drop policy if exists changelog_public_insert  on public.guideline_changelog;

-- 2b. Editor-only writes, gated on the allowlist.
--
-- `to authenticated` narrows the role before the expression runs; is_editor()
-- then narrows to the named UUIDs. Both are needed: the role clause alone
-- would admit any self-registered user, and is_editor() alone would still be
-- evaluated for anon on every request.
drop policy if exists guidelines_editor_insert on public.guidelines;
create policy guidelines_editor_insert
  on public.guidelines
  for insert
  to authenticated
  with check (public.is_editor());

drop policy if exists guidelines_editor_update on public.guidelines;
create policy guidelines_editor_update
  on public.guidelines
  for update
  to authenticated
  using (public.is_editor())
  with check (public.is_editor());

-- Changelog INSERT for editors. Table is public.guideline_changelog (not
-- `changelog`), and the note column is `description` (not `note`).
drop policy if exists changelog_editor_insert on public.guideline_changelog;
create policy changelog_editor_insert
  on public.guideline_changelog
  for insert
  to authenticated
  with check (public.is_editor());

-- Archive-only model preserved: NO delete policy on public.guidelines, and no
-- update/delete policy on public.guideline_changelog. `guidelines` already had
-- no DELETE policy (supabase-migration-soft-delete-and-mandatory-notes.sql
-- dropped it); the app's "Delete" is UPDATE ... SET archived = true, which
-- guidelines_editor_update covers. The changelog stays append-only.
--
-- guidelines_public_read and changelog_public_read are NOT touched: the
-- catalogue and its audit trail stay publicly readable for clinicians. Only
-- writing changed.


-- ── 3. approve_staged_guideline — the 1-click approve RPC ───────────────────
-- SECURITY DEFINER, because step (a) updates staged_guidelines, which has no
-- UPDATE policy for anyone. A SECURITY INVOKER function would be silently
-- blocked by RLS there. Being DEFINER means the allowlist check has to be made
-- explicitly inside the body, and EXECUTE has to be revoked from anon — both
-- below. search_path is pinned so a caller cannot shadow `guidelines` with a
-- table of their own.
--
-- Returns the live guidelines.id (text) that was created.
--
-- All three writes run in one transaction: a plpgsql function body is a single
-- transaction, so any exception rolls back the staged-row update, the guideline
-- insert and the changelog insert together. There is no partial state where a
-- guideline is published without its changelog note — which is the gap the
-- comment at src/App.tsx persistGuideline documents for the old two-request
-- PostgREST path.

create or replace function public.approve_staged_guideline(
  p_candidate_id         uuid,
  p_final_guideline_data jsonb,
  p_changelog_note       text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staged public.staged_guidelines;
  v_new    public.guidelines;
  v_id     text;
begin
  -- Mandatory: a DEFINER function runs with the owner's rights, so without
  -- this check the anon key could publish. Same allowlist as the RLS policies,
  -- so this RPC is not a way around them.
  if not public.is_editor() then
    raise exception 'approve_staged_guideline: not an approved editor'
      using errcode = '42501';
  end if;

  if p_changelog_note is null or length(btrim(p_changelog_note)) = 0 then
    raise exception 'approve_staged_guideline: a change note is required'
      using errcode = '23514';
  end if;

  -- Lock the queue row so two editors clicking Approve at once cannot both win.
  select * into v_staged
    from public.staged_guidelines
   where id = p_candidate_id
     for update;

  if not found then
    raise exception 'approve_staged_guideline: no staged candidate %', p_candidate_id
      using errcode = 'P0002';
  end if;

  if v_staged.review_status <> 'pending' then
    raise exception 'approve_staged_guideline: candidate % is already %',
      p_candidate_id, v_staged.review_status
      using errcode = '55000';
  end if;

  -- Shape the payload against the real table definition, so an unknown or
  -- misspelled key is a hard error here rather than a silently dropped field.
  v_new := jsonb_populate_record(null::public.guidelines, p_final_guideline_data);

  if v_new.id is null or length(btrim(v_new.id)) = 0 then
    raise exception 'approve_staged_guideline: p_final_guideline_data.id is required'
      using errcode = '23502';
  end if;

  -- (b) Publish to the live catalogue. created_at / updated_at are left to
  -- their column defaults. The NOT NULL columns that carry defaults are
  -- coalesced, because jsonb_populate_record yields NULL for absent keys and
  -- NULL would violate the constraint rather than fall back to the default.
  insert into public.guidelines (
    id, section, type, topic, sub_group, source, summary, notes, status,
    regional_variation, local_overlay_needed, last_checked, cross_listed_in,
    priority, archived, source_access_status, versions,
    link_verification_status, link_last_verified, link_verification_notes,
    content_hashes, last_change_check,
    source_type, guidance_status, scope_note, editorial_review_date,
    inclusion_reason
  ) values (
    v_new.id, v_new.section, v_new.type, v_new.topic, v_new.sub_group,
    v_new.source, v_new.summary, v_new.notes, v_new.status,
    coalesce(v_new.regional_variation, false),
    coalesce(v_new.local_overlay_needed, false),
    v_new.last_checked,
    coalesce(v_new.cross_listed_in, '[]'::jsonb),
    v_new.priority,
    coalesce(v_new.archived, false),
    v_new.source_access_status,
    coalesce(v_new.versions, '[]'::jsonb),
    coalesce(v_new.link_verification_status, 'unchecked'),
    v_new.link_last_verified, v_new.link_verification_notes,
    coalesce(v_new.content_hashes, '{}'::jsonb),
    v_new.last_change_check,
    coalesce(v_new.source_type, 'national'),
    coalesce(v_new.guidance_status, 'current'),
    v_new.scope_note, v_new.editorial_review_date, v_new.inclusion_reason
  )
  returning id into v_id;

  -- (c) Audit note, pointing at the row just published.
  insert into public.guideline_changelog (guideline_id, description)
  values (v_id, btrim(p_changelog_note));

  -- (a) Retire the queue row. 'accepted' matches
  -- StructuredCandidate.reviewStatus in src/lib/candidates.ts exactly.
  update public.staged_guidelines
     set review_status          = 'accepted',
         reviewed_at            = now(),
         reviewed_by            = auth.uid(),
         resulting_guideline_id = v_id
   where id = p_candidate_id;

  return v_id;
end;
$$;

comment on function public.approve_staged_guideline(uuid, jsonb, text) is
  'Atomically publishes a staged candidate: marks the staged_guidelines row accepted, inserts the reviewed row into guidelines, and appends the editor note to guideline_changelog. Any failure rolls back all three. SECURITY DEFINER, gated on public.is_editor() — the same allowlist the RLS policies use.';

-- Only the authenticated role may call it, and is_editor() inside decides
-- whether the call proceeds. Without these revokes a DEFINER function is
-- executable by PUBLIC, which includes the anon key.
revoke all on function public.approve_staged_guideline(uuid, jsonb, text) from public;
revoke all on function public.approve_staged_guideline(uuid, jsonb, text) from anon;
grant execute on function public.approve_staged_guideline(uuid, jsonb, text) to authenticated;

commit;

-- ============================================================================
-- After running, expect:
--   guidelines           3 policies: guidelines_public_read (SELECT, anon+auth),
--                        guidelines_editor_insert, guidelines_editor_update
--                        (authenticated + is_editor()). NO delete policy.
--   guideline_changelog  2 policies: changelog_public_read (SELECT, anon+auth),
--                        changelog_editor_insert (authenticated + is_editor()).
--                        Append-only.
--   staged_guidelines    1 policy:  staged_guidelines_editor_read (SELECT,
--                        authenticated + is_editor()). No write policy —
--                        service role only.
--
-- Verify anon really is shut out (all should return 401/403/empty):
--   curl -X POST "$URL/rest/v1/guidelines" -H "apikey: $ANON" ... -d '{...}'
--   curl "$URL/rest/v1/staged_guidelines" -H "apikey: $ANON"
--   curl -X POST "$URL/rest/v1/rpc/approve_staged_guideline" -H "apikey: $ANON" ...
-- ============================================================================


-- ============================================================================
-- ROLLBACK — restores the pre-migration state exactly, INCLUDING the public
-- anonymous write access that was live before it. Read section 2 first: this
-- re-opens the hole this migration closed. Almost certainly not what you want.
-- ============================================================================
-- begin;
--   drop function if exists public.approve_staged_guideline(uuid, jsonb, text);
--   drop policy if exists staged_guidelines_editor_read on public.staged_guidelines;
--   drop table if exists public.staged_guidelines;
--   drop policy if exists guidelines_editor_insert on public.guidelines;
--   drop policy if exists guidelines_editor_update on public.guidelines;
--   drop policy if exists changelog_editor_insert  on public.guideline_changelog;
--   drop function if exists public.is_editor();
--   -- Re-opens anonymous writes. Only if you intend that:
--   create policy guidelines_public_insert on public.guidelines
--     for insert to anon, authenticated with check (true);
--   create policy guidelines_public_update on public.guidelines
--     for update to anon, authenticated using (true) with check (true);
--   create policy changelog_public_insert on public.guideline_changelog
--     for insert to anon, authenticated with check (true);
-- commit;
--
-- To revoke writes WITHOUT re-opening them (the safe panic button), just empty
-- the allowlist instead — one statement, no policy changes:
--   create or replace function public.is_editor() returns boolean
--     language sql stable security invoker set search_path = public, pg_temp
--     as $fn$ select false $fn$;
-- ============================================================================
