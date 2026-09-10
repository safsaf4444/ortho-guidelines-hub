/**
 * Change notes — the audit trail for a site anyone can edit.
 *
 * Editing is public and unauthenticated (see SECURITY.md), so there is no
 * account to attribute a change to. A required note is what replaces that:
 * every write should leave behind a record of WHAT changed and WHY, even
 * though we can never know WHO.
 *
 * This module is deliberately free of Vite and browser dependencies so the
 * validation can be exercised offline by scripts/tests/change-note.test.ts —
 * the same split used elsewhere in src/lib for testable pure logic.
 *
 * The database enforces the non-empty rule too, via the
 * guideline_changelog_description_not_blank CHECK constraint, so a direct API
 * caller cannot post a blank note either. What the constraint CANNOT enforce
 * is that a guideline write is accompanied by a note at all — see SECURITY.md.
 */

/** Notes are capped so one caller cannot dump unbounded text into the log. */
export const MAX_NOTE_LENGTH = 500;

export type PreparedNote =
  | { ok: true; note: string }
  | { ok: false; error: string };

/**
 * Validate and normalise a user-typed change note.
 *
 * Trims first, so a whitespace-only note is rejected rather than stored as
 * blank — matching the database's `btrim` check exactly, so the UI and the
 * constraint can never disagree about what counts as empty.
 */
export function prepareChangeNote(raw: string | null | undefined): PreparedNote {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { ok: false, error: 'Describe what you changed — a note is required.' };
  }
  if (trimmed.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Note is too long (${trimmed.length}/${MAX_NOTE_LENGTH} characters).` };
  }
  return { ok: true, note: trimmed };
}

/** True when a note would be accepted — for enabling/disabling a Save button. */
export function isValidChangeNote(raw: string | null | undefined): boolean {
  return prepareChangeNote(raw).ok;
}

// ─── Automatic notes ─────────────────────────────────────────────────────────
// Some writes are single-click actions where demanding typed prose would be
// hostile (setting a link status) or where the app already knows exactly what
// happened (archiving, merging). Those generate their own note instead, so the
// invariant "every write leaves a changelog entry" still holds. They are
// prefixed so an automatic note is distinguishable from a human-written one.

const AUTO = 'Automatic:';

export function archiveNote(topic: string): string {
  return `${AUTO} archived "${topic}". The entry is hidden from the site but not deleted, and can be restored.`;
}

export function linkStatusNote(statusLabel: string, date: string): string {
  return `${AUTO} link status set to "${statusLabel}" on ${date}.`;
}

export function mergeNote(intoTopic: string, fromTopic: string): string {
  return `${AUTO} merged "${fromTopic}" into "${intoTopic}"; the merged-from entry was archived, not deleted.`;
}

export function isAutomaticNote(note: string): boolean {
  return note.startsWith(AUTO);
}
