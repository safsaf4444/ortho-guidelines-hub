import { supabase } from './supabase';
import { isNotAnEditorError, NOT_AN_EDITOR_MESSAGE } from './editor-session';
import {
  ALREADY_PROCESSED_CODE,
  classifyWriteFailure,
  markAlreadyProcessed,
  markRefused,
} from './write-result';
import {
  HISTORY_UNAVAILABLE_MESSAGE,
  isMissingSchemaObject,
  markFeatureUnavailable,
  QUEUE_UPGRADE_COLUMNS,
  QUEUE_UPGRADE_UNAVAILABLE_MESSAGE,
  REJECT_OPEN_UNAVAILABLE_MESSAGE,
  RESOLVE_UNAVAILABLE_MESSAGE,
} from './schema-compat';
import type { ResolveAction } from './review-actions';
import { toDbRow } from './guidelines-mapper';
import type { Guideline } from '../data/guidelines-data';
import type { ChangeReason, CandidateVersionLink, DisplayCandidate, ReviewStatus } from './candidates';

/**
 * Reads the `staged_guidelines` review queue, and records decisions on it.
 *
 * The queue is written by the staging functions (service role) — the table
 * has no INSERT/UPDATE/DELETE policy, so RLS denies all three for anon and
 * authenticated alike. Editors change a row only through SECURITY DEFINER
 * functions: approve_staged_guideline (publish a NEW_GUIDELINE row),
 * reject_staged_candidate (reject an open row) and resolve_discovery_candidate
 * (record a comparison/edition decision). See
 * supabase/migrations/20261011_create_staging_and_editor_roles.sql,
 * 20261024_discovery_review_queue.sql and 20261025_reject_open_candidate.sql.
 */

/** One row of public.staged_guidelines (with the 20261024 columns). */
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
  /** document_match_key(primary_url): the key editorial holds are matched on. */
  match_key: string | null;
  change_reason: ChangeReason;
  review_status: ReviewStatus;
  review_outcome: string | null;
  producer: string | null;
  changed_url: string | null;
  discovered_at: string | null;
  provider_ref: string | null;
  matched_guideline_id: string | null;
  resulting_guideline_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export type StagedLoad =
  | { ok: true; candidates: DisplayCandidate[] }
  /**
   * `reason` is load-bearing and the states are NOT interchangeable:
   *   'static'      — no live database in this build; the queue cannot be read.
   *   'signed-out'  — readable only by editors. RLS returns an EMPTY LIST rather
   *                   than an error for an unauthenticated SELECT, so without
   *                   this distinction "sign in to see the queue" and "the queue
   *                   is empty" would render identically. That is the same
   *                   failure mode the dataState work fixed for the catalogue.
   *   'no-table'    — the migration has not been applied yet.
   *   'unavailable' — the table exists but the review-queue upgrade (20261024)
   *                   does not: the queue is NOT shown, rather than shown
   *                   without the fields that decide what may be done with it.
   *   'error'       — anything else, message passed through.
   */
  | { ok: false; reason: 'static' | 'signed-out' | 'no-table' | 'unavailable' | 'error'; message: string };

/** The columns the queue view reads. Explicit, so a missing upgrade column is an error, not a silent undefined. */
const QUEUE_COLUMNS = [
  'id', 'candidate_id', 'provider', 'provider_name', 'topic', 'source', 'notes', 'versions',
  'primary_url', 'change_reason', 'review_status', 'review_outcome', 'producer', 'changed_url',
  'identity_key', 'match_key', 'discovered_at', 'matched_guideline_id',
].join(', ');

type Hold = { status: string; reason: string };

