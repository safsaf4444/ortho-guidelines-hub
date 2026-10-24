/**
 * scripts/tests/discovery-run.test.ts
 * ────────────────────────────────────
 * Behavioural tests for the sweep runner: participation gating, failure
 * reporting, and coverage arithmetic.
 *
 * NO REAL NETWORK. `globalThis.fetch` is a stub keyed by URL substring, so the
 * tests assert what the runner REQUESTED as well as what it concluded. Running
 * in a throwaway cwd keeps both the cache and the written reports out of the
 * repository.
 *
 * The question these tests exist for: a provider whose surface coverage is
 * declared `partial` and whose run then fails must report a FAILURE. "Partial"
 * describes how much of a publisher's output the adapter covers; it must never
 * soften a run that did not work.
 *
 * Run:   npx tsx scripts/tests/discovery-run.test.ts
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

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
  check(
    name,
    Object.is(actual, expected),
    `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
  );
}

const requestedUrls: string[] = [];
let responder: (url: string) => Response = () => new Response('', { status: 200 });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = typeof input === 'string' ? input : input.toString();
  requestedUrls.push(url);
  return responder(url);
}) as typeof fetch;

// A BESS page with one real accordion, enough for the parser to succeed.
const BESS_OK = `
<h3>Patient Care Pathways</h3>
<div class="wp-block-coblocks-accordion">
  <div class="wp-block-coblocks-accordion-item">
    <details>
      <summary><strong>Frozen Shoulder</strong></summary>
      <div class="wp-block-file">
        <a href="https://bess.ac.uk/wp-content/uploads/2020/06/Frozen_Shoulder.pdf">Frozen_Shoulder</a>
        <a href="https://bess.ac.uk/wp-content/uploads/2020/06/Frozen_Shoulder.pdf" class="wp-block-file__button">Download</a>
      </div>
    </details>
  </div>
</div>`;


/**
 * Remove a throwaway temp directory. On Windows a just-written file can be held
 * briefly by antivirus or the search indexer, and rmSync then throws EPERM or
 * EBUSY even though nothing is wrong with the test. Retry as Node documents for
 * exactly this case; if it still fails, WARN — never throw. A leftover OS temp
 * directory is not a test failure, and an exception here would also skip the
 * pass/fail summary and replace the suite's real result with a crash.
 */
function removeTempDir(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  } catch (err) {
    console.warn(`  (cleanup) could not remove ${dir}: ${(err as Error).message}`);
  }
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-run-test-'));
const originalCwd = process.cwd();
process.chdir(TMP);

