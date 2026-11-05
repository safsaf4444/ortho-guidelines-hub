/**
 * scripts/lib/coverage-gap.ts
 * ───────────────────────────
 * Coverage-gap detector: what a provider surface lists, compared with what a
 * CATALOGUE SNAPSHOT holds. PURE — no network, no disk, no database. Every
 * input is passed in, so it runs identically against fixtures and against a
 * parse of a live page.
 *
 * ─── WHAT IT IS, AND IS NOT ─────────────────────────────────────────────────
 *
 * It produces REVIEW SIGNALS. Every finding carries the class, the matched
 * catalogue entry (if any), the reasons in words, the evidence that was
 * compared, and a proposed editorial action. Nothing here changes a status,
 * stages a row or publishes anything; it has no code path that could.
 *
 * The comparison is against whatever `guidelines` array it is given — by
 * default the generated static snapshot `src/data/guidelines-data.ts`, which is
 * dated in its header. A snapshot is not production: the report says so in
 * every rendering (`snapshotLabel`).
 *
 * ─── HOW MATCHING WORKS (reuse first) ───────────────────────────────────────
 *
 *   1. URL identity, via the existing keys in scripts/lib/ingestion.ts:
 *        documentIdentityKey  (conservative)  → exact representation
 *        normaliseCandidateUrl (loose)        → "possible same document"
 *      Keys held by more than GENERIC_URL_MAX_OWNERS entries are index pages
 *      (the catalogue's "Fallback / index page" links) and never identify a
 *      document.
 *   2. Publisher identifiers that survive a change of address: a DOI
 *      (only the explicit host/path allow-list below) and a BOA
 *      asset GUID (`/asset/<GUID>/` and `/static/<guid>/…`). These are exact
 *      identifier matches, reported as such.
 *   3. The existing classifier, scripts/lib/edition-match.ts `classify()`, for
 *      everything else: its soft match (publisher overlap + title tokens) and
 *      its volatile-token comparison, with its evidence objects carried through
 *      verbatim.
 *
 * Publisher-declared states are read ONLY from what the surface itself said —
 * a section heading or a stated label containing archived / withdrawn /
 * superseded / replaced / retired wording, or an observed redirect supplied by
 * the caller. Title similarity never produces one.
 */
import type { Guideline } from '../../src/data/guidelines-data';
import {
  buildCatalogueIndex,
  classify,
  GENERIC_URL_MAX_OWNERS,
  publisherSetOf,
  publishersStatedInTitle,
  softMatches,
  type CatalogueIndex,
} from './edition-match';
import { documentIdentityKey, normaliseCandidateUrl } from './ingestion';
import type { DiscoveryCandidate, SoftMatchEvidence, StatedLabel, TokenChangeEvidence } from './discovery-classification';
import type { DiscoveredRecord, SurfaceParse } from '../adapters/types';
import type { UrlAlternative } from './url-alternatives';
import { declaredStatusWording } from './status-wording';

// ─── Classes ────────────────────────────────────────────────────────────────

export type GapClass =
  | 'ALREADY_REPRESENTED'
  | 'POSSIBLE_SAME_DOCUMENT'
  | 'POTENTIALLY_NEW'
  | 'POSSIBLE_UPDATED_VERSION'
  | 'PUBLISHER_DECLARED_MOVED'
  | 'PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED'
  | 'AMBIGUOUS_REVIEW';

export const ALL_GAP_CLASSES: readonly GapClass[] = [
  'ALREADY_REPRESENTED',
  'POSSIBLE_SAME_DOCUMENT',
  'POTENTIALLY_NEW',
  'POSSIBLE_UPDATED_VERSION',
  'PUBLISHER_DECLARED_MOVED',
  'PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED',
  'AMBIGUOUS_REVIEW',
];

/** What a reviewer is asked to do. Never "publish", never "withdraw". */
export type ProposedAction =
  | 'none'
  | 'compare-documents'
  | 'editor-assess-new'
  | 'editor-check-edition'
  | 'editor-record-new-address'
  | 'editor-read-publisher-status'
  | 'editor-disambiguate';

