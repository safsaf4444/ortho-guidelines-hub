/**
 * scripts/lib/provider-adapter.ts
 * ───────────────────────────────
 * The provider-discovery contract: what a provider adapter IS, and what it is
 * allowed to hand back.
 *
 * TYPES ONLY. The module erases completely at runtime — importing it cannot open
 * a socket, read a file, or touch a database. Adapters themselves do perform
 * network reads; this module only describes their shape.
 *
 * ─── WHY THIS IS SEPARATE FROM lib/ingestion.ts ─────────────────────────────
 *
 * `lib/ingestion.ts` is the contract shared by ALL THREE checkers
 * (sync-providers, detect-changes, flag-dead-links) — it describes a candidate
 * awaiting human review, which any of them can produce.
 *
 * Adapters exist only in the discovery pipeline. detect-changes and
 * flag-dead-links work from URLs already in the catalogue and have no notion of
 * a provider index to scrape. Keeping the two contracts in separate files stops
 * the shared one from accumulating concerns that only one pipeline has.
 *
 * ─── RELATIONSHIP TO THE FRONTEND MODEL ─────────────────────────────────────
 *
 * A `DiscoveredItem` is NOT a `Guideline` (src/data/guidelines-data.ts) and must
 * never be treated as one. A Guideline is a published catalogue row carrying
 * editorial state — `section`, `type`, `status`, `priority`, `archived`,
 * `linkVerificationStatus` and the rest — none of which a scraper can know or
 * invent. A DiscoveredItem is the raw observation: a title, a link, and nothing
 * asserted beyond what the provider's own page said.
 *
 * The gap between the two is editorial judgement, and it is crossed by a human,
 * not by this pipeline. That is why the old name `DiscoveredGuideline` was
 * retired: it invited exactly the conflation this note exists to prevent.
 */

/**
 * How a provider is named.
 *
 * Both fields end up in the emitted candidate — `sourceTag` as `provider`,
 * `name` as `providerName` — so they are identity, not decoration.
 */
export interface ProviderIdentity {
  /** Human-readable, e.g. 'British Orthopaedic Association (BOASt)'. */
  name: string;
  /** Short tag matching the catalogue's `source` convention, e.g. 'BOA'. */
  sourceTag: string;
}

/** One link on a discovered item. Mirrors the catalogue's versions[] shape. */
export interface DiscoveredVersionLink {
  label: string;
  url: string;
  date?: string;
}

/**
 * A single item observed on a provider's index or feed.
 *
 * Every field is VERBATIM from the provider. Whitespace collapsing and a
 * fixed-length truncation are the only permitted transforms, and both are
 * deterministic — no paraphrasing, no summarising, no inferred metadata.
 */
export interface DiscoveredItem {
  /** Title exactly as the provider published it. */
  topic: string;

  /**
   * Provider tag as the adapter recorded it.
   *
   * ADVISORY ONLY. The pipeline keys candidates off the adapter's own
   * `sourceTag`, never off this field, so the two cannot disagree in the
   * output. Retained because it is part of the shape adapters have always
   * returned and appears in the legacy staging artifact.
   */
  source: string;

  /** Provider-supplied blurb, verbatim. Absent when the provider offered none. */
  summary?: string;

  /**
   * Links for this item. `versions[0]` is the primary link and is what the
   * pipeline matches and keys on, so an adapter must return at least one.
   */
  versions: DiscoveredVersionLink[];
}

/**
 * @deprecated Renamed to {@link DiscoveredItem}. The old name read as though it
 * were the frontend `Guideline` model; it is a raw observation awaiting review.
 * Kept as an alias so existing imports keep working.
 */
export type DiscoveredGuideline = DiscoveredItem;

/**
 * A provider adapter: an identity plus a way to discover items for it.
 *
 * Adapters are READ-ONLY by contract. `fetchCandidates` may perform network
 * reads, and nothing else — no writes to disk, the database, or GitHub, and no
 * mutation of anything it is handed. Everything downstream assumes a sweep can
 * be re-run at any time with no consequence beyond load on the provider.
 *
 * Throwing is a legitimate outcome. `runDryRun` records the failure against the
 * adapter rather than dropping it, so a failed sweep stays distinguishable from
 * a sweep that genuinely found nothing.
 */
export interface ProviderAdapter extends ProviderIdentity {
  fetchCandidates(): Promise<DiscoveredItem[]>;
}
