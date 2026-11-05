/**
 * scripts/tests/discovery-v2-run.test.ts
 * ──────────────────────────────────────
 * Drives scripts/discover.ts end to end for the two Discovery V2 providers
 * (BSG, BOFAS) with a STUBBED global fetch — no network — and checks the
 * things only a full run shows: the registry plan is wired, exactly one
 * declared surface is requested per provider, scope filtering is visible in
 * the report arithmetic, a 0-item parse is a failure, and the staging
 * ownership table still says `not-owner` for both (nothing here can stage).
 *
 * Run:   npx tsx scripts/tests/discovery-v2-run.test.ts
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const requested: string[] = [];
let responder: (url: string) => Response = () => new Response('', { status: 200 });
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input.toString();
  requested.push(url);
  return responder(url);
}) as typeof fetch;

const BSG_PAGE = `
<h1>BSG Clinical Guidelines</h1>
<div class="et_pb_promo"><div class="et_pb_promo_description"><h2 class="et_pb_module_header">Bone Sarcoma Guidelines 2024</h2><div><p>UK BSG Guidelines for the Management of Bone Sarcomas</p></div></div><a class="et_pb_promo_button" href="https://www.nature.com/articles/s41416-024-02868-4">View Guidelines</a></div>
<div class="et_pb_promo"><div class="et_pb_promo_description"><h2 class="et_pb_module_header">GIST Guidelines 2024</h2><div><p>UK BSG Guidelines for the Management of Gastrointestinal Stromal Tumour (GIST)</p></div></div><a class="et_pb_promo_button" href="https://www.nature.com/articles/s41416-024-02672-0">View Guidelines</a></div>
<h1>Other Resources</h1>
<div class="et_pb_promo"><div class="et_pb_promo_description"><h2 class="et_pb_module_header">ESMO Guidelines</h2></div><a class="et_pb_promo_button" href="https://www.esmo.org/guidelines/sarcoma">View here</a></div>`;

const BOFAS_PAGE = `
<h1>BOFAS Statements / Publications</h1>
<h2>BOFAS Position Statements</h2>
<p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=abc">BOFAS Position Statement on VTE</a> (2025)</p>
<h2>National COVID Audit (UK-FALCON)</h2>
<p><a href="/Portals/0/Research/FALCON.pdf?ver=x">UK Foot and Ankle COVID-19 National Audit (UK-FALCON) - Final Report</a> (2022)</p>`;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-v2-run-'));
const originalCwd = process.cwd();
process.chdir(TMP);

try {
  const { runDiscovery, surfacePlansFor } = await import('../discover');
  const { registryEntry } = await import('../lib/provider-registry');
  const { checkOwnership } = await import('../lib/staging-ownership');
  const pacing = await import('../lib/discovery-cache');
  let clock = 1_000_000;
  pacing.configurePacing({ now: () => clock, sleep: async (ms) => { clock += ms; } });

  console.log('\n[1] registry and plans');
  {
    const bsg = registryEntry('BSG');
    check('BSG is registered and active', bsg?.participation === 'active');
    eq('BSG has exactly one surface plan, with a scope gate', surfacePlansFor(bsg!).map((p) => [p.url, typeof p.gate, p.expectItems]), [['https://britishsarcomagroup.org.uk/guidelines-2/', 'function', true]]);
    const bofas = registryEntry('BOFAS')!;
    eq('BOFAS keeps its one declared surface, now with a scope gate', surfacePlansFor(bofas).map((p) => [p.url, typeof p.gate]), [['https://www.bofas.org.uk/clinician/research/bofas-publications', 'function']]);
    check('the round-table booklets page is NOT a registered surface (owner decision)', !surfacePlansFor(bofas).some((p) => /round-table/.test(p.url)));
  }

  console.log('\n[2] BSG sweep: one request, scope filtering visible, arithmetic balances');
  requested.length = 0;
  responder = () => new Response(BSG_PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
  {
    const { reports, exitCode } = await runDiscovery('BSG');
    const r = reports[0];
    eq('exit 0', exitCode, 0);
    eq('exactly the declared surface was requested', requested, ['https://britishsarcomagroup.org.uk/guidelines-2/']);
    eq('outcome ok', r.outcome, 'ok');
    eq('3 items parsed, 2 filtered on scope', [r.itemsDiscovered, r.itemsFiltered], [3, 2]);
    eq('the bone sarcoma guideline matched the catalogue by DOI? no — by soft match: it is a candidate for the classifier (the DOI rule lives in the gap tool)', r.candidates.length, 1);
    eq('…and it is POSSIBLE_NEW_EDITION against the catalogued entry', [r.candidates[0].classification, r.candidates[0].matchedGuidelineId], ['POSSIBLE_NEW_EDITION', 'bsg-bone-sarcoma-guidelines']);
    check('filtered reasons are the gate\'s words', r.surfaces[0].filtered.map((f) => f.reason).join(' ').includes('gastrointestinal stromal') && r.surfaces[0].filtered.map((f) => f.reason).join(' ').includes('Other Resources'));
    eq('coverage arithmetic balances', r.coverageBalanced, true);
  }

  console.log('\n[3] BOFAS sweep: UK-FALCON filtered, VTE matched');
  requested.length = 0;
  responder = () => new Response(BOFAS_PAGE, { status: 200, headers: { 'content-type': 'text/html' } });
  {
    const { reports } = await runDiscovery('BOFAS');
    const r = reports[0];
    eq('one request', requested, ['https://www.bofas.org.uk/clinician/research/bofas-publications']);
    eq('2 parsed, 1 filtered, 1 matched, 0 candidates', [r.itemsDiscovered, r.itemsFiltered, r.matchedExisting, r.candidates.length], [2, 1, 1, 0]);
    check('the filtered item is the audit report', /FALCON/.test(r.surfaces[0].filtered[0].topic));
  }

  console.log('\n[4] a 0-item page on these surfaces is a failure, not an empty truth');
  responder = () => new Response('<html><body><h1>Guidelines</h1></body></html>', { status: 200, headers: { 'content-type': 'text/html' } });
  {
    const { reports, exitCode } = await runDiscovery('BSG');
    eq('run fails', [reports[0].outcome, exitCode === 0], ['failed', false]);
    check('…with the parse-failure wording', /parsed 0 items/.test(reports[0].outcomeReason ?? reports[0].surfaces[0]?.error ?? ''), reports[0].outcomeReason);
  }

  console.log('\n[5] an inaccessible surface is reported as failed, never as "nothing there"');
  responder = () => new Response('blocked', { status: 403 });
  {
    const { reports } = await runDiscovery('BOFAS');
    eq('failed', reports[0].outcome, 'failed');
    eq('no candidates invented', reports[0].candidates.length, 0);
  }

  console.log('\n[6] staging boundary unchanged');
  {
    eq('discovery may not stage BSG', (checkOwnership('BSG', 'discover') as { status?: string }).status, 'not-owner');
    eq('discovery may not stage BOFAS', (checkOwnership('BOFAS', 'discover') as { status?: string }).status, 'not-owner');
  }
} finally {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  try { fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); } catch { /* leftover temp dir is not a failure */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
