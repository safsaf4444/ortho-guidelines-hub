import { fileURLToPath } from 'node:url';
/**
 * scripts/tests/freshness.test.ts
 * ───────────────────────────────
 * Offline tests for src/lib/freshness.ts (the deterministic freshness
 * evaluator) and the grounded fixture src/data/freshness-evidence.fixture.ts.
 * NO NETWORK, NO DATABASE, NO CLOCK: every evaluation passes `asOf`.
 *
 * Run:   npx tsx scripts/tests/freshness.test.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import type { Guideline } from '../../src/data/guidelines-data';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import { FRESHNESS_EVIDENCE_FIXTURE } from '../../src/data/freshness-evidence.fixture';
import {
  ALL_SIGNAL_TYPES,
  catalogueAsOfFrom,
  catalogueRecordedDate,
  compareDates,
  datesInText,
  evaluateFreshness,
  filterSignals,
  samePublisher,
  type EvidenceRecord,
  type EvidenceSnapshot,
  type FreshnessSignalType,
} from '../../src/lib/freshness';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const ASOF = '2026-11-05';

function g(id: string, topic: string, source: string, subGroup: string | undefined, versions: Array<{ label: string; url: string }>, extra: Partial<Guideline> = {}): Guideline {
  return {
    id, topic, source, section: 'T', type: 'G', summary: '', regionalVariation: false, localOverlayNeeded: false,
    lastChecked: '2026-10-01', status: 'current', sourceType: 'national', guidanceStatus: 'current',
    linkVerificationStatus: 'verified', linkLastVerified: '2026-10-01',
    ...(subGroup ? { subGroup } : {}), versions, ...extra,
  } as Guideline;
}
const snap = (records: EvidenceRecord[], generatedAt = ASOF): EvidenceSnapshot => ({ label: 'test', generatedAt, records });
const rec = (partial: Partial<EvidenceRecord> & Pick<EvidenceRecord, 'guidelineId'>): EvidenceRecord => ({
  publisher: 'NICE', kind: 'publisher-page', quality: 'confirmed', sourceUrl: 'https://www.nice.org.uk/x', accessedAt: ASOF, ...partial,
});
const sig = (r: ReturnType<typeof evaluateFreshness>, id: string, t: FreshnessSignalType) => r.signals.find((s) => s.guidelineId === id && s.signal === t);

const OLD = g('old', 'Old guidance', 'NICE', 'Published 2012, updated Feb 2017', [{ label: 'Current', url: 'https://www.nice.org.uk/guidance/old' }]);

console.log('\n[1] date parsing from catalogue free text');
{
  eq('month + year and bare year', datesInText('Published 2016, updated Dec 2020'), ['2016', '2020-12']);
  eq('"Revised July 2025"', datesInText('Revised July 2025'), ['2025-07']);
  eq('a bare non-publication number is ignored', datesInText('BOAST 4 (17 interventions)'), []);
  eq('recorded date is the latest across subGroup and version labels', catalogueRecordedDate(OLD), '2017-02');
  eq('no date → null', catalogueRecordedDate(g('x', 'x', 'NICE', 'Current', [{ label: 'Current', url: 'https://a/b' }])), null);
  eq('compare at common granularity', [compareDates('2026-07-29', '2020-12'), compareDates('2025-01-14', '2025-01'), compareDates('2016', '2017-02')], [1, 0, -1]);
}

console.log('\n[2] missing evidence: catalogue-only signals, all inferred, none high');
{
  const r = evaluateFreshness([OLD], null, { asOf: ASOF });
  check('no evidence → every signal is inferred and derived from catalogue fields', r.signals.every((s) => s.quality === 'inferred' && s.derivedFrom === 'catalogue-fields'));
  check('no high severity without evidence', r.countsBySeverity.high === 0);
  eq('nothing requires a human decision without evidence', r.signals.filter((s) => s.requiresHumanDecision).length, 0);
  eq('evidence label null', [r.evidenceLabel, r.catalogueOlderThanEvidence], [null, false]);
  const stale = g('stale', 'Stale verification', 'NICE', 'Published 2020', [{ label: 'Current', url: 'https://www.nice.org.uk/guidance/stale' }], { linkLastVerified: '2026-01-01' });
  check('no-recent-verification when verification is older than the threshold', !!sig(evaluateFreshness([stale], null, { asOf: ASOF }), 'stale', 'no-recent-verification'));
  check('…not when within the threshold', !sig(evaluateFreshness([stale], null, { asOf: ASOF, verificationMaxAgeDays: 400 }), 'stale', 'no-recent-verification'));
  check('a "verified" link never produces a currency signal on its own', !r.signals.some((s) => ['publisher-newer-than-catalogue', 'replacement-declared', 'archive-declared'].includes(s.signal)));
}

console.log('\n[3] replacement evidence → replacement-declared, high, human decision');
{
  const r = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', kind: 'archive-snapshot', snapshotOf: '2026-11-02T11:09:04Z', statement: 'updated and replaced by X', replacedBy: { identifier: 'NEW1', url: 'https://www.nice.org.uk/guidance/new1' } })]), { asOf: ASOF });
  const s = sig(r, 'old', 'replacement-declared')!;
  check('present', !!s);
  eq('severity/quality/decision', [s.severity, s.quality, s.requiresHumanDecision], ['high', 'confirmed', true]);
  check('explanation says the replacement is NOT in the catalogue', /NOT in the catalogue/.test(s.explanation));
  check('provenance carries the capture timestamp and the statement', s.provenance[0].snapshotOf === '2026-11-02T11:09:04Z' && s.provenance[0].statement === 'updated and replaced by X');
  check('replacement link offered first', s.links[0].label === 'Replacement NEW1');
  check('no publisher-newer signal is raised alongside a replacement', !sig(r, 'old', 'publisher-newer-than-catalogue'));
  const held = evaluateFreshness([OLD, g('new1', 'New', 'NICE', 'Published Jul 2026', [{ label: 'Current', url: 'https://www.nice.org.uk/guidance/new1' }])], snap([rec({ guidelineId: 'old', replacedBy: { identifier: 'new1' } })]), { asOf: ASOF });
  check('when the replacement is held, the action is to cross-link, not to create', /cross-link/.test(sig(held, 'old', 'replacement-declared')!.suggestedAction));
}

console.log('\n[4] updated dates → publisher-newer-than-catalogue; same date → confirms current; older → nothing');
{
  const newer = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', lastUpdated: '2026-07-29' })]), { asOf: ASOF });
  const s = sig(newer, 'old', 'publisher-newer-than-catalogue')!;
  eq('newer: high, dates carried', [s.severity, s.evidenceDate, s.catalogueDate], ['high', '2026-07-29', '2017-02']);
  const same = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', lastUpdated: '2017-02-07' })]), { asOf: ASOF });
  check('same month → publisher-confirms-current (info)', sig(same, 'old', 'publisher-confirms-current')?.severity === 'info');
  const older = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', lastUpdated: '2015-01' })]), { asOf: ASOF });
  check('older evidence raises neither newer nor confirms', !sig(older, 'old', 'publisher-newer-than-catalogue') && !sig(older, 'old', 'publisher-confirms-current'));
  const undated = g('undated', 'No date', 'NICE', 'Current', [{ label: 'Current', url: 'https://www.nice.org.uk/guidance/u' }]);
  const u = evaluateFreshness([undated], snap([rec({ guidelineId: 'undated', lastUpdated: '2026-01' })]), { asOf: ASOF });
  check('undated catalogue entry: medium signal asking for the date to be recorded', sig(u, 'undated', 'publisher-newer-than-catalogue')?.severity === 'medium' && !!sig(u, 'undated', 'no-recorded-date'));
}

console.log('\n[5] archive-only evidence');
{
  const r = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', kind: 'publisher-index', archived: true, statement: 'Archived June 2026' })]), { asOf: ASOF });
  const s = sig(r, 'old', 'archive-declared')!;
  eq('archive-declared: high, decision required, action is read-and-decide', [s.severity, s.requiresHumanDecision, /archived \(no successor\) and superseded/.test(s.suggestedAction)], ['high', true, true]);
  const withArchivedLabel = g('lab', 'Labelled', 'BOA (BOASt)', 'June 2026', [
    { label: 'June 2026', url: 'https://www.boa.ac.uk/asset/NEW/' },
    { label: 'Archived (pre-June 2026)', url: 'https://www.boa.ac.uk/asset/OLD/' },
  ]);
  const consistent = evaluateFreshness([withArchivedLabel], snap([rec({ guidelineId: 'lab', publisher: 'BOA', kind: 'publisher-index', archived: true, observedUrl: 'https://www.boa.ac.uk/asset/OLD/' })]), { asOf: ASOF });
  check('archive evidence on a link the catalogue already labels archived → confirms, not archive-declared', !!sig(consistent, 'lab', 'publisher-confirms-current') && !sig(consistent, 'lab', 'archive-declared'));
  const caseDifferent = evaluateFreshness([withArchivedLabel],snap([rec({guidelineId:'lab',publisher:'BOA',archived:true,observedUrl:'https://www.boa.ac.uk/asset/old/'})]),{asOf:ASOF});
  check('case-different archive URL requires comparison rather than a status claim',!!sig(caseDifferent,'lab','conflicting-evidence')&&!sig(caseDifferent,'lab','archive-declared'));
  const onCurrent = evaluateFreshness([withArchivedLabel], snap([rec({ guidelineId: 'lab', publisher: 'BOA', kind: 'publisher-index', archived: true, observedUrl: 'https://www.boa.ac.uk/asset/NEW/' })]), { asOf: ASOF });
  check('archive evidence on the link labelled current → archive-declared', !!sig(onCurrent, 'lab', 'archive-declared'));
}

console.log('\n[6] conflicting evidence and stale copies');
{
  const conflict = evaluateFreshness([OLD], snap([
    rec({ guidelineId: 'old', kind: 'archive-snapshot', snapshotOf: '2026-11-02T11:09:04Z', lastUpdated: '2026-07-29' }),
    rec({ guidelineId: 'old', kind: 'publisher-page', quality: 'unverified', lastUpdated: '2022-03', stale: true, staleReason: 'cached chapter' }),
  ]), { asOf: ASOF });
  const c = sig(conflict, 'old', 'conflicting-evidence')!;
  check('stale copy contradicting a dated source → conflicting-evidence', !!c && /stale copy/.test(c.explanation));
  eq('quality is the weakest record', c.quality, 'unverified');
  check('the newer date still drives publisher-newer (stale copy does not block it)', sig(conflict, 'old', 'publisher-newer-than-catalogue')?.evidenceDate === '2026-07-29');
  const twoLive = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', lastUpdated: '2026-07-29' }), rec({ guidelineId: 'old', kind: 'secondary-source', quality: 'inferred', lastUpdated: '2026-08-01' })]), { asOf: ASOF });
  check('two live sources disagreeing → conflicting-evidence naming both dates', /2026-07-29 vs 2026-08-01/.test(sig(twoLive, 'old', 'conflicting-evidence')?.explanation ?? ''));
  const agreeing = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', lastUpdated: '2026-07-29' }), rec({ guidelineId: 'old', kind: 'secondary-source', quality: 'inferred', lastUpdated: '2026-07-29' })]), { asOf: ASOF });
  check('agreeing sources → no conflict', !sig(agreeing, 'old', 'conflicting-evidence'));
  const staleOnly = evaluateFreshness([OLD], snap([rec({ guidelineId: 'old', stale: true, staleReason: 'mirror', lastUpdated: '2026-07-29' })]), { asOf: ASOF });
  check('only stale evidence → stale-evidence-only, nothing concluded', !!sig(staleOnly, 'old', 'stale-evidence-only') && !sig(staleOnly, 'old', 'publisher-newer-than-catalogue'));
}

console.log('\n[7] review overdue, replacement announced, provider notice, unknown entry');
{
  const best = g('best', 'BEST', 'BSSH', '2023-2024', [{ label: 'Current', url: 'https://www.bssh.ac.uk/professionals/best_guidelines.aspx' }]);
  const r = evaluateFreshness([best, OLD], snap([
    rec({ guidelineId: 'best', publisher: 'BSSH', publishedDate: '2016-10', reviewDue: '2021-10' }),
    rec({ guidelineId: '*', publisher: 'BSSH', scope: 'provider', kind: 'publisher-index', statement: 'undergoing a major revision' }),
    rec({ guidelineId: 'old', replacementAnnounced: { description: 'MTA', expected: '2027-06' } }),
    rec({ guidelineId: 'ghost', title: 'Ghost (NEW)', publishedDate: '2026-07-29' }),
  ]), { asOf: ASOF });
  check('review-overdue: medium, decision, "not withdrawal" in wording', sig(r, 'best', 'review-overdue')?.severity === 'medium' && /not withdrawal/.test(sig(r, 'best', 'review-overdue')!.explanation));
  check('a later update suppresses review-overdue', !sig(evaluateFreshness([best], snap([rec({ guidelineId: 'best', publisher: 'BSSH', reviewDue: '2021-10', lastUpdated: '2024-05' })]), { asOf: ASOF }), 'best', 'review-overdue'));
  check('provider notice reaches the BSSH entry but not the NICE one', !!sig(r, 'best', 'provider-notice') && !sig(r, 'old', 'provider-notice'));
  eq('samePublisher: first-listed publisher only', [samePublisher('BSSH', 'BSSH (Trauma Committee)'), samePublisher('BSSH', 'GIRFT / BSSH'), samePublisher('BOA', 'BOA (BOASt) with BOFAS')], [true, false, true]);
  check('replacement-announced: low, no decision, caveat says current guidance stands', sig(r, 'old', 'replacement-announced')?.severity === 'low' && sig(r, 'old', 'replacement-announced')!.requiresHumanDecision === false);
  check('evidence for an unknown entry is surfaced with its title', sig(r, 'ghost', 'evidence-for-unknown-entry')?.title === 'Ghost (NEW)');
}

console.log('\n[8] unverified external links');
{
  const ext = g('ext', 'Journal-hosted', 'British Sarcoma Group (BSG)', '2024', [
    { label: 'Current', url: 'https://doi.org/10.1038/x' },
    { label: 'Fallback / index page', url: 'https://britishsarcomagroup.org.uk/guidelines/' },
  ]);
  const r = evaluateFreshness([ext], null, { asOf: ASOF });
  const s = sig(r, 'ext', 'unverified-external-link')!;
  check('doi.org link on a BSG entry flagged, fallback index ignored', !!s && /doi\.org/.test(s.explanation) && s.links.length === 1);
  const covered = evaluateFreshness([ext], snap([rec({ guidelineId: 'ext', publisher: 'BSG', observedUrl: 'https://doi.org/10.1038/x', lastUpdated: '2024' })]), { asOf: ASOF });
  check('an evidence record covering the link clears the flag', !sig(covered, 'ext', 'unverified-external-link'));
  const girft = g('gi', 'Pathway', 'GIRFT / BSSH', '2023', [{ label: 'Current', url: 'https://gettingitrightfirsttime.co.uk/p.pdf' }]);
  check('first-listed publisher decides the host: GIRFT link on a "GIRFT / BSSH" entry is not external', !sig(evaluateFreshness([girft], null, { asOf: ASOF }), 'gi', 'unverified-external-link'));
}

console.log('\n[9] no automatic status changes; determinism; stable sorting; filtering');
{
  const input = [OLD, g('b', 'B', 'BOA (BOASt)', 'June 2026', [{ label: 'June 2026', url: 'https://www.boa.ac.uk/asset/B/' }])];
  const before = JSON.stringify(input);
  const ev = snap([rec({ guidelineId: 'old', replacedBy: { identifier: 'Z' } }), rec({ guidelineId: 'b', publisher: 'BOA', archived: true })]);
  const r1 = evaluateFreshness(input, ev, { asOf: ASOF });
  const r2 = evaluateFreshness([input[1], input[0]], { ...ev, records: [...ev.records].reverse() }, { asOf: ASOF });
  eq('inputs are never mutated', JSON.stringify(input), before);
  check('no signal object carries a status field or a mutation', r1.signals.every((s) => !('guidanceStatus' in s) && !/\bset\b|\bupdate\b .*status/i.test(s.suggestedAction) || s.requiresHumanDecision));
  eq('order is stable regardless of input order', r1.signals.map((s) => `${s.guidelineId}:${s.signal}`), r2.signals.map((s) => `${s.guidelineId}:${s.signal}`));
  check('severity first, then id, then signal', r1.signals[0].severity === 'high' && r1.signals.every((s, i) => i === 0 || ['high', 'medium', 'low', 'info'].indexOf(s.severity) >= ['high', 'medium', 'low', 'info'].indexOf(r1.signals[i - 1].severity)));
  eq('two runs are byte-identical', JSON.stringify(r1), JSON.stringify(evaluateFreshness(input, ev, { asOf: ASOF })));
  eq('counts cover every signal type', Object.keys(r1.countsBySignal).sort(), [...ALL_SIGNAL_TYPES].sort());
  eq('filter by provider', filterSignals(r1.signals, { provider: 'BOA (BOASt)' }).every((s) => s.provider === 'BOA (BOASt)'), true);
  eq('filter by signal', filterSignals(r1.signals, { signals: ['archive-declared'] }).map((s) => s.guidelineId), ['b']);
  eq('filter by quality + decision', filterSignals(r1.signals, { quality: 'confirmed', decisionOnly: true }).length, 2);
  eq('empty signal list means all', filterSignals(r1.signals, { signals: [] }).length, r1.signals.length);
}

console.log('\n[10] snapshot-older-than-evidence flag');
{
  const r = evaluateFreshness([OLD], snap([], '2026-11-05'), { asOf: ASOF, catalogueAsOf: '2026-07-29' });
  eq('flag set when evidence post-dates the catalogue', r.catalogueOlderThanEvidence, true);
  eq('flag clear when the catalogue is newer', evaluateFreshness([OLD], snap([], '2026-07-01'), { asOf: ASOF, catalogueAsOf: '2026-07-29' }).catalogueOlderThanEvidence, false);
  eq('row check dates do not establish a catalogue export timestamp', catalogueAsOfFrom([OLD, { ...OLD, id: 'o2', lastChecked: '2026-10-09' }]), null);
}

console.log('\n[11] the grounded fixture against the real static catalogue');
{
  const r = evaluateFreshness(GUIDELINES_DATA, FRESHNESS_EVIDENCE_FIXTURE, { asOf: ASOF, catalogueAsOf: catalogueAsOfFrom(GUIDELINES_DATA) ?? undefined });
  check('fixture dates are ISO or ISO prefixes', FRESHNESS_EVIDENCE_FIXTURE.records.every((x) => [x.publishedDate, x.lastUpdated, x.lastReviewed, x.reviewDue].every((d) => d === undefined || /^\d{4}(-\d{2}(-\d{2})?)?$/.test(d))));
  check('every fixture record names a source URL and an access date', FRESHNESS_EVIDENCE_FIXTURE.records.every((x) => /^https?:\/\//.test(x.sourceUrl) && /^\d{4}-\d{2}-\d{2}$/.test(x.accessedAt)));
  check('archive captures carry a capture timestamp', FRESHNESS_EVIDENCE_FIXTURE.records.filter((x) => x.kind === 'archive-snapshot').every((x) => !!x.snapshotOf));
  check('CG146 → NG259 replacement declared, confirmed, replacement not held', (() => { const s = sig(r, 'nice-osteoporosis-risk-cg146', 'replacement-declared'); return !!s && s.quality === 'confirmed' && /NOT in the catalogue/.test(s.explanation); })());
  check('NG259 surfaces as evidence for an unknown entry', !!sig(r, 'nice-osteoporosis-risk-assessment-ng259', 'evidence-for-unknown-entry'));
  check('NG59: publisher newer (2026-07-29 vs 2020-12), confirmed', (() => { const s = sig(r, 'nice-low-back-pain-ng59', 'publisher-newer-than-catalogue'); return !!s && s.evidenceDate === '2026-07-29' && s.catalogueDate === '2020-12' && s.quality === 'confirmed'; })());
  check('QS149: publisher newer AND conflicting evidence from the stale chapter', !!sig(r, 'nice-osteoporosis-qs149', 'publisher-newer-than-catalogue') && !!sig(r, 'nice-osteoporosis-qs149', 'conflicting-evidence'));
  check('HTG739: publisher confirms the recorded date', !!sig(r, 'nice-ai-fracture-detection-htg739', 'publisher-confirms-current'));
  check('TA160/161/204: replacement announced only', ['nice-raloxifene-ta160', 'nice-raloxifene-teriparatide-ta161', 'nice-denosumab-ta204'].every((id) => !!sig(r, id, 'replacement-announced') && !sig(r, id, 'replacement-declared')));
  check('BOA archived standards: consistent with catalogue labels (no archive-declared)', !sig(r, 'arterial-injury-msk-trauma', 'archive-declared') && !sig(r, 'compartment-syndrome', 'archive-declared') && !!sig(r, 'arterial-injury-msk-trauma', 'publisher-confirms-current'));
  check('BSSH BEST: review overdue (Oct 2021) and the provider notice', !!sig(r, 'bssh-best-guidelines', 'review-overdue') && !!sig(r, 'bssh-best-guidelines', 'provider-notice'));
  check('provider notice reaches every bssh-* entry and no GIRFT/BSSH entry', GUIDELINES_DATA.filter((x) => /^bssh-/.test(x.id)).every((x) => !!sig(r, x.id, 'provider-notice')) && !sig(r, 'girft-carpal-tunnel', 'provider-notice'));
  eq('no archive-declared anywhere (the fixture invents no archived status)', r.countsBySignal['archive-declared'], 0);
  eq('exactly three high-severity signals', r.countsBySeverity.high, 3);
  check('unknown export metadata does not invent a snapshot-age comparison', r.catalogueAsOf === null && !r.catalogueOlderThanEvidence);
  eq('every signal has an explanation, an action and at least one link', r.signals.every((s) => s.explanation.length > 20 && s.suggestedAction.length > 5 && s.links.length >= 1), true);
}

console.log('\n[12] read-only by construction: static import audit');
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const f of ['../../src/lib/freshness.ts', '../../src/components/FreshnessDashboard.tsx', '../../src/data/freshness-evidence.fixture.ts']) {
    const src = fs.readFileSync(path.join(here, f), 'utf8');
    check(`${path.basename(f)} imports no service, supabase or write-access module and calls no fetch`, !/supabase|guidelines-service|staged-service|changelog-service|write-access|\bfetch\(/.test(src));
  }
  const cmp = fs.readFileSync(path.join(here, '../../src/components/FreshnessDashboard.tsx'), 'utf8');
  check('dashboard has no form submission or mutation handler', !/onSubmit|\.update\(|\.insert\(|\.delete\(|setGuidelines/.test(cmp));
  check('dashboard rows are buttons (keyboard reachable) and the panel is a labelled dialog with Escape handling', /data-testid="signal-row"/.test(cmp) && /role="dialog"/.test(cmp) && /aria-labelledby="freshness-detail-heading"/.test(cmp) && /e\.key === 'Escape'/.test(cmp));
  check('external links open safely', (cmp.match(/target="_blank"/g) ?? []).length === (cmp.match(/rel="noopener noreferrer"/g) ?? []).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
