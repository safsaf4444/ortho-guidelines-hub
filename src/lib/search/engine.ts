/**
 * src/lib/search/engine.ts
 * ────────────────────────
 * Pure, deterministic guideline search.
 *
 *   const index = buildSearchIndex(records);
 *   const results = searchIndex(index, 'THR infection');
 *
 * What it does, in order:
 *   1. Normalises and tokenises the query (normalise.ts).
 *   2. Groups query tokens into concepts using the terminology dictionary
 *      (terminology.ts): "total hip replacement" becomes one group whose
 *      alternatives include "thr" and "hip arthroplasty"; a token the
 *      dictionary does not know becomes a group of one.
 *   3. Scores every record: each group earns the best score any of its
 *      alternatives achieves in any field (title 3.0, publisher 2.0,
 *      section 1.5, summary 1.0, sub-group/type 0.5), discounted for
 *      related terms (×0.5), prefix matches (×0.7) and typo matches (×0.6 or
 *      ×0.5). Word order never matters for group matching.
 *   4. Adds a phrase bonus when the query is the whole title (+8) or appears
 *      verbatim inside it (+4), and a small status adjustment (current +0.3,
 *      superseded/archived −0.3, …) that only decides near-ties.
 *   5. Keeps records that match at least half of the query's groups
 *      (`minCoverage`), ranks by coverage, then score, then fixed
 *      tie-breaks, and returns an explanation with every result.
 *
 * What it never does: hide archived or superseded records (they are
 * returned with their status exposed), change any record, call the network,
 * or produce clinical content. Ranking explanations are data for tests and
 * for a future UI, not advice.
 */
import { editDistance, normaliseText, tokenise, tokeniseDetailed, typoAllowance } from './normalise';
import { TERMINOLOGY, type TermEntry } from './terminology';

// ─── Records ─────────────────────────────────────────────────────────────────

/**
 * The subset of a catalogue record the engine reads. `Guideline` from
 * src/data/guidelines-data.ts satisfies it; so does any object with an id and
 * a topic. Every other field is optional and missing fields are treated as
 * empty, never as errors.
 */
export interface SearchableRecord {
  id: string;
  topic: string;
  summary?: string | null;
  source?: string | null;
  section?: string | null;
  crossListedIn?: readonly string[] | null;
  subGroup?: string | null;
  type?: string | null;
  guidanceStatus?: string | null;
  archived?: boolean | null;
  priority?: 'high' | 'medium' | 'low' | null;
}

export type SearchField = 'title' | 'source' | 'section' | 'summary' | 'subGroup';

export const FIELD_WEIGHTS: Readonly<Record<SearchField, number>> = {
  title: 3.0,
  source: 2.0,
  section: 1.5,
  summary: 1.0,
  subGroup: 0.5,
};

/** Fields where prefix and typo matching are allowed. Summary text is too long and too varied. */
const FUZZY_FIELDS: ReadonlySet<SearchField> = new Set<SearchField>(['title', 'source', 'section']);

export type MatchVia = 'exact' | 'synonym' | 'related' | 'prefix' | 'typo';

const VIA_FACTOR: Readonly<Record<'exact' | 'synonym' | 'related', number>> = {
  exact: 1.0,
  synonym: 1.0,
  related: 0.5,
};
const PREFIX_FACTOR = 0.7;
const TYPO_FACTOR: Readonly<Record<1 | 2, number>> = { 1: 0.6, 2: 0.5 };
const PHRASE_BONUS_EXACT_TITLE = 8;
const PHRASE_BONUS_IN_TITLE = 4;
const MIN_PHRASE_LENGTH = 4;

// ─── Status ──────────────────────────────────────────────────────────────────

/**
 * Status adjustment. Small on purpose: a single title-term match is worth
 * 3.0, so status can reorder results of comparable relevance but can never
 * lift an irrelevant current record above a relevant superseded one.
 *
 * `archived` here means the record's `archived` flag or a guidanceStatus of
 * 'archived'. Neither hides the record.
 */
export const STATUS_ADJUSTMENTS: Readonly<Record<string, number>> = {
  current: 0.3,
  'needs-review': 0.0,
  'link-unavailable': -0.1,
  'no-source-identified': -0.2,
  superseded: -0.3,
  archived: -0.3,
};

