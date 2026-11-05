/**
 * scripts/lib/index-diff.ts
 * ─────────────────────────
 * Provider-index change monitoring: what changed on a provider's surface
 * between two parses. PURE — takes two SurfaceParse values (and, optionally,
 * what the fetch itself observed) and returns a structured diff plus alerts.
 *
 * ─── WHAT THE EXISTING SWEEP ALREADY SEES, AND WHAT IT DOES NOT ────────────
 *
 * scripts/discover.ts, through scripts/lib/discovery-cache.ts, already records
 * per surface: the body hash and whether it changed since the last run
 * (`bodyChanged`, `previousBodySha256`), a redirect of the index page, a zero
 * parse on a surface known to carry items (`expectItems` → run failure), and a
 * fetch error (`outcome: failed`). What it does NOT do is say WHICH items
 * changed: a body-hash change is one bit. This module turns the previous and
 * current parses into item-level facts:
 *
 *   added            a document URL on the index now that was not before
 *   removed          a document URL that was on the index and is not now
 *   retitled-url     the same TITLE now points at a different URL (a possible
 *                    move or re-upload; reported as a signal, never as a fact)
 *   label-changed    the same URL now carries different publisher labels
 *                    (a date in brackets, a version string, a section)
 *   section-changed  the same URL moved to a different section heading
 *   status-wording   archived / withdrawn / superseded / retired wording
 *                    appeared on, or left, an item
 *   empty-index      the current parse has no items where the previous had some
 *   structure        the parser's exclusion profile changed sharply (a sign the
 *                    page template changed even if the documents did not)
 *
 * Plus the fetch-level facts the caller passes in (status, redirect, error).
 *
 * Every alert is a review prompt. "Removed from the index" is NOT withdrawal:
 * the lifecycle rule (FM3) needs two consecutive successful sweeps AND a
 * direct document check before anyone says withdrawn, and even then an editor
 * decides. This module says "removed since the last parse", and only that.
 */
import type { DiscoveredRecord, SurfaceParse } from '../adapters/types';
import { documentIdentityKey } from './ingestion';
import { declaredStatusWording } from './status-wording';

export type IndexChangeKind =
  | 'added'
  | 'removed'
  | 'retitled-url'
  | 'title-changed'
  | 'label-changed'
  | 'section-changed'
  | 'status-wording';

export interface IndexChange {
  kind: IndexChangeKind;
  topic: string;
  url: string;
  /** For retitled-url: the previous URL. For label/section changes: the previous value. */
  previous?: string;
  current?: string;
  detail: string;
}

export interface FetchFacts {
  status?: number;
  finalUrl?: string;
  redirected?: boolean;
  bodyChanged?: boolean;
  /** True when the server answered 304 and a trusted prior representation was reused as the body. */
  revalidated?: boolean;
  error?: string;
  /**
   * The surface is known to carry items, so a 0-item parse is a structural
   * failure even on a first run (no baseline). Defaults to true: every
   * registered surface expects items.
   */
  expectItems?: boolean;
}

export type AlertLevel = 'info' | 'review' | 'alert';

export interface IndexAlert {
  level: AlertLevel;
  code:
    | 'inaccessible'
    | 'missing-baseline-evidence'
    | 'empty-index'
    | 'initial-baseline'
    | 'index-redirected'
    | 'structure-changed'
    | 'items-removed'
    | 'items-added'
    | 'status-wording-changed'
    | 'labels-changed'
    | 'body-changed-no-item-change';
  message: string;
}

export interface IndexDiff {
  previousItems: number;
  currentItems: number;
  changes: IndexChange[];
  alerts: IndexAlert[];
  /** No item-level change of any kind. */
  unchanged: boolean;
}

/**
 * Items are keyed on the CONSERVATIVE identity key, which keeps path and
 * query case: `/A.pdf` and `/a.pdf` are two listings on a case-sensitive
 * server and must never be collapsed by monitoring. (The loose match key
 * lowercases everything and is the wrong tool here.)
 */
