-- ============================================================================
-- Persistent, attributable rejection of staged candidates
-- ============================================================================
-- GENERATED FOR REVIEW. Not applied to production. Verified only against a
-- disposable local Supabase stack built per supabase/REBUILD-ORDER.md.
--
-- ── Why ─────────────────────────────────────────────────────────────────────
-- Until now there was no way to reject a candidate. The dashboard's "Dismiss"
-- was React state: it hid a card until the next page load and wrote nothing.
-- A search of src/ and scripts/ found exactly ONE reference to 'rejected' —
-- a read comparison — so no code path set it, and `staged_guidelines` carries
-- no UPDATE policy for any role, so no client could have set it either.
--
-- The consequence was that every weekly run re-presented items an editor had
-- already judged out of scope, with nothing to distinguish them from genuinely
-- new finds. Discovery currently yields 47 candidates including non-guidance
-- material (course manuals, example algorithms), so a working reject is what
-- makes the queue clearable at all.
--
-- ── Shape ───────────────────────────────────────────────────────────────────
-- Deliberately mirrors approve_staged_guideline: SECURITY DEFINER (because the
-- table has no UPDATE policy, so a SECURITY INVOKER function would be silently
-- blocked by RLS), the same is_editor() allowlist check inside the body, the
-- same row lock before the state test, the same 55000 for an already-processed
-- candidate, and the same pinned search_path. Anything that behaves differently
-- between the two is a trap for whoever reads one and assumes the other.
--
-- What it does NOT do: touch public.guidelines or public.guideline_changelog.
-- A rejection publishes nothing, so it records nothing in the catalogue or its
-- audit trail. The queue row is the record.
-- ============================================================================

begin;

-- ── 1. Somewhere to put the reason ──────────────────────────────────────────
alter table public.staged_guidelines
  add column if not exists review_note text;

comment on column public.staged_guidelines.review_note is
  'The editor''s reason for the recorded review decision. Required on rejection and enforced by a CHECK, so "why was this turned down?" is answerable six months later. Not shown publicly: the queue is editor-only.';

-- A rejection without a reason is an unexplained editorial decision, and the
-- reason is the only thing distinguishing "out of scope" from "looked at it
-- and forgot why". Enforced at the database so it also holds for a direct API
-- caller, exactly like guideline_changelog_description_not_blank.
--
-- Safe to add: `rejected` is currently unreachable, so no existing row can
-- violate it. Verified 0 rows in staged_guidelines at the time of writing.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_rejection_needs_note;

-- `review_note ~ '\S'` — "contains at least one non-whitespace character" —
-- NOT length(btrim(...)) > 0.
--
-- btrim() with no second argument strips SPACES ONLY. A tab or a newline
-- survives it, so length(btrim(E'\t')) is 1 and a note of a single tab passes
-- as non-blank. Caught by the local suite: a reason of "   \n\t " was accepted
-- and recorded as an editorial decision. The regex has no such hole.
alter table public.staged_guidelines
  add constraint staged_guidelines_rejection_needs_note
  check (
    review_status <> 'rejected'
    or (review_note is not null and review_note ~ '\S')
  );

comment on constraint staged_guidelines_rejection_needs_note on public.staged_guidelines is
  'A rejected candidate must carry a non-blank reason. Blank and whitespace-only reasons are rejected at the database layer, so this holds for direct API callers as well as the UI.';


-- ── 2. The RPC ──────────────────────────────────────────────────────────────
-- Returns the pipeline's candidate_id (text), not the uuid, so a caller can
-- log or display something a human recognises from candidates.json.

