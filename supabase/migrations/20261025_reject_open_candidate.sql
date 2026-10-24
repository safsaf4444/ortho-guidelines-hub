-- ============================================================================
-- 20261025_reject_open_candidate.sql
-- Reject an OPEN queue row (pending OR deferred), with the decision logged.
--
-- STATUS: verified on a disposable local Supabase only. NOT applied to
-- production. Requires 20261024_discovery_review_queue.sql (refuses without it).
-- ============================================================================
--
-- Why: 20261024 lets an editor DEFER a comparison/edition row, but
-- reject_staged_candidate() (20261012) accepts only 'pending', so a deferred
-- row could be resolved but never rejected. This replaces that function:
--
--   * accepts review_status 'pending' or 'deferred'; anything else is 55000;
--   * NULL-safe editor check (`is_editor() is not true`), as before;
--   * locks the row (FOR UPDATE) BEFORE testing its state, so a reject racing
--     a resolve or an approve serialises and the loser gets 55000;
--   * an OPEN FOLLOW-UP (review_outcome different-document-awaiting-refiling,
--     new-edition-awaiting-revision or needs-document-check) is rejected only
--     with p_confirm_open_follow_up = true; otherwise RQ001, nothing written.
--     Rejecting closes the follow-up, and that must be a deliberate act;
--   * records reviewer, time and reason on the row (as before) and clears
--     review_outcome, so a rejected row never looks like an open follow-up;
--   * appends a 'reject' entry to staged_discovery_decisions with the actor,
--     time, reason, previous status AND previous outcome (new column
--     from_outcome), for EVERY rejected row, whatever its class;
--   * never touches guidelines or guideline_changelog.
--
-- Signature: (uuid, text, boolean DEFAULT false). A caller passing only the
-- first two arguments (the current dashboard, and any older build) still
-- resolves to this function and gets the old behaviour for an ordinary
-- pending row. A caller passing p_confirm_open_follow_up against a database
-- WITHOUT this migration gets PGRST202 (function not found) — the new
-- dashboard reports that as "feature unavailable", never as success.
--
-- from_outcome is written by reject only. A resolve entry's previous outcome
-- is the outcome produced by the preceding log entry for the same row (NULL
-- for the first decision); resolve_discovery_candidate() is NOT redefined
-- here, to keep one definition of it.
-- ============================================================================

begin;

do $$
begin
  if to_regclass('public.staged_discovery_decisions') is null
     or to_regprocedure('public.resolve_discovery_candidate(uuid,text,text)') is null then
    raise exception using
      errcode = '55000',
      message = '20261025_reject_open_candidate: 20261024_discovery_review_queue.sql is not applied.',
      hint    = 'Apply 20261024 first.';
  end if;
end;
$$;

-- ── 1. Decision log: 'reject' action and the previous outcome ───────────────

alter table public.staged_discovery_decisions
  add column if not exists from_outcome text;

comment on column public.staged_discovery_decisions.from_outcome is
  'review_outcome of the queue row immediately before this decision. Written by reject_staged_candidate(); NULL on resolve entries (their previous outcome is the result of the preceding entry).';

-- The 20261024 CHECK is an inline column constraint; Postgres names it
-- <table>_<column>_check. Dropped by that name, then any OTHER check on
-- `action` is refused loudly rather than left to contradict the new one.
alter table public.staged_discovery_decisions
  drop constraint if exists staged_discovery_decisions_action_check;
do $$
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.staged_discovery_decisions'::regclass
                and contype = 'c'
                and pg_get_constraintdef(oid) like '%action%') then
    raise exception '20261025_reject_open_candidate: an unexpected CHECK on staged_discovery_decisions.action remains'
      using errcode = '55000';
  end if;
end;
$$;
alter table public.staged_discovery_decisions
  add constraint staged_discovery_decisions_action_check
  check (action in (
    'same-document', 'different-document', 'no-action', 'new-edition',
    'acknowledged', 'needs-document-check', 'defer', 'reject'));

comment on table public.staged_discovery_decisions is
  'Append-only log of editor decisions on queue rows: every resolve_discovery_candidate() action (including those that leave the row open) and every reject_staged_candidate() rejection. Each records decided_by and decided_at even when the queue row''s reviewed_by/reviewed_at stay NULL. Same trigger protection and the same owner/superuser caveat as staged_discovery_evidence.';

-- ── 2. reject_staged_candidate(uuid, text, boolean) ─────────────────────────

drop function if exists public.reject_staged_candidate(uuid, text);