export interface GapFinding {
  class: GapClass;
  topic: string;
  discoveredUrl: string;
  sectionHeading?: string;
  statedLabels: StatedLabel[];
  /** The catalogue entry most implicated, or null. */
  matchedGuidelineId: string | null;
  /** Other entries that also match (two-owner URLs, several soft matches). */
  alsoMatches: string[];
  /** Plain-language reasons, in the order they were established. */
  reasons: string[];
  evidence: {
    identityKey: string;
    matchKey: string;
    identifier?: { kind: 'doi' | 'boa-asset-guid'; value: string };
    softMatch?: SoftMatchEvidence;
    tokenChange?: TokenChangeEvidence;
    redirect?: UrlAlternative;
    publisherStatus?: { readFrom: 'section-heading' | 'stated-label'; value: string };
    statedYears: number[];
    catalogueYears: number[];
    /**
     * How the newest year the publisher states compares with the newest year
     * the matched catalogue entry records. A hint for the reviewer, never a
     * decision: 'earlier-year' usually means a historical edition of a series
     * entry; 'later-year' is the one worth opening first.
     */
    editionHint?: 'later-year' | 'same-year' | 'earlier-year' | 'no-year';
  };
  proposedAction: ProposedAction;
  /** Set by the multi-provider aggregator: the same document was seen on another provider's surface. */
  alsoDiscoveredVia?: string[];
}

export interface GapInput {
  provider: string;
  providerName: string;
  /** The catalogue's canonical label for this publisher (registry.catalogueProvider). */
  catalogueProvider: string;
  surfaceUrl: string;
  parse: SurfaceParse;
  /** Items a scope gate declined, already decided by the caller; reported, never classified. */
  filtered?: Array<{ url: string; topic: string; reason: string }>;
  guidelines: readonly Guideline[];
  /**
   * Observed redirects for discovered URLs (requested → final), when the
   * caller fetched documents or has fixture knowledge. A redirect is the
   * publisher declaring a new address. Absent means "not observed".
   */
  redirects?: Record<string, string>;
  /** Volatile-token observations from a previous run, keyed by match key. */
  previousTokens?: Record<string, { parameter: string; value: string; observedAt: string }>;
  discoveredAt: string;
  /** Catalogue snapshot provenance, printed on every report. */
  snapshotLabel: string;
}

export interface GapReport {
  provider: string;
  providerName: string;
  surfaceUrl: string;
  snapshotLabel: string;
  itemsParsed: number;
  byClass: Record<GapClass, number>;
  findings: GapFinding[];
  excluded: SurfaceParse['excluded'];
  filtered: NonNullable<GapInput['filtered']>;
  /** itemsParsed === findings.length + filtered.length */
  balanced: boolean;
}

// ─── Identifiers that survive a change of address ───────────────────────────
//
// An identifier is accepted ONLY from a recognised host and path structure.
// A DOI-shaped string in a query parameter, a fragment, or on an unrelated
// host establishes nothing: anyone can put "10.1038/…" in a link. Unsupported
// forms return null and the item falls through to the loose/soft matching
// (and so to editorial review), never to ALREADY_REPRESENTED by identifier.

const DOI_SUFFIX = /^10\.\d{4,9}\/[A-Za-z0-9._;()/:-]+$/;

function cleanDoi(raw: string): string | null {
  let d = raw;
  try { d = decodeURIComponent(raw); } catch { /* keep */ }
  // This came from a parsed URL path, not prose. Trailing punctuation can be
  // part of a registered DOI and must not collapse two identifiers.
  return DOI_SUFFIX.test(d) ? d.toLowerCase() : null;
}

/**
 * A DOI from a RECOGNISED URL form only:
 *   https://doi.org/<doi>, https://dx.doi.org/<doi>
 *   https://link.springer.com/article/<doi>, https://*.biomedcentral.com/articles/<doi>
 *   https://www.nature.com/articles/<suffix>  → 10.1038/<suffix>  (Springer Nature; stated rule)
 * Query strings and fragments are never read. Any other host → null.
 */
