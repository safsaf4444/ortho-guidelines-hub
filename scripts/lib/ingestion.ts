/**
 * scripts/lib/ingestion.ts
 * ────────────────────────
 * PHASE 1 of the unified provider-ingestion contract.
 *
 * This module is TYPES + PURE FUNCTIONS ONLY. It performs no I/O: no fetch, no
 * filesystem access, no Supabase client, no GitHub calls, no environment reads.
 * Importing it can never trigger a network request or a write, which is what
 * makes it safe for all three pipelines to depend on.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * The hub currently runs three overlapping checkers that each invented their own
 * output shape:
 *
 *   scripts/sync-providers.ts   discovers NEW items from a provider index
 *   scripts/detect-changes.ts   hashes known URLs, flags CONTENT DRIFT
 *   scripts/flag-dead-links.ts  HTTP-status sweep, flags LINK ROT
 *
 * They answer the same underlying question — "is there something here a human
 * should look at?" — in three incompatible vocabularies, so their findings
 * cannot be merged, counted together, or reviewed in one place.
 *
 * `IngestionCandidate` is that common vocabulary. A candidate is a PROPOSAL for
 * human review and nothing more. Producing one has no side effects and confers
 * no authority to change the catalogue.
 *
 * ─── SCOPE OF PHASE 1 (deliberately narrow) ─────────────────────────────────
 *
 * Only scripts/sync-providers.ts emits this shape so far, and only for the
 * NEW_GUIDELINE reason. detect-changes.ts and flag-dead-links.ts are UNTOUCHED
 * and still emit their own shapes. The remaining ChangeReason members are
 * declared here so the vocabulary is fixed once rather than renegotiated per
 * pipeline — they are not yet produced by anything.
 *
 * ─── THE MATCHING LIMITATION THIS DOES NOT YET FIX ──────────────────────────
 *
 * Matching against the catalogue is URL-only today. A URL-only match cannot
 * detect WITHDRAWN: when a provider deletes a guideline, its URL simply stops
 * appearing in the provider index, and an absence is invisible to a diff that
 * only ever looks up URLs it has already seen. Fixing that needs a stable
 * per-provider identifier (`providerRef` — "TA991", "NG226") so a candidate can
 * be tied to a catalogue row independently of its URL. The field is declared
 * below and is intentionally left unpopulated in phase 1; backfilling it is a
 * separate piece of work.
 */

import { createHash } from 'node:crypto';

/** Bumped when a field is added, removed, or changes meaning. */
export const CANDIDATE_SCHEMA_VERSION = 1;

/** Which checker produced a candidate. */
export type PipelineId = 'sync-providers' | 'detect-changes' | 'flag-dead-links';

/**
 * Why a human is being asked to look at this.
 *
 * PHASE 1 STATUS: only NEW_GUIDELINE is emitted by any pipeline. The rest are
 * reserved so that the three checkers converge on one vocabulary instead of
 * inventing a fourth. This is the agreed category set for the ingestion
 * roadmap — do not extend it casually: every member is a promise that some
 * pipeline will eventually produce it and some reviewer will have to triage it.
 *
 *   NEW_GUIDELINE     Provider publishes something with no match in the
 *                     catalogue. (emitted by sync-providers)
 *   REVISED           Known guideline republished by the provider as a new
 *                     version or edition.
 *   WITHDRAWN         Known guideline no longer offered by the provider. NOT
 *                     DETECTABLE under URL-only matching — see the module
 *                     header.
 *   CONTENT_DRIFT     Known URL still resolves but its content hash moved.
 *                     (reserved for detect-changes)
 *   URL_MOVED         Known guideline now served from a different URL —
 *                     content intact, location changed (redirect or republish
 *                     at a new path).
 *   UNREACHABLE_LINK  Known URL no longer resolves acceptably.
 *                     (reserved for flag-dead-links)
 */
export type ChangeReason =
  | 'NEW_GUIDELINE'
  | 'REVISED'
  | 'WITHDRAWN'
  | 'CONTENT_DRIFT'
  | 'URL_MOVED'
  | 'UNREACHABLE_LINK';

/**
 * Runtime mirror of the ChangeReason union, in declaration order. Exists so
 * tests and future report tooling can enumerate the vocabulary — a bare type
 * union erases at runtime and cannot be iterated. The `satisfies` check makes
 * divergence from the type a compile error in either direction.
 */
