/**
 * scripts/map-link-status.ts
 * ──────────────────────────
 * REPORT ONLY — proposes `linkVerificationStatus` changes from a dead-link CSV.
 *
 * ─── WRITES NOTHING TO THE DATABASE ─────────────────────────────────────────
 * There is NO Supabase client in this file and no credentials are read, so it
 * cannot reach the database even by accident. It does not modify guideline
 * data, the static dataset, or any git-tracked file. It prints a diff and
 * writes one timestamped report under reports/ (gitignored).
 *
 * Why a conservative merge rather than a straight overwrite:
 *   Every one of the 231 live rows carries a dated, human-written
 *   link_verification_notes value from real content-verification passes. An
 *   HTTP status check is a WEAKER signal than human verification — notably
 *   flag-dead-links.ts itself documents that a WAF block "is NOT proof the
 *   link is dead". So a bot-block never downgrades a human verdict here.
 *
 * Verdict -> status mapping (per URL):
 *   OK             -> verified
 *   CLIENT_ERROR   -> broken        (4xx, hard evidence the target is gone)
 *   DNS_FAILURE    -> broken        (host does not resolve)
 *   SERVER_ERROR   -> needs-review  (5xx may be transient)
 *   TIMEOUT        -> needs-review  (may be transient)
 *   BLOCKED_WAF    -> (no opinion)  existing human status is preserved
 *   KNOWN_BLOCKED  -> (no opinion)  no request was made at all
 *
 * An entry has many URLs (versions[]). The worst verdict wins:
 *   broken > needs-review > verified > (no opinion)
 * An entry whose URLs are ALL "no opinion" is left completely untouched.
 */
import { join } from 'path';
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { pathToFileURL } from 'url';

import { GUIDELINES_DATA } from '../src/data/guidelines-data';

const REPORTS_DIR = join(process.cwd(), 'reports');

export type Verdict =
  | 'OK' | 'CLIENT_ERROR' | 'SERVER_ERROR' | 'TIMEOUT'
  | 'DNS_FAILURE' | 'BLOCKED_WAF' | 'KNOWN_BLOCKED';

/** The schema's check constraint on link_verification_status. */
export type LinkStatus = 'unchecked' | 'needs-review' | 'broken' | 'verified';

/** null = the checker has no opinion; never overrides a human verdict. */
export function verdictToStatus(v: Verdict): LinkStatus | null {
  switch (v) {
    case 'OK': return 'verified';
    case 'CLIENT_ERROR':
    case 'DNS_FAILURE': return 'broken';
    case 'SERVER_ERROR':
    case 'TIMEOUT': return 'needs-review';
    case 'BLOCKED_WAF':
    case 'KNOWN_BLOCKED': return null;
    default: return null;
  }
}

const SEVERITY: Record<LinkStatus, number> = {
  'broken': 3, 'needs-review': 2, 'verified': 1, 'unchecked': 0,
};

/** Worst-wins across an entry's URLs. null when no URL yielded an opinion. */
export function worstStatus(list: (LinkStatus | null)[]): LinkStatus | null {
  let out: LinkStatus | null = null;
  for (const s of list) {
    if (s === null) continue;
    if (out === null || SEVERITY[s] > SEVERITY[out]) out = s;
  }
  return out;
}

/** Minimal RFC4180 parser — fields may contain commas, quotes and newlines. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r[0] ?? '') !== '');
}

export function newestReport(dir: string): string | null {
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter(f => /^dead-links-.*\.csv$/.test(f)).sort();
  return files.length ? join(dir, files[files.length - 1]) : null;
}

export interface Proposal {
  id: string;
  topic: string;
  source: string;
  current: string;
  proposed: LinkStatus;
  evidence: string[];
}

export function buildProposals(
  csvRows: string[][],
  data: readonly { id: string; topic: string; source: string; linkVerificationStatus?: string }[],
): { proposals: Proposal[]; unchanged: number; noOpinion: number } {
  const header = csvRows[0] ?? [];
  const col = (n: string) => header.indexOf(n);
  const iId = col('guideline_id');
  const iVerdict = col('verdict');
  const iUrl = col('url');
  const iDetail = col('detail');

  const byId = new Map<string, { status: LinkStatus | null; note: string }[]>();
  for (const r of csvRows.slice(1)) {
    const id = r[iId];
    if (!id) continue;
    const verdict = r[iVerdict] as Verdict;
    const status = verdictToStatus(verdict);
    const list = byId.get(id) ?? [];
    list.push({ status, note: `${verdict} ${r[iDetail] ?? ''} ${r[iUrl] ?? ''}`.trim() });
    byId.set(id, list);
  }

  const proposals: Proposal[] = [];
  let unchanged = 0;
  let noOpinion = 0;
  for (const row of data) {
    const checks = byId.get(row.id);
    if (!checks || checks.length === 0) continue;
    const proposed = worstStatus(checks.map(c => c.status));
    if (proposed === null) { noOpinion++; continue; }
    const current = row.linkVerificationStatus ?? 'unchecked';
    if (current === proposed) { unchanged++; continue; }
    proposals.push({
      id: row.id,
      topic: row.topic,
      source: row.source,
      current,
      proposed,
      evidence: checks.filter(c => c.status === proposed).map(c => c.note),
    });
  }
  return { proposals, unchanged, noOpinion };
}

function main() {
  const csvPath = process.argv[2] ?? newestReport(REPORTS_DIR);
  if (!csvPath) {
    console.error('No dead-link CSV found. Run `npm run flag-dead-links` first.');
    process.exit(1);
  }
  console.log(`\nReading verdicts from: ${csvPath}`);
  const rows = parseCsv(readFileSync(csvPath, 'utf-8'));
  const { proposals, unchanged, noOpinion } = buildProposals(rows, GUIDELINES_DATA);

  console.log('\n──────── Proposed linkVerificationStatus changes (REPORT ONLY) ────────');
  console.log(`  Entries in dataset            : ${GUIDELINES_DATA.length}`);
  console.log(`  Already correct (no change)   : ${unchanged}`);
  console.log(`  Untouched (checker no opinion): ${noOpinion}`);
  console.log(`  PROPOSED CHANGES              : ${proposals.length}\n`);
  for (const p of proposals) {
    console.log(`  [${p.id}]  ${p.current} -> ${p.proposed}`);
    console.log(`      ${p.topic}  (${p.source})`);
    for (const e of p.evidence) console.log(`      - ${e}`);
  }
  if (proposals.length === 0) console.log('  (none)');

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = join(REPORTS_DIR, `link-status-proposal-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ source: csvPath, proposals }, null, 2), 'utf-8');
  console.log(`\n  Machine-readable proposal: ${outPath}`);
  console.log('  Nothing was written to the database or the static dataset.\n');
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) main();