export function doiOf(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname;
  if (host === 'doi.org' || host === 'dx.doi.org') return cleanDoi(path.replace(/^\/+/, ''));
  if (host === 'link.springer.com') { const m = /^\/article\/(10\..+)$/.exec(path); return m ? cleanDoi(m[1]) : null; }
  if (host.endsWith('.biomedcentral.com')) { const m = /^\/articles\/(10\..+)$/.exec(path); return m ? cleanDoi(m[1]) : null; }
  if (host === 'nature.com') {
    const m = /^\/articles\/([A-Za-z0-9.-]+?)(?:\.epdf|\.pdf)?\/?$/.exec(path);
    return m ? cleanDoi(`10.1038/${m[1]}`) : null;
  }
  return null;
}

const BOA_GUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/;

/**
 * A BOA asset GUID from BOA's OWN host and asset paths only:
 *   https://www.boa.ac.uk/asset/<GUID>/        (GUID may use %2D for '-')
 *   https://www.boa.ac.uk/static/<guid>/<file>
 * Normalised for comparison only (`%2D` → `-`, upper-case); the catalogue's
 * stored URL is never rewritten. Any other host → null.
 */
export function boaAssetGuidOf(url: string): string | null {
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (host !== 'boa.ac.uk' && host !== 'www.boa.ac.uk') return null;
  const m = /^\/(asset|static)\/([^/]+)(?:\/|$)/.exec(u.pathname);
  if (!m) return null;
  const guid = m[2].replace(/%2d/gi, '-').toUpperCase();
  return BOA_GUID.test(guid) ? guid : null;
}

// ─── Catalogue views ────────────────────────────────────────────────────────

interface CatalogueView {
  index: CatalogueIndex;
  /** identity key → entry ids holding a version with that key */
  byIdentity: Map<string, string[]>;
  /** loose key → entry ids */
  byLoose: Map<string, string[]>;
  byDoi: Map<string, string[]>;
  byBoaGuid: Map<string, string[]>;
  byId: Map<string, Guideline>;
}

function push(map: Map<string, string[]>, key: string, id: string): void {
  const list = map.get(key);
  if (!list) map.set(key, [id]);
  else if (!list.includes(id)) list.push(id);
}

export function buildCatalogueView(guidelines: readonly Guideline[]): CatalogueView {
  const view: CatalogueView = {
    index: buildCatalogueIndex(guidelines),
    byIdentity: new Map(),
    byLoose: new Map(),
    byDoi: new Map(),
    byBoaGuid: new Map(),
    byId: new Map(),
  };
  for (const g of guidelines) {
    view.byId.set(g.id, g);
    for (const v of g.versions) {
      if (!v.url || v.url === '#') continue;
      push(view.byIdentity, documentIdentityKey(v.url), g.id);
      push(view.byLoose, normaliseCandidateUrl(v.url), g.id);
      const doi = doiOf(v.url);
      if (doi) push(view.byDoi, doi, g.id);
      const guid = boaAssetGuidOf(v.url);
      if (guid) push(view.byBoaGuid, guid, g.id);
    }
  }
  return view;
}

// ─── Years, as stated ───────────────────────────────────────────────────────

const YEAR_RE = /\b(19\d{2}|20\d{2})\b/g;

export function yearsIn(text: string | undefined): number[] {
  if (!text) return [];
  const out = new Set<number>();
  for (const m of text.matchAll(YEAR_RE)) out.add(Number(m[1]));
  return [...out].sort((a, b) => a - b);
}

function catalogueYearsOf(g: Guideline): number[] {
  const out = new Set<number>();
  for (const y of yearsIn(g.subGroup)) out.add(y);
  for (const v of g.versions) {
    for (const y of yearsIn(v.label)) out.add(y);
    for (const y of yearsIn(v.date)) out.add(y);
  }
  return [...out].sort((a, b) => a - b);
}

// ─── Publisher-declared status wording ──────────────────────────────────────

function publisherStatusOf(item: DiscoveredRecord): GapFinding['evidence']['publisherStatus'] | undefined {
  if (declaredStatusWording(item.sectionHeading)) {
    return { readFrom: 'section-heading', value: item.sectionHeading! };
  }
  for (const l of item.statedLabels) {
    if (declaredStatusWording(l.value)) return { readFrom: 'stated-label', value: l.value };
  }
  return undefined;
}

