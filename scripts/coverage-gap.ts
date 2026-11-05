/**
 * scripts/coverage-gap.ts
 * ───────────────────────
 * Offline coverage-gap report: parse a saved provider page (or any HTML file)
 * with the matching discovery adapter and compare it with a catalogue
 * SNAPSHOT. Review signals only; nothing is staged, written or published.
 *
 *   npx tsx scripts/coverage-gap.ts --fixture BOFAS=path/to/bofas.html
 *   npx tsx scripts/coverage-gap.ts --fixture BSG=bsg.html --fixture BOFAS=bofas.html --json out.json
 *   npx tsx scripts/coverage-gap.ts --fixture BOFAS-ROUNDTABLE=rt.html --snapshot snapshot.json
 *
 * Options
 *   --fixture <KEY>=<html file>   one or more; KEY names a parser below
 *   --surface <KEY>=<url>         override the surface URL used for resolving hrefs
 *   --snapshot <json file>        a Guideline[] JSON to compare against instead of
 *                                 src/data/guidelines-data.ts
 *   --redirects <json file>       { "<discovered url>": "<final url>" } observed redirects
 *   --json <file>                 also write the structured reports
 *
 * NO NETWORK. Live pages are the job of scripts/discover.ts; this tool exists
 * so the same classification can be exercised deterministically against
 * fixtures, and so a saved page can be compared without a fetch.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Guideline } from '../src/data/guidelines-data';
import type { SurfaceParse } from './adapters/types';
import { parseBofasPublicationsSurface, parseBofasRoundTableIndex, gateBofasScope, BOFAS_PUBLICATIONS_SURFACE, BOFAS_ROUND_TABLE_SURFACE } from './adapters/bofas';
import { parseBsgGuidelinesIndex, gateBsgScope, BSG_GUIDELINES_SURFACE } from './adapters/bsg';
import { parseBessPathwaysIndex, BESS_PATHWAYS_SURFACE } from './adapters/bess';
import { parseEbiSpecialtyIndex, EBI_MSK_SURFACE } from './adapters/ebi';
import { registryEntry } from './lib/provider-registry';
import {
  buildCatalogueView,
  detectCoverageGaps,
  markCrossProviderDuplicates,
  renderGapReport,
  type GapReport,
} from './lib/coverage-gap';

type Gate = (item: { topic: string; discoveredUrl: string; sectionHeading?: string }) => string | null;

export interface ParserSpec {
  /** Registry key used for publisher matching (catalogueProvider comes from the registry). */
  registryKey: string;
  surface: string;
  parse: (html: string, surfaceUrl: string) => SurfaceParse;
  gate?: Gate;
}

export const PARSERS: Record<string, ParserSpec> = {
  BOFAS: { registryKey: 'BOFAS', surface: BOFAS_PUBLICATIONS_SURFACE, parse: parseBofasPublicationsSurface, gate: gateBofasScope },
  'BOFAS-ROUNDTABLE': { registryKey: 'BOFAS', surface: BOFAS_ROUND_TABLE_SURFACE, parse: parseBofasRoundTableIndex },
  BSG: { registryKey: 'BSG', surface: BSG_GUIDELINES_SURFACE, parse: parseBsgGuidelinesIndex, gate: gateBsgScope },
  BESS: { registryKey: 'BESS', surface: BESS_PATHWAYS_SURFACE, parse: parseBessPathwaysIndex },
  'NHS EBI': { registryKey: 'NHS EBI', surface: EBI_MSK_SURFACE, parse: parseEbiSpecialtyIndex },
};

/** The snapshot's own provenance line, read from the generated file's header. */
export function staticSnapshotLabel(repoRoot: string): string {
  try {
    const src = fs.readFileSync(path.join(repoRoot, 'src/data/guidelines-data.ts'), 'utf8');
    const m = /\/\/ Generated: (\S+) — (\d+) records\./.exec(src);
    if (m) return `static catalogue snapshot src/data/guidelines-data.ts generated ${m[1]} (${m[2]} records)`;
  } catch {
    /* fall through */
  }
  return 'static catalogue snapshot src/data/guidelines-data.ts (generation date not found in header)';
}

export interface RunOptions {
  fixtures: Array<{ key: string; file: string }>;
  surfaces?: Record<string, string>;
  snapshot?: { guidelines: readonly Guideline[]; label: string };
  redirects?: Record<string, string>;
  discoveredAt?: string;
  repoRoot?: string;
}

