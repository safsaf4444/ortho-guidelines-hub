-- ============================================================================
-- Editorial metadata: source_type, guidance_status, scope_note,
-- editorial_review_date, inclusion_reason.
-- ============================================================================
-- Additive. Adds five columns to public.guidelines, backfills all 231 live
-- rows from evidence already in the table, then locks the new columns down
-- with CHECK constraints.
--
-- WHY THESE FIELDS: the card UI previously conflated three different dates and
-- two different kinds of "status". A reachability check (does the URL respond?)
-- was being read as a statement about the guidance itself. These columns
-- separate the concepts so the UI can stop implying clinical endorsement.
-- ============================================================================

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.guidelines
  add column if not exists source_type           text,
  add column if not exists guidance_status       text,
  add column if not exists scope_note            text,
  add column if not exists editorial_review_date date,
  add column if not exists inclusion_reason      text;

comment on column public.guidelines.source_type is
  'Who published this and at what level. Distinct from `type`, which is free text and mixes publisher level with format.';
comment on column public.guidelines.guidance_status is
  'Editorial state of the GUIDANCE itself. Deliberately NOT the same as link_verification_status, which only says whether a URL responded.';
comment on column public.guidelines.scope_note is
  'Age group / setting / specialty, ONLY where the source document states one. Null means "not stated by the source", never "unknown" or "all patients".';
comment on column public.guidelines.editorial_review_date is
  'When a human last reviewed this entry editorially. Distinct from link_last_verified, which is an automated reachability check.';
comment on column public.guidelines.inclusion_reason is
  'Why this entry is in the catalogue, or why it holds its current non-current status. Required on superseded / archived / needs-review / no-source-identified.';

-- ── 2. Backfill: source_type ────────────────────────────────────────────────
-- Derived from the existing `type` column, which already carries the publisher
-- level for every row, with two evidence-based overrides.
--
-- Two international bodies are reclassified to external-non-uk:
--   * International Osteoporosis Foundation      (iof-capture-the-fracture)
--   * EANM / EBJIS / ESR (ESCMID endorsed)       (ebjis-peripheral-bone-infection-adults)
-- Both are typed "Specialist society guidance", which is true but hides that
-- they are not UK guidance.
--
-- 'Local overlay' does NOT map to local-pruh. The only row carrying that type
-- is nhfd-exemplar-local-pathways — "Exemplar NOF care pathways from other
-- trusts", i.e. national NHFD material offered as templates. Calling it
-- local-pruh would assert PRUH authorship that does not exist. It maps to
-- 'national'. local-pruh therefore backfills to ZERO rows, which is the honest
-- outcome: nothing in the catalogue is PRUH-authored yet.
update public.guidelines
set source_type = case
  when source in (
    'International Osteoporosis Foundation',
    'EANM / EBJIS / ESR (ESCMID endorsed)'
  )                                        then 'external-non-uk'
  when type = 'National guidance'          then 'national'
  when type = 'Specialist society guidance' then 'specialist-society'
  when type = 'Quick reference'            then 'quick-reference'
  when type = 'Local overlay'              then 'national'
  else 'national'
end
where source_type is null;

-- ── 3. Backfill: guidance_status ────────────────────────────────────────────
-- Everything defaults to 'current'; the exceptions are the three rows whose
-- own notes already record a non-current state.
update public.guidelines set guidance_status = 'current' where guidance_status is null;