/**
 * Identifier matching exists ONLY in this read-only tool. The discovery runner
 * (scripts/discover.ts → edition-match.ts classify()) matches by URL keys and
 * title soft-match and has no identifier rule, so the same item appears there
 * under its own URL/title classification, which may be POSSIBLE_NEW_EDITION,
 * POSSIBLE_SAME_DOCUMENT or NEW_GUIDELINE. Both tools serve different
 * purpose; the report says so on every identifier match rather than letting
 * the two tools look as if they disagree about facts.
 */
export const RUNNER_NOTE =
  'note: the discovery runner (classify) matches by URL keys and title only; its result may be POSSIBLE_NEW_EDITION, POSSIBLE_SAME_DOCUMENT or NEW_GUIDELINE and must be assessed independently; ' +
  'this identifier match is a read-only review signal and changes nothing in the staging path';

// ─── The detector ───────────────────────────────────────────────────────────

function emptyCounts(): Record<GapClass, number> {
  return Object.fromEntries(ALL_GAP_CLASSES.map((c) => [c, 0])) as Record<GapClass, number>;
}

export function detectCoverageGaps(input: GapInput, view: CatalogueView = buildCatalogueView(input.guidelines)): GapReport {
  const findings: GapFinding[] = [];
  const byClass = emptyCounts();

  for (const item of input.parse.items) {
    const f = classifyItem(item, input, view);
    findings.push(f);
    byClass[f.class]++;
  }

  const filtered = input.filtered ?? [];
  return {
    provider: input.provider,
    providerName: input.providerName,
    surfaceUrl: input.surfaceUrl,
    snapshotLabel: input.snapshotLabel,
    itemsParsed: input.parse.items.length,
    byClass,
    findings,
    excluded: input.parse.excluded,
    filtered,
    balanced: input.parse.items.length === findings.length,
  };
}

