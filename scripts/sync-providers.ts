/**
 * scripts/sync-providers.ts
 * ─────────────────────────
 * READ-ONLY discovery / change-detection pipeline for specialist-society sources.
 *
 * What it does:
 *   1. Runs one or more ProviderAdapters that discover candidate guidelines from
 *      a provider's own index page or feed.
 *   2. Diffs the discovered URLs against the URLs already present in
 *      src/data/guidelines-data.ts.
 *   3. Writes the unmatched candidates to ./candidates.json for HUMAN REVIEW.
 *
 * What it deliberately does NOT do:
 *   * No Supabase reads or writes — it never opens a DB connection.
 *   * No edits to src/data/guidelines-data.ts.
 *   * No auto-approval of anything. candidates.json is a staging file only.
 *   * No LLM paraphrasing or summarisation. All metadata is extracted verbatim
 *     (`.text()` for DOM, <title>/<pubDate> for feeds).
 *
 * Run:  npx tsx scripts/sync-providers.ts
 *
 * ─── KNOWN LIMITATIONS (carried over from design review — do not silently "fix") ─
 *
 * BOA is hub-and-spoke: specialist societies propose standards and BOA's Clinical
 * Standards Committee republishes them as BOASts. A single-page scrape of one BOA
 * index therefore returns a PARTIAL SLICE, not a full BOA sweep. This is the same
 * trap that caused undercounting in the original manual verification pass. Treat
 * BOAAdapter output accordingly until it is extended to the spoke societies.
 *
 * GIRFT hosts (gettingitrightfirsttime.co.uk, girft-interactivepathways.org.uk)
 * return HTTP 403 to automated clients by design, so no GIRFT adapter is
 * registered. BESS (WordPress) is the feed adapter to exercise first.
 *
 * This is a THIRD overlapping checker alongside scripts/flag-dead-links.ts and
 * scripts/detect-changes.ts. It does not replace or merge with either. How the
 * three relate long-term is an open decision, deliberately not resolved here.
 *
 * ─── PHASE 1 OF THE UNIFIED INGESTION CONTRACT ──────────────────────────────
 *
 * As of phase 1 this script ALSO emits its unmatched items in the shared
 * `IngestionCandidate` shape from scripts/lib/ingestion.ts, so that the three
 * checkers above can eventually be reviewed in one place. It is the first and
 * so far ONLY producer of that shape; detect-changes.ts and flag-dead-links.ts
 * are untouched and still emit their own formats.
 *
 * Discovery, filtering, and matching behaviour are UNCHANGED — the candidate
 * records are an additional view over exactly the same items that previously
 * landed in `newCandidates`, which is still present for backward compatibility.
 * Everything emitted uses changeReason NEW_GUIDELINE and reviewStatus 'pending';
 * this script has no approval path and still writes nothing but candidates.json.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as cheerio from 'cheerio';
import RssParser from 'rss-parser';
import { GUIDELINES_DATA, type Guideline } from '../src/data/guidelines-data';
import {
  CANDIDATE_SCHEMA_VERSION,
  makeCandidateId,
  normaliseCandidateUrl,
  summariseReport,
  type CandidateReport,
  type ChangeReason,
  type IngestionCandidate,
  type PipelineId,
} from './lib/ingestion';
import type {
  DiscoveredGuideline,
  DiscoveredItem,
  ProviderAdapter,
} from './lib/provider-adapter';

// ─── Interfaces ─────────────────────────────────────────────────────────────
// The adapter contract now lives in scripts/lib/provider-adapter.ts so a second
// adapter can be written against it without reaching into this file. Re-exported
// here under the original names so existing importers are unaffected.

export type {
  DiscoveredGuideline,
  DiscoveredItem,
  DiscoveredVersionLink,
  ProviderAdapter,
  ProviderIdentity,
} from './lib/provider-adapter';

/**
 * This adapter's run, in the shared contract shape, PLUS the pre-phase-1
 * `newCandidates` field.
 *
 * `newCandidates` and `candidates` describe the same items in two formats and
 * are always the same length — the former is the raw provider record as this
 * script has always emitted it, the latter is the unified review record. It is
 * kept so any existing reader of candidates.json keeps working unchanged.
 */
export interface DiffReport extends CandidateReport {
  /** @deprecated Superseded by `candidates`; retained for output compatibility. */
  newCandidates: DiscoveredGuideline[];
}

