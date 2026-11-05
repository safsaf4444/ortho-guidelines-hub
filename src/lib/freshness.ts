/**
 * src/lib/freshness.ts
 * ────────────────────
 * Deterministic freshness evaluator: which catalogue entries need an
 * editorial look, and why, from (a) the catalogue rows themselves and (b) an
 * OPTIONAL evidence snapshot an editor or a script supplies.
 *
 * PURE. No network, no storage, no dates read from the clock (the caller
 * passes `asOf`). It never changes a guideline: every output is a new object
 * describing a REVIEW SIGNAL, with its provenance and the editorial action it
 * suggests. There is no code path here that could set `guidanceStatus`,
 * `linkVerificationStatus` or anything else.
 *
 * ─── EVIDENCE, NOT CONCLUSIONS ──────────────────────────────────────────────
 *
 * An EvidenceRecord is what someone READ, where and when: a publisher page's
 * "Last updated" field, a replacement banner, an index section label, a
 * review-due date. The author of the record grades its own quality:
 *
 *   confirmed   read on the publisher's own page (or an archive capture of it)
 *               and quoted;
 *   inferred    concluded from structure, dates or a secondary source;
 *   unverified  could not be checked (blocked site, stale fetch, hearsay).
 *
 * The evaluator never upgrades a grade. It can only pass it through or lower
 * the SIGNAL's quality when the evidence is marked stale or records conflict.
 *
 * ─── WHAT THIS DELIBERATELY DOES NOT DO ─────────────────────────────────────
 *
 *   * It does not infer supersession or withdrawal from the age of a document.
 *     A 2016 BOAST listed as current by its publisher is current.
 *   * It does not treat a reachable link (HTTP 200, `linkVerificationStatus:
 *     'verified'`) as evidence that guidance is current. Link verification
 *     answers "did the URL respond"; it says nothing about the guidance.
 *   * It does not parse PDFs, fetch pages or guess dates it was not given.
 *
 * ─── DATES IN THE CATALOGUE ─────────────────────────────────────────────────
 *
 * The catalogue stores publication dates as FREE TEXT in `subGroup`
 * ("Published 2016, updated Dec 2020") and in `versions[].label`
 * ("Revised July 2025"); `versions[].date` is unpopulated in the generated
 * snapshot. So the "recorded date" is the LATEST month/year this module can
 * read out of those strings, at month granularity when a month is named and
 * year granularity otherwise. When nothing parses, the entry is reported as
 * having no machine-readable date rather than guessed.
 */
import type { Guideline } from '../data/guidelines-data';

// ─── Evidence model ─────────────────────────────────────────────────────────

export type EvidenceQuality = 'confirmed' | 'inferred' | 'unverified';

export type EvidenceKind =
  | 'publisher-page'      // the document's own landing page, read directly
  | 'publisher-index'     // the publisher's index/listing page
  | 'archive-snapshot'    // a dated capture of a publisher page (e.g. UK Government Web Archive)
  | 'secondary-source'    // a third party reporting what the publisher did
  | 'manual-observation'; // an editor's note of something seen

export interface EvidenceRecord {
  /** Catalogue entry this concerns. May name an entry the catalogue does not hold (a replacement). */
  guidelineId: string;
  /** Display title for the document, used when the catalogue has no entry for it. */
  title?: string;
  /** Publisher label as the catalogue spells it, e.g. 'NICE', 'BOA', 'BSSH'. */
  publisher: string;
  kind: EvidenceKind;
  quality: EvidenceQuality;
  /** Where it was read. */
  sourceUrl: string;
  /** ISO date (YYYY-MM-DD) the evidence was read. */
  accessedAt: string;
  /** For archive snapshots: the capture timestamp of the page (ISO). */
  snapshotOf?: string;
  /** The publisher's wording, short and verbatim. Never clinical content. */
  statement?: string;
  /** Dates as the publisher states them, ISO YYYY-MM-DD or YYYY-MM or YYYY. */
  publishedDate?: string;
  lastUpdated?: string;
  lastReviewed?: string;
  /** A review date the publisher itself announced (e.g. "anticipated review date October 2021"). */
  reviewDue?: string;
  /** An explicit replacement the publisher declares. */
  replacedBy?: { identifier: string; title?: string; url?: string };
  /** A replacement the publisher has ANNOUNCED for the future (not yet published). */
  replacementAnnounced?: { description: string; expected?: string };
  /** The publisher marks this document (or this URL) archived / withdrawn. */
  archived?: boolean;
  /** When the evidence concerns one specific link of the entry rather than the entry as a whole. */
  observedUrl?: string;
  /** True when the fetch is known or suspected to be a stale copy (CDN/cache/mirror). */
  stale?: boolean;
  staleReason?: string;
  /** 'provider' records apply to every entry of `publisher` (a site-wide banner); default 'entry'. */
  scope?: 'entry' | 'provider';
}

