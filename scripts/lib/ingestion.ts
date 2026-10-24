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

/**
 * Bumped when a field is added, removed, or changes meaning.
 * v2: POSSIBLE_SAME_DOCUMENT and `documentComparison` (sync-providers no
 * longer treats a loose-only URL match as "already catalogued").
 */
export const CANDIDATE_SCHEMA_VERSION = 2;

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
 *   POSSIBLE_SAME_DOCUMENT
 *                     A discovered link matches a catalogue link only under
 *                     the LOOSE match key (letter case in path or query,
 *                     trailing slashes), not under the conservative identity
 *                     key. It may be the catalogued document under a
 *                     differently-cased link, or a distinct document a
 *                     case-sensitive server tells apart. Neither is assumed:
 *                     a human compares the documents. Never a new-entry
 *                     candidate — approve_staged_guideline() refuses every
 *                     non-NEW_GUIDELINE row. (emitted by sync-providers)
 *                     Added deliberately, not casually: before it existed,
 *                     these links were silently counted as "already in the
 *                     catalogue" and never shown to anyone.
 */
export type ChangeReason =
  | 'NEW_GUIDELINE'
  | 'REVISED'
  | 'WITHDRAWN'
  | 'CONTENT_DRIFT'
  | 'URL_MOVED'
  | 'UNREACHABLE_LINK'
  | 'POSSIBLE_SAME_DOCUMENT';

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
  'POSSIBLE_SAME_DOCUMENT',
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
 * Why a POSSIBLE_SAME_DOCUMENT candidate needs a document comparison: the
 * catalogue entry it loosely matches, the exact catalogue link, and the reason
 * in words. Recorded verbatim in the queue's evidence (soft_match).
 */
export interface DocumentComparison {
  /** Always 'match-key-only': same loose key, different identity key. */
  basis: 'match-key-only';
  /** The catalogue entry whose link matched loosely (first by id, if several). */
  guidelineId: string;
  /** Every catalogue entry sharing the loose key, sorted. Cross-listing is real. */
  guidelineIds: string[];
  /** The catalogue link that matched, exactly as stored in the catalogue. */
  catalogueUrl: string;
  /** The discovered link, exactly as published. */
  discoveredUrl: string;
  /** Human-readable reason, for the reviewer. */
  reason: string;
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

