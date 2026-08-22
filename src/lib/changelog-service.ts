import { supabase } from './supabase';

/**
 * Append-only edit history for guidelines (Feature 2).
 *
 * Deliberately minimal: free-text note + timestamp, one row per note. No edit,
 * no delete, no diff/rollback — that scope was explicitly cut.
 *
 * Mirrors guidelinesService's posture on connectivity:
 *   - reads return [] when Supabase isn't configured (e.g. the public static
 *     build), so the UI degrades quietly rather than throwing;
 *   - writes throw a clear error when Supabase isn't configured, so a failed
 *     "+ Add note" surfaces instead of silently no-op-ing.
 */

export type ChangelogEntry = {
  id: string;
  guidelineId: string;
  description: string;
  createdAt: string; // ISO timestamp
};

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

export const changelogService = {
  /** All changelog entries across every guideline, newest first. [] in static mode. */
  async listAll(): Promise<ChangelogEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('guideline_changelog')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[changelog-service] listAll query error:', error.message);
      return [];
    }
    return (data as DbChangelogRow[] | null)?.map(toEntry) ?? [];
  },

  /** Entries for one guideline, newest first. [] in static mode. */
  async listForGuideline(guidelineId: string): Promise<ChangelogEntry[]> {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('guideline_changelog')
      .select('*')
      .eq('guideline_id', guidelineId)
      .order('created_at', { ascending: false });
    if (error) {
      console.warn('[changelog-service] listForGuideline query error:', error.message);
      return [];
    }
    return (data as DbChangelogRow[] | null)?.map(toEntry) ?? [];
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