const PIPELINE: PipelineId = 'sync-providers';

/** Everything this script emits is a not-yet-in-the-catalogue discovery. */
const CHANGE_REASON: ChangeReason = 'NEW_GUIDELINE';

const OUTPUT_PATH = path.join(process.cwd(), 'candidates.json');

// ─── Blocked Sources Reader ──────────────────────────────────────────────────
// Reuses scripts/blocked-sources.json rather than reimplementing it. Note the
// real file shape is { domains: [ { domain, reason, added, source } ] } — an
// object with an array of OBJECTS, not a flat array of hostnames and not a map
// keyed by hostname. Same access pattern as flag-dead-links.ts.

function getBlockedDomains(): Set<string> {
  try {
    const filePath = path.join(process.cwd(), 'scripts', 'blocked-sources.json');
    if (!fs.existsSync(filePath)) {
      console.warn('[Sync] scripts/blocked-sources.json not found — blocked-domain exclusion is DISABLED for this run.');
      return new Set();
    }
    const json = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const domains: string[] = (json.domains || [])
      .map((d: { domain: string }) => d.domain?.toLowerCase())
      .filter(Boolean);

    return new Set(domains);
  } catch (err) {
    console.warn('[Sync] Could not read blocked-sources.json:', err);
    return new Set();
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function isBlocked(url: string, blocked: Set<string>): boolean {
  const host = hostOf(url);
  if (!host) return false;
  for (const d of blocked) if (host === d || host.endsWith('.' + d)) return true;
  return false;
}

// ─── Adapters ────────────────────────────────────────────────────────────────

/**
 * Pure DOM parse of a BOASt index page.
 *
 * Split out of `BOAAdapter.fetchCandidates` so the parsing rules can be tested
 * offline against fixture HTML — previously they were only reachable by making
 * a live request to boa.ac.uk. Behaviour is unchanged: same selector, same
 * noise filter, same dedupe, same whitespace handling, same URL resolution,
 * same result order. `baseUrl` receives exactly the URL that was fetched, which
 * is what the inline version used to resolve relative hrefs against.
 */
export function parseBoaIndex(html: string, baseUrl: string): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  // Nav/chrome link text that is not a guideline title. The BOASt index carries
  // an aggregate "Download and read the full guidelines for BOA Standards
  // (BOASts / SpecS) here" link that points at a bundle, not a single standard.
  // Matched as a case-insensitive substring so trailing wording can change
  // without silently reintroducing the noise.
  const NOISE_TOPIC_PHRASES = ['download and read the full guidelines'];

  $("a[href*='asset']").each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    // Verbatim link text, whitespace-collapsed only. No rewriting.
    const topic = link.text().replace(/\s+/g, ' ').trim();

    if (!rawHref || !topic) return;

    const topicLower = topic.toLowerCase();
    if (NOISE_TOPIC_PHRASES.some(p => topicLower.includes(p))) return;

    const fullUrl = rawHref.startsWith('http')
      ? rawHref
      : new URL(rawHref, baseUrl).href;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    results.push({
      topic,
      source: 'BOA',
      versions: [{ label: 'BOASt PDF', url: fullUrl }],
    });
  });

  return results;
}

/**
 * Pilot 1: DOM scraper for BOA (BOASt guidelines).
 *
 * Index page verified 2026-08-24: /standards-guidance/boasts.html yields 44
 * a[href*='asset'] matches, all genuine BOASt documents with non-empty link text.
 * NB the sibling page /standards-guidance.html is also HTTP 200 but contains ZERO
 * asset links — pointing the adapter there fails silently with 0 candidates.
 */
