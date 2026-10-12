-- ============================================================================
-- Make the approve_staged_guideline editor guard null-safe
-- ============================================================================
-- ONE LINE OF BEHAVIOUR CHANGES. Everything else in this file is the current
-- production function reproduced verbatim, so that `create or replace` does
-- not silently alter anything else.
--
--     -  if not public.is_editor() then
--     +  if public.is_editor() is not true then
--
-- ── The defect ──────────────────────────────────────────────────────────────
-- public.is_editor() is `select auth.uid() = any (array[...uuid])`. For a
-- caller with no JWT, auth.uid() is NULL, and `NULL = any (...)` evaluates to
-- NULL — not false. So is_editor() returns NULL, `not NULL` is NULL, and
--
--     if not public.is_editor() then raise ... end if;
--
-- DOES NOT FIRE. Execution falls straight through the guard and the function
-- proceeds to publish, writing reviewed_by = auth.uid() = NULL: a catalogue
-- entry and a changelog row with no recorded approver.
--
-- Verified against production read-only on 2026-10-11:
--     auth.uid() -> null,  is_editor() -> NULL,  (not is_editor()) is true -> false
--
-- anon never reaches this, because anon holds no EXECUTE on the function —
-- which is why an anon-denial test passes without exercising the guard at all.
-- service_role is the caller that matters, and it DOES hold EXECUTE:
-- has_function_privilege('service_role', 'approve_staged_guideline', 'EXECUTE')
-- is true in production despite `revoke all ... from public`, because Supabase
-- grants it separately through default privileges. The grant is not the
-- control here; this guard is.
--
-- The identical defect in reject_staged_candidate was fixed before that
-- function was ever applied. This one is live, and it is the more serious of
-- the two because this function PUBLISHES.
--
-- ── What is deliberately NOT changed ────────────────────────────────────────
--   * The signature: (uuid, jsonb, text) returns text. Unchanged, so no
--     dependent grant is dropped and no caller needs updating.
--   * SECURITY DEFINER, and `set search_path` — unchanged.
--   * Every other statement, including the change-note check, the row lock
--     before the pending test, the 42501/23514/P0002/55000/23502 paths, the
--     insert into guidelines, the changelog insert and the queue update.
--   * Grants. `create or replace` preserves them, so this migration issues no
--     GRANT or REVOKE. Production's state — anon false, authenticated true,
--     service_role true — carries over untouched.
--   * Policies. None are created, altered or dropped.
--
-- Note on the change-note check: `length(btrim(p_changelog_note)) = 0` is
-- reproduced AS IS. btrim with no second argument strips spaces only, so a
-- note of a single tab or newline still passes. That is a real flaw and it is
-- deliberately left alone here — it is a separate fix with a separate
-- behavioural decision, and folding it in would make this migration
-- unreviewable as a security change.
--
-- ── Verification before this is applied anywhere ────────────────────────────
-- Tested on a disposable local stack built per supabase/REBUILD-ORDER.md:
-- an authorised editor still publishes atomically with attribution; non-editor,
-- service_role and missing-JWT callers are all refused 42501; refused calls
-- leave guidelines, guideline_changelog and staged_guidelines untouched; and
-- the pre-fix guard was shown to publish with reviewed_by = NULL under the
-- same service_role call that the fixed guard refuses.
-- ============================================================================

begin;

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
  'Publishes a pending staged candidate and its change note in one transaction, then marks the queue row accepted with auth.uid() and a timestamp. SECURITY DEFINER, gated on public.is_editor() with a NULL-SAFE check (`is not true`): is_editor() returns NULL when auth.uid() is null, and a bare `if not ...` would fall through and publish unattributed.';

commit;

-- ============================================================================
-- After running, expect:
--
--   select prosecdef, proconfig,
--          pg_get_functiondef(oid) like '%is_editor() is not true%' as null_safe,
--          pg_get_functiondef(oid) like '%if not public.is_editor() then%' as bare_if_not
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'approve_staged_guideline';
--   -- expect t, {search_path=public, pg_temp}, t, f
--
--   select r.rolname, has_function_privilege(
--            r.rolname, 'public.approve_staged_guideline(uuid,jsonb,text)', 'EXECUTE')
--     from pg_roles r where r.rolname in ('anon','authenticated','service_role');
--   -- expect anon = false, authenticated = true, service_role = true
--   -- (unchanged: create or replace preserves grants)
--
--   -- And the catalogue must be untouched by the migration itself:
--   select count(*) from public.guidelines;            -- unchanged
--   select count(*) from public.guideline_changelog;   -- unchanged
-- ============================================================================

-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- Re-apply the PREVIOUS definition. Capture it verbatim before applying this
-- migration and keep it with the change:
--
--   select pg_get_functiondef(
--     'public.approve_staged_guideline(uuid,jsonb,text)'::regprocedure);
--
-- Captured 2026-10-12 from production, for reference:
--   length 4078, md5 (CR-stripped) 17efdb9cdf28346ab52027ba40aef52a
--
-- Rolling back restores the unattributed-publication defect. Prefer fixing
-- forward.
-- ============================================================================