/** Fixed order for tie-breaking: lower sorts first. */
const STATUS_RANK: Readonly<Record<string, number>> = {
  current: 0,
  'needs-review': 1,
  'link-unavailable': 2,
  'no-source-identified': 3,
  superseded: 4,
  archived: 5,
};

const PRIORITY_RANK: Readonly<Record<string, number>> = { high: 0, medium: 1, low: 2 };

export interface StatusNote {
  /** guidanceStatus as stored, or 'unknown' when the record has none. */
  guidanceStatus: string;
  /** The record's archived flag (or guidanceStatus 'archived'). */
  archived: boolean;
  /** The adjustment applied to the score. */
  adjustment: number;
  /** One line for a reviewer or a UI badge. Never clinical advice. */
  note: string;
}

function effectiveStatus(r: SearchableRecord): string {
  if (r.archived) return 'archived';
  const s = (r.guidanceStatus ?? '').trim();
  return s || 'unknown';
}

function statusNote(r: SearchableRecord): StatusNote {
  const status = effectiveStatus(r);
  const adjustment = STATUS_ADJUSTMENTS[status] ?? 0;
  const notes: Record<string, string> = {
    current: 'Catalogue labels this record current; this is a stored status, not independent clinical validation.',
    'needs-review': 'Flagged for editorial review — shown, not hidden.',
    'link-unavailable': 'Source link currently unavailable — the guidance itself may still be current.',
    'no-source-identified': 'No published UK source identified for this topic.',
    superseded: 'Superseded — kept for reference; a newer document applies.',
    archived: 'Archived — kept for reference and still searchable.',
    unknown: 'Status not recorded.',
  };
  return { guidanceStatus: status, archived: Boolean(r.archived) || status === 'archived', adjustment, note: notes[status] ?? notes.unknown };
}

// ─── Index ───────────────────────────────────────────────────────────────────

interface IndexedField {
  tokens: readonly string[];
  set: ReadonlySet<string>;
}

interface IndexedRecord {
  record: SearchableRecord;
  normalisedTitle: string;
  fields: Readonly<Record<SearchField, IndexedField>>;
}

export interface SearchIndex {
  readonly records: readonly IndexedRecord[];
  /** token → record positions that hold it in a fuzzy-eligible field. */
  readonly vocabulary: ReadonlyMap<string, ReadonlySet<number>>;
  /**
   * Every token in every field. A query token found here is spelled the way
   * the catalogue spells it, so prefix and typo matching are switched off for
   * it: "bunion" must not also match "union", and "hip" must not match "hips"
   * by edit distance when the catalogue already contains "hip".
   */
  readonly allTokens: ReadonlySet<string>;
}

function field(text: string | null | undefined): IndexedField {
  const tokens = tokenise(text ?? '');
  return { tokens, set: new Set(tokens) };
}

/** Build an index once per catalogue. Pure; the records are not mutated. */
export function buildSearchIndex(records: readonly SearchableRecord[]): SearchIndex {
  const vocabulary = new Map<string, Set<number>>();
  const allTokens = new Set<string>();
  const indexed = records.map((record, position) => {
    const sectionText = [record.section ?? '', ...(record.crossListedIn ?? [])].join(' ');
    const fields: Record<SearchField, IndexedField> = {
      title: field(record.topic),
      source: field(record.source),
      section: field(sectionText),
      summary: field(record.summary),
      subGroup: field([record.subGroup ?? '', record.type ?? ''].join(' ')),
    };
    for (const f of Object.keys(fields) as SearchField[]) for (const t of fields[f].set) allTokens.add(t);
    for (const f of FUZZY_FIELDS) {
      for (const t of fields[f].set) {
        let s = vocabulary.get(t);
        if (!s) {
          s = new Set<number>();
          vocabulary.set(t, s);
        }
        s.add(position);
      }
    }
    return { record, normalisedTitle: normaliseText(record.topic), fields };
  });
  return { records: indexed, vocabulary, allTokens };
}

// ─── Query analysis ──────────────────────────────────────────────────────────

interface Alternative {
  tokens: readonly string[];
  label: string;
  via: 'exact' | 'synonym' | 'related';
  entryId?: string;
}

export interface QueryGroup {
  /** The query words this group covers, as typed (normalised). */
  text: string;
  tokens: readonly string[];
  alternatives: readonly Alternative[];
}

