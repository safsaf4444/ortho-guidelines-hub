-- ============================================================================
-- POST-MIGRATION-GATE-READONLY.sql
-- Read-only state checks for the review-queue upgrade, run as GATES:
--   stage 0: the expected PRE-upgrade state, before 20261024 is sent; and,
--            after a failed 20261024, proof that none of it committed;
--   stage 1: after 20261024_discovery_review_queue.sql, BEFORE 20261025 is
--            sent (exactly the intermediate state: 20261025 not yet applied);
--   stage 2: after 20261025_reject_open_candidate.sql.
-- Every stage also checks that the catalogue, changelog, queue size and
-- editor allowlist are unchanged. A migration-history entry is not evidence
-- that the schema is right; this is.
--
-- Run with psql only (it needs psql variables), stopping on the first error:
--   psql -X -v ON_ERROR_STOP=1 \
--        -v stage=1 \
--        -v expect_guidelines='231:460c6075209bfb1ed989032dac7e8950' \
--        -v expect_changelog='0:d41d8cd98f00b204e9800998ecf8427e' \
--        -v expect_staged=0 -v expect_editors=1 \
--        -f supabase/POST-MIGRATION-GATE-READONLY.sql
-- The expected values come from the step-0 preflight (P10, P5, P9) in the
-- deployment record. A missing variable is a syntax error, so the gate fails
-- closed. Exit status 0 means EVERY check passed; any failed check raises
-- (SQLSTATE P0001, "GATE FAILED: …") and psql exits 3.
--
-- Nothing here writes. All checks run inside one READ ONLY transaction that
-- ends with ROLLBACK; set_config(..., true) is transaction-local and is how
-- the expected values reach the DO block (psql does not substitute variables
-- inside dollar quotes). Each check is printed as a NOTICE: ok / FAIL.
-- ============================================================================

begin transaction isolation level repeatable read, read only;

select set_config('gate.stage',             :'stage',             true),
       set_config('gate.expect_guidelines', :'expect_guidelines', true),
       set_config('gate.expect_changelog',  :'expect_changelog',  true),
       set_config('gate.expect_staged',     :'expect_staged',     true),
       set_config('gate.expect_editors',    :'expect_editors',    true);

do $gate$
declare
  stage   int := current_setting('gate.stage')::int;
  r       record;
  failed  text[] := '{}';
  n       int := 0;
  k_holds bigint;
  k_falcon bigint;
  k_evid  bigint;
  k_dec   bigint;