export const ALL_CHANGE_REASONS = [
  'NEW_GUIDELINE',
  'REVISED',
  'WITHDRAWN',
  'CONTENT_DRIFT',
  'URL_MOVED',
  'UNREACHABLE_LINK',
] as const satisfies readonly ChangeReason[];

/**
 * Human review state.
 *
 * Every candidate is born `pending`. Nothing in phase 1 writes any other value:
 * there is no approval path in this module, and no pipeline advances the state.
 * The other members exist so a future reviewer UI has somewhere to record a
 * decision.
 */
export type ReviewStatus = 'pending' | 'accepted' | 'rejected' | 'deferred';

/** One link attached to a candidate. Mirrors the catalogue's versions[] shape. */
export interface CandidateVersionLink {
  label: string;
  url: string;
  date?: string;
}

/**
 * A single proposal for human review.
 *
 * All text fields are VERBATIM from the provider. Nothing in this pipeline
 * paraphrases, summarises, or otherwise rewrites provider copy — whitespace
 * collapsing and a fixed-length truncation are the only permitted transforms,
 * and both are deterministic.
 */
export interface IngestionCandidate {
  /** Deterministic, content-derived. See {@link makeCandidateId}. */
  candidateId: string;

  /** Which checker produced this. */
  pipeline: PipelineId;

  /** Short provider tag as used in the catalogue's `source` field, e.g. 'BOA'. */
  provider: string;

  /** Human-readable adapter/provider name, e.g. 'British Orthopaedic Association (BOASt)'. */
  providerName: string;

  /** Guideline title, verbatim from the provider. */
  topic: string;

  /** Provider-supplied summary, verbatim and truncated. Absent when none offered. */
  summary?: string;

  /** All links discovered for this candidate. Always at least one. */
  versions: CandidateVersionLink[];

  /**
   * The link this candidate is keyed on — `versions[0].url`, normalised by
   * {@link normaliseCandidateUrl}. Held separately so the ID and the match
   * lookup cannot drift apart from each other.
   */
  primaryUrl: string;

  changeReason: ChangeReason;

  reviewStatus: ReviewStatus;

  /** ISO-8601 timestamp of the run that produced this. Excluded from the ID. */
  discoveredAt: string;

  /**
   * Catalogue row this candidate corresponds to, when known.
   * Always null for NEW_GUIDELINE — by definition nothing matched.
   */
  matchedGuidelineId: string | null;

  /**
   * Stable provider-side identifier ("TA991", "NG226", "BOAST-4").
   *
   * RESERVED — always null in phase 1. Populating it is what would make
   * WITHDRAWN detectable; see the module header.
   */
  providerRef: string | null;

  /** Free-text provenance for a reviewer. Never parsed. */
  notes?: string;
}

/**
 * One pipeline run against one provider/adapter.
 *
 * The three counters are a coverage assertion, not decoration. They must satisfy
 * `totalDiscovered === matchedExisting + skippedBlocked + candidates.length`,
 * which is what lets a reviewer confirm no discovered item was silently dropped.
 * {@link summariseReport} checks exactly that.
 */
export interface CandidateReport {
  pipeline: PipelineId;
  /** Adapter display name. */
  adapter: string;
  /** Provider tag, e.g. 'BOA'. */
  provider: string;
  /** ISO-8601 timestamp for this adapter's run. */
  generatedAt: string;
  /** Items the adapter returned before any filtering. */
  totalDiscovered: number;
  /** Items whose primary URL was already in the catalogue. */
  matchedExisting: number;
  /** Items short-circuited because their host is in blocked-sources.json. */
  skippedBlocked: number;
  /** Items needing review. */
  candidates: IngestionCandidate[];
  /** Populated when the adapter threw; `candidates` will be empty. */
  error?: string;
}

// ─── pure helpers ────────────────────────────────────────────────────────────

/**
 * Canonical URL form for matching and for ID derivation.
 *
 * Lowercase, trimmed, trailing slashes removed. Intentionally conservative: it
 * does NOT strip query strings, fragments, or `www.`, because on these hosts
 * those can be load-bearing — nhfd.co.uk serves distinct documents from
 * `/FFFAP/Resources.nsf/doc?open&<filename>`, where the query string IS the
 * document identity.
 *
 * This mirrors the normalisation sync-providers.ts already applied when building
 * its URL index, so match behaviour is unchanged from before phase 1.
 */