export interface EvidenceSnapshot {
  label: string;
  /** ISO date the snapshot was assembled. */
  generatedAt: string;
  records: EvidenceRecord[];
}

// ─── Signals ────────────────────────────────────────────────────────────────

export type FreshnessSignalType =
  | 'publisher-newer-than-catalogue'
  | 'replacement-declared'
  | 'replacement-announced'
  | 'archive-declared'
  | 'review-overdue'
  | 'provider-notice'
  | 'conflicting-evidence'
  | 'stale-evidence-only'
  | 'unverified-external-link'
  | 'no-recent-verification'
  | 'no-recorded-date'
  | 'publisher-confirms-current'
  | 'evidence-for-unknown-entry';

export const ALL_SIGNAL_TYPES: readonly FreshnessSignalType[] = [
  'replacement-declared',
  'archive-declared',
  'publisher-newer-than-catalogue',
  'conflicting-evidence',
  'review-overdue',
  'replacement-announced',
  'provider-notice',
  'stale-evidence-only',
  'unverified-external-link',
  'no-recent-verification',
  'no-recorded-date',
  'evidence-for-unknown-entry',
  'publisher-confirms-current',
];

export type Severity = 'high' | 'medium' | 'low' | 'info';

export interface Provenance {
  kind: EvidenceKind;
  sourceUrl: string;
  accessedAt: string;
  snapshotOf?: string;
  statement?: string;
  stale?: boolean;
  staleReason?: string;
}

export interface FreshnessSignal {
  guidelineId: string;
  title: string;
  provider: string;
  signal: FreshnessSignalType;
  severity: Severity;
  /** Quality of the evidence behind this signal, never higher than its weakest essential record. */
  quality: EvidenceQuality;
  /** Empty for signals derived from catalogue fields alone (then `derivedFrom` says which). */
  provenance: Provenance[];
  derivedFrom?: 'catalogue-fields';
  /** The date the evidence asserts (ISO), when there is one. */
  evidenceDate?: string;
  /** The latest date the catalogue records for the entry, as parsed (ISO month or year), if any. */
  catalogueDate?: string;
  explanation: string;
  suggestedAction: string;
  requiresHumanDecision: boolean;
  caveats: string[];
  /** Publisher-side links worth opening for this signal. */
  links: Array<{ label: string; url: string }>;
}

export interface FreshnessOptions {
  /** ISO date treated as "today". Required so results are reproducible. */
  asOf: string;
  /** Link verification older than this is reported as not recent. Default 90. */
  verificationMaxAgeDays?: number;
  /** ISO date the catalogue snapshot was generated/exported, if known. */
  catalogueAsOf?: string;
}

export interface FreshnessReport {
  asOf: string;
  evidenceLabel: string | null;
  evidenceGeneratedAt: string | null;
  catalogueAsOf: string | null;
  /** True when the evidence snapshot post-dates the catalogue snapshot: the catalogue may be behind. */
  catalogueOlderThanEvidence: boolean;
  signals: FreshnessSignal[];
  countsBySignal: Record<FreshnessSignalType, number>;
  countsByProvider: Record<string, number>;
  countsBySeverity: Record<Severity, number>;
  entriesEvaluated: number;
  entriesWithSignals: number;
}

// ─── Date parsing (catalogue free text and evidence ISO strings) ────────────

const MONTHS: Record<string, string> = {
  jan: '01', january: '01', feb: '02', february: '02', mar: '03', march: '03', apr: '04', april: '04',
  may: '05', jun: '06', june: '06', jul: '07', july: '07', aug: '08', august: '08',
  sep: '09', sept: '09', september: '09', oct: '10', october: '10', nov: '11', november: '11', dec: '12', december: '12',
};

/** Calendar-valid ISO date, allowing the explicitly supported year/month precision. */
export function validEvidenceDate(value: string | undefined): boolean {
  if (!value || !/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(value)) return false;
  const full = value.length === 4 ? value+'-01-01' : value.length === 7 ? value+'-01' : value;
  const parsed = Date.parse(full+'T00:00:00Z');
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,10) === full;
}

