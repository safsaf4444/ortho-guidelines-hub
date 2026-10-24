-- ============================================================================
-- DEPLOY-PREFLIGHT-READONLY.sql
-- Read-only checks to run BEFORE applying 20261024_discovery_review_queue.sql
-- and 20261025_reject_open_candidate.sql. See DEPLOYMENT-RUNBOOK.md.
--
-- Every statement is a plain SELECT. Nothing here writes, creates or alters.
-- Run it in a read-only session, e.g.
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$DB_URL" -f supabase/DEPLOY-PREFLIGHT-READONLY.sql
-- or paste one numbered query at a time into the SQL editor. The rehearsal
-- (local, synthetic data) ran this exact file with default_transaction_read_only=on.
--
-- Each row starts with its check id. "EXPECT" says what a safe result is.
-- ============================================================================

-- P1. Which database is this? (Confirm it is the one you mean to change.)
select 'P1' as check, current_database() as db, current_user as role, now() as at,
       split_part(version(), ' on ', 1) as server;

-- P2. PR #174 objects. EXPECT: all false. Any true → STOP: 20261024 refuses to
--     run over them, and the two designs must be reconciled first.
select 'P2' as check,
       to_regclass('public.staged_detections') is not null                    as has_staged_detections,
       to_regclass('public.staged_guidelines_one_pending_revision') is not null as has_one_pending_revision,
       exists (select 1 from pg_proc where proname = 'stage_detected_change'
                 and pronamespace = 'public'::regnamespace)                    as has_stage_detected_change,
       exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'staged_guidelines' and column_name in ('superseded_at', 'superseded_by'))
                                                                               as has_superseded_columns;

-- P3. Already applied? EXPECT before the upgrade: all false.
select 'P3' as check,
       exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'staged_guidelines' and column_name = 'identity_key') as has_20261024_columns,
       to_regclass('public.staged_discovery_evidence') is not null                       as has_20261024_tables,
       to_regprocedure('public.reject_staged_candidate(uuid,text,boolean)') is not null   as has_20261025;

-- P4. Prerequisites. EXPECT: all true (the 20261011/20261012 state).
select 'P4' as check,
       to_regclass('public.staged_guidelines') is not null                                as has_staged_guidelines,
       to_regprocedure('public.is_editor()') is not null                                  as has_is_editor,
       to_regprocedure('public.approve_staged_guideline(uuid,jsonb,text)') is not null    as has_approve,
       to_regprocedure('public.reject_staged_candidate(uuid,text)') is not null           as has_reject_2arg,
       exists (select 1 from information_schema.columns where table_schema = 'public'
                 and table_name = 'staged_guidelines' and column_name = 'review_note')    as has_review_note;

-- P5. Queue contents by status and class (for the record; compare after).
select 'P5' as check, review_status, change_reason, count(*) as rows
  from public.staged_guidelines group by 2, 3 order by 2, 3;

-- P6. Values the new CHECKs will not accept. EXPECT: no rows.
select 'P6' as check, id, candidate_id, review_status, change_reason
  from public.staged_guidelines
 where review_status not in ('pending', 'accepted', 'rejected', 'deferred', 'resolved')
    or change_reason not in ('NEW_GUIDELINE', 'REVISED', 'WITHDRAWN', 'CONTENT_DRIFT', 'URL_MOVED',
                             'UNREACHABLE_LINK', 'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED',
                             'POSSIBLE_SAME_DOCUMENT');

-- P7. Non-NEW_GUIDELINE rows. EXPECT: no rows. 20261024 adds a CHECK requiring
--     matched_guideline_id AND changed_url on them, and changed_url does not
--     exist yet, so any such row would make the migration fail (and roll back).
select 'P7' as check, id, candidate_id, change_reason, matched_guideline_id
  from public.staged_guidelines where change_reason <> 'NEW_GUIDELINE';

-- P8. Possible duplicate OPEN documents. EXPECT: no rows.
--     A COARSE key (trimmed, lowercased, query and fragment dropped, trailing
--     slashes stripped) — coarser than the migration's identity key, so any two
--     rows that share an identity key also share this key. No rows here means
--     the migration's duplicate pre-flight cannot fail. Rows here are
--     CANDIDATES only: inspect them; if two really are one document, an editor
--     must reject (close) all but one before migrating.
select 'P8' as check, coarse_key, count(*) as open_rows,
       string_agg(candidate_id || ' [' || review_status || '] ' || primary_url, ' | ' order by candidate_id) as rows
  from (select candidate_id, review_status, primary_url,
               regexp_replace(lower(split_part(split_part(regexp_replace(primary_url, '^\s+|\s+$', '', 'g'), '#', 1), '?', 1)),
                              '/+$', '') as coarse_key
          from public.staged_guidelines
         where primary_url is not null and review_status in ('pending', 'deferred')) s
 group by coarse_key having count(*) > 1
 order by coarse_key;

-- P9. Editor allowlist size (the migration's editor-only functions use it).
--     EXPECT: the number of named editors you intend.
select 'P9' as check,
       regexp_match(pg_get_functiondef('public.is_editor()'::regprocedure), 'array\[([^\]]*)\]') is not null as allowlist_found,
       (length(pg_get_functiondef('public.is_editor()'::regprocedure))
        - length(replace(pg_get_functiondef('public.is_editor()'::regprocedure), '::uuid', ''))) / 6 as editor_uuid_count;

-- P10. Catalogue fingerprint (compare before and after: the upgrade must not
--      change it).
select 'P10' as check,
       (select count(*) from public.guidelines) as guidelines,
       (select md5(coalesce(string_agg(g::text, '|' order by id), '')) from public.guidelines g) as guidelines_md5,
       (select count(*) from public.guideline_changelog) as changelog,
       (select md5(coalesce(string_agg(c::text, '|' order by id), '')) from public.guideline_changelog c) as changelog_md5;
