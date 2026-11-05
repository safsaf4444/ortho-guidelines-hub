/**
 * scripts/lib/export-integrity.ts
 * ───────────────────────────────
 * Checks scripts/export-static.ts runs on the mapped catalogue BEFORE it
 * overwrites src/data/guidelines-data.ts — the file the public site falls back
 * to when the live database is unreachable.
 *
 * The export never sets a verification field itself (every value comes from
 * the row, through toGuideline). These checks stop it from PUBLISHING a claim
 * the row cannot back up:
 *   - a link shown as checked ('verified', labelled "Reachable") with no date
 *     of that check, or with no link to have checked;
 *   - a date that is not a calendar date, or lies in the future;
 *   - a link status outside the database's CHECK list;
 *   - two entries with one id (the static file would silently keep both).
 *
 * Pure: no I/O. Returns one human-readable line per problem; empty means clean.
 */
import type { Guideline } from '../../src/data/guidelines-data';

/** public.guidelines link_verification_status CHECK (supabase-migration-extend-link-verification-states.sql). */
export const LINK_VERIFICATION_STATES = new Set([
  'unchecked', 'verified', 'needs-review', 'broken', 'moved', 'withdrawn', 'superseded', 'blocked',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealUrl(u: string | undefined): boolean {
  if (!u || u === '#') return false;
  try {
    const p = new URL(u);
    return p.protocol === 'http:' || p.protocol === 'https:';
  } catch {
    return false;
  }
}

export function exportIntegrityProblems(rows: Guideline[], today = new Date().toISOString().slice(0, 10)): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const g of rows) {
    if (seen.has(g.id)) problems.push(`${g.id}: duplicate id`);
    seen.add(g.id);

    const status = g.linkVerificationStatus ?? 'unchecked';
    if (!LINK_VERIFICATION_STATES.has(status)) {
      problems.push(`${g.id}: unknown link status "${status}"`);
    }
    const date = g.linkLastVerified;
    if (date !== undefined && date !== '') {
      const parsed = Date.parse(`${date}T00:00:00Z`);
      if (!ISO_DATE.test(date) || Number.isNaN(parsed) || new Date(parsed).toISOString().slice(0,10) !== date) {
        problems.push(`${g.id}: link check date "${date}" is not a YYYY-MM-DD date`);
      } else if (date > today) {
        problems.push(`${g.id}: link check date ${date} is in the future`);
      }
    }
    if (status === 'verified') {
      if (!date) problems.push(`${g.id}: link shown as checked ("verified") with no date of the check`);
      if (!(g.versions ?? []).some((v) => isRealUrl(v.url))) {
        problems.push(`${g.id}: link shown as checked ("verified") but the entry has no http(s) link`);
      }
    }
  }
  return problems;
}
