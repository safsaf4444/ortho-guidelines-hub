/**
 * src/data/freshness-evidence.fixture.ts
 * ──────────────────────────────────────
 * A SMALL, TRACEABLE evidence snapshot for the freshness dashboard, built
 * from the lifecycle evidence audit of 5 Nov 2026. Every record names where
 * it was read and when; archive captures carry their capture timestamp.
 *
 * It is a FIXTURE: a demonstration input, not a feed. Nothing fetches NICE or
 * any other publisher at run time. Publisher wording is quoted only as short
 * status metadata (no clinical content). NICE quotations were omitted during
 * local integration pending source reuse review. This remains supplied audit
 * evidence, not independent live verification. Dates are as the audit recorded
 * them; where a direct fetch returned stale content the record says so and is
 * marked `stale`, so the evaluator treats it as contradicted evidence rather
 * than fact.
 *
 * Grades: 'confirmed' = read on the publisher's page or a dated archive
 * capture of it; 'inferred' = a secondary source or a structural inference;
 * 'unverified' = could not be checked.
 */
import type { EvidenceSnapshot } from '../lib/freshness';

const UKGWA = (ts: string, url: string) => `https://tnaqa.mirrorweb.com/ukgwa/${ts}mp_/${url}`;

export const FRESHNESS_EVIDENCE_FIXTURE: EvidenceSnapshot = {
  label: 'Lifecycle evidence audit, 5 Nov 2026 (fixture)',
  generatedAt: '2026-11-05',
  records: [
    // ── NICE CG146 → NG259 ──────────────────────────────────────────────────
    {
      guidelineId: 'nice-osteoporosis-risk-cg146',
      publisher: 'NICE',
      kind: 'archive-snapshot',
      quality: 'confirmed',
      sourceUrl: UKGWA('20261102110904', 'https://www.nice.org.uk/guidance/cg146'),
      accessedAt: '2026-11-05',
      snapshotOf: '2026-11-02T11:09:04Z',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      publishedDate: '2012-08-08',
      lastUpdated: '2017-02-07',
      replacedBy: { identifier: 'NG259', title: 'Osteoporosis: risk assessment', url: 'https://www.nice.org.uk/guidance/ng259' },
    },
    {
      guidelineId: 'nice-osteoporosis-risk-cg146',
      publisher: 'NICE',
      kind: 'publisher-page',
      quality: 'unverified',
      sourceUrl: 'https://www.nice.org.uk/guidance/cg146',
      accessedAt: '2026-11-05',
      stale: true,
      staleReason: 'The direct fetch returned a 2015 surveillance-decision page, not the guidance landing page; the response is treated as a stale or mis-served copy.',
    },
    {
      guidelineId: 'nice-osteoporosis-risk-assessment-ng259',
      title: 'Osteoporosis: risk assessment (NG259)',
      publisher: 'NICE',
      kind: 'archive-snapshot',
      quality: 'confirmed',
      sourceUrl: UKGWA('20261102055745', 'https://www.nice.org.uk/guidance/ng259'),
      accessedAt: '2026-11-05',
      snapshotOf: '2026-11-02T05:57:45Z',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      publishedDate: '2026-07-29',
      lastReviewed: '2026-07-29',
      replacementAnnounced: { description: 'next update to incorporate a multiple technology appraisal', expected: '2027-06' },
    },

    // ── NICE NG59: updated in place, 29 Jul 2026 ─────────────────────────────
    {
      guidelineId: 'nice-low-back-pain-ng59',
      publisher: 'NICE',
      kind: 'archive-snapshot',
      quality: 'confirmed',
      sourceUrl: UKGWA('20261102055807', 'https://www.nice.org.uk/guidance/ng59'),
      accessedAt: '2026-11-05',
      snapshotOf: '2026-11-02T05:58:07Z',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      publishedDate: '2016-11-30',
      lastUpdated: '2026-07-29',
      lastReviewed: '2026-07-29',
    },
    {
      guidelineId: 'nice-low-back-pain-ng59',
      publisher: 'NICE',
      kind: 'secondary-source',
      quality: 'inferred',
      sourceUrl: 'https://www.physitrack.com/en-gb/insights/nice-low-back-pain-guideline-update-2026',
      accessedAt: '2026-11-05',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      lastUpdated: '2026-07-29',
    },

    // ── NICE QS149: updated in place; a stale direct fetch disagreed ─────────
    {
      guidelineId: 'nice-osteoporosis-qs149',
      publisher: 'NICE',
      kind: 'archive-snapshot',
      quality: 'confirmed',
      sourceUrl: UKGWA('20261102095944', 'https://www.nice.org.uk/guidance/qs149'),
      accessedAt: '2026-11-05',
      snapshotOf: '2026-11-02T09:59:44Z',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      publishedDate: '2017-04-28',
      lastUpdated: '2026-07-29',
      lastReviewed: '2026-07-29',
    },
    {
      guidelineId: 'nice-osteoporosis-qs149',
      publisher: 'NICE',
      kind: 'publisher-page',
      quality: 'unverified',
      sourceUrl: 'https://nice.org.uk/guidance/qs149/chapter/Update-information',
      accessedAt: '2026-11-05',
      lastUpdated: '2022-03',
      stale: true,
      staleReason: 'The update-information chapter as fetched listed entries only to March 2022, while a 2 Nov 2026 archive capture of the live page shows a 29 Jul 2026 update.',
    },

    // ── NICE HTG739: identifier migration; catalogue date confirmed ───────────
    {
      guidelineId: 'nice-ai-fracture-detection-htg739',
      publisher: 'NICE',
      kind: 'publisher-page',
      quality: 'confirmed',
      sourceUrl: 'https://www.nice.org.uk/guidance/htg739',
      accessedAt: '2026-11-05',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      publishedDate: '2025-01-14',
      lastReviewed: '2025-01-14',
    },

    // ── NICE TA160/161/204: replacement announced, not published ──────────────
    ...(['nice-raloxifene-ta160', 'nice-raloxifene-teriparatide-ta161', 'nice-denosumab-ta204'] as const).map((id) => ({
      guidelineId: id,
      publisher: 'NICE',
      kind: 'publisher-page' as const,
      quality: 'inferred' as const,
      sourceUrl: UKGWA('20261102055745', 'https://www.nice.org.uk/guidance/ng259'),
      accessedAt: '2026-11-05',
      statement: 'Dated metadata from the supplied audit; publisher quotation omitted.',
      replacementAnnounced: { description: 'multiple technology appraisal expected to replace TA160, TA161 and TA204', expected: '2027-06' },
    })),

    // ── BOA: index labels confirm the catalogue's current and archived links ──
    {
      guidelineId: 'arterial-injury-msk-trauma',
      publisher: 'BOA',
      kind: 'publisher-index',
      quality: 'confirmed',
      sourceUrl: 'https://www.boa.ac.uk/standards-guidance/boasts.html',
      accessedAt: '2026-11-05',
      observedUrl: 'https://www.boa.ac.uk/asset/7E8D1CA3%2D7448%2D47C7%2D84980C6D3E7E96B0/',
      statement: 'Listed under Clinical BOASts, June 2026',
      lastUpdated: '2026-06',
    },
    {
      guidelineId: 'arterial-injury-msk-trauma',
      publisher: 'BOA',
      kind: 'publisher-index',
      quality: 'confirmed',
      sourceUrl: 'https://www.boa.ac.uk/standards-guidance/boasts.html',
      accessedAt: '2026-11-05',
      observedUrl: 'https://www.boa.ac.uk/asset/6C475A69-3056-4149-98DB80A87C962786/',
      statement: 'Listed under Archived Standards, Archived June 2026',
      archived: true,
    },
    {
      guidelineId: 'compartment-syndrome',
      publisher: 'BOA',
      kind: 'publisher-index',
      quality: 'confirmed',
      sourceUrl: 'https://www.boa.ac.uk/standards-guidance/boasts.html',
      accessedAt: '2026-11-05',
      observedUrl: 'https://www.boa.ac.uk/asset/D0432D40%2D5D99%2D4B64%2D9952F6EB1B60C166/',
      statement: 'Listed under Clinical BOASts, Updated July 2025',
      lastUpdated: '2025-07',
    },
    {
      guidelineId: 'compartment-syndrome',
      publisher: 'BOA',
      kind: 'publisher-index',
      quality: 'confirmed',
      sourceUrl: 'https://www.boa.ac.uk/standards-guidance/boasts.html',
      accessedAt: '2026-11-05',
      observedUrl: 'https://www.boa.ac.uk/asset/2A3DBE24-B921-4395-92631F3BE3160528/',
      statement: 'Listed under Archived Standards, Archived July 2025',
      archived: true,
    },

    // ── BSSH: overdue review date and a site-wide revision notice ─────────────
    {
      guidelineId: 'bssh-best-guidelines',
      publisher: 'BSSH',
      kind: 'publisher-page',
      quality: 'confirmed',
      sourceUrl: 'https://www.bssh.ac.uk/professionals/best_guidelines.aspx',
      accessedAt: '2026-11-05',
      statement: 'Page states publication October 2016 and an anticipated review date of October 2021.',
      publishedDate: '2016-10',
      reviewDue: '2021-10',
    },
    {
      guidelineId: '*',
      publisher: 'BSSH',
      scope: 'provider',
      kind: 'publisher-index',
      quality: 'confirmed',
      sourceUrl: 'https://www.bssh.ac.uk/professionals/guidelines.aspx',
      accessedAt: '2026-11-05',
      statement: "The Society's guidelines are undergoing a major revision and will be published when finished.",
    },
  ],
};