const keyOf = (r: DiscoveredRecord) => documentIdentityKey(r.discoveredUrl);
const titleKey = (r: DiscoveredRecord) => r.topic.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const collapseWs = (s: string) => s.replace(/\s+/g, ' ').trim();
const labelsOf = (r: DiscoveredRecord) =>
  r.statedLabels
    .map((l) => `${l.fieldLabel ?? l.origin}=${l.value}`)
    .sort()
    .join(' | ');
const statusWordingOf = (r: DiscoveredRecord): string | null => {
  if (declaredStatusWording(r.sectionHeading)) return r.sectionHeading!;
  const l = r.statedLabels.find((x) => declaredStatusWording(x.value));
  return l ? l.value : null;
};

/**
 * Diff two parses of the same surface. `previous` may be null on a first run,
 * in which case nothing is "added" (there is no baseline) and the diff only
 * reports fetch-level facts.
 */
export function diffSurfaceParses(previous: SurfaceParse | null, current: SurfaceParse, fetch: FetchFacts = {}): IndexDiff {
  const changes: IndexChange[] = [];
  const alerts: IndexAlert[] = [];

  const expectItems = fetch.expectItems !== false;

  if (fetch.error) {
    alerts.push({ level: 'alert', code: 'inaccessible', message: `surface could not be read: ${fetch.error}. No conclusion about any document follows from this.` });
  } else if (fetch.status === 304) {
    // A 304 is only an observation when a trusted prior representation stood
    // in for the body. With nothing to stand in, there is no evidence at all.
    if (fetch.revalidated && current.items.length > 0) {
      alerts.push({ level: 'info', code: 'body-changed-no-item-change', message: 'HTTP 304: the publisher confirmed the stored representation is unchanged; compared against it' });
    } else {
      alerts.push({ level: 'alert', code: 'missing-baseline-evidence', message: 'HTTP 304 with no trusted prior representation to compare: nothing was observed. Clear the validator and refetch unconditionally.' });
    }
  } else if (fetch.status !== undefined && (fetch.status < 200 || fetch.status >= 300)) {
    alerts.push({ level: 'alert', code: 'inaccessible', message: `surface answered HTTP ${fetch.status}. No conclusion about any document follows from this.` });
  }
  if (fetch.redirected && fetch.finalUrl) {
    alerts.push({ level: 'review', code: 'index-redirected', message: `the index page redirected to ${fetch.finalUrl}; items were parsed from the final page` });
  }

  // A surface known to carry items that parses to none is a structural
  // failure (template change, maintenance page, block page) whether or not a
  // baseline exists. It must never become a baseline and must be visible.
  if (expectItems && current.items.length === 0 && !fetch.error && !alerts.some((a) => a.code === 'missing-baseline-evidence')) {
    alerts.push({
      level: 'alert',
      code: 'empty-index',
      message: previous
        ? `the index parsed to 0 items where the previous parse had ${previous.items.length}. Treat as a parse or publisher failure until a human looks; it is not evidence that anything was withdrawn.`
        : 'first observation parsed to 0 items on a surface known to carry documents: structurally invalid; NOT accepted as a baseline.',
    });
  }

  // Nothing was observed (transport error, non-2xx, or a 304 with no prior
  // representation): there is no "current" index to diff. Reporting removals
  // against an empty parse would turn an outage into phantom withdrawals.
  const nothingObserved = alerts.some((a) => a.level === 'alert' && ['inaccessible','missing-baseline-evidence','empty-index'].includes(a.code));
  if (nothingObserved) {
    return { previousItems: previous?.items.length ?? 0, currentItems: current.items.length, changes, alerts, unchanged: false };
  }

  if (!previous) {
    if (current.items.length > 0 && !fetch.error) {
      alerts.push({ level: 'info', code: 'initial-baseline', message: `first observation: ${current.items.length} item(s) recorded as the initial baseline; nothing is "added" because there is nothing to compare with` });
    }
    return { previousItems: 0, currentItems: current.items.length, changes, alerts, unchanged: true };
  }

  const prevByKey = new Map(previous.items.map((r) => [keyOf(r), r] as const));
  const curByKey = new Map(current.items.map((r) => [keyOf(r), r] as const));
  const prevByTitle = new Map(previous.items.map((r) => [titleKey(r), r] as const));

  if (!expectItems && previous.items.length > 0 && current.items.length === 0) {
    alerts.push({ level: 'review', code: 'empty-index', message: `the index parsed to 0 items where the previous parse had ${previous.items.length}; this surface may legitimately empty, so this is a review prompt, not a failure` });
  }

  for (const [k, cur] of curByKey) {
    const prev = prevByKey.get(k);
    if (!prev) {
      const sameTitle = prevByTitle.get(titleKey(cur));
      if (sameTitle && !curByKey.has(keyOf(sameTitle))) {
        changes.push({
          kind: 'retitled-url',
          topic: cur.topic,
          url: cur.discoveredUrl,
          previous: sameTitle.discoveredUrl,
          detail: 'the same title now points at a different URL and the old URL is no longer listed: a possible move or re-upload (unverified; the two documents were not compared)',
        });
      } else {
        changes.push({ kind: 'added', topic: cur.topic, url: cur.discoveredUrl, detail: 'listed now; not listed in the previous parse' });
      }
      const sw = statusWordingOf(cur);
      if (sw) changes.push({ kind: 'status-wording', topic: cur.topic, url: cur.discoveredUrl, current: sw, detail: `listed with status wording "${sw}"` });
      continue;
    }
    if (collapseWs(prev.topic) !== collapseWs(cur.topic)) {
      changes.push({ kind: 'title-changed', topic: cur.topic, url: cur.discoveredUrl, previous: prev.topic, current: cur.topic, detail: 'the same URL is now listed under a different title: a retitle, a new edition at the old address, or a listing error — a reviewer decides' });
    }
    const pl = labelsOf(prev);
    const cl = labelsOf(cur);
    if (pl !== cl) {
      changes.push({ kind: 'label-changed', topic: cur.topic, url: cur.discoveredUrl, previous: pl, current: cl, detail: 'publisher labels beside this link changed' });
    }
    if ((prev.sectionHeading ?? '') !== (cur.sectionHeading ?? '')) {
      changes.push({ kind: 'section-changed', topic: cur.topic, url: cur.discoveredUrl, previous: prev.sectionHeading, current: cur.sectionHeading, detail: 'the item sits under a different section heading' });
    }
    const ps = statusWordingOf(prev);
    const cs = statusWordingOf(cur);
    if ((ps ?? '') !== (cs ?? '')) {
      changes.push({ kind: 'status-wording', topic: cur.topic, url: cur.discoveredUrl, previous: ps ?? undefined, current: cs ?? undefined, detail: cs ? `status wording now "${cs}"` : `status wording "${ps}" no longer present` });
    }
  }

  for (const [k, prev] of prevByKey) {
    if (curByKey.has(k)) continue;
    // Already reported as the "previous" side of a retitled-url change?
    const movedTo = changes.find((c) => c.kind === 'retitled-url' && c.previous === prev.discoveredUrl);
    if (movedTo) continue;
    changes.push({
      kind: 'removed',
      topic: prev.topic,
      url: prev.discoveredUrl,
      detail: 'listed in the previous parse; not listed now. Removal from an index is not withdrawal: it needs a second successful sweep and a direct document check before anyone says so',
    });
  }

  const n = (kind: IndexChangeKind) => changes.filter((c) => c.kind === kind).length;
  if (n('removed')) alerts.push({ level: 'review', code: 'items-removed', message: `${n('removed')} document(s) no longer listed (see changes; not withdrawals)` });
  if (n('added') || n('retitled-url')) alerts.push({ level: 'review', code: 'items-added', message: `${n('added')} new listing(s), ${n('retitled-url')} title(s) now at a different URL` });
  if (n('status-wording')) alerts.push({ level: 'review', code: 'status-wording-changed', message: `${n('status-wording')} item(s) gained or lost archived/withdrawn/superseded wording` });
  if (n('title-changed')) alerts.push({ level: 'review', code: 'items-added', message: `${n('title-changed')} listing(s) changed title at the same URL` });
  if (n('label-changed') || n('section-changed')) alerts.push({ level: 'info', code: 'labels-changed', message: `${n('label-changed')} label change(s), ${n('section-changed')} section change(s)` });

  // Template drift: exclusions moved sharply while items did not.
  const exclDelta = Math.abs(current.excluded.length - previous.excluded.length);
  if (exclDelta >= Math.max(3, Math.ceil(previous.excluded.length * 0.5)) && n('added') + n('removed') === 0) {
    alerts.push({ level: 'review', code: 'structure-changed', message: `the parser's exclusion count moved from ${previous.excluded.length} to ${current.excluded.length} with no document change: the page template may have changed` });
  }
  if (fetch.bodyChanged && changes.length === 0) {
    alerts.push({ level: 'info', code: 'body-changed-no-item-change', message: 'the page body changed but no listed document, label or section did (formatting, navigation or cache-token noise)' });
  }

  return {
    previousItems: previous.items.length,
    currentItems: current.items.length,
    changes,
    alerts,
    unchanged: changes.length === 0,
  };
}

