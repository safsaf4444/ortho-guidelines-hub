/**
 * scripts/lib/staging-ownership.ts
 * ────────────────────────────────
 * Which producer may STAGE each provider's findings into the review queue.
 *
 * DATA AND PURE FUNCTIONS ONLY. Importing this cannot open a socket.
 *
 * One provider, one staging producer. Two pipelines can see the same
 * publisher — today both sync-providers and discovery read BOFAS — and if both
 * staged it, every BOFAS document would be filed under two candidate ids. The
 * database's one-open-row-per-document rule stops a duplicate OPEN row, but not
 * the second producer re-filing a document after an editor closed the first
 * one (rejections are remembered per candidate id; see
 * supabase/DISCOVERY-QUEUE-CONTRACT.md §7). So exactly one producer stages each
 * provider, and both staging scripts consult THIS table:
 *
 *   scripts/stage-candidates.ts  (producer 'sync-providers')
 *   scripts/stage-discovery.ts   (producer 'discover')
 *
 * A candidate whose provider belongs to the OTHER producer is not submitted,
 * and is reported as `not-owner` with the owner named. A candidate whose
 * provider is in NO row here is not submitted either, and is reported as
 * `unowned`: adding a provider is a decision, so it fails the run loudly
 * rather than letting either pipeline start staging it by default.
 *
 * Enforced by the scripts, not the database: the staging functions are
 * service-role only and these two scripts are their only callers. A direct
 * service-role call bypasses this table.
 */

export type StagingProducer = 'sync-providers' | 'discover';

export interface Ownership {
  producer: StagingProducer;
  /** Why this producer, for a reader of the run log. */
  reason: string;
  /**
   * A change of owner that has been proposed but NOT approved. It changes
   * nothing: the current `producer` keeps staging. Its only effect is that the
   * proposed producer's DRY RUN may show what it would file (a comparison).
   */
  pendingTransition?: { to: StagingProducer; status: 'awaiting-approval'; note: string };
}

/** Keys are the `provider` value each pipeline writes on its candidates. */
export const STAGING_OWNERSHIP: Readonly<Record<string, Ownership>> = {
  BOA: { producer: 'sync-providers', reason: 'sync-providers BOAAdapter' },
  BSG: { producer: 'sync-providers', reason: 'sync-providers BSGAdapter' },
  BSSH: { producer: 'sync-providers', reason: 'sync-providers BSSHAdapter' },
  BOFAS: {
    producer: 'sync-providers',
    reason: 'sync-providers BOFASAdapter (Publications index) has staged BOFAS since before discovery existed',
    pendingTransition: {
      to: 'discover',
      status: 'awaiting-approval',
      note: 'Moving BOFAS staging to discovery (edition matching, stated labels) awaits the owner\'s approval. '
        + 'Until then discovery may only DRY-RUN BOFAS, as a comparison.',
    },
  },
  'NHS EBI': { producer: 'discover', reason: 'discovery batch 1 (EBI adapter); sync-providers has no EBI adapter' },
  BESS: { producer: 'discover', reason: 'discovery batch 1 (BESS adapter); sync-providers deliberately has no BESS adapter' },
};

export type OwnershipCheck =
  | { ok: true; ownership: Ownership }
  | { ok: false; status: 'not-owner'; owner: StagingProducer; ownership: Ownership; message: string }
  | { ok: false; status: 'unowned'; message: string };

export function checkOwnership(provider: string, producer: StagingProducer): OwnershipCheck {
  const ownership = Object.prototype.hasOwnProperty.call(STAGING_OWNERSHIP, provider) ? STAGING_OWNERSHIP[provider] : undefined;
  if (!ownership) {
    return {
      ok: false,
      status: 'unowned',
      message: `provider "${provider}" has no staging owner in scripts/lib/staging-ownership.ts; `
        + 'not staged. Assigning one is a decision, not a default.',
    };
  }
  if (ownership.producer === producer) return { ok: true, ownership };
  const transition = ownership.pendingTransition;
  return {
    ok: false,
    status: 'not-owner',
    owner: ownership.producer,
    ownership,
    message: `provider "${provider}" is staged by ${ownership.producer}, not ${producer}`
      + (transition && transition.to === producer ? ` (transition to ${producer} ${transition.status})` : ''),
  };
}