export async function runCoverageGap(opts: RunOptions): Promise<GapReport[]> {
  const repoRoot = opts.repoRoot ?? process.cwd();
  let guidelines: readonly Guideline[];
  let label: string;
  if (opts.snapshot) {
    guidelines = opts.snapshot.guidelines;
    label = opts.snapshot.label;
  } else {
    const mod = (await import('../src/data/guidelines-data')) as { GUIDELINES_DATA: Guideline[] };
    guidelines = mod.GUIDELINES_DATA;
    label = staticSnapshotLabel(repoRoot);
  }
  const view = buildCatalogueView(guidelines);
  const reports: GapReport[] = [];

  for (const fx of opts.fixtures) {
    const spec = PARSERS[fx.key];
    if (!spec) throw new Error(`unknown parser key "${fx.key}"; known: ${Object.keys(PARSERS).join(', ')}`);
    const entry = registryEntry(spec.registryKey);
    if (!entry) throw new Error(`registry has no entry for ${spec.registryKey}`);
    const surfaceUrl = opts.surfaces?.[fx.key] ?? spec.surface;
    const html = fs.readFileSync(fx.file, 'utf8');
    const parsed = spec.parse(html, surfaceUrl);

    const admitted: SurfaceParse = { items: [], excluded: parsed.excluded };
    const filtered: Array<{ url: string; topic: string; reason: string }> = [];
    for (const item of parsed.items) {
      const reason = spec.gate ? spec.gate(item) : null;
      if (reason !== null) filtered.push({ url: item.discoveredUrl, topic: item.topic, reason });
      else admitted.items.push(item);
    }

    const report = detectCoverageGaps(
      {
        provider: entry.key,
        providerName: entry.name,
        catalogueProvider: entry.catalogueProvider,
        surfaceUrl,
        parse: admitted,
        filtered,
        guidelines,
        redirects: opts.redirects,
        discoveredAt: opts.discoveredAt ?? new Date().toISOString(),
        snapshotLabel: label,
      },
      view,
    );
    // The gate's items are part of the surface's arithmetic: parsed = classified + filtered.
    report.itemsParsed = parsed.items.length;
    report.balanced = parsed.items.length === report.findings.length + filtered.length;
    reports.push(report);
  }

  markCrossProviderDuplicates(reports);
  return reports;
}

function parseArgs(argv: string[]): RunOptions & { json?: string } {
  const out: RunOptions & { json?: string } = { fixtures: [], surfaces: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => {
      const x = argv[++i];
      if (x === undefined) throw new Error(`${a} needs a value`);
      return x;
    };
    if (a === '--fixture') {
      const [key, file] = splitPair(v());
      out.fixtures.push({ key, file });
    } else if (a === '--surface') {
      const [key, url] = splitPair(v());
      out.surfaces![key] = url;
    } else if (a === '--snapshot') {
      const file = v();
      const guidelines = JSON.parse(fs.readFileSync(file, 'utf8')) as Guideline[];
      out.snapshot = { guidelines, label: `supplied snapshot ${path.basename(file)} (${guidelines.length} records)` };
    } else if (a === '--redirects') {
      out.redirects = JSON.parse(fs.readFileSync(v(), 'utf8')) as Record<string, string>;
    } else if (a === '--json') {
      out.json = v();
    } else {
      throw new Error(`unknown argument ${a}`);
    }
  }
  if (out.fixtures.length === 0) throw new Error('at least one --fixture KEY=file is required (no network is ever used)');
  return out;
}

function splitPair(s: string): [string, string] {
  const at = s.indexOf('=');
  if (at <= 0) throw new Error(`expected KEY=value, got "${s}"`);
  return [s.slice(0, at), s.slice(at + 1)];
}

async function main(): Promise<number> {
  const opts = parseArgs(process.argv.slice(2));
  const reports = await runCoverageGap(opts);
  for (const r of reports) {
    console.log(renderGapReport(r));
    console.log('\n' + '─'.repeat(72) + '\n');
  }
  if (opts.json) {
    fs.writeFileSync(opts.json, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'review signals only; snapshot comparison, not production truth', reports }, null, 2));
    console.log(`structured report: ${opts.json}`);
  }
  return reports.every((r) => r.balanced) ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then(
    (code) => { process.exitCode = code; },
    (err) => { console.error(`[coverage-gap] ${err instanceof Error ? err.message : String(err)}`); process.exitCode = 2; },
  );
}
