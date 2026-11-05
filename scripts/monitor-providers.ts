/**
 * scripts/monitor-providers.ts
 * ────────────────────────────
 * Provider change monitoring, DRY RUN ONLY. Produces the human-readable report
 * described in the Discovery V2 brief: per provider, what the index lists now,
 * what changed since the previous parse, alerts, and the review items from the
 * coverage-gap detector. It never stages, writes to the catalogue, or publishes.
 *
 * Stateless offline comparison (two files, nothing stored):
 *   npx tsx scripts/monitor-providers.ts --provider BOFAS --previous old.html --current new.html
 *   … [--fetch-facts facts.json] [--snapshot guidelines.json] [--out report.txt] [--json report.json]
 *
 * Stateful observation against the DURABLE monitoring store (offline, from a
 * saved page — deterministic, used by the tests — or live):
 *   npx tsx scripts/monitor-providers.ts --observe BOFAS=page.html [--fetch-facts facts.json] [--baseline-dir .monitoring-baselines]
 *   npx tsx scripts/monitor-providers.ts --live BOFAS --live BSG [--baseline-dir …]
 *
 * The store (scripts/lib/monitor-store.ts) is separate from the HTTP cache: a
 * `discover` run cannot overwrite the comparison point, a failed or
 * structurally invalid fetch never becomes the baseline, the first valid
 * observation is labelled the initial baseline, and after failures the next
 * valid run diffs against the last known-good index.
 *
 * Live mode reads public index pages through the existing discovery cache
 * (pacing, validators) — identical network behaviour to `npm run discover` —
 * and writes only that cache and the monitoring store.
 *
 * Exit: 0 no alert-level findings; 1 at least one alert (inaccessible, empty or
 * structurally invalid index, missing 304 baseline evidence, rejected
 * observation); 2 usage error or unusable persisted baseline evidence.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Guideline } from '../src/data/guidelines-data';
import { PARSERS, staticSnapshotLabel, type ParserSpec } from './coverage-gap';
import { registryEntry } from './lib/provider-registry';
import { buildCatalogueView, detectCoverageGaps, renderGapReport, type GapReport } from './lib/coverage-gap';
import { diffSurfaceParses, renderMonitoringReport, type FetchFacts, type ProviderMonitorSection } from './lib/index-diff';
import { MONITOR_STORE_DIR, readMonitorRecord, recordObservation } from './lib/monitor-store';
import type { SurfaceParse } from './adapters/types';

interface Job {
  key: string;
  spec: ParserSpec;
  previousHtml: string | null;
  currentHtml: string;
  surfaceUrl: string;
  fetch: FetchFacts;
  /** Set when the job went through the durable store: what happened to the baseline. */
  store?: { accepted: boolean; reason: string; initial: boolean; baselineObservedAt: string | null; writeError?: string };
}

