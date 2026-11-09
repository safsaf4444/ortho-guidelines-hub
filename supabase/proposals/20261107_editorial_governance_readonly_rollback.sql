-- PROPOSED fail-closed quarantine after a committed hardening change.
-- Does NOT restore unsafe direct grants, mutate clinical rows or erase audit data.
-- Read-only public SELECT remains available. Apply only with separate authorisation.
begin;
do $$begin
 if to_regclass('public.governance_publications') is null then
  raise exception 'Governance schema is missing; inspect before rollback' using errcode='55000';
 end if;
end$$;
revoke execute on function public.approve_staged_guideline(uuid,jsonb,text),
 public.list_governance_review_events(),public.list_publication_receipts(uuid,jsonb),public.record_clinical_review(uuid,jsonb,text),public.record_human_source_review(text,text,text),
 public.release_rejected_document(text,text),public.reject_staged_candidate(uuid,text,boolean),
 public.resolve_discovery_candidate(uuid,text,text),public.stage_sync_candidates(text,jsonb),
 public.stage_discovery_candidate(text,text,jsonb),public.record_rejected_revision_signal(text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke execute on function public.record_automated_link_evidence(text,integer,text,text) from ortho_link_verifier;
revoke insert,update,delete,truncate,references,trigger on public.guidelines,public.guideline_changelog,
 public.staged_guidelines,public.staged_discovery_evidence,public.staged_discovery_decisions,
 public.discovery_staging_holds from public,anon,authenticated,service_role;
commit;