export const BOAAdapter: ProviderAdapter = {
  name: 'British Orthopaedic Association (BOASt)',
  sourceTag: 'BOA',
  async fetchCandidates(): Promise<DiscoveredItem[]> {
    const targetUrl = 'https://www.boa.ac.uk/standards-guidance/boasts.html';
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${targetUrl}`);

    const html = await res.text();
    return parseBoaIndex(html, targetUrl);
  },
};

/**
 * Pure DOM parse of the BSG "Guidelines & Resources" index page.
 *
 * Split out of `BSGAdapter.fetchCandidates` for the same reason as
 * `parseBoaIndex`: offline-testable against fixture HTML.
 *
 * Each guideline on the page is a Divi "promo" module: a `div.et_pb_promo`
 * containing an `h2.et_pb_module_header` (the title) and an
 * `a.et_pb_promo_button[href]` (the document link, either a BSG-hosted PDF or
 * an external journal/society page). This selector was verified against the
 * live page 2026-08-26 to match exactly the 9 guidance/consensus documents in
 * the "BSG Clinical Guidelines" and "Other Resources" sections — no news,
 * event, or membership content on the page carries this class combination.
 * Externally-hosted documents (ESMO, RPS consensus papers, the Desmoid Tumor
 * Research Foundation paper) are intentionally included as BSG-curated
 * evidence; the existing exact-URL matching in `loadExistingUrlMap` /
 * `runDryRun` is what prevents duplicates for anything already catalogued.
 */
export function parseBsgIndex(html: string, baseUrl: string): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  $('div.et_pb_promo').each((_, el) => {
    const module = $(el);
    const topic = module.find('h2.et_pb_module_header').first().text().replace(/\s+/g, ' ').trim();
    const rawHref = module.find('a.et_pb_promo_button[href]').first().attr('href')?.trim();

    if (!rawHref || !topic) return;

    const fullUrl = rawHref.startsWith('http') ? rawHref : new URL(rawHref, baseUrl).href;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    results.push({
      topic,
      source: 'BSG',
      versions: [{ label: 'BSG Guideline Document', url: fullUrl }],
    });
  });

  return results;
}

/**
 * Pilot: DOM scraper for BSG (British Sarcoma Group).
 *
 * Registered in place of BESS: BESS's only public feed (`/feed/`) was
 * inspected 2026-08-26 and found to be general site content (conference
 * announcements, fellowship programmes, member-only "Protected:" posts) with
 * zero guidance items, so it was deliberately NOT registered as a BESS
 * source. BSG's guidance index was confirmed guidance-only instead.
 */
export const BSGAdapter: ProviderAdapter = {
  name: 'British Sarcoma Group (BSG)',
  sourceTag: 'BSG',
  async fetchCandidates(): Promise<DiscoveredItem[]> {
    const targetUrl = 'https://britishsarcomagroup.org.uk/guidelines-2/';
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${targetUrl}`);

    const html = await res.text();
    return parseBsgIndex(html, targetUrl);
  },
};

/**
 * Pure DOM parse of the BOFAS "Statements / Publications" index page.
 *
 * SER-6 feasibility pilot. Split out for the same reason as parseBoaIndex /
 * parseBsgIndex: offline-testable against fixture HTML.
 *
 * The page (a DNN/DotNetNuke site) is a single content block with three
 * `<h2>`-separated sections ("BOFAS Position Statements", "BOFAS Guidelines
 * and Pathways", "National COVID Audit (UK-FALCON)"), each holding one
 * `<p><a href="....pdf...">Title</a> (year)</p>` per document — verified live
 * 2026-08-27: exactly 10 `a[href*=".pdf"]` matches on the page, all of them
 * genuine BOFAS/BOA guidance or position-statement documents, with no other
 * `.pdf` link anywhere else on the page to accidentally match. The trailing
 * "(year)" text sits outside the anchor and is deliberately not captured —
 * only the anchor's own text is taken as the verbatim title, same rule as
 * parseBoaIndex.
 *
 * Deliberately scoped to this one index page only. Does NOT cover the Round
 * Table Consensus Booklets or the Hyperbook — both explicitly out of scope
 * for this pilot (see SER-6). The "National COVID Audit (UK-FALCON)" item is
 * discovered like any other item on the page — it is a real link the
 * provider publishes — and flows through the same pending-candidate pipeline
 * as everything else; nothing here writes it (or anything) to the catalogue.
 */
export function parseBofasPublicationsIndex(html: string, baseUrl: string): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  $('a[href*=".pdf"]').each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    const topic = link.text().replace(/\s+/g, ' ').trim();

    if (!rawHref || !topic) return;

    const fullUrl = rawHref.startsWith('http') ? rawHref : new URL(rawHref, baseUrl).href;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    results.push({
      topic,
      source: 'BOFAS',
      versions: [{ label: 'BOFAS Publication PDF', url: fullUrl }],
    });
  });

  return results;
}

/**
 * SER-6: DOM scraper for BOFAS Position Statements / Publications only.
 *
 * Registered in the default adapter list below after feasibility review.
 * Scope stays deliberately narrow — Round Table booklets and the Hyperbook
 * are not covered; see parseBofasPublicationsIndex's doc comment above.
 */
