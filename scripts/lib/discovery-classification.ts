/**
 * scripts/lib/discovery-classification.ts
 * ────────────────────────────────────────
 * The discovery pipeline's OWN classification vocabulary, and the record shape
 * that carries it.
 *
 * TYPES AND PURE HELPERS ONLY. No network, no disk, no database.
 *
 * ─── WHY THIS IS NOT `ChangeReason` ─────────────────────────────────────────
 *
 * `ChangeReason` in scripts/lib/ingestion.ts is DATABASE-FACING: its six
 * members are mirrored by the live `staged_guidelines_change_reason_check`
 * constraint, and every member is a promise that some pipeline will produce it
 * and some reviewer will triage it from the queue.
 *
 * The three classes here are a different kind of thing: they are what the
 * DISCOVERY SWEEP concluded about an item it found on a provider's index, before
 * anybody has decided the item is in editorial scope at all. They are reported
 * in files, read by a human, and never inserted anywhere.
 *
 * Keeping them in their own union is deliberate and load-bearing:
 *
 *   - The live approve path (`approve_staged_guideline()`) is INSERT-ONLY and
 *     has no guard refusing a non-NEW_GUIDELINE candidate. A revision-shaped
 *     value reaching the live queue and being approved would insert a DUPLICATE
 *     ROW rather than be refused. The guard that would refuse it is on PR #174
 *     and is NOT LIVE.
 *   - So the safe move is not "extend the union carefully". It is to make the
 *     new vocabulary structurally incapable of reaching that path: a
 *     DiscoveryClass is not a ChangeReason, does not widen it, and will not
 *     satisfy a `change_reason` column.
 *
 * `toChangeReason()` below is the ONLY bridge, and it is intentionally lossy
 * and narrow: it maps exactly one class and refuses the rest. Nothing in this
 * batch calls it; it exists so that a later batch has one auditable place to
 * cross the boundary rather than a cast scattered through a writer.
 */
import type { ChangeReason } from './ingestion';
import type { UrlAlternative } from './url-alternatives';

/** Schema version of the discovery artefact. Independent of CANDIDATE_SCHEMA_VERSION. */
export const DISCOVERY_SCHEMA_VERSION = 1;

/**
 * What the sweep concluded about one discovered item.
 *
 *   NEW_GUIDELINE          No catalogue entry matched on ANY known URL for this
 *                          item (the discovered URL or any recorded alternative),
 *                          and no soft match was found either. The weakest claim
 *                          this pipeline makes: "we hold nothing that looks like
 *                          this".
 *
 *   POSSIBLE_NEW_EDITION   No URL matched, but the title and the publisher set
 *                          overlap an existing entry. EVERY reading stays open:
 *                          a new edition, the same document on a co-publisher's
 *                          host, a sibling document with a similar name, or a
 *                          coincidence. Carries the evidence that produced it
 *                          and requires human verification.
 *
 *   EDITION_TOKEN_CHANGED  A URL matched the catalogue, and a volatile query
 *                          token on it (BOFAS/DNN `?ver=`) DIFFERS FROM THE ONE
 *                          THIS PIPELINE LAST RECORDED.
 *
 *                          Read that literally. It is an observed difference
 *                          between two strings this pipeline wrote down on two
 *                          occasions. It is NOT proof that the provider
 *                          re-uploaded the file, NOT proof the document changed,
 *                          and NOT evidence of a new edition. A DNN `?ver=`
 *                          token can change for reasons that have nothing to do
 *                          with the document — a cache rebuild, a CDN or CMS
 *                          migration, a permissions touch, a site restore, or an
 *                          editor re-saving the page the link sits on. It can
 *                          also legitimately change with no corresponding change
 *                          to the PDF bytes.
 *
 *                          The honest statement, and the only one the pipeline
 *                          makes, is: "the token we recorded is not the token we
 *                          see now." What that means is a question for a human
 *                          with the document open.
 */
export type DiscoveryClass =
  | 'NEW_GUIDELINE'
  | 'POSSIBLE_NEW_EDITION'
  | 'EDITION_TOKEN_CHANGED';

export const ALL_DISCOVERY_CLASSES: readonly DiscoveryClass[] = [
  'NEW_GUIDELINE',
  'POSSIBLE_NEW_EDITION',
  'EDITION_TOKEN_CHANGED',
] as const;

/**
 * Why a soft match fired, in a form a reviewer can audit.
 *
 * Deliberately carries the inputs, not just the score: a reviewer disagreeing
 * with a match needs to see what was compared, and a maintainer tuning the
 * threshold needs the numbers.
 */
export interface SoftMatchEvidence {
  /** Catalogue entry id the soft match points at. */
  guidelineId: string;
  /** That entry's topic, verbatim. */
  guidelineTopic: string;
  /** That entry's raw `source` string, verbatim. */
  guidelineSource: string;
  /** Jaccard overlap of the two topics' significant tokens, 0..1. */
  titleSimilarity: number;
  /** Tokens present in both titles. */
  sharedTitleTokens: string[];
  /** Publisher labels present in both publisher sets. */
  sharedPublishers: string[];
  /** The discovered item's publisher set, as compared. */
  discoveredPublishers: string[];
  /**
   * Publishers that came from the DISCOVERED TITLE rather than the registry
   * entry (see publishersStatedInTitle). Recorded separately because a label
   * found by lookup in a title is weaker evidence than the provider we swept.
   */
  publishersFromTitle: string[];
  /** The catalogue entry's publisher set, as compared. */
  cataloguePublishers: string[];
  /**
   * Plain-language statement of what was and was not established.
   * Written for a reviewer, never parsed.
   */
  statement: string;
}