create or replace function public.reject_staged_candidate(
  p_candidate_id uuid,
  p_reason       text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_staged public.staged_guidelines;
begin
  -- Mandatory: a DEFINER function runs with the owner's rights, so without
  -- this check the anon key could reject. Same allowlist as the RLS policies
  -- and as approve_staged_guideline, so this is not a way around either.
  if not public.is_editor() then
    raise exception 'reject_staged_candidate: not an approved editor'
      using errcode = '42501';
  end if;

  -- `!~ '\S'` means "contains no non-whitespace character". See the note on the
  -- CHECK constraint above: length(btrim(...)) = 0 would NOT catch a tab or a
  -- newline, because btrim strips spaces only.
  if p_reason is null or p_reason !~ '\S' then
    raise exception 'reject_staged_candidate: a reason is required'
      using errcode = '23514';
  end if;

  -- LOCK BEFORE TESTING STATE. Taking the row lock first is what makes an
  -- approve and a reject arriving together serialise: whichever commits second
  -- re-reads a non-pending row and is refused, instead of both succeeding and
  -- leaving the queue claiming two different outcomes.
  select * into v_staged
    from public.staged_guidelines
   where id = p_candidate_id
     for update;

  if not found then
    raise exception 'reject_staged_candidate: no staged candidate %', p_candidate_id
      using errcode = 'P0002';
  end if;

  -- Only a pending candidate may be rejected. An accepted one has already been
  -- published, and rejecting it afterwards would assert something false about a
  -- live catalogue entry; an already-rejected one needs no second decision.
  if v_staged.review_status <> 'pending' then
    raise exception 'reject_staged_candidate: candidate % is already %',
      p_candidate_id, v_staged.review_status
      using errcode = '55000';
  end if;

  -- Status, reviewer, timestamp and reason, in one statement.
  -- resulting_guideline_id is deliberately left null: nothing was published.
  -- btrim with an explicit character set, so leading/trailing tabs and
  -- newlines are stripped too and the stored reason is not padded with
  -- invisible characters.
  update public.staged_guidelines
     set review_status = 'rejected',
         review_note   = btrim(p_reason, E' \t\r\n'),
         reviewed_at   = now(),
         reviewed_by   = auth.uid()
   where id = p_candidate_id;

  return v_staged.candidate_id;
end;
$$;

comment on function public.reject_staged_candidate(uuid, text) is
  'Records a persistent, attributable rejection of a pending staged candidate: sets review_status = rejected with the editor''s reason, auth.uid() and a timestamp. Refuses a candidate that is not pending (55000). Touches neither guidelines nor guideline_changelog — a rejection publishes nothing. SECURITY DEFINER, gated on public.is_editor().';

-- Only the authenticated role may call it, and is_editor() inside decides
-- whether the call proceeds. Without these revokes a DEFINER function is
-- executable by PUBLIC, which includes the anon key.
revoke all on function public.reject_staged_candidate(uuid, text) from public;
revoke all on function public.reject_staged_candidate(uuid, text) from anon;
grant execute on function public.reject_staged_candidate(uuid, text) to authenticated;

commit;

-- ============================================================================
-- After running, expect:
--   * staged_guidelines gains `review_note`, plus the
--     staged_guidelines_rejection_needs_note CHECK.
--   * public.reject_staged_candidate(uuid, text) exists, prosecdef = true,
--     proconfig = {search_path=public, pg_temp}.
--   * EXECUTE granted to `authenticated` only — NOT to anon or PUBLIC.
--   * NO new policy on any table. staged_guidelines still has exactly one
--     policy (staged_guidelines_editor_read) and no write policy, because the
--     rejection path is the DEFINER function, not a policy.
--
-- Verify:
--   select proname, prosecdef, proconfig from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and proname = 'reject_staged_candidate';
--
--   select r.rolname, has_function_privilege(
--            r.rolname, 'public.reject_staged_candidate(uuid,text)', 'EXECUTE')
--     from pg_roles r where r.rolname in ('anon','authenticated','service_role');
--   -- expect anon = false
-- ============================================================================


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
--   drop function if exists public.reject_staged_candidate(uuid, text);
--   alter table public.staged_guidelines
--     drop constraint if exists staged_guidelines_rejection_needs_note;
--   -- Keep the column unless you are certain no rejection has been recorded;
--   -- dropping it destroys the reasons.
--   -- alter table public.staged_guidelines drop column if exists review_note;
-- commit;
-- ============================================================================
