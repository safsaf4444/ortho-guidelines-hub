/**
 * src/components/FreshnessDashboard.tsx
 * ─────────────────────────────────────
 * Read-only editorial intelligence view: which catalogue entries need a
 * human look, from the deterministic evaluator in src/lib/freshness.ts and an
 * evidence snapshot supplied by the caller.
 *
 * READ-ONLY BY CONSTRUCTION. No write path, no service import, no
 * WRITES_ENABLED branch, no button that changes a record. Everything an editor
 * can do here is read, filter, open a publisher link, and decide offline.
 *
 * Visual language, kept deliberately simple and consistent with App.tsx:
 *   confirmed   solid emerald border/badge — read on the publisher's page or a
 *               dated archive capture of it
 *   inferred    dashed amber border/badge — a secondary source or structural
 *               inference, including every signal derived from catalogue
 *               fields alone
 *   unverified  dotted slate border/badge — could not be checked / stale copy
 *
 * Integration status: intentionally NOT mounted by App.tsx. Static bundles
 * cannot protect confidential evidence. Enabling a route requires approved
 * evidence provenance/reuse and an appropriate access/storage architecture.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, X, TriangleAlert, ShieldCheck, HelpCircle, CircleDashed } from 'lucide-react';
import type { Guideline } from '../data/guidelines-data';
import { cn } from '../lib/utils';
import {
  ALL_SIGNAL_TYPES,
  catalogueAsOfFrom,
  catalogueRecordedDate,
  evaluateFreshness,
  filterSignals,
  type EvidenceQuality,
  type EvidenceSnapshot,
  type FreshnessSignal,
  type FreshnessSignalType,
  type Severity,
} from '../lib/freshness';

export interface FreshnessDashboardProps {
  guidelines: Guideline[];
  evidence: EvidenceSnapshot | null;
  /** ISO date treated as today. Defaults to the evidence snapshot date, then the real date. */
  asOf?: string;
}

const SIGNAL_LABEL: Record<FreshnessSignalType, string> = {
  'replacement-declared': 'Replacement declared by publisher',
  'archive-declared': 'Archived / withdrawn by publisher',
  'publisher-newer-than-catalogue': 'Publisher date newer than catalogue',
  'conflicting-evidence': 'Conflicting evidence',
  'review-overdue': 'Publisher review date overdue',
  'replacement-announced': 'Replacement announced (future)',
  'provider-notice': 'Provider-wide notice',
  'stale-evidence-only': 'Only stale evidence',
  'unverified-external-link': 'Unverified external link',
  'no-recent-verification': 'No recent link verification',
  'no-recorded-date': 'No machine-readable catalogue date',
  'evidence-for-unknown-entry': 'Evidence for an entry not in the catalogue',
  'publisher-confirms-current': 'Publisher confirms recorded date',
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-slate-100 text-slate-700 border-slate-200',
  info: 'bg-sky-50 text-sky-800 border-sky-200',
};

const QUALITY_STYLE: Record<EvidenceQuality, { badge: string; border: string; label: string; Icon: typeof ShieldCheck }> = {
  confirmed: { badge: 'bg-emerald-100 text-emerald-800 border border-emerald-300', border: 'border-l-4 border-emerald-500', label: 'Confirmed dated observation', Icon: ShieldCheck },
  inferred: { badge: 'bg-amber-50 text-amber-800 border border-dashed border-amber-400', border: 'border-l-4 border-dashed border-amber-400', label: 'Inferred signal', Icon: HelpCircle },
  unverified: { badge: 'bg-slate-50 text-slate-600 border border-dotted border-slate-400', border: 'border-l-4 border-dotted border-slate-400', label: 'Unverified', Icon: CircleDashed },
};

