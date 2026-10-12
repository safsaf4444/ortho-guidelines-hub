/**
 * scripts/discover.ts
 * ────────────────────
 * READ-ONLY publisher discovery sweep. Batch 1: NHS EBI, BESS, BOFAS.
 *
 * Run:  npx tsx scripts/discover.ts
 *       npx tsx scripts/discover.ts --provider "NHS EBI"
 *
 * ─── WHAT IT DOES AND, MORE IMPORTANTLY, DOES NOT ───────────────────────────
 *
 *   * Reads provider index pages over HTTP, revalidating against an on-disk
 *     cache (scripts/lib/discovery-cache.ts).
 *   * Classifies each item against the STATIC catalogue in
 *     src/data/guidelines-data.ts.
 *   * Writes two files to reports/ for a human to read.
 *
 *   * NO database connection of any kind. It imports no Supabase client and
 *     opens no socket to one.
 *   * NO write to src/data/guidelines-data.ts, no change to any catalogue entry.
 *   * NO staging insert. The classes it emits are DiscoveryClass values, which
 *     are structurally not ChangeReason values and cannot satisfy a
 *     `change_reason` column — see scripts/lib/discovery-classification.ts for
 *     why that matters while PR #174's 42809 guard is unapplied.
 *   * NO automatic consumer. The files land in reports/ (gitignored), are read
 *     by a person, and nothing downstream picks them up.
 *   * NO fetch of a provider whose participation is not 'active'. ROS is
 *     `awaiting-approval` and is never requested.
 *
 * ─── FAILURE IS REPORTED AS FAILURE ─────────────────────────────────────────
 *
 * An adapter's SURFACE COVERAGE and its RUN OUTCOME are different things, and
 * conflating them is how a partial adapter's failure gets read as a successful
 * partial result. A provider declared `partial` covers a named subset of what
 * its publisher puts out; if a run of it throws, or a surface known to carry
 * items yields none, the outcome is `failed`, the exit code is non-zero, and
 * the report says so. "Partial" never softens "failed".
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

import { GUIDELINES_DATA } from '../src/data/guidelines-data';
import {
  DISCOVERY_SCHEMA_VERSION,
  type DiscoveryCandidate,
  type DiscoveryClass,
} from './lib/discovery-classification';
import { buildCatalogueIndex, classify } from './lib/edition-match';
import {
  fetchSurface,
  readTokenStore,
  writeTokenStore,
  MAX_VALIDATOR_AGE_MS,
  type FetchOutcome,
} from './lib/discovery-cache';
import {
  PROVIDER_REGISTRY,
  validateRegistry,
  type ProviderRegistryEntry,
} from './lib/provider-registry';
import { redirectAlternative, volatileToken } from './lib/url-alternatives';
import { normaliseCandidateUrl } from './lib/ingestion';

import { parseEbiSpecialtyIndex, EBI_MSK_SURFACE, EBI_RETIRED_SURFACE } from './adapters/ebi';
import { parseBessPathwaysIndex, BESS_PATHWAYS_SURFACE } from './adapters/bess';
import type { SurfaceParse } from './adapters/types';
// BOFAS keeps its existing parser. Its parse rules are deliberately unchanged
// by this batch — what improves is the MATCHING applied to what it returns.
import { parseBofasPublicationsIndex } from './sync-providers';

const OUTPUT_DIR = path.join(process.cwd(), 'reports');

/**
 * A surface and how to parse it.
 *
 * `expectItems` says the surface is known to carry at least one item. A page
 * that parses to zero items is then a PARSE FAILURE, not an empty truth: every
 * surface here was observed carrying items, so zero means the markup moved or
 * the selector broke. Treating it as "nothing found" is exactly the silent
 * undercount this project has already been bitten by.
 */
interface SurfacePlan {
  url: string;
  parse: (html: string, surfaceUrl: string) => SurfaceParse;
  expectItems: boolean;
}

