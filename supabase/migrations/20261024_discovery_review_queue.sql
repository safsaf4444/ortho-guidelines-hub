-- ============================================================================
-- 20261024_discovery_review_queue.sql
-- Discovery findings in the review queue: categories, structured append-only
-- evidence, decision-only edition review, staging holds, approval guards, and
-- one staging path per producer.
--
-- STATUS: verified on a disposable local Supabase only. NOT applied to
-- production. Do not apply until the owner approves the production step.
--
-- ┌─ CONFLICT WITH PR #174 (feat/stage-detected-changes, PAUSED) ───────────┐
-- │ This migration and #174's 20261013_stage_detected_changes.sql cannot    │
-- │ BOTH be applied as written, in either order. #174 was not modified.    │
-- │ #174 is NOT a prerequisite: this migration applies on its own. The     │
-- │ conflict blocks whichever of the two is applied SECOND, which must be   │
-- │ rebased onto the first. Section 0 below refuses to run on a database   │
-- │ that already holds #174's objects; #174 has no equivalent check, so     │
-- │ applying it after this one would silently break things (listed under    │
-- │ "Compatibility with PR #174").                                          │
-- └─────────────────────────────────────────────────────────────────────────┘
-- ============================================================================
--
-- ── What this does ──────────────────────────────────────────────────────────
--
--  1. Two new queue categories: POSSIBLE_NEW_EDITION, EDITION_TOKEN_CHANGED.
--  2. One review status, 'resolved': an editor decision recorded, NOTHING
--     published. Distinct from 'accepted', which always means "published".
--  3. Two document keys derived IN THE DATABASE and enforced by constraint:
--     a CONSERVATIVE identity_key (what "the same document" means for the
--     queue) and a LOOSE match_key (a heuristic, never identity).
--  4. One open queue row per document, across ALL producers, by unique index —
--     transactional and safe under concurrency.
--  5. Append-only evidence and decision tables (see "Append-only: threat
--     model" for exactly what that does and does not resist).
--  6. Staging holds: a document hold list consulted at staging time by BOTH
--     staging functions AND enforced at approval (RQ002), so a held document
--     already in the queue (including a row filed before this migration) cannot
--     be published either. UK-FALCON is held pending an editorial decision.
--     Discovery REPORTS are unaffected; only staging and publication are held.
--  7. stage_discovery_candidate(): the discovery entry point (service role
--     only). Accepts exactly the three discovery classes, so publisher
--     retirement cannot be staged, and checks the producer's evidence against
--     the database catalogue (see "Discovery evidence validation").
--  8. stage_sync_candidates(): the sync-providers entry point (service role
--     only), used by scripts/stage-candidates.ts. PARTIAL SUCCESS per
--     candidate (see "Partial staging and retries"); a duplicate or a bad row
--     never discards unrelated rows.
--  9. resolve_discovery_candidate(): editors record decisions on edition rows.
--     Writes only queue state and the decision log. Never touches guidelines
--     or guideline_changelog.
-- 10. approve_staged_guideline(): main's null-safe definition, plus refusal of
--     (a) any non-NEW_GUIDELINE row (the 42809 guard ported from PR #174),
--     (b) any row — whatever its classification — that is linked to, or whose
--     URL is already held by, an existing catalogue entry, and
--     (c) any row whose document, or any link it would publish, is on the
--     staging hold list (RQ002). Every approval is also appended to the
--     decision log, in the same transaction as the publication.
--
-- Deferred, deliberately: 'superseded', publishing a new edition, re-filing a
-- "different-document" finding as a NEW_GUIDELINE candidate (until it exists,
-- such rows stay OPEN — see below), provider ownership enforcement, and the
-- BOFAS producer switch.
--
-- ── Review actions: what is open and what is resolved ───────────────────────
--
--  class                 action                review_status  open?  review_outcome
--  NEW_GUIDELINE         approve (existing)    accepted       no     —   (publishes)
--  NEW_GUIDELINE         reject  (existing)    rejected       no     —
--  POSSIBLE_NEW_EDITION  same-document         resolved       no     same-document
--  POSSIBLE_NEW_EDITION  no-action             resolved       no     no-action
--  POSSIBLE_NEW_EDITION  different-document    pending        YES    different-document-awaiting-refiling
--  POSSIBLE_NEW_EDITION  new-edition           pending        YES    new-edition-awaiting-revision
--  EDITION_TOKEN_CHANGED acknowledged          resolved       no     acknowledged
--  EDITION_TOKEN_CHANGED needs-document-check  pending        YES    needs-document-check
--  POSSIBLE_SAME_DOCUMENT same-document        resolved       no     same-document
--  POSSIBLE_SAME_DOCUMENT different-document   pending        YES    different-document-awaiting-refiling
--  any of these three    defer                 deferred       YES    (unchanged)
--  any of these three    reject (existing)     rejected       no     —
--
--  POSSIBLE_SAME_DOCUMENT (sync-providers): the discovered link matches a
--  catalogue link under the LOOSE key only. The row names the entry
--  (matched_guideline_id), the link (changed_url) and the reason (notes, and
--  evidence.soft_match). It is never approvable as a new entry (guard (a)
--  below refuses every non-NEW_GUIDELINE row); "different-document" keeps it
--  open; nothing here edits the catalogue.
--
--  An OPEN action does not complete review: the row keeps its slot and its
--  completion fields (reviewed_by, reviewed_at) stay NULL. The decision itself
--  IS attributed: every action, open or closing, appends a decision-log row
--  with decided_by (the editor's auth.uid(), NOT NULL) and decided_at. So
--  "who looked at this and when" is always answerable from the log, while
--  "is review complete" is answered only by the queue row.
--
--  "different-document" means the editor judged the finding to be a separate
--  document, not an edition of the matched entry. That is a follow-up, not a
--  closure: no re-filing path exists yet, so the row stays pending (outcome
--  different-document-awaiting-refiling) and visible in the queue until an
--  editor rejects it or a later re-filing path consumes it. It must never
--  vanish as 'resolved' with nothing tracking the separate document.
--
-- ── Classification is not permission ────────────────────────────────────────
--
--  change_reason records what the PRODUCER believed. Approval as a new entry
--  is decided independently, from data the database holds, at approval time:
--  the row must be NEW_GUIDELINE AND have no matched_guideline_id AND its URL
--  key must not be held by any catalogue entry's versions. A row mislabelled
--  NEW_GUIDELINE that matches an existing entry is refused (42809).
--
-- ── Discovery evidence validation ───────────────────────────────────────────
--
--  stage_discovery_candidate() does not take the producer's word for the
--  relationship it claims. Always (every call):
--    * NEW_GUIDELINE carries no softMatch and no tokenChange: it claims no
--      relationship to an existing entry.
--    * POSSIBLE_NEW_EDITION carries softMatch naming the same entry, and no
--      tokenChange.
--    * EDITION_TOKEN_CHANGED carries tokenChange naming the same entry, with a
--      parameter and two DIFFERENT values, and no softMatch.
--  When a NEW row would be filed (an existing row is never re-judged), against
--  the DATABASE catalogue:
--    * a named entry must exist;
--    * NEW_GUIDELINE is refused if the document is catalogued exactly, if it
--      matches a catalogue link loosely (a comparison is needed, and discovery
--      cannot file one), or if an observed alternative URL of it (redirect
--      target, canonical host) is catalogued;
--    * POSSIBLE_NEW_EDITION may have a URL unrelated to the entry's links (a
--      new edition usually does). It is refused only when the evidence
--      contradicts it: the discovered document IS a catalogued link (of that
--      entry or another), or it loosely matches a different entry and not the
--      named one;
--    * EDITION_TOKEN_CHANGED needs a URL relationship with the named entry:
--      its own URL, or an observed alternative of it, must match one of the
--      entry's links (exactly or loosely). No relationship → refused as
--      unsupported. A URL catalogued exactly under a different entry, and not
--      under the named one → refused as contradictory.
--  What is uncertain but not contradictory is STAGED, never silently upgraded:
--  every discovery sighting records evidence.catalogue_relation — exact |
--  loose | alternative | none — how its URL relates to the named entry's links,
--  so the reviewer sees, e.g., a token change matched only via a redirect or
--  only up to letter case. Co-publisher alternatives are not observations
--  (the producer copies them from the catalogue) and never count.
--  Every refusal is 22023 and writes nothing.
--
-- ── Document identity [url-key v3] ──────────────────────────────────────────
--
--  CHANGED in this revision (url-key v2 → v3). v2 used ONE key for both
--  matching and identity, and it lowercased the whole URL. Paths and query
--  values can be case-sensitive, so two distinct documents differing only in
--  case would have shared one queue slot: the second silently reported
--  "already open" (blocked as a duplicate) or, sharing a candidate id,
--  attached to the first (merged). v3 separates the two jobs:
--
--  IDENTITY key — identity_key, document_identity_key(), TS
--  documentIdentityKey(). CONSERVATIVE. Used for the one-open-row-per-document
--  slot and for EXACT catalogue matches at approval. Two URLs share it only
--  when they are equivalent under RFC 3986 §6.2.2.1 (scheme and host case;
--  %XX hex case) or under exactly two documented, deliberate merges:
--    #1 `ver` query parameters removed — BOFAS DNN and WordPress use `?ver=`
--       as a cache-buster. A changed token is the same document; the new
--       token is still recorded verbatim in evidence. A host that used `ver`
--       to select a genuinely different edition WOULD be merged — none in the
--       catalogue does (checked when ver-stripping was introduced);
--    #2 trailing '/'s removed from the PATH — '/a/' and '/a' are one
--       document. A '/' ending a query value or a fragment is kept.
--  Path, query and fragment otherwise keep their case and bytes. A fragment
--  is part of identity: it never reaches the server, but on hash-routed sites
--  it can select a different document, so keeping it can only SPLIT (a
--  visible duplicate row), never merge.
--
--  MATCH key — match_key, document_match_key(), TS normaliseCandidateUrl().
--  LOOSE heuristic, unchanged from v2 so candidate ids — and the editor
--  decisions keyed on them — do not move: trims, removes `ver`, lowercases
--  ALL ASCII letters, strips trailing '/'s from the whole string. Used for:
--    * candidate ids (scripts/lib/ingestion.ts makeCandidateId);
--    * PROPOSING a comparison in sync-providers.ts: since 2026-10-24 only an
--      IDENTITY match counts as "already in the catalogue"; a loose-only match
--      becomes a POSSIBLE_SAME_DOCUMENT candidate (it used to be silently
--      counted as catalogued). stage_sync_candidates() re-checks this against
--      the database catalogue before filing a new row;
--    * staging holds (over-holding is visible: the outcome is 'held');
--    * the approval near-match refusal (loud, names the entry);
--    * recognising rows filed BEFORE this migration (producer NULL), whose
--      primary_url holds only the lowercased match key — their original case
--      is unrecoverable. Such a match is COMPATIBLE but UNCERTAIN, and says
--      so: the staging outcome carries identityBasis 'legacy-match-key' and
--      the evidence row row_match_basis 'legacy-match-key' — never reported
--      as an exact match.
--  Because candidate ids come from the match key, two case-distinct documents
--  can collide on one candidate id. Staging never merges them and never drops
--  the second: it is filed under a derived id <id>~<12 hex of md5(identity
--  key)>, deterministically (it resolves to the same row next run), and the
--  outcome carries candidateIdCollision {requestedId, filedAs}; evidence keeps
--  the requested id in discovery_id.
--
--  Both keys are lexical — no URL parsing, decoding or re-encoding — and
--  locale-independent (ASCII-only case folding, explicit whitespace set), so
--  TS and SQL implement them identically. Both are pinned to the same
--  expected outputs by scripts/tests/fixtures/url-key-vectors.json, asserted
--  offline for TS and against a local database for SQL, plus TS-vs-SQL
--  agreement over every catalogue URL.
--
--  Original URLs are NEVER rewritten: primary_url, changed_url, versions[] and
--  evidence.discovered_url hold the href exactly as published (the sync path
--  now stores versions[0].url, not the lowercased key it used to store).
--
--  Defence in depth, kept although no divergence is known:
--    * a CHECK forces identity_key and match_key to equal their derivations;
--    * both staging functions refuse (22023) when the producer's TS keys and
--      the database's keys disagree — a loud refusal, never a guess.
--
-- ── Append-only: threat model ───────────────────────────────────────────────
--
--  staged_discovery_evidence and staged_discovery_decisions refuse UPDATE,
--  DELETE and TRUNCATE through BEFORE triggers, for every role issuing
--  ordinary DML — anon, authenticated, editors, and service_role (which
--  bypasses RLS, so RLS alone would not stop it). That protects the record
--  from application code, the pipeline's credential, and mistakes.
--
--  It does NOT protect against whoever controls the schema. The table owner
--  and any superuser can ALTER TABLE … DISABLE TRIGGER, DROP the trigger or
--  the table, or (superuser) SET session_replication_role = replica, which
--  skips ordinary triggers; then rewrite rows. In Supabase that is the
--  `postgres` role and anyone with dashboard/SQL-editor or migration access.
--  The integration test demonstrates this rather than claiming otherwise.
--  Tamper-evidence against an administrator needs something outside the
--  database (exported, signed or hash-chained copies) and is not provided.
--
-- ── Compatibility with PR #174 (paused, unmerged; NOT modified) ─────────────
--
--  Shared names are not compatibility. Object by object:
--
--  * staged_guidelines.changed_url — same name, same type (text), added with
--    IF NOT EXISTS by both. COMPATIBLE in either order.
--
--  * staged_guidelines_revision_needs_target — ported with the IDENTICAL
--    definition. COMPATIBLE. Dependency: validation fails if any existing
--    non-NEW_GUIDELINE row lacks matched_guideline_id/changed_url.
--
--  * staged_guidelines_review_status_check — CONFLICT. This adds 'resolved';
--    #174 replaces the same constraint with a list containing 'superseded' but
--    not 'resolved'. #174 applied after this one either FAILS (if any row is
--    'resolved') or silently removes 'resolved'; this applied after #174
--    silently removes 'superseded'. The second must list the union.
--
--  * approve_staged_guideline() — CONFLICT (silent). Both replace the whole
--    function. #174's version has the 42809 non-NEW guard but NOT guard (b).
--    #174 applied after this silently removes "classification is not
--    permission". Verify the live body with the marker query at the end.
--
--  * staged_guidelines_one_open_per_document (this) vs #174's detector —
--    CONFLICT. #174's stage_detected_change() inserts CONTENT_DRIFT rows with
--    primary_url = the catalogue URL, guarded only by ON CONFLICT
--    (candidate_id). This index gives every such row a document key, so:
--      - a detector row for a document that already has an open discovery or
--        sync row raises 23505 and fails that detector call;
--      - #174 deliberately allows one open revision per (guideline, url), so a
--        URL cross-listed in two entries' versions yields two open rows for
--        one document — which this index forbids;
--      - #174's "reclaim" path flips a superseded row back to pending, which
--        can collide the same way.
--    #174 must decide whether detector rows share the document slot (and then
--    handle 'already_open' like the two staging functions here) or are keyed
--    per (guideline, url) and excluded from this index.
--
--  * staged_guidelines_one_pending_revision (#174 only, NOT ported) — an
--    INTERACTION: it would also cover discovery edition rows, keyed on
--    (matched_guideline_id, changed_url).
--
--  * scripts/lib/ingestion.ts — #174 adds makeRevisionCandidateId(), which
--    hashes normaliseCandidateUrl(). The match key changes no key across the 612
--    catalogue and discovery-cache URLs checked on 2026-10-24, but a rebase
--    must take this branch's ingestion.ts (match key + documentIdentityKey),
--    not #174's copy of the v1 normaliser. #174's detector rows would be
--    keyed by identity_key like every other row.
--
--  * staged_detections, stage_detected_change(), advance_content_hashes(),
--    guidelines.content_hash_seen_at, 'superseded' — NOT ported; they belong
--    to the content-hash detector.
--
-- ── Partial staging and retries ─────────────────────────────────────────────
--
--  stage_sync_candidates() is NOT all-or-nothing per run (the old
--  stage-candidates.ts single INSERT was). One call is one transaction; each
--  candidate is a subtransaction:
--    * a candidate that fails — validation, its queue row, OR its evidence row
--      — is rolled back entirely and reported 'failed' with its SQLSTATE;
--    * all other candidates' rows and evidence commit when the call returns;
--    * if the call itself fails, nothing is written.
--  Run identity: stage-candidates.ts derives the run id from the report file
--  (generatedAt + content hash). Re-staging the SAME report is a retry of the
--  same run, not a new discovery run: failed candidates are attempted again,
--  committed ones return 'existing' with evidence 'already_recorded', and no
--  row or evidence is duplicated. Evidence is unique per (queue row, run,
--  candidate). A NEW sync-providers report is a new run and appends one
--  sighting per candidate.
--
-- ── Deployment order (this migration + scripts/stage-candidates.ts) ─────────
--
--  They require each other:
--    * new script, database WITHOUT this migration → the RPC call fails
--      (PGRST202 / function not found), exit 1, NOTHING written;
--    * OLD script, database WITH this migration → its single INSERT … ON
--      CONFLICT (candidate_id) DO NOTHING fails the WHOLE batch with 23505 as
--      soon as one candidate's document is already open under another id;
--      otherwise it still writes, but stores the lowercased key as primary_url
--      and leaves producer NULL (such rows are treated as pre-migration rows).
--  Safe order:
--    0. Confirm #174's migration is NOT applied (section 0 refuses if it is).
--       #174 stays paused; if it resumes, it must be rebased onto this.
--    1. Confirm the Guideline & Provider Sync workflow's schedule is still
--       disabled (it is manual-dispatch only today) and that nobody will
--       dispatch it, or run stage-candidates.ts locally, until step 4.
--    2. Apply this migration (one transaction; it refuses and rolls back on
--       duplicates or #174 objects).
--    3. Merge the stage-candidates.ts change (and this file) to main, so the
--       workflow's checkout runs the new script.
--    4. First run: a manual dispatch with dry_run = true, then false.
--  Manual paths to cover in step 1: workflow_dispatch of "Guideline & Provider
--  Sync"; `npx tsx scripts/stage-candidates.ts` from any local checkout (an
--  OLD checkout runs the old script — pull first); ad-hoc SQL inserts into
--  staged_guidelines (they still work; they get both keys by trigger and must
--  respect the slot index). The review dashboard is unaffected by the order.
--
--  Rollback limitations (see ROLLBACK at the end):
--    * rolling back the database without reverting the script leaves the
--      script failing loudly (step "new script, old database" above);
--    * dropping the evidence and decision tables DISCARDS their records —
--      export them first; the append-only triggers do not prevent DROP;
--    * the original status and change_reason CHECKs cannot be restored while
--      any row is 'resolved' or uses a new category (by design);
--    * rows staged by the new script keep primary_url = the verbatim href,
--      not the lowercased key the old script wrote; the old script still
--      works with them (it matches on candidate_id only);
--    * a partially successful run is not undone by a rollback — its rows are
--      ordinary pending queue rows.
--
-- ── Effect on the existing producer (sync-providers → stage-candidates) ─────
--
--  scripts/stage-candidates.ts no longer inserts into staged_guidelines
--  directly; it calls stage_sync_candidates() and reports staged / existing /
--  already_open / held / failed. Provider ownership is NOT changed here, and
--  BOFAS is NOT switched.
--
-- ── Pre-flight ──────────────────────────────────────────────────────────────
--
--  Section 5 checks for more than one OPEN row per identity key before
--  creating the slot index and refuses, listing them, if any exist. The
--  revision_needs_target CHECK fails (and the whole migration rolls back) if
--  any non-NEW_GUIDELINE row lacks a target; check first with:
--   select id, change_reason from public.staged_guidelines
--    where change_reason <> 'NEW_GUIDELINE'
--      and (matched_guideline_id is null or changed_url is null);
-- ============================================================================

begin;

-- ── 0. Refuse to run over PR #174's objects ─────────────────────────────────
-- See the box at the top. A silent half-merge of the two designs is the
-- failure this prevents: whichever is applied second must be rebased first.

do $$
begin
  if to_regclass('public.staged_detections') is not null
     or to_regclass('public.staged_guidelines_one_pending_revision') is not null
     or exists (select 1 from pg_proc where proname = 'stage_detected_change'
                  and pronamespace = 'public'::regnamespace)
     or exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'staged_guidelines'
                   and column_name in ('superseded_at', 'superseded_by')) then
    raise exception using
      errcode = '55000',
      message = '20261024_discovery_review_queue: PR #174 (stage_detected_changes) objects are present.',
      detail  = 'Both migrations replace staged_guidelines_review_status_check and approve_staged_guideline(), and #174''s detector rows collide with staged_guidelines_one_open_per_document.',
      hint    = 'Reconcile the two migrations (rebase #174 onto this one) before applying either. See the migration header.';
  end if;