export const BOFASAdapter: ProviderAdapter = {
  name: 'British Orthopaedic Foot & Ankle Society (BOFAS)',
  sourceTag: 'BOFAS',
  async fetchCandidates(): Promise<DiscoveredItem[]> {
    const targetUrl = 'https://www.bofas.org.uk/clinician/research/bofas-publications';
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${targetUrl}`);

    const html = await res.text();
    return parseBofasPublicationsIndex(html, targetUrl);
  },
};

/**
 * Pure DOM parse of the BSSH "Guidelines & Resources" page.
 *
 * Verified live 2026-08-27: the page is a single content block mixing three
 * link shapes — `.aspx` links to further BSSH sub-pages, `.pdf` links to
 * documents hosted directly on bssh.ac.uk or on gettingitrightfirsttime.co.uk
 * (GIRFT), and two inline journal citations (journals.sagepub.com) embedded
 * in running prose. Deliberately scoped to `.pdf` links only — exactly 11 on
 * the page, all genuine guidance/standards documents, with no other `.pdf`
 * link anywhere else on the page. The `.aspx` sub-pages are a structurally
 * different, non-uniform content type (some are guidance, at least one
 * — "Coronavirus information" — is not) that would need separate
 * page-by-page investigation; out of scope here, same reasoning as excluding
 * BOFAS's Round Table booklets / Hyperbook.
 *
 * The GIRFT-hosted PDF is discovered like any other item — this parser does
 * not know about scripts/blocked-sources.json — and is filtered out
 * downstream by runDryRun's existing isBlocked() check, the same way it
 * already handles GIRFT links from any other adapter.
 */
export function parseBsshGuidelinesIndex(html: string, baseUrl: string): DiscoveredItem[] {
  const $ = cheerio.load(html);
  const results: DiscoveredItem[] = [];
  const seen = new Set<string>();

  $('a[href*=".pdf"]').each((_, el) => {
    const link = $(el);
    const rawHref = link.attr('href')?.trim();
    const topic = link.text().replace(/\s+/g, ' ').trim();

    if (!rawHref || !topic) return;

    const fullUrl = rawHref.startsWith('http') ? rawHref : new URL(rawHref, baseUrl).href;

    if (seen.has(fullUrl)) return;
    seen.add(fullUrl);

    results.push({
      topic,
      source: 'BSSH',
      versions: [{ label: 'BSSH Guideline Document', url: fullUrl }],
    });
  });

  return results;
}

/**
 * DOM scraper for BSSH Guidelines & Resources.
 *
 * Unlike BOFAS, these URLs carry no cache-busting query string, so exact-URL
 * catalogue matching works cleanly here without needing the ver-stripping fix.
 */
export const BSSHAdapter: ProviderAdapter = {
  name: 'British Society for Surgery of the Hand (BSSH)',
  sourceTag: 'BSSH',
  async fetchCandidates(): Promise<DiscoveredItem[]> {
    const targetUrl = 'https://www.bssh.ac.uk/professionals/guidelines.aspx';
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${targetUrl}`);

    const html = await res.text();
    return parseBsshGuidelinesIndex(html, targetUrl);
  },
};

/**
 * Pilot 2: Generic RSS adapter (for WordPress/CMS feeds).
 *
 * Metadata is taken verbatim from the feed: <title> for topic, <link> for the
 * URL, <pubDate>/<isoDate> for the date. contentSnippet is truncated to 250
 * chars — a deterministic cut, never a paraphrase.
 */
export function createRSSAdapter(name: string, sourceTag: string, feedUrl: string): ProviderAdapter {
  const parser = new RssParser();
  return {
    name,
    sourceTag,
    async fetchCandidates(): Promise<DiscoveredGuideline[]> {
      const feed = await parser.parseURL(feedUrl);
      return (feed.items || [])
        .map(item => ({
          topic: (item.title || '').trim(),
          source: sourceTag,
          summary: (item.contentSnippet || item.content || '').trim().substring(0, 250),
          versions: [
            {
              label: 'Source Link',
              url: (item.link || '').trim(),
              date: item.pubDate || item.isoDate,
            },
          ],
        }))
        .filter(item => Boolean(item.versions[0].url && item.topic));
    },
  };
}

// ─── Existing Dataset Indexer ───────────────────────────────────────────────
// URLs in this catalogue live ONLY inside versions[].url — there is no
// top-level url field on a Guideline.

