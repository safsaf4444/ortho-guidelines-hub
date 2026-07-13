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
  'management', 'the', 'and', 'of', 'for', 'a', 'an', '&',
]);

function topicTokens(topic: string): Set<string> {
  return new Set(
    topic
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w && !STOPWORDS.has(w))
  );
}

function normalizedTopicKey(topic: string): string {
  return [...topicTokens(topic)].sort().join(' ');
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

const SIMILAR_TOPIC_THRESHOLD = 0.8;
const SOURCE_SIMILAR_TOPIC_THRESHOLD = 0.55;
const SURFACE_THRESHOLD = 0.5;

const WEIGHTS = {
  exactTopic: 1.0,
  similarTopic: 0.8,
  sameSourceSimilarTopic: 0.5,
  sharedUrl: 0.9,
  currentArchivedPair: 0.6,
};

function isArchived(g: Guideline): boolean {
  return Boolean(g.archived) || g.status === 'Archived';
}

/** Sorted, stable key identifying an unordered pair — used for dismiss-tracking. */
export function pairKey(a: Guideline, b: Guideline): string {
  return [a.id, b.id].sort().join('::');
}

export function findDuplicateCandidates(guidelines: Guideline[]): DuplicateCandidate[] {
  const results: DuplicateCandidate[] = [];

  for (let i = 0; i < guidelines.length; i++) {
    const a = guidelines[i];
    const tokensA = topicTokens(a.topic);
    const keyA = normalizedTopicKey(a.topic);
    const urlsA = new Set(a.versions.map(v => normalizeUrl(v.url)).filter((u): u is string => u !== null));

    for (let j = i + 1; j < guidelines.length; j++) {
      const b = guidelines[j];
      const reasons: string[] = [];
      let score = 0;

      const tokensB = topicTokens(b.topic);
      const keyB = normalizedTopicKey(b.topic);
      const similarity = jaccardSimilarity(tokensA, tokensB);

      if (keyA && keyA === keyB) {
        reasons.push('Same normalized topic');
        score = Math.max(score, WEIGHTS.exactTopic);
      } else if (similarity >= SIMILAR_TOPIC_THRESHOLD) {
        reasons.push(`Very similar topic text (${Math.round(similarity * 100)}% token overlap)`);
        score = Math.max(score, WEIGHTS.similarTopic);
      } else if (a.source === b.source && similarity >= SOURCE_SIMILAR_TOPIC_THRESHOLD) {
        reasons.push(`Same source (${a.source}) with similar topic`);
        score = Math.max(score, WEIGHTS.sameSourceSimilarTopic);
      }

      const urlsB = b.versions.map(v => normalizeUrl(v.url)).filter((u): u is string => u !== null);
      if (urlsB.some(u => urlsA.has(u))) {
        reasons.push('Same URL appears in version links');
        score = Math.max(score, WEIGHTS.sharedUrl);
      }

      if (isArchived(a) !== isArchived(b) && (keyA === keyB || similarity >= SOURCE_SIMILAR_TOPIC_THRESHOLD)) {
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
