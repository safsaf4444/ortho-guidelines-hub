/**
 * scripts/tests/stage-discovery.test.ts
 * ─────────────────────────────────────
 * Offline tests for the discovery staging adapter (scripts/stage-discovery.ts)
 * and the provider ownership table (scripts/lib/staging-ownership.ts). No
 * database: the adapter's behaviour against one is tested by
 * scripts/tests/local-supabase/discovery-adapter.ts.
 *
 * Run:   npx tsx scripts/tests/stage-discovery.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  canonicalJson, classifyResponse, DEFAULT_TIMEOUT_MS, main, parseArgs, parseReport, planReport, runIdentity, toPayload, validateCandidate,
  type DiscoveryReportFile,
} from '../stage-discovery';
import { checkOwnership, STAGING_OWNERSHIP } from '../lib/staging-ownership';
import { PROVIDER_REGISTRY } from '../lib/provider-registry';
import { documentIdentityKey } from '../lib/ingestion';
import type { DiscoveryCandidate } from '../lib/discovery-classification';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ''}`); }
}
const eq = (name: string, a: unknown, e: unknown) => check(name, JSON.stringify(a) === JSON.stringify(e), `expected ${JSON.stringify(e)}, got ${JSON.stringify(a)}`);

const SWEEP = '2026-10-24T00:45:41.732Z';
function cand(over: Partial<DiscoveryCandidate> & { discoveryId: string; discoveredUrl: string }): DiscoveryCandidate {
  return {
    provider: 'NHS EBI', providerName: 'NHS Evidence-Based Interventions', surface: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal/',
    topic: 'Synthetic', urlAlternatives: [], statedLabels: [{ origin: 'page-body', value: 'Published: 1 May 2024', readFrom: 'https://ebi.aomrc.org.uk/x', fieldLabel: 'Published' }],
    classification: 'NEW_GUIDELINE', matchedGuidelineId: null, verificationRequired: false, discoveredAt: SWEEP, notes: 'n',
    ...over,
  };
}
function report(providers: DiscoveryReportFile['reports'], generatedAt = SWEEP): DiscoveryReportFile {
  return { schemaVersion: 1, generatedAt, reports: providers };
}

console.log('\nprovider ownership');
const syncSrc = readFileSync('scripts/sync-providers.ts', 'utf8');
const syncTags = [...syncSrc.matchAll(/sourceTag: '([^']+)'/g)].map((m) => m[1]);
check('found the sync-providers adapters', syncTags.length >= 4, syncTags.join(','));
for (const t of syncTags) eq(`sync-providers adapter ${t} is owned by sync-providers`, STAGING_OWNERSHIP[t]?.producer, 'sync-providers');
for (const e of PROVIDER_REGISTRY.filter((x) => x.participation === 'active')) {
  check(`active discovery provider ${e.key} has a staging owner`, STAGING_OWNERSHIP[e.key] !== undefined);
}
eq('BOFAS stays with sync-providers', STAGING_OWNERSHIP.BOFAS.producer, 'sync-providers');
eq('…its transition to discovery is pending, not active', STAGING_OWNERSHIP.BOFAS.pendingTransition?.status, 'awaiting-approval');
check('exactly one producer per provider (a table, so by construction)', Object.values(STAGING_OWNERSHIP).every((o) => o.producer === 'sync-providers' || o.producer === 'discover'));
eq('discover may stage NHS EBI', checkOwnership('NHS EBI', 'discover').ok, true);
eq('discover may NOT stage BOFAS', (checkOwnership('BOFAS', 'discover') as { status?: string }).status, 'not-owner');
eq('sync-providers may NOT stage BESS', (checkOwnership('BESS', 'sync-providers') as { status?: string }).status, 'not-owner');
eq('an unknown provider is unowned for both', [(checkOwnership('ROS', 'discover') as { status?: string }).status, (checkOwnership('ROS', 'sync-providers') as { status?: string }).status], ['unowned', 'unowned']);
eq('a prototype key is not an owner', (checkOwnership('toString', 'discover') as { status?: string }).status, 'unowned');
const stageSrc = readFileSync('scripts/stage-candidates.ts', 'utf8');
check('stage-candidates.ts consults the table as sync-providers', /checkOwnership\(c\.provider, 'sync-providers'\)/.test(stageSrc));
check('stage-discovery.ts consults the table as discover', /checkOwnership\(c\.provider, 'discover'\)/.test(readFileSync('scripts/stage-discovery.ts', 'utf8')));

console.log('\narguments: dry run by default, explicit write and target');
eq('a report path alone is a dry run', [parseArgs(['r.json']).write, parseArgs(['r.json']).error], [false, undefined]);
check('--write without --target is refused', /needs --target/.test(parseArgs(['r.json', '--write']).error ?? ''));
check('--compare-sync cannot be combined with --write', /dry-run comparison/.test(parseArgs(['r.json', '--write', '--target', 'http://127.0.0.1:1', '--compare-sync', 'c.json']).error ?? ''));
check('an unknown option is refused', /unknown option/.test(parseArgs(['r.json', '--force']).error ?? ''));
check('no report is refused', /report path is required/.test(parseArgs([]).error ?? ''));
const adapterSrc = readFileSync('scripts/stage-discovery.ts', 'utf8');
check('the adapter never loads dotenv', !/dotenv/.test(adapterSrc));
check('the adapter never reads SUPABASE_URL or VITE_ variables (no URL fallback)', !/process\.env\.(SUPABASE_URL|VITE_)/.test(adapterSrc));
check('the client is created only inside the write branch', /if \(args\.write\) \{[\s\S]*createClient\(/.test(adapterSrc) && (adapterSrc.match(/createClient\(/g) ?? []).length === 1);

console.log('\nreport parsing');
eq('wrong schema version is refused', parseReport(JSON.stringify({ schemaVersion: 2, reports: [] })).ok, false);
eq('non-JSON is refused', parseReport('{').ok, false);
eq('missing candidates is refused', parseReport(JSON.stringify({ schemaVersion: 1, reports: [{ provider: 'X' }] })).ok, false);

console.log('\nplanning (no database)');
const ebiNew = cand({ discoveryId: 'ebi-new', discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/Some-New/' });
const ebiEd = cand({ discoveryId: 'ebi-ed', discoveredUrl: 'https://ebi.aomrc.org.uk/interventions/edition/', classification: 'POSSIBLE_NEW_EDITION', matchedGuidelineId: 'ankle-fracture',
  softMatch: { guidelineId: 'ankle-fracture', guidelineTopic: 't', guidelineSource: 's', titleSimilarity: 0.7, sharedTitleTokens: [], sharedPublishers: [], discoveredPublishers: [], publishersFromTitle: [], cataloguePublishers: [], statement: 's' } });
const plan = planReport(report([
  { provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew, ebiEd, { ...ebiNew }],
    surfaces: [{ url: 'https://ebi.aomrc.org.uk/specialty/retired-guidance/', retirementAssertions: [{ url: 'https://ebi.aomrc.org.uk/x/', topic: 'Retired', guidelineId: 'g1', statement: 's' }] }] },
  { provider: 'BOFAS', outcome: 'ok', candidates: [cand({ discoveryId: 'bofas-1', provider: 'BOFAS', discoveredUrl: 'https://www.bofas.org.uk/a.pdf' })] },
  { provider: 'ROS', outcome: 'ok', candidates: [cand({ discoveryId: 'ros-1', provider: 'ROS', discoveredUrl: 'https://ros.example/a.pdf' })] },
  { provider: 'BASK', outcome: 'failed', outcomeReason: '403', candidates: [cand({ discoveryId: 'bask-1', provider: 'BASK', discoveredUrl: 'https://bask.example/a.pdf' })] },
  { provider: 'BESS', outcome: 'ok', candidates: [
    cand({ discoveryId: 'bess-ret', provider: 'BESS', discoveredUrl: 'https://bess.ac.uk/r.pdf', classification: 'PUBLISHER_ASSERTED_RETIREMENT' as never }),
    { ...cand({ discoveryId: 'bess-bad', provider: 'BESS', discoveredUrl: 'https://bess.ac.uk/b.pdf' }), surface: '' },
  ] },
]));
eq('submitted: the two discovery-owned candidates', plan.submit.map((s) => s.payload.discoveryId), ['ebi-new', 'ebi-ed']);
eq('an identical repeat of a discoveryId is listed as duplicate, submitted once', plan.notSubmitted.filter((r) => r.outcome === 'duplicate').map((r) => [r.discoveryId, r.position]), [['ebi-new', 'NHS EBI#2']]);
const why = Object.fromEntries(plan.notSubmitted.map((r) => [r.discoveryId, r.outcome]));
eq('BOFAS: not-owner', why['bofas-1'], 'not-owner');
eq('…and offered as a dry-run transition preview', plan.transitionPreview.map((p) => p.provider), ['BOFAS']);
eq('ROS (no owner): unowned', why['ros-1'], 'unowned');
eq('a failed provider run: provider-not-ok', why['bask-1'], 'provider-not-ok');
eq('a class outside the three: unsupported, never submitted', why['bess-ret'], 'unsupported');
eq('a malformed candidate: invalid (not unsupported)', why['bess-bad'], 'invalid');
eq('retirement assertions are collected as report-only', plan.retirements.map((r) => r.guidelineId), ['g1']);
eq('every input is accounted for, each listed once (8)', plan.submit.length + plan.notSubmitted.length, 8);

console.log('\nvalidation before any database contact');
const bad = (label: string, raw: unknown, expect: RegExp) => {
  const errs = validateCandidate(raw);
  check(`${label}: invalid`, errs.some((e) => expect.test(e)), JSON.stringify(errs));
};
eq('a well-formed NEW_GUIDELINE is valid', validateCandidate(ebiNew), []);
eq('a well-formed POSSIBLE_NEW_EDITION is valid', validateCandidate(ebiEd), []);
for (const raw of [null, 42, 'text', [1, 2]]) bad(`a non-object entry (${JSON.stringify(raw)})`, raw, /not an object/);
bad('discoveredAt not a timestamp', { ...ebiNew, discoveredAt: 'last Tuesday' }, /discoveredAt/);
bad('discoveredAt without a time zone', { ...ebiNew, discoveredAt: '2026-10-24T00:45:41' }, /discoveredAt/);
bad('discoveredAt an impossible date', { ...ebiNew, discoveredAt: '2026-13-45T99:00:00Z' }, /discoveredAt/);
bad('statedLabels not an array', { ...ebiNew, statedLabels: { value: 'x' } }, /statedLabels must be an array/);
bad('a stated label of the wrong shape', { ...ebiNew, statedLabels: [{ origin: 'guess', value: 'x', readFrom: 'https://a.b/' }] }, /statedLabels\[0\]/);
bad('urlAlternatives missing', { ...ebiNew, urlAlternatives: undefined }, /urlAlternatives must be an array/);
bad('an alternative without a URL', { ...ebiNew, urlAlternatives: [{ relation: 'redirect-target', scope: 'document' }] }, /urlAlternatives\[0\]/);
bad('discoveredUrl not a URL', { ...ebiNew, discoveredUrl: 'not a url' }, /discoveredUrl/);
bad('a missing topic', { ...ebiNew, topic: '' }, /topic/);
bad('NEW_GUIDELINE naming an entry', { ...ebiNew, matchedGuidelineId: 'x' }, /must not name/);
bad('NEW_GUIDELINE carrying softMatch', { ...ebiNew, softMatch: ebiEd.softMatch }, /carries no softMatch/);
bad('edition without softMatch', { ...ebiEd, softMatch: undefined }, /needs softMatch/);
bad('edition softMatch naming another entry', { ...ebiEd, softMatch: { ...ebiEd.softMatch!, guidelineId: 'other' } }, /needs softMatch/);
bad('edition titleSimilarity out of range', { ...ebiEd, softMatch: { ...ebiEd.softMatch!, titleSimilarity: 7 } }, /needs softMatch/);
const tokOk = cand({ discoveryId: 't', classification: 'EDITION_TOKEN_CHANGED', matchedGuidelineId: 'x', discoveredUrl: 'https://a.b/doc?ver=2',
  tokenChange: { parameter: 'ver', previousValue: '1', observedValue: '2', previousObservedAt: 'p', guidelineId: 'x', statement: 's' } });
eq('a well-formed EDITION_TOKEN_CHANGED is valid', validateCandidate(tokOk), []);
bad('token change with equal values', { ...tokOk, tokenChange: { ...tokOk.tokenChange!, observedValue: '1' } }, /needs tokenChange/);
bad('token change without its evidence', { ...tokOk, tokenChange: undefined }, /needs tokenChange/);
const vplan = planReport(report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [null, { ...ebiNew, discoveryId: 'v2', discoveredAt: 'soon' }, ebiNew] }]));
eq('planning: invalid entries itemised with position, nothing about them submitted',
  vplan.notSubmitted.map((r) => [r.position, r.outcome, r.discoveryId]), [['NHS EBI#0', 'invalid', '(none)'], ['NHS EBI#1', 'invalid', 'v2']]);
eq('…the valid entry beside them is still planned', vplan.submit.map((x) => x.payload.discoveryId), ['ebi-new']);

console.log('\nduplicate ids: identical collapse, different content is a conflict');
const cplan = planReport(report([
  { provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew, { ...ebiNew, topic: 'Different title' }, ebiEd, { ...ebiEd }, { ...ebiEd }] },
]));
eq('different content under one id: every copy is a conflict, none submitted',
  cplan.notSubmitted.filter((r) => r.outcome === 'conflict').map((r) => r.position), ['NHS EBI#0', 'NHS EBI#1']);
check('…the conflict names every position', /NHS EBI#0, NHS EBI#1/.test(cplan.notSubmitted.find((r) => r.outcome === 'conflict')?.detail ?? ''));
eq('identical copies: the first submitted, each repeat listed', [cplan.submit.map((x) => x.result.position), cplan.notSubmitted.filter((r) => r.outcome === 'duplicate').map((r) => r.position)],
  [['NHS EBI#2'], ['NHS EBI#3', 'NHS EBI#4']]);
check('the run id covers only what IS submitted', cplan.runId === planReport(report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [ebiEd] }])).runId);

console.log('\npayload: the producer\'s data, verbatim');
const tok = cand({ discoveryId: 'ebi-tok', classification: 'EDITION_TOKEN_CHANGED', matchedGuidelineId: 'x',
  discoveredUrl: 'https://Example.org/Path/Doc.PDF?ver=AbC%3d%3d',
  urlAlternatives: [{ url: 'https://example.org/r', relation: 'redirect-target', scope: 'document', derivedFrom: 'd', transform: 'none — observed', equivalence: 'unverified', statement: 's' }],
  tokenChange: { parameter: 'ver', previousValue: 'a', observedValue: 'b', previousObservedAt: 'p', guidelineId: 'x', statement: 's' } });
const pl = toPayload(tok, 1);
eq('discoveredUrl is not rewritten', pl.discoveredUrl, tok.discoveredUrl);
eq('the identity key is the shared TS authority\'s', pl.sourceUrlKey, documentIdentityKey(tok.discoveredUrl));
eq('stated labels, alternatives and token evidence pass through unchanged', [pl.statedLabels, pl.urlAlternatives, pl.tokenChange], [tok.statedLabels, tok.urlAlternatives, tok.tokenChange]);
eq('surface → surfaceUrl, discoveredAt → observedAt', [pl.surfaceUrl, pl.observedAt], [tok.surface, tok.discoveredAt]);
check('no softMatch key when the producer gave none', !('softMatch' in pl));

console.log('\nrun identity');
const base = report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew, ebiEd] }]);
const id0 = planReport(base).runId;
check('run ids are prefixed and fixed-length', /^discover:[0-9a-f]{32}$/.test(id0), id0);
eq('changing only generatedAt keeps the run id', planReport({ ...base, generatedAt: '2030-01-01T00:00:00.000Z' }).runId, id0);
const reordered = JSON.parse(canonicalJson(base)) as DiscoveryReportFile;
reordered.reports[0].candidates.reverse();
eq('re-ordering candidates and object keys keeps the run id', planReport(reordered).runId, id0);
eq('a different top-level note or coverage metadata keeps the run id', planReport({ ...base, note: 'x', catalogueEntryCount: 9 } as DiscoveryReportFile).runId, id0);
const newSweep = report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew, ebiEd].map((c) => ({ ...c, discoveredAt: '2026-10-31T00:00:00.000Z' })) }]);
check('a new sweep (new discoveredAt on its candidates) is a new run', planReport(newSweep).runId !== id0);
const edited = report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [{ ...ebiNew, topic: 'Changed' }, ebiEd] }]);
check('changed candidate content is a new run', planReport(edited).runId !== id0);
const withBofas = report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew, ebiEd] }, { provider: 'BOFAS', outcome: 'ok', candidates: [cand({ discoveryId: 'b', provider: 'BOFAS', discoveredUrl: 'https://www.bofas.org.uk/z.pdf' })] }]);
eq('candidates that are not submitted do not change the run id', planReport(withBofas).runId, id0);
eq('runIdentity is order-independent', runIdentity(1, [...planReport(base).submit.map((s) => s.payload)].reverse()), id0);

console.log('\nresponse classification');
eq('22023 → unsupported', classifyResponse(null, { code: '22023', message: 'contradicts' }).outcome, 'unsupported');
eq('other errors → failed', classifyResponse(null, { code: 'XX000', message: 'boom' }).outcome, 'failed');
for (const st of ['staged', 'existing', 'already_open', 'held']) eq(`${st} passes through`, classifyResponse({ status: st }, null).outcome, st);
eq('an unknown status → failed, never silently counted', classifyResponse({ status: 'weird' }, null).outcome, 'failed');
eq('a 5xx with no database code (a gateway) → unconfirmed', classifyResponse(null, { code: '', message: 'Bad gateway' }, 502).outcome, 'unconfirmed');
eq('a database error on a 5xx → failed (it rolled back)', classifyResponse(null, { code: 'XX000', message: 'x' }, 500).outcome, 'failed');

console.log('\ntimeouts');
eq('default timeout', parseArgs(['r.json']).timeoutMs, DEFAULT_TIMEOUT_MS);
eq('a valid --timeout-ms', parseArgs(['r.json', '--timeout-ms', '5000']).timeoutMs, 5000);
for (const v of ['0', '999', '300001', 'abc', '1.5']) check(`--timeout-ms ${v} refused`, /--timeout-ms must be/.test(parseArgs(['r.json', '--timeout-ms', v]).error ?? ''));
check('every write request goes through the bounded fetch', /global: \{ fetch: boundedFetch \}/.test(adapterSrc));
check('…which bounds the body too (reads it under the timer)', /await res\.text\(\)[\s\S]*finally \{\s*clearTimeout\(timer\)/.test(adapterSrc));

console.log('\nthe WRITE banner only after target and key checks');
{
  const dir = mkdtempSync(join(tmpdir(), 'stage-discovery-'));
  const f = join(dir, 'r.json');
  writeFileSync(f, JSON.stringify(report([{ provider: 'NHS EBI', outcome: 'ok', candidates: [ebiNew] }])));
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const capture = async (args: string[]) => {
    const lines: string[] = [];
    const [log, err] = [console.log, console.error];
    console.log = (...a: unknown[]) => { lines.push(a.join(' ')); };
    console.error = (...a: unknown[]) => { lines.push(a.join(' ')); };
    try { return { code: await main(args), out: lines.join('\n') }; } finally { console.log = log; console.error = err; }
  };
  const remote = await capture([f, '--write', '--target', 'https://example.invalid']);
  check('remote target refused (2) with no WRITE banner', remote.code === 2 && !/MODE: WRITE/.test(remote.out), remote.out);
  const nokey = await capture([f, '--write', '--target', 'http://127.0.0.1:9']);
  check('no key refused (2) with no WRITE banner', nokey.code === 2 && !/MODE: WRITE/.test(nokey.out), nokey.out);
  const dry = await capture([f]);
  check('a dry run still prints its banner', dry.code === 0 && /MODE: DRY RUN/.test(dry.out));
  if (saved !== undefined) process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  rmSync(dir, { recursive: true, force: true });
}

console.log('\nlocal test tooling (scripts/tests/local-supabase drives this adapter)');
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> };
eq('playwright is a devDependency pinned EXACTLY to 1.55.0 (see scripts/tests/local-supabase/README.md)', pkg.devDependencies?.playwright, '1.55.0');
check('…and not a runtime dependency', pkg.dependencies?.playwright === undefined);

console.log(`\n──────────────\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