  /** Present exactly when changeReason is POSSIBLE_SAME_DOCUMENT. */
  documentComparison?: DocumentComparison;
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
 * Exactly the characters ECMAScript's `String.prototype.trim()` removes,
 * spelled out so the SQL mirror (`public._url_strip_ver`) can list the
 * same set rather than rely on a locale's idea of whitespace.
 */
const KEY_WHITESPACE = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
const KEY_TRIM = new RegExp(`^[${KEY_WHITESPACE}]+|[${KEY_WHITESPACE}]+$`, 'g');

/** A scheme prefix. Only such strings have their query string inspected. */
const ABSOLUTE_URL = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Query-parameter name `ver`, ASCII case-insensitive, compared raw (undecoded). */
const VER_NAME = /^[Vv][Ee][Rr]$/;

/**
 * Strips every `ver` query parameter from a URL, LEXICALLY: the string is cut
 * and re-joined, never parsed and re-serialised.
 *
 * Scope is deliberately narrow: `ver` only. It exists because BOFAS's DNN CMS
 * appends a `?ver=<cache-busting-token>` to every document link that changes
 * on each republish with no change to the document itself, which made exact
 * URL matching report all 10 BOFAS Publications as "new" on every sync run —
 * see SER-6 follow-up. No catalogue URL uses a `ver` parameter for anything
 * (checked against src/data/guidelines-data.ts before adding this), so
 * removing it cannot collide with a real document identity.
 *
 * The rule, which `public._url_strip_ver` implements identically and
 * scripts/tests/fixtures/url-key-vectors.json pins for both:
 *
 *   - Only a string with a scheme prefix is inspected; anything else is
 *     returned unchanged.
 *   - The fragment starts at the first `#`; the query at the first `?` before
 *     it. A `?ver=` inside a fragment is not a query parameter.
 *   - The query is split on `&`. A segment is a `ver` parameter when the text
 *     before its first `=` (or the whole segment, if it has none) is `ver` in
 *     any ASCII case. The name is NOT percent-decoded: `%76er` is not `ver`.
 *   - If no segment is `ver`, the URL is returned unchanged, byte for byte.
 *     nhfd.co.uk's `?open&<filename>` is the document identity there.
 *   - Otherwise every `ver` segment is removed (repeats included), empty
 *     segments are dropped, the rest are kept verbatim and in order —
 *     repeated non-`ver` parameters included — and `?` is dropped if nothing
 *     remains. The fragment is re-attached unchanged.
 *
 * Why not `new URL()`: the WHATWG serialiser re-encodes the WHOLE URL once
 * anything changes (`a%20b` in the query became `a+b`, `,` became `%2C`, a raw
 * space in the path became `%20`, `/a/../b` collapsed, `:443` vanished), so
 * the key of a `ver` URL depended on encoding details the SQL mirror could not
 * reproduce. Two keys for one document is exactly what this function exists
 * to prevent.
 */
function stripVolatileCacheBustingParam(url: string): string {
  if (!ABSOLUTE_URL.test(url)) return url;

  const hash = url.indexOf('#');
  const head = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? '' : url.slice(hash);
  const q = head.indexOf('?');
  if (q < 0) return url;

  const segments = head.slice(q + 1).split('&');
  const kept = segments.filter(s => !VER_NAME.test(s.split('=', 1)[0]));
  if (kept.length === segments.length) return url;

  const remaining = kept.filter(s => s !== '');
  return head.slice(0, q) + (remaining.length > 0 ? `?${remaining.join('&')}` : '') + fragment;
}

/**
 * MATCH key — a deliberately LOOSE heuristic. Used for candidate IDs, for
 * "is this already in the catalogue?" matching in sync-providers.ts, for
 * staging holds, and for the approval near-match refusal. NOT the queue's
 * document identity: see {@link documentIdentityKey}.
 *
 * In order: trimmed (the ECMAScript trim set), `ver` cache-busting parameters
 * stripped (see stripVolatileCacheBustingParam), ASCII letters lowercased
 * EVERYWHERE — path and query values included — and trailing slashes removed
 * from the end of the whole string. It does not strip other query strings,
 * fragments or `www.`, does not decode or re-encode anything, and does not
 * lowercase non-ASCII letters (Unicode case mapping differs between
 * JavaScript and the database's locale).
 *
 * Because it folds path and query-value case, two DIFFERENT documents can
 * share a match key (`/Docs/A.pdf` vs `/docs/a.pdf` on a case-sensitive
 * server; `?token=AbC` vs `?token=abc`). That is acceptable for a heuristic
 * that proposes "probably the same", and it is why the queue does not use it
 * as identity. Its definition is unchanged from url-key v2 so candidate IDs
 * — and the editor decisions keyed on them — do not move.
 *
 * `public.document_match_key` in
 * supabase/migrations/20261024_discovery_review_queue.sql is its exact SQL
 * mirror. Change both together, and the shared vectors with them.
 *
 * The result is a KEY, never a URL to store or display: original hrefs are
 * kept verbatim in `versions[].url` and in the queue's primary_url.
 */
export function normaliseCandidateUrl(url: string): string {
  const trimmed = url.replace(KEY_TRIM, '');
  return stripVolatileCacheBustingParam(trimmed)
    .replace(/[A-Z]+/g, s => s.toLowerCase())
    .replace(/\/+$/, '');
}

/** Scheme and authority of a scheme-prefixed string; path onwards excluded. */
const SCHEME_AUTHORITY = /^([A-Za-z][A-Za-z0-9+.-]*:)(\/\/[^/?#]*)?/;

/**
 * IDENTITY key — CONSERVATIVE. Defines "the same document" for the review
 * queue: the one-open-row-per-document slot, and exact catalogue matches at
 * approval. Two URLs share an identity key only when they are equivalent
 * under RFC 3986 or under one of exactly two documented, deliberate merges.
 *
 * In order:
 *   1. trim the ECMAScript trim set (whitespace around an href is not part of it);
 *   2. remove `ver` query parameters exactly as {@link normaliseCandidateUrl}
 *      does — DELIBERATE MERGE #1: on BOFAS's DNN CMS (and WordPress assets)
 *      `?ver=` is a cache-buster, so a changed token is the same document. A
 *      changed token is still recorded verbatim, as evidence;
 *   3. lowercase the scheme and the host (after any `userinfo@`) — RFC 3986
 *      §6.2.2.1: both are case-insensitive. Path, query and fragment keep
 *      their case: servers may treat them as case-sensitive;
 *   4. uppercase the hex digits of `%XX` escapes — RFC 3986 §6.2.2.1
 *      (`%3d` ≡ `%3D`). Nothing is decoded or re-encoded;
 *   5. strip trailing `/`s from the PATH only — DELIBERATE MERGE #2: `/a/` and
 *      `/a` are treated as one document. A `/` ending a query value or a
 *      fragment is kept.
 * The fragment is kept verbatim: it never reaches the server, but on
 * hash-routed sites it can select a different document, so keeping it can
 * only split (a visible duplicate), never merge.
 *
 * A non-scheme string is only trimmed and has its trailing path slashes
 * stripped. `public.document_identity_key` is the exact SQL mirror.
 */
export function documentIdentityKey(url: string): string {
  let s = stripVolatileCacheBustingParam(url.replace(KEY_TRIM, ''));
  const asciiLower = (t: string) => t.replace(/[A-Z]+/g, c => c.toLowerCase());
  const m = SCHEME_AUTHORITY.exec(s);
  if (m) {
    let authority = m[2] ?? '';
    const at = authority.lastIndexOf('@');
    authority = at < 0 ? asciiLower(authority) : authority.slice(0, at + 1) + asciiLower(authority.slice(at + 1));
    s = asciiLower(m[1]) + authority + s.slice(m[0].length);
  }
  s = s.replace(/%[0-9A-Fa-f]{2}/g, e => e.toUpperCase());
  const cut = s.search(/[?#]/);
  return cut < 0 ? s.replace(/\/+$/, '') : s.slice(0, cut).replace(/\/+$/, '') + s.slice(cut);
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
