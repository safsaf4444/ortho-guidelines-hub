/**
 * scripts/lib/search-benchmark.ts
 * ───────────────────────────────
 * Offline retrieval benchmark: runs every query in
 * scripts/tests/fixtures/search-benchmark.json through the legacy substring
 * search (what src/App.tsx does today) and the new engine
 * (src/lib/search), and reports Top-1 accuracy, Recall@5, mean reciprocal
 * rank, precision@5 and empty-query behaviour.
 *
 * Pure: no network, no database. The catalogue is the static export. Legacy
 * results keep catalogue order, exactly as the app shows them (grouped by
 * section afterwards, which does not change which five a reader sees first
 * within a section).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDELINES_DATA, type Guideline } from '../../src/data/guidelines-data';
import { buildSearchIndex, searchIndex, type SearchResult } from '../../src/lib/search/engine';
import { legacySubstringSearch } from '../../src/lib/search/legacy';

export interface BenchmarkQuery {
  id: string;
  category: string;
  query: string;
  expected: string[];
  evidence: string;
}

export interface BenchmarkFixture {
  queries: BenchmarkQuery[];
}

export interface QueryOutcome {
  id: string;
  category: string;
  query: string;
  expected: string[];
  /** Result ids in rank order (all of them). */
  results: string[];
  top1: boolean | null;
  recallAt5: number | null;
  /** Historical author metric: recall divided by the top-five capacity. Not standard recall. */
  capacityNormalizedRecallAt5: number | null;
  reciprocalRank: number | null;
  precisionAt5: number | null;
  precisionAmongReturnedAt5: number | null;
  /** For no-result / empty queries: did the engine return nothing? */
  emptyAsExpected: boolean | null;
  /** Top-5 ids not in the expected set (false positives at the top). */
  falsePositivesAt5: string[];
}

export interface EngineSummary {
  engine: 'legacy' | 'v2';
  queriesWithExpected: number;
  top1Accuracy: number;
  recallAt5: number;
  capacityNormalizedRecallAt5: number;
  meanReciprocalRank: number;
  precisionAt5: number;
  precisionAmongReturnedAt5: number;
  noResultQueries: number;
  noResultCorrect: number;
  perCategory: Record<string, { n: number; top1: number; recallAt5: number; mrr: number }>;
  outcomes: QueryOutcome[];
}

export function fixturePath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.join(here, '..', 'tests', 'fixtures', 'search-benchmark.json');
}

export function loadFixture(file: string = fixturePath()): BenchmarkFixture {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as BenchmarkFixture;
}

export function scoreBenchmarkQuery(q: BenchmarkQuery, results: string[]): QueryOutcome {
  const expected = new Set(q.expected);
  const top5 = results.slice(0, 5);
  if (expected.size === 0) {
    return {
      id: q.id, category: q.category, query: q.query, expected: q.expected, results,
      top1: null, recallAt5: null, capacityNormalizedRecallAt5:null, reciprocalRank: null, precisionAt5: null, precisionAmongReturnedAt5:null,
      emptyAsExpected: results.length === 0,
      falsePositivesAt5: top5,
    };
  }
  const firstHit = results.findIndex((id) => expected.has(id));
  const hitsAt5 = top5.filter((id) => expected.has(id)).length;
  return {
    id: q.id, category: q.category, query: q.query, expected: q.expected, results,
    top1: results.length > 0 && expected.has(results[0]),
    recallAt5: hitsAt5 / expected.size,
    capacityNormalizedRecallAt5: hitsAt5 / Math.min(5, expected.size),
    reciprocalRank: firstHit < 0 ? 0 : 1 / (firstHit + 1),
    precisionAt5: hitsAt5 / 5,
    precisionAmongReturnedAt5: top5.length === 0 ? 0 : hitsAt5 / top5.length,
    emptyAsExpected: null,
    falsePositivesAt5: top5.filter((id) => !expected.has(id)),
  };
}

function summarise(engine: 'legacy' | 'v2', outcomes: QueryOutcome[]): EngineSummary {
  const scored = outcomes.filter((o) => o.top1 !== null);
  const noResult = outcomes.filter((o) => o.emptyAsExpected !== null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const perCategory: EngineSummary['perCategory'] = {};
  for (const o of scored) {
    const c = (perCategory[o.category] ??= { n: 0, top1: 0, recallAt5: 0, mrr: 0 });
    c.n += 1;
    c.top1 += o.top1 ? 1 : 0;
    c.recallAt5 += o.recallAt5 ?? 0;
    c.mrr += o.reciprocalRank ?? 0;
  }
  for (const c of Object.values(perCategory)) {
    c.top1 = c.top1 / c.n;
    c.recallAt5 = c.recallAt5 / c.n;
    c.mrr = c.mrr / c.n;
  }
  return {
    engine,
    queriesWithExpected: scored.length,
    top1Accuracy: mean(scored.map((o) => (o.top1 ? 1 : 0))),
    recallAt5: mean(scored.map((o) => o.recallAt5 ?? 0)),
    capacityNormalizedRecallAt5: mean(scored.map(o=>o.capacityNormalizedRecallAt5 ?? 0)),
    meanReciprocalRank: mean(scored.map((o) => o.reciprocalRank ?? 0)),
    precisionAt5: mean(scored.map((o) => o.precisionAt5 ?? 0)),
    precisionAmongReturnedAt5: mean(scored.map(o=>o.precisionAmongReturnedAt5 ?? 0)),
    noResultQueries: noResult.length,
    noResultCorrect: noResult.filter((o) => o.emptyAsExpected).length,
    perCategory,
    outcomes,
  };
}

export function runLegacy(records: readonly Guideline[], fixture: BenchmarkFixture): EngineSummary {
  const outcomes = fixture.queries.map((q) => scoreBenchmarkQuery(q, legacySubstringSearch(records, q.query).map((g) => g.id)));
  return summarise('legacy', outcomes);
}

export function runV2(records: readonly Guideline[], fixture: BenchmarkFixture): EngineSummary {
  const index = buildSearchIndex(records);
  const outcomes = fixture.queries.map((q) => scoreBenchmarkQuery(q, searchIndex(index, q.query).map((r: SearchResult) => r.id)));
  return summarise('v2', outcomes);
}

export function runBenchmark(records: readonly Guideline[] = GUIDELINES_DATA, fixture: BenchmarkFixture = loadFixture()) {
  return { legacy: runLegacy(records, fixture), v2: runV2(records, fixture) };
}

export function formatSummary(s: EngineSummary): string {
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  const lines = [
    `${s.engine.padEnd(7)} queries=${s.queriesWithExpected} top1=${pct(s.top1Accuracy)} recall@5=${pct(s.recallAt5)} capacity-normalized@5=${pct(s.capacityNormalizedRecallAt5)} MRR=${s.meanReciprocalRank.toFixed(3)} precision@5=${pct(s.precisionAt5)} precision-among-returned=${pct(s.precisionAmongReturnedAt5)} no-result/empty correct=${s.noResultCorrect}/${s.noResultQueries}`,
  ];
  for (const [cat, c] of Object.entries(s.perCategory).sort()) {
    lines.push(`    ${cat.padEnd(13)} n=${String(c.n).padStart(2)} top1=${pct(c.top1).padStart(6)} recall@5=${pct(c.recallAt5).padStart(6)} MRR=${c.mrr.toFixed(3)}`);
  }
  return lines.join('\n');
}