end;
$$;

-- ── 1. Document keys [url-key v3] ───────────────────────────────────────────
-- Two keys, lexical, each the exact mirror of a TypeScript function in
-- scripts/lib/ingestion.ts — see "Document identity" above. Every step is
-- spelled out (explicit whitespace set, ASCII-only case folding, literal
-- string splitting) so nothing depends on locale, collation or a URL parser.

-- Shared first steps: trim, then lexically drop `ver` query parameters.
create or replace function public._url_strip_ver(p_url text)
returns text
language plpgsql
immutable
strict
parallel safe
set search_path = pg_catalog, pg_temp
as $$
declare
  -- The ECMAScript String.prototype.trim() set, as in ingestion.ts KEY_WHITESPACE.
  c_ws constant text := '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]';
  v_url      text;
  v_head     text;
  v_fragment text := '';
  v_query    text;
  v_parts    text[];
  v_kept     text[] := '{}';
  v_part     text;
  v_stripped boolean := false;
  v_pos      integer;
begin
  v_url := regexp_replace(p_url, '^' || c_ws || '+|' || c_ws || '+$', '', 'g');
  if v_url ~ '^[A-Za-z][A-Za-z0-9+.-]*:' then
    v_head := v_url;
    v_pos := strpos(v_head, '#');
    if v_pos > 0 then
      v_fragment := substr(v_head, v_pos);
      v_head := substr(v_head, 1, v_pos - 1);
    end if;
    v_pos := strpos(v_head, '?');
    if v_pos > 0 then
      v_query := substr(v_head, v_pos + 1);
      -- string_to_array('', '&') is '{}', where JS ''.split('&') is ['']; both
      -- mean "no ver segment", so the URL is left unchanged either way.
      v_parts := string_to_array(v_query, '&');
      foreach v_part in array coalesce(v_parts, '{}') loop
        if split_part(v_part, '=', 1) ~ '^[Vv][Ee][Rr]$' then
          v_stripped := true;
        elsif v_part <> '' then
          v_kept := v_kept || v_part;
        end if;
      end loop;
      if v_stripped then
        v_url := substr(v_head, 1, v_pos - 1)
          || case when coalesce(array_length(v_kept, 1), 0) > 0
                  then '?' || array_to_string(v_kept, '&') else '' end
          || v_fragment;
      end if;
    end if;
  end if;
  return v_url;
