/**
 * scripts/lib/edition-match.ts
 * ─────────────────────────────
 * Deciding what a discovered item IS, relative to the catalogue.
 *
 * PURE. No network, no disk, no database. Every input is passed in, which is
 * what lets the whole classifier be tested against fixtures offline.
 *
 * ─── WHY URL IDENTITY IS NOT ENOUGH ─────────────────────────────────────────
 *
 * Measured against the live catalogue, 5 of the 10 PDFs on the BOFAS
 * publications index have no catalogue URL match — and 4 of those 5 are
 * documents the catalogue ALREADY HOLDS, on a co-publisher's host
 * (end-stage-ankle-arthritis, ankle-fracture, bofas-flatfoot-commissioning and
 * the mobilisation BOAST, the last held twice). Co-published guidance is
 * republished by each publisher at its own address; URL identity cannot see
 * that, so a URL-only sweep reports 4 false new documents out of 5.
 *
 * ─── WHY THE EXISTING TOKENISER IS NOT REUSED ───────────────────────────────
 *
 * `src/lib/duplicate-detection.ts` has a tokeniser and a Jaccard function, and
 * the natural instinct is to reuse them. They are wrong for this job, and the
 * numbers say so rather than taste:
 *
 *   - Its tokens keep publisher acronyms, document-type words and plural
 *     endings. On the real case "BOFAS / BOA Ankle Fracture BOAST Guidance"
 *     (discovered) vs "Management of ankle fractures" (catalogue) it yields a
 *     similarity of 0.14 — far below any usable threshold. It would miss every
 *     second-host case above.
 *   - It gates topic signals on `normalizedSource` EQUALITY, so
 *     "BOA (BOASt) with BOFAS" and "BOFAS" are treated as unrelated publishers
 *     — exactly the comparison that has to succeed here.
 *   - Both helpers are module-private, so reuse would mean widening a frontend
 *     module's API for a scripts-only consumer.
 *
 * It is also tuned for a different question: telling sibling topics from ONE
 * society apart (its 0.85 threshold exists to separate "BESS frozen shoulder"
 * from "BESS subacromial pain"). This module asks whether two differently-worded
 * titles from OVERLAPPING publishers might be the same document. Same shape,
 * opposite failure mode.
 *
 * So the tokeniser here is its own, documented below, and the frontend module is
 * left untouched.
 *
 * ─── WHAT A MATCH MEANS ─────────────────────────────────────────────────────
 *
 * A soft match is a PROMPT FOR A HUMAN and nothing else. It cannot distinguish
 * a new edition from the same document on a second host from a sibling document
 * with a similar name, and the evidence it emits says so in those words.
 */
import type { Guideline } from '../../src/data/guidelines-data';
import { canonicalProvider, splitPublishers } from '../../src/lib/providers';
import { normaliseCandidateUrl } from './ingestion';
import {
  makeDiscoveryId,
  type DiscoveryCandidate,
  type DiscoveryClass,
  type SoftMatchEvidence,
  type StatedLabel,
  type TokenChangeEvidence,
} from './discovery-classification';
import {
  coPublisherAlternative,
  matchKeys,
  volatileToken,
  type UrlAlternative,
} from './url-alternatives';

// ─── Tokenisation ───────────────────────────────────────────────────────────

/**
 * Words that do not distinguish one document from another.
 *
 * Two groups, both deliberate:
 *
 *   structural    articles, conjunctions, and the words every guidance title
 *                 uses ("management", "guideline", "pathway").
 *   document-type the words that name the KIND of document rather than its
 *                 subject ("position", "statement", "consensus",
 *                 "commissioning", "boast", "specs"). These are what differ
 *                 most between a provider's own phrasing and the catalogue's,
 *                 and keeping them makes two unrelated position statements look
 *                 similar while making one document described two ways look
 *                 different.
 *
 * Clinically meaningful qualifiers are NOT here, and must not be added:
 * "acute", "chronic", "revision", "primary", "paediatric", "adult" change what
 * a document is about. The one apparent exception is handled below: a bare year
 * is dropped by `isNoiseToken`, not by this list.
 */
