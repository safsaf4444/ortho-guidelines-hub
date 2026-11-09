-- PROPOSED migration: tested only in a network-none disposable PostgreSQL.
-- Not in migrations/: never run against production without the reviewed plan.
-- Requires the repository rebuild chain through URL-key v4 and reject-open.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
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
  when p_http_status in(401,403) then 'blocked'
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
 perform pg_advisory_xact_lock(20261107,25);
 if TG_OP='UPDATE' and old.review_status in('accepted','rejected','resolved')
   and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
  raise exception 'Closed decisions are immutable; use an explicit rejection release' using errcode='GV006';
 end if;
 if new.review_status in('pending','deferred') then
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
 end if;return new;
end$$;
create trigger governance_queue_guard before insert or update on public.staged_guidelines for each row execute function public._governance_queue_guard();
create trigger governance_remember_rejection after insert or update on public.staged_guidelines for each row execute function public._governance_remember_rejection();
create function public.release_rejected_document(p_url text,p_note text) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer;begin
 if public.is_editor() is not true then raise exception 'Named editor required' using errcode='42501';end if;
 if p_note is null or p_note !~ '\S' then raise exception 'Release reason required' using errcode='23514';end if;
 perform pg_advisory_xact_lock(20261107,25);
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
 perform pg_advisory_xact_lock(20261107,25);
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

-- Every helper and evidence ledger starts closed to API callers.
revoke create on schema public from public,anon,authenticated,service_role;
do $$declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and (p.proname like '_governance_%' or p.proname in('record_automated_link_evidence','record_clinical_review','record_human_source_review','release_rejected_document','approve_staged_guideline')) loop
  execute format('revoke all on function %s from public,anon,authenticated,service_role',r.signature);
 end loop;
end$$;
grant execute on function public.record_automated_link_evidence(text,integer,text,text) to ortho_link_verifier;
grant execute on function public.record_clinical_review(uuid,jsonb,text),public.record_human_source_review(text,text,text),public.release_rejected_document(text,text),public.approve_staged_guideline(uuid,jsonb,text) to authenticated;
comment on function public.approve_staged_guideline(uuid,jsonb,text) is 'Named DB-editor publication only: explicit clinical status, immutable evidence, final/staged/observed URL comparison, rejection memory, serialised atomic publication and audit. Not callable by service_role. Direct catalogue writes blocked.';
commit;
