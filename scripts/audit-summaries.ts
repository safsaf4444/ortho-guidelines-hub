/**
 * scripts/audit-summaries.ts
 * ──────────────────────────
 * REPORT ONLY — flags summaries that read as clinical instructions rather than
 * as "here is which document you want".
 *
 * ─── CHANGES NOTHING ────────────────────────────────────────────────────────
 * No Supabase client, no credentials, no writes to guideline data or the static
 * dataset. It reads GUIDELINES_DATA and writes one timestamped file under
 * reports/. Nothing is rewritten automatically, and deliberately so: turning
 * "give IV tranexamic acid within 1 hour" into a neutral description is an
 * editorial and clinical judgement, not a text transform. Getting it wrong
 * silently would be worse than leaving it flagged.
 *
 * WHY IT MATTERS
 * The hub's stated job is to help a clinician find the right source document.
 * A summary written in the imperative reads as the hub telling you what to do
 * to a patient — which is a different, and much larger, claim than the site
 * makes anywhere else, including its own disclaimer.
 *
 * Run:  npx tsx scripts/audit-summaries.ts
 */
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { pathToFileURL } from 'url';

import { GUIDELINES_DATA } from '../src/data/guidelines-data';

const REPORTS_DIR = join(process.cwd(), 'reports');

/**
 * Verbs that, used at the start of a clause, address the reader as the person
 * treating the patient. "Recommends tranexamic acid" describes a document;
 * "give tranexamic acid" instructs a clinician.
 */
const IMPERATIVE_VERBS = [
  'give', 'apply', 'administer', 'prescribe', 'start', 'commence', 'stop',
  'transfer', 'activate', 'perform', 'refer', 'admit', 'discharge', 'use',
  'avoid', 'ensure', 'check', 'repeat', 'titrate', 'monitor', 'immobilise',
  'immobilize', 'splint', 'reduce', 'operate', 'aspirate', 'irrigate',
  'elevate', 'consider', 'obtain', 'request', 'arrange', 'assess',
];

/** Directive phrasing that assigns an obligation rather than reporting one. */
const DIRECTIVE_PHRASES = [
  'must be', 'should be given', 'should be started', 'should receive',
  'is required', 'do not', "don't", 'never give', 'always give',
];

export interface Finding {
  id: string;
  topic: string;
  source: string;
  summary: string;
  imperatives: string[];
  directives: string[];
  hasDose: boolean;
  score: number;
}

/** Splits into clauses so an imperative is only counted where a clause begins. */
export function clausesOf(text: string): string[] {
  return text
    .split(/[.;:]|\s-\s|—|\n/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/** A number followed by a clinical unit, e.g. "1 hour", "15 mg", "500ml". */
export function hasDosage(text: string): boolean {
  return /\b\d+(\.\d+)?\s?(mg|mcg|g|ml|l|units?|hours?|hrs?|minutes?|mins?|days?|weeks?)\b/i.test(text);
}

export function auditSummary(summary: string): Omit<Finding, 'id' | 'topic' | 'source' | 'summary'> {
  const imperatives: string[] = [];
  for (const clause of clausesOf(summary)) {
    const firstWord = (clause.match(/^[A-Za-z']+/) ?? [''])[0].toLowerCase();
    if (IMPERATIVE_VERBS.includes(firstWord)) {
      imperatives.push(clause.length > 70 ? clause.slice(0, 70) + '…' : clause);
    }
  }
  const lower = summary.toLowerCase();
  const directives = DIRECTIVE_PHRASES.filter((d) => lower.includes(d));
  const dose = hasDosage(summary);
  // Weighted: a clause opening in the imperative is the strongest signal that
  // the reader is being addressed as the treating clinician.
  const score = imperatives.length * 3 + directives.length * 2 + (dose ? 1 : 0);
  return { imperatives, directives, hasDose: dose, score };
}

export function auditAll(rows: readonly { id: string; topic: string; source: string; summary: string }[]): Finding[] {
  return rows
    .map((r) => ({ id: r.id, topic: r.topic, source: r.source, summary: r.summary, ...auditSummary(r.summary ?? '') }))
    .filter((f) => f.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

function main() {
  const findings = auditAll(GUIDELINES_DATA);
  const stamp = new Date().toISOString().slice(0, 10);
  const out = join(REPORTS_DIR, `summary-tone-audit-${stamp}.md`);

  const lines: string[] = [
    `# Summary tone audit — ${stamp}`,
    '',
    'REPORT ONLY. Nothing has been rewritten.',
    '',
    `Scanned ${GUIDELINES_DATA.length} summaries. **${findings.length}** contain language that`,
    'reads as an instruction to the treating clinician rather than a description of',
    'what the source document says.',
    '',
    'This is a flagging heuristic, not a verdict. A high score means "a person should',
    'read this one", not "this is wrong". Rewriting is an editorial and clinical',
    'judgement and is deliberately left to a human.',
    '',
    'Scoring: each clause opening with an imperative clinical verb = 3, each',
    'directive phrase = 2, presence of a dose or time figure = 1.',
    '',
    '| Score | ID | Topic | Signals |',
    '| ---: | --- | --- | --- |',
  ];
  for (const f of findings) {
    const signals = [
      f.imperatives.length ? `${f.imperatives.length} imperative clause(s)` : '',
      f.directives.length ? `directive: ${f.directives.join(', ')}` : '',
      f.hasDose ? 'dose/time figure' : '',
    ].filter(Boolean).join('; ');
    lines.push(`| ${f.score} | \`${f.id}\` | ${f.topic.replace(/\|/g, '\\|')} | ${signals} |`);
  }

  lines.push('', '---', '', '## Detail');
  for (const f of findings) {
    lines.push('', `### ${f.topic}`, '', `- **ID:** \`${f.id}\`  **Source:** ${f.source}  **Score:** ${f.score}`);
    if (f.imperatives.length) {
      lines.push('- **Clauses opening in the imperative:**');
      for (const c of f.imperatives) lines.push(`  - "${c}"`);
    }
    if (f.directives.length) lines.push(`- **Directive phrasing:** ${f.directives.join(', ')}`);
    if (f.hasDose) lines.push('- **Contains a dose or time figure**');
    lines.push('', '> ' + (f.summary || '(empty)').replace(/\r?\n/g, ' '));
  }

  if (!existsSync(REPORTS_DIR)) mkdirSync(REPORTS_DIR, { recursive: true });
  writeFileSync(out, lines.join('\n') + '\n');

  console.log(`\nScanned ${GUIDELINES_DATA.length} summaries.`);
  console.log(`Flagged ${findings.length} for human review (nothing was changed).`);
  const top = findings.slice(0, 10);
  if (top.length) {
    console.log('\nHighest-scoring:');
    for (const f of top) console.log(`  ${String(f.score).padStart(3)}  ${f.id}  —  ${f.topic.slice(0, 58)}`);
  }
  console.log(`\nFull report: ${out}\n`);
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;
if (isMain) main();
