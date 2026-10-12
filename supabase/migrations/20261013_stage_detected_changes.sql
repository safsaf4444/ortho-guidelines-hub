-- ============================================================================
-- Stage 1: route detected changes to existing guidance into the review queue
-- ============================================================================
-- GENERATED FOR REVIEW. Not applied to production. Verified only against a
-- disposable local stack built per supabase/REBUILD-ORDER.md.
--
-- Until now a detected change to an already-catalogued source opened a GitHub
-- issue and nothing else: scripts/detect-changes.ts emitted no candidate, and
-- `matched_guideline_id` was plumbed through every layer while being hardcoded
-- null at scripts/sync-providers.ts:537. So changed guidance never reached the
-- website's review queue at all.
--
-- This migration adds the queue side of that. GitHub issue behaviour is
-- deliberately unchanged — the detector still opens them exactly as before, so
-- this is additive and reversible.
--
-- ── What a revision candidate is, and is not ────────────────────────────────
-- The detector compares a sha256 of stripped page text against a stored
-- baseline. It can therefore say WHICH url changed, FROM which hash TO which,
-- and WHEN. It cannot say what changed in substance, and nothing here asks it
-- to: change_reason is always 'CONTENT_DRIFT', never 'REVISED' or 'WITHDRAWN',
-- because those are editorial judgements a hash cannot supply. No page text is
-- stored, nothing is summarised, and nothing is sent anywhere for analysis.
--
-- ── Two orthogonal keys, which is why they do not fight ─────────────────────
--   * IDENTITY is the content state: candidate_id is derived from
--     (pipeline, provider, reason, url, guideline_id, observed_hash). One row
--     per distinct observed state, forever.
--   * OCCUPANCY is the open review slot: at most one `pending` revision per
--     (matched_guideline_id, changed_url), enforced by a partial unique index.
--
-- A newer state takes a new candidate_id AND the slot; the row it replaces
-- vacates the slot by moving to 'superseded'. Content fields of a candidate
-- are never rewritten — a candidate names one state for its whole life.
-- ============================================================================

begin;

-- ── 1. Columns the queue needs for a revision ───────────────────────────────

-- Per-URL observation time for the monitoring hashes, so a baseline can be
-- refused when it would REGRESS. Queue locking orders the review slot but says
-- nothing about this write, which happens in a separate call after the loop —
-- so without this an older run finishing late overwrites a newer run's hash.
-- Demonstrated end to end before it was fixed.
alter table public.guidelines
  add column if not exists content_hash_seen_at jsonb not null default '{}'::jsonb;

comment on column public.guidelines.content_hash_seen_at is
  'url -> observation timestamp for the matching key in content_hashes. Monitoring state only, like content_hashes itself: it carries no editorial meaning. Used by advance_content_hashes() to reject an out-of-order write.';

alter table public.staged_guidelines
  add column if not exists changed_url        text,
  add column if not exists detection_evidence jsonb not null default '{}'::jsonb,
  add column if not exists state_observed_at  timestamptz,
  add column if not exists superseded_by      uuid,
  add column if not exists superseded_at      timestamptz;

-- Self-reference, added separately so re-running the column block is harmless.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_superseded_by_fkey;
alter table public.staged_guidelines
  add constraint staged_guidelines_superseded_by_fkey
  foreign key (superseded_by) references public.staged_guidelines(id) on delete set null;

comment on column public.staged_guidelines.changed_url is
  'The specific source URL whose content hash moved. A first-class column, not a JSON path, because it is half of the one-pending-per-URL uniqueness rule and that invariant should be legible and indexable.';
comment on column public.staged_guidelines.detection_evidence is
  'Non-key detection detail: baseline_hash, observed_hash, http_status, text_length. Provenance only — never a description of what changed in substance.';
comment on column public.staged_guidelines.state_observed_at is
  'When the observation that made this candidate current was taken. Used to refuse a stale observation that arrives after a newer one, so an older run cannot supersede a newer state.';
comment on column public.staged_guidelines.superseded_by is
  'The candidate that replaced this one in the review slot. Set only by automatic supersession.';
comment on column public.staged_guidelines.superseded_at is
  'When automatic supersession happened. DELIBERATELY SEPARATE from reviewed_at: supersession is a machine action, and recording it in reviewed_at/reviewed_by would assert that a human reviewed this candidate when none did.';