function loadExistingUrlMap(guidelines: Guideline[]): Map<string, Guideline> {
  const urlMap = new Map<string, Guideline>();
  for (const g of guidelines) {
    for (const v of g.versions) {
      if (v.url && v.url !== '#') {
        urlMap.set(normaliseCandidateUrl(v.url), g);
      }
    }
  }
  return urlMap;
}

// NB: `normaliseCandidateUrl` from the shared contract replaces the two
// identical inline normalisers this file used to carry (index build + lookup).
// The implementation is byte-for-byte the same rule — lowercase, trim, strip
// trailing slashes — so matching behaviour is unchanged. It is imported rather
// than redeclared so that the match key and the candidate ID cannot drift apart.

// ─── Candidate Mapping ───────────────────────────────────────────────────────

/**
 * Project a discovered provider item into the unified review record.
 *
 * Purely a re-shaping step: no field is invented, rewritten, or enriched. The
 * `versions[]` URLs are carried through exactly as discovered; only
 * `primaryUrl` is normalised, because that is the matching/identity key.
 */
function toIngestionCandidate(
  item: DiscoveredGuideline,
  adapter: ProviderAdapter,
  discoveredAt: string,
): IngestionCandidate {
  const primaryUrl = normaliseCandidateUrl(item.versions[0].url);

  return {
    candidateId: makeCandidateId({
      pipeline: PIPELINE,
      provider: adapter.sourceTag,
      changeReason: CHANGE_REASON,
      primaryUrl,
    }),
    pipeline: PIPELINE,
    provider: adapter.sourceTag,
    providerName: adapter.name,
    topic: item.topic,
    ...(item.summary ? { summary: item.summary } : {}),
    versions: item.versions.map(v => ({
      label: v.label,
      url: v.url,
      ...(v.date ? { date: v.date } : {}),
    })),
    primaryUrl,
    changeReason: CHANGE_REASON,
    reviewStatus: 'pending',
    discoveredAt,
    // NEW_GUIDELINE means nothing in the catalogue matched, by definition.
    matchedGuidelineId: null,
    // Reserved; deliberately not populated in phase 1. See scripts/lib/ingestion.ts.
    providerRef: null,
    notes: `Discovered on the ${adapter.name} index. No matching URL in the static catalogue.`,
  };
}

// ─── Diff Engine ─────────────────────────────────────────────────────────────

