/**
 * scripts/lib/provider-registry.ts
 * ─────────────────────────────────
 * Which providers the discovery sweep knows about, and what it is permitted to
 * do with each.
 *
 * DATA AND TYPES ONLY. Importing this cannot open a socket or read a file.
 *
 * ─── THE THREE AXES, KEPT APART ─────────────────────────────────────────────
 *
 * The old model had two outcomes (a report, or a report with an `error`) plus a
 * third that was invisible: a provider deliberately left alone simply had no
 * adapter, so GIRFT and BASK appeared in blocked-sources.json and in no
 * coverage output at all.
 *
 * Collapsing everything into one status field reintroduces that problem in a
 * new shape — most sharply by making "this adapter covers part of its
 * provider's output" indistinguishable from "this adapter ran and succeeded".
 * A partial adapter that THROWS must report a FAILURE, not a successful partial
 * result. So three independent axes:
 *
 *   participation   May we fetch this provider at all, and if not, why?
 *                   A decision about permission and reachability. Static.
 *   surfaceCoverage Does the adapter cover everything the provider publishes,
 *                   or a named subset? A statement about scope. Static.
 *   outcome         What happened on THIS run? ok | failed | skipped.
 *                   Decided at runtime, in scripts/discover.ts, never here.
 *
 * `surfaceCoverage: 'partial'` and `outcome: 'failed'` are orthogonal and can
 * co-occur: a partial adapter that throws is a failed run of a partial adapter,
 * and the report says exactly that.
 */

/**
 * Whether the sweep may fetch a provider.
 *
 *   active                     Fetch it.
 *
 *   awaiting-approval          An adapter exists and is unit-tested offline, but
 *                              whether we may collect from this provider is an
 *                              OPEN QUESTION. Never fetched. Distinct from
 *                              'excluded' on purpose: excluded is a closed
 *                              decision, this one is waiting on an answer, and
 *                              collapsing them would hide the thing that needs
 *                              resolving.
 *
 *   excluded                   A settled decision not to fetch.
 *
 *   blocked-for-tested-client  Automated requests from THE CLIENTS WE HAVE
 *                              TESTED did not get through — a WAF challenge, a
 *                              403, a 401. Read the name literally: it is a
 *                              statement about our observations with our user
 *                              agents from our network, NOT a proven property
 *                              of the provider. A different client, a browser
 *                              engine, another IP range, an agreed user agent,
 *                              or a changed WAF policy may well succeed, and
 *                              these sites load normally in a browser. It also
 *                              does NOT mean the URLs are healthy: being unable
 *                              to check something is not evidence it works.
 */
export type Participation =
  | 'active'
  | 'awaiting-approval'
  | 'excluded'
  | 'blocked-for-tested-client';

/** Does the adapter cover the provider's whole guidance output, or a named part? */
export type SurfaceCoverage = 'complete' | 'partial' | 'none';

/** One page or feed an adapter reads. */
export interface ProviderSurface {
  url: string;
  /** What this surface is, for a report reader. */
  description: string;
}

export interface ProviderRegistryEntry {
  /** Registry key, matching the catalogue's canonical provider label. */
  key: string;
  /** Human-readable name used in reports and candidates. */
  name: string;

  participation: Participation;
  /** Why, for any participation other than 'active'. Required for those. */
  participationReason?: string;
  /** ISO date the participation decision was made or last reviewed. */
  participationSetOn?: string;

  surfaceCoverage: SurfaceCoverage;
  /** Surfaces the adapter reads. Empty when nothing is fetched. */
  surfaces: ProviderSurface[];
  /**
   * What the provider publishes that this adapter does NOT cover. Required
   * whenever surfaceCoverage is 'partial' — an unnamed gap is not a declared
   * gap.
   */
  uncoveredSurfaces?: string[];

  /**
   * Canonical public hostname, where the provider's own hrefs point somewhere
   * else (an origin or backoffice host). Used ONLY to record a
   * canonical-host alternative; never to rewrite a discovered URL.
   */
  canonicalHost?: string;
}

