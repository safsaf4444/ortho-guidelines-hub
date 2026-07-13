/**
 * Bidirectional mapping between the Guideline TypeScript type (camelCase)
 * and the Supabase/Postgres DB row shape (snake_case).
 *
 * This file has no Vite or browser dependencies so it can be used from
 * both src/ and the scripts/ seed script.
 */
import type { Guideline, GuidelineVersion } from '../data/guidelines-data';

// ─── DB row type (matches supabase-schema.sql column names) ──────────────────

export interface DbGuideline {
  id: string;
  section: string;
  type: string;
  topic: string;
  sub_group: string | null;
  source: string;
  summary: string | null;
  notes: string | null;
  status: string;
  regional_variation: boolean;
  local_overlay_needed: boolean;
  last_checked: string | null;   // Postgres date → 'YYYY-MM-DD' string
  cross_listed_in: string[];     // JSONB array (never null due to NOT NULL default)
  priority: string | null;
  archived: boolean;             // NOT NULL default false
  source_access_status: string | null;
  link_verification_status: string;   // NOT NULL default 'unchecked'
  link_last_verified: string | null;  // Postgres date → 'YYYY-MM-DD' string
  link_verification_notes: string | null;
  versions: GuidelineVersion[];  // JSONB array
  created_at: string;
  updated_at: string;
}

// ─── DB row → Guideline ───────────────────────────────────────────────────────

export function toGuideline(row: DbGuideline): Guideline {
  return {
    id:                  row.id,
    section:             row.section,
    type:                row.type,
    topic:               row.topic,
    subGroup:            row.sub_group ?? undefined,
    source:              row.source,
    summary:             row.summary ?? '',
    notes:               row.notes ?? undefined,
    status:              row.status,
    regionalVariation:   row.regional_variation,
    localOverlayNeeded:  row.local_overlay_needed,
    lastChecked:         row.last_checked ?? '',
    crossListedIn:       row.cross_listed_in.length > 0 ? row.cross_listed_in : undefined,
    priority:            (row.priority as Guideline['priority']) ?? undefined,
    archived:            row.archived || undefined,
    sourceAccessStatus:  (row.source_access_status as Guideline['sourceAccessStatus']) ?? undefined,
    linkVerificationStatus: (row.link_verification_status as Guideline['linkVerificationStatus']) ?? 'unchecked',
    linkLastVerified:    row.link_last_verified ?? undefined,
    linkVerificationNotes: row.link_verification_notes ?? undefined,
    versions:            row.versions,
  };
}

// ─── Guideline → DB row ───────────────────────────────────────────────────────

export function toDbRow(g: Guideline): Omit<DbGuideline, 'created_at' | 'updated_at'> {
  return {
    id:                   g.id,
    section:              g.section,
    type:                 g.type,
    topic:                g.topic,
    sub_group:            g.subGroup ?? null,
    source:               g.source,
    summary:              g.summary,
    notes:                g.notes ?? null,
    status:               g.status,
    regional_variation:   g.regionalVariation,
    local_overlay_needed: g.localOverlayNeeded,
    last_checked:         g.lastChecked || null,
    cross_listed_in:      g.crossListedIn ?? [],
    priority:             g.priority ?? null,
    archived:             g.archived ?? false,
    source_access_status: g.sourceAccessStatus ?? null,
    link_verification_status: g.linkVerificationStatus ?? 'unchecked',
    link_last_verified:   g.linkLastVerified || null,
    link_verification_notes: g.linkVerificationNotes ?? null,
    versions:             g.versions,
  };
}
