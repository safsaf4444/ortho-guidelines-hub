/**
 * src/lib/search/normalise.ts
 * ───────────────────────────
 * Text normalisation for the search engine. Pure functions, no state.
 *
 * Deliberately small: lower-case, fold accents, split on anything that is not
 * a letter or digit, keep the joined form of hyphenated compounds alongside
 * the parts ("peri-prosthetic" → "peri", "prosthetic", "periprosthetic"),
 * fold a few British/American spellings, and singularise lightly.
 *
 * Nothing here knows about clinical meaning. Synonyms and abbreviations live
 * in terminology.ts so they can be reviewed as a list rather than hidden in
 * code.
 */

/** Words that carry no retrieval signal in guideline titles or queries. */
export const SEARCH_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'in', 'on', 'or', 'to', 'with', 'at',
  'by', 'from', 'into', 'after', 'before', 'without', 'vs', 'versus', 'incl',
  'guideline', 'guidelines', 'guidance',
]);

/**
 * British ↔ American spellings seen in orthopaedic titles. Both sides fold to
 * the first form so a query in either spelling matches a title in either.
 */
const SPELLING_FOLDS: ReadonlyArray<readonly [RegExp, string]> = [
  [/orthopedic/g, 'orthopaedic'],
  [/pediatric/g, 'paediatric'],
  [/hematol/g, 'haematol'],
  [/anesthe/g, 'anaesthe'],
  [/esophag/g, 'oesophag'],
  [/tumor/g, 'tumour'],
  [/hemorrhag/g, 'haemorrhag'],
];

/** Lower-case, strip diacritics, fold spellings, collapse whitespace. */
export function normaliseText(input: string | null | undefined): string {
  if (!input) return '';
  let s = input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’′]/g, "'")
    .replace(/[–—]/g, '-');
  for (const [pattern, replacement] of SPELLING_FOLDS) s = s.replace(pattern, replacement);
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Light singularisation. Only the regular English plurals that occur in this
 * domain; it must never turn one clinical word into another, so it is
 * deliberately conservative ("fractures" → "fracture", "injuries" → "injury",
 * "arthroses" is left alone).
 */
export function singularise(token: string): string {
  if (token.length <= 3) return token;
  if (/[^aeiou]ies$/.test(token)) return token.slice(0, -3) + 'y';
  if (/(ss|us|is|ous)$/.test(token)) return token;
  if (/(ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2);
  if (/s$/.test(token)) return token.slice(0, -1);
  return token;
}

/** A token with the word it was derived from, for explanations. */
export interface DetailedToken {
  /** Normalised, singularised token used for matching. */
  token: string;
  /** The word as it appeared after normalisation ("gtps", "fractures"). */
  raw: string;
}

/**
 * Tokenise normalised text, keeping the source word of each token.
 * Hyphenated compounds yield both the parts and the joined form
 * ("peri-prosthetic" → "peri", "prosthetic", "periprosthetic"); apostrophes
 * are removed ("dupuytren's" → "dupuytrens" → "dupuytren"). Stop-words are
 * dropped; tokens are singularised. Order is preserved and duplicates kept
 * so phrase checks can use positions; joined forms follow the base tokens.
 */
export function tokeniseDetailed(input: string | null | undefined): DetailedToken[] {
  const text = normaliseText(input);
  if (!text) return [];
  const out: DetailedToken[] = [];
  const seenJoined = new Set<string>();
  for (const m of text.matchAll(/[a-z0-9]+(?:-[a-z0-9]+)+/g)) {
    seenJoined.add(m[0].replace(/-/g, ''));
  }
  for (const raw of text.replace(/'/g, '').split(/[^a-z0-9]+/)) {
    if (!raw) continue;
    const t = singularise(raw);
    if (SEARCH_STOPWORDS.has(t) || SEARCH_STOPWORDS.has(raw)) continue;
    out.push({ token: t, raw });
  }
  for (const joined of seenJoined) {
    const t = singularise(joined);
    if (!out.some((d) => d.token === t)) out.push({ token: t, raw: joined });
  }
  return out;
}

/** Tokens only. See tokeniseDetailed. */
export function tokenise(input: string | null | undefined): string[] {
  return tokeniseDetailed(input).map((d) => d.token);
}

/** Distinct tokens as a Set, for membership tests. */
export function tokenSet(input: string | null | undefined): Set<string> {
  return new Set(tokenise(input));
}

/**
 * Optimal string alignment distance (Levenshtein with adjacent transposition),
 * capped: returns `max + 1` as soon as the distance is known to exceed `max`.
 * Used for limited typo tolerance only.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2: number[] = [];
  let prev: number[] = Array.from({ length: lb + 1 }, (_, j) => j);
  for (let i = 1; i <= la; i++) {
    const cur: number[] = new Array<number>(lb + 1).fill(0);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[lb] > max ? max + 1 : prev[lb];
}

/**
 * How many edits a query token may be from an indexed token before it stops
 * counting as a typo. Short tokens get none: "hip" vs "hop" is a different
 * word, not a misspelling.
 */
export function typoAllowance(token: string): number {
  if (token.length < 5) return 0;
  if (token.length < 8) return 1;
  return 2;
}