/**
 * Batch-1 registry.
 *
 * BOFAS is present with `surfaceCoverage: 'partial'` but no surfaces of its
 * own: its adapter still lives in scripts/sync-providers.ts and its parse rules
 * are untouched by this batch. The entry exists so BOFAS appears in the
 * coverage report with its declared gaps, which it previously did not.
 */
export const PROVIDER_REGISTRY: readonly ProviderRegistryEntry[] = [
  {
    key: 'NHS EBI',
    name: 'NHS Evidence-Based Interventions programme (Academy of Medical Royal Colleges)',
    participation: 'active',
    surfaceCoverage: 'partial',
    surfaces: [
      {
        url: 'https://ebi.aomrc.org.uk/specialty/musculoskeletal-spine/',
        description:
          'The programme’s own musculoskeletal/spine specialty term — the publisher’s classification, not a keyword guess',
      },
      {
        url: 'https://ebi.aomrc.org.uk/specialty/retired-guidance/',
        description:
          'The programme’s own retired-guidance term. Membership is a PUBLISHER ASSERTION about retirement, reported as such; it changes no catalogue status by itself',
      },
    ],
    uncoveredSurfaces: [
      'The other 11 specialty terms (breast, cardiovascular, ENT, eyes, GI, haematology, kidney/urology, child health, pre-operative assessment, skin and soft tissue, women’s health) — outside this hub’s clinical scope',
      'The /interventions/ A–Z archive, which offers no filtering controls and would re-discover the same items without the specialty classification',
      'EBI List 1 / List 2 statutory guidance PDFs, which are linked from the programme-level pages rather than from a specialty term',
    ],
  },
  {
    key: 'BESS',
    name: 'British Elbow & Shoulder Society (BESS)',
    participation: 'active',
    surfaceCoverage: 'partial',
    surfaces: [
      {
        url: 'https://bess.ac.uk/patient-care-pathways-and-guidelines/',
        description:
          'Static index of patient care pathways and guidelines, under two <h3> headings',
      },
    ],
    uncoveredSurfaces: [
      'https://bess.ac.uk/national-guidelines/ — a wp-file-download manager whose category tree loads over admin-ajax.php; its static HTML contains no document links',
      'WPFD download URLs of the form /download/<catId>/<cat-slug>/<fileId>/<file>.pdf, which THREE existing catalogue entries use and which this surface does not expose',
      'The BESS RSS feed — general site content (events, fellowships, member posts), not guidance (finding of 2026-08-26, not re-litigated here)',
    ],
  },
  {
    key: 'BOFAS',
    name: 'British Orthopaedic Foot & Ankle Society (BOFAS)',
    participation: 'active',
    surfaceCoverage: 'partial',
    surfaces: [
      {
        url: 'https://www.bofas.org.uk/clinician/research/bofas-publications',
        description:
          'Publications index — position statements, guidelines and pathways. Parsed by BOFASAdapter in scripts/sync-providers.ts; parse rules unchanged by this batch',
      },
    ],
    uncoveredSurfaces: [
      'Round Table consensus booklets (12 booklets, 2011–2025) — one catalogue entry already covers them via another route',
      'The BOFAS Hyperbook — six catalogue entries already cover parts of it',
      'The BOFAS Registry annual reports',
    ],
  },
  {
    key: 'ROS',
    name: 'Royal Osteoporosis Society (ROS)',
    participation: 'awaiting-approval',
    participationReason:
      'ACCESS APPROVAL UNRESOLVED. ROS’s terms of use expressly permit LINKING to their site and separately prohibit "reproduction, storage, modification, distribution or republication" of their Material without prior written consent. Permission to place a hyperlink is not permission for automated retrieval or storage, and their terms do not address automated access at all. Whether a scraped title and a stored URL fall under that prohibition is a question for ROS, not one to settle by reading their linking clause generously. The adapter is written and tested against offline fixtures; it makes NO live request until this is resolved.',
    participationSetOn: '2026-10-12',
    surfaceCoverage: 'partial',
    surfaces: [
      {
        url: 'https://theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/',
        description:
          'Clinical publications and resources — a plain list of PDFs. DECLARED, NOT FETCHED while participation is awaiting-approval',
      },
    ],
    uncoveredSurfaces: [
      'Clinical quality toolkits sub-pages (hip fracture toolkit, FLS implementation toolkit, medicine support) — sub-pages rather than documents',
      'The Evidenced Resources for Osteoporosis (ERO) hub, a partner-hosted library',
    ],
    canonicalHost: 'theros.org.uk',
  },
  {
    key: 'GIRFT',
    name: 'Getting It Right First Time (GIRFT)',
    participation: 'blocked-for-tested-client',
    participationReason:
      'Returned HTTP 403 to every automated client tested in the 2026-08-22 dead-link audit — 46 URLs across pathway PDFs, reports and the pathways index — while loading normally in a browser. That is an observation about the clients and network we tested with, NOT a proven property of the provider: another client, user agent, IP range or an agreed arrangement may well succeed. It also does not establish that GIRFT URLs are healthy; being unable to check is not evidence of working. GIRFT links still need periodic manual review.',
    participationSetOn: '2026-08-22',
    surfaceCoverage: 'none',
    surfaces: [],
  },
  {
    key: 'BASK',
    name: 'British Association for Surgery of the Knee (BASK)',
    participation: 'blocked-for-tested-client',
    participationReason:
      'A Cloudflare bot challenge stopped every automated fetch tested (bask.ac.uk, 2026-07-28; baskonline.com, 2026-08-24). Observed with the clients we tested; not a proven property of the provider, and not evidence that BASK URLs are unhealthy.',
    participationSetOn: '2026-07-28',
    surfaceCoverage: 'none',
    surfaces: [],
  },
  {
    key: 'OTS',
    name: 'Orthopaedic Trauma Society (OTS)',
    participation: 'blocked-for-tested-client',
    participationReason:
      'Returned HTTP 401 to the automated clients tested (orthopaedictrauma.org.uk, confirmed manually 2026-07-28). Observed with the clients we tested; not a proven property of the provider.',
    participationSetOn: '2026-07-28',
    surfaceCoverage: 'none',
    surfaces: [],
  },
];

