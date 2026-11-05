-- ============================================================================
-- URL-KEY-V4-GATE-READONLY.sql
-- Read-only gate for supabase/migrations/20261104_url_key_unreserved_decoding.sql
-- (url-key v4). Used by scripts/deploy/Apply-UrlKeyV4-Psql.ps1:
--   stage 0: the expected url-key v3 state BEFORE the migration (and, after a
--            failed or refused migration, proof that none of it committed);
--   stage 1: the url-key v4 state AFTER it.
-- Every stage also checks that the catalogue (including every source link),
-- the changelog, the queue, the staging holds and the editor allowlist are
-- unchanged. The migration changes none of them.
--
-- This does NOT replace supabase/POST-MIGRATION-GATE-READONLY.sql, which pins
-- the 20261024/20261025 state and stays as it is. Its G19 expects the v3
-- comments, so after this migration that gate fails BY DESIGN: use this one.
--
-- Run with psql only (it needs psql variables), stopping on the first error:
--   psql -X -v ON_ERROR_STOP=1 -v stage=0 \
--        -v expect_guidelines='<count>:<md5>' -v expect_changelog='<count>:<md5>' \
--        -v expect_staged=<n> -v expect_editors=<n> -v expect_holds='<count>:<md5>' \
--        -f supabase/URL-KEY-V4-GATE-READONLY.sql
-- A missing variable is a syntax error (fails closed). Exit 0 = every check
-- passed; a failed check raises "GATE FAILED" and psql exits 3.
-- Nothing here writes: one READ ONLY transaction, ended by ROLLBACK.
-- ============================================================================

begin transaction isolation level repeatable read, read only;

select set_config('gate.stage',             :'stage',             true),
       set_config('gate.expect_guidelines', :'expect_guidelines', true),
       set_config('gate.expect_changelog',  :'expect_changelog',  true),
       set_config('gate.expect_staged',     :'expect_staged',     true),
       set_config('gate.expect_editors',    :'expect_editors',    true),
       set_config('gate.expect_holds',      :'expect_holds',      true);

do $gate$
declare
  stage  int := current_setting('gate.stage')::int;
  -- An escape of an RFC 3986 unreserved byte (ALPHA DIGIT - . _ ~), any hex case.
  -- v4 decodes only these; a string without one has the same key under v3 and v4.
  c_unres constant text := '%(3[0-9]|4[1-9A-Fa-f]|5[0-9Aa]|6[1-9A-Fa-f]|7[0-9Aa]|2[DdEe]|5[Ff]|7[Ee])';
  r      record;
  failed text[] := '{}';
  n      int := 0;
  k_rows bigint;
  k_hesc bigint;
  k_hold text;
  k_bad  bigint;
  k_badh bigint;
