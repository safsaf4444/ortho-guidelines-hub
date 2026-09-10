import { supabase } from './supabase';
import { GUIDELINES_DATA } from '../data/guidelines-data';
import type { Guideline } from '../data/guidelines-data';
import { toGuideline, toDbRow, type DbGuideline } from './guidelines-mapper';

/** Where the rows the app is showing actually came from. */
export type GuidelinesSource = 'live' | 'fallback';

export interface GuidelinesLoad {
  rows: Guideline[];
  source: GuidelinesSource;
  /** Why the fallback was used. Undefined when source is 'live'. */
  reason?: string;
}

/** Archived rows are soft-deleted: present in the table, never shown. */
const visible = () => GUIDELINES_DATA.filter(g => !g.archived);

/**
 * How long to wait for the initial fetch before showing the snapshot instead.
 *
 * Without this the app can wait forever. A blocked or black-holed request —
 * hospital wifi that accepts the connection and then drops it, a captive
 * portal, a firewall that discards packets rather than refusing them — never
 * rejects, so the promise never settles and the UI holds on its loading
 * skeleton indefinitely. Verified: blocking the Supabase host in the browser
 * left the page loading permanently until this was added.
 *
 * A stale snapshot with an honest banner beats a spinner that never resolves.
 */
const FETCH_TIMEOUT_MS = 8000;

function withTimeout<T>(work: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    work.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export const guidelinesService = {
  /**
   * Fetch all guidelines, and say where they came from.
   *
   * Returning the source alongside the rows is deliberate. Previously this
   * returned a bare array, so "231 rows from the live database" and "231 rows
   * from the compiled-in snapshot because the database was unreachable" were
   * indistinguishable to the caller — and the UI showed the same thing for
   * both. A clinician could be reading a month-old snapshot with no way to
   * tell. The caller now knows, and can say so.
   */
  async getAll(): Promise<GuidelinesLoad> {
    if (!supabase) {
      return { rows: visible(), source: 'fallback', reason: 'No database is configured for this build.' };
    }
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('guidelines')
          // Excluding archived rows HERE, in the single query every view is built
          // from, keeps them out of the list, search, grouping, the catalogue and
          // duplicate detection alike — there is no second read path to keep in sync.
          .select('*')
          .eq('archived', false)
          .order('section')
          .order('topic'),
        FETCH_TIMEOUT_MS,
      );

      if (error) {
        console.warn('[guidelines-service] query error — falling back to static data:', error.message);
        return { rows: visible(), source: 'fallback', reason: `The database returned an error: ${error.message}` };
      }
      if (!data || data.length === 0) {
        console.info('[guidelines-service] table is empty — falling back to static data (run npm run seed)');
        return { rows: visible(), source: 'fallback', reason: 'The database returned no rows.' };
      }
      return { rows: (data as DbGuideline[]).map(toGuideline), source: 'live' };
    } catch (err) {
      console.warn('[guidelines-service] Supabase unreachable — falling back to static data:', err);
      const msg = err instanceof Error ? err.message : String(err);
      return { rows: visible(), source: 'fallback', reason: `The database could not be reached: ${msg}` };
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