-- ── 2. 'superseded' as a review state ───────────────────────────────────────
-- Keep in step with StructuredCandidate.reviewStatus in src/lib/candidates.ts
-- and ReviewStatus in scripts/lib/ingestion.ts — both updated in this change,
-- as the original constraint's comment requires.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_review_status_check;
alter table public.staged_guidelines
  add constraint staged_guidelines_review_status_check
  check (review_status in ('pending', 'accepted', 'rejected', 'deferred', 'superseded'));

-- ── 3. Invariants for a revision candidate ──────────────────────────────────
-- A revision must name the entry and the URL it concerns; a new-guideline
-- candidate must not pretend to. Both are satisfied by every existing row
-- (NEW_GUIDELINE only), so these validate cleanly.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_revision_needs_target;
alter table public.staged_guidelines
  add constraint staged_guidelines_revision_needs_target
  check (
    change_reason = 'NEW_GUIDELINE'
    or (matched_guideline_id is not null and changed_url is not null)
  );

-- Supersession must record its own timestamp and never borrow the human one.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_superseded_is_machine;
alter table public.staged_guidelines
  add constraint staged_guidelines_superseded_is_machine
  check (
    review_status <> 'superseded'
    or (superseded_at is not null and reviewed_by is null)
  );

-- ── 4. The open review slot ─────────────────────────────────────────────────
-- At most one pending revision per (guideline, url). NEW_GUIDELINE candidates
-- are excluded: they have no matched_guideline_id and are not slot-based.
drop index if exists staged_guidelines_one_pending_revision;
create unique index staged_guidelines_one_pending_revision
  on public.staged_guidelines (matched_guideline_id, changed_url)
  where review_status = 'pending' and change_reason <> 'NEW_GUIDELINE';

comment on index public.staged_guidelines_one_pending_revision is
  'One open revision per source URL. Non-deferrable, so the staging RPC must vacate the slot before inserting its replacement — which it does, in one transaction.';

create index if not exists staged_guidelines_matched_guideline_idx
  on public.staged_guidelines (matched_guideline_id)
  where matched_guideline_id is not null;


-- ── 5. Append-only observation evidence ─────────────────────────────────────
-- Every observation is recorded, including repeat sightings of a state already
-- staged. Earlier evidence is never overwritten, so "how often has this URL
-- moved?" is answerable from data rather than from a counter that could drift.
--
-- No retention policy and no pruning: out of scope for stage 1. The table
-- grows by at most one row per tracked URL per run that sees a change.
create table if not exists public.staged_detections (
  id               uuid        primary key default gen_random_uuid(),
  staged_id        uuid        not null references public.staged_guidelines(id) on delete cascade,

  -- Stable per detector run (GITHUB_RUN_ID, or a per-process uuid locally).
  -- With the UNIQUE below it makes a retried run idempotent: the same run
  -- re-observing the same candidate appends nothing, while a genuinely new run
  -- appends a new observation.
  detection_run_id text        not null,

  baseline_hash    text,
  observed_hash    text        not null,
  observed_at      timestamptz not null,
  http_status      integer,
  text_length      integer,
  created_at       timestamptz not null default now(),

  constraint staged_detections_run_once unique (staged_id, detection_run_id)
);

comment on table public.staged_detections is
  'Append-only record of every content observation that produced or touched a staged candidate. Written ONLY by the detector via stage_detected_change() under the service-role key. Readable by named editors.';

create index if not exists staged_detections_staged_idx
  on public.staged_detections (staged_id, observed_at desc);

alter table public.staged_detections enable row level security;

drop policy if exists staged_detections_editor_read on public.staged_detections;
create policy staged_detections_editor_read
  on public.staged_detections
  for select
  to authenticated
  using (public.is_editor());

-- Deliberately NO insert/update/delete policy, matching staged_guidelines:
-- with RLS enabled that denies all three for anon and authenticated alike.
-- The detector writes as service_role, which bypasses RLS.