function surfacePlansFor(entry: ProviderRegistryEntry): SurfacePlan[] {
  switch (entry.key) {
    case 'NHS EBI':
      return [
        { url: EBI_MSK_SURFACE, parse: parseEbiSpecialtyIndex, expectItems: true },
        // The retired-guidance term held exactly one item when last read. It
        // can legitimately empty out if the programme un-retires it, so this
        // surface is NOT required to be non-empty.
        { url: EBI_RETIRED_SURFACE, parse: parseEbiSpecialtyIndex, expectItems: false },
      ];
    case 'BESS':
      return [{ url: BESS_PATHWAYS_SURFACE, parse: parseBessPathwaysIndex, expectItems: true }];
    case 'BOFAS':
      return [
        {
          url: entry.surfaces[0].url,
          parse: (html, surfaceUrl) => ({
            items: parseBofasPublicationsIndex(html, surfaceUrl).map((d) => ({
              topic: d.topic,
              discoveredUrl: d.versions[0].url,
              statedLabels: [],
            })),
            excluded: [],
          }),
          expectItems: true,
        },
      ];
    default:
      return [];
  }
}

type RunOutcome = 'ok' | 'failed' | 'skipped';

interface SurfaceReport {
  url: string;
  finalUrl: string;
  status: number;
  revalidated: boolean;
  requestMode: FetchOutcome['requestMode'];
  validatorsSent: string[];
  conditionalSkippedReason: FetchOutcome['conditionalSkippedReason'];
  bodySha256: string;
  previousBodySha256: string | null;
  bodyChanged: boolean;
  redirected: boolean;
  itemsParsed: number;
  excluded: Array<{ url: string; reason: string }>;
  error?: string;
}

interface ProviderReport {
  provider: string;
  providerName: string;
  participation: ProviderRegistryEntry['participation'];
  participationReason?: string;
  surfaceCoverage: ProviderRegistryEntry['surfaceCoverage'];
  uncoveredSurfaces?: string[];
  outcome: RunOutcome;
  /** Why, for 'failed' or 'skipped'. */
  outcomeReason?: string;
  surfaces: SurfaceReport[];
  itemsDiscovered: number;
  matchedExisting: number;
  candidates: DiscoveryCandidate[];
  byClass: Record<DiscoveryClass, number>;
  /** itemsDiscovered === matchedExisting + candidates.length */
  coverageBalanced: boolean;
}

function emptyByClass(): Record<DiscoveryClass, number> {
  return { NEW_GUIDELINE: 0, POSSIBLE_NEW_EDITION: 0, EDITION_TOKEN_CHANGED: 0 };
}