try {
  const { runDiscovery } = await import('../discover');
  // Pacing would otherwise make this suite sleep 5s between same-host runs.
  // Same module instance as discover.ts uses, so this reaches its fetches.
  const pacingMod = await import('../lib/discovery-cache');
  // Virtual clock: a "sleep" advances it instantly, so waits are measured, not skipped.
  let pacingClock = 1_000_000;
  pacingMod.configurePacing({ now: () => pacingClock, sleep: async (ms) => { pacingClock += ms; } });

  console.log('\n[1] A declared-partial provider that FAILS reports failure, not partial success');
  requestedUrls.length = 0;
  responder = () => new Response('blocked', { status: 403, statusText: 'Forbidden' });
  {
    const { reports, exitCode } = await runDiscovery('BESS');
    eq('one provider reported', reports.length, 1);
    const r = reports[0];
    eq('surface coverage is still declared partial', r.surfaceCoverage, 'partial');
    eq('but the run outcome is failed', r.outcome, 'failed');
    check('the reason names the failure', /403/.test(r.outcomeReason ?? ''), r.outcomeReason);
    check(
      'the reason states plainly that partial does not mean partial success',
      /FAILURE, not a partial success/i.test(r.outcomeReason ?? ''),
      r.outcomeReason,
    );
    eq('no items were claimed', r.itemsDiscovered, 0);
    eq('no candidates were produced', r.candidates.length, 0);
    eq('the exit code is non-zero', exitCode, 1);
    check('the failing surface carries its own error', Boolean(r.surfaces[0].error), JSON.stringify(r.surfaces[0]));
  }

  console.log('\n[2] A surface known to carry items that parses to zero is a parse failure');
  requestedUrls.length = 0;
  responder = () => new Response('<html><body><p>Site under maintenance</p></body></html>', { status: 200 });
  {
    const { reports, exitCode } = await runDiscovery('BESS');
    const r = reports[0];
    eq('outcome is failed, not ok-with-zero', r.outcome, 'failed');
    check(
      'the reason says it is treated as a parse failure',
      /parse failure/i.test(r.outcomeReason ?? ''),
      r.outcomeReason,
    );
    check(
      'the reason rejects the empty-result reading explicitly',
      /not as an empty result/i.test(r.outcomeReason ?? ''),
      r.outcomeReason,
    );
    eq('exit code is non-zero', exitCode, 1);
  }

  console.log('\n[3] A successful partial run reports ok, with its gaps still named');
  requestedUrls.length = 0;
  responder = () => new Response(BESS_OK, { status: 200 });
  {
    const { reports, exitCode } = await runDiscovery('BESS');
    const r = reports[0];
    eq('outcome is ok', r.outcome, 'ok');
    eq('coverage is still partial', r.surfaceCoverage, 'partial');
    check('the uncovered surfaces are named in the report', (r.uncoveredSurfaces ?? []).length >= 3);
    check(
      'the WPFD manager is named as a known gap',
      (r.uncoveredSurfaces ?? []).some((u) => u.includes('national-guidelines')),
      JSON.stringify(r.uncoveredSurfaces),
    );
    eq('one item discovered', r.itemsDiscovered, 1);
    eq('it matched the catalogue by URL', r.matchedExisting, 1);
    eq('so no candidate was raised', r.candidates.length, 0);
    eq('coverage arithmetic balances', r.coverageBalanced, true);
    eq('exit code is zero', exitCode, 0);
  }

  console.log('\n[4] ROS is never requested while its access approval is unresolved');
  requestedUrls.length = 0;
  responder = () => new Response('should never be fetched', { status: 200 });
  {
    const { reports, exitCode } = await runDiscovery('ROS');
    const r = reports[0];
    eq('participation is awaiting-approval', r.participation, 'awaiting-approval');
    eq('outcome is skipped', r.outcome, 'skipped');
    eq('ZERO requests were made', requestedUrls.length, 0);
    check(
      'no request touched theros.org.uk',
      !requestedUrls.some((u) => u.includes('theros.org.uk')),
      JSON.stringify(requestedUrls),
    );
    check(
      'the skip reason records that no request was made',
      /no request was made/i.test(r.outcomeReason ?? ''),
      r.outcomeReason,
    );
    check(
      'the reason explains that linking permission is not collection permission',
      /not permission for automated retrieval/i.test(r.outcomeReason ?? ''),
      r.outcomeReason,
    );
    eq('a skipped provider does not fail the sweep', exitCode, 0);
  }

  console.log('\n[5] Blocked providers are visible, cost nothing, and fail nothing');
  for (const key of ['GIRFT', 'BASK', 'OTS']) {
    requestedUrls.length = 0;
    const { reports, exitCode } = await runDiscovery(key);
    const r = reports[0];
    eq(`${key}: participation is blocked-for-tested-client`, r.participation, 'blocked-for-tested-client');
    eq(`${key}: outcome is skipped`, r.outcome, 'skipped');
    eq(`${key}: no request made`, requestedUrls.length, 0);
    eq(`${key}: does not fail the sweep`, exitCode, 0);
    check(
      `${key}: the reason is scoped to the clients we tested, not to every client`,
      /clients (?:and network )?we tested|clients we tested with/i.test(r.participationReason ?? ''),
      r.participationReason,
    );
    check(
      `${key}: the reason denies it is a proven property of the provider`,
      /NOT a proven property|not a proven property/.test(r.participationReason ?? ''),
      r.participationReason,
    );
  }
  check(
    'GIRFT additionally records that unreachability is not evidence of health',
    /not evidence of working|does not establish that GIRFT URLs are healthy/i.test(
      (await runDiscovery('GIRFT')).reports[0].participationReason ?? '',
    ),
  );

  console.log('\n[6] The runner writes two files and nothing else consumes them');
  {
    requestedUrls.length = 0;
    responder = () => new Response(BESS_OK, { status: 200 });
    await runDiscovery('BESS');
    const written = fs.readdirSync(path.join(TMP, 'reports'));
    check('a JSON artefact was written', written.some((f) => /^discovery-.*\.json$/.test(f)), JSON.stringify(written));
    check('a coverage report was written', written.some((f) => /^discovery-coverage-.*\.md$/.test(f)), JSON.stringify(written));

    const jsonFile = written.filter((f) => /^discovery-.*\.json$/.test(f)).sort().pop()!;
    const payload = JSON.parse(fs.readFileSync(path.join(TMP, 'reports', jsonFile), 'utf-8'));
    check(
      'the artefact states it was not written to Supabase or the catalogue',
      /Nothing here has been written to Supabase/i.test(payload.note),
      payload.note,
    );
    check(
      'the artefact states its classes are not ChangeReason values',
      /NOT ChangeReason/.test(payload.note),
      payload.note,
    );
    check(
      'the artefact states no automatic consumer reads it',
      /No automatic consumer/i.test(payload.note),
      payload.note,
    );

    const md = fs.readFileSync(
      path.join(TMP, 'reports', written.filter((f) => f.endsWith('.md')).sort().pop()!),
      'utf-8',
    );
    check('the coverage report separates coverage from outcome', /never softens a failed run/i.test(md), md.slice(0, 400));
    check('the coverage report explains what a 304 means', /not "nothing was published"/i.test(md));
  }

  console.log('\n[7] EBI retired-guidance is gated: out-of-specialty items are filtered, not raised');
  {
    // The musculoskeletal surface is fetched first, then retired-guidance. The
    // stub answers each by URL so both can be scripted independently.
    const mskItem = (slug: string, title: string) =>
      `<div class="intervention-link"><a href="https://ebi.aomrc.org.uk/interventions/${slug}/">${title}</a></div>`;

    // One genuine MSK intervention already in the catalogue, so the MSK surface
    // is non-empty and its single item matches.
    const MSK = `<h1 class="page-title">Musculoskeletal / Spine</h1><section class="content-block">
      ${mskItem('lumbar-discectomy', 'Lumbar discectomy')}</section>`;

    // Retired term carrying: an out-of-specialty item unknown to us (the real
    // "Troponin test" case), and an item that IS in our catalogue.
    const RETIRED = `<h1 class="page-title">Retired guidance</h1><section class="content-block">
      ${mskItem('troponin-test', 'Troponin test')}
      ${mskItem('mri-scan-of-the-hip-for-arthritis', 'MRI scan of the hip for arthritis')}</section>`;

    requestedUrls.length = 0;
    responder = (url) => new Response(url.includes('retired-guidance') ? RETIRED : MSK, { status: 200 });

    const { reports, exitCode } = await runDiscovery('NHS EBI');
    const r = reports[0];
    eq('the run succeeded', r.outcome, 'ok');
    eq('both surfaces were fetched', requestedUrls.length, 2);
    eq('three items parsed across the two surfaces', r.itemsDiscovered, 3);
    const ebiSecond = r.surfaces.find((s) => s.url.includes('retired-guidance'))!;
    check(
      'the second EBI surface (same host, back-to-back) was paced, within the bound',
      ebiSecond.pacedMs > 0 && ebiSecond.pacedMs <= pacingMod.MIN_HOST_INTERVAL_MS,
      String(ebiSecond.pacedMs),
    );

    const retired = r.surfaces.find((s) => s.url.includes('retired-guidance'))!;

    check(
      'the out-of-specialty retired item was filtered',
      retired.filtered.some((f) => f.topic === 'Troponin test'),
      JSON.stringify(retired.filtered.map((f) => f.topic)),
    );
    check(
      'it is NOT emitted as a candidate of any class',
      !r.candidates.some((c) => c.topic === 'Troponin test'),
      JSON.stringify(r.candidates.map((c) => c.topic)),
    );
    eq('no NEW_GUIDELINE was raised at all', r.byClass.NEW_GUIDELINE, 0);
    eq('in fact no candidates were raised', r.candidates.length, 0);

    const why = retired.filtered.find((f) => f.topic === 'Troponin test')!.reason;
    check('the reason says the term is not specialty-filtered', /not specialty-filtered/i.test(why), why);
    check(
      'the reason frames it as a scope statement, not a judgement on the document',
      /not about the document/i.test(why),
      why,
    );

    check(
      'the catalogue-matched retired item was admitted, not filtered',
      !retired.filtered.some((f) => f.topic === 'MRI scan of the hip for arthritis'),
      JSON.stringify(retired.filtered.map((f) => f.topic)),
    );
    check(
      'and its retirement is recorded as a publisher assertion',
      retired.retirementAssertions.some((a) => a.guidelineId === 'ebi-mri-hip-arthritis'),
      JSON.stringify(retired.retirementAssertions),
    );
    const assertion = retired.retirementAssertions[0];
    check(
      'the assertion denies being a verified withdrawal',
      /not a withdrawal we have\s+verified/i.test(assertion.statement.replace(/\s+/g, ' ')),
      assertion.statement,
    );
    check(
      'the assertion states no catalogue status changed',
      /no catalogue status has changed/i.test(assertion.statement),
      assertion.statement,
    );

    eq('filtered items are counted', r.itemsFiltered, 1);
    eq(
      'coverage arithmetic balances with the filtered item included',
      r.itemsDiscovered,
      r.matchedExisting + r.itemsFiltered + r.candidates.length,
    );
    eq('coverageBalanced agrees', r.coverageBalanced, true);
    eq('a filtered item does not fail the sweep', exitCode, 0);
  }

  console.log('\n[7b] An item on BOTH surfaces is counted once, on the first');
  {
    const item = `<div class="intervention-link"><a href="https://ebi.aomrc.org.uk/interventions/ganglion-excision/">Ganglion excision</a></div>`;
    const page = `<h1 class="page-title">x</h1><section class="content-block">${item}</section>`;
    requestedUrls.length = 0;
    responder = () => new Response(page, { status: 200 });

    const { reports } = await runDiscovery('NHS EBI');
    const r = reports[0];
    eq('two items parsed (one per surface)', r.itemsDiscovered, 2);
    eq('one matched on the musculoskeletal surface', r.matchedExisting, 1);
    eq('the retired duplicate was filtered rather than double-counted', r.itemsFiltered, 1);
    const retired = r.surfaces.find((s) => s.url.includes('retired-guidance'))!;
    check(
      'the reason says it was assessed on the earlier surface',
      /earlier in this run/i.test(retired.filtered[0]?.reason ?? ''),
      JSON.stringify(retired.filtered),
    );
    eq('arithmetic still balances', r.coverageBalanced, true);
  }

  console.log('\n[7c] The gate applies only to the retired surface');
  {
    const bess = BESS_OK;
    requestedUrls.length = 0;
    responder = () => new Response(bess, { status: 200 });
    const { reports } = await runDiscovery('BESS');
    const r = reports[0];
    eq('BESS has no gated surface, so nothing is filtered', r.itemsFiltered, 0);
    check('and its surface reports an empty filtered list', r.surfaces[0].filtered.length === 0);
  }

  console.log('\n[7d] REGRESSION: an index redirect cannot make an unrelated document match');
  {
    // The vector, end to end through the runner. The index page redirects to a
    // URL that IS a catalogue document key. Before the fix the redirect was
    // attached to every item parsed off that page and joined their match keys,
    // so every document on the index matched that one unrelated entry and was
    // reported as already held — a sweep that discovers nothing while claiming
    // everything matched.
    const catalogueDocumentUrl = 'https://bess.ac.uk/wp-content/uploads/2020/06/Frozen_Shoulder.pdf';

    // A page listing ONE document that is NOT in the catalogue.
    const UNRELATED = `
      <h3>Patient Care Pathways</h3>
      <div class="wp-block-coblocks-accordion">
        <div class="wp-block-coblocks-accordion-item">
          <details>
            <summary><strong>A brand new pathway nobody has catalogued</strong></summary>
            <div class="wp-block-file">
              <a href="https://bess.ac.uk/wp-content/uploads/2026/10/Brand-New-Pathway.pdf">Brand-New-Pathway</a>
              <a href="https://bess.ac.uk/wp-content/uploads/2026/10/Brand-New-Pathway.pdf" class="wp-block-file__button">Download</a>
            </div>
          </details>
        </div>
      </div>`;

    requestedUrls.length = 0;
    responder = () =>
      Object.defineProperty(new Response(UNRELATED, { status: 200 }), 'url', {
        value: catalogueDocumentUrl,
      });

    const { reports, exitCode } = await runDiscovery('BESS');
    const r = reports[0];
    const surface = r.surfaces[0];

    eq('the run succeeded', r.outcome, 'ok');
    eq('one item was parsed', r.itemsDiscovered, 1);
    eq('the redirect was observed', surface.redirected, true);
    eq('and the final URL recorded', surface.finalUrl, catalogueDocumentUrl);

    // The point: the unrelated document must NOT be absorbed as matched.
    eq('NOTHING was counted as already in the catalogue', r.matchedExisting, 0);
    eq('the document is reported for review instead', r.candidates.length, 1);
    eq('as a new guideline', r.candidates[0].classification, 'NEW_GUIDELINE');
    eq(
      'and its discovered URL is its own, not the redirect target',
      r.candidates[0].discoveredUrl,
      'https://bess.ac.uk/wp-content/uploads/2026/10/Brand-New-Pathway.pdf',
    );
    check(
      'the redirect target is not attached to the item as an alternative',
      !r.candidates[0].urlAlternatives.some((a) => a.url === catalogueDocumentUrl),
      JSON.stringify(r.candidates[0].urlAlternatives),
    );
    check(
      'no item carries any surface-scoped alternative at all',
      r.candidates.every((c) => c.urlAlternatives.every((a) => a.scope === 'document')),
      JSON.stringify(r.candidates.map((c) => c.urlAlternatives)),
    );

    // Provenance is kept, just in the right place.
    check('the surface report carries the redirect', Boolean(surface.surfaceRedirect));
    eq('recorded as surface-scoped', surface.surfaceRedirect?.scope, 'surface');
    check(
      'and says it takes no part in document matching',
      /no part in matching documents/i.test(surface.surfaceRedirect?.statement ?? ''),
      surface.surfaceRedirect?.statement,
    );

    eq('arithmetic balances', r.coverageBalanced, true);
    eq('exit code is zero', exitCode, 0);
  }

  console.log('\n[8] An unknown provider name is an error, not an empty sweep');
  {
    const { reports, exitCode } = await runDiscovery('NOT A PROVIDER');
    eq('no reports produced', reports.length, 0);
    eq('exit code is non-zero', exitCode, 1);
  }

  console.log('\n[10] An unmatched BOFAS item is a POSSIBLE edition, with the stated year verbatim and no date invented');
  {
    // The live shape of candidate 1 of the 15 Oct sweep: BOFAS hosts its own
    // copy of a co-published document the catalogue holds at a BOA address.
    const BOFAS_PAGE = `
      <p><a href="/Portals/0/Position Statements/SpecS-Management-of-End-Stage-Ankle-Arthritis.pdf?ver=IfQ%3d%3d">BOFAS / BOA Speciality Standards on Management of End Stage Ankle Arthritis</a> (2025)</p>`;
    responder = () => new Response(BOFAS_PAGE, { status: 200 });

    const { reports, exitCode } = await runDiscovery('BOFAS');
    const r = reports[0];
    eq('the run succeeded', r.outcome, 'ok');
    eq('exactly one candidate', r.candidates.length, 1);
    const c = r.candidates[0];
    eq('it is classed as a POSSIBLE new edition — nothing stronger', c.classification, 'POSSIBLE_NEW_EDITION');
    eq('it names the catalogue entry it may concern', c.matchedGuidelineId, 'end-stage-ankle-arthritis');
    eq('the publisher-stated year is carried, verbatim', c.statedLabels[0]?.value, '(2025)');
    const st = c.softMatch?.statement ?? '';
    check(
      'the evidence keeps all three readings open: new edition, same document, different document',
      /NEW EDITION/.test(st) && /SAME DOCUMENT/.test(st) && /DIFFERENT DOCUMENT/.test(st),
      st,
    );
    check('it says no publication date was established', /no publication date was established/i.test(st), st);
    check(
      'the candidate carries no date field of its own — only labels and timestamps',
      !Object.keys(c).some((k) => /^(published|publication|edition)(Date|At)?$/i.test(k)),
      JSON.stringify(Object.keys(c)),
    );
    check('it does not claim to replace the catalogue link', !/\breplac/i.test(JSON.stringify(c)), c.notes);

    const md = fs.readFileSync(
      path.join(TMP, 'reports', fs.readdirSync(path.join(TMP, 'reports')).filter((f) => f.endsWith('.md')).sort().pop()!),
      'utf-8',
    );
    check('the report shows the publisher-stated year with its provenance', md.includes('"(2025)" (page-body, from `https://www.bofas.org.uk/'));
    check(
      "the report shows the catalogue entry's own label beside it, verbatim",
      md.includes(`Catalogue entry's own version label(s), verbatim: "April 2025"`),
    );
    eq('exit code is zero', exitCode, 0);
  }

  console.log('\n[12] Retirement is an explicit per-surface opt-in; a scope filter can never imply it');
  {
    const { admitItem, surfacePlansFor } = await import('../discover');
    const { GUIDELINES_DATA } = await import('../../src/data/guidelines-data');
    const { buildCatalogueIndex } = await import('../lib/edition-match');
    const { PROVIDER_REGISTRY } = await import('../lib/provider-registry');
    const { EBI_RETIRED_SURFACE } = await import('../adapters/ebi');
    const index = buildCatalogueIndex(GUIDELINES_DATA);
    const ctx = { index, seenEarlier: new Set<string>() };
    const BOFAS_SURFACE = 'https://www.bofas.org.uk/clinician/research/bofas-publications';

    // A BOFAS document the catalogue already holds (VTE position statement).
    const held = {
      topic: 'BOFAS Position Statement on VTE',
      discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/BOFAS%20VTE%20Statement%20-%20v1.0%20-%202025-06.pdf?ver=x',
    };
    const unknown = { topic: 'Not in catalogue', discoveredUrl: 'https://www.bofas.org.uk/Portals/0/Research/nothing.pdf' };

    // (a) The decision function itself.
    const admitAll = admitItem({ gate: () => null }, held, ctx, BOFAS_SURFACE);
    check('a scope filter that ADMITS a catalogue document records no retirement',
      admitAll.admitted && admitAll.retirementAssertion === null, JSON.stringify(admitAll));
    const declined = admitItem({ gate: () => 'test: out of scope' }, held, ctx, BOFAS_SURFACE);
    check('a scope filter that DECLINES it is filtered — with no retirement attached',
      !declined.admitted && declined.reason === 'test: out of scope' && !('retirementAssertion' in declined),
      JSON.stringify(declined));
    const explicitFalse = admitItem({ gate: () => null, assertsRetirement: false }, held, ctx, BOFAS_SURFACE);
    check('assertsRetirement: false behaves like absent',
      explicitFalse.admitted && explicitFalse.retirementAssertion === null);
    const noGate = admitItem({}, held, ctx, BOFAS_SURFACE);
    check('a surface with no gate and no flag records no retirement',
      noGate.admitted && noGate.retirementAssertion === null);
    const optedIn = admitItem({ assertsRetirement: true }, held, ctx, BOFAS_SURFACE);
    check('an OPTED-IN surface does record the catalogue match as publisher-asserted retirement',
      optedIn.admitted && optedIn.retirementAssertion?.guidelineId !== undefined, JSON.stringify(optedIn));
    const optedInUnknown = admitItem({ assertsRetirement: true }, unknown, ctx, BOFAS_SURFACE);
    check('…but never for an item the catalogue does not hold',
      optedInUnknown.admitted && optedInUnknown.retirementAssertion === null);

    // (b) Across the whole registry, exactly one shipped surface opts in.
    const flagged = PROVIDER_REGISTRY.flatMap((e) => surfacePlansFor(e))
      .filter((p) => p.assertsRetirement === true).map((p) => p.url);
    eq('the only surface that asserts retirement is EBI’s retired-guidance term',
      JSON.stringify(flagged), JSON.stringify([EBI_RETIRED_SURFACE]));

    // (c) End to end: BOFAS with a scope filter added, over the five documents
    // the catalogue already holds plus one item the filter declines.
    const BOFAS_HELD_PAGE = `
      <p><a href="/Portals/0/Position Statements/BOFAS VTE Statement - v1.0 - 2025-06.pdf?ver=a">BOFAS Position Statement on VTE</a> (2025)</p>
      <p><a href="/Portals/0/Position Statements/FAME STUDY POSITION STATEMENT.pdf?ver=b">BOFAS Position Statement on the FAME Study</a> (2019)</p>
      <p><a href="/Portals/0/Position Statements/BOFAS Statement on TAR .pdf?ver=c">BOFAS Position Statement on Total Ankle Replacement</a> (2019)</p>
      <p><a href="/Portals/0/Position%20Statements/DiabeticFoot%20FINAL.pdf?ver=d">BOFAS / BOA / Multidisciplinary Diabetic Foot Guidelines</a> (2016)</p>
      <p><a href="/Portals/0/Position Statements/BOFAS Pathways 2.pdf?ver=e">BOFAS Pathways of Care in Foot and Ankle Surgery</a></p>
      <p><a href="/Portals/0/Research/Some-Audit-Report.pdf?ver=f">A research report</a> (2022)</p>`;
    responder = () => new Response(BOFAS_HELD_PAGE, { status: 200 });

    const withScopeFilter = (assertsRetirement?: boolean) => (entry: Parameters<typeof surfacePlansFor>[0]) =>
      entry.key !== 'BOFAS'
        ? surfacePlansFor(entry)
        : surfacePlansFor(entry).map((p) => ({
            ...p,
            gate: (item: { discoveredUrl: string }) =>
              /\/Research\//.test(item.discoveredUrl) ? 'test scope filter: research output' : null,
            ...(assertsRetirement === undefined ? {} : { assertsRetirement }),
          }));

    const { reports, exitCode } = await runDiscovery('BOFAS', withScopeFilter());
    const r = reports[0];
    eq('the run succeeded', r.outcome, 'ok');
    eq('all five held BOFAS documents matched the catalogue', r.matchedExisting, 5);
    eq('the research item was filtered by the scope filter', r.itemsFiltered, 1);
    eq('coverage balances', r.coverageBalanced, true);
    eq('ZERO publisher-asserted retirements on the filtered BOFAS surface',
      r.surfaces.reduce((n, s) => n + s.retirementAssertions.length, 0), 0);
    const md = fs.readFileSync(
      path.join(TMP, 'reports', fs.readdirSync(path.join(TMP, 'reports')).filter((f) => f.endsWith('.md')).sort().pop()!),
      'utf-8',
    );
    check('the report contains no PUBLISHER-ASSERTED RETIREMENT line', !/PUBLISHER-ASSERTED RETIREMENT of/.test(md));
    check('the filtered item is still listed, with its reason', /FILTERED "A research report"/.test(md) && /test scope filter: research output/.test(md));
    check('the report states that filtering does not mean retirement', /does NOT mean the\s+publisher retired it/.test(md));
    eq('exit code is zero', exitCode, 0);

    // (d) Sensitivity: the SAME sweep with the flag forced on reports all five
    // as retired — so (c) would catch a return to "has a gate ⇒ retirement".
    const forced = (await runDiscovery('BOFAS', withScopeFilter(true))).reports[0];
    eq('with assertsRetirement forced on, the same five ARE reported (test is sensitive)',
      forced.surfaces.reduce((n, s) => n + s.retirementAssertions.length, 0), 5);
  }

  // The ENTRYPOINT, run as a real child process. runDiscovery's return value
  // is covered above; this covers what the OS actually sees. The Windows
  // exit-127 crash (forced process.exit() racing a closing TLS socket) could
  // only be reproduced against a live server, so it cannot be replayed here —
  // what CAN be pinned is that the entrypoint exits naturally with the real
  // code, and that process.exit() appears only in the hang watchdog.
  console.log('\n[9] The entrypoint exits naturally, with the real exit code');
  {
    const tsxCli = path.join(originalCwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const script = path.join(originalCwd, 'scripts', 'discover.ts');
    const run = (provider: string, cwd: string) =>
      spawnSync(process.execPath, [tsxCli, script, '--provider', provider], {
        cwd, encoding: 'utf-8', timeout: 60_000,
      });

    const childCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-entry-test-'));
    try {
      const unknown = run('NOT A PROVIDER', childCwd);
      eq('unknown provider: the process exit status is 1', unknown.status, 1);

      // ROS is awaiting-approval: skipped, so NO request is made — safe to run
      // for real. Its cache and reports land in the throwaway cwd.
      const skipped = run('ROS', childCwd);
      eq('skipped provider: the process exit status is 0', skipped.status, 0);
      check('it did not take the watchdog path', !/forcing exit/.test(skipped.stderr ?? ''), skipped.stderr);
      check('no libuv assertion on the way out', !/Assertion failed/.test(skipped.stderr ?? ''), skipped.stderr);
    } finally {
      removeTempDir(childCwd);
    }

    const src = fs.readFileSync(script, 'utf-8');
    // Code only: the entrypoint's own comment explains why process.exit() is avoided.
    const entry = src.slice(src.indexOf('if (isMain)')).split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join('\n');
    check('the entrypoint sets process.exitCode', /process\.exitCode = exitCode/.test(entry));
    check('the entrypoint never calls process.exit() itself', !/process\.exit\(/.test(entry), entry);
    check('the entrypoint arms the watchdog after the sweep settles', /\.finally\(\(\) => \{\s*armExitWatchdog\(\);/.test(entry));
    const codeOnly = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');
    eq('process.exit( appears exactly once in the whole script — the watchdog default', (codeOnly.match(/process\.exit\(/g) ?? []).length, 1);
  }

  console.log('\n[11] The exit watchdog: never reports success after forcing termination');
  {
    const { watchdogVerdict, WATCHDOG_EXIT_CODE, armExitWatchdog } = await import('../discover');

    const forcedCode: number = WATCHDOG_EXIT_CODE;
    eq('the forced-exit code is nonzero', forcedCode !== 0, true);
    eq('…and distinct from an ordinary failed sweep (1)', forcedCode !== 1, true);
    const ok = watchdogVerdict(0, ['TCPSocketWrap'], 30_000);
    eq('a sweep that SUCCEEDED but then hung exits nonzero', ok.exitCode, WATCHDOG_EXIT_CODE);
    check('…and says the sweep itself had succeeded', /sweep's own result was success \(0\)/.test(ok.message), ok.message);
    check('…and says why it is not reporting that', /never reported as success/.test(ok.message), ok.message);
    check('…and names what was still open', /Still open: TCPSocketWrap/.test(ok.message), ok.message);
    const failed = watchdogVerdict(1, [], 30_000);
    eq('a sweep that FAILED and then hung also exits with the watchdog code', failed.exitCode, WATCHDOG_EXIT_CODE);
    check('…while reporting the sweep\'s own failure', /failure \(1\)/.test(failed.message), failed.message);
    eq('no recorded result is still nonzero', watchdogVerdict(undefined, [], 30_000).exitCode, WATCHDOG_EXIT_CODE);

    // In-process, with injected exit: the timer is unref()d and, when it fires,
    // sets exitCode before exiting, so even an exit() that is swallowed leaves a
    // nonzero status behind.
    const saved = process.exitCode;
    process.exitCode = 0;
    const exits: number[] = [];
    const errors: string[] = [];
    const timer = armExitWatchdog(10, { exit: (c) => exits.push(c), error: (m) => errors.push(m), resources: () => ['Timeout'] });
    check('the watchdog timer does not hold the process open', !timer.hasRef());
    await new Promise((r) => setTimeout(r, 40));
    eq('when it fires it exits with the watchdog code', exits[0], WATCHDOG_EXIT_CODE);
    eq('process.exitCode is overwritten too — success cannot survive', process.exitCode, WATCHDOG_EXIT_CODE);
    check('the reason is written to stderr', errors.length === 1 && /FORCED EXIT/.test(errors[0]), errors.join('|'));
    process.exitCode = saved;

    // For real, in a child process: a sweep that "succeeded" (exitCode 0) and
    // then left a handle open. The OS must see the watchdog code, not 0.
    const tsxCli = path.join(originalCwd, 'node_modules', 'tsx', 'dist', 'cli.mjs');
    const discoverUrl = pathToFileURL(path.join(originalCwd, 'scripts', 'discover.ts')).href;
    const childDir = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-watchdog-test-'));
    try {
      const hung = path.join(childDir, 'hung.ts');
      fs.writeFileSync(hung,
        `import { armExitWatchdog } from ${JSON.stringify(discoverUrl)};\n` +
        `process.exitCode = 0;\nsetInterval(() => {}, 1000);\narmExitWatchdog(300);\n`);
      const r = spawnSync(process.execPath, [tsxCli, hung], { cwd: childDir, encoding: 'utf-8', timeout: 30_000 });
      eq('child: a hung "successful" process exits with the watchdog code', r.status, WATCHDOG_EXIT_CODE);
      check('child: stderr says it was forced, and why', /FORCED EXIT/.test(r.stderr) && /success \(0\)/.test(r.stderr), r.stderr);

      const clean = path.join(childDir, 'clean.ts');
      fs.writeFileSync(clean,
        `import { armExitWatchdog } from ${JSON.stringify(discoverUrl)};\n` +
        `process.exitCode = 0;\narmExitWatchdog(5000);\n`);
      const t0 = Date.now();
      const c = spawnSync(process.execPath, [tsxCli, clean], { cwd: childDir, encoding: 'utf-8', timeout: 30_000 });
      eq('child: with nothing open, the process exits 0 naturally', c.status, 0);
      check('child: …without waiting for the watchdog', Date.now() - t0 < 5000, `${Date.now() - t0}ms`);
      check('child: …and without a forced-exit message', !/FORCED EXIT/.test(c.stderr), c.stderr);
    } finally {
      removeTempDir(childDir);
    }
  }
} finally {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  removeTempDir(TMP);
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