/**
 * Every date-like token in a free-text label, as ISO 'YYYY' or 'YYYY-MM'.
 * "Published 2016, updated Dec 2020" → ['2016', '2020-12'].
 * Bare years are only taken when they look like publication years (1990–2039).
 */
export function datesInText(text: string | undefined): string[] {
  if (!text) return [];
  const out = new Set<string>();
  const monthYear = /\b([A-Za-z]{3,9})\.?\s+((?:19|20)\d{2})\b/g;
  const consumed: Array<[number, number]> = [];
  for (const m of text.matchAll(/\b\d{4}-\d{2}(?:-\d{2})?\b/g)) {
    // Consume invalid ISO-looking tokens too: do not turn an impossible date
    // into an apparently valid bare year.
    consumed.push([m.index!,m.index!+m[0].length]);
    if (validEvidenceDate(m[0])) out.add(m[0]);
  }
  for (const m of text.matchAll(monthYear)) {
    const mm = MONTHS[m[1].toLowerCase()];
    if (!mm) continue;
    out.add(`${m[2]}-${mm}`);
    consumed.push([m.index!, m.index! + m[0].length]);
  }
  const yearOnly = /\b((?:19|20)\d{2})\b/g;
  for (const m of text.matchAll(yearOnly)) {
    const y = Number(m[1]);
    if (y < 1990 || y > 2039) continue;
    if (consumed.some(([a, b]) => m.index! >= a && m.index! < b)) continue;
    out.add(m[1]);
  }
  return [...out].sort();
}

/** Compare two ISO-ish dates ('YYYY', 'YYYY-MM', 'YYYY-MM-DD') at their common granularity. */
export function compareDates(a: string, b: string): -1 | 0 | 1 {
  const len = Math.min(a.length, b.length, 10);
  const x = a.slice(0, len);
  const y = b.slice(0, len);
  // Truncate both to the same granularity (year, month or day boundary).
  const g = len >= 10 ? 10 : len >= 7 ? 7 : 4;
  const xs = x.slice(0, g);
  const ys = y.slice(0, g);
  return xs < ys ? -1 : xs > ys ? 1 : 0;
}

/** The latest date the catalogue records for an entry, from its free-text fields. */
export function catalogueRecordedDate(g: Guideline): string | null {
  const all = [
    ...datesInText(g.subGroup),
    ...g.versions.flatMap((v) => [...datesInText(v.label), ...datesInText(v.date)]),
  ];
  if (all.length === 0) return null;
  return all.reduce((best, d) => (compareDates(d, best) > 0 ? d : best));
}

/** Last element, or undefined (ES2020 lib has no Array.prototype.at). */
function last<T>(xs: readonly T[]): T | undefined {
  return xs.length ? xs[xs.length - 1] : undefined;
}

function daysBetween(fromIso: string, toIso: string): number {
  if (!validEvidenceDate(fromIso) || !validEvidenceDate(toIso)) return Number.NaN;
  const a = Date.parse(fromIso.length === 10 ? fromIso : `${fromIso}-01`.slice(0, 10));
  const b = Date.parse(toIso.length === 10 ? toIso : `${toIso}-01`.slice(0, 10));
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.floor((b - a) / 86_400_000);
}

/** Display-level URL comparison for matching evidence to a version link. NOT a document key. */
function sameLink(a: string, b: string): boolean {
  // Conservative evidence association: preserve path case, reserved escapes,
  // query and fragment. This is not the ingestion document-identity policy.
  return a.trim() === b.trim();
}

const QUALITY_RANK: Record<EvidenceQuality, number> = { confirmed: 3, inferred: 2, unverified: 1 };
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

function weakest(qs: EvidenceQuality[]): EvidenceQuality {
  return qs.reduce((w, q) => (QUALITY_RANK[q] < QUALITY_RANK[w] ? q : w), 'confirmed' as EvidenceQuality);
}

function provenanceOf(r: EvidenceRecord): Provenance {
  return {
    kind: r.kind, sourceUrl: r.sourceUrl, accessedAt: r.accessedAt,
    ...(r.snapshotOf ? { snapshotOf: r.snapshotOf } : {}),
    ...(r.statement ? { statement: r.statement } : {}),
    ...(r.stale ? { stale: true, staleReason: r.staleReason } : {}),
  };
}

function providerOf(g: Guideline): string {
  // The catalogue's first-listed publisher, as a display label. Matching
  // against evidence uses the record's own `publisher` string, case-insensitively.
  return g.source.split('/')[0].trim();
}