const STOPWORDS = new Set([
  // structural
  'a', 'an', 'and', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with',
  'guideline', 'guidelines', 'guidance', 'management', 'managing',
  'pathway', 'pathways', 'protocol', 'protocols', 'care',
  // document type
  'position', 'statement', 'statements', 'consensus', 'commissioning',
  'standard', 'standards', 'report', 'reports', 'booklet', 'booklets',
  'boast', 'boasts', 'specs', 'speciality', 'specialty',
  'surgical', 'procedure', 'procedures', 'national', 'uk',
  'document', 'documents', 'version', 'update', 'updated', 'revision',
  'summary', 'quick', 'guide', 'resource', 'resources', 'toolkit', 'toolkits',
]);

/**
 * Light singularisation. Trailing 's' only, and only where English makes that
 * safe: never after 'ss' ("access"), 'is' ("arthritis", "osteoporosis",
 * "prophylaxis") or 'us' ("valgus", "calcaneus"), and never on short tokens.
 *
 * Deliberately not a stemmer. A real stemmer would collapse "fracture" and
 * "fractured" but would also collapse clinically distinct words, and its
 * behaviour on medical vocabulary is much harder to predict than this rule.
 */
function singularise(token: string): string {
  if (token.length <= 4) return token;
  if (!token.endsWith('s')) return token;
  if (token.endsWith('ss') || token.endsWith('is') || token.endsWith('us')) return token;
  return token.slice(0, -1);
}

/** A bare year, a version marker, or a lone digit group carries no subject meaning. */
function isNoiseToken(token: string): boolean {
  if (/^\d+$/.test(token)) return true; // 2025, 2
  if (/^v\d+$/.test(token)) return true; // v1, v2
  return false;
}

/**
 * Significant subject tokens of a title.
 *
 * `publisherTokens` are removed because publisher identity is compared on its
 * own axis. Leaving them in does damage in both directions: it inflates
 * similarity between two unrelated documents from one society, and deflates it
 * when a provider prefixes its own name and the catalogue does not.
 *
 * Two details that look fussy and are not — both were found by running this
 * against the real BOFAS index rather than by reasoning:
 *
 *   1. Publisher noise is matched against the token BEFORE AND AFTER
 *      singularisation. `singularise('bofas')` is `'bofa'`, so filtering only
 *      on the raw form let 'bofa' through on every BOFAS title, padding both
 *      token sets and dragging every similarity score down.
 *
 *   2. A hyphenated compound contributes its JOINED form as well as its parts.
 *      Hyphenation is an orthographic choice, not a semantic one, and the two
 *      sides of a real comparison disagree about it: the provider writes
 *      "Mobilisation and Weightbearing after Surgery" while the catalogue holds
 *      "Mobilisation & weight-bearing after orthopaedic surgery / injury". With
 *      the joined form added, 'weightbearing' is shared; without it, the same
 *      document scores as unrelated.
 */
export function discoveryTokens(title: string, publisherTokens: Iterable<string> = []): Set<string> {
  const publisherNoise = new Set<string>();
  for (const p of publisherTokens) {
    const flat = p.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (!flat) continue;
    publisherNoise.add(flat);
    publisherNoise.add(singularise(flat));
  }

  const lowered = title.toLowerCase();

  // Joined forms of hyphenated compounds, added alongside the split parts.
  const joined: string[] = [];
  for (const run of lowered.match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? []) {
    joined.push(run.replace(/-/g, ''));
  }

  const raw = [...lowered.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/), ...joined];

  const tokens = raw
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => !isNoiseToken(t))
    .filter((t) => !publisherNoise.has(t))
    .map(singularise)
    .filter((t) => !STOPWORDS.has(t))
    .filter((t) => !publisherNoise.has(t));

  return new Set(tokens);
}

function intersect(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((t) => b.has(t));
}

/** |A ∩ B| / |A ∪ B|. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  const shared = intersect(a, b).length;
  return shared / (a.size + b.size - shared);
}

/** |A ∩ B| / min(|A|, |B|) — tolerant of one title being much longer. */
export function containment(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return intersect(a, b).length / Math.min(a.size, b.size);
}

// ─── Publisher comparison ───────────────────────────────────────────────────