end;
$$;

-- MATCH key (loose heuristic) = normaliseCandidateUrl(). Folds ALL ASCII case
-- and trailing slashes of the whole string, so distinct case-sensitive
-- documents can share it. Used for staging holds, the approval near-match
-- refusal, and recognising rows filed before this migration (which stored
-- only this key as their primary_url). Never the queue's identity.
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

-- IDENTITY key (conservative) = documentIdentityKey(). Defines "the same
-- document" for the queue: RFC 3986 equivalences (scheme/host case, %XX hex
-- case) plus exactly two deliberate merges (`ver` tokens, trailing PATH
-- slashes). Path, query and fragment keep their case.
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

revoke all on function public._url_strip_ver(text) from public, anon, authenticated;

-- Which catalogue entry, if any, holds this document — exactly (identity) or
-- only under the loose heuristic (match). Used by the approval guard; not
-- exposed to API callers.
create or replace function public.catalogue_entry_for_identity_key(p_key text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id
    from public.guidelines g,
         jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
   where v ? 'url'
     and public.document_identity_key(v->>'url') = p_key
   order by g.id
   limit 1;
$$;

create or replace function public.catalogue_entry_for_match_key(p_key text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id
    from public.guidelines g,
         jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
   where v ? 'url'
     and public.document_match_key(v->>'url') = p_key
   order by g.id
   limit 1;
$$;

revoke all on function public.catalogue_entry_for_identity_key(text) from public, anon, authenticated;
revoke all on function public.catalogue_entry_for_match_key(text) from public, anon, authenticated;

-- ── 2. Categories and the 'resolved' status ─────────────────────────────────

alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_change_reason_check;
alter table public.staged_guidelines
  add constraint staged_guidelines_change_reason_check
  check (change_reason in (
    'NEW_GUIDELINE', 'REVISED', 'WITHDRAWN',
    'CONTENT_DRIFT', 'URL_MOVED', 'UNREACHABLE_LINK',
    'POSSIBLE_NEW_EDITION', 'EDITION_TOKEN_CHANGED', 'POSSIBLE_SAME_DOCUMENT'
  ));

-- See the #174 CONFLICT note above before changing this list.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_review_status_check;
alter table public.staged_guidelines
  add constraint staged_guidelines_review_status_check
  check (review_status in ('pending', 'accepted', 'rejected', 'deferred', 'resolved'));

-- ── 3. Columns ──────────────────────────────────────────────────────────────

alter table public.staged_guidelines
  add column if not exists changed_url    text,   -- shared with PR #174, same type
  add column if not exists identity_key   text,
  add column if not exists match_key      text,
  add column if not exists producer       text,
  add column if not exists review_outcome text;

comment on column public.staged_guidelines.changed_url is
  'For a non-new candidate: the URL it concerns, verbatim. Shared with PR #174.';
comment on column public.staged_guidelines.identity_key is
  'document_identity_key(primary_url): CONSERVATIVE document identity for the one-open-row rule. Set by trigger; enforced by CHECK.';
comment on column public.staged_guidelines.match_key is
  'document_match_key(primary_url): LOOSE heuristic key. Used to recognise rows filed before this migration, whose primary_url holds only this key. Set by trigger; enforced by CHECK.';
comment on column public.staged_guidelines.producer is
  'Which pipeline staged the row; NULL for rows filed before this migration (or by any writer that does not set it). Recorded only; ownership is not enforced by this migration.';
comment on column public.staged_guidelines.review_outcome is
  'Latest editor decision on an edition row. Open outcomes leave the row pending; see resolve_discovery_candidate().';

-- Backfill both keys for rows that predate this migration. Their primary_url
-- was written by the old stage-candidates.ts as normaliseCandidateUrl(), i.e.
-- ALREADY lowercased: the original case is not recoverable, so for those rows
-- identity_key is the identity of the lowercased string. The staging
-- functions therefore also recognise a pre-migration row (producer NULL) by
-- match_key — see _queue_row_for().
update public.staged_guidelines
   set identity_key = public.document_identity_key(primary_url),
       match_key    = public.document_match_key(primary_url)
 where primary_url is not null;

create or replace function public.staged_guidelines_set_document_keys()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- Always derived, never trusted from the writer: supplied values are
  -- overwritten, and an edited primary_url re-keys the row.
  new.identity_key := case when new.primary_url is null then null
                           else public.document_identity_key(new.primary_url) end;
  new.match_key    := case when new.primary_url is null then null
                           else public.document_match_key(new.primary_url) end;
  return new;
end;
$$;

drop trigger if exists staged_guidelines_document_keys on public.staged_guidelines;
create trigger staged_guidelines_document_keys
  before insert or update of primary_url, identity_key, match_key on public.staged_guidelines
  for each row execute function public.staged_guidelines_set_document_keys();

-- ── 4. Invariants ───────────────────────────────────────────────────────────

alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_document_keys_derived;
alter table public.staged_guidelines
  add constraint staged_guidelines_document_keys_derived
  check ((primary_url is null and identity_key is null and match_key is null)
         or (primary_url is not null
             and identity_key = public.document_identity_key(primary_url)
             and match_key    = public.document_match_key(primary_url)));

alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_producer_check;
alter table public.staged_guidelines
  add constraint staged_guidelines_producer_check
  check (producer is null or producer in ('sync-providers', 'discover', 'detect-changes'));

-- Ported from PR #174 with an IDENTICAL definition (see compatibility notes).
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_revision_needs_target;
alter table public.staged_guidelines
  add constraint staged_guidelines_revision_needs_target
  check (
    change_reason = 'NEW_GUIDELINE'
    or (matched_guideline_id is not null and changed_url is not null)
  );

-- Outcomes are class-specific, and open/closed must agree with review_status.
alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_review_outcome_check;
alter table public.staged_guidelines
  add constraint staged_guidelines_review_outcome_check
  check (
    review_outcome is null
    or (change_reason = 'POSSIBLE_NEW_EDITION' and review_outcome in
          ('same-document', 'no-action',
           'different-document-awaiting-refiling', 'new-edition-awaiting-revision'))
    or (change_reason = 'EDITION_TOKEN_CHANGED' and review_outcome in
          ('acknowledged', 'needs-document-check'))
    or (change_reason = 'POSSIBLE_SAME_DOCUMENT' and review_outcome in
          ('same-document', 'different-document-awaiting-refiling'))
  );

alter table public.staged_guidelines
  drop constraint if exists staged_guidelines_resolved_is_closed_outcome;
alter table public.staged_guidelines
  add constraint staged_guidelines_resolved_is_closed_outcome
  check (
    -- 'resolved' only with a closing outcome, and a closing outcome only when
    -- resolved. 'different-document-awaiting-refiling' is deliberately NOT
    -- closing: the separate document still needs a follow-up.
    (review_status = 'resolved')
      = (coalesce(review_outcome, '') in ('same-document', 'no-action', 'acknowledged'))
    -- a resolved row records who decided and when
    and (review_status <> 'resolved' or (reviewed_by is not null and reviewed_at is not null))
  );

-- ── 5. One open row per document, across all producers ──────────────────────
-- Open = pending or deferred. Keyed on the CONSERVATIVE identity key, so two
-- documents that differ only in path or query-value case each get their own
-- row — never silently merged, never blocked as each other's duplicate.
-- Enforced by unique index, so it holds under concurrent producers: a second
-- inserter waits for the first and then conflicts. Closed rows do not occupy
-- the slot.

-- Pre-flight: name the offending rows instead of failing on a bare 23505.
do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s (%s rows: %s)', identity_key, n, ids), E'\n')
    into v_dupes
    from (select identity_key, count(*) n, string_agg(candidate_id, ', ' order by candidate_id) ids
            from public.staged_guidelines
           where identity_key is not null and review_status in ('pending', 'deferred')
           group by identity_key having count(*) > 1) d;
  if v_dupes is not null then
    raise exception using
      errcode = '23505',
      message = '20261024_discovery_review_queue: more than one OPEN queue row per document key; the slot index cannot be created.',
      detail  = v_dupes,
      hint    = 'An editor must close (e.g. reject) all but one open row per document first; deferring does not help, deferred rows are open. Nothing has been changed: the migration rolls back.';
  end if;
end;
$$;

create unique index if not exists staged_guidelines_one_open_per_document
  on public.staged_guidelines (identity_key)
  where identity_key is not null and review_status in ('pending', 'deferred');

comment on index public.staged_guidelines_one_open_per_document is
  'At most one OPEN (pending/deferred) queue row per document identity key, whichever producer staged it.';

-- Lookup only (not unique): pre-migration rows are recognised by match key.
create index if not exists staged_guidelines_open_match_key_idx
  on public.staged_guidelines (match_key)
  where match_key is not null and review_status in ('pending', 'deferred');

-- ── 6. Append-only protection, shared by the new tables ─────────────────────
-- Refuses ordinary UPDATE/DELETE/TRUNCATE for every role, service_role
-- included. NOT a defence against the table owner or a superuser, who can
-- disable or drop these triggers — see "Append-only: threat model" above.

create or replace function public.forbid_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '%: append-only — % is not permitted', tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

-- ── 7. Evidence ─────────────────────────────────────────────────────────────

create table if not exists public.staged_discovery_evidence (
  id                    uuid        primary key default gen_random_uuid(),
  -- RESTRICT, not CASCADE: evidence is never deleted as a side effect.
  staged_id             uuid        not null references public.staged_guidelines(id) on delete restrict,
  discovery_run_id      text        not null check (length(btrim(discovery_run_id)) > 0),
  producer              text        not null check (producer in ('sync-providers', 'discover', 'detect-changes')),
  discovery_id          text        not null check (length(btrim(discovery_id)) > 0),
  report_schema_version integer     not null,
  discovered_url        text        not null,   -- verbatim href
  -- The listing page the href was read from. Required from discovery, whose
  -- reports carry it; sync-providers candidates do not record one.
  surface_url           text,
  observed_topic        text,                   -- title as observed this run
  observed_versions     jsonb       not null default '[]'::jsonb check (jsonb_typeof(observed_versions) = 'array'),
  -- How this sighting was tied to its queue row. 'legacy-match-key' = a row
  -- filed before this migration (producer NULL), whose stored URL lost its
  -- case: matched by the LOOSE key only, so NOT confirmed as the same document.
  row_match_basis       text        not null default 'identity'
                                    check (row_match_basis in ('identity', 'legacy-match-key')),
  stated_labels         jsonb       not null default '[]'::jsonb check (jsonb_typeof(stated_labels) = 'array'),
  url_alternatives      jsonb       not null default '[]'::jsonb check (jsonb_typeof(url_alternatives) = 'array'),
  soft_match            jsonb       check (soft_match is null or jsonb_typeof(soft_match) = 'object'),
  token_change          jsonb       check (token_change is null or jsonb_typeof(token_change) = 'object'),
  -- Discovery only: how the discovered URL relates to the NAMED entry's links,
  -- computed by the database at staging. 'exact' identity, 'loose' (match key
  -- only — e.g. letter case), 'alternative' (only an observed redirect or
  -- canonical-host URL matches), 'none'. NULL for sync-providers sightings.
  catalogue_relation    text        check (catalogue_relation is null
                                           or catalogue_relation in ('exact', 'loose', 'alternative', 'none')),
  observed_at           timestamptz not null,
  recorded_at           timestamptz not null default now(),
  -- One sighting per (queue row, run, candidate). discovery_id is part of it
  -- because an 'already_open' candidate attaches its sighting to the row that
  -- holds its document, and two candidates of one run can share that row.
  constraint staged_discovery_evidence_once_per_run unique (staged_id, discovery_run_id, discovery_id),
  constraint staged_discovery_evidence_discover_has_surface
    check (producer <> 'discover' or length(btrim(coalesce(surface_url, ''))) > 0)
);

comment on table public.staged_discovery_evidence is
  'Append-only: one row per producer run that observed a staged candidate. Written only by stage_discovery_candidate() and stage_sync_candidates() (service role). Editors may read. Ordinary UPDATE, DELETE and TRUNCATE are refused by trigger for every role including service_role; the table owner or a superuser can still disable the triggers (see the migration''s threat model).';

create index if not exists staged_discovery_evidence_staged_idx
  on public.staged_discovery_evidence (staged_id, observed_at desc);

drop trigger if exists staged_discovery_evidence_no_update_delete on public.staged_discovery_evidence;
create trigger staged_discovery_evidence_no_update_delete
  before update or delete on public.staged_discovery_evidence
  for each row execute function public.forbid_mutation();
drop trigger if exists staged_discovery_evidence_no_truncate on public.staged_discovery_evidence;
create trigger staged_discovery_evidence_no_truncate
  before truncate on public.staged_discovery_evidence
  for each statement execute function public.forbid_mutation();

alter table public.staged_discovery_evidence enable row level security;
drop policy if exists staged_discovery_evidence_editor_read on public.staged_discovery_evidence;
create policy staged_discovery_evidence_editor_read
  on public.staged_discovery_evidence
  for select to authenticated
  using (coalesce(public.is_editor(), false));
revoke all on public.staged_discovery_evidence from anon, authenticated;
grant select on public.staged_discovery_evidence to authenticated;

-- ── 8. Decision log ─────────────────────────────────────────────────────────

create table if not exists public.staged_discovery_decisions (
  id           uuid        primary key default gen_random_uuid(),
  staged_id    uuid        not null references public.staged_guidelines(id) on delete restrict,
  action       text        not null check (action in (
                 'same-document', 'different-document', 'no-action', 'new-edition',
                 'acknowledged', 'needs-document-check', 'defer', 'approve')),
  from_status  text        not null,
  to_status    text        not null,
  -- At least one non-whitespace character (tabs and newlines count as blank;
  -- btrim() alone strips only spaces).
  note         text        not null check (note ~ '\S'),
  decided_by   uuid        not null,
  decided_at   timestamptz not null default now()
);

comment on table public.staged_discovery_decisions is
  'Append-only log of editor decisions on queue rows: every resolve_discovery_candidate() action (including those that leave the row open) and every approve_staged_guideline() publication, written in the same transaction as the decision. Each records decided_by and decided_at even when the queue row''s reviewed_by/reviewed_at stay NULL. Same trigger protection and the same owner/superuser caveat as staged_discovery_evidence.';

create index if not exists staged_discovery_decisions_staged_idx
  on public.staged_discovery_decisions (staged_id, decided_at desc);

drop trigger if exists staged_discovery_decisions_no_update_delete on public.staged_discovery_decisions;
create trigger staged_discovery_decisions_no_update_delete
  before update or delete on public.staged_discovery_decisions
  for each row execute function public.forbid_mutation();
drop trigger if exists staged_discovery_decisions_no_truncate on public.staged_discovery_decisions;
create trigger staged_discovery_decisions_no_truncate
  before truncate on public.staged_discovery_decisions
  for each statement execute function public.forbid_mutation();

alter table public.staged_discovery_decisions enable row level security;
drop policy if exists staged_discovery_decisions_editor_read on public.staged_discovery_decisions;
create policy staged_discovery_decisions_editor_read
  on public.staged_discovery_decisions
  for select to authenticated
  using (coalesce(public.is_editor(), false));
revoke all on public.staged_discovery_decisions from anon, authenticated;
grant select on public.staged_discovery_decisions to authenticated;

-- ── 9. Staging holds ────────────────────────────────────────────────────────
-- Consulted ONLY at staging. Discovery reports still list a held item.
-- Keyed on the LOOSE match key on purpose: a hold expresses editorial intent
-- about a document, and a case variant of its link is far more likely to be
-- the same document than a different one. Over-holding is visible (the
-- outcome is 'held', and the item stays in discovery reports); it never
-- writes or merges anything.

create table if not exists public.discovery_staging_holds (
  match_key      text        primary key,
  status         text        not null check (status in ('pending-editorial-decision')),
  reason         text        not null check (length(btrim(reason)) > 0),
  held_since     date        not null,
  created_at     timestamptz not null default now()
);

comment on table public.discovery_staging_holds is
  'Document match keys (document_match_key) that no producer may stage. Not a scope exclusion: a held item is still reported. Remove a row only on an editorial decision.';

alter table public.discovery_staging_holds enable row level security;
drop policy if exists discovery_staging_holds_editor_read on public.discovery_staging_holds;
create policy discovery_staging_holds_editor_read
  on public.discovery_staging_holds
  for select to authenticated
  using (coalesce(public.is_editor(), false));
revoke all on public.discovery_staging_holds from anon, authenticated;
grant select on public.discovery_staging_holds to authenticated;

insert into public.discovery_staging_holds (match_key, status, reason, held_since)
values (
  'https://www.bofas.org.uk/portals/0/research/falcon-report-phase%201%20and%202%20final.pdf',
  'pending-editorial-decision',
  'UK-FALCON audit report (Council Report for Phases 1 and 2). Exclusion proposed 2026-10-24; editorial decision pending. Held from staging only — still listed in discovery reports.',
  date '2026-10-24'
)
on conflict (match_key) do nothing;

-- ── 10. Staging (service role only) ─────────────────────────────────────────
-- Shared outcome vocabulary for BOTH staging functions:
--   staged        a new queue row was filed (pending); evidence appended to it
--   existing      this candidate id is already queued, in ANY status. The row
--                 is not modified — an editor's accept, reject, defer or
--                 resolve stands — and this sighting is appended to it
--   already_open  a DIFFERENT candidate (any producer) holds this document's
--                 open slot. No row is filed; this sighting is appended to
--                 THAT row (evidence.discovery_id names this candidate)
--   held          the document is on discovery_staging_holds; nothing written
--   failed        (stage_sync_candidates only) refused or errored; nothing
--                 written for this candidate
-- and evidence: appended | already_recorded | none.

-- How a discovered URL relates to one catalogue entry's links (see
-- "Discovery evidence validation"). Observed alternatives only: redirect
-- targets and canonical-host variants, never co-publisher copies of catalogue
-- links. NULL entry → 'none'.
create or replace function public._catalogue_relation(
  p_entry text, p_identity text, p_match text, p_alternatives jsonb)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select case
    when p_entry is null then 'none'
    when exists (select 1 from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
                  where g.id = p_entry and v ? 'url' and public.document_identity_key(v->>'url') = p_identity)
      then 'exact'
    when exists (select 1 from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
                  where g.id = p_entry and v ? 'url' and public.document_match_key(v->>'url') = p_match)
      then 'loose'
    when exists (select 1 from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v,
                       jsonb_array_elements(coalesce(p_alternatives, '[]'::jsonb)) a
                  where g.id = p_entry and v ? 'url'
                    and a->>'scope' = 'document' and a->>'relation' in ('redirect-target', 'canonical-host')
                    and coalesce(btrim(a->>'url'), '') <> ''
                    and public.document_match_key(v->>'url') = public.document_match_key(a->>'url'))
      then 'alternative'
    else 'none'
  end;
$$;

-- The first catalogue entry OTHER than p_entry holding this document, exactly
-- (p_loose false) or under the loose key (p_loose true). NULL if none.
create or replace function public._other_catalogue_entry(p_entry text, p_identity text, p_match text, p_loose boolean)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select g.id
    from public.guidelines g, jsonb_array_elements(coalesce(g.versions, '[]'::jsonb)) v
   where g.id is distinct from p_entry and v ? 'url'
     and case when p_loose then public.document_match_key(v->>'url') = p_match
              else public.document_identity_key(v->>'url') = p_identity end
   order by g.id
   limit 1;
$$;

revoke all on function public._catalogue_relation(text, text, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public._other_catalogue_entry(text, text, text, boolean) from public, anon, authenticated, service_role;

-- Which queue row a candidate resolves to, before any insert.
--   * A row with this candidate id that is the SAME document → 'existing'.
--   * A row with this candidate id that is a DIFFERENT document → a candidate-
--     id collision (ids derive from the LOOSE match key, so case-distinct
--     documents can share one). Never merged, never refused: the candidate is
--     re-keyed to the derived id <id>~<first 12 hex of md5(identity key)> and
--     resolved under that, and o_collided is set so the caller reports it.
--   * Else an OPEN row for the same document → 'already_open'.
--   * Else 'none' (o_cid is the id to insert under).
-- "Same document" is the identity key — or, for a row filed BEFORE this
-- migration (producer NULL; its primary_url was stored lowercased, so its
-- original case is lost), the match key. Any match against such a row is
-- reported with o_basis = 'legacy-match-key': compatible, but NOT confirmed
-- exact. Rows with a producer are always matched by identity ('identity').
create or replace function public._queue_row_for(
  p_cid text, p_identity text, p_match text,
  out o_status text, out o_row_id uuid, out o_basis text, out o_cid text, out o_collided boolean)
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  r     public.staged_guidelines;
  v_hit boolean;
begin
  o_cid := p_cid;
  o_collided := false;
  select * into r from public.staged_guidelines where candidate_id = p_cid;
  v_hit := found;
  if v_hit and not (r.identity_key = p_identity or (r.producer is null and r.match_key = p_match)) then
    o_collided := true;
    o_cid := p_cid || '~' || substr(md5(p_identity), 1, 12);
    select * into r from public.staged_guidelines where candidate_id = o_cid;
    v_hit := found;
    if v_hit and r.identity_key is distinct from p_identity then
      raise exception using
        errcode = '23505',
        message = format('candidate ids %s and %s both name other documents', p_cid, o_cid),
        hint    = 'Derived-id hash collision; needs a human.';
    end if;
  end if;
  if v_hit then
    o_status := 'existing';
    o_row_id := r.id;
    o_basis  := case when r.producer is null then 'legacy-match-key' else 'identity' end;
    return;
  end if;

  select * into r from public.staged_guidelines
   where review_status in ('pending', 'deferred')
     and (identity_key = p_identity or (producer is null and match_key = p_match))
   order by (producer is not null and identity_key = p_identity) desc, created_at
   limit 1;
  if found then
    o_status := 'already_open';
    o_row_id := r.id;
    o_basis  := case when r.producer is null then 'legacy-match-key' else 'identity' end;
  else
    o_status := 'none';
  end if;
end;
$$;

revoke all on function public._queue_row_for(text, text, text) from public, anon, authenticated, service_role;

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
       where v ? 'url' and a->>'scope' = 'document' and a->>'relation' in ('redirect-target', 'canonical-host')
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

comment on function public.stage_discovery_candidate(text, text, jsonb) is
  'The discovery staging path. Service role only. Accepts NEW_GUIDELINE, POSSIBLE_NEW_EDITION and EDITION_TOKEN_CHANGED; refuses anything else (publisher retirement is report-only). Validates the class''s evidence on every call, and the claimed relationship against the database catalogue before filing a new row (22023 on unsupported or contradictory evidence); records how the URL relates to the named entry as evidence.catalogue_relation. Honours discovery_staging_holds. Returns status staged | existing | already_open | held; evidence is appended to the row the candidate resolved to. Never changes an existing row. Idempotent per (row, run, candidate). One call is one transaction: an error writes nothing.';

revoke all on function public.stage_discovery_candidate(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.stage_discovery_candidate(text, text, jsonb) to service_role;

-- ── 10b. Sync-providers staging (service role only) ─────────────────────────
-- Replaces scripts/stage-candidates.ts's direct INSERT … ON CONFLICT
-- (candidate_id) DO NOTHING, which raised 23505 — failing the WHOLE batch —
-- once the document slot index existed and any candidate's document was
-- already open under another candidate id.
--
-- PARTIAL SUCCESS, BY DESIGN. One call is one transaction, and inside it each
-- candidate runs in its own subtransaction (BEGIN … EXCEPTION):
--   * a candidate that raises — while validating, inserting its row, OR
--     writing its evidence — is rolled back completely (row and evidence
--     together) and reported 'failed' with its SQLSTATE;
--   * every other candidate's row and evidence COMMIT when the call returns;
--   * if the call itself fails (connection lost, statement timeout, the
--     function missing), the transaction rolls back and NOTHING is written.
-- So the unit of atomicity is one candidate, not one run. A retry of the same
-- report (same run id) re-attempts the failed candidates; the committed ones
-- come back 'existing' with evidence 'already_recorded' — no duplicates.

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

revoke all on function public._stage_sync_candidate(text, jsonb) from public, anon, authenticated, service_role;

create or replace function public.stage_sync_candidates(p_run_id text, p_candidates jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_c   jsonb;
  v_out jsonb := '[]'::jsonb;
  v_res jsonb;
begin
  if p_run_id is null or length(btrim(p_run_id)) = 0 then
    raise exception 'stage_sync_candidates: a run id is required for idempotency' using errcode = '22023';
  end if;
  if jsonb_typeof(p_candidates) is distinct from 'array' then
    raise exception 'stage_sync_candidates: p_candidates must be a JSON array' using errcode = '22023';
  end if;

  for v_c in select t.value from jsonb_array_elements(p_candidates) with ordinality t(value, n) order by t.n loop
    begin
      if jsonb_typeof(v_c) is distinct from 'object' then
        raise exception 'stage_sync_candidates: each candidate must be a JSON object' using errcode = '22023';
      end if;
      v_res := public._stage_sync_candidate(p_run_id, v_c);
    exception when others then
      -- This candidate's subtransaction (row AND evidence) is rolled back;
      -- the others stand and commit with the call.
      v_res := jsonb_build_object(
        'candidateId', case when jsonb_typeof(v_c) = 'object' then v_c->>'candidateId' end,
        'status', 'failed', 'evidence', 'none', 'code', sqlstate, 'message', sqlerrm);
    end;
    v_out := v_out || jsonb_build_array(v_res);
  end loop;
  return v_out;
end;
$$;

comment on function public.stage_sync_candidates(text, jsonb) is
  'The sync-providers staging path (scripts/stage-candidates.ts). Service role only. PARTIAL SUCCESS: one outcome per candidate, in input order (staged | existing | already_open | held | failed); a failed candidate (row and evidence) is rolled back alone and the rest commit. Never modifies an existing queue row; appends evidence once per (row, run, candidate) to the row the candidate resolved to. Re-running the same run id retries failures without duplicating anything.';

revoke all on function public.stage_sync_candidates(text, jsonb) from public, anon, authenticated;
grant execute on function public.stage_sync_candidates(text, jsonb) to service_role;

-- ── 11. Editor decisions on edition rows ────────────────────────────────────

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

comment on function public.resolve_discovery_candidate(uuid, text, text) is
  'Records an editor decision on a POSSIBLE_NEW_EDITION, EDITION_TOKEN_CHANGED or POSSIBLE_SAME_DOCUMENT row. Closing actions (same-document, no-action, acknowledged) set review_status = resolved and reviewed_by/_at; different-document, new-edition, needs-document-check and defer leave the row open with reviewed_by/_at NULL. Every action is logged with decided_by and decided_at. Never publishes and never touches guidelines or guideline_changelog. SECURITY DEFINER, gated on is_editor() is not true.';

revoke all on function public.resolve_discovery_candidate(uuid, text, text) from public, anon;
grant execute on function public.resolve_discovery_candidate(uuid, text, text) to authenticated;

-- ── 12. Approval: main's null-safe definition + 42809 guards ────────────────

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

  v_new := jsonb_populate_record(null::public.guidelines, p_final_guideline_data);

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
    coalesce(v_new.source_type, 'national'),
    coalesce(v_new.guidance_status, 'current'),
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

  return v_id;
end;
$$;

comment on function public.approve_staged_guideline(uuid, jsonb, text) is
  'Publishes a pending NEW_GUIDELINE candidate and its change note in one transaction, marks the row accepted, and appends an ''approve'' entry to staged_discovery_decisions in that same transaction. Refuses (42809) any non-NEW_GUIDELINE row, and any row linked to or whose document key is held by an existing entry [discovery-guards v1]; refuses (RQ002) a row whose document, or any link it would publish, is on discovery_staging_holds [hold-guard v1]. SECURITY DEFINER, gated on is_editor() is not true.';

-- create or replace preserves the existing grants; restated for a fresh build.
revoke all on function public.approve_staged_guideline(uuid, jsonb, text) from public, anon;
grant execute on function public.approve_staged_guideline(uuid, jsonb, text) to authenticated;

commit;

-- ============================================================================
-- Verify after applying:
--
--   -- the live approve body carries THIS migration's guards (not #174's):
--   select pg_get_functiondef('public.approve_staged_guideline(uuid,jsonb,text)'::regprocedure)
--          like '%discovery-guards v1%' as has_classification_guard,
--          pg_get_functiondef('public.approve_staged_guideline(uuid,jsonb,text)'::regprocedure)
--          like '%is_editor() is not true%' as null_safe,
--          obj_description('public.approve_staged_guideline(uuid,jsonb,text)'::regprocedure)
--          like '%hold-guard v1%' as hold_guard;                          -- t, t, t
--   select relname, relrowsecurity from pg_class
--    where relname in ('staged_discovery_evidence','staged_discovery_decisions','discovery_staging_holds');
--   -- all t
--   select r.rolname,
--          has_function_privilege(r.rolname, 'public.stage_discovery_candidate(text,text,jsonb)', 'EXECUTE') stage,
--          has_function_privilege(r.rolname, 'public.stage_sync_candidates(text,jsonb)', 'EXECUTE') sync,
--          has_function_privilege(r.rolname, 'public._stage_sync_candidate(text,jsonb)', 'EXECUTE') sync_inner,
--          has_function_privilege(r.rolname, 'public.resolve_discovery_candidate(uuid,text,text)', 'EXECUTE') resolve
--     from pg_roles r where r.rolname in ('anon','authenticated','service_role');
--   -- stage: f,f,t   sync: f,f,t   sync_inner: f,f,f   resolve: f,t,t
--   -- the identity function is v2 (lexical):
--   select obj_description('public.document_identity_key(text)'::regprocedure) like '[url-key v3 identity]%',
--          obj_description('public.document_match_key(text)'::regprocedure) like '[url-key v3 match]%';  -- t, t
--
-- ROLLBACK (local or pre-production only; prefer fixing forward):
--   re-apply supabase/migrations/20261012_approve_guard_null_safe.sql, then
--   export staged_discovery_evidence and staged_discovery_decisions first;
--   drop function public.stage_discovery_candidate(text,text,jsonb),
--                 public.stage_sync_candidates(text,jsonb),
--                 public._stage_sync_candidate(text,jsonb),
--                 public.resolve_discovery_candidate(uuid,text,text),
--                 public._queue_row_for(text,text,text),
--                 public._catalogue_relation(text,text,text,jsonb),
--                 public._other_catalogue_entry(text,text,text,boolean);
--   and revert scripts/stage-candidates.ts with it (it calls stage_sync_candidates).
--   drop table public.staged_discovery_decisions, public.staged_discovery_evidence,
--              public.discovery_staging_holds;   -- triggers block TRUNCATE, not DROP
--   restore the two CHECK constraints to their 20261011 lists (fails if any row
--   uses a new value — that is the point), and drop the added columns,
--   constraints, index, trigger and helper functions.
-- ============================================================================
