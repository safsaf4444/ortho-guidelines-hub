-- PROPOSED migration: tested only in a network-none disposable PostgreSQL.
-- Not in migrations/: never run against production without the reviewed plan.
-- Requires the repository rebuild chain through URL-key v4 and reject-open.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
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

do $$begin
 if to_regprocedure('public._url_decode_unreserved(text)') is null or to_regclass('public.staged_discovery_decisions') is null then
  raise exception 'Governance hardening requires URL-key v4 and discovery decision schema' using errcode='55000';
 end if;
end$$;

-- Private, transaction-scoped capability. No API role can mint it, even with BYPASSRLS.
create table public.governance_publication_context (
 backend_pid integer not null, transaction_id bigint not null, guideline_id text not null,
 actor uuid not null references auth.users(id), primary key(backend_pid,transaction_id)
);
create table public.governance_publications (
 id uuid primary key default gen_random_uuid(), staged_id uuid not null unique references public.staged_guidelines(id),
 guideline_id text not null unique references public.guidelines(id), authorised_by uuid not null references auth.users(id),
 authorised_at timestamptz not null default clock_timestamp(), note text not null check(note ~ '\S'),
 payload_sha256 text not null check(payload_sha256 ~ '^[0-9a-f]{64}$'), verification_evidence_id uuid, clinical_review_id uuid
);
create table public.governance_evidence (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in('automated-link-check','human-source-review','clinical-review')),
 source_url text not null, identity_key text not null, observed_at timestamptz not null default clock_timestamp(),
 actor uuid references auth.users(id), issuer text not null, note text not null check(note ~ '\S'),
 outcome text, http_status integer, final_url text, staged_id uuid references public.staged_guidelines(id), payload_sha256 text,
 check ((kind='automated-link-check' and actor is null and http_status between 100 and 599)
     or (kind<>'automated-link-check' and actor is not null and http_status is null)),
 check (kind<>'clinical-review' or (staged_id is not null and payload_sha256 ~ '^[0-9a-f]{64}$'))
);
alter table public.governance_publications add foreign key(verification_evidence_id) references public.governance_evidence(id);
alter table public.governance_publications add foreign key(clinical_review_id) references public.governance_evidence(id);
-- No implicit freshness policy or trusted workflow credential is invented.
create table public.governance_verification_policy (
 singleton boolean primary key default true check(singleton), maximum_age interval check(maximum_age>interval '0'),
 decided_by text, decision_note text, check(maximum_age is null or (coalesce(decided_by,'') ~ '\S' and coalesce(decision_note,'') ~ '\S'))
);
insert into public.governance_verification_policy(singleton) values(true);
create table public.governance_rejections (
 id uuid primary key default gen_random_uuid(), staged_id uuid not null unique references public.staged_guidelines(id),
 identity_key text, source_url text, actor uuid references auth.users(id), note text not null check(note ~ '\S'),
 recorded_at timestamptz not null default clock_timestamp(), legacy boolean not null default false,
 identity_unavailable boolean not null default false, check(legacy or actor is not null),
 check(identity_key is not null or identity_unavailable)
);
create index governance_rejections_identity on public.governance_rejections(identity_key);
create table public.governance_rejection_releases (
 rejection_id uuid primary key references public.governance_rejections(id), actor uuid not null references auth.users(id),
 note text not null check(note ~ '\S'), released_at timestamptz not null default clock_timestamp()
);
-- Preserve old decisions without manufacturing an approver or a URL.
insert into public.governance_rejections(staged_id,identity_key,source_url,actor,note,legacy,identity_unavailable)
select id,identity_key,primary_url,reviewed_by,coalesce(nullif(btrim(review_note),''),'Legacy rejection; attribution retained as recorded'),true,identity_key is null
from public.staged_guidelines where review_status='rejected';