function entryLinks(g: Guideline): Array<{ label: string; url: string }> {
  return g.versions.filter((v) => v.url && v.url !== '#').map((v) => ({ label: v.label, url: v.url }));
}

// ─── The evaluator ──────────────────────────────────────────────────────────

export function evaluateFreshness(
  guidelines: readonly Guideline[],
  evidence: EvidenceSnapshot | null,
  options: FreshnessOptions,
): FreshnessReport {
  const asOf = options.asOf;
  if (!validEvidenceDate(asOf) || asOf.length !== 10) throw new Error('Freshness evaluation requires a valid explicit YYYY-MM-DD date.');
  const maxAge = options.verificationMaxAgeDays ?? 90;
  const signals: FreshnessSignal[] = [];
  const byId = new Map(guidelines.map((g) => [g.id, g] as const));

  const entryRecords = new Map<string, EvidenceRecord[]>();
  const providerRecords: EvidenceRecord[] = [];
  for (const supplied of evidence?.records ?? []) {
    const r = {...supplied};
    const invalid = ['publishedDate','lastUpdated','lastReviewed','reviewDue','accessedAt']
      .filter(field => r[field as keyof EvidenceRecord] !== undefined && !validEvidenceDate(r[field as keyof EvidenceRecord] as string));
    if (invalid.length) {r.stale=true;r.quality='unverified';r.staleReason='Invalid date metadata requires review: '+invalid.join(', ');}
    if (['publishedDate','lastUpdated','lastReviewed'].some(field=>validEvidenceDate(r[field as keyof EvidenceRecord] as string)&&compareDates(r[field as keyof EvidenceRecord] as string,asOf)>0)) {r.stale=true;r.quality='unverified';r.staleReason='Publication/review metadata post-dates the evaluation date.';}
    if (validEvidenceDate(r.accessedAt) && compareDates(r.accessedAt,asOf)>0) {r.stale=true;r.quality='unverified';r.staleReason='Observation post-dates the explicit evaluation date.';}
    if (r.kind==='archive-snapshot' && (!r.snapshotOf || !validEvidenceDate(r.snapshotOf.slice(0,10)) || !Number.isFinite(Date.parse(r.snapshotOf))
        || compareDates(r.snapshotOf.slice(0,10),r.accessedAt)>0)) {r.stale=true;r.quality='unverified';r.staleReason='Archive capture date is missing, invalid or after the recorded access date.';}
    if (r.stale) r.quality='unverified';
    if (r.kind==='secondary-source' && r.quality==='confirmed') r.quality='inferred';
    if (r.scope === 'provider') { providerRecords.push(r); continue; }
    const list = entryRecords.get(r.guidelineId) ?? [];
    list.push(r);
    entryRecords.set(r.guidelineId, list);
  }

  for (const g of guidelines) {
    const title = g.topic;
    const provider = providerOf(g);
    const recorded = catalogueRecordedDate(g);
    const records = entryRecords.get(g.id) ?? [];
    const links = entryLinks(g);
    const push = (s: Omit<FreshnessSignal, 'guidelineId' | 'title' | 'provider' | 'links'> & { links?: FreshnessSignal['links'] }) =>
      signals.push({ guidelineId: g.id, title, provider, links: s.links ?? links, ...s });

    // ── Catalogue-only signals ───────────────────────────────────────────
    if (recorded === null) {
      push({
        signal: 'no-recorded-date', severity: 'low', quality: 'inferred', provenance: [], derivedFrom: 'catalogue-fields',
        explanation: 'Neither subGroup nor any version label carries a machine-readable month or year, so no "publisher newer than catalogue" comparison is possible for this entry.',
        suggestedAction: 'Record the publication/edition date in the entry (subGroup or version label) so freshness can be compared.',
        requiresHumanDecision: false, caveats: [],
      });
    }

    const lastVerified = g.linkLastVerified;
    const verifiedAge = lastVerified ? daysBetween(lastVerified, asOf) : Number.NaN;
    if (g.linkVerificationStatus !== 'verified' || Number.isNaN(verifiedAge) || verifiedAge < 0 || verifiedAge > maxAge) {
      push({
        signal: 'no-recent-verification', severity: 'low', quality: 'inferred', provenance: [], derivedFrom: 'catalogue-fields',
        catalogueDate: lastVerified,
        explanation: g.linkVerificationStatus !== 'verified'
          ? `Link verification status is "${g.linkVerificationStatus ?? 'unchecked'}".`
          : `Link verification is dated ${Number.isNaN(verifiedAge) ? 'unknown or invalid' : verifiedAge < 0 ? 'in the future (invalid evidence)' : `${verifiedAge} days before ${asOf}`} (threshold ${maxAge} days). Reachability does not establish clinical currency.`,
        suggestedAction: 'Re-run link verification; separately confirm currency on the publisher page.',
        requiresHumanDecision: false, caveats: ['Reachability is not currency.'],
      });
    }

    // External links (hosts other than the provider's) with no evidence at all.
    const providerHostHint = providerHostOf(g);
    for (const l of links) {
      let host = '';
      try { host = new URL(l.url).hostname.toLowerCase(); } catch { continue; }
      if (providerHostHint && (host === providerHostHint || host.endsWith('.'+providerHostHint))) continue;
      if (/fallback|index page/i.test(l.label)) continue;
      const covered = records.some((r) => r.observedUrl && sameLink(r.observedUrl, l.url));
      if (!covered) {
        push({
          signal: 'unverified-external-link', severity: 'low', quality: 'inferred', provenance: [], derivedFrom: 'catalogue-fields',
          explanation: `Version "${l.label}" points at ${host}, not the publisher's own site, and no evidence record covers it. Mirrors and journal copies can lag or differ from the publisher's current edition.`,
          suggestedAction: 'Open the link and the publisher page together; record which is canonical.',
          requiresHumanDecision: false, caveats: ['Derived from the catalogue alone; no page was read.'],
          links: [l],
        });
        break; // one per entry is enough for a queue
      }
    }

    // ── Provider-wide notices ────────────────────────────────────────────
    for (const r of providerRecords) {
      if (!samePublisher(r.publisher, g.source)) continue;
      push({
        signal: 'provider-notice', severity: 'medium', quality: r.quality, provenance: [provenanceOf(r)],
        evidenceDate: r.lastUpdated ?? r.accessedAt,
        explanation: `${r.publisher} carries a site-wide notice${r.statement ? `: "${r.statement}"` : ''}. It applies to every ${r.publisher} entry, including this one, and nothing on the page says which documents will change.`,
        suggestedAction: 'Add a dated editorial note; re-check the publisher index periodically for republication. No status change.',
        requiresHumanDecision: true, caveats: r.stale ? [`Evidence may be stale: ${r.staleReason ?? 'unspecified'}`] : [],
        links: [{ label: 'Publisher notice', url: r.sourceUrl }, ...links],
      });
    }

    if (records.length === 0) continue;

    // ── Evidence-based signals ───────────────────────────────────────────
    const usable = records.filter((r) => !r.stale);
    const staleOnly = usable.length === 0;
    if (staleOnly) {
      push({
        signal: 'stale-evidence-only', severity: 'low', quality: 'unverified', provenance: records.map(provenanceOf),
        explanation: 'Every evidence record is stale or has unusable dates/provenance, so it cannot support a currency conclusion.',
        suggestedAction: 'Re-read the publisher page directly, or use a dated archive capture, before acting.',
        requiresHumanDecision: false, caveats: records.map((r) => r.staleReason ?? 'stale'),
      });
      continue;
    }

    // Conflicts: usable records disagreeing on lastUpdated, or on archived, or a stale record contradicting a usable one.
    const updatedValues = [...new Set(usable.map((r) => r.lastUpdated).filter((x): x is string => !!x))];
    const archivedValues = [...new Set(usable.map((r) => r.archived).filter((x): x is boolean => x !== undefined))];
    const staleContradiction = records.filter((r) => r.stale && r.lastUpdated && updatedValues.some((u) => compareDates(u, r.lastUpdated!) !== 0));
    if (updatedValues.length > 1 || archivedValues.length > 1 || staleContradiction.length > 0) {
      const latest = last(updatedValues.sort());
      push({
        signal: 'conflicting-evidence', severity: 'medium', quality: weakest(records.map((r) => r.quality)), provenance: records.map(provenanceOf),
        evidenceDate: latest,
        explanation: updatedValues.length > 1
          ? `Sources disagree on the last-updated date (${updatedValues.sort().join(' vs ')}).`
          : staleContradiction.length > 0
            ? `A stale copy reports "${staleContradiction[0].lastUpdated}" while a dated source reports "${latest}". The later-dated publisher field is treated as current and the stale copy as superseded evidence.`
            : 'Sources disagree on whether the publisher marks this document archived.',
        suggestedAction: 'Prefer the document\'s own landing page (or its dated archive capture) over an index or a cached copy; re-read before acting.',
        requiresHumanDecision: true, caveats: staleContradiction.map((r) => `Stale: ${r.staleReason ?? r.sourceUrl}`),
        links: [...records.map((r) => ({ label: `Evidence (${r.kind})`, url: r.sourceUrl })), ...links],
      });
    }

    // Replacement declared.
    for (const r of usable.filter((x) => x.replacedBy)) {
      const rb = r.replacedBy!;
      const replacementHeld = byId.has(rb.identifier) || [...byId.values()].some((x) => x.versions.some((v) => rb.url && sameLink(v.url, rb.url)));
      push({
        signal: 'replacement-declared', severity: 'high', quality: r.quality, provenance: [provenanceOf(r)],
        evidenceDate: r.lastUpdated ?? r.accessedAt, catalogueDate: recorded ?? undefined,
        explanation: `The publisher states this guidance has been replaced by ${rb.title ? `"${rb.title}" (${rb.identifier})` : rb.identifier}${r.statement ? ` — "${r.statement}"` : ''}. The old address still serves a page; that is not currency. ${replacementHeld ? 'The replacement is already in the catalogue.' : 'The replacement is NOT in the catalogue.'}`,
        suggestedAction: replacementHeld
          ? 'Editor: mark this entry superseded with the publisher wording in inclusionReason, and cross-link the replacement.'
          : 'Editor: create the replacement entry (new identifier = new entry), then mark this one superseded with the publisher wording; re-read the summary.',
        requiresHumanDecision: true, caveats: [],
        links: [...(rb.url ? [{ label: `Replacement ${rb.identifier}`, url: rb.url }] : []), { label: 'Evidence', url: r.sourceUrl }, ...links],
      });
    }

    // Replacement announced for the future.
    for (const r of usable.filter((x) => x.replacementAnnounced && !x.replacedBy)) {
      const ra = r.replacementAnnounced!;
      push({
        signal: 'replacement-announced', severity: 'low', quality: r.quality, provenance: [provenanceOf(r)],
        evidenceDate: ra.expected, catalogueDate: recorded ?? undefined,
        explanation: `The publisher has announced a future replacement${ra.expected ? ` (expected ${ra.expected})` : ''}: ${ra.description}. Nothing has been withdrawn yet.`,
        suggestedAction: 'Add a dated note to the entry; no status change until the replacement is published.',
        requiresHumanDecision: false, caveats: ['Announcement only; the current guidance stands.'],
        links: [{ label: 'Evidence', url: r.sourceUrl }, ...links],
      });
    }

    // Archive declared — on the entry, or on a link the catalogue still labels current.
    let archiveDeclared = false;
    for (const r of usable.filter((x) => x.archived)) {
      const linkedVersion = r.observedUrl ? g.versions.find((v) => sameLink(v.url, r.observedUrl!)) : undefined;
      if (r.observedUrl && !linkedVersion) {
        push({signal:'conflicting-evidence',severity:'medium',quality:'unverified',provenance:[provenanceOf(r)],
          explanation:'This archive observation names a URL that does not exactly match a held version. It cannot establish the status of the catalogue document.',
          suggestedAction:'Compare the observed and held URLs before applying any status interpretation.',
          requiresHumanDecision:true,caveats:['No case, query or reserved-escape equivalence is assumed.']});
        continue;
      }
      const alreadyLabelled = linkedVersion ? /archiv|superseded|withdrawn|pre-/i.test(linkedVersion.label) : false;
      if (linkedVersion && alreadyLabelled) {
        push({
          signal: 'publisher-confirms-current', severity: 'info', quality: r.quality, provenance: [provenanceOf(r)],
          evidenceDate: r.lastUpdated ?? r.accessedAt,
          explanation: `The publisher lists the link "${linkedVersion.label}" as archived${r.statement ? ` ("${r.statement}")` : ''}, and the catalogue already labels it that way. Consistent.`,
          suggestedAction: 'No action needed.', requiresHumanDecision: false, caveats: [],
        });
        continue;
      }
      archiveDeclared = true;
      push({
        signal: 'archive-declared', severity: 'high', quality: r.quality, provenance: [provenanceOf(r)],
        evidenceDate: r.lastUpdated ?? r.accessedAt, catalogueDate: recorded ?? undefined,
        explanation: `The publisher marks ${linkedVersion ? `the link "${linkedVersion.label}"` : 'this document'} as archived/withdrawn${r.statement ? ` ("${r.statement}")` : ''}, while the catalogue presents it as current. No successor is named in this record.`,
        suggestedAction: 'Editor: read the publisher page; decide between archived (no successor) and superseded (successor found); record the wording. No automatic change.',
        requiresHumanDecision: true, caveats: [],
        links: [{ label: 'Evidence', url: r.sourceUrl }, ...links],
      });
    }

    // Publisher newer than the catalogue.
    const newest = last(usable.map((r) => r.lastUpdated ?? r.publishedDate).filter((x): x is string => !!x).sort());
    const newestRecord = usable.find((r) => (r.lastUpdated ?? r.publishedDate) === newest);
    const hasReplacement = usable.some((r) => r.replacedBy);
    if (newest && recorded && !hasReplacement) {
      const cmp = compareDates(newest, recorded);
      if (cmp > 0) {
        push({
          signal: 'publisher-newer-than-catalogue', severity: 'high', quality: newestRecord!.quality, provenance: [provenanceOf(newestRecord!)],
          evidenceDate: newest, catalogueDate: recorded,
          explanation: `The publisher's own dated field says ${newestRecord!.lastUpdated ? 'last updated' : 'published'} ${newest}; the catalogue's latest recorded date is ${recorded}${newestRecord!.statement ? ` — "${newestRecord!.statement}"` : ''}.`,
          suggestedAction: 'Editor: open the publisher page, confirm what changed, update the recorded date/version label, and re-read the summary if recommendations moved.',
          requiresHumanDecision: true, caveats: newestRecord!.quality !== 'confirmed' ? ['Evidence is not a direct publisher read.'] : [],
          links: [{ label: 'Evidence', url: newestRecord!.sourceUrl }, ...links],
        });
      } else if (cmp === 0 && !archiveDeclared && updatedValues.length <= 1) {
        push({
          signal: 'publisher-confirms-current', severity: 'info', quality: newestRecord!.quality, provenance: [provenanceOf(newestRecord!)],
          evidenceDate: newest, catalogueDate: recorded,
          explanation: `The dated observation (${newest}) agrees with the catalogue at their common recorded precision. This is not evidence of present clinical currency.`,
          suggestedAction: 'No date discrepancy identified; clinical review remains separate.', requiresHumanDecision: false, caveats: ['Agreement at recorded date precision only; no live check.'],
        });
      }
    } else if (newest && !recorded) {
      push({
        signal: 'publisher-newer-than-catalogue', severity: 'medium', quality: newestRecord!.quality, provenance: [provenanceOf(newestRecord!)],
        evidenceDate: newest,
        explanation: `The publisher states ${newest}; the catalogue records no machine-readable date for this entry, so the comparison cannot be made automatically.`,
        suggestedAction: 'Editor: record the publisher date in the entry, then re-evaluate.',
        requiresHumanDecision: true, caveats: ['Catalogue date unparseable.'],
        links: [{ label: 'Evidence', url: newestRecord!.sourceUrl }, ...links],
      });
    }

    // Publisher review date overdue (and not superseded by a later update).
    for (const r of usable.filter((x) => x.reviewDue)) {
      const due = r.reviewDue!;
      const laterUpdate = newest && compareDates(newest, due) > 0;
      if (compareDates(due, asOf) < 0 && !laterUpdate) {
        push({
          signal: 'review-overdue', severity: 'medium', quality: r.quality, provenance: [provenanceOf(r)],
          evidenceDate: due, catalogueDate: recorded ?? undefined,
          explanation: `The publisher's own anticipated review date (${due}) has passed as of ${asOf}, and no later update is recorded${r.statement ? ` — "${r.statement}"` : ''}. Overdue review is not withdrawal.`,
          suggestedAction: 'Editor: add a dated note; check the publisher for a republication; consider whether the summary needs a caveat.',
          requiresHumanDecision: true, caveats: [],
          links: [{ label: 'Evidence', url: r.sourceUrl }, ...links],
        });
      }
    }
  }

  // Evidence that names an entry the catalogue does not hold.
  for (const [id, records] of entryRecords) {
    if (byId.has(id)) continue;
    const r = records[0];
    signals.push({
      guidelineId: id, title: r.title ?? r.replacedBy?.title ?? id, provider: r.publisher,
      signal: 'evidence-for-unknown-entry', severity: 'medium', quality: r.quality, provenance: records.map(provenanceOf),
      evidenceDate: r.publishedDate ?? r.lastUpdated,
      explanation: 'The evidence snapshot carries a record for an identifier the catalogue does not hold. If it is a published replacement, it needs an entry.',
      suggestedAction: 'Editor: decide whether to create the entry through the normal queue.',
      requiresHumanDecision: true, caveats: r.stale ? ['The supplied observation is stale or invalid; verify its provenance before acting.'] : [],
      links: [{ label: 'Evidence', url: r.sourceUrl }],
    });
  }

  // Stable order: severity, then guideline id, then signal type, then evidence date.
  signals.sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]
    || a.guidelineId.localeCompare(b.guidelineId)
    || ALL_SIGNAL_TYPES.indexOf(a.signal) - ALL_SIGNAL_TYPES.indexOf(b.signal)
    || (a.evidenceDate ?? '').localeCompare(b.evidenceDate ?? ''));

  const countsBySignal = Object.fromEntries(ALL_SIGNAL_TYPES.map((t) => [t, 0])) as Record<FreshnessSignalType, number>;
  const countsByProvider: Record<string, number> = {};
  const countsBySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0, info: 0 };
  for (const s of signals) {
    countsBySignal[s.signal]++;
    countsByProvider[s.provider] = (countsByProvider[s.provider] ?? 0) + 1;
    countsBySeverity[s.severity]++;
  }

  const catalogueAsOf = options.catalogueAsOf ?? null;
  return {
    asOf,
    evidenceLabel: evidence?.label ?? null,
    evidenceGeneratedAt: evidence?.generatedAt ?? null,
    catalogueAsOf,
    catalogueOlderThanEvidence: !!(evidence && catalogueAsOf && compareDates(evidence.generatedAt, catalogueAsOf) > 0),
    signals,
    countsBySignal,
    countsByProvider,
    countsBySeverity,
    entriesEvaluated: guidelines.length,
    entriesWithSignals: new Set(signals.filter((s) => s.signal !== 'evidence-for-unknown-entry').map((s) => s.guidelineId)).size,
  };
}