function classifyItem(item: DiscoveredRecord, input: GapInput, view: CatalogueView): GapFinding {
  const identityKey = documentIdentityKey(item.discoveredUrl);
  const matchKey = normaliseCandidateUrl(item.discoveredUrl);
  const statedYears = [...new Set(item.statedLabels.flatMap((l) => yearsIn(l.value)))].sort((a, b) => a - b);
  const publisherStatus = publisherStatusOf(item);
  const reasons: string[] = [];

  const base = (
    cls: GapClass,
    matched: string | null,
    also: string[],
    action: ProposedAction,
    extra: Partial<GapFinding['evidence']> = {},
  ): GapFinding => ({
    class: cls,
    topic: item.topic,
    discoveredUrl: item.discoveredUrl,
    ...(item.sectionHeading ? { sectionHeading: item.sectionHeading } : {}),
    statedLabels: item.statedLabels,
    matchedGuidelineId: matched,
    alsoMatches: also,
    reasons,
    evidence: {
      identityKey,
      matchKey,
      statedYears,
      catalogueYears: matched ? catalogueYearsOf(view.byId.get(matched)!) : [],
      ...(publisherStatus ? { publisherStatus } : {}),
      ...extra,
    },
    proposedAction: action,
  });

  // 0. A title we cannot use is ambiguous by construction.
  if (!item.topic.trim()) {
    reasons.push('the surface gave this link no title; nothing can be compared by name');
    return base('AMBIGUOUS_REVIEW', null, [], 'editor-disambiguate');
  }

  // 1. Publisher-declared move: an observed redirect to a catalogued address.
  const redirectTo = input.redirects?.[item.discoveredUrl];
  let redirect: UrlAlternative | undefined;
  if (redirectTo && redirectTo !== item.discoveredUrl) {
    redirect = {
      url: redirectTo,
      relation: 'redirect-target',
      scope: 'document',
      derivedFrom: item.discoveredUrl,
      transform: 'none — observed',
      equivalence: 'unverified',
      statement:
        `Requesting ${item.discoveredUrl} was redirected by the publisher to ${redirectTo}. That is the ` +
        'server asserting where a request goes; whether the two addresses serve the same document is unverified.',
    };
    const target = view.byIdentity.get(documentIdentityKey(redirectTo)) ?? [];
    const source = view.byIdentity.get(identityKey) ?? [];
    if (target.length === 1 && source.length === 0) {
      reasons.push(`the publisher redirects this address to ${redirectTo}, which the catalogue holds as ${target[0]}`);
      return base('PUBLISHER_DECLARED_MOVED', target[0], [], 'editor-record-new-address', { redirect });
    }
    if (source.length === 1 && target.length === 0) {
      reasons.push(`the catalogued address ${item.discoveredUrl} now redirects to ${redirectTo}, which the catalogue does not hold`);
      return base('PUBLISHER_DECLARED_MOVED', source[0], [], 'editor-record-new-address', { redirect });
    }
  }

  // 2. Exact URL identity.
  const exact = view.byIdentity.get(identityKey) ?? [];
  const looseOwners = view.byLoose.get(matchKey) ?? [];
  const isGeneric = looseOwners.length > GENERIC_URL_MAX_OWNERS;

  if (isGeneric) {
    reasons.push(
      `this URL is held by ${looseOwners.length} catalogue entries as an index/fallback link, so it identifies a page, not a document`,
    );
    return base('AMBIGUOUS_REVIEW', null, looseOwners.slice(0, 5), 'editor-disambiguate');
  }

  if (exact.length >= 1) {
    const matched = exact[0];
    if (exact.length > 1) {
      reasons.push(`the same document URL is held by ${exact.length} catalogue entries (${exact.join(', ')}); the matcher cannot say which one this listing is`);
      return base('AMBIGUOUS_REVIEW', matched, exact.slice(1), 'editor-disambiguate');
    }
    reasons.push(`URL identity key matches catalogue entry ${matched}`);
    return afterMatch(item, matched, input, view, base, reasons, statedYears, publisherStatus);
  }

  // 3. Publisher identifiers across addresses.
  const doi = doiOf(item.discoveredUrl);
  if (doi) {
    const owners = view.byDoi.get(doi) ?? [];
    if (owners.length === 1) {
      reasons.push(`DOI ${doi} matches catalogue entry ${owners[0]} at a different address`, RUNNER_NOTE);
      return afterMatch(item, owners[0], input, view, base, reasons, statedYears, publisherStatus, { identifier: { kind: 'doi', value: doi } });
    }
    if (owners.length > 1) {
      reasons.push(`DOI ${doi} is held by ${owners.length} entries`);
      return base('AMBIGUOUS_REVIEW', owners[0], owners.slice(1), 'editor-disambiguate', { identifier: { kind: 'doi', value: doi } });
    }
  }
  const guid = boaAssetGuidOf(item.discoveredUrl);
  if (guid) {
    const owners = view.byBoaGuid.get(guid) ?? [];
    if (owners.length === 1) {
      reasons.push(`BOA asset GUID ${guid} matches catalogue entry ${owners[0]} under a differently written address`, RUNNER_NOTE);
      return afterMatch(item, owners[0], input, view, base, reasons, statedYears, publisherStatus, { identifier: { kind: 'boa-asset-guid', value: guid } });
    }
    if (owners.length > 1) {
      reasons.push(`BOA asset GUID ${guid} is held by ${owners.length} entries`);
      return base('AMBIGUOUS_REVIEW', owners[0], owners.slice(1), 'editor-disambiguate', { identifier: { kind: 'boa-asset-guid', value: guid } });
    }
  }

  // 4. Loose-only URL match: letter case or trailing slash differs.
  if (looseOwners.length >= 1) {
    reasons.push(
      `matches ${looseOwners.join(', ')} under the loose key only (letter case or trailing slash differs); a case-sensitive server could serve a different document`,
    );
    return base('POSSIBLE_SAME_DOCUMENT', looseOwners[0], looseOwners.slice(1), 'compare-documents');
  }

  // 5. Publisher-declared status on a document we do not hold.
  if (publisherStatus) {
    reasons.push(`the publisher lists this under "${publisherStatus.value}"; the catalogue does not hold the document`);
    return base('PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED', null, [], 'editor-read-publisher-status');
  }

  // 6. The existing classifier: soft match or genuinely new.
  const candidate: DiscoveryCandidate | null = classify({
    provider: input.provider,
    providerName: input.providerName,
    catalogueProvider: input.catalogueProvider,
    surface: input.surfaceUrl,
    topic: item.topic,
    discoveredUrl: item.discoveredUrl,
    statedLabels: item.statedLabels,
    discoveredAt: input.discoveredAt,
    index: view.index,
    previousToken: input.previousTokens?.[matchKey] ?? null,
  });

  if (candidate && candidate.classification === 'POSSIBLE_NEW_EDITION' && candidate.softMatch) {
    const sm = candidate.softMatch;
    // The classifier returns only the best; recompute the runner-up margin
    // from its own helper so a near-tie is visible.
    const all = softMatchesFor(item, input, view);
    const runnerUp = all[1];
    reasons.push(sm.statement);
    const hint = editionHint(statedYears, catalogueYearsOf(view.byId.get(sm.guidelineId)!));
    if (hint === 'earlier-year') reasons.push(`the publisher's stated year (${statedYears.at(-1)}) is EARLIER than the newest year the catalogue records for ${sm.guidelineId} — consistent with a historical edition of a series the entry already summarises, not an update`);
    else if (hint === 'same-year') reasons.push(`the publisher's stated year (${statedYears.at(-1)}) equals the catalogue's recorded year — consistent with the same edition at a second address`);
    else if (hint === 'later-year') reasons.push(`the publisher's stated year (${statedYears.at(-1)}) is LATER than anything the catalogue records for ${sm.guidelineId} — open this one first`);
    if (runnerUp && sm.titleSimilarity - runnerUp.titleSimilarity < 0.1) {
      reasons.push(
        `a second entry (${runnerUp.guidelineId}) scores within 0.1 (${runnerUp.titleSimilarity} vs ${sm.titleSimilarity}); the match is not decisive`,
      );
      return base('AMBIGUOUS_REVIEW', sm.guidelineId, all.slice(1).map((m) => m.guidelineId), 'editor-disambiguate', { softMatch: sm, editionHint: hint });
    }
    return base('POSSIBLE_UPDATED_VERSION', sm.guidelineId, all.slice(1).map((m) => m.guidelineId), 'editor-check-edition', { softMatch: sm, editionHint: hint });
  }

  reasons.push(candidate?.notes ?? 'no catalogue URL, identifier or title/publisher match');
  return base('POTENTIALLY_NEW', null, [], 'editor-assess-new');
}