create or replace function public.reject_staged_candidate(
  p_candidate_id           uuid,
  p_reason                 text,
  p_confirm_open_follow_up boolean default false
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staged public.staged_guidelines;
begin
  -- `is not true`, NOT `if not public.is_editor()`: is_editor() is NULL for a
  -- caller with no JWT (auth.uid() NULL), and `not NULL` would let it through.
  if public.is_editor() is not true then
    raise exception 'reject_staged_candidate: not an approved editor'
      using errcode = '42501';
  end if;

  -- `!~ '\S'`: no non-whitespace character. btrim() alone misses tabs/newlines.
  if p_reason is null or p_reason !~ '\S' then
    raise exception 'reject_staged_candidate: a reason is required'
      using errcode = '23514';
  end if;

  -- LOCK BEFORE TESTING STATE, so concurrent decisions on one row serialise.
  select * into v_staged
    from public.staged_guidelines
   where id = p_candidate_id
     for update;

  if not found then
    raise exception 'reject_staged_candidate: no staged candidate %', p_candidate_id
      using errcode = 'P0002';
  end if;

  -- Only an OPEN row may be rejected: pending, or deferred. accepted (published),
  -- rejected and resolved are decisions already made.
  if v_staged.review_status not in ('pending', 'deferred') then
    raise exception 'reject_staged_candidate: candidate % is already %',
      p_candidate_id, v_staged.review_status
      using errcode = '55000';
  end if;

  -- Rejecting an open follow-up closes it. Require that to be explicit.
  if v_staged.review_outcome in ('different-document-awaiting-refiling',
                                 'new-edition-awaiting-revision',
                                 'needs-document-check')
     and p_confirm_open_follow_up is not true then
    raise exception using
      errcode = 'RQ001',
      message = format('reject_staged_candidate: candidate %s has an open follow-up (%s); confirmation is required',
                       p_candidate_id, v_staged.review_outcome),
      hint    = 'Call again with p_confirm_open_follow_up = true to reject it and close the follow-up. Nothing was changed.';
  end if;

  -- Queue row only. resulting_guideline_id stays NULL: nothing was published.
  update public.staged_guidelines
     set review_status  = 'rejected',
         review_note    = btrim(p_reason, E' \t\r\n'),
         review_outcome = null,
         reviewed_at    = now(),
         reviewed_by    = auth.uid()
   where id = p_candidate_id;

  insert into public.staged_discovery_decisions
    (staged_id, action, from_status, to_status, from_outcome, note, decided_by)
  values
    (p_candidate_id, 'reject', v_staged.review_status, 'rejected', v_staged.review_outcome,
     btrim(p_reason, E' \t\r\n'), auth.uid());

  return v_staged.candidate_id;
end;
$$;

comment on function public.reject_staged_candidate(uuid, text, boolean) is
  'Records a persistent, attributable rejection of an OPEN (pending or deferred) staged candidate: review_status = rejected with the reason, auth.uid() and a timestamp; review_outcome cleared; a ''reject'' decision-log entry with the previous status and outcome. An open follow-up requires p_confirm_open_follow_up = true (else RQ001). Refuses a closed row (55000). Touches neither guidelines nor guideline_changelog. SECURITY DEFINER, gated on is_editor() is not true.';

revoke all on function public.reject_staged_candidate(uuid, text, boolean) from public;
revoke all on function public.reject_staged_candidate(uuid, text, boolean) from anon;
grant execute on function public.reject_staged_candidate(uuid, text, boolean) to authenticated;

commit;

-- PostgREST must see the new signature.
notify pgrst, 'reload schema';

-- ============================================================================
-- Verify after applying:
--   select pg_get_function_identity_arguments('public.reject_staged_candidate'::regproc);
--     -- p_candidate_id uuid, p_reason text, p_confirm_open_follow_up boolean
--   select r.rolname, has_function_privilege(r.rolname,
--          'public.reject_staged_candidate(uuid,text,boolean)', 'EXECUTE')
--     from pg_roles r where r.rolname in ('anon','authenticated');   -- f, t
--
-- ROLLBACK (local or pre-production only):
--   drop function public.reject_staged_candidate(uuid, text, boolean);
--   then re-run the function section of 20261012_reject_staged_candidate.sql;
--   restore the action CHECK without 'reject' (fails while any 'reject' entry
--   exists — export the log first; the append-only triggers block deleting it);
--   alter table public.staged_discovery_decisions drop column from_outcome;
-- ============================================================================
