-- ============================================================================
-- POST-UPGRADE-REJECTION-GAP-READONLY.sql
-- Rejections with NO decision-log entry, made since a given time. Run AFTER
-- 20261025_reject_open_candidate.sql is applied. See DEPLOYMENT-RUNBOOK.md §5.
--
-- Why: until 20261025 is applied, editors' rejections go through the old
-- (20261012) function, which writes no staged_discovery_decisions entry. A
-- rejection made between steps 1 and 2 is therefore recorded only on the queue
-- row. This lists those rows so they can be noted in the deployment record.
-- Nothing back-fills the log: it is append-only, and an entry written later
-- would misstate when the decision was logged.
--
-- `since` is the P1 `at` value recorded when DEPLOY-PREFLIGHT-READONLY.sql ran
-- at step 0. That over-lists (it also includes rejections between the preflight
-- and step 1, which predate the log anyway) rather than missing any.
--
--   psql "$DB_URL" -v since='2026-10-24 18:00:00+00' -f supabase/POST-UPGRADE-REJECTION-GAP-READONLY.sql
--
-- In the SQL editor, replace :'since' with the quoted timestamp.
-- EXPECT: no rows if nobody rejected anything between steps 1 and 2.
--
-- Read-only, enforced the same way as the preflight: one READ ONLY
-- transaction, ended by ROLLBACK.
-- ============================================================================

begin transaction read only;

select 'G0' as check, current_setting('transaction_read_only') as read_only;

select 'G1' as check, s.candidate_id, s.change_reason, s.reviewed_at, s.reviewed_by, s.review_note
  from public.staged_guidelines s
 where s.review_status = 'rejected'
   and s.reviewed_at >= :'since'::timestamptz
   and not exists (select 1 from public.staged_discovery_decisions d
                    where d.staged_id = s.id and d.action = 'reject')
 order by s.reviewed_at, s.candidate_id;

rollback;