// ─── Helpers for filtering (used by the dashboard and tests) ────────────────

export interface SignalFilter {
  provider?: string | null;
  signals?: FreshnessSignalType[] | null;
  quality?: EvidenceQuality | null;
  decisionOnly?: boolean;
}

export function filterSignals(signals: readonly FreshnessSignal[], f: SignalFilter): FreshnessSignal[] {
  return signals.filter((s) =>
    (!f.provider || s.provider === f.provider)
    && (!f.signals || f.signals.length === 0 || f.signals.includes(s.signal))
    && (!f.quality || s.quality === f.quality)
    && (!f.decisionOnly || s.requiresHumanDecision));
}

/**
 * A provider-scoped record applies to entries whose FIRST-LISTED publisher is
 * that provider ("BSSH", "BSSH (Trauma Committee)"), not to entries that merely
 * name it as a co-publisher ("GIRFT / BSSH"): a site-wide notice on bssh.ac.uk
 * says nothing about GIRFT-hosted pathways.
 */
export function samePublisher(evidencePublisher: string, catalogueSource: string): boolean {
  const a = evidencePublisher.toLowerCase().trim();
  const first = catalogueSource.toLowerCase().split('/')[0].trim();
  return first === a || first.startsWith(`${a} `) || first.startsWith(`${a}(`) || first.includes(`(${a})`);
}