/** After a URL or identifier match: is it merely represented, or does the surface say more? */
function afterMatch(
  item: DiscoveredRecord,
  matched: string,
  input: GapInput,
  view: CatalogueView,
  base: (cls: GapClass, m: string | null, also: string[], a: ProposedAction, extra?: Partial<GapFinding['evidence']>) => GapFinding,
  reasons: string[],
  statedYears: number[],
  publisherStatus: GapFinding['evidence']['publisherStatus'] | undefined,
  extra: Partial<GapFinding['evidence']> = {},
): GapFinding {
  if (publisherStatus) {
    reasons.push(`the publisher now lists this document under "${publisherStatus.value}" (${publisherStatus.readFrom})`);
    return base('PUBLISHER_DECLARED_WITHDRAWN_OR_REPLACED', matched, [], 'editor-read-publisher-status', extra);
  }

  // Volatile-token change, via the existing classifier (only fires on a URL match).
  const matchKey = normaliseCandidateUrl(item.discoveredUrl);
  const prev = input.previousTokens?.[matchKey];
  if (prev) {
    const c = classify({
      provider: input.provider,
      providerName: input.providerName,
      catalogueProvider: input.catalogueProvider,
      surface: input.surfaceUrl,
      topic: item.topic,
      discoveredUrl: item.discoveredUrl,
      statedLabels: item.statedLabels,
      discoveredAt: input.discoveredAt,
      index: view.index,
      previousToken: prev,
    });
    if (c?.classification === 'EDITION_TOKEN_CHANGED' && c.tokenChange) {
      reasons.push(c.tokenChange.statement);
      return base('POSSIBLE_UPDATED_VERSION', matched, [], 'editor-check-edition', { ...extra, tokenChange: c.tokenChange });
    }
  }

  // A stated year later than anything the catalogue records for this entry.
  const g = view.byId.get(matched)!;
  const catalogueYears = catalogueYearsOf(g);
  const newest = statedYears.at(-1);
  const recorded = catalogueYears.at(-1);
  if (newest !== undefined && recorded !== undefined && newest > recorded) {
    reasons.push(
      `the publisher states "${newest}" beside this link; the catalogue's newest recorded year for ${matched} is ${recorded}. A later year on the same address may be a new edition, or a page label — no document was read`,
    );
    return base('POSSIBLE_UPDATED_VERSION', matched, [], 'editor-check-edition', extra);
  }

  reasons.push('nothing on the surface contradicts the catalogue entry');
  return base('ALREADY_REPRESENTED', matched, [], 'none', extra);
}