async function runProvider(
  entry: ProviderRegistryEntry,
  index: ReturnType<typeof buildCatalogueIndex>,
  tokenStore: Record<string, { parameter: string; value: string; observedAt: string }>,
  discoveredAt: string,
): Promise<ProviderReport> {
  const base: ProviderReport = {
    provider: entry.key,
    providerName: entry.name,
    participation: entry.participation,
    ...(entry.participationReason ? { participationReason: entry.participationReason } : {}),
    surfaceCoverage: entry.surfaceCoverage,
    ...(entry.uncoveredSurfaces ? { uncoveredSurfaces: entry.uncoveredSurfaces } : {}),
    outcome: 'skipped',
    surfaces: [],
    itemsDiscovered: 0,
    matchedExisting: 0,
    candidates: [],
    byClass: emptyByClass(),
    coverageBalanced: true,
  };

  if (entry.participation !== 'active') {
    return {
      ...base,
      outcome: 'skipped',
      outcomeReason:
        `participation is '${entry.participation}' — no request was made. ` +
        (entry.participationReason ?? ''),
    };
  }

  const plans = surfacePlansFor(entry);
  if (plans.length === 0) {
    return {
      ...base,
      outcome: 'failed',
      outcomeReason:
        `registry marks ${entry.key} active but scripts/discover.ts has no surface plan for it. ` +
        'Reported as a failure rather than an empty result.',
    };
  }

  const surfaces: SurfaceReport[] = [];
  const candidates: DiscoveryCandidate[] = [];
  let itemsDiscovered = 0;
  let matchedExisting = 0;
  const byClass = emptyByClass();
  const failures: string[] = [];

  for (const plan of plans) {
    try {
      const fetched = await fetchSurface(plan.url);
      const parsed = plan.parse(fetched.body, fetched.finalUrl);

      if (plan.expectItems && parsed.items.length === 0) {
        throw new Error(
          `parsed 0 items from ${plan.url}, which is known to carry items. Treating as a parse ` +
            'failure (markup or selector change), not as an empty result.',
        );
      }

      itemsDiscovered += parsed.items.length;

      for (const item of parsed.items) {
        const alternatives = fetched.redirected
          ? [
              redirectAlternative(plan.url, fetched.finalUrl, {
                status: fetched.status,
                contentType: fetched.contentType,
                reportedContentLength: fetched.reportedContentLength,
                checkedAt: fetched.fetchedAt,
              }),
            ]
          : [];

        const tokenKey = normaliseCandidateUrl(item.discoveredUrl);
        const previousToken = tokenStore[tokenKey] ?? null;

        const candidate = classify({
          provider: entry.key,
          providerName: entry.name,
          surface: fetched.finalUrl,
          topic: item.topic,
          discoveredUrl: item.discoveredUrl,
          urlAlternatives: alternatives,
          statedLabels: item.statedLabels,
          discoveredAt,
          index,
          previousToken,
        });

        // Record the token we saw, whether or not it changed, so the NEXT run
        // has something to compare against. This is the only reason
        // EDITION_TOKEN_CHANGED can ever be a comparison rather than a first
        // sighting, and it is why the store is on disk.
        const token = volatileToken(item.discoveredUrl);
        if (token) {
          tokenStore[tokenKey] = {
            parameter: token.parameter,
            value: token.value,
            observedAt: discoveredAt,
          };
        }

        if (candidate === null) {
          matchedExisting++;
        } else {
          candidates.push(candidate);
          byClass[candidate.classification]++;
        }
      }

      surfaces.push({
        url: plan.url,
        finalUrl: fetched.finalUrl,
        status: fetched.status,
        revalidated: fetched.revalidated,
        requestMode: fetched.requestMode,
        validatorsSent: fetched.validatorsSent,
        conditionalSkippedReason: fetched.conditionalSkippedReason,
        bodySha256: fetched.bodySha256,
        previousBodySha256: fetched.previousBodySha256,
        bodyChanged: fetched.bodyChanged,
        redirected: fetched.redirected,
        itemsParsed: parsed.items.length,
        excluded: parsed.excluded,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push(`${plan.url}: ${message}`);
      surfaces.push({
        url: plan.url,
        finalUrl: plan.url,
        status: 0,
        revalidated: false,
        requestMode: 'unconditional',
        validatorsSent: [],
        conditionalSkippedReason: null,
        bodySha256: '',
        previousBodySha256: null,
        bodyChanged: false,
        redirected: false,
        itemsParsed: 0,
        excluded: [],
        error: message,
      });
    }
  }

  const coverageBalanced = itemsDiscovered === matchedExisting + candidates.length;

  return {
    ...base,
    outcome: failures.length > 0 ? 'failed' : 'ok',
    ...(failures.length > 0
      ? {
          outcomeReason:
            `${failures.length} of ${plans.length} surface(s) failed. A declared-partial adapter that ` +
            'fails is a FAILURE, not a partial success: ' +
            failures.join(' | '),
        }
      : {}),
    surfaces,
    itemsDiscovered,
    matchedExisting,
    candidates,
    byClass,
    coverageBalanced,
  };
}

function renderCoverageReport(reports: ProviderReport[], generatedAt: string): string {
  const lines: string[] = [];
  lines.push('# Publisher discovery — coverage report');
  lines.push('');
  lines.push(`Generated: ${generatedAt}`);
  lines.push('');
  lines.push(
    'READ-ONLY sweep. No database connection was opened, no catalogue entry was changed, ' +
      'nothing was staged, and nothing consumes this file automatically.',
  );
  lines.push('');

  lines.push('## Participation');
  lines.push('');
  lines.push('| Provider | Participation | Surface coverage | Run outcome |');
  lines.push('| --- | --- | --- | --- |');
  for (const r of reports) {
    lines.push(
      `| ${r.provider} | ${r.participation} | ${r.surfaceCoverage} | **${r.outcome}** |`,
    );
  }
  lines.push('');
  lines.push(
    '`surfaceCoverage` and `outcome` are independent. A `partial` adapter that fails reports ' +
      '`failed` — partial coverage never softens a failed run.',
  );
  lines.push('');

  for (const r of reports) {
    lines.push(`## ${r.provider} — ${r.providerName}`);
    lines.push('');
    lines.push(`- Participation: **${r.participation}**`);
    if (r.participationReason) lines.push(`  - ${r.participationReason}`);
    lines.push(`- Surface coverage: **${r.surfaceCoverage}**`);
    if (r.uncoveredSurfaces?.length) {
      lines.push('  - Not covered by this adapter:');
      for (const u of r.uncoveredSurfaces) lines.push(`    - ${u}`);
    }
    lines.push(`- Run outcome: **${r.outcome}**`);
    if (r.outcomeReason) lines.push(`  - ${r.outcomeReason}`);

    if (r.surfaces.length) {
      lines.push('- Surfaces read:');
      for (const s of r.surfaces) {
        if (s.error) {
          lines.push(`  - \`${s.url}\` — **FAILED**: ${s.error}`);
          continue;
        }
        const WHY: Record<string, string> = {
          'no-stored-entry': 'no cached entry yet — first time we have fetched this surface',
          'no-validator-offered-by-host':
            'the host offered no ETag or Last-Modified to this client, so no conditional request is possible — change is detected by body hash instead',
          'stored-validator-past-trust-window': 'stored validator past the trust window, so it was not reused',
        };
        const validator = s.validatorsSent.length
          ? `conditional (${s.validatorsSent.join('; ')})`
          : `unconditional — ${WHY[s.conditionalSkippedReason ?? ''] ?? 'reason not recorded'}`;
        lines.push(
          `  - \`${s.url}\` — HTTP ${s.status}${s.revalidated ? ' (304, stored body reused)' : ''}, ` +
            `${validator}, ${s.itemsParsed} item(s) parsed, ${s.excluded.length} rejected by filter`,
        );
        if (s.redirected) lines.push(`    - redirected to \`${s.finalUrl}\` (recorded as an alternative, URL preserved)`);
        if (s.previousBodySha256 === null) {
          lines.push('    - first body we have held for this surface — no comparison possible');
        } else if (s.bodyChanged) {
          lines.push('    - body hash DIFFERS from the one last stored (the page changed in some way; what changed is not established here)');
        } else if (!s.revalidated) {
          lines.push('    - body hash matches the one last stored');
        }
      }
    }

    lines.push(
      `- Items discovered: ${r.itemsDiscovered} — ${r.matchedExisting} already in the catalogue by URL, ` +
        `${r.candidates.length} needing review`,
    );
    lines.push(
      `  - NEW_GUIDELINE ${r.byClass.NEW_GUIDELINE} · POSSIBLE_NEW_EDITION ${r.byClass.POSSIBLE_NEW_EDITION} ` +
        `· EDITION_TOKEN_CHANGED ${r.byClass.EDITION_TOKEN_CHANGED}`,
    );
    if (!r.coverageBalanced) {
      lines.push(
        `  - **COVERAGE MISMATCH**: ${r.itemsDiscovered} discovered but ` +
          `${r.matchedExisting + r.candidates.length} accounted for. Items were dropped somewhere.`,
      );
    }

    for (const c of r.candidates) {
      lines.push('');
      lines.push(`### ${c.classification} — ${c.topic}`);
      lines.push(`- \`${c.discoveryId}\``);
      lines.push(`- Discovered URL (verbatim): \`${c.discoveredUrl}\``);
      if (c.matchedGuidelineId) lines.push(`- Concerns catalogue entry: \`${c.matchedGuidelineId}\``);
      if (c.statedLabels.length) {
        lines.push('- Publisher-stated labels (verbatim, not parsed into dates):');
        for (const l of c.statedLabels) {
          lines.push(`  - ${l.fieldLabel ? `${l.fieldLabel}: ` : ''}"${l.value}" (${l.origin}, from \`${l.readFrom}\`)`);
        }
      }
      if (c.softMatch) lines.push(`- Soft match: ${c.softMatch.statement}`);
      if (c.tokenChange) lines.push(`- Token observation: ${c.tokenChange.statement}`);
      for (const alt of c.urlAlternatives) {
        lines.push(`- Alternative (${alt.relation}, equivalence: ${alt.equivalence}): \`${alt.url}\``);
        lines.push(`  - ${alt.statement}`);
      }
      lines.push(`- ${c.notes}`);
    }
    lines.push('');
  }

  lines.push('## Cache behaviour');
  lines.push('');
  lines.push(
    `Every surface of every active provider is requested on every run — a cache entry never ` +
      `prevents a request. The on-disk store supplies validators and a previous body hash; a stored ` +
      `validator is trusted for ${MAX_VALIDATOR_AGE_MS / 3_600_000}h, after which the request is made ` +
      'unconditionally even if the provider would have answered 304. A 304 means "the provider says ' +
      'this did not change since the validator we sent" — not "nothing was published".',
  );
  lines.push('');

  return lines.join('\n');
}

export async function runDiscovery(providerFilter?: string): Promise<{
  reports: ProviderReport[];
  exitCode: number;
}> {
  const registryProblems = validateRegistry();
  if (registryProblems.length > 0) {
    for (const p of registryProblems) console.error(`[registry] ${p}`);
    return { reports: [], exitCode: 1 };
  }

  const discoveredAt = new Date().toISOString();
  const index = buildCatalogueIndex(GUIDELINES_DATA);
  const tokenStore = readTokenStore();

  console.log(
    `[discover] catalogue: ${GUIDELINES_DATA.length} entries, ${index.byUrlKey.size} document URL keys, ` +
      `${index.knownPublisherLabels.length} publisher labels`,
  );

  const selected = PROVIDER_REGISTRY.filter((p) => !providerFilter || p.key === providerFilter);
  if (providerFilter && selected.length === 0) {
    console.error(`[discover] no registry entry named "${providerFilter}"`);
    return { reports: [], exitCode: 1 };
  }

  const reports: ProviderReport[] = [];
  for (const entry of selected) {
    if (entry.participation === 'active') {
      console.log(`[discover] ${entry.key}: fetching ${surfacePlansFor(entry).length} surface(s)`);
    } else {
      console.log(`[discover] ${entry.key}: skipped (${entry.participation}) — no request made`);
    }
    reports.push(await runProvider(entry, index, tokenStore, discoveredAt));
  }

  writeTokenStore(tokenStore);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const stamp = discoveredAt.replace(/[:.]/g, '-');
  const jsonPath = path.join(OUTPUT_DIR, `discovery-${stamp}.json`);
  const mdPath = path.join(OUTPUT_DIR, `discovery-coverage-${stamp}.md`);

  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        schemaVersion: DISCOVERY_SCHEMA_VERSION,
        generatedAt: discoveredAt,
        note:
          'READ-ONLY discovery output for HUMAN REVIEW. Nothing here has been written to Supabase, ' +
          'to src/data/guidelines-data.ts, or to GitHub. The `classification` values are ' +
          'DiscoveryClass, NOT ChangeReason, and cannot satisfy a staged_guidelines.change_reason ' +
          'column. No automatic consumer reads this file.',
        catalogueEntryCount: GUIDELINES_DATA.length,
        reports,
      },
      null,
      2,
    ),
    'utf-8',
  );
  fs.writeFileSync(mdPath, renderCoverageReport(reports, discoveredAt), 'utf-8');

  console.log(`\n[discover] wrote ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`[discover] wrote ${path.relative(process.cwd(), mdPath)}`);

  const failed = reports.filter((r) => r.outcome === 'failed');
  const unbalanced = reports.filter((r) => !r.coverageBalanced);

  console.log('\n=== Summary ===');
  for (const r of reports) {
    const detail =
      r.outcome === 'ok'
        ? `${r.itemsDiscovered} discovered, ${r.matchedExisting} matched, ${r.candidates.length} to review`
        : (r.outcomeReason ?? '');
    console.log(`  ${r.provider.padEnd(9)} ${r.participation.padEnd(26)} ${r.outcome.padEnd(8)} ${detail}`);
  }

  if (failed.length) console.error(`\n[discover] ${failed.length} provider(s) FAILED.`);
  if (unbalanced.length) console.error(`[discover] ${unbalanced.length} provider(s) had a coverage mismatch.`);

  return { reports, exitCode: failed.length > 0 || unbalanced.length > 0 ? 1 : 0 };
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  const idx = process.argv.indexOf('--provider');
  const filter = idx >= 0 ? process.argv[idx + 1] : undefined;
  runDiscovery(filter)
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((err) => {
      console.error('[discover] sweep aborted:', err);
      process.exit(1);
    });
}