function daysSince(iso: string, asOf: string): number | null {
  const a = Date.parse(iso.length >= 10 ? iso.slice(0, 10) : `${iso}-01`.slice(0, 10));
  const b = Date.parse(asOf);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.floor((b - a) / 86_400_000);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function QualityBadge({ quality, compact = false }: { quality: EvidenceQuality; compact?: boolean }) {
  const q = QUALITY_STYLE[quality];
  return (
    <span className={cn('inline-flex items-center gap-1 rounded px-1.5 py-px text-[11px] font-medium', q.badge)} title={q.label}>
      <q.Icon className="w-3 h-3" aria-hidden="true" />
      {compact ? quality : q.label}
    </span>
  );
}

export default function FreshnessDashboard({ guidelines, evidence, asOf }: FreshnessDashboardProps) {
  const effectiveAsOf = asOf ?? evidence?.generatedAt ?? todayIso();
  const catalogueAsOf = useMemo(() => catalogueAsOfFrom(guidelines), [guidelines]);
  const report = useMemo(
    () => evaluateFreshness(guidelines, evidence, { asOf: effectiveAsOf, catalogueAsOf: catalogueAsOf ?? undefined }),
    [guidelines, evidence, effectiveAsOf, catalogueAsOf],
  );

  const providers = useMemo(() => Object.keys(report.countsByProvider).sort(), [report]);
  const [provider, setProvider] = useState<string>('');
  const [signalTypes, setSignalTypes] = useState<FreshnessSignalType[]>([]);
  const [quality, setQuality] = useState<EvidenceQuality | ''>('');
  const [decisionOnly, setDecisionOnly] = useState(false);
  const [severities, setSeverities] = useState<Severity[]>(['high', 'medium']);
  const [selected, setSelected] = useState<FreshnessSignal | null>(null);
  const panelHeading = useRef<HTMLHeadingElement>(null);
  const lastRow = useRef<HTMLButtonElement | null>(null);

  const visible = useMemo(() => {
    const base = filterSignals(report.signals, { provider: provider || null, signals: signalTypes, quality: quality || null, decisionOnly });
    return base.filter((s) => severities.includes(s.severity));
  }, [report, provider, signalTypes, quality, decisionOnly, severities]);

  const highPriority = useMemo(() => report.signals.filter((s) => s.severity === 'high'), [report]);

  // Focus management: into the panel on open, back to the row on close.
  useEffect(() => {
    if (selected) panelHeading.current?.focus();
  }, [selected]);
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setSelected(null);
        lastRow.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const toggleSignal = (t: FreshnessSignalType) =>
    setSignalTypes((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  const toggleSeverity = (sv: Severity) =>
    setSeverities((cur) => (cur.includes(sv) ? cur.filter((x) => x !== sv) : [...cur, sv]));

  const entryOf = (id: string) => guidelines.find((g) => g.id === id);

  return (
    <div className="flex flex-col gap-3" data-testid="freshness-dashboard">
      <header className="flex flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-slate-900">Freshness review</h2>
        <p className="text-[12px] text-slate-600">
          Review signals only. Nothing here changes an entry: an editor reads the evidence, opens the publisher page, and decides.
          A reachable link is not evidence of currency, and age alone never means superseded.
        </p>
        <p className="text-[12px] text-amber-900 bg-amber-50 border border-amber-300 rounded p-2">
          Dated evidence snapshot. This view performs no live checks and does not refresh automatically.
          Observations apply to their recorded dates and do not establish present clinical currency.
        </p>
        <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-0.5 text-[11px] text-slate-600 mt-1">
          <div><dt className="inline font-medium text-slate-700">Catalogue export timestamp: </dt><dd className="inline" data-testid="catalogue-as-of">{catalogueAsOf ?? 'unknown; row check dates are not export metadata'}</dd></div>
          <div><dt className="inline font-medium text-slate-700">Evidence: </dt><dd className="inline">{evidence ? `${evidence.label}, ${evidence.generatedAt}` : 'none supplied'}</dd></div>
          <div><dt className="inline font-medium text-slate-700">Evaluated as of: </dt><dd className="inline">{effectiveAsOf}</dd></div>
        </dl>
        {report.catalogueOlderThanEvidence && (
          <div role="status" data-testid="snapshot-warning" className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-900">
            <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden="true" />
            <span>
              The catalogue snapshot ({report.catalogueAsOf}) is older than the evidence ({report.evidenceGeneratedAt}). Entries may already have been updated in the live database since this snapshot; confirm against the current record before acting.
            </span>
          </div>
        )}
        {!evidence && (
          <div role="status" className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
            No evidence snapshot supplied: only signals derived from catalogue fields are shown, and all of them are inferred.
          </div>
        )}
      </header>

      {/* Counts */}
      <section aria-label="Review queue counts" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['high', 'medium', 'low', 'info'] as Severity[]).map((sv) => (
          <button
            key={sv}
            type="button"
            aria-pressed={severities.includes(sv)}
            onClick={() => toggleSeverity(sv)}
            className={cn('rounded-md border px-3 py-2 text-left transition-colors', SEVERITY_STYLE[sv], !severities.includes(sv) && 'opacity-50')}
            data-testid={`severity-${sv}`}
          >
            <div className="text-[11px] uppercase tracking-wide">{sv}</div>
            <div className="text-[18px] font-semibold leading-tight">{report.countsBySeverity[sv]}</div>
          </button>
        ))}
        <div className="col-span-2 sm:col-span-4 text-[11px] text-slate-600">
          {report.entriesWithSignals} of {report.entriesEvaluated} entries carry at least one signal; {report.signals.filter((s) => s.requiresHumanDecision).length} signals need a human decision. Toggle a severity tile to include or exclude it.
        </div>
      </section>

      {/* High-priority discrepancies */}
      {highPriority.length > 0 && (
        <section aria-labelledby="hp-heading" className="rounded-md border border-red-200 bg-red-50/40 p-3">
          <h3 id="hp-heading" className="text-[12px] font-semibold text-red-900 mb-1.5">High-priority evidence discrepancies ({highPriority.length})</h3>
          <ul className="flex flex-col gap-1">
            {highPriority.map((s) => (
              <li key={`${s.guidelineId}:${s.signal}`} className="text-[12px] text-slate-800">
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={(e) => { lastRow.current = e.currentTarget; setSelected(s); }}>
                  <span className="font-medium">{s.title}</span> — {SIGNAL_LABEL[s.signal]}
                </button>
                {' '}<QualityBadge quality={s.quality} compact />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Filters */}
      <section aria-label="Filters" className="flex flex-wrap items-end gap-2 text-[12px]">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-slate-600">Provider</span>
          <select value={provider} onChange={(e) => setProvider(e.target.value)} className="border border-slate-300 rounded px-2 py-1 bg-white" data-testid="filter-provider">
            <option value="">All providers</option>
            {providers.map((p) => <option key={p} value={p}>{p} ({report.countsByProvider[p]})</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-slate-600">Evidence quality</span>
          <select value={quality} onChange={(e) => setQuality(e.target.value as EvidenceQuality | '')} className="border border-slate-300 rounded px-2 py-1 bg-white" data-testid="filter-quality">
            <option value="">Any</option>
            <option value="confirmed">Confirmed</option>
            <option value="inferred">Inferred</option>
            <option value="unverified">Unverified</option>
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5">
          <input type="checkbox" checked={decisionOnly} onChange={(e) => setDecisionOnly(e.target.checked)} data-testid="filter-decision" />
          <span>Needs a human decision only</span>
        </label>
        <fieldset className="flex flex-wrap gap-1 basis-full">
          <legend className="text-[11px] text-slate-600 mb-0.5">Signal (none selected = all)</legend>
          {ALL_SIGNAL_TYPES.filter((t) => report.countsBySignal[t] > 0).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={signalTypes.includes(t)}
              onClick={() => toggleSignal(t)}
              className={cn('rounded-full border px-2 py-0.5 text-[11px] transition-colors', signalTypes.includes(t) ? 'bg-[#0F172A] text-white border-[#0F172A]' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50')}
              data-testid={`filter-signal-${t}`}
            >
              {SIGNAL_LABEL[t]} ({report.countsBySignal[t]})
            </button>
          ))}
        </fieldset>
      </section>

      {/* Legend */}
      <section aria-label="Evidence legend" className="flex flex-wrap gap-3 text-[11px] text-slate-600">
        <span className="inline-flex items-center gap-1"><QualityBadge quality="confirmed" compact /> read on the publisher's page or a dated archive capture</span>
        <span className="inline-flex items-center gap-1"><QualityBadge quality="inferred" compact /> secondary source or derived from catalogue fields</span>
        <span className="inline-flex items-center gap-1"><QualityBadge quality="unverified" compact /> could not be checked, or a stale copy</span>
      </section>

      <div className="flex flex-col lg:flex-row gap-3">
        {/* Queue */}
        <section aria-label="Review signals" className="flex-1 min-w-0">
          <div className="text-[11px] text-slate-600 mb-1" data-testid="visible-count">{visible.length} signal(s) shown of {report.signals.length}</div>
          <ul className="flex flex-col divide-y divide-slate-100 border border-slate-200 rounded-md bg-white" data-testid="signal-list">
            {visible.length === 0 && <li className="px-3 py-3 text-[12px] text-slate-500">Nothing matches the current filters.</li>}
            {visible.map((s) => {
              const q = QUALITY_STYLE[s.quality];
              const isSel = selected === s;
              const accesses = s.provenance.map((p) => p.accessedAt).sort();
              const latestAccess = accesses.length ? accesses[accesses.length - 1] : undefined;
              const age = latestAccess ? daysSince(latestAccess, effectiveAsOf) : null;
              return (
                <li key={`${s.guidelineId}:${s.signal}:${s.evidenceDate ?? ''}`} className={cn(q.border)}>
                  <button
                    type="button"
                    aria-expanded={isSel}
                    onClick={(e) => { lastRow.current = e.currentTarget; setSelected(s); }}
                    className={cn('w-full text-left px-3 py-2 flex flex-col gap-0.5 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500', isSel && 'bg-slate-50')}
                    data-testid="signal-row"
                  >
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn('rounded border px-1.5 py-px text-[10px] uppercase tracking-wide', SEVERITY_STYLE[s.severity])}>{s.severity}</span>
                      <span className="text-[12px] font-medium text-slate-900">{SIGNAL_LABEL[s.signal]}</span>
                      <QualityBadge quality={s.quality} compact />
                      {s.requiresHumanDecision && <span className="rounded bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-px text-[10px]">decision</span>}
                    </div>
                    <div className="text-[12px] text-slate-800">{s.title}</div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3">
                      <span>{s.provider}</span>
                      {s.evidenceDate && <span>evidence date {s.evidenceDate}</span>}
                      {s.catalogueDate && <span>catalogue {s.catalogueDate}</span>}
                      {age !== null && <span>evidence read {age} day(s) before {effectiveAsOf}</span>}
                      {s.provenance.length === 0 && <span>derived from catalogue fields</span>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Detail panel */}
        {selected && (
          <aside
            role="dialog"
            aria-modal="false"
            aria-labelledby="freshness-detail-heading"
            className="lg:w-[420px] shrink-0 border border-slate-200 rounded-md bg-white p-3 flex flex-col gap-2 text-[12px]"
            data-testid="detail-panel"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 id="freshness-detail-heading" ref={panelHeading} tabIndex={-1} className="text-[13px] font-semibold text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded">
                {selected.title}
              </h3>
              <button type="button" onClick={() => { setSelected(null); lastRow.current?.focus(); }} aria-label="Close details" className="p-1 rounded hover:bg-slate-100" data-testid="detail-close">
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('rounded border px-1.5 py-px text-[10px] uppercase tracking-wide', SEVERITY_STYLE[selected.severity])}>{selected.severity}</span>
              <span className="font-medium">{SIGNAL_LABEL[selected.signal]}</span>
              <QualityBadge quality={selected.quality} />
              {selected.requiresHumanDecision
                ? <span className="rounded bg-indigo-50 text-indigo-800 border border-indigo-200 px-1.5 py-px text-[10px]">human decision required</span>
                : <span className="rounded bg-slate-50 text-slate-600 border border-slate-200 px-1.5 py-px text-[10px]">no decision required</span>}
            </div>
            <p className="text-slate-800">{selected.explanation}</p>
            <div className="rounded bg-slate-50 border border-slate-200 p-2">
              <div className="text-[11px] font-medium text-slate-700">Suggested editorial action</div>
              <div>{selected.suggestedAction}</div>
            </div>
            {selected.caveats.length > 0 && (
              <ul className="list-disc pl-4 text-amber-900">
                {selected.caveats.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            )}

            {(() => {
              const g = entryOf(selected.guidelineId);
              if (!g) return <p className="text-slate-500">Not in the catalogue snapshot ({selected.guidelineId}).</p>;
              return (
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                  <dt className="text-slate-500">Entry</dt><dd className="font-mono">{g.id}</dd>
                  <dt className="text-slate-500">Source</dt><dd>{g.source}</dd>
                  <dt className="text-slate-500">Recorded</dt><dd>{g.subGroup ?? '—'} (parsed: {catalogueRecordedDate(g) ?? 'none'})</dd>
                  <dt className="text-slate-500">Guidance status</dt><dd>{g.guidanceStatus}</dd>
                  <dt className="text-slate-500">Link status</dt><dd>{g.linkVerificationStatus ?? 'unchecked'}{g.linkLastVerified ? `, verified ${g.linkLastVerified}` : ''} — reachability only</dd>
                  <dt className="text-slate-500">Editorial review</dt><dd>{g.editorialReviewDate ?? '—'}</dd>
                  {g.notes && <><dt className="text-slate-500">Notes</dt><dd>{g.notes}</dd></>}
                </dl>
              );
            })()}

            <div>
              <div className="text-[11px] font-medium text-slate-700 mb-0.5">Evidence provenance</div>
              {selected.provenance.length === 0 && <p className="text-slate-500">Derived from catalogue fields; no publisher page was read.</p>}
              <ul className="flex flex-col gap-1">
                {selected.provenance.map((p, i) => (
                  <li key={i} className={cn('rounded border p-2', p.stale ? 'border-dotted border-slate-400 bg-slate-50' : 'border-slate-200')}>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-medium">{p.kind}</span>
                      <span className="text-slate-500">read {p.accessedAt}{p.snapshotOf ? `, capture ${p.snapshotOf}` : ''}</span>
                      {p.stale && <span className="rounded bg-slate-200 text-slate-800 px-1.5 py-px text-[10px]">stale copy</span>}
                    </div>
                    {p.statement && <blockquote className="text-slate-800 border-l-2 border-slate-300 pl-2 mt-1">“{p.statement}”</blockquote>}
                    {p.staleReason && <div className="text-[11px] text-slate-600 mt-1">{p.staleReason}</div>}
                    <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline mt-1 break-all">
                      {p.sourceUrl}<ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            {evidence && (() => {
              const all = evidence.records.filter((r) => r.guidelineId === selected.guidelineId);
              const shown = new Set(selected.provenance.map((p) => p.sourceUrl + (p.stale ? '#stale' : '')));
              const others = all.filter((r) => !shown.has(r.sourceUrl + (r.stale ? '#stale' : '')));
              if (others.length === 0) return null;
              return (
                <div>
                  <div className="text-[11px] font-medium text-slate-700 mb-0.5">Other evidence for this entry ({others.length})</div>
                  <ul className="flex flex-col gap-1">
                    {others.map((r, i) => (
                      <li key={i} className={cn('rounded border p-2', r.stale ? 'border-dotted border-slate-400 bg-slate-50' : 'border-slate-200')}>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="font-medium">{r.kind}</span>
                          <QualityBadge quality={r.quality} compact />
                          <span className="text-slate-500">read {r.accessedAt}{r.snapshotOf ? `, capture ${r.snapshotOf}` : ''}</span>
                          {r.stale && <span className="rounded bg-slate-200 text-slate-800 px-1.5 py-px text-[10px]">stale copy</span>}
                          {r.lastUpdated && <span className="text-slate-500">states last updated {r.lastUpdated}</span>}
                        </div>
                        {r.statement && <blockquote className="text-slate-800 border-l-2 border-slate-300 pl-2 mt-1">“{r.statement}”</blockquote>}
                        {r.staleReason && <div className="text-[11px] text-slate-600 mt-1">{r.staleReason}</div>}
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline mt-1 break-all">
                          {r.sourceUrl}<ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })()}

            <div>
              <div className="text-[11px] font-medium text-slate-700 mb-0.5">Links</div>
              <ul className="flex flex-col gap-0.5">
                {selected.links.map((l, i) => (
                  <li key={i}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-700 hover:underline break-all">
                      <span className="text-slate-600">{l.label}:</span> {l.url}<ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
