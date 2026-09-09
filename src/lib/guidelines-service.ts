import { supabase } from './supabase';
import { GUIDELINES_DATA } from '../data/guidelines-data';
import type { Guideline } from '../data/guidelines-data';
import { toGuideline, toDbRow, type DbGuideline } from './guidelines-mapper';

export const guidelinesService = {
  /**
   * Fetch all guidelines.
   *
   * - Supabase configured and reachable → returns DB rows mapped to Guideline[]
   * - Supabase not configured OR query fails  → returns a copy of GUIDELINES_DATA
   */
  async getAll(): Promise<Guideline[]> {
    if (!supabase) {
      // Filtered the same way as the live query so archived entries stay
      // hidden in offline/static mode too.
      return GUIDELINES_DATA.filter(g => !g.archived);
    }
    try {
      const { data, error } = await supabase
        .from('guidelines')
        // Archived rows are soft-deleted: they still exist in the table but
        // must never reach the app. Excluding them HERE, in the single query
        // every view is built from, keeps them out of the list, search,
        // grouping, the catalogue and duplicate detection alike — there is
        // no second read path to keep in sync.
        .select('*')
        .eq('archived', false)
        .order('section')
        .order('topic');

      if (error) {
        console.warn('[guidelines-service] query error — falling back to static data:', error.message);
        return GUIDELINES_DATA.filter(g => !g.archived);
      }
      if (!data || data.length === 0) {
        console.info('[guidelines-service] table is empty — falling back to static data (run npm run seed)');
        return GUIDELINES_DATA.filter(g => !g.archived);
      }
      return (data as DbGuideline[]).map(toGuideline);
    } catch (err) {
      console.warn('[guidelines-service] Supabase unreachable — falling back to static data:', err);
      return GUIDELINES_DATA.filter(g => !g.archived);
    }
  },

  /** Persist a new guideline to Supabase. Throws if Supabase is unconfigured or write fails. */
  async create(guideline: Guideline): Promise<void> {
    if (!supabase) throw new Error('Supabase client is not initialized. Check your connection / environment variables.');
    const { error } = await supabase.from('guidelines').insert(toDbRow(guideline));
    if (error) throw asPersistError('create', error);
  },

  /** Update an existing guideline in Supabase. Throws if Supabase is unconfigured or write fails. */
  async update(guideline: Guideline): Promise<void> {
    if (!supabase) throw new Error('Supabase client is not initialized. Check your connection / environment variables.');
    const { error } = await supabase
      .from('guidelines')
      .update(toDbRow(guideline))
      .eq('id', guideline.id);
    if (error) throw asPersistError('update', error);
  },

  /**
   * Soft-delete a guideline: mark it archived rather than removing the row.
   *
   * There is no hard-delete path any more, and there cannot be one from the
   * browser: the anon role has no DELETE policy on `guidelines` (see
   * supabase-migration-soft-delete-and-mandatory-notes.sql), so a DELETE would
   * silently affect zero rows. Since anyone can edit this site without signing
   * in, that is deliberate — vandalism becomes a one-line UPDATE to undo
   * rather than a restore from backup:
   *     update public.guidelines set archived = false where id = '<id>';
   *
   * Writes only the `archived` flag, not the whole row, so archiving can never
   * accidentally clobber a concurrent edit to another field.
   */
  async archive(id: string): Promise<void> {
    if (!supabase) throw new Error('Supabase client is not initialized. Check your connection / environment variables.');
    const { error } = await supabase.from('guidelines').update({ archived: true }).eq('id', id);
    if (error) throw asPersistError('archive', error);
  },
};

// Supabase/PostgREST errors carry the useful detail (code/details/hint) on the
// error object itself, not just `.message`. Log the raw object so it's visible
// in the console even when a caller only surfaces `err.message`, and fold the
// code into the thrown message so it reaches UI-level alerts too.
function asPersistError(op: string, error: { message: string; code?: string; details?: string | null; hint?: string | null }): Error {
  console.error(`[guidelines-service] ${op} failed — raw Supabase error:`, error);
  const code = error.code ? ` (${error.code})` : '';
  return new Error(`${op} failed${code}: ${error.message}`);
}
