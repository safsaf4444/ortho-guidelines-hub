/**
 * Heuristic duplicate detection for the guidelines catalogue.
 *
 * Pure, derived, read-only: never merges, deletes, or mutates records.
 * Produces a scored list of candidate pairs with human-readable reasons
 * so an editor can review and decide manually.
 */
import type { Guideline } from '../data/guidelines-data';

export interface DuplicateCandidate {
  a: Guideline;
  b: Guideline;
  score: number;
  reasons: string[];
}

// Generic structural words that don't distinguish one clinical topic from
// another. Deliberately does NOT strip clinically meaningful qualifiers
// like "acute"/"chronic"/"syndrome" — those change what the topic *is*.
const STOPWORDS = new Set([
  'guideline', 'guidelines', 'pathway', 'pathways', 'protocol', 'protocols',
  'management', 'the', 'and', 'of', 'for', 'a', 'an', ' ',
]);

function topicTokens(topic: string): Set<string> {
  return new Set(
    topic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !STOPWORDS.has(w))
  );
}

function normalizedTopicKey(topic: string): string {
  return [...topicTokens(topic)].sort().join(' ');
}

// Normalize a source label so trivial punctuation/spacing differences don't
// stop two records that share a source (e.g. 'BESS / BOA' vs 'BESS/BOA').
function normalizedSource(source: string): string {
  return (source || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) if (b.has(token)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function normalizeUrl(url: string): string | null {
  if (!url || url === '#') return null;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/+$/, '');
  } catch {
    return url.toLowerCase().trim();
  }
}

// A topic match on its own is a weak signal within a busy specialty, so we
// require topic similarity AND a matching source before surfacing it. The
// threshold is deliberately high to distinguish sibling topics from the same
// society (e.g. 'BESS frozen shoulder' vs 'BESS subacromial pain').
const SIMILAR_TOPIC_THRESHOLD = 0.85;
const SURFACE_THRESHOLD = 0.8;

// A URL that appears across many guidelines is a generic landing / index page
// (e.g. a society's guidelines hub), not evidence that two specific records are
// duplicates. URLs shared by more than this many distinct guidelines are ignored
// as duplicate signals.
const GENERIC_URL_MAX_OWNERS = 2;

const WEIGHTS = {
  exactTopicSameSource: 1.0,
  similarTopicSameSource: 0.85,
  sharedSpecificUrl: 0.9,
  currentArchivedPair: 0.8,
};

function isArchived(g: Guideline): boolean {
  return Boolean(g.archived) || g.status === 'Archived';
}

/** Sorted, stable key identifying an unordered pair — used for dismiss-tracking. */
export function pairKey(a: Guideline, b: Guideline): string {
  return [a.id, b.id].sort().join('::');
}

function guidelineUrls(g: Guideline): string[] {
  return g.versions
    .map((v) => normalizeUrl(v.url))
    .filter((u): u is string => u !== null);
}

/**
 * Count, for every normalized URL, how many distinct guidelines reference it.
 * Used to strip out generic index / landing pages before URL matching.
 */
function buildUrlOwnerCounts(guidelines: Guideline[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const g of guidelines) {
    for (const url of new Set(guidelineUrls(g))) {
      counts.set(url, (counts.get(url) ?? 0) + 1);
    }
  }
  return counts;
}

export function findDuplicateCandidates(guidelines: Guideline[]): DuplicateCandidate[] {
  const results: DuplicateCandidate[] = [];
  const urlOwnerCounts = buildUrlOwnerCounts(guidelines);

  // Only URLs pointing at a specific document (not shared as a generic index
  // page) count as duplicate evidence.
  const specificUrls = (g: Guideline): Set<string> =>
    new Set(
      guidelineUrls(g).filter(
        (u) => (urlOwnerCounts.get(u) ?? 0) <= GENERIC_URL_MAX_OWNERS
      )
    );

  for (let i = 0; i < guidelines.length; i++) {
    const a = guidelines[i];
    const tokensA = topicTokens(a.topic);
    const keyA = normalizedTopicKey(a.topic);
    const sourceA = normalizedSource(a.source);
    const urlsA = specificUrls(a);

    for (let j = i + 1; j < guidelines.length; j++) {
      const b = guidelines[j];
      const reasons: string[] = [];
      let score = 0;

      const tokensB = topicTokens(b.topic);
      const keyB = normalizedTopicKey(b.topic);
      const sameSource = sourceA === normalizedSource(b.source);
      const similarity = jaccardSimilarity(tokensA, tokensB);

      // Topic signals only count when the source also matches. This avoids
      // flagging distinct sibling topics published by the same society.
      if (sameSource && keyA && keyA === keyB) {
        reasons.push(`Same topic and source (${a.source})`);
        score = Math.max(score, WEIGHTS.exactTopicSameSource);
      } else if (sameSource && similarity >= SIMILAR_TOPIC_THRESHOLD) {
        reasons.push(
          `Same source (${a.source}) with very similar topic (${Math.round(
            similarity * 100
          )}% token overlap)`
        );
        score = Math.max(score, WEIGHTS.similarTopicSameSource);
      }

      // A shared specific document URL is strong evidence on its own.
      const urlsB = specificUrls(b);
      if ([...urlsB].some((u) => urlsA.has(u))) {
        reasons.push('Same document URL appears in version links');
        score = Math.max(score, WEIGHTS.sharedSpecificUrl);
      }

      // A current vs archived pairing only matters once the pair already looks
      // like a duplicate on topic+source grounds.
      if (
        isArchived(a) !== isArchived(b) &&
        sameSource &&
        (keyA === keyB || similarity >= SIMILAR_TOPIC_THRESHOLD)
      ) {
        reasons.push('Current vs archived near-duplicate pair');
        score = Math.max(score, WEIGHTS.currentArchivedPair);
      }

      if (reasons.length > 0 && score >= SURFACE_THRESHOLD) {
        results.push({ a, b, score, reasons });
      }
    }
  }

  return results.sort((x, y) => y.score - x.score);
}

/**
 * Number of *unique guidelines* that have at least one candidate duplicate.
 *
 * This is what the UI badge should show — counting matched pairs overstates the
 * problem because N mutually-similar records produce N*(N-1)/2 pairs.
 */
export function countGuidelinesWithDuplicates(
  candidates: DuplicateCandidate[]
): number {
  const ids = new Set<string>();
  for (const c of candidates) {
    ids.add(c.a.id);
    ids.add(c.b.id);
  }
  return ids.size;
}
