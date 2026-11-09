-- Read-only data/schema preflight: no rows or schema objects are modified.
do $preflight$
declare issues jsonb:='[]'::jsonb; r record; item jsonb; field text; link text; tab text; key text;begin
 foreach tab in array array['guidelines','staged_guidelines','staged_discovery_evidence','staged_discovery_decisions','discovery_staging_holds'] loop
  if to_regclass('public.'||tab) is null then issues:=issues||jsonb_build_array(jsonb_build_object('table',tab,'field','schema','problem','required table missing'));end if;
 end loop;
 foreach key in array array['document_identity_key(text)','document_match_key(text)','catalogue_entry_for_identity_key(text)','catalogue_entry_for_match_key(text)','is_editor()','forbid_mutation()','stage_discovery_candidate(text,text,jsonb)','stage_sync_candidates(text,jsonb)','reject_staged_candidate(uuid,text,boolean)','resolve_discovery_candidate(uuid,text,text)'] loop
  if to_regprocedure('public.'||key) is null then issues:=issues||jsonb_build_array(jsonb_build_object('field','schema','problem','required function missing','function',key));end if;
 end loop;
 if jsonb_array_length(issues)>0 then raise exception 'Governance preflight failed: schema dependencies' using errcode='GV005',detail=issues::text;end if;
 for r in select 'guidelines' tab,id::text id,'versions' field,versions value from public.guidelines
  union all select 'staged_guidelines',id::text,'versions',versions from public.staged_guidelines
  union all select 'staged_discovery_evidence',id::text,'observed_versions',coalesce(observed_versions,'[]'::jsonb) from public.staged_discovery_evidence
  union all select 'staged_discovery_evidence',id::text,'url_alternatives',coalesce(url_alternatives,'[]'::jsonb) from public.staged_discovery_evidence loop
  if jsonb_typeof(r.value) is distinct from 'array' then
   issues:=issues||jsonb_build_array(jsonb_build_object('table',r.tab,'id',r.id,'field',r.field,'problem','array required'));
  else
   for item in select value from jsonb_array_elements(r.value) loop
    link:=item->>'url';
    if jsonb_typeof(item) is distinct from 'object' or jsonb_typeof(item->'url') is distinct from 'string' or link !~* '^https?://[^/?#@[:space:]]+([/?#]|$)' or link ~ '[[:space:]]' then
     issues:=issues||jsonb_build_array(jsonb_build_object('table',r.tab,'id',r.id,'field',r.field,'problem','HTTP(S) URL object required'));end if;
   end loop;
  end if;
 end loop;
 for r in select id::text id,primary_url,identity_key,match_key from public.staged_guidelines where primary_url is not null loop
  if r.primary_url !~* '^https?://[^/?#@[:space:]]+([/?#]|$)' or r.primary_url ~ '[[:space:]]' or r.identity_key is distinct from public.document_identity_key(r.primary_url) or r.match_key is distinct from public.document_match_key(r.primary_url) then
   issues:=issues||jsonb_build_array(jsonb_build_object('table','staged_guidelines','id',r.id,'field','primary_url/identity_key/match_key','problem','invalid URL or derived key disagreement'));end if;
 end loop;
 for r in select id::text id,review_status,reviewed_by,reviewed_at,review_note from public.staged_guidelines loop
  if r.review_status in('accepted','resolved') and (r.reviewed_by is null or r.reviewed_at is null) then
   issues:=issues||jsonb_build_array(jsonb_build_object('table','staged_guidelines','id',r.id,'field','reviewed_by/reviewed_at','problem','closed acceptance/resolution requires recorded attribution'));end if;
 end loop;
 if jsonb_array_length(issues)>0 then raise exception 'Governance preflight failed: unsafe legacy data; authorised correction/quarantine required' using errcode='GV005',detail=issues::text;end if;
 -- Legacy NULL primary and unattributed rejections are retained, not invented or certified.
end $preflight$;