begin
  if stage not in (0, 1, 2) then
    raise exception 'GATE FAILED: stage must be 0, 1 or 2, got %', stage;
  end if;

  for r in
    with
    fn(sig, definer, sp) as (values
      -- signature, SECURITY DEFINER expected, search_path expected (null = none set)
      ('public._url_strip_ver(text)',                                   false, 'search_path=pg_catalog, pg_temp'),
      ('public.document_match_key(text)',                               false, 'search_path=pg_catalog, pg_temp'),
      ('public.document_identity_key(text)',                            false, 'search_path=pg_catalog, pg_temp'),
      ('public.catalogue_entry_for_identity_key(text)',                 false, 'search_path=public, pg_temp'),
      ('public.catalogue_entry_for_match_key(text)',                    false, 'search_path=public, pg_temp'),
      ('public.staged_guidelines_set_document_keys()',                  false, 'search_path=public, pg_temp'),
      ('public.forbid_mutation()',                                      false, null),
      ('public._catalogue_relation(text,text,text,jsonb)',              false, 'search_path=public, pg_temp'),
      ('public._other_catalogue_entry(text,text,text,boolean)',         false, 'search_path=public, pg_temp'),
      ('public._queue_row_for(text,text,text)',                         false, 'search_path=public, pg_temp'),
      ('public.stage_discovery_candidate(text,text,jsonb)',             true,  'search_path=public, pg_temp'),
      ('public._stage_sync_candidate(text,jsonb)',                      true,  'search_path=public, pg_temp'),
      ('public.stage_sync_candidates(text,jsonb)',                      true,  'search_path=public, pg_temp'),
      ('public.resolve_discovery_candidate(uuid,text,text)',            true,  'search_path=public, pg_temp'),
      ('public.approve_staged_guideline(uuid,jsonb,text)',              true,  'search_path=public, pg_temp')
    ),
    -- role, function, EXECUTE expected
    priv(role, sig, want) as (values
      ('anon','public.stage_discovery_candidate(text,text,jsonb)',false), ('authenticated','public.stage_discovery_candidate(text,text,jsonb)',false), ('service_role','public.stage_discovery_candidate(text,text,jsonb)',true),
      ('anon','public.stage_sync_candidates(text,jsonb)',false),          ('authenticated','public.stage_sync_candidates(text,jsonb)',false),          ('service_role','public.stage_sync_candidates(text,jsonb)',true),
      ('anon','public._stage_sync_candidate(text,jsonb)',false),          ('authenticated','public._stage_sync_candidate(text,jsonb)',false),          ('service_role','public._stage_sync_candidate(text,jsonb)',false),
      ('anon','public.resolve_discovery_candidate(uuid,text,text)',false),('authenticated','public.resolve_discovery_candidate(uuid,text,text)',true),('service_role','public.resolve_discovery_candidate(uuid,text,text)',true),
      ('anon','public.approve_staged_guideline(uuid,jsonb,text)',false),  ('authenticated','public.approve_staged_guideline(uuid,jsonb,text)',true),
      ('anon','public._catalogue_relation(text,text,text,jsonb)',false),  ('authenticated','public._catalogue_relation(text,text,text,jsonb)',false),  ('service_role','public._catalogue_relation(text,text,text,jsonb)',false),
      ('anon','public._other_catalogue_entry(text,text,text,boolean)',false),('authenticated','public._other_catalogue_entry(text,text,text,boolean)',false),('service_role','public._other_catalogue_entry(text,text,text,boolean)',false),
      ('anon','public._queue_row_for(text,text,text)',false),             ('authenticated','public._queue_row_for(text,text,text)',false),             ('service_role','public._queue_row_for(text,text,text)',false),
      ('anon','public._url_strip_ver(text)',false),                       ('authenticated','public._url_strip_ver(text)',false),
      ('anon','public.catalogue_entry_for_identity_key(text)',false),     ('authenticated','public.catalogue_entry_for_identity_key(text)',false),
      ('anon','public.catalogue_entry_for_match_key(text)',false),        ('authenticated','public.catalogue_entry_for_match_key(text)',false)
    ),
    approve as (
      select pg_get_functiondef(to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)')) as def,
             obj_description(to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)'), 'pg_proc') as cmt
    ),
    decisions_action as (
      select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid = to_regclass('public.staged_discovery_decisions') and conname = 'staged_discovery_decisions_action_check'
    ),
    checks(id, scope, ok, detail) as (
      select 'G00 read-only transaction', 'all', current_setting('transaction_read_only') = 'on', current_setting('transaction_read_only')
      union all
      select 'G01 database', 'all', current_database() = 'postgres', current_database() || ' as ' || current_user
      union all
      select 'G02 no PR #174 objects', 'all',
             to_regclass('public.staged_detections') is null
             and to_regclass('public.staged_guidelines_one_pending_revision') is null
             and not exists (select 1 from pg_proc where proname = 'stage_detected_change' and pronamespace = 'public'::regnamespace),
             ''
      union all
      -- stage 0 only: the expected PRE-upgrade state (also proves, after a failed
      -- migration 1, that nothing of it committed)
      select 'G09 pre-state: no 20261024/20261025 objects; prerequisites present', 'pre',
             not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'staged_guidelines'
                          and column_name in ('changed_url','identity_key','match_key','producer','review_outcome'))
             and to_regclass('public.staged_discovery_evidence') is null
             and to_regclass('public.staged_discovery_decisions') is null
             and to_regclass('public.discovery_staging_holds') is null
             and to_regclass('public.staged_guidelines_one_open_per_document') is null
             and to_regprocedure('public.stage_discovery_candidate(text,text,jsonb)') is null
             and to_regprocedure('public.stage_sync_candidates(text,jsonb)') is null
             and to_regprocedure('public.resolve_discovery_candidate(uuid,text,text)') is null
             and to_regprocedure('public.document_identity_key(text)') is null
             and to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is null
             and to_regprocedure('public.reject_staged_candidate(uuid,text)') is not null
             and to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)') is not null
             and to_regprocedure('public.is_editor()') is not null
             and exists (select 1 from information_schema.columns where table_schema = 'public'
                          and table_name = 'staged_guidelines' and column_name = 'review_note')
             and not coalesce((select def like '%discovery-guards v1%' from approve), true),
             ''
      union all
      -- 20261024 columns on staged_guidelines
      select 'G10 staged_guidelines new columns (5)', 'post',
             (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'staged_guidelines'
               and column_name in ('changed_url','identity_key','match_key','producer','review_outcome')) = 5,
             (select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_schema = 'public'
               and table_name = 'staged_guidelines' and column_name in ('changed_url','identity_key','match_key','producer','review_outcome'))
      union all
      select 'G11 staged_guidelines constraints (7)', 'post',
             (select count(*) from pg_constraint where conrelid = to_regclass('public.staged_guidelines') and conname in (
               'staged_guidelines_change_reason_check','staged_guidelines_review_status_check','staged_guidelines_document_keys_derived',
               'staged_guidelines_producer_check','staged_guidelines_revision_needs_target','staged_guidelines_review_outcome_check',
               'staged_guidelines_resolved_is_closed_outcome') and convalidated) = 7,
             ''
      union all
      select 'G12 one-open-row unique index + open match-key index', 'post',
             exists (select 1 from pg_index where indexrelid = to_regclass('public.staged_guidelines_one_open_per_document') and indisunique and indisvalid)
             and exists (select 1 from pg_index where indexrelid = to_regclass('public.staged_guidelines_open_match_key_idx') and indisvalid),
             ''
      union all
      select 'G13 triggers (document keys; append-only x4)', 'post',
             (select count(*) from pg_trigger where not tgisinternal and tgenabled = 'O' and (tgrelid, tgname) in (
               (to_regclass('public.staged_guidelines'),          'staged_guidelines_document_keys'),
               (to_regclass('public.staged_discovery_evidence'),  'staged_discovery_evidence_no_update_delete'),
               (to_regclass('public.staged_discovery_evidence'),  'staged_discovery_evidence_no_truncate'),
               (to_regclass('public.staged_discovery_decisions'), 'staged_discovery_decisions_no_update_delete'),
               (to_regclass('public.staged_discovery_decisions'), 'staged_discovery_decisions_no_truncate'))) = 5,
             ''
      union all
      select 'G14 new tables: RLS on, editor-read policy, select-only for authenticated, nothing for anon', 'post',
             (select count(*) from pg_class c where c.oid in (
                to_regclass('public.staged_discovery_evidence'), to_regclass('public.staged_discovery_decisions'), to_regclass('public.discovery_staging_holds'))
               and c.relrowsecurity
               and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = c.relname || '_editor_read' and p.polcmd = 'r')
               and has_table_privilege('authenticated', c.oid, 'SELECT')
               and not has_table_privilege('authenticated', c.oid, 'INSERT,UPDATE,DELETE,TRUNCATE')
               and not has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) = 3,
             ''
      union all
      select 'G15 functions present, SECURITY DEFINER and search_path as declared', 'post',
             not exists (select 1 from fn left join pg_proc p on p.oid = to_regprocedure(fn.sig)
                          where p.oid is null or p.prosecdef <> fn.definer
                             or coalesce(array_to_string(p.proconfig, ';'), '') <> coalesce(fn.sp, '')),
             coalesce((select string_agg(fn.sig, ', ') from fn left join pg_proc p on p.oid = to_regprocedure(fn.sig)
                        where p.oid is null or p.prosecdef <> fn.definer
                           or coalesce(array_to_string(p.proconfig, ';'), '') <> coalesce(fn.sp, '')), '')
      union all
      select 'G16 EXECUTE privileges', 'post',
             not exists (select 1 from priv where has_function_privilege(priv.role, to_regprocedure(priv.sig), 'EXECUTE') is distinct from priv.want),
             coalesce((select string_agg(priv.role || ':' || priv.sig, ', ') from priv
                        where has_function_privilege(priv.role, to_regprocedure(priv.sig), 'EXECUTE') is distinct from priv.want), '')
      union all
      select 'G17 no PUBLIC EXECUTE on this upgrade''s SECURITY DEFINER functions', 'post',
             not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                          where p.oid in (select to_regprocedure(sig) from fn where definer
                                          union all select to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)'))
                            and a.grantee = 0 and a.privilege_type = 'EXECUTE'),
             coalesce((select string_agg(distinct p.oid::regprocedure::text, ', ') from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                        where p.oid in (select to_regprocedure(sig) from fn where definer
                                        union all select to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)'))
                          and a.grantee = 0 and a.privilege_type = 'EXECUTE'), '')
      union all
      select 'G18 approve body is THIS migration''s (discovery-guards v1, null-safe editor check, hold-guard v1)', 'post',
             (select def like '%discovery-guards v1%' and def like '%is_editor() is not true%' and coalesce(cmt like '%hold-guard v1%', false) from approve),
             ''
      union all
      select 'G19 url-key v3 identity/match comments', 'post',
             coalesce(obj_description(to_regprocedure('public.document_identity_key(text)'), 'pg_proc') like '[url-key v3 identity]%', false)
             and coalesce(obj_description(to_regprocedure('public.document_match_key(text)'), 'pg_proc') like '[url-key v3 match]%', false),
             ''
      union all
      -- unchanged data (values from the step-0 preflight)
      select 'G30 guidelines unchanged (count:md5)', 'all',
             (select count(*) || ':' || md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g) = current_setting('gate.expect_guidelines'),
             (select count(*) || ':' || md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g)
      union all
      select 'G31 guideline_changelog unchanged (count:md5)', 'all',
             (select count(*) || ':' || md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c) = current_setting('gate.expect_changelog'),
             (select count(*) || ':' || md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c)
      union all
      select 'G32 staged_guidelines row count unchanged', 'all',
             (select count(*) from public.staged_guidelines) = current_setting('gate.expect_staged')::bigint,
             (select count(*)::text from public.staged_guidelines)
      union all
      select 'G33 editor allowlist size unchanged', 'all',
             (length(pg_get_functiondef(to_regprocedure('public.is_editor()')))
              - length(replace(pg_get_functiondef(to_regprocedure('public.is_editor()')), '::uuid', ''))) / 6
             = current_setting('gate.expect_editors')::int,
             ''
      union all
      -- stage-specific: exactly the intermediate state (1) or the final state (2)
      select 'G40 reject signatures: stage 1 = 2-argument only; stage 2 = 3-argument only', 'post',
             case stage
               when 1 then to_regprocedure('public.reject_staged_candidate(uuid,text)') is not null
                       and to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is null
               else        to_regprocedure('public.reject_staged_candidate(uuid,text)') is null
                       and to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is not null
             end,
             coalesce((select string_agg(oid::regprocedure::text, ', ') from pg_proc
                        where proname = 'reject_staged_candidate' and pronamespace = 'public'::regnamespace), 'none')
      union all
      select 'G41 decisions.action CHECK: stage 1 has approve, not reject; stage 2 has both', 'post',
             (select count(*) from decisions_action) = 1
             and (select def like '%''approve''%' and (def like '%''reject''%') = (stage = 2) from decisions_action),
             coalesce((select def from decisions_action), 'missing')
      union all
      select 'G42 decisions.from_outcome column: stage 1 absent; stage 2 present', 'post',
             exists (select 1 from information_schema.columns where table_schema = 'public'
                      and table_name = 'staged_discovery_decisions' and column_name = 'from_outcome') = (stage = 2),
             ''
      union all
      select 'G43 stage 2 only: 3-argument reject is SECURITY DEFINER, pinned, default false, anon f / authenticated t', 'post',
             stage = 1 or (
               select p.prosecdef and array_to_string(p.proconfig, ';') = 'search_path=public, pg_temp'
                      and pg_get_function_identity_arguments(p.oid) = 'p_candidate_id uuid, p_reason text, p_confirm_open_follow_up boolean'
                      and pg_get_expr(p.proargdefaults, 0) = 'false'
                      and not has_function_privilege('anon', p.oid, 'EXECUTE')
                      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
                 from pg_proc p where p.oid = to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)')),
             ''
    )
    select id, ok, detail from checks
     where scope = 'all' or (scope = 'pre' and stage = 0) or (scope = 'post' and stage >= 1)
     order by id
  loop
    n := n + 1;
    raise notice '% %  %', case when r.ok then 'ok  ' else 'FAIL' end, r.id,
      case when r.ok or r.detail = '' then '' else '[' || r.detail || ']' end;
    if r.ok is distinct from true then
      failed := failed || r.id;
    end if;
  end loop;

  -- G20/G21 read the new tables, which do not exist at stage 0, so they are
  -- built here with EXECUTE (still plain SELECTs in the same read-only snapshot).
  if stage >= 1 then
    if to_regclass('public.discovery_staging_holds') is null
       or to_regclass('public.staged_discovery_evidence') is null
       or to_regclass('public.staged_discovery_decisions') is null then
      k_holds := null;
    else
      execute 'select count(*), count(*) filter (where match_key = $1 and status = ''pending-editorial-decision'')
                 from public.discovery_staging_holds'
        into k_holds, k_falcon
        using 'https://www.bofas.org.uk/portals/0/research/falcon-report-phase%201%20and%202%20final.pdf';
      execute 'select (select count(*) from public.staged_discovery_evidence), (select count(*) from public.staged_discovery_decisions)'
        into k_evid, k_dec;
    end if;
    for r in
      select * from (values
        ('G20 holds: exactly the seeded UK-FALCON row', k_holds = 1 and k_falcon = 1, coalesce(k_holds::text, 'tables missing')),
        ('G21 evidence and decision logs empty',        k_evid = 0 and k_dec = 0,     coalesce(k_evid || '/' || k_dec, 'tables missing'))
      ) v(id, ok, detail)
    loop
      n := n + 1;
      raise notice '% %  %', case when r.ok then 'ok  ' else 'FAIL' end, r.id,
        case when r.ok then '' else '[' || r.detail || ']' end;
      if r.ok is distinct from true then
        failed := failed || r.id;
      end if;
    end loop;
  end if;

  if cardinality(failed) > 0 then
    raise exception 'GATE FAILED (stage %): % of % checks failed: %', stage, cardinality(failed), n, array_to_string(failed, '; ');
  end if;
  raise notice 'GATE PASSED (stage %): all % checks ok', stage, n;
end
$gate$;

rollback;