interface TermPhrase {
  entry: TermEntry;
  tokens: readonly string[];
  label: string;
  via: 'synonym' | 'related';
}

let phraseCache: TermPhrase[] | null = null;

/** Every dictionary phrase, tokenised once. Sorted longest-first so greedy matching prefers specific phrases. */
function termPhrases(): TermPhrase[] {
  if (phraseCache) return phraseCache;
  const out: TermPhrase[] = [];
  for (const entry of TERMINOLOGY) {
    for (const s of entry.synonyms) {
      const tokens = tokenise(s);
      if (tokens.length) out.push({ entry, tokens, label: s, via: 'synonym' });
    }
    for (const s of entry.related ?? []) {
      const tokens = tokenise(s);
      if (tokens.length) out.push({ entry, tokens, label: s, via: 'related' });
    }
  }
  out.sort((a, b) => b.tokens.length - a.tokens.length || a.label.localeCompare(b.label));
  phraseCache = out;
  return out;
}

function sameTokens(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((t, i) => t === b[i]);
}

/**
 * Split query tokens into concept groups. Greedy, longest dictionary phrase
 * first, left to right; a token no phrase covers becomes its own group.
 * Only SYNONYM phrases can anchor a group (a related term typed by the user
 * is matched as itself); related terms are added as weaker alternatives.
 */
export function analyseQuery(query: string): QueryGroup[] {
  const detailed = tokeniseDetailed(query);
  const tokens = detailed.map((d) => d.token);
  const rawText = (from: number, to: number) => detailed.slice(from, to).map((d) => d.raw).join(' ');
  const groups: QueryGroup[] = [];
  const phrases = termPhrases();
  let i = 0;
  while (i < tokens.length) {
    let best: TermPhrase | null = null;
    for (const p of phrases) {
      if (p.via !== 'synonym') continue;
      if (p.tokens.length > tokens.length - i) continue;
      let ok = true;
      for (let k = 0; k < p.tokens.length; k++) {
        if (tokens[i + k] !== p.tokens[k]) { ok = false; break; }
      }
      if (ok) { best = p; break; }
    }
    if (best) {
      const span = tokens.slice(i, i + best.tokens.length);
      const alternatives: Alternative[] = [{ tokens: span, label: span.join(' '), via: 'exact' }];
      const seen = new Set<string>([span.join(' ')]);
      for (const p of phrases) {
        if (p.entry.id !== best.entry.id) continue;
        const key = p.tokens.join(' ');
        if (seen.has(key)) continue;
        seen.add(key);
        alternatives.push({ tokens: p.tokens, label: p.label, via: p.via, entryId: p.entry.id });
      }
      groups.push({ text: rawText(i, i + best.tokens.length), tokens: span, alternatives });
      i += best.tokens.length;
    } else {
      const span = [tokens[i]];
      groups.push({ text: rawText(i, i + 1), tokens: span, alternatives: [{ tokens: span, label: tokens[i], via: 'exact' }] });
      i += 1;
    }
  }
  // Merge accidental duplicate groups ("hip hip") so coverage is not inflated.
  const merged: QueryGroup[] = [];
  for (const g of groups) {
    if (!merged.some((m) => sameTokens(m.tokens, g.tokens))) merged.push(g);
  }
  return merged;
}

// ─── Matching ────────────────────────────────────────────────────────────────

interface TokenMatch {
  strength: number;
  matchedToken: string;
  via: 'exact' | 'prefix' | 'typo';
}

function matchToken(token: string, f: IndexedField, allowFuzzy: boolean): TokenMatch | null {
  if (f.set.has(token)) return { strength: 1, matchedToken: token, via: 'exact' };
  if (!allowFuzzy) return null;
  let best: TokenMatch | null = null;
  if (token.length >= 4) {
    for (const t of f.tokens) {
      if (t.length > token.length && t.startsWith(token)) {
        if (!best || t < best.matchedToken) best = { strength: PREFIX_FACTOR, matchedToken: t, via: 'prefix' };
      }
    }
    if (best) return best;
  }
  const allowance = typoAllowance(token);
  if (allowance > 0) {
    let bestDistance = allowance + 1;
    for (const t of f.tokens) {
      if (t.length < 4) continue;
      const d = editDistance(token, t, allowance);
      if (d <= allowance && (d < bestDistance || (d === bestDistance && best && t < best.matchedToken))) {
        bestDistance = d;
        best = { strength: TYPO_FACTOR[d as 1 | 2], matchedToken: t, via: 'typo' };
      }
    }
  }
  return best;
}

