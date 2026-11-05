/**
 * scripts/tests/index-diff.test.ts
 * ────────────────────────────────
 * Offline tests for scripts/lib/index-diff.ts (provider change monitoring)
 * and the offline path of scripts/monitor-providers.ts. NO NETWORK.
 *
 * Run:   npx tsx scripts/tests/index-diff.test.ts
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiscoveredRecord, SurfaceParse } from '../adapters/types';
import { diffSurfaceParses, renderMonitoringReport, type ProviderMonitorSection } from '../lib/index-diff';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}
function eq(name: string, actual: unknown, expected: unknown) {
  check(name, JSON.stringify(actual) === JSON.stringify(expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const r = (topic: string, url: string, section?: string, year?: string): DiscoveredRecord => ({
  topic, discoveredUrl: url, sectionHeading: section,
  statedLabels: [...(year ? [{ origin: 'page-body' as const, value: year, readFrom: 'x' }] : []), ...(section ? [{ origin: 'page-body' as const, value: section, readFrom: 'x', fieldLabel: 'section heading' }] : [])],
});
const parse = (items: DiscoveredRecord[], excluded: SurfaceParse['excluded'] = []): SurfaceParse => ({ items, excluded });

const A = 'https://www.bofas.org.uk/a.pdf?ver=1';
const B = 'https://www.bofas.org.uk/b.pdf';
const C = 'https://www.bofas.org.uk/c.pdf';

console.log('\n[1] first run: no baseline, nothing is "added"');
{
  const d = diffSurfaceParses(null, parse([r('A', A), r('B', B)]));
  eq('no changes', d.changes.length, 0);
  eq('unchanged flag', d.unchanged, true);
  eq('counts', [d.previousItems, d.currentItems], [0, 2]);
}

console.log('\n[2] added and removed');
{
  const d = diffSurfaceParses(parse([r('A', A), r('B', B)]), parse([r('A', A), r('C', C)]));
  eq('kinds', d.changes.map((c) => c.kind).sort(), ['added', 'removed']);
  check('removed is worded as "not listed now", never as withdrawn', /not withdrawal/.test(d.changes.find((c) => c.kind === 'removed')!.detail));
  eq('alerts are review-level, not alert-level', d.alerts.map((a) => a.level).sort(), ['review', 'review']);
}

console.log('\n[3] changed document URL for the same title → retitled-url, not add+remove');
{
  const d = diffSurfaceParses(parse([r('Pathways of Care', 'https://www.bofas.org.uk/old.pdf')]), parse([r('Pathways of Care', 'https://www.bofas.org.uk/new.pdf')]));
  eq('one change', d.changes.map((c) => c.kind), ['retitled-url']);
  eq('previous URL recorded', d.changes[0].previous, 'https://www.bofas.org.uk/old.pdf');
  check('worded as unverified', /unverified/.test(d.changes[0].detail));
}

console.log('\n[4] cache token change is NOT a change (existing loose key strips ver=)');
{
  const d = diffSurfaceParses(parse([r('A', 'https://www.bofas.org.uk/a.pdf?ver=1')]), parse([r('A', 'https://www.bofas.org.uk/a.pdf?ver=2')]));
  eq('unchanged', d.unchanged, true);
}

console.log('\n[5] publisher date label and section label changes');
{
  const d = diffSurfaceParses(parse([r('A', A, 'Guidelines', '(2024)')]), parse([r('A', A, 'Guidelines', '(2025)')]));
  eq('label-changed', d.changes.map((c) => c.kind), ['label-changed']);
  check('before/after carry the values', d.changes[0].previous!.includes('(2024)') && d.changes[0].current!.includes('(2025)'));
  const s = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Position Statements')]));
  eq('section-changed (and the section label change that comes with it)', s.changes.map((c) => c.kind).sort(), ['label-changed', 'section-changed']);
}

console.log('\n[6] archived / withdrawn wording appearing');
{
  const d = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Archived Standards')]));
  check('status-wording change reported', d.changes.some((c) => c.kind === 'status-wording' && c.current === 'Archived Standards'));
  check('alert says wording changed, not that anything was withdrawn', d.alerts.some((a) => a.code === 'status-wording-changed') && !d.alerts.some((a) => /withdrawn\b(?! wording)/i.test(a.message) && !/wording/.test(a.message)));
  const gone = diffSurfaceParses(parse([r('A', A, 'Archived Standards')]), parse([r('A', A, 'Guidelines')]));
  check('wording disappearing is also reported', gone.changes.some((c) => c.kind === 'status-wording' && c.previous === 'Archived Standards'));
}

console.log('\n[7] empty index and inaccessible surface');
{
  const d = diffSurfaceParses(parse([r('A', A), r('B', B)]), parse([]));
  check('empty-index alert at alert level', d.alerts.some((a) => a.code === 'empty-index' && a.level === 'alert'));
  check('…worded as a parse/publisher failure, not withdrawal', /not evidence that anything was withdrawn/.test(d.alerts.find((a) => a.code === 'empty-index')!.message));
  const e = diffSurfaceParses(parse([r('A', A)]), parse([]), { error: 'timeout (>30000ms)' });
  check('inaccessible alert', e.alerts.some((a) => a.code === 'inaccessible' && /No conclusion about any document/.test(a.message)));
  const h = diffSurfaceParses(parse([r('A', A)]), parse([r('A', A)]), { status: 503 });
  check('non-2xx status is inaccessible even when a body parsed', h.alerts.some((a) => a.code === 'inaccessible'));
}

console.log('\n[8] redirect, body-only change, structure drift');
{
  const d = diffSurfaceParses(parse([r('A', A)]), parse([r('A', A)]), { redirected: true, finalUrl: 'https://www.bofas.org.uk/new-index' });
  check('index redirect reported for review', d.alerts.some((a) => a.code === 'index-redirected' && /new-index/.test(a.message)));
  const b = diffSurfaceParses(parse([r('A', A)]), parse([r('A', A)]), { bodyChanged: true });
  check('body changed with no item change → info only', b.alerts.length === 1 && b.alerts[0].code === 'body-changed-no-item-change' && b.alerts[0].level === 'info');
  const excl = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `https://x/${i}`, reason: 'nav' }));
  const s = diffSurfaceParses(parse([r('A', A)], excl(2)), parse([r('A', A)], excl(9)));
  check('exclusion count jump with no document change → structure-changed', s.alerts.some((a) => a.code === 'structure-changed'));
}

console.log('\n[9] rendering');
{
  const d = diffSurfaceParses(parse([r('A', A, 'Guidelines', '(2024)'), r('B', B)]), parse([r('A', A, 'Guidelines', '(2025)'), r('C', C)]));
  const text = renderMonitoringReport([{ provider: 'BOFAS', providerName: 'BOFAS', surfaceUrl: 'https://www.bofas.org.uk/x', diff: d, discoveryLines: ['2 documents found'], reviewLines: ['- [POTENTIALLY_NEW] C'] }], '2026-11-05T00:00:00Z', 'synthetic');
  for (const must of ['Provider: BOFAS', 'Discovery:', 'Index changes since the previous parse', 'Alerts:', 'Changes:', 'Review required:', 'snapshot, not production truth', 'Nothing in this report changes a catalogue entry']) {
    check(`report contains "${must}"`, text.includes(must));
  }
  check('report never claims publication or withdrawal', !/\bpublished\b|\bwithdrew\b|\bwithdrawn\b(?!-wording| wording)/.test(text.replace(/archived\/withdrawn-wording/g, '')));
}

console.log('\n[10] the CLI, offline, end to end');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ortho-monitor-'));
  const page = (rows: string) => `<h1>BOFAS Statements / Publications</h1><h2>BOFAS Position Statements</h2>${rows}`;
  const prev = page('<p><a href="/Portals/0/Position Statements/A.pdf?ver=1">BOFAS Position Statement on A</a> (2024)</p>');
  const cur = page('<p><a href="/Portals/0/Position Statements/A.pdf?ver=2">BOFAS Position Statement on A</a> (2025)</p><p><a href="/Portals/0/Position Statements/B.pdf">BOFAS Position Statement on B</a> (2026)</p>');
  fs.writeFileSync(path.join(dir, 'prev.html'), prev);
  fs.writeFileSync(path.join(dir, 'cur.html'), cur);
  const snap = path.join(dir, 'snapshot.json');
  fs.writeFileSync(snap, JSON.stringify([{
    id: 'bofas-a', topic: 'BOFAS position statement on A', source: 'BOFAS', section: 'T', type: 'G', summary: '', regionalVariation: false, localOverlayNeeded: false,
    lastChecked: '2026-01-01', status: 'current', sourceType: 'specialist-society', guidanceStatus: 'current', subGroup: '2024',
    versions: [{ label: '2024', url: 'https://www.bofas.org.uk/Portals/0/Position%20Statements/A.pdf' }],
  }]));
  const outJson = path.join(dir, 'report.json');
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let exit = 0;
  let stdout = '';
  try {
    stdout = execFileSync(process.execPath, [path.join(repo, 'node_modules/tsx/dist/cli.mjs'), 'scripts/monitor-providers.ts', '--provider', 'BOFAS', '--previous', path.join(dir, 'prev.html'), '--current', path.join(dir, 'cur.html'), '--snapshot', snap, '--json', outJson], { cwd: repo, encoding: 'utf8' });
  } catch (e) {
    const err = e as { status?: number; stdout?: string };
    exit = err.status ?? 1;
    stdout = err.stdout ?? '';
  }
  eq('exit 0 (no alert-level alerts)', exit, 0);
  check('A: label change 2024→2025 reported', /label-changed\] BOFAS Position Statement on A/.test(stdout));
  check('B: added', /\[added\] BOFAS Position Statement on B/.test(stdout));
  check('A: possible updated version (later year on the same URL)', /POSSIBLE_UPDATED_VERSION\] BOFAS Position Statement on A/.test(stdout));
  check('B: potentially new', /POTENTIALLY_NEW\] BOFAS Position Statement on B/.test(stdout));
  check('supplied snapshot named as the basis', /supplied snapshot snapshot\.json \(1 records\)/.test(stdout));
  const json = JSON.parse(fs.readFileSync(outJson, 'utf8')) as { note: string; sections: unknown[]; gaps: unknown[] };
  check('structured JSON written with the dry-run note', /dry run/.test(json.note) && json.sections.length === 1 && json.gaps.length === 1);
  fs.rmSync(dir, { recursive: true, force: true });
}


console.log('\n[11] P2-3: /A.pdf and /a.pdf are distinct documents, never silently collapsed');
{
  const up = 'https://www.bofas.org.uk/Portals/0/A.pdf';
  const low = 'https://www.bofas.org.uk/Portals/0/a.pdf';
  const d = diffSurfaceParses(parse([r('Statement A', up)]), parse([r('Statement A', up), r('Statement a', low)]));
  eq('the lower-case path is reported as added', d.changes.map((c) => [c.kind, c.url]), [['added', low]]);
  const both = diffSurfaceParses(parse([r('Statement A', up), r('Statement a', low)]), parse([r('Statement A', up), r('Statement a', low)]));
  eq('two case-distinct URLs are two items, unchanged', [both.previousItems, both.currentItems, both.unchanged], [2, 2, true]);
  const swapped = diffSurfaceParses(parse([r('Statement A', up)]), parse([r('Statement A', low)]));
  check('case change on the same title is visible (retitled-url), not absorbed', swapped.changes.some((c) => c.kind === 'retitled-url' && c.previous === up));
}

console.log('\n[12] P2-4: negated publisher wording is not a withdrawal observation');
{
  const d = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Not withdrawn: current guidance')]));
  check('"Not withdrawn: current guidance" → no status-wording change', !d.changes.some((c) => c.kind === 'status-wording'));
  check('… and no status-wording alert', !d.alerts.some((a) => a.code === 'status-wording-changed'));
  const d2 = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Guidelines (no longer archived)')]));
  check('"no longer archived" → no status-wording change', !d2.changes.some((c) => c.kind === 'status-wording'));
  const d3 = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Unretired standards')]));
  check('"Unretired" → no status-wording change', !d3.changes.some((c) => c.kind === 'status-wording'));
  const real = diffSurfaceParses(parse([r('A', A, 'Guidelines')]), parse([r('A', A, 'Withdrawn guidance')]));
  check('plain "Withdrawn" still reported as wording (not as fact)', real.changes.some((c) => c.kind === 'status-wording') && /wording/.test(real.alerts.find((a) => a.code === 'status-wording-changed')!.message));
}

console.log('\n[13] P2-7: a title change at the same URL is a review signal');
{
  const d = diffSurfaceParses(parse([r('Position statement on A', A)]), parse([r('Position statement on A (2nd edition)', A)]));
  eq('title-changed reported with before/after', d.changes.map((c) => [c.kind, c.previous, c.current]), [['title-changed', 'Position statement on A', 'Position statement on A (2nd edition)']]);
  check('review-level alert', d.alerts.some((a) => a.level === 'review' && /changed title at the same URL/.test(a.message)));
  check('not reported as unchanged', !d.unchanged);
  check('renders in the counts line', /1 title change\(s\) at the same URL/.test(renderMonitoringReport([{ key: 'BOFAS', name: 'BOFAS', surfaceUrl: A, diff: d, gap: null, discoveryLines: [], reviewLines: [] } as unknown as ProviderMonitorSection], '2026-11-05T00:00:00.000Z', 'test')));
  const ws = diffSurfaceParses(parse([r('Position  statement on A', A)]), parse([r('Position statement on A', A)]));
  eq('whitespace-only difference is NOT a title change', ws.changes.length, 0);
}

console.log('\n[14] P2-1 / P2-2: 304 and first-run empty index at the library level');
{
  const items = parse([r('A', A)]);
  const ok = diffSurfaceParses(items, items, { status: 304, revalidated: true });
  check('304 with a trusted prior representation: compared, info alert only', ok.alerts.every((a) => a.level !== 'alert') && ok.alerts.some((a) => /304/.test(a.message)));
  const bad = diffSurfaceParses(items, parse([]), { status: 304, revalidated: false });
  check('304 without a prior representation: missing-baseline-evidence ALERT', bad.alerts.some((a) => a.level === 'alert' && a.code === 'missing-baseline-evidence'));
  check('… and the empty current parse is not reported as "removed" items', !bad.changes.some((c) => c.kind === 'removed'));
  const first = diffSurfaceParses(null, parse([]), { status: 200 });
  check('first run, 0 items on an item-bearing surface: empty-index ALERT (exit 1 in the CLI)', first.alerts.some((a) => a.level === 'alert' && a.code === 'empty-index'));
  const firstOk = diffSurfaceParses(null, parse([]), { status: 200, expectItems: false });
  check('first run, 0 items where none are expected: no alert', !firstOk.alerts.some((a) => a.level === 'alert'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exitCode = fail === 0 ? 0 : 1;