/**
 * Every publisher label implicated by a raw `source` string.
 *
 * The union of the SPLIT tokens and the CANONICAL OWNER, and the union matters:
 *
 *   - `splitPublishers()` + `canonicalProvider()` per token gives co-publishers,
 *     which `canonicalProvider()` on the whole string never does (its rule R1
 *     returns only the first-listed publisher).
 *   - but `canonicalProvider()` on the whole string applies PROVIDER_OVERRIDES,
 *     which the per-token pass cannot. The live catalogue has exactly this case:
 *     `nhs-ebi-programme` carries
 *     `"Academy of Medical Royal Colleges / NHS England / NICE / GIRFT"`, whose
 *     token set is [AoMRC, NHS England, NICE, GIRFT] and does NOT contain
 *     'NHS EBI Programme' — even though the override makes NHS EBI its owner. An
 *     EBI-discovered item compared on tokens alone would fail to overlap the one
 *     catalogue entry that IS the EBI programme.
 *
 * So both are taken. This is the single subtlety in the matcher and the reason
 * this module exists rather than three lines inline.
 */
export function publisherSetOf(source: string): string[] {
  const set = new Set<string>();
  for (const token of splitPublishers(source)) {
    const canonical = canonicalProvider(token);
    if (canonical && canonical !== 'Unspecified') set.add(canonical);
  }
  const owner = canonicalProvider(source);
  if (owner && owner !== 'Unspecified') set.add(owner);
  return [...set];
}

/**
 * Publisher labels the DISCOVERED TITLE itself names, found by lookup.
 *
 * The provider key alone is not the item's publisher set. Providers routinely
 * name their co-publishers in the title — "BOFAS / BOA Guidelines on
 * Mobilisation and Weightbearing after Surgery" — and the catalogue files that
 * same document under the OTHER publisher (`mobilisation-weightbearing` is
 * sourced "BOA (BOASt)" with no BOFAS in it). Comparing the registry key alone,
 * the publisher sets do not intersect and the match is refused, even though the
 * titles are a containment of 1.00 with four shared tokens. That is a real
 * false negative, found by running this against the live index.
 *
 * This is a LOOKUP, not a parse: a whole token is kept only if it is already a
 * known canonical publisher label. `splitPublishers` on a title would produce
 * nonsense, and guessing which words are organisation names would be worse.
 * "BOAST" is not a canonical label (it is a BOA document series), so it is not
 * picked up — which is the behaviour wanted.
 *
 * KNOWN OVER-INCLUSION, accepted deliberately: a title that MENTIONS another
 * body without being published by it will gain that body in its set. The
 * consequence is bounded — a soft match additionally requires the title
 * thresholds to pass, and every result is a prompt for a human rather than a
 * decision — so the cost is an occasional extra candidate to dismiss, against a
 * silent miss of a document the catalogue already holds.
 */
export function publishersStatedInTitle(
  title: string,
  knownLabels: Iterable<string>,
): string[] {
  const byFlat = new Map<string, string>();
  for (const label of knownLabels) {
    const flat = label.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (flat) byFlat.set(flat, label);
  }

  const found = new Set<string>();
  for (const token of title.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)) {
    const hit = byFlat.get(token.trim());
    if (hit) found.add(hit);
  }
  return [...found];
}

// ─── Thresholds ─────────────────────────────────────────────────────────────

/**
 * A soft match requires publisher overlap AND one of two title tests.
 *
 * Two tests rather than one because the two failure modes are different
 * shapes. Jaccard punishes a long title describing the same thing with extra
 * words; containment alone would match any short title whose few tokens appear
 * in a longer one. So: a strong symmetric overlap, OR a high containment backed
 * by enough shared tokens that it is not riding on a single common word.
 *
 * These numbers are calibrated against the real BOFAS index and the real
 * catalogue in scripts/tests/edition-match.test.ts, which asserts both the
 * matches that must fire and the near-misses that must not. Changing a
 * threshold without re-running that test is how this starts producing noise.
 */
export const SOFT_MATCH_JACCARD = 0.6;
export const SOFT_MATCH_CONTAINMENT = 0.75;
export const SOFT_MATCH_MIN_SHARED_TOKENS = 2;

