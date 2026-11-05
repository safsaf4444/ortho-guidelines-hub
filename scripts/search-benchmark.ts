/**
 * scripts/search-benchmark.ts
 * ───────────────────────────
 * Prints the offline search benchmark (legacy substring search vs the v2
 * engine) over the static catalogue.
 *
 *   npx tsx scripts/search-benchmark.ts            summary + per-query table
 *   npx tsx scripts/search-benchmark.ts --verbose  also lists the top-5 ids per query
 *   npx tsx scripts/search-benchmark.ts --json     machine-readable output
 *
 * Read-only. No network, no database, no writes.
 */
import { formatSummary, runBenchmark } from './lib/search-benchmark';

const args = new Set(process.argv.slice(2));
const { legacy, v2 } = runBenchmark();

if (args.has('--json')) {
  console.log(JSON.stringify({ legacy, v2 }, null, 2));
} else {
  console.log('Search benchmark — static catalogue, scripts/tests/fixtures/search-benchmark.json\n');
  console.log(formatSummary(legacy));
  console.log(formatSummary(v2));
  console.log('\nPer query (top-1 hit? / reciprocal rank / results): legacy → v2');
  for (let i = 0; i < legacy.outcomes.length; i++) {
    const a = legacy.outcomes[i];
    const b = v2.outcomes[i];
    const fmt = (o: typeof a) =>
      o.top1 === null
        ? `${o.emptyAsExpected ? 'empty ok' : `NOT empty (${o.results.length})`}`
        : `${o.top1 ? 'hit ' : 'miss'} rr=${(o.reciprocalRank ?? 0).toFixed(2)} n=${o.results.length}`;
    console.log(`  ${a.id} ${a.category.padEnd(13)} ${JSON.stringify(a.query).padEnd(44)} ${fmt(a).padEnd(26)} → ${fmt(b)}`);
    if (args.has('--verbose')) {
      console.log(`       legacy top5: ${a.results.slice(0, 5).join(', ') || '—'}`);
      console.log(`       v2     top5: ${b.results.slice(0, 5).join(', ') || '—'}`);
      if (b.falsePositivesAt5.length && b.top1 !== null) console.log(`       v2 false positives@5: ${b.falsePositivesAt5.join(', ')}`);
    }
  }
}