-- ── 6. The staging RPC ──────────────────────────────────────────────────────
-- SECURITY INVOKER, NOT DEFINER. This is the whole access-control design:
--   * service_role has table privileges and bypasses RLS, so an INVOKER
--     function does its work.
--   * EXECUTE is granted to service_role ONLY. An editor cannot call it, and
--     because it is not DEFINER there is no owner's-rights path to abuse even
--     if a grant were added by mistake — an authenticated caller would still
--     be stopped by RLS, which has no write policy on either table.
-- A DEFINER function here would hand detector-write capability to whoever
-- holds EXECUTE, which is exactly what must not happen.
--
-- candidate_id is computed by the caller (makeRevisionCandidateId in
-- scripts/lib/ingestion.ts) and passed in, so one hashing implementation is
-- authoritative rather than two that can drift. The trust boundary is the
-- EXECUTE grant: only the detector can call this.

create or replace function public.stage_detected_change(
  p_candidate_id   text,
  p_guideline_id   text,
  p_changed_url    text,
  p_provider       text,
  p_provider_name  text,
  p_topic          text,
  p_baseline_hash  text,
  p_observed_hash  text,
  p_observed_at    timestamptz,
  p_run_id         text,
  p_http_status    integer default null,
  p_text_length    integer default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_existing   public.staged_guidelines;
  v_pending    public.staged_guidelines;
  v_has_exist  boolean := false;
  v_has_pend   boolean := false;
  v_target     uuid;
  v_action     text;
  v_evidence   jsonb;
begin
  if p_observed_hash is null or p_observed_hash = '' then
    raise exception 'stage_detected_change: an observed hash is required'
      using errcode = '22023';
  end if;
  if p_guideline_id is null or p_changed_url is null or p_candidate_id is null then
    raise exception 'stage_detected_change: guideline id, url and candidate id are required'
      using errcode = '22023';
  end if;
  if p_run_id is null or p_run_id = '' then
    raise exception 'stage_detected_change: a run id is required for idempotency'
      using errcode = '22023';
  end if;

  -- SERIALISE PER (guideline, url). Two detector runs touching the same URL
  -- cannot interleave their read-decide-write, so the slot transition is
  -- atomic with respect to any other run. Transaction-scoped, so it is
  -- released on commit or rollback without a separate unlock.
  -- chr(31) (unit separator), NOT a NUL: PostgreSQL does not permit a null
  -- character in a text value, so E' ' is rejected outright. The separator
  -- only has to be absent from ids and URLs, which chr(31) is. This key is
  -- independent of the candidate_id hash material computed in TypeScript.
  perform pg_advisory_xact_lock(
    hashtextextended(p_guideline_id || chr(31) || p_changed_url, 0));

  v_evidence := jsonb_strip_nulls(jsonb_build_object(
    'baseline_hash', p_baseline_hash,
    'observed_hash', p_observed_hash,
    'http_status',   p_http_status,
    'text_length',   p_text_length,
    'detector',      'detect-changes'
  ));

  -- The row for THIS content state, if this state has ever been seen.
  select * into v_existing
    from public.staged_guidelines
   where candidate_id = p_candidate_id
     for update;
  v_has_exist := found;

  -- The row currently holding the open slot for this URL, if any.
  select * into v_pending
    from public.staged_guidelines
   where matched_guideline_id = p_guideline_id
     and changed_url         = p_changed_url
     and review_status       = 'pending'
     and change_reason      <> 'NEW_GUIDELINE'
     for update;
  v_has_pend := found;

  -- STALE OBSERVATION GUARD. A run that started earlier can finish later. An
  -- observation older than the state currently presented must not displace
  -- it, or the queue would go backwards. Evidence is still recorded.
  if v_has_pend
     and v_pending.state_observed_at is not null
     and p_observed_at < v_pending.state_observed_at
     and (not v_has_exist or v_existing.id <> v_pending.id)
  then
    insert into public.staged_detections
      (staged_id, detection_run_id, baseline_hash, observed_hash, observed_at,
       http_status, text_length)
    values
      (coalesce(case when v_has_exist then v_existing.id end, v_pending.id),
       p_run_id, p_baseline_hash, p_observed_hash, p_observed_at,
       p_http_status, p_text_length)
    on conflict (staged_id, detection_run_id) do nothing;

    return jsonb_build_object(
      'action', 'stale_observation_ignored',
      'candidate_id', p_candidate_id,
      'staged_id', coalesce(case when v_has_exist then v_existing.id end, v_pending.id),
      'pending_candidate_id', v_pending.candidate_id);
  end if;

  if v_has_exist then
    -- ── This exact content state has been seen before ──────────────────────
    if v_existing.review_status = 'pending' then
      -- Already the open item. Nothing to move; just record the sighting.
      v_target := v_existing.id;
      v_action := 'already_pending';

    elsif v_existing.review_status = 'superseded' then
      -- Supersession was a MACHINE decision, so reclaiming it asserts nothing
      -- about human intent. Vacate the stale slot holder first, then reopen.
      if v_has_pend and v_pending.id <> v_existing.id then
        update public.staged_guidelines
           set review_status = 'superseded',
               superseded_at = now(),
               superseded_by = v_existing.id
         where id = v_pending.id;
      end if;

      update public.staged_guidelines
         set review_status      = 'pending',
             state_observed_at  = p_observed_at,
             detection_evidence = v_evidence,
             superseded_at      = null,
             superseded_by      = null
       where id = v_existing.id;

      v_target := v_existing.id;
      v_action := 'reclaimed';

    else
      -- 'rejected' or 'accepted': a HUMAN decided about this exact state, so
      -- it is not reopened. But the slot may still be held by a candidate for
      -- a state that is no longer live, and leaving that presented as the
      -- latest change would be a lie — so vacate it and leave the slot empty.
      -- This is the A -> B -> A case: the live state is one already judged.
      if v_has_pend and v_pending.id <> v_existing.id then
        update public.staged_guidelines
           set review_status = 'superseded',
               superseded_at = now(),
               superseded_by = v_existing.id
         where id = v_pending.id;
      end if;

      v_target := v_existing.id;
      v_action := 'decided_state_recurred';
    end if;

  else
    -- ── A state never seen before ──────────────────────────────────────────
    -- VACATE BEFORE INSERT: the partial unique index is not deferrable, so
    -- the slot must be free before the replacement lands. Both statements are
    -- in this transaction, so the queue is never doubled or momentarily empty
    -- from any other session's point of view.
    if v_has_pend then
      update public.staged_guidelines
         set review_status = 'superseded',
             superseded_at = now()
       where id = v_pending.id;
    end if;

    insert into public.staged_guidelines (
      candidate_id, schema_version, pipeline, provider, provider_name,
      topic, source, summary, notes, versions, primary_url,
      change_reason, review_status, discovered_at,
      matched_guideline_id, changed_url, detection_evidence, state_observed_at
    ) values (
      p_candidate_id, 1, 'detect-changes', p_provider, p_provider_name,
      p_topic, p_provider, null, null,
      jsonb_build_array(jsonb_build_object('label', 'Changed source', 'url', p_changed_url)),
      p_changed_url,
      'CONTENT_DRIFT', 'pending', p_observed_at,
      p_guideline_id, p_changed_url, v_evidence, p_observed_at
    )
    on conflict (candidate_id) do nothing
    returning id into v_target;

    if v_target is null then
      -- Lost a race on candidate_id despite the advisory lock (another key's
      -- lock, or a concurrent non-detector writer). Re-read rather than guess.
      select id into v_target from public.staged_guidelines
       where candidate_id = p_candidate_id;
      v_action := 'raced_insert_resolved';
    else
      v_action := 'staged';
    end if;

    -- Point the vacated row at its replacement, now that the id exists.
    if v_has_pend and v_target is not null then
      update public.staged_guidelines
         set superseded_by = v_target
       where id = v_pending.id;
    end if;
  end if;

  -- Evidence, always, and idempotent per run.
  if v_target is not null then
    insert into public.staged_detections
      (staged_id, detection_run_id, baseline_hash, observed_hash, observed_at,
       http_status, text_length)
    values
      (v_target, p_run_id, p_baseline_hash, p_observed_hash, p_observed_at,
       p_http_status, p_text_length)
    on conflict (staged_id, detection_run_id) do nothing;
  end if;

  return jsonb_build_object(
    'action', v_action,
    'candidate_id', p_candidate_id,
    'staged_id', v_target,
    'superseded', v_has_pend and (not v_has_exist or v_existing.id <> v_pending.id));
end;
$$;

comment on function public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer) is
  'Routes one detected content change into the review queue, keeping at most one pending revision per (guideline, url) and never rewriting a candidate''s content fields. Serialises per URL with a transaction advisory lock, refuses an observation older than the state on display, reclaims an automatically superseded state but never a human-decided one, and appends idempotent observation evidence. SECURITY INVOKER; EXECUTE granted to service_role only.';