// ─── Catalogue index ────────────────────────────────────────────────────────

export interface IndexedEntry {
  guideline: Guideline;
  publishers: string[];
  tokens: Set<string>;
  /** Normalised keys for every version URL on the entry. */
  urlKeys: string[];
}

export interface CatalogueIndex {
  /** Normalised URL key → the entry holding it. */
  byUrlKey: Map<string, IndexedEntry>;
  entries: IndexedEntry[];
  /**
   * Every canonical publisher label the catalogue uses. The lookup table for
   * publishersStatedInTitle — derived from the catalogue so it cannot drift
   * from the labels actually in use.
   */
  knownPublisherLabels: string[];
}

/**
 * URLs shared by more than this many entries are landing pages, not documents.
 *
 * The catalogue uses a `"Fallback / index page"` version on almost every entry,
 * so a provider's guidance index appears on dozens of rows. Keyed as a document
 * URL it would match every discovered item against an arbitrary one of them.
 * Same reasoning as GENERIC_URL_MAX_OWNERS in duplicate-detection.ts.
 */
export const GENERIC_URL_MAX_OWNERS = 2;

export function buildCatalogueIndex(guidelines: readonly Guideline[]): CatalogueIndex {
  const entries: IndexedEntry[] = [];
  const ownerCount = new Map<string, number>();

  for (const g of guidelines) {
    const publishers = publisherSetOf(g.source);
    const urlKeys = [
      ...new Set(
        g.versions
          .filter((v) => v.url && v.url !== '#')
          .map((v) => normaliseCandidateUrl(v.url)),
      ),
    ];
    for (const key of urlKeys) ownerCount.set(key, (ownerCount.get(key) ?? 0) + 1);
    entries.push({
      guideline: g,
      publishers,
      tokens: discoveryTokens(g.topic, publishers),
      urlKeys,
    });
  }

  const byUrlKey = new Map<string, IndexedEntry>();
  for (const entry of entries) {
    for (const key of entry.urlKeys) {
      if ((ownerCount.get(key) ?? 0) > GENERIC_URL_MAX_OWNERS) continue;
      if (!byUrlKey.has(key)) byUrlKey.set(key, entry);
    }
  }

  const knownPublisherLabels = [...new Set(entries.flatMap((e) => e.publishers))].sort();

  return { byUrlKey, entries, knownPublisherLabels };
}

// ─── Soft matching ──────────────────────────────────────────────────────────

/**
 * Candidate catalogue entries for a discovered title, best first.
 *
 * Returns evidence objects, never a boolean: a reviewer disagreeing with a
 * match needs to see what was compared, and a maintainer tuning a threshold
 * needs the numbers.
 */
export function softMatches(
  topic: string,
  discoveredPublishers: string[],
  index: CatalogueIndex,
  publishersFromTitle: string[] = [],
): SoftMatchEvidence[] {
  const out: SoftMatchEvidence[] = [];
  const discoveredTokenSet = discoveryTokens(topic, discoveredPublishers);
  if (discoveredTokenSet.size === 0) return out;

  for (const entry of index.entries) {
    const sharedPublishers = discoveredPublishers.filter((p) => entry.publishers.includes(p));
    if (sharedPublishers.length === 0) continue;

    const shared = intersect(discoveredTokenSet, entry.tokens);
    const j = jaccard(discoveredTokenSet, entry.tokens);
    const c = containment(discoveredTokenSet, entry.tokens);

    const passes =
      j >= SOFT_MATCH_JACCARD ||
      (c >= SOFT_MATCH_CONTAINMENT && shared.length >= SOFT_MATCH_MIN_SHARED_TOKENS);
    if (!passes) continue;

    out.push({
      guidelineId: entry.guideline.id,
      guidelineTopic: entry.guideline.topic,
      guidelineSource: entry.guideline.source,
      titleSimilarity: Number(j.toFixed(4)),
      sharedTitleTokens: shared.sort(),
      sharedPublishers: sharedPublishers.sort(),
      discoveredPublishers: [...discoveredPublishers].sort(),
      publishersFromTitle: [...publishersFromTitle].sort(),
      cataloguePublishers: [...entry.publishers].sort(),
      statement:
        `Title tokens overlap ${entry.guideline.id} (Jaccard ${j.toFixed(2)}, containment ${c.toFixed(2)}, ` +
        `shared: ${shared.sort().join(', ')}) and the publisher sets share ${sharedPublishers.sort().join(', ')}. ` +
        'The discovered URL is not in the catalogue. This is consistent with a NEW EDITION of that entry, ' +
        'with THE SAME DOCUMENT published at a second address, or with A DIFFERENT DOCUMENT on a related ' +
        'subject by overlapping publishers. Nothing here distinguishes those readings: no document content ' +
        'was compared and no publication date was established. A human must open both and decide.',
    });
  }

  return out.sort((a, b) => b.titleSimilarity - a.titleSimilarity);
}

