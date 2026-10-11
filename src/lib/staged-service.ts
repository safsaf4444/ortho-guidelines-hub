import { supabase } from './supabase';
import { isNotAnEditorError, NOT_AN_EDITOR_MESSAGE } from './editor-session';
import { ALREADY_PROCESSED_CODE, markAlreadyProcessed } from './write-result';
import { toDbRow } from './guidelines-mapper';
import type { Guideline } from '../data/guidelines-data';
import type { ChangeReason, CandidateVersionLink, DisplayCandidate } from './candidates';

/**
 * Reads the `staged_guidelines` ingestion queue, and publishes from it.
 *
 * The queue is written ONLY by the sync GitHub Action using the service-role
 * key — the table has no INSERT/UPDATE/DELETE policy, so RLS denies all three
 * for anon and authenticated alike. Rows leave it exactly one way: the
 * `approve_staged_guideline` RPC. See
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql.
 */

/** One row of public.staged_guidelines. */
export interface DbStagedGuideline {
  id: string;                      // uuid — what the approve RPC takes
  candidate_id: string;            // the pipeline's deterministic id
  schema_version: number;
  pipeline: string | null;
  provider: string;
  provider_name: string | null;
  topic: string;
  source: string | null;
  summary: string | null;
  notes: string | null;
  versions: CandidateVersionLink[];
  primary_url: string | null;
  change_reason: ChangeReason;
  review_status: 'pending' | 'accepted' | 'rejected' | 'deferred';
  discovered_at: string | null;
  provider_ref: string | null;
  matched_guideline_id: string | null;
  resulting_guideline_id: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StagedLoad =
  | { ok: true; candidates: DisplayCandidate[] }
  /**
   * `reason` is load-bearing and the states are NOT interchangeable:
   *   'static'    — no live database in this build; the queue cannot be read.
   *   'signed-out'— readable only by editors. RLS returns an EMPTY LIST rather
   *                 than an error for an unauthenticated SELECT, so without
   *                 this distinction "sign in to see the queue" and "the queue
   *                 is empty" would render identically. That is the same
   *                 failure mode the dataState work fixed for the catalogue.
   *   'no-table'  — the migration has not been applied yet.
   *   'error'     — anything else, message passed through.
   */
  | { ok: false; reason: 'static' | 'signed-out' | 'no-table' | 'error'; message: string };

function toDisplayCandidate(row: DbStagedGuideline): DisplayCandidate {
  return {
    // The pipeline's id, kept as the display/React key so a row has the same
    // identity here as it does in candidates.json and the adapter logs.
    candidateId: row.candidate_id,
    // The uuid primary key — the only thing approve_staged_guideline() accepts.
    stagedId: row.id,
    topic: row.topic,
    provider: row.source ?? row.provider,
    providerName: row.provider_name ?? undefined,
    changeReason: row.change_reason,
    sourceUrl: row.primary_url ?? row.versions?.[0]?.url ?? '',
    discoveredAt: row.discovered_at ?? undefined,
    // Rows in this table are always the structured schema — the legacy
    // `newCandidates` shape only ever existed in candidates.json.
    fromLegacyFallback: false,
  };
}

/** PostgREST's code for "relation does not exist" (migration not applied). */
const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);

/**
 * Why a candidate is no longer pending, read back from the queue.
 *
 * Never infers. Each branch states only what the row actually says, and a
 * failed read-back says so rather than assuming the likelier outcome.
 */
async function describeProcessedState(stagedId: string): Promise<string> {
  if (!supabase) return 'Its current state could not be checked.';
  try {
    const { data, error } = await supabase
      .from('staged_guidelines')
      .select('review_status, resulting_guideline_id')
      .eq('id', stagedId)
      .maybeSingle();
    if (error || !data) {
      return 'Its current state could not be read back, so it is unknown whether it was published '
        + 'or rejected — check the review queue before acting.';
    }
    const row = data as { review_status: string; resulting_guideline_id: string | null };
    if (row.review_status === 'accepted') {
      return row.resulting_guideline_id
        ? `It was already accepted and published as "${row.resulting_guideline_id}".`
        : 'It was already accepted, but no resulting guideline id is recorded against it — check '
          + 'the catalogue.';
    }
    if (row.review_status === 'rejected') {
      return 'It was already REJECTED, so it was never published and nothing has been added to the '
        + 'catalogue.';
    }
    return `Its current status is "${row.review_status}".`;
  } catch {
    return 'Its current state could not be read back, so it is unknown whether it was published or '
      + 'rejected — check the review queue before acting.';
  }
}

