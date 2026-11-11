/**
 * scripts/lib/scope-contract.ts — the ONE structured-scope contract (962fca4 review P2-2/P2-3).
 *
 * The database (supabase/proposals/20261107_editorial_governance_hardening.sql,
 * `_governance_scope_valid`) accepts exactly EVIDENCE_SCOPES and refuses anything
 * else with GV005. scripts/tests/scope-contract.test.ts cross-checks that list
 * against this module, and checks that every producer layer imports its subset
 * from here instead of declaring its own.
 *
 * MEANING, which is deliberately narrow:
 *   * 'document', or no scope at all, is a document-level observation.
 *   * 'surface' | 'index' | 'fallback' | 'navigation' is a PRODUCER-DECLARED
 *     role. It is recorded verbatim as provenance, but it never exempts a link
 *     from rejected-source comparison. Every input that could support such a
 *     claim (the scope, derivedFrom, surfaceUrl) is chosen by the same producer,
 *     so the claim cannot be substantiated inside the system. Whether any
 *     verified or editor-attributed role may ever exempt a link is the unsigned
 *     D3 policy decision. Until then the database fails closed (review required).
 *   * Labels are display text and are never classified.
 *
 * PRODUCER RESTRICTIONS (what each producer can actually observe):
 *   * discover → stage_discovery_candidate, urlAlternatives: 'document' | 'surface'.
 *     It sees its own surface fetch and document hrefs. 'surface' also needs the
 *     evidence row's recorded surface_url, so the database refuses 'surface'
 *     anywhere else.
 *   * sync-providers → stage_sync_candidates, versions: no scope today (strips
 *     to label/url/date). If one is added it must be a VERSION_SCOPE: never
 *     'surface', because sync records no surface_url.
 *   * Staged queue versions: VERSION_SCOPES only (the queue row records no surface_url).
 */
export const EVIDENCE_SCOPES = ['document', 'surface', 'index', 'fallback', 'navigation'] as const;
export type EvidenceScope = (typeof EVIDENCE_SCOPES)[number];

/** Scopes a staged or observed VERSION may carry: no surface (no recorded surface_url on that path). */
export const VERSION_SCOPES = ['document', 'index', 'fallback', 'navigation'] as const satisfies readonly EvidenceScope[];
export type VersionScope = (typeof VERSION_SCOPES)[number];

/** Scopes the discovery producer may put on a URL alternative: only what it can observe. */
export const DISCOVER_ALTERNATIVE_SCOPES = ['document', 'surface'] as const satisfies readonly EvidenceScope[];
export type DiscoverAlternativeScope = (typeof DISCOVER_ALTERNATIVE_SCOPES)[number];

export function isEvidenceScope(value: unknown): value is EvidenceScope {
  return typeof value === 'string' && (EVIDENCE_SCOPES as readonly string[]).includes(value);
}
export function isDiscoverAlternativeScope(value: unknown): value is DiscoverAlternativeScope {
  return typeof value === 'string' && (DISCOVER_ALTERNATIVE_SCOPES as readonly string[]).includes(value);
}

/**
 * Whether a declared scope can exempt a link from document comparison. Always
 * false: no producer claim is sufficient (see MEANING above). Exported so the
 * TypeScript side states the same rule the database enforces.
 */
export function scopeExemptsFromComparison(_scope: EvidenceScope | undefined): false {
  return false;
}