// ─── Classification ─────────────────────────────────────────────────────────

export interface ClassifyInput {
  /**
   * The sweep's registry key for this provider. Identity and reporting only —
   * it is carried onto the candidate and hashed into the discovery id, and it
   * is NEVER used for publisher comparison. See `catalogueProvider`.
   */
  provider: string;
  providerName: string;
  /**
   * The provider's canonical label as the CATALOGUE spells it, which is what
   * publisher comparison must use.
   *
   * Defaults to `provider` when omitted, which is correct for providers whose
   * registry key already is the canonical label — and silently wrong for any
   * provider where it is not. `'NHS EBI'` was exactly that case: it does not
   * canonicalise to `'NHS EBI Programme'`, so comparing on the key produced an
   * empty intersection against all 19 EBI entries and EBI soft matching never
   * fired. Callers in the sweep pass
   * `ProviderRegistryEntry.catalogueProvider`; the default exists only so a
   * one-off call in a test need not restate it.
   */
  catalogueProvider?: string;
  surface: string;
  topic: string;
  /** The href the provider published. Preserved verbatim throughout. */
  discoveredUrl: string;
  /** Alternatives already established by the adapter (e.g. an observed redirect). */
  urlAlternatives?: UrlAlternative[];
  statedLabels?: StatedLabel[];
  discoveredAt: string;
  index: CatalogueIndex;
  /**
   * The volatile token this pipeline previously recorded for this URL, if any.
   * Passed in rather than read from disk so the classifier stays pure and
   * testable; the runner supplies it from the on-disk token store.
   */
  previousToken?: { parameter: string; value: string; observedAt: string } | null;
}

/**
 * Classify one discovered item. Returns null when the item matched the
 * catalogue with nothing further to report — the common, uninteresting case,
 * which must not become a candidate.
 */