export function normaliseCandidateUrl(url: string): string {
  return url.toLowerCase().trim().replace(/\/+$/, '');
}

/**
 * Canonical provider key. Used for BOTH halves of a candidate ID — the hash
 * input and the readable prefix — so the two can never disagree.
 *
 * Lowercases, then drops every character that is not an ASCII letter or digit.
 * `BOA`, `B.O.A.`, `  boa  `, `-B-O-A-` and `B O A` all yield `boa`.
 *
 * EXACT GUARANTEE, no wider: two labels produce the same key if and only if
 * their lowercased ASCII-alphanumeric subsequences are identical. Case,
 * whitespace and punctuation are erased; letters and digits are not.
 *
 * Two consequences, stated here rather than left to be discovered:
 *
 *   - Labels differing ONLY in separators are treated as the same provider for
 *     ID purposes. Accepted deliberately — separators carry no identity here,
 *     and a full ID collision would additionally require an identical pipeline,
 *     changeReason and URL, at which point the two records describe the same
 *     document anyway.
 *   - Non-ASCII characters are DROPPED, not transliterated. `BOÁ` yields `bo`,
 *     so labels distinguished only by accented or non-Latin characters collide.
 *     Every provider tag in this catalogue is ASCII today; revisit if that
 *     stops being true.
 */
export function canonicalProviderKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/** Inputs that determine a candidate's identity. Deliberately excludes timestamps. */
export interface CandidateIdInput {
  pipeline: PipelineId;
  /** Raw provider label; reduced to its {@link canonicalProviderKey} internally. */
  provider: string;
  changeReason: ChangeReason;
  /** Raw or normalised; normalised internally either way. */
  primaryUrl: string;
}

/**
 * Deterministic candidate ID.
 *
 * Stable across runs, machines, and orderings: the same provider + reason + URL
 * always yields the same ID, so re-running a sweep produces the same IDs rather
 * than a fresh set of apparently-new items. That is what will later allow a
 * reviewer's decision to survive the next run, and what lets two pipelines
 * recognise that they have found the same thing.
 *
 * The run timestamp is excluded on purpose — including it would make every run
 * look entirely new.
 *
 * Shape: `<provider-slug>-<reason-slug>-<sha256[0..11]>`, e.g.
 * `boa-new-guideline-3f9a1c07b2d4`. The prefix is for human legibility when
 * skimming a report; the hash carries the uniqueness.
 *
 * Both halves derive from the same {@link canonicalProviderKey}, so the whole
 * ID — prefix included — is invariant to provider-label differences that are
 * only case, whitespace or punctuation. It is NOT invariant to anything else:
 * a label differing by even one letter or digit yields a different ID.
 */
export function makeCandidateId(input: CandidateIdInput): string {
  const url = normaliseCandidateUrl(input.primaryUrl);

  // One canonical key feeds both the hash and the visible prefix. Deriving them
  // separately is what let an earlier revision claim punctuation-invariance
  // while "BOA" and "B.O.A." still produced different IDs — the hyphen-slug used
  // for the prefix collapses punctuation to '-', which is not the same thing as
  // erasing it. Reusing one key makes the guarantee structural rather than a
  // property two expressions happen to share.
  const provider = canonicalProviderKey(input.provider);

  // NUL separator: cannot occur in any of the components, so the joined string
  // is unambiguous and two different field splits can never collide.
  const material = [input.pipeline, provider, input.changeReason, url].join('\u0000');
  const digest = createHash('sha256').update(material, 'utf8').digest('hex').slice(0, 12);
  return `${provider}-${slug(input.changeReason)}-${digest}`;
}

/** Lowercase, non-alphanumerics collapsed to single hyphens, edges trimmed. */
function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Coverage check for a report: every discovered item must be accounted for as
 * matched, blocked, or a candidate.
 *
 * Returns the shortfall rather than throwing — a miscount is a reporting bug
 * worth surfacing loudly in the artifact, not a reason to abort a read-only
 * sweep and lose the rest of the results.
 */
export function summariseReport(report: CandidateReport): {
  accountedFor: number;
  unaccountedFor: number;
  balanced: boolean;
} {
  const accountedFor = report.matchedExisting + report.skippedBlocked + report.candidates.length;
  const unaccountedFor = report.totalDiscovered - accountedFor;
  return { accountedFor, unaccountedFor, balanced: unaccountedFor === 0 };
}