/** Observation underlying an EDITION_TOKEN_CHANGED classification. */
export interface TokenChangeEvidence {
  /** Query parameter whose value moved (lowercased name, e.g. 'ver'). */
  parameter: string;
  /** Value this pipeline previously recorded, verbatim. */
  previousValue: string;
  /** Value observed on this run, verbatim. */
  observedValue: string;
  /** When the previous value was recorded, ISO-8601. */
  previousObservedAt: string;
  /** The catalogue entry the URL matched. */
  guidelineId: string;
  /** What this does and does not establish. Written for a reviewer. */
  statement: string;
}

/**
 * One item observed on a provider surface, classified.
 *
 * Every URL field is preserved as the provider published it. Nothing here is
 * paraphrased, and no date string is parsed.
 */
export interface DiscoveryCandidate {
  /** Deterministic id; see makeDiscoveryId. */
  discoveryId: string;

  /** Registry key of the provider swept, e.g. 'NHS EBI'. */
  provider: string;
  /** Human-readable provider name. */
  providerName: string;
  /** The surface URL this item was read from. */
  surface: string;

  /** Title exactly as the provider published it. */
  topic: string;

  /**
   * The href the provider published, after relative-reference resolution and
   * nothing else. NEVER rewritten, NEVER normalised, NEVER substituted.
   */
  discoveredUrl: string;

  /**
   * Other URLs known to relate to this item — a redirect target actually
   * observed, or a co-publisher's URL already in the catalogue. Each carries
   * its own evidence and its own explicit non-claim about equivalence.
   * Recording an alternative never replaces `discoveredUrl`.
   */
  urlAlternatives: UrlAlternative[];

  /**
   * Provider-stated date/edition strings, verbatim, each with the surface it
   * was read from. Never parsed into a date. See the scope document §3.
   */
  statedLabels: StatedLabel[];

  classification: DiscoveryClass;

  /** Present only for POSSIBLE_NEW_EDITION. */
  softMatch?: SoftMatchEvidence;
  /** Present only for EDITION_TOKEN_CHANGED. */
  tokenChange?: TokenChangeEvidence;

  /**
   * Catalogue entry this candidate concerns, when one is implicated.
   * Null for NEW_GUIDELINE by definition.
   */
  matchedGuidelineId: string | null;

  /** True for every class except NEW_GUIDELINE found on an empty catalogue slice. */
  verificationRequired: boolean;

  /** ISO-8601 timestamp of the sweep that produced this. Excluded from the id. */
  discoveredAt: string;

  /** Free-text provenance for a reviewer. Never parsed. */
  notes: string;
}

/** A date, edition or version string the PROVIDER stated, kept verbatim. */
export interface StatedLabel {
  /** Where on the surface it came from: 'anchor-text' | 'filename' | 'page-body'. */
  origin: 'anchor-text' | 'filename' | 'page-body';
  /** The string, verbatim and untrimmed of meaning. */
  value: string;
  /** The URL the string was read from. */
  readFrom: string;
  /**
   * The label this value appeared under, when the page gave one
   * (e.g. 'Published', 'Last reviewed'). Verbatim; absent if none.
   */
  fieldLabel?: string;
}

/**
 * Deterministic discovery id: `<provider-key>-<class>-<short hash>`.
 *
 * Hashed over provider, class and the DISCOVERED url — not the alternatives,
 * which can accumulate between runs without the item being a different item.
 * `discoveredAt` is excluded so a stable finding keeps a stable id.
 *
 * Uses the same hashing approach as makeCandidateId in ./ingestion.ts; kept
 * separate so a change to one id scheme cannot silently renumber the other.
 */
export function makeDiscoveryId(input: {
  provider: string;
  classification: DiscoveryClass;
  discoveredUrl: string;
}): string {
  const key = `${input.provider}\u0000${input.classification}\u0000${input.discoveredUrl}`;
  // FNV-1a, 32-bit. Not cryptographic — this is a short readable handle for a
  // human reading a report, not a security boundary.
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  const providerKey = input.provider.toLowerCase().replace(/[^a-z0-9]+/g, '');
  const classKey = input.classification.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return `${providerKey}-${classKey}-${hash.toString(16).padStart(8, '0')}`;
}

/**
 * The ONE place a discovery class may become a database-facing ChangeReason.
 *
 * Refuses everything except NEW_GUIDELINE, because that is the only class the
 * LIVE schema and the LIVE approve path can handle correctly today:
 *
 *   - `staged_guidelines_change_reason_check` admits the six ChangeReason
 *     members and nothing else.
 *   - The live `approve_staged_guideline()` has NO guard rejecting a
 *     non-NEW_GUIDELINE candidate (the 42809 block is on PR #174, not live), so
 *     an edition-shaped row that reached the queue and was approved would be
 *     INSERTED AS A DUPLICATE rather than refused.
 *
 * Nothing in batch 1 calls this — batch 1 writes files only. It exists so the
 * boundary has a single auditable crossing point with the reasoning attached,
 * instead of a cast appearing inside some future writer.
 */
export function toChangeReason(cls: DiscoveryClass): ChangeReason {
  if (cls === 'NEW_GUIDELINE') return 'NEW_GUIDELINE';
  throw new Error(
    `toChangeReason: refusing to map discovery class ${cls} to a ChangeReason. ` +
      'The live staging schema cannot represent it and the live approve path would ' +
      'insert it as a duplicate row rather than refuse it (the 42809 guard is on ' +
      'PR #174 and is not applied). Review it from the discovery report instead.',
  );
}