function toDisplayCandidate(row: DbStagedGuideline, hold: Hold | null): DisplayCandidate {
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
    // primary_url is the href exactly as discovered (pre-migration rows hold a
    // lowercased key instead — flagged via producer === null).
    sourceUrl: row.primary_url ?? row.versions?.[0]?.url ?? '',
    discoveredAt: row.discovered_at ?? undefined,
    // Rows in this table are always the structured schema — the legacy
    // `newCandidates` shape only ever existed in candidates.json.
    fromLegacyFallback: false,
    reviewStatus: row.review_status,
    reviewOutcome: row.review_outcome,
    matchedGuidelineId: row.matched_guideline_id,
    notes: row.notes,
    producer: row.producer,
    hold,
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
      // Deliberately says nothing about publication. A rejected queue row
      // records a decision about THIS candidate; it is not evidence that
      // equivalent guidance is absent from the catalogue, which may hold the
      // same document filed under another candidate or added by hand.
      return 'This candidate is already rejected. This attempt made no changes.';
    }
    if (row.review_status === 'resolved') {
      // A resolution is a recorded decision, NOT a publication.
      return 'It was already resolved: a decision was recorded and nothing was published. This attempt made no changes.';
    }
    return `Its current status is "${row.review_status}".`;
  } catch {
    return 'Its current state could not be read back, so it is unknown whether it was published or '
      + 'rejected — check the review queue before acting.';
  }
}

/** Options for reject(). */
export interface RejectOptions {
  /**
   * The row is deferred or carries an open follow-up, so the call MUST use the
   * 20261025 signature. Without that migration it is reported as unavailable,
   * never misreported as "already processed".
   */
  needsOpenRowSupport?: boolean;
  /** The editor explicitly confirmed closing an open follow-up. */
  confirmOpenFollowUp?: boolean;
}

/** SQLSTATE from reject_staged_candidate(): an open follow-up needs explicit confirmation. */
export const FOLLOW_UP_CONFIRMATION_CODE = 'RQ001';

export function needsFollowUpConfirmation(err: unknown): boolean {
  return Boolean(err && typeof err === 'object'
    && (err as { followUpConfirmationRequired?: unknown }).followUpConfirmationRequired === true);
}

export interface ResolveResult {
  reviewStatus: ReviewStatus;
  reviewOutcome: string | null;
  open: boolean;
}

export interface EvidenceRow {
  id: string;
  discovery_run_id: string;
  producer: string;
  discovery_id: string;
  discovered_url: string;
  surface_url: string | null;
  observed_topic: string | null;
  soft_match: Record<string, unknown> | null;
  token_change: Record<string, unknown> | null;
  stated_labels: unknown[];
  row_match_basis: 'identity' | 'legacy-match-key';
  /** Discovery only: how the link relates to the named entry's links (NULL for sync). */
  catalogue_relation?: 'exact' | 'loose' | 'alternative' | 'none' | null;
  observed_at: string;
  recorded_at: string;
}

export interface DecisionRow {
  id: string;
  action: string;
  from_status: string;
  to_status: string;
  from_outcome?: string | null;
  note: string;
  decided_by: string;
  decided_at: string;
}

export type HistoryLoad =
  | { ok: true; evidence: EvidenceRow[]; decisions: DecisionRow[] }
  | { ok: false; reason: 'unavailable' | 'error'; message: string };

