-- ============================================================================
-- DATA REMEDIATION BATCH 2 — verified mechanical dead-link fixes  (DO NOT AUTO-RUN)
-- ============================================================================
-- Run ONCE, by hand, in Supabase -> SQL Editor. Nothing here has been executed.
--
-- Scope: the FIVE verified, low-risk mechanical URL swaps from
-- reports/dead-link-remediation-batch2-plan.md (Class A). Every replacement URL
-- was confirmed HTTP 200 with a browser user-agent on 2026-08-23.
--
-- DELIBERATELY NOT IN THIS FILE (see the plan's Class B / Class C):
--   * BASK blocked-source config      (needs browser confirmation first)
--   * BOSTAA links                    (HTTP 500 server fault — monitor, don't rewrite)
--   * ROS 2017 PDFs                   (no replacement located; may be superseded)
--   * BSSH / BHS directory rows       (truncated labels, need enumeration)
--   * Duplicate version URLs          (separate file: supabase-data-remediation-batch2-duplicates.sql)
--
-- This edits the `versions` JSONB array in place (index-based, guarded by the
-- expected old URL) and stamps link_last_verified = 2026-08-23 with an appended
-- note. It does NOT change link_verification_status (rows remain 'verified').
--
-- After running this: run `npm run export-static` to regenerate
-- src/data/guidelines-data.ts, then commit that in a separate follow-up PR.
--
-- Wrapped in a transaction; a failed precondition raises and rolls everything
-- back (fail closed) so a drifted DB is never half-updated.
--
-- ─── TWO DEVIATIONS FROM THE ORIGINAL BRIEF — CONFIRMED BY SAFA 2026-08-23 ──
-- For `bssh-hand-trauma-app` and `boa-bgs-blue-book`, the PRIMARY link is
-- already correct and live. It is the FALLBACK that is dead. Applying the
-- literal instruction ("correct the path segment" / "use the BGS-hosted
-- document") to the fallback slot would have made the fallback byte-identical
-- to the primary — manufacturing exactly the duplicate-URL defect that
-- supabase-data-remediation-batch2-duplicates.sql exists to remove.
-- Each fallback is therefore repointed at a genuine INDEX page instead, which
-- matches its "Fallback / index page" label. See sections 3 and 5.
-- ============================================================================

begin;

-- ── Preconditions: every target row must exist AND still hold the expected
--    obsolete URL at the expected position. If any check fails, abort. ───────
do $$
begin
  if not exists (select 1 from public.guidelines where id = 'bpt-fragility-hip-femur-fracture'
                 and versions->0->>'url' = 'https://www.england.nhs.uk/wp-content/uploads/2026/03/26-27NHSPS-Annex-C-Best-practice-tariffs.pdf'
                 and versions->1->>'url' = 'https://www.england.nhs.uk/publication/nhs-payment-scheme/')
    then raise exception 'Precondition failed: bpt-fragility-hip-femur-fracture versions[0]/[1] not the expected obsolete URLs'; end if;

  if not exists (select 1 from public.guidelines where id = 'bssh-hand-trauma-app'
                 and versions->0->>'url' = 'https://www.bssh.ac.uk/hand_trauma_app.aspx'
                 and versions->1->>'url' = 'https://www.bssh.ac.uk/professionals/hand_trauma_app.aspx')
    then raise exception 'Precondition failed: bssh-hand-trauma-app versions[0]/[1] not in the expected state'; end if;

  if not exists (select 1 from public.guidelines where id = 'bsg-ultrasound-soft-tissue-masses'
                 and versions->0->>'url' = 'https://britishsarcomagroup.org.uk/wp-content/uploads/2019/01/BSG-guidance-for-ultrasound-screening-of-soft-tissue-masses-in-the-trunk-and-extremity-FINAL-Jan-2019.pdf')
    then raise exception 'Precondition failed: bsg-ultrasound-soft-tissue-masses versions[0] not the expected obsolete URL'; end if;

  if not exists (select 1 from public.guidelines where id = 'boa-bgs-blue-book'
                 and versions->0->>'url' = 'https://www.bgs.org.uk/sites/default/files/content/attachment/2018-05-02/Blue%20Book%20on%20fragility%20fracture%20care.pdf'
                 and versions->1->>'url' = 'https://www.boa.ac.uk/wp-content/uploads/2014/12/blue_book.pdf')
    then raise exception 'Precondition failed: boa-bgs-blue-book versions[0]/[1] not in the expected state'; end if;
end $$;

-- ── 1. bpt-fragility-hip-femur-fracture — primary (versions[0]) 404 -> renamed Annex C PDF
--     Root cause: NHS England republished the 2026/27 NHSPS in Aug 2026 as a
--     pay-award update; every annexe filename gained a `PRN02348-...-pay-award-`
--     prefix, so the March filenames 404.
--     NOTE: this row currently has NO working link at all (both [0] and [1] are
--     404), so it is the highest-priority fix in this batch.
update public.guidelines
set versions = jsonb_set(versions, '{0,url}',
      to_jsonb('https://www.england.nhs.uk/wp-content/uploads/2026/03/PRN02348-26-27-nhs-payment-scheme-pay-award-annex-c-best-practice-tariffs.pdf'::text)),
    link_last_verified = date '2026-08-23',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 remediation: dead primary (HTTP 404) replaced. NHS England republished the 2026/27 NHS Payment Scheme in August 2026 as a pay-award update, prefixing every annexe filename with PRN02348-...-pay-award-. New Annex C URL confirmed HTTP 200. CAUTION: this is still a dated wp-content/uploads path and will break again at the next republication. Reviewed 2026-08-23: the direct PDF was deliberately RETAINED as primary (with the evergreen /pay-syst/ hub as fallback) so users land on the document itself — expect to re-point this link at each annual republication.'
where id = 'bpt-fragility-hip-femur-fracture'
  and versions->0->>'url' = 'https://www.england.nhs.uk/wp-content/uploads/2026/03/26-27NHSPS-Annex-C-Best-practice-tariffs.pdf';

-- ── 2. bpt-fragility-hip-femur-fracture — fallback (versions[1]) 404 -> evergreen hub
--     The evergreen /pay-syst/ hub is chosen over the year-stamped
--     /publication/2026-27-nhs-payment-scheme/ page (also HTTP 200) so the
--     fallback survives the 2027/28 republication.
update public.guidelines
set versions = jsonb_set(versions, '{1,url}',
      to_jsonb('https://www.england.nhs.uk/pay-syst/nhs-payment-scheme/'::text)),
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 remediation: dead fallback (england.nhs.uk/publication/nhs-payment-scheme/, HTTP 404) replaced with the evergreen NHS Payment Scheme hub (HTTP 200), deliberately chosen over the year-stamped 2026/27 page so it does not rot annually.'
where id = 'bpt-fragility-hip-femur-fracture'
  and versions->1->>'url' = 'https://www.england.nhs.uk/publication/nhs-payment-scheme/';

-- ── 3. bssh-hand-trauma-app — fallback (versions[1]) 404 -> BSSH guidelines index
--     DEVIATION (see header): the primary versions[0] is ALREADY
--     https://www.bssh.ac.uk/hand_trauma_app.aspx and is live (HTTP 200) — the
--     '/professionals/' segment only survives in the dead FALLBACK. Simply
--     stripping that segment would make versions[1] identical to versions[0].
--     Repointed at the BSSH Guidelines & Resources index instead, which is what
--     the "Fallback / index page" label actually denotes. Confirmed HTTP 200.
update public.guidelines
set versions = jsonb_set(versions, '{1,url}',
      to_jsonb('https://www.bssh.ac.uk/professionals/guidelines.aspx'::text)),
    link_last_verified = date '2026-08-23',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 remediation: dead fallback (bssh.ac.uk/professionals/hand_trauma_app.aspx, HTTP 404 — BSSH moved the page up one level). The primary already pointed at the correct live URL, so the fallback was repointed at the BSSH Guidelines & Resources index (HTTP 200) rather than duplicating the primary.'
where id = 'bssh-hand-trauma-app'
  and versions->1->>'url' = 'https://www.bssh.ac.uk/professionals/hand_trauma_app.aspx';

-- ── 4. bsg-ultrasound-soft-tissue-masses — primary (versions[0]) 404 -> moved PDF
--     Identical filename, re-uploaded under a new WordPress date folder
--     (2019/01 -> 2026/02). Fallback versions[1] is already live; untouched.
update public.guidelines
set versions = jsonb_set(versions, '{0,url}',
      to_jsonb('https://britishsarcomagroup.org.uk/wp-content/uploads/2026/02/BSG-guidance-for-ultrasound-screening-of-soft-tissue-masses-in-the-trunk-and-extremity-FINAL-Jan-2019.pdf'::text)),
    link_last_verified = date '2026-08-23',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 remediation: dead primary (HTTP 404) replaced. Same document, same filename, re-uploaded by British Sarcoma Group under a new WordPress date folder (2019/01 -> 2026/02). New URL confirmed HTTP 200.'
where id = 'bsg-ultrasound-soft-tissue-masses'
  and versions->0->>'url' = 'https://britishsarcomagroup.org.uk/wp-content/uploads/2019/01/BSG-guidance-for-ultrasound-screening-of-soft-tissue-masses-in-the-trunk-and-extremity-FINAL-Jan-2019.pdf';

-- ── 5. boa-bgs-blue-book — fallback (versions[1]) 404 -> BGS landing page
--     DEVIATION (see header): the primary versions[0] is ALREADY the BGS-hosted
--     Blue Book PDF and is live (HTTP 200). Only the BOA-hosted copy in the
--     FALLBACK slot is dead. Repointing the fallback at the same BGS PDF would
--     duplicate the primary, so it is repointed at the BGS Blue Book landing
--     page, matching its "Fallback / index page" label. Confirmed HTTP 200.
update public.guidelines
set versions = jsonb_set(versions, '{1,url}',
      to_jsonb('https://www.bgs.org.uk/care-of-patients-with-fragility-fracture-blue-book'::text)),
    link_last_verified = date '2026-08-23',
    link_verification_notes = coalesce(link_verification_notes, '') ||
      ' | 2026-08-23 remediation: dead fallback (boa.ac.uk/wp-content/uploads/2014/12/blue_book.pdf, HTTP 404 — BOA no longer hosts a copy). The primary already pointed at the live BGS-hosted PDF, so the fallback was repointed at the BGS Blue Book landing page (HTTP 200) rather than duplicating the primary. The Blue Book is a joint BOA/BGS document, so a BGS host is consistent with this row''s stated source.'
where id = 'boa-bgs-blue-book'
  and versions->1->>'url' = 'https://www.boa.ac.uk/wp-content/uploads/2014/12/blue_book.pdf';

-- ── Post-change review (inspect before COMMIT) ─────────────────────────────
--    Expect exactly these 4 rows, each link_last_verified = 2026-08-23.
select id, link_last_verified, jsonb_array_length(versions) as n_versions
from public.guidelines
where id in (
  'bpt-fragility-hip-femur-fracture','bssh-hand-trauma-app',
  'bsg-ultrasound-soft-tissue-masses','boa-bgs-blue-book'
)
order by id;

commit;
-- If anything above looks wrong, run `rollback;` instead of committing.
