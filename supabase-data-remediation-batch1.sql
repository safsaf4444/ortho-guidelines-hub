-- ============================================================================
-- DATA REMEDIATION BATCH 1 — safe mechanical dead-link fixes  (DO NOT AUTO-RUN)
-- ============================================================================
-- Run ONCE, by hand, in Supabase -> SQL Editor, but ONLY AFTER the P0 RLS/Auth
-- rollout is complete and verified. See README ("Data remediation ordering").
--
-- Scope: the SEVEN verified, low-risk mechanical fixes from
-- reports/dead-link-remediation-plan.md. Each replacement URL was confirmed
-- HTTP 200 from an official source on 2026-08-22. Editorial/manual-decision
-- rows and the 11 held audit rows are DELIBERATELY NOT touched here.
--
-- This edits the `versions` JSONB array on `public.guidelines` in place
-- (index-based, guarded by the expected old URL) and stamps
-- link_last_verified = 2026-08-22 with an appended honest note. It does NOT
-- change link_verification_status (rows remain 'verified').
--
-- After running this: run `npm run export-static` to regenerate
-- src/data/guidelines-data.ts, then commit that in a separate follow-up PR.
--
-- Wrapped in a transaction; a failed precondition raises and rolls everything
-- back (fail closed) so a drifted DB is never half-updated.
-- ============================================================================

begin;

-- ── Preconditions: every target row must exist AND still hold the expected
--    obsolete URL at the expected position. If any check fails, abort. ───────
do $$
begin
  if not exists (select 1 from public.guidelines where id = 'bess-ebi-list-2-guidance'
                 and versions->0->>'url' = 'https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6559/ebi-list-2-guidance.pdf')
    then raise exception 'Precondition failed: bess-ebi-list-2-guidance versions[0] not the expected obsolete URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'bofas-flatfoot-commissioning'
                 and versions->0->>'url' = 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20Flatfoot%20Commissioning%20guidelines%20%20.pdf')
    then raise exception 'Precondition failed: bofas-flatfoot-commissioning versions[0] not the expected obsolete URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'fls-db'
                 and versions->0->>'url' = 'https://www.rcplondon.ac.uk/projects/fracture-liaison-service-database-fls-db'
                 and versions->3->>'url' = 'https://www.fffap.org.uk/fls/web/')
    then raise exception 'Precondition failed: fls-db versions[0]/[3] not the expected obsolete URLs'; end if;

  if not exists (select 1 from public.guidelines where id = 'naif-inpatient-falls'
                 and versions->1->>'url' = 'https://www.fffap.org.uk/naif/web/')
    then raise exception 'Precondition failed: naif-inpatient-falls versions[1] not the expected obsolete URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'nhs-ebi-programme'
                 and versions->5->>'url' = 'https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6559/ebi-list-2-guidance.pdf')
    then raise exception 'Precondition failed: nhs-ebi-programme versions[5] not the expected obsolete URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'bofas-round-table-consensus'
                 and versions->2->>'url' = 'https://www.bofas.org.uk/Portals/0/RoundTable_Booklets/Round%20Table%20-%20YYYY%20-%20CITY.pdf')
    then raise exception 'Precondition failed: bofas-round-table-consensus versions[2] not the expected placeholder URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'bajis-professional-resources'
                 and versions->1->>'url' = 'https://bajis.org/guidelines')
    then raise exception 'Precondition failed: bajis-professional-resources versions[1] not the expected obsolete URL'; end if;
end $$;

-- ── 1. bess-ebi-list-2-guidance — primary (versions[0]) dead 404 -> AoMRC List 2 PDF
update public.guidelines
set versions = jsonb_set(versions, '{0,url}',
      to_jsonb('https://ebi.aomrc.org.uk/wp-content/uploads/2024/01/EBI_list2_guidance_no_coding_0923.pdf'::text)),
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: dead primary (bess.ac.uk download path, HTTP 404) replaced with the canonical AoMRC EBI List 2 guidance PDF on ebi.aomrc.org.uk (HTTP 200 confirmed).'
where id = 'bess-ebi-list-2-guidance'
  and versions->0->>'url' = 'https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6559/ebi-list-2-guidance.pdf';