/** Providers the sweep may fetch on this run. */
export function fetchableProviders(): ProviderRegistryEntry[] {
  return PROVIDER_REGISTRY.filter((p) => p.participation === 'active');
}

export function registryEntry(key: string): ProviderRegistryEntry | undefined {
  return PROVIDER_REGISTRY.find((p) => p.key === key);
}

/**
 * Registry self-check, so a malformed entry fails loudly rather than producing
 * a report with an undeclared gap or an unexplained exclusion.
 *
 * Returns problems rather than throwing, so a caller can decide whether a
 * registry problem should stop a read-only sweep.
 */
export function validateRegistry(
  registry: readonly ProviderRegistryEntry[] = PROVIDER_REGISTRY,
): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();

  for (const p of registry) {
    if (seen.has(p.key)) problems.push(`duplicate registry key: ${p.key}`);
    seen.add(p.key);

    if (p.participation !== 'active' && !p.participationReason) {
      problems.push(`${p.key}: participation is '${p.participation}' with no participationReason`);
    }
    if (p.surfaceCoverage === 'partial' && !(p.uncoveredSurfaces && p.uncoveredSurfaces.length)) {
      problems.push(`${p.key}: surfaceCoverage is 'partial' but no uncoveredSurfaces are named`);
    }
    if (p.surfaceCoverage === 'none' && p.surfaces.length > 0) {
      problems.push(`${p.key}: surfaceCoverage is 'none' but ${p.surfaces.length} surface(s) are listed`);
    }
    if (p.participation === 'active' && p.surfaces.length === 0) {
      problems.push(`${p.key}: participation is 'active' but no surfaces are listed`);
    }
  }

  return problems;
}