// ─── Rendering ──────────────────────────────────────────────────────────────

export interface ProviderMonitorSection {
  provider: string;
  providerName: string;
  surfaceUrl: string;
  diff: IndexDiff;
  /** Optional coverage summary lines (from scripts/lib/coverage-gap.ts) to print under "Discovery". */
  discoveryLines?: string[];
  /** Optional review items (rendered already) to print under "Review required". */
  reviewLines?: string[];
}

export function renderMonitoringReport(sections: ProviderMonitorSection[], generatedAt: string, snapshotLabel?: string): string {
  const out: string[] = [];
  out.push(`Provider change monitoring — dry run — ${generatedAt}`);
  if (snapshotLabel) out.push(`Catalogue comparison basis: ${snapshotLabel} (snapshot, not production truth)`);
  out.push('Nothing in this report changes a catalogue entry, stages a candidate or publishes anything.');
  for (const s of sections) {
    out.push('');
    out.push(`Provider: ${s.provider} — ${s.providerName}`);
    out.push(`Surface: ${s.surfaceUrl}`);
    if (s.discoveryLines?.length) {
      out.push('');
      out.push('Discovery:');
      for (const l of s.discoveryLines) out.push(`- ${l}`);
    }
    out.push('');
    out.push('Index changes since the previous parse:');
    out.push(`- previous ${s.diff.previousItems} item(s), current ${s.diff.currentItems}`);
    const counts: Record<IndexChangeKind, number> = { added: 0, removed: 0, 'retitled-url': 0, 'title-changed': 0, 'label-changed': 0, 'section-changed': 0, 'status-wording': 0 };
    for (const c of s.diff.changes) counts[c.kind]++;
    out.push(`- ${counts.added} added, ${counts.removed} removed, ${counts['retitled-url']} title(s) at a new URL, ${counts['title-changed']} title change(s) at the same URL`);
    out.push(`- ${counts['label-changed']} publisher label change(s), ${counts['section-changed']} section change(s), ${counts['status-wording']} archived/withdrawn-wording change(s)`);
    out.push('');
    out.push('Alerts:');
    if (s.diff.alerts.length === 0) out.push('- none');
    for (const a of s.diff.alerts) out.push(`- [${a.level}] ${a.message}`);
    if (s.diff.changes.length) {
      out.push('');
      out.push('Changes:');
      for (const c of s.diff.changes) {
        out.push(`- [${c.kind}] ${c.topic}`);
        out.push(`    URL: ${c.url}${c.previous && c.kind === 'retitled-url' ? `\n    previously: ${c.previous}` : ''}`);
        if (c.kind === 'label-changed' || c.kind === 'section-changed' || c.kind === 'status-wording' || c.kind === 'title-changed') {
          out.push(`    before: ${c.previous ?? '(none)'}`);
          out.push(`    after:  ${c.current ?? '(none)'}`);
        }
        out.push(`    ${c.detail}`);
      }
    }
    if (s.reviewLines?.length) {
      out.push('');
      out.push('Review required:');
      for (const l of s.reviewLines) out.push(l);
    }
  }
  return out.join('\n');
}
