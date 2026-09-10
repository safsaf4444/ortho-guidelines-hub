/**
 * scripts/log-gap.ts
 * ──────────────────
 * Appends one entry to the known-gaps register: reports/known-gaps.md.
 *
 * WHAT THE REGISTER IS FOR
 * An absent topic and a topic that was searched and found to have no published
 * UK guidance look identical in the catalogue — both are simply not there. Only
 * one of them is a finding. This register is what separates them: it records
 * that somebody looked, what they checked, and what they decided.
 *
 * APPEND-ONLY BY CONSTRUCTION
 * This script only ever appends a row. It has no edit or delete path, does not
 * rewrite existing lines, and refuses to run if the register's header is
 * missing (which would mean the file had been replaced rather than appended
 * to). Correcting an earlier entry means appending a new one that supersedes
 * it — the same discipline as the guideline changelog.
 *
 * NOT A DATABASE TABLE — this is a deliberate scope decision, see the note in
 * reports/known-gaps.md. A file keeps the register reviewable in a diff and
 * costs no schema, RLS policy or migration.
 *
 * Usage:
 *   npx tsx scripts/log-gap.ts \
 *     --topic "Paediatric septic arthritis of the hip" \
 *     --coverage not-covered \
 *     --evidence "Searched NICE, BOA BOASt index, BSCOS consensus list, RCEM" \
 *     --decision "No UK guidance found; BSCOS MSK infection consensus is nearest and is already indexed" \
 *     [--by "initials or name"]
 *
 * Writes nothing to the database. Touches exactly one file.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

const REPORTS_DIR = join(process.cwd(), 'reports');
const REGISTER = join(REPORTS_DIR, 'known-gaps.md');

/** Coverage verdicts. Kept small on purpose — a long list invites guessing. */
export const COVERAGE_STATUSES = [
  'covered',            // guidance exists and is already in the catalogue
  'partially-covered',  // something related is indexed, but not the topic asked for
  'not-covered',        // guidance exists somewhere but is not yet indexed here
  'no-uk-source',       // searched and found: no published UK guidance for this topic
] as const;

export type CoverageStatus = typeof COVERAGE_STATUSES[number];

export const HEADER = [
  '# Known-gaps register',
  '',
  'Append-only. One row per topic that was searched for and not found, or found',
  'only partially. Rows are added by `npx tsx scripts/log-gap.ts` and are never',
  'edited or deleted — to correct an entry, append a new row that supersedes it.',
  '',
  'This exists because an absent topic and a topic that was checked and found to',
  'have no published UK guidance look identical from the outside. Only the second',
  'is a finding, and only this file records the difference.',
  '',
  '**Coverage values:** `covered` · `partially-covered` · `not-covered` · `no-uk-source`',
  '',
  '**Why a file and not a database table:** deliberate. The register is editorial',
  'working-out rather than published content, it benefits from being reviewable in',
  'a diff, and it costs no schema change, RLS policy or migration. Revisit if it',
  'ever needs to be searchable from the app itself.',
  '',
  '| Date | Topic searched | Coverage | Evidence checked | Decision | By |',
  '| --- | --- | --- | --- | --- | --- |',
].join('\n');

/** Table cells cannot contain a raw pipe or newline without breaking the row. */
export function cell(text: string): string {
  return text.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim();
}

export function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) { out[key] = 'true'; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

export function buildRow(fields: {
  date: string; topic: string; coverage: CoverageStatus;
  evidence: string; decision: string; by: string;
}): string {
  return `| ${cell(fields.date)} | ${cell(fields.topic)} | \`${fields.coverage}\` | ` +
    `${cell(fields.evidence)} | ${cell(fields.decision)} | ${cell(fields.by)} |`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const missing = ['topic', 'coverage', 'evidence', 'decision'].filter((k) => !args[k] || args[k] === 'true');
  if (missing.length) {
    console.error(
      `\nMissing required argument(s): ${missing.join(', ')}\n\n` +
        'Every field is required. A gap entry without the evidence that was checked,\n' +
        'or without a decision, records that someone looked but not what they found —\n' +
        'which is the thing this register exists to capture.\n\n' +
        'Usage:\n  npx tsx scripts/log-gap.ts --topic "..." --coverage no-uk-source \\\n' +
        '    --evidence "what you searched" --decision "what you concluded" [--by "you"]\n',
    );
    process.exit(1);
  }

  const coverage = args.coverage as CoverageStatus;
  if (!COVERAGE_STATUSES.includes(coverage)) {
    console.error(`\nUnknown coverage "${args.coverage}". Use one of: ${COVERAGE_STATUSES.join(', ')}\n`);
    process.exit(1);
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });

  let existing = existsSync(REGISTER) ? readFileSync(REGISTER, 'utf8') : '';
  if (!existing.trim()) {
    existing = HEADER;
  } else if (!existing.includes('| Date | Topic searched |')) {
    // Refuse rather than append into a file we do not recognise: silently
    // writing a table row into the wrong file loses the entry.
    console.error(
      `\n${REGISTER} exists but has no register header.\n` +
        'Refusing to append in case this is the wrong file. Move it aside and re-run.\n',
    );
    process.exit(1);
  }

  const row = buildRow({
    date: new Date().toISOString().slice(0, 10),
    topic: args.topic,
    coverage,
    evidence: args.evidence,
    decision: args.decision,
    by: args.by && args.by !== 'true' ? args.by : 'unattributed',
  });

  writeFileSync(REGISTER, existing.replace(/\s*$/, '') + '\n' + row + '\n');
  console.log(`\nAppended to ${REGISTER}:\n  ${row}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) main();