export function buildSection(job: Job, guidelines: readonly Guideline[], snapshotLabel: string, discoveredAt: string): { section: ProviderMonitorSection; gap: GapReport } {
  const entry = registryEntry(job.spec.registryKey);
  if (!entry) throw new Error(`registry has no entry for ${job.spec.registryKey}`);
  const current = job.currentHtml ? job.spec.parse(job.currentHtml, job.surfaceUrl) : { items: [], excluded: [] };
  const previous = job.previousHtml === null ? null : job.spec.parse(job.previousHtml, job.surfaceUrl);
  const diff = diffSurfaceParses(previous, current, job.fetch);
  if (job.store) {
    diff.alerts.unshift({
      level: job.store.accepted ? 'info' : 'alert',
      code: job.store.accepted ? (job.store.initial ? 'initial-baseline' : 'body-changed-no-item-change') : 'inaccessible',
      message: job.store.accepted
        ? (job.store.initial ? `initial baseline established (${job.store.reason}) — a starting point, not evidence of change` : `baseline advanced (${job.store.reason})`)
        : `observation REJECTED, baseline kept${job.store.baselineObservedAt ? ` (from ${job.store.baselineObservedAt})` : ' (none yet)'}: ${job.store.reason}`,
    });
    if (job.store.writeError) diff.alerts.push({ level: 'alert', code: 'inaccessible', message: `monitoring store could not be written: ${job.store.writeError}` });
  }

  const admitted: SurfaceParse = { items: [], excluded: current.excluded };
  const filtered: Array<{ url: string; topic: string; reason: string }> = [];
  for (const item of current.items) {
    const reason = job.spec.gate ? job.spec.gate(item) : null;
    if (reason !== null) filtered.push({ url: item.discoveredUrl, topic: item.topic, reason });
    else admitted.items.push(item);
  }
  const gap = detectCoverageGaps(
    {
      provider: entry.key,
      providerName: entry.name,
      catalogueProvider: entry.catalogueProvider,
      surfaceUrl: job.surfaceUrl,
      parse: admitted,
      filtered,
      guidelines,
      discoveredAt,
      snapshotLabel,
    },
    buildCatalogueView(guidelines),
  );
  gap.itemsParsed = current.items.length;
  gap.balanced = current.items.length === gap.findings.length + filtered.length;

  const discoveryLines = [
    `${gap.itemsParsed} documents found (${current.excluded.length} links excluded by the parser, ${filtered.length} filtered on scope)`,
    `${gap.byClass.ALREADY_REPRESENTED} represented in the supplied catalogue snapshot`,
    `${gap.byClass.POTENTIALLY_NEW} potentially new`,
    `${gap.byClass.POSSIBLE_UPDATED_VERSION} possible updated version`,
    `${gap.byClass.POSSIBLE_SAME_DOCUMENT} possible same document`,
    `${gap.byClass.PUBLISHER_DECLARED_MOVED} publisher-declared moved`,
    `${gap.byClass.PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED} publisher-declared withdrawn or replaced`,
    `${gap.byClass.AMBIGUOUS_REVIEW} ambiguous — editorial review`,
  ];
  const rendered = renderGapReport(gap);
  const reviewStart = rendered.indexOf('Review required');
  const reviewLines = reviewStart >= 0 ? rendered.slice(reviewStart).split('\n').slice(1).filter((l) => l.trim() && !l.startsWith('Filtered on scope') && !l.startsWith('Excluded by the parser')) : [];
  // Keep only the review block (stop at the first blank-line-delimited section after it).
  const cut = reviewLines.findIndex((l) => /^(Filtered on scope|Excluded by the parser)/.test(l));
  const review = cut >= 0 ? reviewLines.slice(0, cut) : reviewLines;

  return {
    section: { provider: entry.key, providerName: entry.name, surfaceUrl: job.surfaceUrl, diff, discoveryLines, reviewLines: review },
    gap,
  };
}

