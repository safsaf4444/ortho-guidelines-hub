/**
 * src/lib/search/legacy.ts
 * ────────────────────────
 * The search the public app performs today, lifted verbatim from
 * src/App.tsx (`filteredData`, the `searchQuery` branch) so the benchmark
 * can compare old and new behaviour on identical input.
 *
 * It is a case-insensitive SUBSTRING test of the whole query against topic,
 * summary and source, with no ranking: survivors keep catalogue order and the
 * UI then groups them by section. App.tsx is not changed by this module and
 * does not import it.
 */
import type { SearchableRecord } from './engine';

export function legacySubstringSearch<T extends SearchableRecord>(records: readonly T[], query: string): T[] {
  if (!query) return [...records];
  const q = query.toLowerCase();
  return records.filter(
    (g) =>
      (g.topic ?? '').toLowerCase().includes(q) ||
      (g.summary ?? '').toLowerCase().includes(q) ||
      (g.source ?? '').toLowerCase().includes(q),
  );
}
