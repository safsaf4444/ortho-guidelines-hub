-- ============================================================================
-- 20261104_url_key_unreserved_decoding.sql                       [url-key v4]
--
-- Both document keys now decode percent-escapes of RFC 3986 UNRESERVED
-- characters (ALPHA DIGIT - . _ ~) before anything else, as RFC 3986 §2.3 /
-- §6.2.2.2 say a normaliser should: `%2D` ≡ `-`, `%41` ≡ `A`, `%7e` ≡ `~`.
--
-- Why: BOA links its assets as /asset/a811fc01%2defc3%2d… while the catalogue
-- stores /asset/A811FC01-EFC3-…. Under url-key v3 the two never shared a key,
-- so catalogued BOA documents were filed as NEW_GUIDELINE (13 of 25 BOA
-- candidates in the 2026-11-04 sync-providers dry run).
--
-- Exact mirror of scripts/lib/ingestion.ts (decodeUnreservedEscapes,
-- normaliseCandidateUrl, documentIdentityKey); both are pinned by
-- scripts/tests/fixtures/url-key-vectors.json, asserted against SQL by
-- scripts/tests/integration/discovery-queue.local.test.ts.
--
-- What changes:
--   * new  public._url_decode_unreserved(text)  (internal; no API role may run it)
--   * document_match_key / document_identity_key: the ONLY change to each body
--     is `_url_strip_ver(p_url)` → `_url_strip_ver(_url_decode_unreserved(p_url))`.
--     Trim and this decoding commute (decoding never creates or removes
--     whitespace), so each new key equals the v3 key of the decoded URL.
--   * Nothing else. Escapes of reserved characters (%2F %3F %23 %26 %3D %20
--     %25 …), non-ASCII bytes and malformed `%` sequences are untouched, so
--     path / query / fragment structure cannot move. Signatures, grants,
--     search_path and volatility are unchanged.
--
-- What it can move, and why it REFUSES rather than rewrites:
--   * staged_guidelines.identity_key / match_key are STORED (trigger) and
--     pinned by CHECK staged_guidelines_document_keys_derived; the one-open-row
--     unique index is on identity_key. sync-providers' candidate_id is derived
--     from the match key, and rejections are remembered per candidate_id.
--   * discovery_staging_holds.match_key is a stored key (primary key).
--   Recomputing stored keys could merge two open rows, silently re-key a
--   hold, or detach a remembered rejection from its candidate_id. So step 1
--   computes every stored key under v4 BEFORE anything is redefined and
--   refuses (55000) if ANY would change, listing the rows. Nothing is
--   rewritten here; a non-empty list needs its own reviewed plan.
--   * Catalogue URLs are not stored keys (keys are computed at query time),
--     but v4 could make two DIFFERENT catalogue entries share a key, which
--     would make catalogue matching ambiguous. Step 1 refuses that too.
--
-- Production state when written (read-only check, 2026-11-04): queue 0 rows,
-- 1 hold (UK-FALCON: its key contains only %20, which is reserved, so it does
-- not move). Re-check before applying; the refusals do it anyway.
--
-- Requires 20261024_discovery_review_queue.sql. Independent of 20261025.
-- Run as the exact file, e.g. via scripts/deploy (psql, ON_ERROR_STOP=1);
-- never transcribed. Not applied anywhere yet.
-- ============================================================================

begin;

-- Transaction-local limits, as in 20261024/20261025: nothing outlives this
-- transaction on a pooled connection.
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
begin
  if to_regprocedure('public.document_match_key(text)') is null
     or to_regprocedure('public.document_identity_key(text)') is null
     or to_regprocedure('public._url_strip_ver(text)') is null
     or to_regclass('public.discovery_staging_holds') is null then
    raise exception using
      errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: 20261024_discovery_review_queue.sql is not applied.';
  end if;
end;
$$;