export function editionHint(statedYears: number[], catalogueYears: number[]): NonNullable<GapFinding['evidence']['editionHint']> {
  const newest = statedYears.at(-1);
  const recorded = catalogueYears.at(-1);
  if (newest === undefined || recorded === undefined) return 'no-year';
  if (newest > recorded) return 'later-year';
  if (newest < recorded) return 'earlier-year';
  return 'same-year';
}

function softMatchesFor(item: DiscoveredRecord, input: GapInput, view: CatalogueView): SoftMatchEvidence[] {
  // Re-derive the full ranked list the classifier used, through its public helpers.
  // (classify() exposes only the best match; ties are a review concern here.)
  const registry = publisherSetOf(input.catalogueProvider);
  const fromTitle = publishersStatedInTitle(item.topic, view.index.knownPublisherLabels).filter((p) => !registry.includes(p));
  return softMatches(item.topic, [...registry, ...fromTitle], view.index, fromTitle);
}

// ─── Cross-provider aggregation ─────────────────────────────────────────────

/**
 * Marks findings whose document (identity key, or DOI / BOA GUID) was also
 * discovered on another provider's surface in the same run. Co-published
 * guidance is listed by each publisher; the hub holds it once.
 */
export function markCrossProviderDuplicates(reports: GapReport[]): void {
  const seen = new Map<string, Array<{ provider: string; finding: GapFinding }>>();
  // Identifiers are derived from the URL here regardless of which route
  // matched it, so a document found by URL on one provider and by GUID on
  // another still pairs up.
  const keyOf = (f: GapFinding) => {
    const doi = doiOf(f.discoveredUrl);
    if (doi) return `doi:${doi}`;
    const guid = boaAssetGuidOf(f.discoveredUrl);
    if (guid) return `boa-asset-guid:${guid}`;
    return `id:${f.evidence.identityKey}`;
  };
  for (const r of reports) {
    for (const f of r.findings) {
      const k = keyOf(f);
      const list = seen.get(k) ?? [];
      list.push({ provider: r.provider, finding: f });
      seen.set(k, list);
    }
  }
  for (const list of seen.values()) {
    if (list.length < 2) continue;
    for (const { provider, finding } of list) {
      const others = list.filter((x) => x.provider !== provider).map((x) => x.provider);
      if (others.length === 0) continue;
      finding.alsoDiscoveredVia = [...new Set(others)].sort();
      finding.reasons.push(`also listed by ${finding.alsoDiscoveredVia.join(', ')} in this run (co-published; hold once)`);
    }
  }
}

// ─── Rendering ──────────────────────────────────────────────────────────────

const ACTION_TEXT: Record<ProposedAction, string> = {
  none: 'No action.',
  'compare-documents': 'Open both documents and decide whether they are the same; if so, record the second address as a version.',
  'editor-assess-new': 'Assess for scope; if in scope, stage as a new-guideline candidate through the normal queue.',
  'editor-check-edition': 'Open the document and the catalogue entry; confirm whether this is a new edition, the same document at a second address, or a different document.',
  'editor-record-new-address': 'Confirm the redirect target is the same document; record the new address as a version, keep the old one labelled.',
  'editor-read-publisher-status': 'Read the publisher status wording on the page; decide whether the entry needs a status change. Nothing is changed automatically.',
  'editor-disambiguate': 'The matcher cannot decide; a human must. See the reasons.',
};