revoke all on function public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer) from public;
revoke all on function public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer) from anon;
revoke all on function public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer) from authenticated;
grant execute on function public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer) to service_role;


-- ── 7. Merge, never replace, the monitoring hashes ──────────────────────────
-- The detector previously wrote the whole content_hashes object back, built
-- from the copy it read at the start of the row. Any hash another writer had
-- advanced in between was silently discarded. `||` merges server-side, so only
-- the keys actually passed are touched.
--
-- Scope is deliberately two monitoring columns. This function cannot alter a
-- single field of catalogue content.
create or replace function public.advance_content_hashes(
  p_guideline_id text,
  p_hashes       jsonb,
  p_observed_at  timestamptz,
  p_checked_on   date default current_date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_seen      jsonb;
  v_accepted  jsonb := '{}'::jsonb;
  v_rejected  text[] := '{}';
  v_key       text;
  v_prev      timestamptz;
begin
  if p_hashes is null or jsonb_typeof(p_hashes) <> 'object' then
    raise exception 'advance_content_hashes: p_hashes must be a json object'
      using errcode = '22023';
  end if;
  if p_observed_at is null then
    raise exception 'advance_content_hashes: an observation timestamp is required to order writes'
      using errcode = '22023';
  end if;

  -- Serialise concurrent advances for this row, so the read-compare-write
  -- below cannot interleave with another run's.
  perform pg_advisory_xact_lock(hashtextextended('guidelines:' || p_guideline_id, 0));

  select coalesce(content_hash_seen_at, '{}'::jsonb) into v_seen
    from public.guidelines where id = p_guideline_id for update;

  if not found then
    raise exception 'advance_content_hashes: no guideline %', p_guideline_id
      using errcode = 'P0002';
  end if;

  -- PER-KEY ORDERING. A key is accepted only when this observation is at least
  -- as recent as the one behind the stored hash. An older run finishing late
  -- therefore cannot drag a baseline backwards, which would cause the newer
  -- content to be re-detected as a fresh change forever.
  for v_key in select jsonb_object_keys(p_hashes) loop
    v_prev := nullif(v_seen->>v_key, '')::timestamptz;
    if v_prev is null or p_observed_at >= v_prev then
      v_accepted := v_accepted
        || jsonb_build_object(v_key, p_hashes->v_key);
      v_seen := v_seen
        || jsonb_build_object(v_key, to_char(p_observed_at at time zone 'UTC',
                                             'YYYY-MM-DD"T"HH24:MI:SS.USOF'));
    else
      v_rejected := v_rejected || v_key;
    end if;
  end loop;

  if v_accepted <> '{}'::jsonb then
    update public.guidelines
       set content_hashes       = coalesce(content_hashes, '{}'::jsonb) || v_accepted,
           content_hash_seen_at = v_seen,
           -- Never move the check date backwards either.
           last_change_check    = greatest(coalesce(last_change_check, p_checked_on), p_checked_on)
     where id = p_guideline_id;
  end if;

  return jsonb_build_object(
    'accepted', (select coalesce(jsonb_agg(k), '[]'::jsonb) from jsonb_object_keys(v_accepted) k),
    'rejected_as_stale', to_jsonb(v_rejected));
end;
$$;

comment on function public.advance_content_hashes(text, jsonb, timestamptz, date) is
  'Merges observed content hashes into guidelines.content_hashes, per key, and ONLY when the supplied observation is at least as recent as the one behind the stored hash — so an out-of-order run cannot regress a baseline. Merge not replace, so a concurrent writer''s hash for a different URL survives. Serialised per guideline with a transaction advisory lock. Touches no catalogue content field. An observed hash is MONITORING STATE and carries no editorial meaning: advancing it is not acceptance of the change. SECURITY INVOKER; EXECUTE granted to service_role only.';

revoke all on function public.advance_content_hashes(text, jsonb, timestamptz, date) from public;
revoke all on function public.advance_content_hashes(text, jsonb, timestamptz, date) from anon;
revoke all on function public.advance_content_hashes(text, jsonb, timestamptz, date) from authenticated;
grant execute on function public.advance_content_hashes(text, jsonb, timestamptz, date) to service_role;

-- The three-argument form from the first draft of this migration had no
-- ordering guard. Drop it so no caller can reach the unordered behaviour.
drop function if exists public.advance_content_hashes(text, jsonb, date);


-- ── 8. Revisions must not use the new-entry approval path ───────────────────
-- approve_staged_guideline only ever INSERTs into public.guidelines, and
-- candidateToGuidelineDraft mints a fresh slug, so approving a revision there
-- would either collide on the primary key or publish a DUPLICATE entry under a
-- new id. UI gating is not enough: a direct PostgREST caller bypasses it, so
-- the refusal belongs in the function.
--
-- Reproduced verbatim from the live definition with ONE block added, after the
-- lock and the pending test so error precedence is unchanged. The null-safe
-- authorisation guard is preserved exactly: `is_editor() is not true`, because
-- is_editor() returns NULL for a caller with no JWT and a bare `if not ...`
-- would fall through and publish unattributed.

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
  if public.is_editor() is not true then
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

  -- This path PUBLISHES A NEW ENTRY and nothing else. A revision candidate
  -- carries matched_guideline_id and concerns an entry that already exists;
  -- inserting would duplicate it under a second id. Revisions need an
  -- update-in-place path, which stage 1 deliberately does not provide — so
  -- they are refused here rather than mishandled.
  if v_staged.change_reason <> 'NEW_GUIDELINE' then
    raise exception
      'approve_staged_guideline: candidate % is a % candidate; it concerns existing entry %, and must be applied through a revision path rather than published as a new entry',
      p_candidate_id, v_staged.change_reason, coalesce(v_staged.matched_guideline_id, '(unknown)')
      using errcode = '42809';
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
  'Publishes a pending NEW_GUIDELINE candidate and its change note in one transaction, then marks the queue row accepted with auth.uid() and a timestamp. Refuses any other change_reason with 42809: a revision concerns an entry that already exists and would be duplicated by this insert-only path. SECURITY DEFINER, gated on public.is_editor() with a NULL-SAFE check (is not true).';

commit;

-- ============================================================================
-- After running, expect:
--
--   staged_guidelines gains changed_url, detection_evidence, state_observed_at,
--   superseded_by, superseded_at; review_status now admits 'superseded';
--   the one-pending-revision partial unique index exists.
--
--   staged_detections exists with RLS enabled and exactly ONE policy
--   (staged_detections_editor_read, SELECT) and no write policy.
--
--   select r.rolname,
--          has_function_privilege(r.rolname, p.oid, 'EXECUTE')
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     cross join (select rolname from pg_roles
--                  where rolname in ('anon','authenticated','service_role')) r
--    where n.nspname = 'public'
--      and p.proname in ('stage_detected_change','advance_content_hashes');
--   -- expect service_role = true, anon = false, AUTHENTICATED = FALSE.
--   -- An editor must not gain detector-write capability.
--
--   select prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='public' and proname in ('stage_detected_change','advance_content_hashes');
--   -- expect FALSE for both: INVOKER, not DEFINER.
--
--   Catalogue untouched: guidelines and guideline_changelog counts unchanged.
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
--   drop function if exists public.stage_detected_change(text,text,text,text,text,text,text,text,timestamptz,text,integer,integer);
--   drop function if exists public.advance_content_hashes(text, jsonb, date);
--   drop index if exists public.staged_guidelines_one_pending_revision;
--   -- Dropping staged_detections destroys the observation history. Export it
--   -- first if any detection has been recorded.
--   -- drop table if exists public.staged_detections;
--   alter table public.staged_guidelines
--     drop constraint if exists staged_guidelines_revision_needs_target,
--     drop constraint if exists staged_guidelines_superseded_is_machine;
--   -- Restoring the narrower status CHECK FAILS while any row is 'superseded'.
--   -- Resolve those rows first, deliberately, rather than forcing it.
--   -- Re-apply the previous approve_staged_guideline from
--   -- supabase/migrations/20261012_approve_guard_null_safe.sql to drop the
--   -- 42809 guard; keep the null-safe authorisation check either way.
-- commit;
-- ============================================================================