export interface MatchDetail {
  /** The query words (normalised) this match satisfies. */
  term: string;
  /** What was actually found in the record. */
  matchedAs: string;
  via: MatchVia;
  field: SearchField;
  /** Points contributed to the score. */
  points: number;
  /** Terminology entry used, when a synonym or related term matched. */
  entryId?: string;
}

function bestGroupMatch(group: QueryGroup, rec: IndexedRecord, knownTokens: ReadonlySet<string>, allowRelated: boolean): MatchDetail | null {
  let best: MatchDetail | null = null;
  for (const alt of group.alternatives) {
    if (!allowRelated && alt.via === 'related') continue;
    for (const fieldName of Object.keys(FIELD_WEIGHTS) as SearchField[]) {
      const f = rec.fields[fieldName];
      const fuzzyField = FUZZY_FIELDS.has(fieldName) && alt.via === 'exact';
      let strength = 1;
      let via: MatchVia = alt.via;
      const matchedTokens: string[] = [];
      let ok = true;
      for (const t of alt.tokens) {
        // Prefix/typo matching only for tokens the catalogue never uses as typed.
        const m = matchToken(t, f, fuzzyField && !knownTokens.has(t));
        if (!m) { ok = false; break; }
        matchedTokens.push(m.matchedToken);
        if (m.strength < strength) strength = m.strength;
        if (m.via !== 'exact') via = m.via;
      }
      if (!ok) continue;
      const viaFactor = alt.via === 'related' ? VIA_FACTOR.related : 1;
      const points = FIELD_WEIGHTS[fieldName] * strength * viaFactor;
      if (!best || best.via === 'related' && via !== 'related'
          || (best.via === 'related') === (via === 'related') && points > best.points) {
        best = {
          term: group.text,
          matchedAs: matchedTokens.join(' '),
          via,
          field: fieldName,
          points,
          ...(alt.entryId ? { entryId: alt.entryId } : {}),
        };
      }
    }
  }
  return best;
}

// ─── Results ─────────────────────────────────────────────────────────────────

export type PhraseMatch = 'exact-title' | 'title-phrase' | null;

export interface SearchResult {
  id: string;
  record: SearchableRecord;
  /** Final score, including phrase bonus and status adjustment. */
  score: number;
  /** Fraction of query concept groups matched, 0–1. */
  coverage: number;
  /** True when not every concept in the query was found. */
  partial: boolean;
  phrase: PhraseMatch;
  matches: readonly MatchDetail[];
  /** Query concepts that found nothing in this record. */
  unmatched: readonly string[];
  status: StatusNote;
  /** Human-readable ranking explanation, one line per factor. */
  explanation: readonly string[];
}

export interface SearchOptions {
  /** Maximum results to return. Default: all that qualify. */
  limit?: number;
  /** Minimum fraction of query concepts a record must match. Default 0.5. */
  minCoverage?: number;
  /** Related concepts are suggestions, not equivalent full matches. Public search disables them. */
  allowRelated?: boolean;
}

const DEFAULT_MIN_COVERAGE = 0.5;

function explain(groups: readonly QueryGroup[], matches: readonly MatchDetail[], unmatched: readonly string[], phrase: PhraseMatch, status: StatusNote): string[] {
  const lines: string[] = [];
  if (phrase === 'exact-title') lines.push(`Query matches the whole title (+${PHRASE_BONUS_EXACT_TITLE}).`);
  else if (phrase === 'title-phrase') lines.push(`Query appears verbatim in the title (+${PHRASE_BONUS_IN_TITLE}).`);
  for (const m of matches) {
    const how =
      m.via === 'exact' ? 'exact' :
      m.via === 'synonym' ? `synonym "${m.matchedAs}"` :
      m.via === 'related' ? `related term "${m.matchedAs}" (half weight)` :
      m.via === 'prefix' ? `prefix of "${m.matchedAs}"` :
      `near-match "${m.matchedAs}" (typo tolerance)`;
    lines.push(`"${m.term}" → ${m.field}: ${how} (+${m.points.toFixed(2)}).`);
  }
  for (const u of unmatched) lines.push(`"${u}" not found in this record.`);
  if (groups.length > 1 && unmatched.length) lines.push(`Partial match: ${groups.length - unmatched.length} of ${groups.length} concepts.`);
  lines.push(`Status ${status.guidanceStatus}${status.archived ? ' (archived)' : ''}: ${status.adjustment >= 0 ? '+' : ''}${status.adjustment.toFixed(1)}. ${status.note}`);
  return lines;
}

