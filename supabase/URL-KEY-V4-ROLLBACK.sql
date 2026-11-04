-- ============================================================================
-- URL-KEY-V4-ROLLBACK.sql — return the document keys from url-key v4 to v3.
--
-- NOT a migration (kept out of supabase/migrations/ so no tool picks it up).
-- Run only through scripts/deploy/Apply-UrlKeyV4-Psql.ps1 -Rollback, and only
-- on its own explicit approval, after the v4 gate (stage 1) has passed.
--
-- What it does, in ONE transaction:
--   1. requires the v4 state (decoder present, v4 comments);
--   2. redefines public.document_match_key and public.document_identity_key
--      with their 20261024 bodies and comments, copied byte for byte from
--      supabase/migrations/20261024_discovery_review_queue.sql;
--   3. drops public._url_decode_unreserved;
--   4. REFUSES, rolling everything back, if any stored queue key or hold key
--      no longer equals its (now v3) function, i.e. if any row was filed under
--      v4 with an unreserved escape in its URL. Those rows need their own
--      reviewed plan; this file never rewrites a record.
-- It touches no table data, no catalogue entry and no source link.
-- Rehearsed locally: scripts/tests/local-supabase/urlkey-v4-rehearsal.ts.
-- ============================================================================

begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regprocedure('public._url_decode_unreserved(text)') is null
     or obj_description('public.document_identity_key(text)'::regprocedure, 'pg_proc') not like '[url-key v4 %'
     or obj_description('public.document_match_key(text)'::regprocedure, 'pg_proc') not like '[url-key v4 %' then
    raise exception using errcode = '55000',
      message = 'URL-KEY-V4-ROLLBACK: the database is not in the url-key v4 state. Nothing was changed.';
  end if;
end;
$$;

-- ── The 20261024 (url-key v3) definitions, verbatim ─────────────────────────
create or replace function public.document_match_key(p_url text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(
           translate(public._url_strip_ver(p_url), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
           '/+$', '');
$$;

comment on function public.document_match_key(text) is
  '[url-key v3 match] LOOSE heuristic; exact mirror of normaliseCandidateUrl() (scripts/lib/ingestion.ts): trim, drop `ver` parameters, lowercase ALL ASCII letters, strip trailing slashes. Distinct case-sensitive documents can share it. Pinned by scripts/tests/fixtures/url-key-vectors.json (`match`).';

create or replace function public.document_identity_key(p_url text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  c_up  constant text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  c_low constant text := 'abcdefghijklmnopqrstuvwxyz';
  v     text := public._url_strip_ver(p_url);
  m     text[];
  v_auth text;
  v_at   integer;
  v_cut  integer;
  c      text;
begin
  m := regexp_match(v, '^([A-Za-z][A-Za-z0-9+.-]*:)(//[^/?#]*)?');
  if m is not null then
    v_auth := coalesce(m[2], '');
    v := substr(v, length(m[1]) + length(v_auth) + 1);
    -- lowercase the host only: userinfo (before the LAST '@') keeps its case
    v_at := case when strpos(v_auth, '@') > 0
                 then length(v_auth) - strpos(reverse(v_auth), '@') + 1 else 0 end;
    v_auth := substr(v_auth, 1, v_at) || translate(substr(v_auth, v_at + 1), c_up, c_low);
    v := translate(m[1], c_up, c_low) || v_auth || v;
  end if;
  -- %XX hex digits to upper case. Escapes never overlap (their 2nd and 3rd
  -- characters are hex, never '%'), so two passes — first digit, then second
  -- — give exactly the left-to-right result of TS /%[0-9A-Fa-f]{2}/g.
  foreach c in array array['a', 'b', 'c', 'd', 'e', 'f'] loop
    v := regexp_replace(v, '%' || c || '([0-9A-Fa-f])', '%' || upper(c) || '\1', 'g');
  end loop;
  foreach c in array array['a', 'b', 'c', 'd', 'e', 'f'] loop
    v := regexp_replace(v, '%([0-9A-F])' || c, '%\1' || upper(c), 'g');
  end loop;
  -- trailing slashes of the PATH only (before the first '?' or '#')
  v_cut := least(nullif(strpos(v, '?'), 0), nullif(strpos(v, '#'), 0));
  if v_cut is null then
    return regexp_replace(v, '/+$', '');
  end if;
  return regexp_replace(substr(v, 1, v_cut - 1), '/+$', '') || substr(v, v_cut);
end;
$$;

comment on function public.document_identity_key(text) is
  '[url-key v3 identity] CONSERVATIVE queue identity; exact mirror of documentIdentityKey() (scripts/lib/ingestion.ts): trim, drop `ver` parameters (deliberate merge), lowercase scheme and host only, uppercase %XX hex, strip trailing slashes from the path only (deliberate merge). Path, query and fragment case is preserved. Pinned by scripts/tests/fixtures/url-key-vectors.json (`identity`). Never used to rewrite a stored URL.';

drop function public._url_decode_unreserved(text);

-- ── Refuse, atomically, if any stored key would move ────────────────────────
do $$
declare
  v_rows  text;
  v_holds text;
begin
  select string_agg(format('%s (%s): identity %s -> %s; match %s -> %s', candidate_id, review_status,
                           identity_key, public.document_identity_key(primary_url),
                           match_key, public.document_match_key(primary_url)), E'\n' order by candidate_id)
    into v_rows
    from public.staged_guidelines
   where primary_url is not null
     and (identity_key is distinct from public.document_identity_key(primary_url)
          or match_key is distinct from public.document_match_key(primary_url));
  if v_rows is not null then
    raise exception using errcode = '55000',
      message = 'URL-KEY-V4-ROLLBACK: queue rows filed under v4 would change key under v3. Rolled back; nothing was changed.',
      detail  = v_rows,
      hint    = 'Their candidate_id and one-open-row slot depend on these keys. Plan them explicitly; do not force this rollback.';
  end if;
  select string_agg(format('%s -> %s', match_key, public.document_match_key(match_key)), E'\n')
    into v_holds
    from public.discovery_staging_holds
   where match_key <> public.document_match_key(match_key);
  if v_holds is not null then
    raise exception using errcode = '55000',
      message = 'URL-KEY-V4-ROLLBACK: staging holds would change key under v3. Rolled back; nothing was changed.',
      detail  = v_holds;
  end if;
end;
$$;

commit;