async function main(argv: string[]): Promise<number> {
  const jobs: Job[] = [];
  let snapshot: { guidelines: Guideline[]; label: string } | null = null;
  let out: string | undefined;
  let jsonOut: string | undefined;
  const pending: Partial<Job> & { key?: string } = {};
  const live: string[] = [];
  const observe: Array<{ key: string; file: string }> = [];
  let baselineDir = MONITOR_STORE_DIR;
  const v = (i: number, a: string) => {
    const x = argv[i];
    if (x === undefined) throw new Error(`${a} needs a value`);
    return x;
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--provider') pending.key = v(++i, a);
    else if (a === '--previous') pending.previousHtml = fs.readFileSync(v(++i, a), 'utf8');
    else if (a === '--current') pending.currentHtml = fs.readFileSync(v(++i, a), 'utf8');
    else if (a === '--fetch-facts') pending.fetch = JSON.parse(fs.readFileSync(v(++i, a), 'utf8')) as FetchFacts;
    else if (a === '--snapshot') {
      const file = v(++i, a);
      const guidelines = JSON.parse(fs.readFileSync(file, 'utf8')) as Guideline[];
      snapshot = { guidelines, label: `supplied snapshot ${path.basename(file)} (${guidelines.length} records)` };
    } else if (a === '--out') out = v(++i, a);
    else if (a === '--json') jsonOut = v(++i, a);
    else if (a === '--live') live.push(v(++i, a));
    else if (a === '--observe') { const x = v(++i, a); const at = x.indexOf('='); if (at <= 0) throw new Error('--observe needs KEY=file'); observe.push({ key: x.slice(0, at), file: x.slice(at + 1) }); }
    else if (a === '--baseline-dir') baselineDir = v(++i, a);
    else throw new Error(`unknown argument ${a}`);
  }
  if (pending.key) {
    const spec = PARSERS[pending.key];
    if (!spec) throw new Error(`unknown provider key ${pending.key}; known: ${Object.keys(PARSERS).join(', ')}`);
    if (!pending.currentHtml) throw new Error('--current <html file> is required with --provider');
    jobs.push({ key: pending.key, spec, previousHtml: pending.previousHtml ?? null, currentHtml: pending.currentHtml, surfaceUrl: spec.surface, fetch: pending.fetch ?? {} });
  }
  const observedAt = new Date().toISOString();
  const viaStore = (key: string, spec: ParserSpec, html: string, facts: FetchFacts): Job => {
    const parse = html ? spec.parse(html, facts.finalUrl ?? spec.surface) : { items: [], excluded: [] };
    const out = recordObservation(baselineDir, {
      provider: key, surfaceUrl: spec.surface, finalUrl: facts.finalUrl, status: facts.status, revalidated: facts.revalidated,
      error: facts.error, html, parse, observedAt, expectItems: facts.expectItems,
    });
    const prev = out.previousBaseline;
    return {
      key, spec,
      previousHtml: prev ? prev.html : null,
      currentHtml: html,
      surfaceUrl: facts.finalUrl ?? spec.surface,
      fetch: facts,
      store: { accepted: out.accepted, reason: out.reason, initial: out.accepted && prev === null, baselineObservedAt: prev?.observedAt ?? null, ...(out.writeError ? { writeError: out.writeError } : {}) },
    };
  };
  for (const o of observe) {
    const spec = PARSERS[o.key];
    if (!spec) throw new Error(`unknown provider key ${o.key}`);
    const facts: FetchFacts = pending.fetch ?? { status: 200 };
    jobs.push(viaStore(o.key, spec, fs.readFileSync(o.file, 'utf8'), facts));
  }
  for (const key of live) {
    const spec = PARSERS[key];
    if (!spec) throw new Error(`unknown provider key ${key}`);
    const { fetchSurface } = await import('./lib/discovery-cache');
    try {
      const got = await fetchSurface(spec.surface);
      jobs.push(viaStore(key, spec, got.body, { status: got.status, finalUrl: got.finalUrl, redirected: got.redirected, bodyChanged: got.bodyChanged, revalidated: got.revalidated }));
    } catch (err) {
      jobs.push(viaStore(key, spec, '', { error: err instanceof Error ? err.message : String(err) }));
    }
  }
  // Read-only summary of the store for the report header.
  const storeSummary = jobs.filter((j) => j.store).map((j) => { const r = readMonitorRecord(baselineDir, j.key); return `${j.key}: baseline ${r.baseline ? `${r.baseline.observedAt}${r.baseline.initial ? ' (initial)' : ''}, ${r.baseline.parse.items.length} item(s)` : 'none'}; ${r.attempts.length} attempt(s) logged`; });
  if (jobs.length === 0) throw new Error('nothing to do: give --provider KEY --current file, --observe KEY=file, or --live KEY');

  let guidelines: readonly Guideline[];
  let label: string;
  if (snapshot) ({ guidelines, label } = snapshot);
  else {
    const mod = (await import('../src/data/guidelines-data')) as { GUIDELINES_DATA: Guideline[] };
    guidelines = mod.GUIDELINES_DATA;
    label = staticSnapshotLabel(process.cwd());
  }
  const generatedAt = new Date().toISOString();
  const sections: ProviderMonitorSection[] = [];
  const gaps: GapReport[] = [];
  for (const job of jobs) {
    const { section, gap } = buildSection(job, guidelines, label, generatedAt);
    sections.push(section);
    gaps.push(gap);
  }
  let text = renderMonitoringReport(sections, generatedAt, label);
  if (storeSummary.length) text += `\n\nMonitoring store (${baselineDir}):\n${storeSummary.map((l) => `- ${l}`).join('\n')}`;
  console.log(text);
  if (out) fs.writeFileSync(out, text);
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ generatedAt, note: 'dry run; review signals only', sections: sections.map((s) => ({ provider: s.provider, surfaceUrl: s.surfaceUrl, diff: s.diff })), gaps }, null, 2));
  const alerts = sections.some((s) => s.diff.alerts.some((a) => a.level === 'alert')) || jobs.some((j) => j.store && !j.store.accepted);
  return alerts ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(`[monitor] ${err instanceof Error ? err.message : String(err)}`); process.exitCode = 2; },
  );
}
