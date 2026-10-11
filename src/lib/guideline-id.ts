/**
 * Proposing and validating a guideline's `id`.
 *
 * WHY THIS EXISTS. `guidelines.id` is a text primary key, it is the foreign
 * key `guideline_changelog.guideline_id` points at, and it would be the basis
 * of any future shareable link. It is effectively permanent: changing one
 * after publication means a migration that rewrites the changelog too.
 *
 * The 231 existing rows use readable slugs — `girft-bunions`,
 * `girft-shoulder-arthroscopy-rotator-cuff`. But a candidate approved from the
 * staging queue used to inherit `candidate-${candidateId}`, i.e.
 * `candidate-boa-new-guideline-3f9a1c4e7b22`: a content hash, meaningless to a
 * reader, and permanent. A manually added entry was no better — `new-001`.
 *
 * So the id is now PROPOSED here and REVIEWED by the editor before the first
 * save, rather than generated and frozen behind a read-only field.
 *
 * Nothing in this module ever changes an id that already exists. It only
 * proposes one for a row that has not been written yet, and validates what the
 * editor types. Existing ids are the collision set, never the target.
 */

/**
 * Lowercase alphanumeric words joined by single hyphens. Matches the shape of
 * the ids already in the catalogue, and is safe in a URL path without encoding.
 */
export const GUIDELINE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Long enough for `girft-shoulder-arthroscopy-rotator-cuff` (39) with room over. */
export const MAX_GUIDELINE_ID_LENGTH = 72;

/**
 * Text → slug. Deterministic, and never invents characters: accents are
 * decomposed to their base letter, `&` becomes the word "and" because dropping
 * it would silently merge two distinct titles, and every other run of
 * non-alphanumerics collapses to one hyphen.
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Trim to `max` without cutting a word in half, and never end on a hyphen. */
function truncateAtWord(slug: string, max: number): string {
  if (slug.length <= max) return slug;
  const cut = slug.slice(0, max);
  const lastHyphen = cut.lastIndexOf('-');
  // If there is no hyphen to cut at, a hard slice is the only option — better a
  // clipped word than an id that breaks the length limit.
  return (lastHyphen > 0 ? cut.slice(0, lastHyphen) : cut).replace(/-+$/, '');
}

/**
 * The first id of the form `base`, `base-2`, `base-3`… that nothing is using.
 *
 * Starts the suffix at 2, not 1: `boa-bunions` and `boa-bunions-1` reads as
 * though there were a part one and a part two, which is a claim about the
 * content. `-2` reads as what it is — the second thing to want that name.
 */
function firstAvailable(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; n <= 999; n++) {
    const suffixed = `${truncateAtWord(base, MAX_GUIDELINE_ID_LENGTH - String(n).length - 1)}-${n}`;
    if (!taken.has(suffixed)) return suffixed;
  }
  // 998 rows sharing one slug is not a real catalogue state. Returning the base
  // lets the database's unique constraint be the thing that complains, rather
  // than this function inventing an id nobody asked for.
  return base;
}

/**
 * Propose a readable, unique id from the provider and the guideline's title.
 *
 * `existingIds` must include EVERY id already in the table, archived rows
 * included — an archived row still occupies its primary key. The caller is
 * responsible for that; see the note in App.tsx, where the in-memory list is
 * deliberately archived-filtered for display and so is not a complete set.
 */
export function proposeGuidelineId(
  provider: string,
  topic: string,
  existingIds: Iterable<string>,
): string {
  const taken = existingIds instanceof Set ? existingIds : new Set(existingIds);
  const providerSlug = slugify(provider);
  let topicSlug = slugify(topic);

  // "BOA" + "BOA Standard for open fractures" should not become
  // `boa-boa-standard-for-open-fractures`.
  if (providerSlug && topicSlug.startsWith(`${providerSlug}-`)) {
    topicSlug = topicSlug.slice(providerSlug.length + 1);
  }

  const base = truncateAtWord(
    [providerSlug, topicSlug].filter(Boolean).join('-') || 'guideline',
    MAX_GUIDELINE_ID_LENGTH,
  );
  return firstAvailable(base, taken);
}

export type IdValidation = { ok: true } | { ok: false; error: string };

/**
 * Validate an id the editor typed, before it can be saved.
 *
 * `selfId` is the row's own current id, so re-saving an existing entry does not
 * report a collision with itself.
 */
export function validateGuidelineId(
  id: string,
  existingIds: Iterable<string>,
  selfId?: string,
): IdValidation {
  const trimmed = id.trim();
  if (!trimmed) return { ok: false, error: 'An ID is required.' };
  if (trimmed.length > MAX_GUIDELINE_ID_LENGTH) {
    return { ok: false, error: `Keep the ID to ${MAX_GUIDELINE_ID_LENGTH} characters or fewer.` };
  }
  if (!GUIDELINE_ID_PATTERN.test(trimmed)) {
    return {
      ok: false,
      error: 'Use lowercase letters, numbers and single hyphens only — for example boa-open-fractures.',
    };
  }
  const taken = existingIds instanceof Set ? existingIds : new Set(existingIds);
  if (trimmed !== selfId && taken.has(trimmed)) {
    return { ok: false, error: 'Another entry already uses that ID. Choose a different one.' };
  }
  return { ok: true };
}

/**
 * True for an id that is clearly still a machine placeholder.
 *
 * Deliberately a WARNING and not a validation failure: it is advice about
 * naming, not a correctness rule, and the 231 live rows must keep saving
 * whatever they are called. It exists so `new-001` and the old
 * `candidate-<hash>` shape cannot quietly become permanent.
 */
export function isPlaceholderGuidelineId(id: string): boolean {
  const trimmed = id.trim();
  return /^new-\d+$/.test(trimmed) || trimmed.startsWith('candidate-');
}