-- ── 2. bofas-flatfoot-commissioning — primary (versions[0]) 404 -> BOA-hosted PDF
--     (root cause: filename has non-breaking spaces stored as ordinary %20)
update public.guidelines
set versions = jsonb_set(versions, '{0,url}',
      to_jsonb('https://www.boa.ac.uk/static/83bf469d-2c6f-470b-a6ffc7f0fda8eada/acquired%20adult%20flatfoot%20deformity.pdf'::text)),
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: dead primary (BOFAS Portals path, non-breaking-space encoding, HTTP 404) replaced with the verified BOA-hosted copy (HTTP 200 confirmed).'
where id = 'bofas-flatfoot-commissioning'
  and versions->0->>'url' = 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20Flatfoot%20Commissioning%20guidelines%20%20.pdf';

-- ── 3. fls-db — primary (versions[0], rcplondon DNS) + web portal (versions[3], fffap 404) -> RCP FFFAP page
update public.guidelines
set versions = jsonb_set(
                 jsonb_set(versions, '{0,url}',
                   to_jsonb('https://www.rcp.ac.uk/improving-care/national-clinical-audits/falls-and-fragility-fracture-audit-programme-fffap/fracture-liaison-service-database-fls-db/'::text)),
                 '{3,url}',
                   to_jsonb('https://www.rcp.ac.uk/improving-care/national-clinical-audits/falls-and-fragility-fracture-audit-programme-fffap/fracture-liaison-service-database-fls-db/'::text)),
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: primary and web-portal URLs updated from obsolete rcplondon.ac.uk / fffap.org.uk paths to the current RCP FFFAP FLS-DB page (HTTP 200 confirmed).'
where id = 'fls-db'
  and versions->0->>'url' = 'https://www.rcplondon.ac.uk/projects/fracture-liaison-service-database-fls-db'
  and versions->3->>'url' = 'https://www.fffap.org.uk/fls/web/';

-- ── 4. naif-inpatient-falls — fallback (versions[1], fffap 404) -> RCP FFFAP NAIF page
update public.guidelines
set versions = jsonb_set(versions, '{1,url}',
      to_jsonb('https://www.rcp.ac.uk/improving-care/national-clinical-audits/falls-and-fragility-fracture-audit-programme-fffap/national-audit-of-inpatient-falls-naif/'::text)),
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: obsolete fffap.org.uk/naif fallback updated to the current RCP FFFAP NAIF page (HTTP 200 confirmed).'
where id = 'naif-inpatient-falls'
  and versions->1->>'url' = 'https://www.fffap.org.uk/naif/web/';

-- ── 5. nhs-ebi-programme — remove redundant dead BESS List 2 link (versions[5], 404).
--     The canonical AoMRC List 2 PDF is already present in this row.
update public.guidelines
set versions = versions - 5,
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: removed the redundant dead BESS List 2 shoulder-guidance link (HTTP 404); canonical AoMRC List 2 PDF already present.'
where id = 'nhs-ebi-programme'
  and versions->5->>'url' = 'https://bess.ac.uk/download/1421/primary-intermediate-care-guidelines/6559/ebi-list-2-guidance.pdf';

-- ── 6. bofas-round-table-consensus — remove unfilled placeholder link (versions[2], "YYYY - CITY", 404)
update public.guidelines
set versions = versions - 2,
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: removed a placeholder version link whose URL was an unfilled template (Round Table - YYYY - CITY.pdf, HTTP 404). Its label had listed the not-yet-located booklets: 2024 Cambridge, 2023 Stratford, 2019 Krakow, 2018 Belfast, 2017 Cardiff, 2016 Munich, 2015 Edinburgh, 2014 Budapest, 2013 Barcelona, 2012 Paris, 2011 Padova.'
where id = 'bofas-round-table-consensus'
  and versions->2->>'url' = 'https://www.bofas.org.uk/Portals/0/RoundTable_Booklets/Round%20Table%20-%20YYYY%20-%20CITY.pdf';

-- ── 7. bajis-professional-resources — remove dead fallback (versions[1], 404); working primary preserved
update public.guidelines
set versions = versions - 1,
    link_last_verified = date '2026-08-22',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-22 remediation: removed the dead ''Fallback / index page'' link (bajis.org/guidelines, HTTP 404); working primary preserved.'
where id = 'bajis-professional-resources'
  and versions->1->>'url' = 'https://bajis.org/guidelines';

-- ── Post-change review (inspect before COMMIT) ─────────────────────────────
--    Expect exactly these 7 rows, each link_last_verified = 2026-08-22.
select id, link_last_verified, jsonb_array_length(versions) as n_versions
from public.guidelines
where id in (
  'bess-ebi-list-2-guidance','bofas-flatfoot-commissioning','fls-db',
  'naif-inpatient-falls','nhs-ebi-programme','bofas-round-table-consensus',
  'bajis-professional-resources'
)
order by id;

commit;
-- If anything above looks wrong, run `rollback;` instead of committing.