export function classify(input: ClassifyInput): DiscoveryCandidate | null {
  const alternatives = [...(input.urlAlternatives ?? [])];
  const keys = matchKeys(input.discoveredUrl, alternatives);

  let matched: IndexedEntry | undefined;
  let matchedViaKey: string | undefined;
  for (const key of keys) {
    const hit = input.index.byUrlKey.get(key);
    if (hit) {
      matched = hit;
      matchedViaKey = key;
      break;
    }
  }

  const build = (
    classification: DiscoveryClass,
    extra: {
      matchedGuidelineId: string | null;
      softMatch?: SoftMatchEvidence;
      tokenChange?: TokenChangeEvidence;
      notes: string;
      verificationRequired: boolean;
      urlAlternatives: UrlAlternative[];
    },
  ): DiscoveryCandidate => ({
    discoveryId: makeDiscoveryId({
      provider: input.provider,
      classification,
      discoveredUrl: input.discoveredUrl,
    }),
    provider: input.provider,
    providerName: input.providerName,
    surface: input.surface,
    topic: input.topic,
    discoveredUrl: input.discoveredUrl,
    urlAlternatives: extra.urlAlternatives,
    statedLabels: input.statedLabels ?? [],
    classification,
    ...(extra.softMatch ? { softMatch: extra.softMatch } : {}),
    ...(extra.tokenChange ? { tokenChange: extra.tokenChange } : {}),
    matchedGuidelineId: extra.matchedGuidelineId,
    verificationRequired: extra.verificationRequired,
    discoveredAt: input.discoveredAt,
    notes: extra.notes,
  });

  // ── Matched by URL ────────────────────────────────────────────────────────
  if (matched) {
    const token = volatileToken(input.discoveredUrl);
    const prev = input.previousToken ?? null;

    // A token observation is only a COMPARISON when we have something to
    // compare against. A first sighting is not a change.
    if (token && prev && prev.parameter === token.parameter && prev.value !== token.value) {
      return build('EDITION_TOKEN_CHANGED', {
        matchedGuidelineId: matched.guideline.id,
        verificationRequired: true,
        urlAlternatives: alternatives,
        tokenChange: {
          parameter: token.parameter,
          previousValue: prev.value,
          observedValue: token.value,
          previousObservedAt: prev.observedAt,
          guidelineId: matched.guideline.id,
          statement:
            `The '${token.parameter}' query token on this URL is not the value this pipeline recorded on ` +
            `${prev.observedAt}. THAT IS THE ENTIRE OBSERVATION: two strings we wrote down on two occasions ` +
            'differ. It is NOT evidence that the provider re-uploaded the file, NOT evidence that the document ' +
            'changed, and NOT evidence of a new edition. A DNN cache-busting token can move for reasons ' +
            'unrelated to the document — a cache rebuild, a CMS or CDN migration, a permissions change, a ' +
            'site restore, or an editor re-saving the page the link sits on — and can also change with no ' +
            'change to the file’s bytes. No content was fetched or compared. If it matters, open the document.',
        },
        notes:
          `URL matched catalogue entry ${matched.guideline.id} via ${matchedViaKey}. Reporting only that a ` +
          'volatile query token differs from the previously recorded value.',
      });
    }
    // Matched, nothing further to say.
    return null;
  }

  // ── Not matched by URL ────────────────────────────────────────────────────
  const registryPublishers = publisherSetOf(input.catalogueProvider ?? input.provider);
  const titlePublishers = publishersStatedInTitle(
    input.topic,
    input.index.knownPublisherLabels,
  ).filter((p) => !registryPublishers.includes(p));
  const discoveredPublishers = [...registryPublishers, ...titlePublishers];
  const matches = softMatches(
    input.topic,
    discoveredPublishers,
    input.index,
    titlePublishers,
  );

  if (matches.length > 0) {
    const best = matches[0];
    const bestEntry = input.index.entries.find((e) => e.guideline.id === best.guidelineId);

    // Record the catalogue's own URLs for the soft-matched entry as
    // co-publisher-host alternatives, so a reviewer sees both addresses without
    // the discovered URL being touched.
    const withAlternatives = [...alternatives];
    if (bestEntry) {
      const generic = new Set<string>();
      for (const other of input.index.entries) {
        if (other === bestEntry) continue;
        for (const k of other.urlKeys) generic.add(k);
      }
      for (const v of bestEntry.guideline.versions) {
        if (!v.url || v.url === '#') continue;
        // Skip the shared fallback index pages — they are not this document.
        if (generic.has(normaliseCandidateUrl(v.url)) && bestEntry.guideline.versions.length > 1) {
          continue;
        }
        withAlternatives.push(
          coPublisherAlternative(
            input.discoveredUrl,
            v.url,
            bestEntry.guideline.id,
            best.sharedPublishers,
          ),
        );
      }
    }

    return build('POSSIBLE_NEW_EDITION', {
      matchedGuidelineId: best.guidelineId,
      softMatch: best,
      verificationRequired: true,
      urlAlternatives: withAlternatives,
      notes:
        `No catalogue URL matched (checked ${keys.length} key(s)). Soft-matched ${matches.length} ` +
        `catalogue entr${matches.length === 1 ? 'y' : 'ies'}; the strongest is ${best.guidelineId}. ` +
        'Requires human verification — see softMatch.statement for what is and is not established.',
    });
  }

  return build('NEW_GUIDELINE', {
    matchedGuidelineId: null,
    verificationRequired: true,
    urlAlternatives: alternatives,
    notes:
      `No catalogue URL matched (checked ${keys.length} key(s)) and no title/publisher soft match was found. ` +
      'This means the catalogue holds nothing that looks like this item — not that the item is in editorial ' +
      'scope, and not that it is clinical guidance at all.',
  });
}