-- GIRFT lists both of these as "Currently under review" on its pathways index
-- (recorded in each row's notes, July 2026). The PUBLISHER has them under
-- review — this is not our own uncertainty.
update public.guidelines set guidance_status = 'needs-review'
where id in ('girft-bunions', 'girft-shoulder-arthroscopy-rotator-cuff');

-- Primary link sits behind a members-only wall, so the guidance is not
-- reachable by a PRUH clinician without BSCOS membership. The row's secondary
-- link (public consensus projects) IS reachable, which is why this is
-- link-unavailable rather than no-source-identified.
update public.guidelines set guidance_status = 'link-unavailable'
where id = 'bscos-practice-guidelines-members';

-- Keep guidance_status consistent with the existing archived flag. Zero rows
-- match today; this exists so the two can never silently disagree if a row is
-- archived before the app-side logic ships.
update public.guidelines set guidance_status = 'archived' where archived = true;

-- ── 4. Backfill: editorial_review_date ──────────────────────────────────────
-- last_checked is the existing human editorial check (2026-07-28/29 across the
-- catalogue). It is NOT the link check — link_last_verified holds that
-- (2026-08-06 for 220 rows, 2026-08-22/23 for an 11-row re-check cluster).
-- Copying it here makes the distinction explicit in the schema rather than
-- leaving two similarly-named fields for the UI to conflate.
update public.guidelines
set editorial_review_date = last_checked
where editorial_review_date is null;

-- ── 5. Backfill: inclusion_reason ───────────────────────────────────────────
update public.guidelines
set inclusion_reason = 'Included in the verified master set of 231 entries loaded from the audited workbook (data audit, 2026-08-22). Provenance backfill — not an individual editorial judgement.'
where inclusion_reason is null;

update public.guidelines
set inclusion_reason = 'GIRFT lists this pathway as "Currently under review" on its pathways index (recorded July 2026). Held as needs-review until GIRFT republishes; the entry is kept so the topic is not silently absent from the catalogue.'
where id in ('girft-bunions', 'girft-shoulder-arthroscopy-rotator-cuff');

update public.guidelines
set inclusion_reason = 'Primary source is inside the BSCOS members-only area, so it is not reachable without membership. Kept because the publicly accessible BSCOS consensus projects cover part of the same ground and are linked on this entry.'
where id = 'bscos-practice-guidelines-members';

-- scope_note is deliberately left NULL for every row. It may only be populated
-- from what a source document actually states about age group, setting or
-- specialty. That cannot be derived from the data already held without
-- inventing it, so it is left empty for editors to fill in as they review.

-- ── 6. Constraints ──────────────────────────────────────────────────────────
alter table public.guidelines
  drop constraint if exists guidelines_source_type_check;
alter table public.guidelines
  add constraint guidelines_source_type_check
  check (source_type in (
    'national', 'specialist-society', 'local-pruh', 'quick-reference', 'external-non-uk'
  ));

alter table public.guidelines
  drop constraint if exists guidelines_guidance_status_check;
alter table public.guidelines
  add constraint guidelines_guidance_status_check
  check (guidance_status in (
    'current', 'superseded', 'archived', 'needs-review', 'link-unavailable', 'no-source-identified'
  ));

-- A non-current status must be explained. Enforced at the database so it holds
-- for direct API callers too, not only the edit form — the same reasoning as
-- guideline_changelog_description_not_blank.
alter table public.guidelines
  drop constraint if exists guidelines_inclusion_reason_required;
alter table public.guidelines
  add constraint guidelines_inclusion_reason_required
  check (
    guidance_status not in ('superseded', 'archived', 'needs-review', 'no-source-identified')
    or (inclusion_reason is not null and length(btrim(inclusion_reason)) > 0)
  );

alter table public.guidelines
  alter column source_type     set not null,
  alter column source_type     set default 'national',
  alter column guidance_status set not null,
  alter column guidance_status set default 'current';

-- ============================================================================
-- Expected after running (231 live rows):
--   source_type       national 133 | specialist-society 92 | quick-reference 4
--                     | external-non-uk 2 | local-pruh 0
--   guidance_status   current 228 | needs-review 2 | link-unavailable 1
--   editorial_review_date  populated for all 231 (from last_checked)
--   inclusion_reason       populated for all 231
--   scope_note             NULL for all 231, by design
-- ============================================================================


-- ============================================================================
-- ROLLBACK
-- ============================================================================
-- begin;
--   alter table public.guidelines
--     drop constraint if exists guidelines_inclusion_reason_required,
--     drop constraint if exists guidelines_guidance_status_check,
--     drop constraint if exists guidelines_source_type_check;
--   alter table public.guidelines
--     drop column if exists source_type,
--     drop column if exists guidance_status,
--     drop column if exists scope_note,
--     drop column if exists editorial_review_date,
--     drop column if exists inclusion_reason;
-- commit;
-- ============================================================================