/** Known publisher hostnames, for the "external link" heuristic only. */
const PROVIDER_HOSTS: Array<[RegExp, string]> = [
  [/\bnice\b/i, 'nice.org.uk'],
  [/\bboa\b|boast/i, 'boa.ac.uk'],
  [/\bbssh\b/i, 'bssh.ac.uk'],
  [/\bbofas\b/i, 'bofas.org.uk'],
  [/\bbess\b/i, 'bess.ac.uk'],
  [/sarcoma|\bbsg\b/i, 'britishsarcomagroup.org.uk'],
  [/\bebi\b/i, 'ebi.aomrc.org.uk'],
  [/girft/i, 'gettingitrightfirsttime.co.uk'],
];

export function providerHostOf(g: Guideline): string | null {
  // The first-listed publisher decides ("GIRFT / BSSH" is GIRFT-hosted); the
  // whole string is a fallback for labels such as "BOA (BOASt) with BOFAS".
  const first = g.source.split('/')[0];
  for (const [re, host] of PROVIDER_HOSTS) if (re.test(first)) return host;
  for (const [re, host] of PROVIDER_HOSTS) if (re.test(g.source)) return host;
  return null;
}

export function catalogueAsOfFrom(_guidelines: readonly Guideline[]): string | null {
  // Row check dates do not establish when a catalogue was exported. Callers
  // must supply actual snapshot metadata explicitly through catalogueAsOf.
  return null;
}
