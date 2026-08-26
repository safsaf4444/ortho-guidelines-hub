/**
 * scripts/tests/review-candidates.test.ts
 * ────────────────────────────────────────
 * Offline tests for src/lib/candidates.ts — the normalisation/prefill logic
 * behind the read-only Pending Review UI (src/components/ReviewDashboard.tsx).
 *
 * Pure-function tests only. No DOM, no React renderer is available in this
 * repo (see package.json devDependencies) — ReviewDashboard.tsx and the
 * EditModal read-only gate in src/App.tsx are kept thin wrappers around these
 * functions specifically so the decision logic (which candidates show, what
 * a rejection does, what gets prefilled) is testable without one.
 *
 * Run:   npx tsx scripts/tests/review-candidates.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  candidateToGuidelineDraft,
  changeReasonLabel,
  filterOutRejected,
  normaliseCandidates,
  type CandidatesPayload,
  type ChangeReason,
  type StructuredCandidate,
} from '../../src/lib/candidates';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  check(name, a === e, `expected ${e}, got ${a}`);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', '..', 'src', 'data', 'mock-candidates.json');

console.log('\n[1] Tracked fixture — structured + legacy-fallback + errored report');

const fixture: CandidatesPayload = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
const fromFixture = normaliseCandidates(fixture);

eq('total displayed candidates (2 structured BOA + 2 legacy BESS, GIRFT error skipped)', fromFixture.length, 4);
check('BOA candidates use the structured schema', fromFixture.slice(0, 2).every(c => !c.fromLegacyFallback));
check('BESS candidates came from the legacy fallback', fromFixture.slice(2, 4).every(c => c.fromLegacyFallback));
check(
  'no candidate came from the errored GIRFT report',
  !fromFixture.some(c => c.provider === 'GIRFT'),
);
eq('first structured candidate topic verbatim', fromFixture[0].topic, 'BOAST — Management of Peri-Prosthetic Femoral Fractures');
eq('first structured candidate sourceUrl', fromFixture[0].sourceUrl, 'https://www.boa.ac.uk/uploads/assets/boast-peri-prosthetic-femoral-fractures.pdf');
eq('legacy candidate changeReason defaults to NEW_GUIDELINE', fromFixture[2].changeReason, 'NEW_GUIDELINE');
eq('legacy candidate topic verbatim', fromFixture[2].topic, 'BESS Shoulder Instability Management Guideline');
eq('legacy candidate discoveredAt falls back to report.generatedAt', fromFixture[2].discoveredAt, '2026-08-18T06:00:00.000Z');

console.log('\n[2] normaliseCandidates — schema precedence and edge cases');

function structured(overrides: Partial<StructuredCandidate> = {}): StructuredCandidate {
  return {
    candidateId: 'x-new-guideline-000000000000',
    pipeline: 'sync-providers',
    provider: 'X',
    providerName: 'Example Provider',
    topic: 'Structured topic',
    versions: [{ label: 'PDF', url: 'https://example.test/structured' }],
    primaryUrl: 'https://example.test/structured',
    changeReason: 'NEW_GUIDELINE',
    reviewStatus: 'pending',
    discoveredAt: '2026-08-01T00:00:00.000Z',
    matchedGuidelineId: null,
    providerRef: null,
    ...overrides,
  };
}

// A report carrying BOTH shapes must use structured only — candidates is
// primary, newCandidates is a fallback, never a supplement.
const bothShapes = normaliseCandidates({
  reports: [
    {
      adapter: 'Both-shapes adapter',
      provider: 'X',
      candidates: [structured()],
      newCandidates: [{ topic: 'Should be ignored', source: 'X', versions: [{ label: 'PDF', url: 'https://example.test/ignored' }] }],
    },
  ],
});
eq('report with both shapes yields exactly the structured candidate', bothShapes.length, 1);
eq('report with both shapes uses the structured topic', bothShapes[0].topic, 'Structured topic');

// Explicit empty `candidates: []` must still fall back to newCandidates —
// the fallback condition is "no structured candidates", not "no `candidates` key".
const emptyStructured = normaliseCandidates({
  reports: [
    {
      adapter: 'Empty-structured adapter',
      provider: 'Y',
      candidates: [],
      newCandidates: [{ topic: 'Legacy only', source: 'Y', versions: [{ label: 'PDF', url: 'https://example.test/legacy' }] }],
    },
  ],
});
eq('empty candidates[] still falls back to newCandidates', emptyStructured.length, 1);
check('fallback candidate is flagged as legacy', emptyStructured[0].fromLegacyFallback);

// A report with neither shape (both absent) yields nothing, not a crash.
const neitherShape = normaliseCandidates({ reports: [{ adapter: 'Empty adapter', provider: 'Z' }] });
eq('report with neither shape yields no candidates', neitherShape.length, 0);

// An errored report is skipped even if it also carries stale candidates data.
const erroredWithStaleData = normaliseCandidates({
  reports: [
    { adapter: 'Failed adapter', provider: 'W', candidates: [structured({ provider: 'W' })], error: 'fetch failed' },
  ],
});
eq('errored report contributes no candidates even with stale data present', erroredWithStaleData.length, 0);

// A legacy item with no versions at all must not throw — sourceUrl becomes ''.
const noVersions = normaliseCandidates({
  reports: [
    { adapter: 'No-link adapter', provider: 'V', newCandidates: [{ topic: 'No link here', source: 'V', versions: [] }] },
  ],
});
eq('legacy item with empty versions[] yields empty sourceUrl, not a throw', noVersions[0]?.sourceUrl, '');

// Empty payload (no reports at all) yields no candidates.
eq('payload with no reports array yields no candidates', normaliseCandidates({ reports: [] }).length, 0);

console.log('\n[3] filterOutRejected — pure, order-preserving, non-mutating');

const all = [structured({ candidateId: 'a' }), structured({ candidateId: 'b' }), structured({ candidateId: 'c' })].map(c => ({
  candidateId: c.candidateId,
  topic: c.topic,
  provider: c.provider,
  changeReason: c.changeReason,
  sourceUrl: c.primaryUrl,
  fromLegacyFallback: false,
}));
const rejected = new Set(['b']);
const visible = filterOutRejected(all, rejected);
eq('rejecting one candidate leaves the other two, in order', visible.map(c => c.candidateId), ['a', 'c']);
eq('filterOutRejected does not mutate its input array', all.map(c => c.candidateId), ['a', 'b', 'c']);
eq('rejecting nothing returns every candidate', filterOutRejected(all, new Set()).length, 3);
eq('rejecting everything returns none', filterOutRejected(all, new Set(['a', 'b', 'c'])).length, 0);

console.log('\n[4] candidateToGuidelineDraft — prefill for the Edit modal');

const draft = candidateToGuidelineDraft({
  candidateId: 'boa-new-guideline-abc123',
  topic: 'Draft Topic Verbatim',
  provider: 'BOA',
  changeReason: 'NEW_GUIDELINE',
  sourceUrl: 'https://example.test/draft-source.pdf',
  fromLegacyFallback: false,
});
eq('draft.topic is prefilled verbatim', draft.topic, 'Draft Topic Verbatim');
eq('draft.source is the candidate provider', draft.source, 'BOA');
eq('draft.versions has exactly one entry from sourceUrl', draft.versions, [{ label: 'Source', url: 'https://example.test/draft-source.pdf' }]);
eq('draft.section is left blank for human editorial judgement', draft.section, '');
eq('draft.summary is left blank — never invented from a candidate', draft.summary, '');
check('draft.id is derived from candidateId, not reused as a live guideline id', draft.id === 'candidate-boa-new-guideline-abc123');

const draftNoUrl = candidateToGuidelineDraft({
  candidateId: 'x',
  topic: 'No URL',
  provider: 'X',
  changeReason: 'NEW_GUIDELINE',
  sourceUrl: '',
  fromLegacyFallback: false,
});
eq('draft with no sourceUrl gets an empty versions array, not a broken entry', draftNoUrl.versions, []);

console.log('\n[5] changeReasonLabel — every declared reason has a human label');

const reasons: ChangeReason[] = ['NEW_GUIDELINE', 'REVISED', 'WITHDRAWN', 'CONTENT_DRIFT', 'URL_MOVED', 'UNREACHABLE_LINK'];
const labels = new Set<string>();
for (const r of reasons) {
  const label = changeReasonLabel(r);
  check(`${r}: label is a non-empty string`, typeof label === 'string' && label.trim().length > 0);
  labels.add(label);
}
eq('all six reasons map to distinct labels', labels.size, reasons.length);
eq('unknown reason falls back to the raw value rather than throwing', changeReasonLabel('SOMETHING_NEW' as ChangeReason), 'SOMETHING_NEW');

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