function compareResults(a: SearchResult, b: SearchResult): number {
  if (a.partial !== b.partial) return a.partial ? 1 : -1;
  if (b.coverage !== a.coverage) return b.coverage - a.coverage;
  if (b.score !== a.score) return b.score - a.score;
  const sa = STATUS_RANK[a.status.guidanceStatus] ?? 9;
  const sb = STATUS_RANK[b.status.guidanceStatus] ?? 9;
  if (sa !== sb) return sa - sb;
  const pa = PRIORITY_RANK[a.record.priority ?? ''] ?? 3;
  const pb = PRIORITY_RANK[b.record.priority ?? ''] ?? 3;
  if (pa !== pb) return pa - pb;
  const ta = normaliseText(a.record.topic);
  const tb = normaliseText(b.record.topic);
  if (ta !== tb) return ta < tb ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Search a prebuilt index. An empty or stop-word-only query returns no
 * results (the caller decides whether that means "show everything").
 */
export function searchIndex(index: SearchIndex, query: string, options: SearchOptions = {}): SearchResult[] {
  const groups = analyseQuery(query);
  if (groups.length === 0) return [];
  const minCoverage = options.minCoverage ?? DEFAULT_MIN_COVERAGE;
  const phraseText = normaliseText(query);
  const results: SearchResult[] = [];

  for (const rec of index.records) {
    const matches: MatchDetail[] = [];
    const unmatched: string[] = [];
    let score = 0;
    for (const g of groups) {
      const m = bestGroupMatch(g, rec, index.allTokens, options.allowRelated !== false);
      if (m) { matches.push(m); score += m.points; } else unmatched.push(g.text);
    }
    const coverage = (groups.length - unmatched.length) / groups.length;
    if (coverage === 0) continue;
    if (groups.length === 1 && coverage < 1) continue;
    if (coverage < minCoverage) continue;

    let phrase: PhraseMatch = null;
    if (phraseText.length >= MIN_PHRASE_LENGTH || groups.length > 1) {
      if (rec.normalisedTitle === phraseText) { phrase = 'exact-title'; score += PHRASE_BONUS_EXACT_TITLE; }
      else if (phraseText.length >= MIN_PHRASE_LENGTH && rec.normalisedTitle.includes(phraseText)) { phrase = 'title-phrase'; score += PHRASE_BONUS_IN_TITLE; }
    }
    const status = statusNote(rec.record);
    score += status.adjustment;
    results.push({
      id: rec.record.id,
      record: rec.record,
      score: Math.round(score * 1000) / 1000,
      coverage,
      partial: coverage < 1 || matches.some(match => match.via === 'related'),
      phrase,
      matches,
      unmatched,
      status,
      explanation: explain(groups, matches, unmatched, phrase, status),
    });
  }

  results.sort(compareResults);
  return typeof options.limit === 'number' ? results.slice(0, Math.max(0, options.limit)) : results;
}

const indexCache = new WeakMap<object, {index:SearchIndex;signature:string;references:readonly SearchableRecord[]}>();

/**
 * Convenience for callers that hold a records array: builds (and caches, per
 * array identity) the index, then searches it.
 */
export function searchGuidelines<T extends SearchableRecord>(records: readonly T[], query: string, options?: SearchOptions): SearchResult[] {
  const signature = JSON.stringify(records.map(r=>[r.id,r.topic,r.summary,r.source,r.section,r.crossListedIn,r.subGroup,r.type,r.guidanceStatus,r.archived,r.priority]));
  let cached = indexCache.get(records);
  if (!cached || cached.signature !== signature || records.some((record,i)=>record !== cached!.references[i])) {
    cached = {index:buildSearchIndex(records),signature,references:[...records]};
    indexCache.set(records,cached);
  }
  return searchIndex(cached.index, query, options);
}
