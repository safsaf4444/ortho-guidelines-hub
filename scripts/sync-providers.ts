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
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import * as cheerio from 'cheerio';
import RssParser from 'rss-parser';
import { GUIDELINES_DATA, type Guideline } from '../src/data/guidelines-data';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface DiscoveredGuideline {
  topic: string;
  source: string;
  summary?: string;
  versions: { label: string; url: string; date?: string }[];
}

export interface ProviderAdapter {
  name: string;
  sourceTag: string;
  fetchCandidates(): Promise<DiscoveredGuideline[]>;
}

export interface DiffReport {
  adapter: string;
  totalDiscovered: number;
  matchedExisting: number;
  skippedBlocked: number;
  newCandidates: DiscoveredGuideline[];
}

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
  async fetchCandidates(): Promise<DiscoveredGuideline[]> {
    const targetUrl = 'https://www.boa.ac.uk/standards-guidance/boasts.html';
    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) OrthoGuidelinesHub/1.0',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${targetUrl}`);

    const html = await res.text();
    const $ = cheerio.load(html);
    const results: DiscoveredGuideline[] = [];
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
        : new URL(rawHref, targetUrl).href;

      if (seen.has(fullUrl)) return;
      seen.add(fullUrl);

      results.push({
        topic,
        source: 'BOA',
        versions: [{ label: 'BOASt PDF', url: fullUrl }],
      });
    });

    return results;
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
        const normalised = v.url.toLowerCase().trim().replace(/\/+$/, '');
        urlMap.set(normalised, g);
      }
    }
  }
  return urlMap;
}

const normaliseUrl = (u: string) => u.toLowerCase().trim().replace(/\/+$/, '');

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
    try {
      const candidates = await adapter.fetchCandidates();
      let matchedCount = 0;
      let skippedBlocked = 0;
      const newCandidates: DiscoveredGuideline[] = [];

      for (const item of candidates) {
        const url = item.versions[0].url;
        if (isBlocked(url, blocked)) {
          skippedBlocked++;
          continue;
        }
        if (existingUrlMap.has(normaliseUrl(url))) {
          matchedCount++;
        } else {
          newCandidates.push(item);
        }
      }

      reports.push({
        adapter: adapter.name,
        totalDiscovered: candidates.length,
        matchedExisting: matchedCount,
        skippedBlocked,
        newCandidates,
      });

      console.log(
        `  ✓ Found ${candidates.length} items ` +
          `(${matchedCount} matched in catalogue, ${newCandidates.length} new/unmatched` +
          `${skippedBlocked ? `, ${skippedBlocked} skipped as blocked-domain` : ''})`,
      );
    } catch (err) {
      console.error(`  ✗ Failed running adapter ${adapter.name}:`, err);
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
    // Add BESS once its feed URL is confirmed, e.g.
    //   createRSSAdapter('BESS', 'BESS', 'https://bess.ac.uk/feed/'),
    const adapters: ProviderAdapter[] = [BOAAdapter];

    const reports = await runDryRun(adapters);

    console.log('\n=== Summary Report ===');
    for (const r of reports) {
      console.log(`\nAdapter: ${r.adapter}`);
      console.log(`  - Total items discovered: ${r.totalDiscovered}`);
      console.log(`  - Already in catalogue:   ${r.matchedExisting}`);
      console.log(`  - Skipped (blocked host): ${r.skippedBlocked}`);
      console.log(`  - New / unmatched:        ${r.newCandidates.length}`);
      if (r.newCandidates.length > 0) {
        console.log('  - Sample unmatched candidates (first 3):');
        r.newCandidates.slice(0, 3).forEach(c => {
          console.log(`     • "${c.topic}" -> ${c.versions[0].url}`);
        });
      }
    }

    // Staging output for human review. This is the ONLY file the script writes.
    const payload = {
      generatedAt: new Date().toISOString(),
      note: 'STAGING ONLY — candidates for human review. Nothing here has been written to Supabase or to src/data/guidelines-data.ts.',
      existingGuidelineCount: GUIDELINES_DATA.length,
      reports,
    };
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf-8');
    console.log(`\nWrote staging file: ${OUTPUT_PATH}`);
    console.log('Dry run complete. No database writes and no changes to guidelines-data.ts.');
  })();
}
