import { supabase } from './supabase';
import {
  type ChangelogEntry,
  type ChangelogLoad,
  STATIC_MODE_MESSAGE,
  NO_TABLE_MESSAGE,
  isMissingTableError,
} from './changelog-load';

/**
 * Append-only edit history for guidelines (Feature 2).
 *
 * Deliberately minimal: free-text note + timestamp, one row per note. No edit,
 * no delete, no diff/rollback — that scope was explicitly cut.
 *
 * Connectivity posture:
 *   - reads return a discriminated ChangelogLoad so the UI can tell "nothing
 *     here yet" apart from "not provisioned" and from "the query failed". They
 *     previously all collapsed to [], which showed real errors as an empty
 *     state;
 *   - writes throw a clear error when Supabase isn't configured, so a failed
 *     "+ Add note" surfaces instead of silently no-op-ing.
 */

type DbChangelogRow = {
  id: string;
  guideline_id: string;
  description: string;
  created_at: string;
};

function toEntry(row: DbChangelogRow): ChangelogEntry {
  return {
    id: row.id,
    guidelineId: row.guideline_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

// The load-state types and the missing-table classifier live in a
// browser-dependency-free module so offline tests can import them without
// pulling in the Supabase client. Re-exported here so existing importers of
// this module are unaffected.
export type { ChangelogEntry, ChangelogLoad } from './changelog-load';
export { isMissingTableError } from './changelog-load';

export const changelogService = {
  /** All changelog entries across every guideline, newest first. */
  async listAll(): Promise<ChangelogLoad> {
    if (!supabase) return { ok: false, reason: 'unavailable', message: STATIC_MODE_MESSAGE };
    const { data, error } = await supabase
      .from('guideline_changelog')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error.code, error.message)) {
        return { ok: false, reason: 'unavailable', message: NO_TABLE_MESSAGE };
      }
      console.warn('[changelog-service] listAll query error:', error.message);
      return { ok: false, reason: 'error', message: error.message };
    }
    return { ok: true, entries: (data as DbChangelogRow[] | null)?.map(toEntry) ?? [] };
  },

  /** Entries for one guideline, newest first. */
  async listForGuideline(guidelineId: string): Promise<ChangelogLoad> {
    if (!supabase) return { ok: false, reason: 'unavailable', message: STATIC_MODE_MESSAGE };
    const { data, error } = await supabase
      .from('guideline_changelog')
      .select('*')
      .eq('guideline_id', guidelineId)
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTableError(error.code, error.message)) {
        return { ok: false, reason: 'unavailable', message: NO_TABLE_MESSAGE };
      }
      console.warn('[changelog-service] listForGuideline query error:', error.message);
      return { ok: false, reason: 'error', message: error.message };
    }
    return { ok: true, entries: (data as DbChangelogRow[] | null)?.map(toEntry) ?? [] };
  },

  /** Append a note. Throws if Supabase is unconfigured or the insert fails. */
  async create({ guidelineId, description }: { guidelineId: string; description: string }): Promise<ChangelogEntry> {
    if (!supabase) {
      throw new Error('Changelog requires the live database — not available in static/offline mode.');
    }
    const trimmed = description.trim();
    if (!trimmed) throw new Error('Note text is empty.');
    const { data, error } = await supabase
      .from('guideline_changelog')
      .insert({ guideline_id: guidelineId, description: trimmed })
      .select('*')
      .single();
    if (error) {
      console.error('[changelog-service] create failed — raw error:', error);
      throw new Error(`Add note failed${error.code ? ` (${error.code})` : ''}: ${error.message}`);
    }
    return toEntry(data as DbChangelogRow);
  },
};
