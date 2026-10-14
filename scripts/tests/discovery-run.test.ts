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
import fs from 'fs';
import os from 'os';
import path from 'path';

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

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'disc-run-test-'));
const originalCwd = process.cwd();
process.chdir(TMP);

try {
  const { runDiscovery } = await import('../discover');

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
} finally {
  globalThis.fetch = realFetch;
  process.chdir(originalCwd);
  fs.rmSync(TMP, { recursive: true, force: true });
}

console.log(`\n──────── ${pass} passed, ${fail} failed ────────\n`);
process.exit(fail > 0 ? 1 : 0);