begin
  if stage not in (0, 1) then
    raise exception 'GATE FAILED: stage must be 0 or 1, got %', stage;
  end if;

  -- The queue and holds tables come from 20261024; read them dynamically so a
  -- missing table fails a check instead of aborting the parse.
  if to_regclass('public.staged_guidelines') is not null
     and to_regclass('public.discovery_staging_holds') is not null
     and exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'staged_guidelines' and column_name = 'identity_key') then
    execute format($q$select count(*) from public.staged_guidelines
                       where coalesce(primary_url, '') ~ %1$L or coalesce(identity_key, '') ~ %1$L
                          or coalesce(match_key, '') ~ %1$L$q$, c_unres) into k_rows;
    execute format($q$select count(*) from public.discovery_staging_holds where match_key ~ %L$q$, c_unres) into k_hesc;
    execute $q$select count(*) from public.staged_guidelines where primary_url is not null
                 and (identity_key is distinct from public.document_identity_key(primary_url)
                      or match_key is distinct from public.document_match_key(primary_url))$q$ into k_bad;
    execute $q$select count(*) from public.discovery_staging_holds where match_key <> public.document_match_key(match_key)$q$ into k_badh;
  end if;

  for r in
    with
    keyfn as (
      select p.oid, p.proname, pg_get_functiondef(p.oid) as def, obj_description(p.oid, 'pg_proc') as cmt,
             p.prosecdef, array_to_string(p.proconfig, ';') as cfg
        from pg_proc p
       where p.oid in (to_regprocedure('public.document_match_key(text)'), to_regprocedure('public.document_identity_key(text)'))
    ),
    dec as (
      select p.oid, p.prosecdef, array_to_string(p.proconfig, ';') as cfg,
             obj_description(p.oid, 'pg_proc') as cmt
        from pg_proc p where p.oid = to_regprocedure('public._url_decode_unreserved(text)')
    ),
    checks(id, scope, ok, detail) as (
      select 'V00 read-only transaction', 'all', current_setting('transaction_read_only') = 'on', current_setting('transaction_read_only')
      union all
      select 'V01 database', 'all', current_database() = 'postgres', current_database() || ' as ' || current_user
      union all
      select 'V02 20261024 prerequisites (key functions, ver strip, queue key columns, CHECK, one-open index, holds)', 'all',
             (select count(*) from keyfn) = 2
             and to_regprocedure('public._url_strip_ver(text)') is not null
             and to_regclass('public.discovery_staging_holds') is not null
             and exists (select 1 from pg_constraint where conname = 'staged_guidelines_document_keys_derived' and convalidated)
             and exists (select 1 from pg_index where indexrelid = to_regclass('public.staged_guidelines_one_open_per_document') and indisunique and indisvalid),
             ''
      union all
      select 'V03 key functions keep their shape (not SECURITY DEFINER; search_path pg_catalog, pg_temp)', 'all',
             (select bool_and(not prosecdef and cfg = 'search_path=pg_catalog, pg_temp') from keyfn), ''
      union all
      select 'V04 stored queue keys equal their functions (the CHECK holds)', 'all', k_bad = 0, coalesce(k_bad::text, 'tables missing')
      union all
      select 'V05 every hold key is its own match key', 'all', k_badh = 0, coalesce(k_badh::text, 'tables missing')
      union all
      -- stage 0: exactly url-key v3
      select 'V06 v3: v3 comments; no decoder; key bodies do not decode', 'pre',
             (select bool_and(cmt like '[url-key v3 %' and def not like '%_url_decode_unreserved%') from keyfn)
             and not exists (select 1 from dec),
             coalesce((select string_agg(left(cmt, 22), ', ') from keyfn), '')
      union all
      select 'V07 v3: no queue row or hold contains an unreserved escape, so v4 moves no stored key', 'pre',
             k_rows = 0 and k_hesc = 0, coalesce(k_rows || ' rows, ' || k_hesc || ' holds', 'tables missing')
      union all
      -- stage 1: exactly url-key v4
      select 'V10 v4: v4 comments; both key bodies decode first', 'post',
             (select bool_and(cmt like '[url-key v4 %'
                              and def like '%public._url_strip_ver(public._url_decode_unreserved(p_url))%') from keyfn),
             coalesce((select string_agg(left(cmt, 22), ', ') from keyfn), '')
      union all
      select 'V11 v4: decoder present, not SECURITY DEFINER, pinned, no EXECUTE for PUBLIC, anon, authenticated', 'post',
             exists (select 1 from dec where not prosecdef and cfg = 'search_path=pg_catalog, pg_temp' and cmt like '[url-key v4]%')
             and not has_function_privilege('anon', to_regprocedure('public._url_decode_unreserved(text)'), 'EXECUTE')
             and not has_function_privilege('authenticated', to_regprocedure('public._url_decode_unreserved(text)'), 'EXECUTE')
             and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                              where p.oid = to_regprocedure('public._url_decode_unreserved(text)') and a.grantee = 0),
             ''
      union all
      select 'V12 v4: self-test (%2d decodes; %2F, %20, %%341 kept; %76er is ver)', 'post',
             (select public.document_identity_key('https://www.boa.ac.uk/asset/a811fc01%2defc3') = 'https://www.boa.ac.uk/asset/a811fc01-efc3'
                 and public.document_match_key('https://www.boa.ac.uk/asset/A811FC01-EFC3/') = public.document_match_key('https://www.boa.ac.uk/asset/a811fc01%2Defc3')
                 and public.document_identity_key('https://example.org/a%2Fb%20c') = 'https://example.org/a%2Fb%20c'
                 and public.document_identity_key('https://example.org/a%%341') = 'https://example.org/a%%341'
                 and public.document_match_key('https://example.org/a?%76er=1') = 'https://example.org/a'
               where exists (select 1 from dec)),
             ''
      union all
      select 'V13 review-queue functions still present, and none executable by anon', 'post',
             to_regprocedure('public.stage_discovery_candidate(text,text,jsonb)') is not null
             and to_regprocedure('public.stage_sync_candidates(text,jsonb)') is not null
             and to_regprocedure('public.resolve_discovery_candidate(uuid,text,text)') is not null
             and to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)') is not null
             and not has_function_privilege('anon', to_regprocedure('public.stage_sync_candidates(text,jsonb)'), 'EXECUTE')
             and not has_function_privilege('anon', to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)'), 'EXECUTE'),
             ''
      union all
      -- unchanged data, every stage (values from the read-only preflight)
      select 'V30 guidelines unchanged, every column incl. source links (count:md5)', 'all',
             (select count(*) || ':' || md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g) = current_setting('gate.expect_guidelines'),
             (select count(*) || ':' || md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g)
      union all
      select 'V31 guideline_changelog unchanged (count:md5)', 'all',
             (select count(*) || ':' || md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c) = current_setting('gate.expect_changelog'),
             (select count(*) || ':' || md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c)
      union all
      select 'V32 staged_guidelines row count unchanged', 'all',
             (select count(*) from public.staged_guidelines) = current_setting('gate.expect_staged')::bigint,
             (select count(*)::text from public.staged_guidelines)
      union all
      select 'V33 editor allowlist size unchanged', 'all',
             (length(pg_get_functiondef(to_regprocedure('public.is_editor()')))
              - length(replace(pg_get_functiondef(to_regprocedure('public.is_editor()')), '::uuid', ''))) / 6
             = current_setting('gate.expect_editors')::int,
             ''
    )
    select id, ok, detail from checks
     where scope = 'all' or (scope = 'pre' and stage = 0) or (scope = 'post' and stage = 1)
     order by id
  loop
    n := n + 1;
    raise notice '% %  %', case when r.ok then 'ok  ' else 'FAIL' end, r.id,
      case when r.ok or r.detail = '' then '' else '[' || r.detail || ']' end;
    if r.ok is distinct from true then failed := failed || r.id; end if;
  end loop;

  -- V34 holds unchanged (count:md5), read dynamically like the counts above.
  if to_regclass('public.discovery_staging_holds') is not null then
    execute $q$select count(*) || ':' || md5(coalesce(string_agg(h::text, '|' order by match_key), ''))
                 from public.discovery_staging_holds h$q$ into k_hold;
  else
    k_hold := 'missing';
  end if;
  n := n + 1;
  if k_hold = current_setting('gate.expect_holds') then
    raise notice 'ok   V34 staging holds unchanged (count:md5)  ';
  else
    raise notice 'FAIL V34 staging holds unchanged (count:md5)  [%]', k_hold;
    failed := failed || 'V34 staging holds unchanged (count:md5)';
  end if;

  if cardinality(failed) > 0 then
    raise exception 'GATE FAILED (url-key v4, stage %): % of % checks failed: %', stage, cardinality(failed), n, array_to_string(failed, '; ');
  end if;
  raise notice 'GATE PASSED (url-key v4, stage %): all % checks ok', stage, n;
end
$gate$;

rollback;