export function renderGapReport(report: GapReport): string {
  const lines: string[] = [];
  lines.push(`Provider: ${report.provider} — ${report.providerName}`);
  lines.push(`Surface:  ${report.surfaceUrl}`);
  lines.push(`Compared with: ${report.snapshotLabel} (a SNAPSHOT comparison, not production truth)`);
  lines.push('');
  lines.push('Discovery:');
  lines.push(`- ${report.itemsParsed} documents parsed (${report.excluded.length} links excluded by the parser, ${report.filtered.length} filtered on scope)`);
  for (const c of ALL_GAP_CLASSES) lines.push(`- ${report.byClass[c]} ${c.toLowerCase().replace(/_/g, ' ')}`);
  const earlier = report.findings.filter((f) => f.class === 'POSSIBLE_UPDATED_VERSION' && f.evidence.editionHint === 'earlier-year').length;
  if (earlier) lines.push(`  (of which ${earlier} state a year EARLIER than the catalogue records: historical editions, lowest priority)`);
  lines.push(`- arithmetic ${report.balanced ? 'balances' : 'DOES NOT BALANCE'}`);
  lines.push('');
  // Identifier matches (DOI / BOA asset GUID) are represented here but would
  // receive an independent URL/title classification in the runner: say so where a reader
  // comparing the two tools would look.
  const viaIdentifier = report.findings.filter((f) => f.class === 'ALREADY_REPRESENTED' && f.evidence.identifier);
  if (viaIdentifier.length) {
    lines.push(`Represented by identifier only (${viaIdentifier.length}) — the discovery runner uses URL/title rules independently (including POSSIBLE_NEW_EDITION); no runner outcome is assumed:`);
    for (const f of viaIdentifier) lines.push(`- ${f.topic} — ${f.evidence.identifier!.kind} ${f.evidence.identifier!.value} → ${f.matchedGuidelineId} (read-only review signal; staging behaviour unchanged)`);
    lines.push('');
  }
  const review = report.findings.filter((f) => f.class !== 'ALREADY_REPRESENTED');
  lines.push(`Review required (${review.length}):`);
  for (const f of review) {
    lines.push(`- [${f.class}] ${f.topic}`);
    lines.push(`    Official source URL: ${f.discoveredUrl}`);
    if (f.sectionHeading) lines.push(`    Section: ${f.sectionHeading}`);
    if (f.statedLabels.length) lines.push(`    Publisher labels: ${f.statedLabels.map((l) => `${l.fieldLabel ? l.fieldLabel + '=' : ''}"${l.value}"`).join('; ')}`);
    if (f.matchedGuidelineId) lines.push(`    Catalogue entry: ${f.matchedGuidelineId}${f.alsoMatches.length ? ` (also: ${f.alsoMatches.join(', ')})` : ''}`);
    if (f.evidence.identifier) lines.push(`    Identifier: ${f.evidence.identifier.kind} ${f.evidence.identifier.value}`);
    if (f.evidence.redirect) lines.push(`    Redirect: → ${f.evidence.redirect.url}`);
    if (f.evidence.publisherStatus) lines.push(`    Publisher status wording: "${f.evidence.publisherStatus.value}" (${f.evidence.publisherStatus.readFrom})`);
    if (f.evidence.editionHint && f.evidence.editionHint !== 'no-year') lines.push(`    Year hint: ${f.evidence.editionHint} (publisher ${f.evidence.statedYears.at(-1)} vs catalogue ${f.evidence.catalogueYears.at(-1)})`);
    lines.push(`    Matching rationale: ${f.reasons.join(' | ')}`);
    lines.push(`    Proposed editorial action: ${ACTION_TEXT[f.proposedAction]}`);
  }
  if (report.filtered.length) {
    lines.push('');
    lines.push('Filtered on scope (visible, not classified):');
    for (const x of report.filtered) lines.push(`- ${x.topic} — ${x.url} — ${x.reason}`);
  }
  if (report.excluded.length) {
    lines.push('');
    lines.push('Excluded by the parser:');
    for (const x of report.excluded) lines.push(`- ${x.url} — ${x.reason}`);
  }
  return lines.join('\n');
}