export async function runDryRun(adapters: ProviderAdapter[]): Promise<DiffReport[]> {
  const blocked = getBlockedDomains();
  const existingUrlMap = loadExistingUrlMap(GUIDELINES_DATA);
  const reports: DiffReport[] = [];

  console.log(`[Sync] Loaded ${GUIDELINES_DATA.length} existing guidelines (${existingUrlMap.size} distinct version URLs).`);
  console.log(`[Sync] Loaded ${blocked.size} blocked domains.`);
  console.log('─────────────────────────────────────────────────────────────');

  for (const adapter of adapters) {
    console.log(`[Sync] Running adapter: ${adapter.name}...`);
    const generatedAt = new Date().toISOString();

    try {
      const discovered = await adapter.fetchCandidates();
      let matchedCount = 0;
      let skippedBlocked = 0;
      const newCandidates: DiscoveredGuideline[] = [];
      const candidates: IngestionCandidate[] = [];

      for (const item of discovered) {
        const url = item.versions[0].url;
        if (isBlocked(url, blocked)) {
          skippedBlocked++;
          continue;
        }
        if (existingUrlMap.has(normaliseCandidateUrl(url))) {
          matchedCount++;
        } else {
          newCandidates.push(item);
          candidates.push(toIngestionCandidate(item, adapter, generatedAt));
        }
      }

      const report: DiffReport = {
        pipeline: PIPELINE,
        adapter: adapter.name,
        provider: adapter.sourceTag,
        generatedAt,
        totalDiscovered: discovered.length,
        matchedExisting: matchedCount,
        skippedBlocked,
        candidates,
        newCandidates,
      };

      // Coverage assertion: discovered must equal matched + blocked + candidates.
      // A shortfall here means items were dropped somewhere in the loop above,
      // which is exactly the class of silent undercount this project has already
      // been bitten by. Surfaced loudly, but never fatal — this is a read-only
      // report and losing the remaining adapters would be the worse outcome.
      const coverage = summariseReport(report);
      if (!coverage.balanced) {
        console.warn(
          `  ! COVERAGE MISMATCH for ${adapter.name}: ${report.totalDiscovered} discovered but ` +
            `${coverage.accountedFor} accounted for (${coverage.unaccountedFor} unaccounted).`,
        );
      }

      reports.push(report);

      console.log(
        `  ✓ Found ${discovered.length} items ` +
          `(${matchedCount} matched in catalogue, ${newCandidates.length} new/unmatched` +
          `${skippedBlocked ? `, ${skippedBlocked} skipped as blocked-domain` : ''})`,
      );
    } catch (err) {
      // Previously an adapter failure left NO trace in candidates.json — the run
      // simply reported one fewer adapter. Record it instead, so a zero-candidate
      // artifact can be told apart from a failed sweep.
      console.error(`  ✗ Failed running adapter ${adapter.name}:`, err);
      reports.push({
        pipeline: PIPELINE,
        adapter: adapter.name,
        provider: adapter.sourceTag,
        generatedAt,
        totalDiscovered: 0,
        matchedExisting: 0,
        skippedBlocked: 0,
        candidates: [],
        newCandidates: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return reports;
}

// ─── Execution Block (Dry-Run Only) ──────────────────────────────────────────
// ESM-safe entrypoint check. package.json sets "type": "module", so `require`
// and `__dirname` do not exist in this file.

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  (async () => {
    console.log('=== Provider Sync Pipeline (Dry-Run Mode) ===\n');

    // Register pilot adapters.
    // GIRFT is intentionally absent: its hosts 403 automated clients by design.
    // BESS is intentionally absent too: its only feed is general site content
    // (events/fellowships/member posts), not guidance — see BSGAdapter's doc
    // comment above for the 2026-08-26 finding.
    // BOFASAdapter is scoped to the Publications index only (SER-6) — Round
    // Table booklets and the Hyperbook are deliberately not covered, see its
    // doc comment above. Discovered candidates (including UK-FALCON, an audit
    // report rather than clinical guidance) land in candidates.json as
    // reviewStatus 'pending' like everything else this pipeline finds —
    // nothing here writes to the catalogue.
    // BSSHAdapter is scoped to Guidelines & Resources' .pdf links only — see
    // its doc comment above. BHS, BASS/UKSSB, BOSTAA, and EBJIS were each
    // investigated and deliberately NOT automated (no stable extractable
    // title, aggregate-row duplicate-matching conflict, no guidance index at
    // all, and fragile page-builder markup, respectively) — see the
    // provider-feasibility report for details on each.
    const adapters: ProviderAdapter[] = [BOAAdapter, BSGAdapter, BOFASAdapter, BSSHAdapter];

    const reports = await runDryRun(adapters);

    console.log('\n=== Summary Report ===');
    for (const r of reports) {
      console.log(`\nAdapter: ${r.adapter}`);
      if (r.error) {
        console.log(`  - ADAPTER FAILED: ${r.error}`);
        continue;
      }
      console.log(`  - Total items discovered: ${r.totalDiscovered}`);
      console.log(`  - Already in catalogue:   ${r.matchedExisting}`);
      console.log(`  - Skipped (blocked host): ${r.skippedBlocked}`);
      console.log(`  - New / unmatched:        ${r.candidates.length}`);
      if (r.candidates.length > 0) {
        console.log('  - Sample unmatched candidates (first 3):');
        r.candidates.slice(0, 3).forEach(c => {
          console.log(`     • [${c.candidateId}] "${c.topic}" -> ${c.versions[0].url}`);
        });
      }
    }

    const totalCandidates = reports.reduce((n, r) => n + r.candidates.length, 0);

    // Staging output for human review. This is the ONLY file the script writes,
    // and it is gitignored. Nothing downstream consumes it automatically.
    const payload = {
      schemaVersion: CANDIDATE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      note:
        'STAGING ONLY — candidates for human review, all reviewStatus "pending". Nothing here ' +
        'has been written to Supabase, to src/data/guidelines-data.ts, or to GitHub.',
      existingGuidelineCount: GUIDELINES_DATA.length,
      totalCandidates,
      reports,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\nWrote staging file: ${OUTPUT_PATH} (${totalCandidates} candidate(s), schema v${CANDIDATE_SCHEMA_VERSION})`);
    console.log('Dry run complete. No database writes and no changes to guidelines-data.ts.');
  })();
}
