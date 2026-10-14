/**
 * scripts/adapters/types.ts
 * ──────────────────────────
 * What a discovery adapter's PARSER hands back.
 *
 * TYPES ONLY — erases at runtime.
 *
 * Deliberately separate from `ProviderAdapter` in scripts/lib/provider-adapter.ts.
 * That contract pairs an identity with a `fetchCandidates()` that performs its
 * own network read, which makes a parser untestable without either a live
 * request or a mock. Here the parse is a PURE FUNCTION of (html, surfaceUrl),
 * and fetching lives in scripts/lib/discovery-cache.ts. Every adapter in this
 * batch is therefore fully testable against fixture HTML with no network.
 */
import type { StatedLabel } from '../lib/discovery-classification';

/** One item an adapter read off a surface. Every field verbatim. */
export interface DiscoveredRecord {
  /**
   * The document's title AS THE PROVIDER PRESENTS IT TO A READER.
   *
   * Not necessarily the anchor text: BESS renders the filename as link text
   * ("Atraumatic-Shoulder-Instability") and puts the real title in the
   * accordion heading ("Atraumatic Shoulder Instability"). Taking the anchor
   * text there would feed filenames into title matching.
   */
  topic: string;

  /**
   * The href the provider published, resolved against the surface URL and
   * otherwise untouched. Never normalised, never host-substituted.
   */
  discoveredUrl: string;

  /**
   * Date, edition and version strings the provider stated, verbatim, each with
   * where it was read from. Never parsed into a date.
   */
  statedLabels: StatedLabel[];

  /** Section heading the item sat under, verbatim, when the surface has them. */
  sectionHeading?: string;
}

/**
 * The result of parsing one surface.
 *
 * `excluded` exists so that filtering is VISIBLE rather than silent. Every
 * parser here drops things — duplicate download buttons, share widgets,
 * navigation — and a count that is only ever implied is how an undercount
 * hides. The runner reports these, and the coverage arithmetic has to balance
 * against them.
 */
export interface SurfaceParse {
  items: DiscoveredRecord[];
  excluded: Array<{ url: string; reason: string }>;
}