export const stagedService = {
  /** Open candidates (pending and deferred), newest discovery first. */
  async listOpen(): Promise<StagedLoad> {
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
      .select(QUEUE_COLUMNS)
      .in('review_status', ['pending', 'deferred'])
      .order('discovered_at', { ascending: false, nullsFirst: false });

    if (error) {
      if (MISSING_TABLE_CODES.has(error.code ?? '') && /staged_guidelines/.test(error.message ?? '')) {
        return {
          ok: false,
          reason: 'no-table',
          message: 'The staged_guidelines table does not exist yet — the staging migration has not been applied.',
        };
      }
      if (isMissingSchemaObject(error, 'column', QUEUE_UPGRADE_COLUMNS)) {
        return { ok: false, reason: 'unavailable', message: QUEUE_UPGRADE_UNAVAILABLE_MESSAGE };
      }
      console.warn('[staged-service] listOpen query error:', error.message);
      return { ok: false, reason: 'error', message: error.message };
    }

    // The editorial hold list, so a held row can say so before anyone tries to
    // publish it. Same migration as the columns above, so a failure here is a
    // real error, reported as one rather than shown as "not held".
    const holds = await supabase.from('discovery_staging_holds').select('match_key, status, reason');
    if (holds.error) {
      console.warn('[staged-service] hold list query error:', holds.error.message);
      return {
        ok: false,
        reason: 'error',
        message: `The editorial hold list could not be read, so held items cannot be marked: ${holds.error.message}`,
      };
    }
    const holdByKey = new Map<string, Hold>(
      ((holds.data ?? []) as Array<{ match_key: string } & Hold>).map(h => [h.match_key, { status: h.status, reason: h.reason }]),
    );

    return {
      ok: true,
      candidates: (data as unknown as DbStagedGuideline[] | null)
        ?.map(row => toDisplayCandidate(row, (row.match_key && holdByKey.get(row.match_key)) || null)) ?? [],
    };
  },

  /**
   * Evidence (every sighting) and decision history for one row, on demand.
   * Editors can read both tables (RLS); nothing here writes.
   */
  async loadHistory(stagedId: string): Promise<HistoryLoad> {
    if (!supabase) return { ok: false, reason: 'error', message: 'Needs the live database.' };
    const [ev, dec] = await Promise.all([
      supabase.from('staged_discovery_evidence').select('*').eq('staged_id', stagedId)
        .order('observed_at', { ascending: false }),
      supabase.from('staged_discovery_decisions').select('*').eq('staged_id', stagedId)
        .order('decided_at', { ascending: true }),
    ]);
    for (const res of [ev, dec]) {
      if (res.error) {
        if (isMissingSchemaObject(res.error, 'table', ['staged_discovery_evidence', 'staged_discovery_decisions'])) {
          return { ok: false, reason: 'unavailable', message: HISTORY_UNAVAILABLE_MESSAGE };
        }
        return { ok: false, reason: 'error', message: res.error.message };
      }
    }
    return { ok: true, evidence: (ev.data ?? []) as EvidenceRow[], decisions: (dec.data ?? []) as DecisionRow[] };
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
      // RQ002: the document, or a link the form would publish, is on the
      // editorial hold list. Nothing was written.
      if (error.code === 'RQ002') {
        throw markRefused(new Error(
          `Not published: ${error.message}. Nothing was changed.`,
        ));
      }
      // 42809: the database refused to publish a comparison/edition row as a
      // new entry (or a NEW row matching an existing entry). Nothing was written.
      if (error.code === '42809') {
        throw markRefused(new Error(
          `Not published: ${error.message}. This item cannot be published as a new entry. Nothing was changed.`,
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

  /**
   * Record a persistent, attributable rejection of an OPEN (pending or
   * deferred) candidate.
   *
   * Mirrors `approve` deliberately: same allowlist, same already-processed
   * handling, same refusal-versus-unknown distinction. The difference is what
   * it does NOT do — it writes nothing to `guidelines` or
   * `guideline_changelog`, because a rejection publishes nothing.
   *
   * Returns the pipeline's candidate_id. Throws with a readable message on
   * refusal; the caller keeps the editor's reason either way.
   */
  async reject(stagedId: string, reason: string, options: RejectOptions = {}): Promise<string> {
    if (!supabase) {
      throw new Error('Rejecting needs the live database — not available in offline/static mode.');
    }
    // An ordinary pending row uses the two-argument call, which works on a
    // database with or without 20261025. A deferred row or an open follow-up
    // needs the three-argument call — so a database without 20261025 answers
    // "function not found" (unavailable) instead of a misleading 55000.
    const args: Record<string, unknown> = { p_candidate_id: stagedId, p_reason: reason };
    if (options.needsOpenRowSupport || options.confirmOpenFollowUp) {
      args.p_confirm_open_follow_up = options.confirmOpenFollowUp === true;
    }
    const { data, error } = await supabase.rpc('reject_staged_candidate', args);

    if (error) {
      console.error('[staged-service] reject failed — raw error:', error);
      // Every branch below re-wraps the raw error for readability, which DROPS
      // `error.code` — and the code is the only evidence that the server
      // answered at all. classifyWriteFailure() would then read the clean
      // Error as 'unconfirmed' and the dashboard would tell the editor "could
      // not be confirmed" about a decision the database had plainly made. So
      // the raw error is classified first and the refusal carried across, the
      // same way asPersistError() does it in guidelines-service.ts.
      const keepRefusal = (thrown: Error): Error =>
        classifyWriteFailure(error) === 'refused' ? markRefused(thrown) : thrown;

      if (isMissingSchemaObject(error, 'function', ['reject_staged_candidate'])) {
        throw markFeatureUnavailable(new Error(REJECT_OPEN_UNAVAILABLE_MESSAGE));
      }
      if (isNotAnEditorError(error)) throw keepRefusal(new Error(NOT_AN_EDITOR_MESSAGE));
      if (error.code === ALREADY_PROCESSED_CODE) {
        // markAlreadyProcessed already implies refused.
        throw markAlreadyProcessed(new Error(
          `This candidate is no longer open (pending or deferred), so it was NOT rejected. `
          + await describeProcessedState(stagedId),
        ));
      }
      if (error.code === FOLLOW_UP_CONFIRMATION_CODE) {
        const e = keepRefusal(new Error(
          'This item has an open follow-up. Rejecting it closes that follow-up, so it needs your explicit '
          + 'confirmation. Nothing was changed.',
        ));
        (e as Error & { followUpConfirmationRequired?: boolean }).followUpConfirmationRequired = true;
        throw e;
      }
      // 23514 is the reason-required check. Named because the generic
      // PostgREST text would send the editor looking for a database fault.
      if (error.code === '23514') {
        throw keepRefusal(new Error('A reason is required to reject a candidate. Nothing was changed.'));
      }
      // P0002 (no such candidate) lands here, as does any other answered
      // failure. All are refusals: nothing was written.
      throw keepRefusal(
        new Error(`Reject failed${error.code ? ` (${error.code})` : ''}: ${error.message}`),
      );
    }
    return data as string;
  },

  /**
   * Record an editor decision on a comparison/edition row. Never publishes and
   * never changes the catalogue; open actions leave the row in the queue.
   */
  async resolve(stagedId: string, action: ResolveAction, note: string): Promise<ResolveResult> {
    if (!supabase) {
      throw new Error('Recording a decision needs the live database — not available in offline/static mode.');
    }
    const { data, error } = await supabase.rpc('resolve_discovery_candidate', {
      p_staged_id: stagedId,
      p_action: action,
      p_note: note,
    });
    if (error) {
      console.error('[staged-service] resolve failed — raw error:', error);
      const keepRefusal = (thrown: Error): Error =>
        classifyWriteFailure(error) === 'refused' ? markRefused(thrown) : thrown;
      if (isMissingSchemaObject(error, 'function', ['resolve_discovery_candidate'])) {
        throw markFeatureUnavailable(new Error(RESOLVE_UNAVAILABLE_MESSAGE));
      }
      if (isNotAnEditorError(error)) throw keepRefusal(new Error(NOT_AN_EDITOR_MESSAGE));
      if (error.code === ALREADY_PROCESSED_CODE) {
        throw markAlreadyProcessed(new Error(
          'This item is no longer open, so the decision was NOT recorded. ' + await describeProcessedState(stagedId),
        ));
      }
      if (error.code === '23514') {
        throw keepRefusal(new Error('A note is required to record a decision. Nothing was changed.'));
      }
      if (error.code === '22023' || error.code === '42809') {
        throw keepRefusal(new Error(`That decision is not valid for this item: ${error.message}. Nothing was changed.`));
      }
      throw keepRefusal(new Error(`Recording the decision failed${error.code ? ` (${error.code})` : ''}: ${error.message}`));
    }
    const r = data as { reviewStatus: ReviewStatus; reviewOutcome: string | null; open: boolean };
    return { reviewStatus: r.reviewStatus, reviewOutcome: r.reviewOutcome, open: r.open };
  },
};