-- ── 0. The decoder ──────────────────────────────────────────────────────────
-- One left-to-right pass, exactly as decodeUnreservedEscapes():
--   * `%` + two hex digits whose byte is unreserved → that character;
--     EXCEPT a hex-digit character when the output so far ends in `%` or `%`
--     + one hex digit (decoding it would assemble a NEW escape out of a stray
--     `%`, e.g. %%341 → %41; keeping it keeps every key a fixpoint);
--   * any other valid escape → kept verbatim (hex case unchanged here);
--   * a `%` not followed by two hex digits → kept, scanning resumes after it.
-- chr() is only reached for unreserved bytes, so %00 never reaches it.
create or replace function public._url_decode_unreserved(p_url text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  v_out  text := '';
  v_rest text := p_url;
  v_pos  integer;
  v_hex  text;
  v_code integer;
begin
  loop
    v_pos := strpos(v_rest, '%');
    exit when v_pos = 0;
    v_out := v_out || substr(v_rest, 1, v_pos - 1);
    v_hex := substr(v_rest, v_pos + 1, 2);
    if v_hex ~ '^[0-9A-Fa-f][0-9A-Fa-f]$' then
      v_code := ('x' || v_hex)::bit(8)::integer;
      if (v_code between 48 and 57 or v_code between 65 and 90 or v_code between 97 and 122
          or v_code in (45, 46, 95, 126))
         and not ((v_code between 48 and 57 or v_code between 65 and 70 or v_code between 97 and 102)
                  and v_out ~ '%[0-9A-Fa-f]?$') then
        v_out := v_out || chr(v_code);
      else
        v_out := v_out || '%' || v_hex;
      end if;
      v_rest := substr(v_rest, v_pos + 3);
    else
      v_out := v_out || '%';
      v_rest := substr(v_rest, v_pos + 1);
    end if;
  end loop;
  return v_out || v_rest;
end;
$$;

comment on function public._url_decode_unreserved(text) is
  '[url-key v4] Decodes percent-escapes of RFC 3986 unreserved characters only (ALPHA DIGIT - . _ ~), one left-to-right pass, keeping a hex-digit escape that follows a stray % or %X. Exact mirror of decodeUnreservedEscapes() (scripts/lib/ingestion.ts). Internal to the document keys; never used to rewrite a stored URL.';

revoke all on function public._url_decode_unreserved(text) from public, anon, authenticated;

-- ── 1. Refuse if any STORED key, or catalogue matching, would change ────────
-- Computed with the v3 functions on the decoded input = the v4 keys, before
-- anything is redefined.
do $$
declare
  v_rows  text;
  v_holds text;
  v_cat   text;
begin
  select string_agg(format('%s (%s): identity %s -> %s; match %s -> %s',
                           candidate_id, review_status,
                           identity_key, public.document_identity_key(public._url_decode_unreserved(primary_url)),
                           match_key,    public.document_match_key(public._url_decode_unreserved(primary_url))),
                    E'\n' order by candidate_id)
    into v_rows
    from public.staged_guidelines
   where primary_url is not null
     and (identity_key is distinct from public.document_identity_key(public._url_decode_unreserved(primary_url))
          or match_key is distinct from public.document_match_key(public._url_decode_unreserved(primary_url)));
  if v_rows is not null then
    raise exception using
      errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: queue rows whose stored document keys would change. Nothing was changed.',
      detail  = v_rows,
      hint    = 'Their candidate_id (and any rejection remembered on it) and the one-open-row slot depend on these keys. Plan the re-keying of these rows explicitly before applying.';
  end if;

  select string_agg(format('%s -> %s', match_key, public.document_match_key(public._url_decode_unreserved(match_key))), E'\n')
    into v_holds
    from public.discovery_staging_holds
   where match_key <> public.document_match_key(public._url_decode_unreserved(match_key));
  if v_holds is not null then
    raise exception using
      errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: staging holds whose stored key would change. Nothing was changed.',
      detail  = v_holds,
      hint    = 'A held document would stop being held. Re-key the hold as an editorial decision first.';
  end if;

  -- Two DIFFERENT catalogue entries that v4 newly merges under either key.
  with u as (
    select g.id, v->>'url' as url
      from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
     where v ? 'url'
  ), k as (
    select id,
           public.document_identity_key(url) as id3, public.document_identity_key(public._url_decode_unreserved(url)) as id4,
           public.document_match_key(url)    as m3,  public.document_match_key(public._url_decode_unreserved(url))    as m4
      from u
  )
  select string_agg(distinct format('%s / %s', least(a.id, b.id), greatest(a.id, b.id)), E'\n')
    into v_cat
    from k a join k b on a.id < b.id
   where (a.id4 = b.id4 and a.id3 <> b.id3)
      or (a.m4 = b.m4 and a.m3 <> b.m3);
  if v_cat is not null then
    raise exception using
      errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: different catalogue entries would newly share a document key. Nothing was changed.',
      detail  = v_cat,
      hint    = 'Catalogue matching would become ambiguous for these entries. Resolve the catalogue links first.';
  end if;
end;
$$;

-- ── 2. The keys: v3 bodies, with the decoding inserted first ────────────────
create or replace function public.document_match_key(p_url text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
  select regexp_replace(
           translate(public._url_strip_ver(public._url_decode_unreserved(p_url)), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'),
           '/+$', '');
$$;

comment on function public.document_match_key(text) is
  '[url-key v4 match] LOOSE heuristic; exact mirror of normaliseCandidateUrl() (scripts/lib/ingestion.ts): trim, decode escapes of RFC 3986 unreserved characters (v4), drop `ver` parameters, lowercase ALL ASCII letters, strip trailing slashes. Distinct case-sensitive documents can share it. Pinned by scripts/tests/fixtures/url-key-vectors.json (`match`).';


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
  v     text := public._url_strip_ver(public._url_decode_unreserved(p_url));
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
  '[url-key v4 identity] CONSERVATIVE queue identity; exact mirror of documentIdentityKey() (scripts/lib/ingestion.ts): trim, decode escapes of RFC 3986 unreserved characters (v4), drop `ver` parameters (deliberate merge), lowercase scheme and host only, uppercase the remaining %XX hex, strip trailing slashes from the path only (deliberate merge). Path, query and fragment case is preserved. Pinned by scripts/tests/fixtures/url-key-vectors.json (`identity`). Never used to rewrite a stored URL.';

-- ── 3. Post-check, inside the same transaction ──────────────────────────────
-- Step 1 guaranteed no stored key moves; prove the CHECK still holds for
-- every row under the redefined functions before committing.
do $$
begin
  if exists (select 1 from public.staged_guidelines
              where primary_url is not null
                and (identity_key is distinct from public.document_identity_key(primary_url)
                     or match_key is distinct from public.document_match_key(primary_url))) then
    raise exception using errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: a stored key no longer matches its function after redefinition. Rolled back.';
  end if;
  if exists (select 1 from public.discovery_staging_holds
              where match_key <> public.document_match_key(match_key)) then
    raise exception using errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: a hold key is no longer its own match key. Rolled back.';
  end if;
  if public.document_identity_key('https://www.boa.ac.uk/asset/a811fc01%2defc3') <> 'https://www.boa.ac.uk/asset/a811fc01-efc3'
     or public.document_match_key('https://example.org/a%2Fb') <> 'https://example.org/a%2fb' then
    raise exception using errcode = '55000',
      message = '20261104_url_key_unreserved_decoding: v4 self-test failed. Rolled back.';
  end if;
end;
$$;

commit;

-- No PostgREST reload is needed: no signature changed.

-- ============================================================================
-- Verify after applying (read-only):
--   select obj_description('public.document_identity_key(text)'::regprocedure) like '[url-key v4 identity]%',
--          obj_description('public.document_match_key(text)'::regprocedure)    like '[url-key v4 match]%',
--          public.document_match_key('https://www.boa.ac.uk/asset/a811fc01%2defc3')
--            = public.document_match_key('https://www.boa.ac.uk/asset/A811FC01-EFC3/'),          -- t, t, t
--          has_function_privilege('anon', 'public._url_decode_unreserved(text)', 'EXECUTE'); -- f
--   NOTE: supabase/POST-MIGRATION-GATE-READONLY.sql pins the 20261024/20261025
--   state; its G19 expects the v3 comments and FAILS after this migration, by
--   design. Do not reuse that gate unchanged after applying this.
--
-- ROLLBACK (only while no row was filed under v4 keys): re-run the two
-- `create or replace function` blocks and comments for document_match_key and
-- document_identity_key from 20261024_discovery_review_queue.sql, then
-- `drop function public._url_decode_unreserved(text);`. After v4 rows exist,
-- rolling back moves THEIR keys instead: run step 1's check in reverse first.
-- ============================================================================