do $$declare t text;begin
 foreach t in array array['governance_publication_context','governance_publications','governance_evidence','governance_verification_policy','governance_rejections','governance_rejection_releases'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  if t not in('governance_publication_context','governance_verification_policy') then
   execute format('grant select on public.%I to authenticated',t);
   execute format('create policy named_editor_read on public.%I for select to authenticated using(public.is_editor())',t);
   execute format('create trigger immutable_governance before update or delete or truncate on public.%I for each statement execute function public.forbid_mutation()',t);
  end if;
 end loop;
end$$;

create function public._governance_key(p_url text) returns text language plpgsql immutable set search_path=public,pg_temp as $$
declare k text;begin
 if p_url is null or p_url !~* '^https?://[^/?#@[:space:]]+([/?#]|$)' or p_url ~ '[[:space:]]' then
  raise exception 'Explicit HTTP(S) source URL without credentials required' using errcode='GV002';
 end if;
 k:=public.document_identity_key(p_url);
 if k is null or k='' then raise exception 'Invalid URL identity' using errcode='GV002';end if;
 return k;
end$$;
create function public._governance_payload_hash(p_data jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select encode(sha256(convert_to((p_data-'verification_evidence_id'-'clinical_review_evidence_id')::text,'UTF8')),'hex');
$$;
-- Transaction-isolation contract (F1). Every serialised governance path runs only at READ COMMITTED,
-- where each statement after this lock takes a fresh snapshot and so sees evidence committed while waiting.
-- A REPEATABLE READ or SERIALIZABLE snapshot predates the wait, and evidence appends do not update the queue
-- row, so such a transaction could validate stale evidence and publish. Those modes, and READ UNCOMMITTED
-- (not the tested contract), are refused before the lock with GV007. This is the only pipeline-lock call site.
create function public._governance_acquire_pipeline_lock() returns void language plpgsql set search_path=public,pg_temp as $$
declare v_level text:=pg_catalog.current_setting('transaction_isolation');begin
 if v_level is distinct from 'read committed' then
  raise exception 'Editorial governance writes require READ COMMITTED; % transactions are refused',upper(v_level) using errcode='GV007',hint='Nothing was changed. Retry without overriding the transaction isolation level.';
 end if;
 perform pg_advisory_xact_lock(20261107,25);
end$$;
create function public._governance_rejected(p_key text) returns boolean language sql stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.governance_rejections r where r.identity_key=p_key
 and not exists(select 1 from public.governance_rejection_releases x where x.rejection_id=r.id));
$$;

-- A dedicated NOLOGIN principal is intentionally NOT granted to any existing API role.
do $$begin
 if exists(select 1 from pg_roles where rolname='ortho_link_verifier') then
  raise exception 'ortho_link_verifier already exists: review its membership before applying' using errcode='55000';
 end if;
 create role ortho_link_verifier nologin noinherit nosuperuser nobypassrls;
end$$;
create function public.record_automated_link_evidence(p_url text,p_http_status integer,p_note text,p_final_url text default null)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_key text;v_final text;v_outcome text;begin
 v_key:=public._governance_key(p_url);v_final:=public._governance_key(coalesce(p_final_url,p_url));
 if p_note is null or p_note !~ '\S' or p_http_status is null or p_http_status not between 100 and 599 then raise exception 'Recorded checker result and notes required' using errcode='23514';end if;
 v_outcome:=case when p_http_status between 200 and 299 and v_final=v_key then 'verified'
  when p_http_status between 300 and 399 or (p_http_status between 200 and 299 and v_final<>v_key) then 'moved'
  when p_http_status in(401,403,429) then 'blocked'
  when p_http_status>=500 or p_http_status<200 then 'needs-review' else 'broken' end;
 insert into public.governance_evidence(kind,source_url,identity_key,issuer,note,outcome,http_status,final_url)
 values('automated-link-check',p_url,v_key,'ortho_link_verifier',p_note,v_outcome,p_http_status,coalesce(p_final_url,p_url)) returning id into v_id;
 return v_id;
end$$;
create function public.record_clinical_review(p_staged_id uuid,p_data jsonb,p_note text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;v_url text;begin
 if public.is_editor() is not true then raise exception 'Named database editor required' using errcode='42501';end if;
 if p_note is null or p_note !~ '\S' or jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Explicit review payload and note required' using errcode='23514';end if;
 perform public._governance_acquire_pipeline_lock();
 perform 1 from public.staged_guidelines where id=p_staged_id and review_status='pending' and change_reason='NEW_GUIDELINE';
 if not found then raise exception 'Pending new candidate required' using errcode='55000';end if;
 v_url:=p_data->'versions'->0->>'url';perform public._governance_key(v_url);
 insert into public.governance_evidence(kind,source_url,identity_key,actor,issuer,note,staged_id,payload_sha256)
 values('clinical-review',v_url,public._governance_key(v_url),auth.uid(),'named-editor',p_note,p_staged_id,public._governance_payload_hash(p_data)) returning id into v_id;
 return v_id;
end$$;
create function public.record_human_source_review(p_url text,p_outcome text,p_note text) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;begin
 if public.is_editor() is not true then raise exception 'Named database editor required' using errcode='42501';end if;
 if p_outcome is null or p_outcome not in('withdrawn','superseded') or p_note is null or p_note !~ '\S' then raise exception 'Explicit human source outcome and note required' using errcode='23514';end if;
 insert into public.governance_evidence(kind,source_url,identity_key,actor,issuer,note,outcome)
 values('human-source-review',p_url,public._governance_key(p_url),auth.uid(),'named-editor',p_note,p_outcome) returning id into v_id;
 return v_id;
end$$;

create function public._governance_queue_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;begin
 perform public._governance_acquire_pipeline_lock();
 if TG_OP='UPDATE' and old.review_status in('accepted','rejected','resolved')
   and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
  raise exception 'Closed decisions are immutable; use an explicit rejection release' using errcode='GV006';
 end if;
 if new.review_status in('pending','deferred') then
  if jsonb_typeof(new.versions) is distinct from 'array' then raise exception 'Incoming staged versions must be an array' using errcode='GV005';end if;
  if exists(select 1 from jsonb_array_elements(new.versions) v where jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'url') is distinct from 'string' or v->>'url' !~* '^https?://[^/?#@[:space:]]+([/?#]|$)' or v->>'url' ~ '[[:space:]]') then raise exception 'Incoming staged versions require HTTP(S) URL objects' using errcode='GV005';end if;
  if TG_OP='INSERT' or new.versions is distinct from old.versions then
   if exists(select 1 from jsonb_array_elements(new.versions) v where not public._governance_scope_valid(v)) then raise exception 'Incoming staged version scope must be document, surface, index, fallback or navigation; labels are never classified' using errcode='GV005';end if;
   -- A queue row records no surface_url, so a surface role on a staged version can never be substantiated.
   if exists(select 1 from jsonb_array_elements(new.versions) v where v->>'scope'='surface') then raise exception 'Staged versions cannot carry a surface scope; only discovery evidence with a recorded surface_url can' using errcode='GV005';end if;
  end if;
  k:=public._governance_key(new.primary_url);

  if new.change_reason='NEW_GUIDELINE' and public._governance_rejected(k) then raise exception 'Document has an unreleased rejection; new producer or candidate ID cannot reset it' using errcode='GV006';end if;
 end if;
 if new.review_status='rejected' and (TG_OP='INSERT' or old.review_status is distinct from 'rejected') then
  if public.is_editor() is not true then raise exception 'Named editor required to reject' using errcode='42501';end if;
 end if;
 return new;
end$$;
create function public._governance_remember_rejection() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if new.review_status='rejected' and (TG_OP='INSERT' or old.review_status is distinct from 'rejected') then
  insert into public.governance_rejections(staged_id,identity_key,source_url,actor,note,identity_unavailable)
  values(new.id,new.identity_key,new.primary_url,auth.uid(),new.review_note,new.identity_key is null);
  perform public._governance_snapshot_rejection(new.id);
 end if;return new;
end$$;
create trigger governance_queue_guard before insert or update on public.staged_guidelines for each row execute function public._governance_queue_guard();
create trigger governance_remember_rejection after insert or update on public.staged_guidelines for each row execute function public._governance_remember_rejection();
create function public.release_rejected_document(p_url text,p_note text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;begin
 if public.is_editor() is not true then raise exception 'Named editor required' using errcode='42501';end if;
 if p_note is null or p_note !~ '\S' then raise exception 'Release reason required' using errcode='23514';end if;
 perform public._governance_acquire_pipeline_lock();
 insert into public.governance_rejection_releases(rejection_id,actor,note)
 select r.id,auth.uid(),p_note from public.governance_rejections r where r.identity_key=public._governance_key(p_url)
 and not exists(select 1 from public.governance_rejection_releases x where x.rejection_id=r.id);
 get diagnostics n=row_count;return n;
end$$;

create function public._governance_write_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id text;begin
 if TG_OP<>'INSERT' then raise exception 'Publication table changes require a separately reviewed audited workflow' using errcode='42501';end if;
 if TG_TABLE_NAME='guidelines' then v_id:=new.id;else v_id:=new.guideline_id;end if;
 if TG_OP<>'INSERT' or not exists(select 1 from public.governance_publication_context c
  where c.backend_pid=pg_backend_pid() and c.transaction_id=txid_current() and c.guideline_id=v_id and c.actor=auth.uid()) then
  raise exception 'Direct writes refused; named-editor atomic publication RPC required' using errcode='42501';
 end if;return new;
end$$;
create trigger governance_write_guard before insert or update or delete on public.guidelines for each row execute function public._governance_write_guard();
create trigger governance_write_guard before insert or update or delete on public.guideline_changelog for each row execute function public._governance_write_guard();
create trigger governance_truncate_guard before truncate on public.guidelines for each statement execute function public._governance_write_guard();
create trigger governance_truncate_guard before truncate on public.guideline_changelog for each statement execute function public._governance_write_guard();
alter table public.guidelines enable row level security;
alter table public.guideline_changelog enable row level security;
drop policy if exists guidelines_editor_insert on public.guidelines;
drop policy if exists guidelines_editor_update on public.guidelines;
drop policy if exists changelog_editor_insert on public.guideline_changelog;
revoke insert,update,delete,truncate,references,trigger on public.guidelines,public.guideline_changelog from public,anon,authenticated,service_role;
-- Staging/decision/evidence writes also require their validated definer RPCs.
revoke insert,update,delete,truncate,references,trigger on public.staged_guidelines,public.staged_discovery_evidence,public.staged_discovery_decisions,public.discovery_staging_holds from public,anon,authenticated,service_role;
alter table public.guidelines alter column guidance_status drop default;

create function public._governance_prepare(p_staged_id uuid,p_data jsonb) returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare s public.staged_guidelines;g public.guidelines;e public.governance_evidence;v_url text;k text;holder text;max_age interval;primary_key text;begin
 perform public._governance_acquire_pipeline_lock();
 select * into strict s from public.staged_guidelines where id=p_staged_id;
 perform public._governance_key(s.primary_url);
 if jsonb_typeof(p_data) is distinct from 'object' then raise exception 'Object payload required' using errcode='23514';end if;
 g:=jsonb_populate_record(null::public.guidelines,p_data);
 if g.guidance_status is null or jsonb_typeof(p_data->'guidance_status') is distinct from 'string' then raise exception 'Explicit clinical status required; current is never inferred' using errcode='GV004';end if;
 if g.source_type is null then raise exception 'Explicit source type required' using errcode='GV004';end if;
 if jsonb_typeof(g.versions) is distinct from 'array' then raise exception 'Source versions array required' using errcode='GV002';end if;
 if jsonb_array_length(g.versions)=0 then raise exception 'Primary source URL required' using errcode='GV002';end if;
 if exists(select 1 from jsonb_array_elements(g.versions) v where jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'url') is distinct from 'string') then raise exception 'Each published version requires a string URL' using errcode='GV002';end if;
 primary_key:=public._governance_key(g.versions->0->>'url');
 -- Observed alternatives are comparison signals, never a licence to merge documents.
 for v_url in select distinct u from (
  select s.primary_url u union all select s.changed_url
  union all select v->>'url' from jsonb_array_elements(coalesce(s.versions,'[]'::jsonb)) v
  union all select v->>'url' from jsonb_array_elements(g.versions) v
  union all select ev.discovered_url from public.staged_discovery_evidence ev where ev.staged_id=s.id
  union all select v->>'url' from public.staged_discovery_evidence ev,jsonb_array_elements(ev.observed_versions) v where ev.staged_id=s.id
  union all select ve.source_url from public.governance_evidence ve where ve.id=(p_data->>'verification_evidence_id')::uuid
  union all select ve.final_url from public.governance_evidence ve where ve.id=(p_data->>'verification_evidence_id')::uuid
  union all select a->>'url' from public.staged_discovery_evidence ev,
    jsonb_array_elements(coalesce(ev.url_alternatives,'[]'::jsonb)) a where ev.staged_id=s.id
 ) links where u is not null loop
  k:=public._governance_key(v_url);
  if public._governance_comparison_required(k) then raise exception 'Rejected-source comparison required; review-only until attributed reconsideration' using errcode='GV006';end if;
  if public._governance_rejected(k) then raise exception 'Published or staged source has an unreleased rejection' using errcode='GV006';end if;
  if exists(select 1 from public.discovery_staging_holds h where h.match_key=public.document_match_key(v_url)) then raise exception 'Source has an editorial hold' using errcode='RQ002';end if;
  holder:=public.catalogue_entry_for_identity_key(k);
  if holder is not null then raise exception 'Source URL already held by entry %; compare rather than publish duplicate',holder using errcode='42809';end if;
  holder:=public.catalogue_entry_for_match_key(public.document_match_key(v_url));
  if holder is not null then raise exception 'Near URL match to entry % requires comparison; no documents merged',holder using errcode='42809';end if;
 end loop;
 if g.guidance_status='current' or p_data->>'clinical_review_evidence_id' is not null then
  select * into e from public.governance_evidence where id=(p_data->>'clinical_review_evidence_id')::uuid;
  if not found or e.kind is distinct from 'clinical-review' or e.staged_id is distinct from s.id or e.identity_key is distinct from primary_key
    or e.payload_sha256 is distinct from public._governance_payload_hash(p_data) then
   raise exception 'Current guidance requires attributed clinical review of this exact candidate payload' using errcode='GV003';
  end if;
 end if;
 if coalesce(g.link_verification_status,'unchecked') not in('unchecked','needs-review')
   or (g.link_verification_status='needs-review' and p_data->>'verification_evidence_id' is not null) then
  select * into e from public.governance_evidence where id=(p_data->>'verification_evidence_id')::uuid;
  if not found or e.identity_key<>primary_key or e.outcome is distinct from g.link_verification_status then raise exception 'Verification requires matching immutable primary-URL evidence' using errcode='GV003';end if;
  if g.link_verification_status in('verified','broken','moved','blocked','needs-review') then
   select maximum_age into max_age from public.governance_verification_policy where singleton;
   if e.kind<>'automated-link-check' or max_age is null or e.observed_at>clock_timestamp() or e.observed_at<clock_timestamp()-max_age then raise exception 'Trusted checker evidence and approved freshness policy required' using errcode='GV003';end if;
   p_data:=p_data||jsonb_build_object('link_last_verified',(e.observed_at at time zone 'UTC')::date,'link_verification_notes','Automated link availability evidence '||e.id||'; not clinical approval');
  elsif g.link_verification_status in('withdrawn','superseded') then
   if e.kind<>'human-source-review' then raise exception 'Human source review evidence required' using errcode='GV003';end if;
   p_data:=p_data||jsonb_build_object('link_last_verified',null,'link_verification_notes','Human source review evidence '||e.id||'; not an automated availability check');
  else raise exception 'Unsupported verification outcome' using errcode='GV003';end if;
 elsif p_data->>'verification_evidence_id' is not null then raise exception 'Unverified status cannot attach an outcome receipt' using errcode='GV003';
 elsif g.link_last_verified is not null then raise exception 'Unchecked submissions cannot claim a check date' using errcode='GV003';end if;
 return p_data;
end$$;


-- F1/F2: shared transaction protocol. API paths acquire global lock BEFORE queue row.
-- Comparison holds are derived from immutable signals; legacy queue rows are unchanged.
create table public.governance_late_evidence (
 id uuid primary key default gen_random_uuid(), evidence_id uuid not null unique references public.staged_discovery_evidence(id),
 staged_id uuid not null references public.staged_guidelines(id), recorded_at timestamptz not null default clock_timestamp(),
 closed_status text not null, producer text not null, review_required boolean not null default true check(review_required)
);
create table public.governance_rejection_sources (
 id uuid primary key default gen_random_uuid(), rejection_id uuid not null references public.governance_rejections(id),
 evidence_id uuid references public.staged_discovery_evidence(id), producer text, candidate_class text not null,
 source_url text, observed_alias text not null, identity_key text not null, relationship text not null, trust_status text not null,
 -- trust_status is part of the identity: contradictory labels on one alias are each retained, so any
 -- document-level observation derives a comparison hold regardless of observation order.
 recorded_at timestamptz not null default clock_timestamp(), unique(rejection_id,evidence_id,identity_key,relationship,trust_status)
);
create index governance_rejection_sources_key on public.governance_rejection_sources(identity_key);
do $$declare t text;begin
 foreach t in array array['governance_late_evidence','governance_rejection_sources'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy named_editor_read on public.%I for select to authenticated using(public.is_editor())',t);
  execute format('create trigger immutable_governance before update or delete or truncate on public.%I for each statement execute function public.forbid_mutation()',t);
 end loop;
end$$;
-- Scope contract (R1, P2-2, P2-3). Free-text labels are never classified. Scope is validated at
-- staging against one shared set (mirrored by scripts/lib/scope-contract.ts; cross-checked by
-- scripts/tests/scope-contract.test.ts). No producer-supplied value can establish that a link is
-- navigation rather than document evidence: every in-system input to such a claim (scope,
-- derivedFrom, surfaceUrl) is chosen by the same producer, so a claim is recorded as provenance
-- and stays comparison-only (review required). Unscoped, malformed and legacy signals are
-- comparison-only too. An exemption needs a verified role or an attributed editor decision; that
-- is the unsigned D3 policy decision, so no exemption path exists here (fail closed).
create function public._governance_scope_valid(p_signal jsonb) returns boolean language sql immutable set search_path=public,pg_temp as $$
 select not(p_signal ? 'scope') or (jsonb_typeof(p_signal->'scope')='string' and p_signal->>'scope' in('document','surface','index','fallback','navigation'));
$$;
create function public._governance_alias_trust(p_signal jsonb) returns text language sql immutable set search_path=public,pg_temp as $$
 select case when jsonb_typeof(p_signal->'scope')='string' and p_signal->>'scope' in('surface','index','fallback','navigation')
  then 'comparison-only; producer-declared '||(p_signal->>'scope')||' role unverified; equivalence not established'
  else 'comparison-only; equivalence not established' end;
$$;
create function public._governance_snapshot_rejection(p_staged_id uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.staged_guidelines;r public.governance_rejections;e public.staged_discovery_evidence;v jsonb;u text;t text;begin
 select * into strict s from public.staged_guidelines where id=p_staged_id;
 select * into r from public.governance_rejections where staged_id=s.id;if not found then return;end if;
 for e in select * from public.staged_discovery_evidence where staged_id=s.id loop
  if e.discovered_url is not null then
   u:=e.discovered_url;perform public._governance_key(u);
   insert into public.governance_rejection_sources(rejection_id,evidence_id,producer,candidate_class,source_url,observed_alias,identity_key,relationship,trust_status)
   values(r.id,e.id,e.producer,s.change_reason,e.discovered_url,u,public._governance_key(u),'observed-source','comparison-only; equivalence not established') on conflict do nothing;
  end if;
  for v in select value from jsonb_array_elements(coalesce(e.url_alternatives,'[]'::jsonb)) loop
   if v->>'url' is not null then
    u:=v->>'url';perform public._governance_key(u);
    insert into public.governance_rejection_sources(rejection_id,evidence_id,producer,candidate_class,source_url,observed_alias,identity_key,relationship,trust_status)
    values(r.id,e.id,e.producer,s.change_reason,e.discovered_url,u,public._governance_key(u),coalesce(v->>'relation',v->>'kind','untyped-alternative'),public._governance_alias_trust(v)) on conflict do nothing;
   end if;
  end loop;
  for v in select value from jsonb_array_elements(coalesce(e.observed_versions,'[]'::jsonb)) loop
   if v->>'url' is not null then
    u:=v->>'url';perform public._governance_key(u);
    insert into public.governance_rejection_sources(rejection_id,evidence_id,producer,candidate_class,source_url,observed_alias,identity_key,relationship,trust_status)
    values(r.id,e.id,e.producer,s.change_reason,e.discovered_url,u,public._governance_key(u),'observed-version',public._governance_alias_trust(v)) on conflict do nothing;
   end if;
  end loop;
 end loop;
 -- Initial staged versions may predate discovery evidence. Preserve these without invented evidence IDs.
 for v in select value from jsonb_array_elements(coalesce(s.versions,'[]'::jsonb)) loop
  if v->>'url' is not null then
   u:=v->>'url';perform public._governance_key(u);
   t:=public._governance_alias_trust(v);
   if not exists(select 1 from public.governance_rejection_sources where rejection_id=r.id and evidence_id is null and identity_key=public._governance_key(u) and trust_status=t) then
    insert into public.governance_rejection_sources(rejection_id,producer,candidate_class,source_url,observed_alias,identity_key,relationship,trust_status)
    values(r.id,s.producer,s.change_reason,s.primary_url,u,public._governance_key(u),'staged-version',t);
   end if;
  end if;
 end loop;
end$$;
create function public._governance_comparison_required(p_key text) returns boolean language sql stable set search_path=public,pg_temp as $$
 select exists(select 1 from public.governance_rejection_sources s join public.governance_rejections r on r.id=s.rejection_id where s.identity_key=p_key and s.identity_key is distinct from r.identity_key and s.trust_status like 'comparison-only%'
 and not exists(select 1 from public.governance_rejection_releases x where x.rejection_id=s.rejection_id));
$$;
create function public._governance_evidence_lock() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare a jsonb;v jsonb;begin
 perform public._governance_acquire_pipeline_lock();
 perform 1 from public.staged_guidelines where id=new.staged_id for update;
 perform public._governance_key(new.discovered_url);
 foreach a in array array[coalesce(new.observed_versions,'[]'::jsonb),coalesce(new.url_alternatives,'[]'::jsonb)] loop
  if jsonb_typeof(a) is distinct from 'array' then raise exception 'Incoming evidence versions/alternatives must be arrays' using errcode='GV005';end if;
  for v in select value from jsonb_array_elements(a) loop
   if jsonb_typeof(v) is distinct from 'object' or jsonb_typeof(v->'url') is distinct from 'string' then raise exception 'Incoming evidence requires explicit URL objects; malformed signals cannot be skipped' using errcode='GV005';end if;
   if not public._governance_scope_valid(v) then raise exception 'Incoming evidence scope must be document, surface, index, fallback or navigation; labels are never classified' using errcode='GV005';end if;
   if v->>'scope'='surface' and coalesce(btrim(new.surface_url),'')='' then raise exception 'A surface scope needs the recorded surface_url of the discovery producer; this evidence has none' using errcode='GV005';end if;
   perform public._governance_key(v->>'url');
  end loop;
 end loop;
 return new;
end$$;
create function public._governance_evidence_after() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.staged_guidelines;begin
 select * into strict s from public.staged_guidelines where id=new.staged_id;
 if s.review_status in('accepted','rejected','resolved') then
  insert into public.governance_late_evidence(evidence_id,staged_id,closed_status,producer) values(new.id,s.id,s.review_status,new.producer) on conflict do nothing;
  if s.review_status='rejected' then perform public._governance_snapshot_rejection(s.id);end if;
 end if;return new;
end$$;
create trigger governance_evidence_lock before insert on public.staged_discovery_evidence for each row execute function public._governance_evidence_lock();
create trigger governance_evidence_after after insert on public.staged_discovery_evidence for each row execute function public._governance_evidence_after();
-- Backfill only recorded signals; no URLs, producers or decisions invented.
do $$declare r record;begin for r in select staged_id from public.governance_rejections loop perform public._governance_snapshot_rejection(r.staged_id);end loop;end$$;

create or replace function public.stage_discovery_candidate(
  p_run_id    text,
  p_producer  text,
  p_candidate jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_class     text := p_candidate->>'classification';
  v_url       text := p_candidate->>'discoveredUrl';
  v_identity  text;
  v_match     text;
  v_matched   text := nullif(p_candidate->>'matchedGuidelineId', '');
  v_cid       text := p_candidate->>'discoveryId';
  v_id        uuid;
  v_status    text;
  v_basis     text;
  v_file_cid  text;
  v_collided  boolean;
  v_row       public.staged_guidelines;
  v_hold      public.discovery_staging_holds;
  v_evidence  uuid;
  v_soft      jsonb := nullif(p_candidate->'softMatch', 'null'::jsonb);
  v_token     jsonb := nullif(p_candidate->'tokenChange', 'null'::jsonb);
  v_alts      jsonb := coalesce(nullif(p_candidate->'urlAlternatives', 'null'::jsonb), '[]'::jsonb);
  v_relation  text;
  v_other     text;
begin
  perform public._governance_acquire_pipeline_lock();
  if p_run_id is null or length(btrim(p_run_id)) = 0 then
    raise exception 'stage_discovery_candidate: a run id is required for idempotency' using errcode = '22023';
  end if;
  if p_producer is distinct from 'discover' then
    raise exception 'stage_discovery_candidate: producer must be ''discover''' using errcode = '22023';
  end if;
  -- Exactly the three discovery classes. Publisher retirement has no class and
  -- can never arrive here; any other change_reason belongs to another pipeline.
  if v_class is null or v_class not in ('NEW_GUIDELINE', 'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED') then
    raise exception 'stage_discovery_candidate: % is not a stageable discovery class (publisher retirement is report-only)',
      coalesce(v_class, '(null)') using errcode = '22023';
  end if;
  if v_url is null or length(btrim(v_url)) = 0 or v_cid is null or length(btrim(v_cid)) = 0
     or coalesce(btrim(p_candidate->>'topic'), '') = '' or coalesce(btrim(p_candidate->>'provider'), '') = ''
     or coalesce(btrim(p_candidate->>'surfaceUrl'), '') = '' or p_candidate->>'observedAt' is null then
    raise exception 'stage_discovery_candidate: discoveryId, discoveredUrl, topic, provider, surfaceUrl and observedAt are required'
      using errcode = '22023';
  end if;
  if v_class = 'NEW_GUIDELINE' and v_matched is not null then
    raise exception 'stage_discovery_candidate: a NEW_GUIDELINE candidate cannot name an existing entry (%)', v_matched
      using errcode = '22023';
  end if;
  if v_class <> 'NEW_GUIDELINE' and v_matched is null then
    raise exception 'stage_discovery_candidate: a % candidate must name the entry it concerns', v_class
      using errcode = '22023';
  end if;
  -- Evidence must fit the class it is offered for (see "Discovery evidence
  -- validation"). Checked on every call.
  if jsonb_typeof(v_alts) <> 'array' then
    raise exception 'stage_discovery_candidate: urlAlternatives must be an array' using errcode = '22023';
  end if;
  if v_class = 'NEW_GUIDELINE' and (v_soft is not null or v_token is not null) then
    raise exception 'stage_discovery_candidate: a NEW_GUIDELINE candidate cannot carry softMatch or tokenChange evidence: it claims no relationship to an existing entry'
      using errcode = '22023';
  end if;
  if v_class = 'POSSIBLE_NEW_EDITION' then
    if v_token is not null then
      raise exception 'stage_discovery_candidate: a POSSIBLE_NEW_EDITION candidate cannot carry tokenChange evidence (that is EDITION_TOKEN_CHANGED)'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_soft) is distinct from 'object' or v_soft->>'guidelineId' is distinct from v_matched then
      raise exception 'stage_discovery_candidate: a POSSIBLE_NEW_EDITION candidate needs softMatch evidence naming the same entry (%)', v_matched
        using errcode = '22023';
    end if;
  end if;
  if v_class = 'EDITION_TOKEN_CHANGED' then
    if v_soft is not null then
      raise exception 'stage_discovery_candidate: an EDITION_TOKEN_CHANGED candidate cannot carry softMatch evidence'
        using errcode = '22023';
    end if;
    if jsonb_typeof(v_token) is distinct from 'object' or v_token->>'guidelineId' is distinct from v_matched
       or coalesce(btrim(v_token->>'parameter'), '') = ''
       or v_token->>'previousValue' is null or v_token->>'observedValue' is null
       or v_token->>'previousValue' = v_token->>'observedValue' then
      raise exception 'stage_discovery_candidate: an EDITION_TOKEN_CHANGED candidate needs tokenChange evidence naming the same entry (%), a parameter, and two different values', v_matched
        using errcode = '22023';
    end if;
  end if;

  v_identity := public.document_identity_key(v_url);
  v_match    := public.document_match_key(v_url);
  if (p_candidate->>'sourceUrlKey') is distinct from v_identity then
    raise exception 'stage_discovery_candidate: identity disagreement — producer key % vs database key %',
      coalesce(p_candidate->>'sourceUrlKey', '(none)'), v_identity using errcode = '22023';
  end if;
  v_relation := public._catalogue_relation(v_matched, v_identity, v_match, v_alts);

  select * into v_hold from public.discovery_staging_holds where match_key = v_match;
  if found then
    return jsonb_build_object('status', 'held', 'evidence', 'none', 'identityKey', v_identity,
                              'holdStatus', v_hold.status, 'reason', v_hold.reason);
  end if;

  select q.o_status, q.o_row_id, q.o_basis, q.o_cid, q.o_collided
    into v_status, v_id, v_basis, v_file_cid, v_collided
    from public._queue_row_for(v_cid, v_identity, v_match) q;
  if v_status = 'none' then
    v_id := null;
    -- Relationship checks, against the DATABASE catalogue, only when a NEW
    -- row would be filed: an existing or already-open row is never re-judged.
    if v_matched is not null and not exists (select 1 from public.guidelines where id = v_matched) then
      raise exception 'stage_discovery_candidate: % names entry %, which is not in the catalogue', v_cid, v_matched
        using errcode = '22023';
    end if;
    if v_class = 'NEW_GUIDELINE' then
      v_other := public.catalogue_entry_for_identity_key(v_identity);
      if v_other is not null then
        raise exception 'stage_discovery_candidate: % is already catalogued exactly as entry % — not a new guideline', v_cid, v_other
          using errcode = '22023';
      end if;
      v_other := public.catalogue_entry_for_match_key(v_match);
      if v_other is not null then
        raise exception 'stage_discovery_candidate: % loosely matches catalogue entry % — it needs a document comparison, which the discovery path cannot file; not staged (it stays in the discovery report for a human)', v_cid, v_other
          using errcode = '22023';
      end if;
      select g.id into v_other
        from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v,
             jsonb_array_elements(v_alts) a
       -- P3-1: an omitted scope is document-level here too (the shared contract's conservative default).
       where v ? 'url' and coalesce(a->>'scope', 'document') = 'document' and a->>'relation' in ('redirect-target', 'canonical-host')
         and coalesce(btrim(a->>'url'), '') <> ''
         and public.document_match_key(v->>'url') = public.document_match_key(a->>'url')
       order by g.id limit 1;
      if v_other is not null then
        raise exception 'stage_discovery_candidate: an observed alternative URL of % is catalogued as entry % — that contradicts NEW_GUIDELINE', v_cid, v_other
          using errcode = '22023';
      end if;
    elsif v_class = 'POSSIBLE_NEW_EDITION' then
      if v_relation = 'exact' then
        raise exception 'stage_discovery_candidate: % is entry %''s own catalogued link, not a new edition of it', v_cid, v_matched
          using errcode = '22023';
      end if;
      v_other := public._other_catalogue_entry(v_matched, v_identity, v_match, false);
      if v_other is not null then
        raise exception 'stage_discovery_candidate: % is catalogued exactly as a different entry (%), which contradicts a new edition of %', v_cid, v_other, v_matched
          using errcode = '22023';
      end if;
      v_other := public._other_catalogue_entry(v_matched, v_identity, v_match, true);
      if v_other is not null and v_relation <> 'loose' then
        raise exception 'stage_discovery_candidate: % loosely matches a different entry (%) and not %, which contradicts a new edition of %', v_cid, v_other, v_matched, v_matched
          using errcode = '22023';
      end if;
    elsif v_class = 'EDITION_TOKEN_CHANGED' then
      if v_relation = 'none' then
        raise exception 'stage_discovery_candidate: % has no URL relationship with entry % (neither its URL nor an observed alternative matches one of the entry''s links); a token change needs one', v_cid, v_matched
          using errcode = '22023';
      end if;
      if v_relation <> 'exact' then
        v_other := public._other_catalogue_entry(v_matched, v_identity, v_match, false);
        if v_other is not null then
          raise exception 'stage_discovery_candidate: % is catalogued exactly as a different entry (%), which contradicts a token change on %', v_cid, v_other, v_matched
            using errcode = '22023';
        end if;
      end if;
    end if;
    -- DO NOTHING covers both unique rules (candidate_id and the document
    -- slot); a concurrent inserter of the same document makes this statement
    -- wait, then conflict — and the re-resolution below sees its row.
    insert into public.staged_guidelines (
      candidate_id, pipeline, provider, provider_name, topic, source, notes,
      versions, primary_url, change_reason, review_status, discovered_at,
      matched_guideline_id, changed_url, producer
    ) values (
      v_file_cid, 'discovery', p_candidate->>'provider', p_candidate->>'providerName',
      p_candidate->>'topic', p_candidate->>'providerName', p_candidate->>'notes',
      jsonb_build_array(jsonb_build_object('label', 'Discovered', 'url', v_url)),
      v_url, v_class, 'pending', (p_candidate->>'observedAt')::timestamptz,
      v_matched, case when v_class = 'NEW_GUIDELINE' then null else v_url end,
      'discover'
    )
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      v_status := 'staged';
    else
      select q.o_status, q.o_row_id, q.o_basis, q.o_cid, q.o_collided
        into v_status, v_id, v_basis, v_file_cid, v_collided
        from public._queue_row_for(v_cid, v_identity, v_match) q;
      if v_status = 'none' then
        raise exception 'stage_discovery_candidate: insert conflicted but no row was found for %', v_cid
          using errcode = '40001';
      end if;
    end if;
  end if;
  v_basis := coalesce(v_basis, 'identity');
  select * into v_row from public.staged_guidelines where id = v_id;

  insert into public.staged_discovery_evidence (
    staged_id, discovery_run_id, producer, discovery_id, report_schema_version,
    discovered_url, surface_url, observed_topic, stated_labels, url_alternatives,
    soft_match, token_change, observed_at, row_match_basis, catalogue_relation
  ) values (
    v_row.id, p_run_id, 'discover', v_cid, coalesce((p_candidate->>'reportSchemaVersion')::integer, 1),
    v_url, p_candidate->>'surfaceUrl', p_candidate->>'topic',
    coalesce(p_candidate->'statedLabels', '[]'::jsonb),
    v_alts, v_soft, v_token,
    (p_candidate->>'observedAt')::timestamptz, v_basis, v_relation
  )
  on conflict (staged_id, discovery_run_id, discovery_id) do nothing
  returning id into v_evidence;

  return jsonb_build_object(
    'status', v_status,
    'evidence', case when v_evidence is not null then 'appended' else 'already_recorded' end,
    'stagedId', v_row.id, 'identityKey', v_identity, 'reviewStatus', v_row.review_status,
    'identityBasis', v_basis, 'catalogueRelation', v_relation)
    || case when v_collided then jsonb_build_object('candidateIdCollision',
         jsonb_build_object('requestedId', v_cid, 'filedAs', v_file_cid)) else '{}'::jsonb end
    || case when v_status = 'already_open' then jsonb_build_object(
         'heldByCandidateId', v_row.candidate_id, 'heldByProducer', v_row.producer,
         'heldByStatus', v_row.review_status) else '{}'::jsonb end;
end;
$$;

create or replace function public._stage_sync_candidate(p_run_id text, p_c jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_cid      text := p_c->>'candidateId';
  v_url      text := p_c->'versions'->0->>'url';
  v_class    text := p_c->>'changeReason';
  v_matched  text := nullif(p_c->>'matchedGuidelineId', '');
  v_cmp      jsonb := p_c->'documentComparison';
  v_holder   text;
  v_identity text;
  v_match    text;
  v_id       uuid;
  v_status   text;
  v_basis    text;
  v_file_cid text;
  v_collided boolean;
  v_row      public.staged_guidelines;
  v_hold     public.discovery_staging_holds;
  v_evidence uuid;
begin
  perform public._governance_acquire_pipeline_lock();
  if coalesce(btrim(v_cid), '') = '' or coalesce(btrim(p_c->>'topic'), '') = ''
     or coalesce(btrim(p_c->>'provider'), '') = '' or p_c->>'discoveredAt' is null
     or jsonb_typeof(p_c->'versions') is distinct from 'array'
     or coalesce(btrim(v_url), '') = '' then
    raise exception 'stage_sync_candidates: candidateId, provider, topic, discoveredAt and versions[0].url are required'
      using errcode = '22023';
  end if;
  if p_c->>'pipeline' is distinct from 'sync-providers' then
    raise exception 'stage_sync_candidates: pipeline must be ''sync-providers'', got %', coalesce(p_c->>'pipeline', '(null)')
      using errcode = '22023';
  end if;
  -- sync-providers emits two classes: NEW_GUIDELINE (no catalogue match under
  -- either key) and POSSIBLE_SAME_DOCUMENT (a loose-only match). Anything else
  -- belongs to another producer's staging path.
  if v_class is null or v_class not in ('NEW_GUIDELINE', 'POSSIBLE_SAME_DOCUMENT') then
    raise exception 'stage_sync_candidates: % is not a sync-providers class', coalesce(v_class, '(null)')
      using errcode = '22023';
  end if;
  if v_class = 'NEW_GUIDELINE' and (v_matched is not null or jsonb_typeof(v_cmp) = 'object') then
    raise exception 'stage_sync_candidates: a NEW_GUIDELINE candidate cannot name an existing entry or a comparison'
      using errcode = '22023';
  end if;
  if v_class = 'POSSIBLE_SAME_DOCUMENT'
     and (v_matched is null or jsonb_typeof(v_cmp) is distinct from 'object'
          or v_cmp->>'guidelineId' is distinct from v_matched
          or coalesce(btrim(v_cmp->>'reason'), '') = '') then
    raise exception 'stage_sync_candidates: a POSSIBLE_SAME_DOCUMENT candidate must name its matched entry and carry documentComparison with the same guidelineId and a reason'
      using errcode = '22023';
  end if;

  -- versions[0].url is the href exactly as discovered: it is what is stored.
  -- primaryUrl (match key) and sourceUrlKey (identity key) are the producer's
  -- KEYS of it; both are re-derived here and must agree.
  v_identity := public.document_identity_key(v_url);
  v_match    := public.document_match_key(v_url);
  if (p_c->>'primaryUrl') is distinct from v_match or (p_c->>'sourceUrlKey') is distinct from v_identity then
    raise exception 'stage_sync_candidates: key disagreement for % — producer match/identity % / % vs database % / %',
      v_cid, coalesce(p_c->>'primaryUrl', '(none)'), coalesce(p_c->>'sourceUrlKey', '(none)'), v_match, v_identity
      using errcode = '22023';
  end if;

  select * into v_hold from public.discovery_staging_holds where match_key = v_match;
  if found then
    return jsonb_build_object('candidateId', v_cid, 'status', 'held', 'evidence', 'none',
      'identityKey', v_identity, 'holdStatus', v_hold.status, 'reason', v_hold.reason);
  end if;

  select q.o_status, q.o_row_id, q.o_basis, q.o_cid, q.o_collided
    into v_status, v_id, v_basis, v_file_cid, v_collided
    from public._queue_row_for(v_cid, v_identity, v_match) q;
  if v_status = 'none' then
    v_id := null;
    -- Only when a NEW row would be filed: an existing or already-open row is
    -- never re-judged (a candidate approved last week is 'existing', not a
    -- failure). The classification is checked against the DATABASE catalogue, which can
    -- differ from the static file sync-providers matched against. Refused, not
    -- re-labelled: the producer's view and the database's disagree, and that is
    -- for a human to see.
    v_holder := public.catalogue_entry_for_identity_key(v_identity);
    if v_holder is not null then
      raise exception 'stage_sync_candidates: % is already catalogued exactly as entry % — not a % candidate',
        v_cid, v_holder, v_class using errcode = '22023';
    end if;
    if v_class = 'NEW_GUIDELINE' then
      v_holder := public.catalogue_entry_for_match_key(v_match);
      if v_holder is not null then
        raise exception 'stage_sync_candidates: % loosely matches catalogue entry % — it must be staged as POSSIBLE_SAME_DOCUMENT, never as NEW_GUIDELINE',
          v_cid, v_holder using errcode = '22023';
      end if;
    elsif not exists (
        select 1 from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
         where g.id = v_matched and v ? 'url' and public.document_match_key(v->>'url') = v_match) then
      raise exception 'stage_sync_candidates: % names entry %, which holds no link loosely matching %',
        v_cid, v_matched, v_url using errcode = '22023';
    end if;
    insert into public.staged_guidelines (
      candidate_id, schema_version, pipeline, provider, provider_name, topic, source,
      summary, notes, versions, primary_url, change_reason, review_status,
      discovered_at, provider_ref, matched_guideline_id, producer, changed_url
    ) values (
      v_file_cid, coalesce((p_c->>'schemaVersion')::integer, 1), 'sync-providers',
      p_c->>'provider', p_c->>'providerName', p_c->>'topic', p_c->>'provider',
      p_c->>'summary', p_c->>'notes', p_c->'versions', v_url, v_class, 'pending',
      (p_c->>'discoveredAt')::timestamptz, nullif(p_c->>'providerRef', ''), v_matched, 'sync-providers',
      case when v_class = 'POSSIBLE_SAME_DOCUMENT' then v_url end
    )
    on conflict do nothing
    returning id into v_id;
    if v_id is not null then
      v_status := 'staged';
    else
      select q.o_status, q.o_row_id, q.o_basis, q.o_cid, q.o_collided
        into v_status, v_id, v_basis, v_file_cid, v_collided
        from public._queue_row_for(v_cid, v_identity, v_match) q;
      if v_status = 'none' then
        raise exception 'stage_sync_candidates: insert conflicted but no row was found for %', v_cid
          using errcode = '40001';
      end if;
    end if;
  end if;
  v_basis := coalesce(v_basis, 'identity');
  select * into v_row from public.staged_guidelines where id = v_id;

  insert into public.staged_discovery_evidence (
    staged_id, discovery_run_id, producer, discovery_id, report_schema_version,
    discovered_url, surface_url, observed_topic, observed_versions, observed_at,
    soft_match, row_match_basis
  ) values (
    v_row.id, p_run_id, 'sync-providers', v_cid, coalesce((p_c->>'schemaVersion')::integer, 1),
    v_url, null, p_c->>'topic', p_c->'versions', (p_c->>'discoveredAt')::timestamptz,
    case when jsonb_typeof(v_cmp) = 'object' then v_cmp end, v_basis
  )
  on conflict (staged_id, discovery_run_id, discovery_id) do nothing
  returning id into v_evidence;

  return jsonb_build_object('candidateId', v_cid, 'status', v_status,
    'evidence', case when v_evidence is not null then 'appended' else 'already_recorded' end,
    'stagedId', v_row.id, 'identityKey', v_identity, 'reviewStatus', v_row.review_status,
    'identityBasis', v_basis)
    || case when v_collided then jsonb_build_object('candidateIdCollision',
         jsonb_build_object('requestedId', v_cid, 'filedAs', v_file_cid)) else '{}'::jsonb end
    || case when v_status = 'already_open' then jsonb_build_object(
         'heldByCandidateId', v_row.candidate_id, 'heldByProducer', v_row.producer,
         'heldByStatus', v_row.review_status) else '{}'::jsonb end;
end;
$$;

create or replace function public.resolve_discovery_candidate(
  p_staged_id uuid,
  p_action    text,
  p_note      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     public.staged_guidelines;
  v_status  text;
  v_outcome text;
begin
  perform public._governance_acquire_pipeline_lock();
  -- NULL-safe: is_editor() is NULL when auth.uid() is NULL.
  if public.is_editor() is not true then
    raise exception 'resolve_discovery_candidate: not an approved editor' using errcode = '42501';
  end if;
  -- `!~ '\S'`: no non-whitespace character. btrim() alone misses tabs/newlines.
  if p_note is null or p_note !~ '\S' then
    raise exception 'resolve_discovery_candidate: a note is required' using errcode = '23514';
  end if;

  select * into v_row from public.staged_guidelines where id = p_staged_id for update;
  if not found then
    raise exception 'resolve_discovery_candidate: no staged candidate %', p_staged_id using errcode = 'P0002';
  end if;
  if v_row.change_reason not in ('POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED', 'POSSIBLE_SAME_DOCUMENT') then
    raise exception 'resolve_discovery_candidate: % rows are approved or rejected, not resolved', v_row.change_reason
      using errcode = '42809';
  end if;
  if v_row.review_status not in ('pending', 'deferred') then
    raise exception 'resolve_discovery_candidate: candidate % is already %', p_staged_id, v_row.review_status
      using errcode = '55000';
  end if;

  v_outcome := v_row.review_outcome;
  if v_row.change_reason = 'POSSIBLE_NEW_EDITION' and p_action in ('same-document', 'no-action') then
    v_status := 'resolved'; v_outcome := p_action;
  elsif v_row.change_reason = 'POSSIBLE_NEW_EDITION' and p_action = 'different-document' then
    -- A separate document needs a follow-up and no re-filing path exists
    -- yet: keep the row OPEN and visible rather than close it with nothing
    -- tracking the separate document.
    v_status := 'pending';  v_outcome := 'different-document-awaiting-refiling';  -- stays OPEN
  elsif v_row.change_reason = 'POSSIBLE_NEW_EDITION' and p_action = 'new-edition' then
    v_status := 'pending';  v_outcome := 'new-edition-awaiting-revision';   -- stays OPEN
  elsif v_row.change_reason = 'POSSIBLE_SAME_DOCUMENT' and p_action = 'same-document' then
    -- The catalogue already holds this document under its other link. Closed;
    -- the catalogue is not changed (adding the variant link is a separate,
    -- explicit editor action).
    v_status := 'resolved'; v_outcome := p_action;
  elsif v_row.change_reason = 'POSSIBLE_SAME_DOCUMENT' and p_action = 'different-document' then
    -- A distinct document: stays OPEN until a re-filing path exists, exactly
    -- like the edition case. Never becomes approvable as a new entry here.
    v_status := 'pending';  v_outcome := 'different-document-awaiting-refiling';  -- stays OPEN
  elsif v_row.change_reason = 'EDITION_TOKEN_CHANGED' and p_action = 'acknowledged' then
    v_status := 'resolved'; v_outcome := p_action;
  elsif v_row.change_reason = 'EDITION_TOKEN_CHANGED' and p_action = 'needs-document-check' then
    v_status := 'pending';  v_outcome := 'needs-document-check';           -- stays OPEN
  elsif p_action = 'defer' then
    v_status := 'deferred';                                                -- stays OPEN
  else
    raise exception 'resolve_discovery_candidate: % is not a valid action for a % row', p_action, v_row.change_reason
      using errcode = '22023';
  end if;

  -- Queue row only. guidelines and guideline_changelog are never touched.
  -- Completion fields are set only by a closing action. An open action is
  -- attributed in the decision log below (decided_by, decided_at), not here.
  update public.staged_guidelines
     set review_status  = v_status,
         review_outcome = v_outcome,
         reviewed_by    = case when v_status = 'resolved' then auth.uid() else null end,
         reviewed_at    = case when v_status = 'resolved' then now()      else null end
   where id = p_staged_id;

  insert into public.staged_discovery_decisions (staged_id, action, from_status, to_status, note, decided_by)
  values (p_staged_id, p_action, v_row.review_status, v_status, btrim(p_note, E' \t\r\n'), auth.uid());

  return jsonb_build_object('stagedId', p_staged_id, 'reviewStatus', v_status,
                            'reviewOutcome', v_outcome, 'open', v_status in ('pending', 'deferred'));
end;
$$;

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
  perform public._governance_acquire_pipeline_lock();
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
  v_holder text;
  v_hold   public.discovery_staging_holds;
  v_link   text;
begin
  if public.is_editor() is not true then
    raise exception 'approve_staged_guideline: not an approved editor'
      using errcode = '42501';
  end if;

  -- `!~ '\S'`: no non-whitespace character. btrim() alone misses tabs/newlines.
  if p_changelog_note is null or p_changelog_note !~ '\S' then
    raise exception 'approve_staged_guideline: a change note is required'
      using errcode = '23514';
  end if;

  perform public._governance_acquire_pipeline_lock();
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

  -- (c) Editorial holds. Checked here as well as at staging, because a held
  -- document can already be in the queue: a row filed before this migration
  -- (its stored URL lowercased; the hold is on the loose key, so it still
  -- matches), or a row filed before the hold was added.
  if v_staged.primary_url is not null then
    select * into v_hold from public.discovery_staging_holds
     where match_key = public.document_match_key(v_staged.primary_url);
    if found then
      raise exception using
        errcode = 'RQ002',
        message = format('approve_staged_guideline: candidate %s is on the editorial hold list (%s): %s',
                         p_candidate_id, v_hold.status, v_hold.reason),
        hint    = 'Nothing was published. A hold is lifted only by an editorial decision (remove its discovery_staging_holds row).';
    end if;
  end if;

  -- (a) Ported from PR #174: this path publishes a NEW entry and nothing else.
  if v_staged.change_reason <> 'NEW_GUIDELINE' then
    raise exception
      'approve_staged_guideline: candidate % is a % candidate; it concerns existing entry %, and must not be published as a new entry',
      p_candidate_id, v_staged.change_reason, coalesce(v_staged.matched_guideline_id, '(unknown)')
      using errcode = '42809';
  end if;

  -- (b) Classification is not permission [discovery-guards v1]. A row labelled
  -- NEW_GUIDELINE that is linked to, or whose document is already held by, an
  -- existing entry would publish a duplicate.
  if v_staged.matched_guideline_id is not null then
    raise exception
      'approve_staged_guideline: candidate % is labelled NEW_GUIDELINE but is linked to existing entry %',
      p_candidate_id, v_staged.matched_guideline_id
      using errcode = '42809';
  end if;
  if v_staged.primary_url is not null then
    v_holder := public.catalogue_entry_for_identity_key(public.document_identity_key(v_staged.primary_url));
    if v_holder is not null then
      raise exception
        'approve_staged_guideline: candidate % is labelled NEW_GUIDELINE but its document is already held by entry %',
        p_candidate_id, v_holder
        using errcode = '42809';
    end if;
    -- Near match: same LOOSE key as a catalogue link but not the same
    -- identity (differs only in path/query case, a trailing slash in a query
    -- value, ...). Usually the same document under a differently-cased link,
    -- so publishing would duplicate it; occasionally a genuinely distinct
    -- document. Refused LOUDLY with the entry named — never silently — and
    -- there is no override yet: an editor must establish which it is.
    v_holder := public.catalogue_entry_for_match_key(public.document_match_key(v_staged.primary_url));
    if v_holder is not null then
      raise exception using
        errcode = '42809',
        message = format('approve_staged_guideline: candidate %s nearly matches existing entry %s', p_candidate_id, v_holder),
        detail  = 'Same document under the loose match rule (letter case, trailing slashes), but not an exact identity match.',
        hint    = 'If it is the same document, reject the candidate. If it is genuinely distinct, approval needs an override that does not exist yet.';
    end if;
  end if;

  v_new := jsonb_populate_record(null::public.guidelines, public._governance_prepare(p_candidate_id,p_final_guideline_data));

  if v_new.id is null or length(btrim(v_new.id)) = 0 then
    raise exception 'approve_staged_guideline: p_final_guideline_data.id is required'
      using errcode = '23502';
  end if;

  -- (c, continued) The links being PUBLISHED are checked too: an editor can
  -- change the URL in the publish form.
  if jsonb_typeof(v_new.versions) = 'array' then
    select v->>'url', h.status, h.reason into v_link, v_hold.status, v_hold.reason
      from jsonb_array_elements(v_new.versions) v
      join public.discovery_staging_holds h on h.match_key = public.document_match_key(v->>'url')
     where v ? 'url' and coalesce(btrim(v->>'url'), '') <> ''
     limit 1;
    if v_link is not null then
      raise exception using
        errcode = 'RQ002',
        message = format('approve_staged_guideline: the link %s is on the editorial hold list (%s): %s',
                         v_link, v_hold.status, v_hold.reason),
        hint    = 'Nothing was published. A hold is lifted only by an editorial decision (remove its discovery_staging_holds row).';
    end if;
  end if;

  insert into public.governance_publication_context(backend_pid,transaction_id,guideline_id,actor)
  values(pg_backend_pid(),txid_current(),v_new.id,auth.uid());
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
    v_new.source_type,
    v_new.guidance_status,
    v_new.scope_note, v_new.editorial_review_date, v_new.inclusion_reason
  )
  returning id into v_id;

  insert into public.guideline_changelog (guideline_id, description)
  values (v_id, btrim(p_changelog_note));

  update public.staged_guidelines
     set review_status          = 'accepted',
         reviewed_at            = now(),
         reviewed_by            = auth.uid(),
         resulting_guideline_id = v_id
   where id = p_candidate_id;

  -- The decision log, in the same transaction: an approval is logged if and
  -- only if it published.
  insert into public.staged_discovery_decisions (staged_id, action, from_status, to_status, note, decided_by)
  values (p_candidate_id, 'approve', v_staged.review_status, 'accepted', btrim(p_changelog_note, E' \t\r\n'), auth.uid());

  insert into public.governance_publications(staged_id,guideline_id,authorised_by,note,payload_sha256,verification_evidence_id,clinical_review_id)
  select p_candidate_id,v_id,auth.uid(),p_changelog_note,public._governance_payload_hash(to_jsonb(g)),
    (p_final_guideline_data->>'verification_evidence_id')::uuid,(p_final_guideline_data->>'clinical_review_evidence_id')::uuid
  from public.guidelines g where g.id=v_id;
  delete from public.governance_publication_context where backend_pid=pg_backend_pid() and transaction_id=txid_current();
  return v_id;
end;
$$;



-- Changed material at a rejected unpublished URL has a review-only inbox, never a fabricated catalogue target.
create table public.governance_reconsideration_signals (
 id uuid primary key default gen_random_uuid(), rejection_id uuid not null references public.governance_rejections(id),
 run_id text not null, producer text not null, source_url text not null, identity_key text not null,
 details jsonb not null check(jsonb_typeof(details)='object'), recorded_at timestamptz not null default clock_timestamp(),
 review_only boolean not null default true check(review_only), unique(rejection_id,run_id,producer,identity_key)
);
alter table public.governance_reconsideration_signals enable row level security;
revoke all on public.governance_reconsideration_signals from public,anon,authenticated,service_role;
grant select on public.governance_reconsideration_signals to authenticated;
create policy named_editor_read on public.governance_reconsideration_signals for select to authenticated using(public.is_editor());
create trigger immutable_governance before update or delete or truncate on public.governance_reconsideration_signals for each statement execute function public.forbid_mutation();
create function public.record_rejected_revision_signal(p_run_id text,p_producer text,p_url text,p_details jsonb) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare r uuid;v uuid;k text;old_details jsonb;begin
 perform public._governance_acquire_pipeline_lock();k:=public._governance_key(p_url);
 if p_run_id is null or p_run_id !~ '\S' or p_producer is null or p_producer not in('discover','sync-providers','detect-changes') or jsonb_typeof(p_details) is distinct from 'object' then raise exception 'Explicit revision observation and producer required' using errcode='23514';end if;
 select id into r from public.governance_rejections where identity_key=k and not exists(select 1 from public.governance_rejection_releases x where x.rejection_id=governance_rejections.id) order by recorded_at limit 1;
 if r is null then raise exception 'An unreleased rejected identity is required' using errcode='GV006';end if;
 insert into public.governance_reconsideration_signals(rejection_id,run_id,producer,source_url,identity_key,details) values(r,p_run_id,p_producer,p_url,k,p_details) on conflict do nothing returning id into v;
 if v is null then
  select id,details into v,old_details from public.governance_reconsideration_signals where rejection_id=r and run_id=p_run_id and producer=p_producer and identity_key=k;
  if old_details is distinct from p_details then raise exception 'Revision observation replay changed its evidence' using errcode='GV006';end if;
 end if;return v;
end$$;

create function public.list_publication_receipts(p_staged_id uuid,p_data jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare k text;h text;age interval;receipts jsonb;begin
 if public.is_editor() is not true then raise exception 'Named database editor required' using errcode='42501';end if;
 if not exists(select 1 from public.staged_guidelines where id=p_staged_id and review_status='pending' and change_reason='NEW_GUIDELINE') then raise exception 'Pending new candidate required' using errcode='55000';end if;
 k:=public._governance_key(p_data->'versions'->0->>'url');h:=public._governance_payload_hash(p_data);
 select maximum_age into age from public.governance_verification_policy where singleton;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'kind',e.kind,'outcome',e.outcome,'observedAt',e.observed_at,'actor',e.actor,'note',e.note,
 'eligible',case when e.kind='clinical-review' then e.staged_id=p_staged_id and e.payload_sha256=h
 when e.kind='automated-link-check' then age is not null and e.observed_at<=clock_timestamp() and e.observed_at>=clock_timestamp()-age and e.outcome=p_data->>'link_verification_status'
 else e.outcome=p_data->>'link_verification_status' end) order by e.observed_at desc),'[]'::jsonb)
 into receipts from public.governance_evidence e where e.identity_key=k and (e.kind<>'clinical-review' or e.staged_id=p_staged_id);
 -- P3-5: a UI hint only (approval enforces), but it now considers every URL approval would check:
 -- proposed versions, staged versions, observed versions and alternatives. Unkeyable URLs are skipped
 -- here because approval refuses them anyway.
 return jsonb_build_object('receipts',receipts,'availabilityPolicyConfigured',age is not null,'payloadFingerprint',h,'comparisonRequired',public._governance_comparison_required(k)
  or exists(select 1 from public.staged_guidelines where id=p_staged_id and public._governance_comparison_required(identity_key))
  or exists(select 1 from (
    select v->>'url' u from jsonb_array_elements(case when jsonb_typeof(p_data->'versions')='array' then p_data->'versions' else '[]'::jsonb end) v
    union all select v->>'url' from public.staged_guidelines s,jsonb_array_elements(coalesce(s.versions,'[]'::jsonb)) v where s.id=p_staged_id
    union all select ev.discovered_url from public.staged_discovery_evidence ev where ev.staged_id=p_staged_id
    union all select v->>'url' from public.staged_discovery_evidence ev,jsonb_array_elements(coalesce(ev.observed_versions,'[]'::jsonb)) v where ev.staged_id=p_staged_id
    union all select v->>'url' from public.staged_discovery_evidence ev,jsonb_array_elements(coalesce(ev.url_alternatives,'[]'::jsonb)) v where ev.staged_id=p_staged_id
   ) links where links.u ~* '^https?://[^/?#@[:space:]]+([/?#]|$)' and links.u !~ '[[:space:]]'
     and public._governance_comparison_required(public.document_identity_key(links.u))));
end$$;


create function public.list_governance_review_events() returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if public.is_editor() is not true then raise exception 'Named database editor required' using errcode='42501';end if;
 return jsonb_build_object('lateEvidence',coalesce((select jsonb_agg(to_jsonb(e) order by recorded_at desc) from public.governance_late_evidence e),'[]'::jsonb),'revisionSignals',coalesce((select jsonb_agg(to_jsonb(s) order by recorded_at desc) from public.governance_reconsideration_signals s),'[]'::jsonb));
end$$;

-- P3-5: forbid_mutation (20261024) is a SECURITY INVOKER trigger function that only raises; its
-- callers are the append-only/immutable triggers. Pinning search_path removes caller-controlled
-- name resolution without changing behaviour or privileges.
alter function public.forbid_mutation() set search_path=pg_catalog,pg_temp;
-- Every helper and evidence ledger starts closed to API callers.
revoke create on schema public from public,anon,authenticated,service_role;
do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like '_governance_%' or p.proname in('record_automated_link_evidence','record_clinical_review','record_human_source_review','release_rejected_document','approve_staged_guideline','list_publication_receipts','record_rejected_revision_signal','list_governance_review_events')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end$$;
grant execute on function public.record_automated_link_evidence(text,integer,text,text) to ortho_link_verifier;
revoke all on function public.record_rejected_revision_signal(text,text,text,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.record_rejected_revision_signal(text,text,text,jsonb) to service_role;
grant execute on function public.list_governance_review_events(),public.list_publication_receipts(uuid,jsonb),public.record_clinical_review(uuid,jsonb,text),public.record_human_source_review(text,text,text),public.release_rejected_document(text,text),public.approve_staged_guideline(uuid,jsonb,text) to authenticated;
comment on function public.approve_staged_guideline(uuid,jsonb,text) is 'Named DB-editor publication only: explicit clinical status, immutable evidence, final/staged/observed URL comparison, rejection memory, serialised atomic publication and audit. Not callable by service_role. Direct catalogue writes blocked.';
commit;