export const stagedService = {
  /** Pending candidates, newest discovery first. */
  async listPending(): Promise<StagedLoad> {
    if (!supabase) {
      return {
        ok: false,
        reason: 'static',
        message: 'The review queue needs the live database — not available in offline/static mode.',
      };
    }

    // Checked BEFORE the query, not after: an unauthenticated read is not an
    // error, it is an empty result, so there is nothing in the response to
    // tell these two states apart.
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session) {
      return {
        ok: false,
        reason: 'signed-out',
        message: 'Sign in as an editor to see the review queue. Discovered candidates are unreviewed '
          + 'material and are not published, so they are not shown publicly.',
      };
    }

    const { data, error } = await supabase
      .from('staged_guidelines')
      .select('*')
      .eq('review_status', 'pending')
      .order('discovered_at', { ascending: false, nullsFirst: false });

    if (error) {
      if (MISSING_TABLE_CODES.has(error.code ?? '')) {
        return {
          ok: false,
          reason: 'no-table',
          message: 'The staged_guidelines table does not exist yet — the staging migration has not been applied.',
        };
      }
      console.warn('[staged-service] listPending query error:', error.message);
      return { ok: false, reason: 'error', message: error.message };
    }

    return { ok: true, candidates: (data as DbStagedGuideline[] | null)?.map(toDisplayCandidate) ?? [] };
  },

  /**
   * Publish a reviewed candidate: one atomic call.
   *
   * Replaces the old two-request path (insert guideline, then insert note),
   * which could leave a guideline published with no changelog entry if the
   * second request failed. The RPC does the staged-row update, the guideline
   * insert and the note insert in a single transaction — all three, or none.
   *
   * Returns the new guidelines.id. Throws with a readable message on refusal.
   */
  async approve(
    stagedId: string,
    guideline: Guideline,
    note: string,
  ): Promise<string> {
    if (!supabase) {
      throw new Error('Publishing needs the live database — not available in offline/static mode.');
    }
    const { data, error } = await supabase.rpc('approve_staged_guideline', {
      p_candidate_id: stagedId,
      // toDbRow emits exactly the snake_case column shape the RPC's
      // jsonb_populate_record expects, so the mapper stays the single place
      // that knows the DB column names.
      p_final_guideline_data: toDbRow(guideline),
      p_changelog_note: note,
    });

    if (error) {
      console.error('[staged-service] approve failed — raw error:', error);
      if (isNotAnEditorError(error)) throw new Error(NOT_AN_EDITOR_MESSAGE);
      // The RPC's already-processed guard. It takes the row lock BEFORE testing
      // review_status, so two concurrent approvals serialise and the second is
      // refused rather than publishing twice — and so is a retry after a
      // response went missing.
      //
      // 55000 means NOT PENDING. It does NOT mean published: a candidate an
      // editor rejected is equally not pending, and was never added to the
      // catalogue. Reporting "already published" for that case would be a
      // plain falsehood, so the row is read back to find out which it is, and
      // when the read-back fails nothing is guessed.
      if (error.code === ALREADY_PROCESSED_CODE) {
        throw markAlreadyProcessed(new Error(
          `This candidate is no longer pending, so it was NOT processed again. `
          + await describeProcessedState(stagedId),
        ));
      }
      // 23505 is a unique violation, which on this path means the chosen id is
      // already taken. The form checks that too, but it can only see the
      // archived-filtered list it was given, so an id free in the UI can still
      // belong to an archived row. Named explicitly because "duplicate key
      // value violates unique constraint guidelines_pkey" tells an editor
      // nothing about what to do next.
      if (error.code === '23505') {
        throw new Error(
          `That ID ("${guideline.id}") is already used by another entry — possibly an archived one, `
          + 'which the form cannot see. Nothing was published. Change the ID and try again.'
        );
      }
      throw new Error(`Publish failed${error.code ? ` (${error.code})` : ''}: ${error.message}`);
    }
    return data as string;
  },
};
