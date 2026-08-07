/**
 * upsert-verified.ts
 * ──────────────────
 * Reads guidelines_verified_231.json (or any JSON file you point it at),
 * maps your research schema → the Supabase DB schema, and upserts every
 * record into the `guidelines` table.
 *
 * Run from the project root:
 *   npm run upsert-verified
 *   -- or --
 *   npx tsx scripts/upsert-verified.ts
 *   -- or, to point at a different file --
 *   INPUT_FILE=./my-data.json npx tsx scripts/upsert-verified.ts
 *
 * Requires in .env.local:
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY  (preferred – bypasses RLS)
 *     OR
 *   VITE_SUPABASE_ANON_KEY     (works when RLS is disabled)
 *
 * Field mapping (your JSON → Supabase column):
 *   id                        → id
 *   section                   → section
 *   also_show_in_sections[]   → cross_listed_in[]
 *   type                      → type
 *   topic                     → topic
 *   source                    → source
 *   summary                   → summary
 *   notes                     → notes
 *   status                    → status  (validated)
 *   link_verification_status  → link_verification_status (validated)
 *   link_verification_notes   → link_verification_notes
 *   date_version              → sub_group  (closest semantic match)
 *   primary_url               → versions[0] { label: date_version, url }
 *   fallback_url              → versions[1] { label: 'Fallback', url } (if present)
 *   version_links[]           → appended to versions[] (nulls dropped)
 *   last_checked (dd/MM/yyyy) → last_checked (YYYY-MM-DD)
 *   link_last_verified        → link_last_verified (YYYY-MM-DD)
 *
 * Fields not in DB schema (silently ignored):
 *   fallback_url is folded into versions[] rather than a separate column.
 */

import { config } from 'dotenv';
import { resolve, basename } from 'path';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

// ── Load env vars ──────────────────────────────────────────────────────────────
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

// ── Resolve input file ─────────────────────────────────────────────────────────
const INPUT_FILE =
  process.env.INPUT_FILE ??
  resolve(process.cwd(), 'guidelines_verified_231.json');

// ── Validate Supabase credentials ──────────────────────────────────────────────
const url = process.env.VITE_SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '\n❌ Missing environment variables.\n' +
      'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local\n',
  );
  process.exit(1);
}

const supabase = createClient(url, key);

// ── Valid DB enum values ───────────────────────────────────────────────────────
const VALID_STATUS = new Set([
  'Live', 'Archived', 'Flagged', 'To source', 'Drafted', 'Reviewed', 'Under review',
]);
const VALID_LINK_VERIFICATION = new Set([
  'unchecked', 'needs-review', 'broken', 'verified',
]);

// ── Date parser: accepts dd/MM/yyyy OR yyyy-MM-dd OR free text ─────────────────
function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // dd/MM/yyyy  (your format)
  const ddMMyyyy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (ddMMyyyy) return `${ddMMyyyy[3]}-${ddMMyyyy[2]}-${ddMMyyyy[1]}`;
  // yyyy-MM-dd  (already correct)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Anything else: not a parseable date — store null to avoid a Postgres error
  return null;
}

// ── Your research JSON shape ────────────────────────────────────────────────────
interface ResearchRecord {
  id: string;
  section: string;
  also_show_in_sections?: string[];
  type: string;
  topic: string;
  source: string;
  summary?: string;
  notes?: string;
  status?: string;
  link_verification_status?: string;
  link_verification_notes?: string;
  date_version?: string;
  primary_url?: string;
  fallback_url?: string;
  version_links?: Array<{ label: string; url: string | null }>;
  last_checked?: string;
  link_last_verified?: string;
}

// ── DB row shape (subset we upsert – timestamps are handled by Postgres) ───────
interface DbRow {
  id: string;
  section: string;
  type: string;
  topic: string;
  sub_group: string | null;
  source: string;
  summary: string | null;
  notes: string | null;
  status: string;
  regional_variation: boolean;
  local_overlay_needed: boolean;
  last_checked: string | null;
  cross_listed_in: string[];
  archived: boolean;
  source_access_status: null;
  link_verification_status: string;
  link_last_verified: string | null;
  link_verification_notes: string | null;
  versions: Array<{ label: string; date?: string; url: string }>;
}

// ── Map one research record → one DB row ───────────────────────────────────────
function toDbRow(r: ResearchRecord): DbRow {
  // --- status ---
  const status = VALID_STATUS.has(r.status ?? '') ? (r.status as string) : 'Live';

  // --- link_verification_status ---
  const lvs = (r.link_verification_status ?? '').toLowerCase();
  const linkVerificationStatus = VALID_LINK_VERIFICATION.has(lvs) ? lvs : 'unchecked';

  // --- versions[] ---
  const versions: DbRow['versions'] = [];

  if (r.primary_url) {
    versions.push({
      label: r.date_version ?? 'Current',
      url: r.primary_url,
    });
  }

  if (r.fallback_url) {
    versions.push({
      label: 'Fallback / index page',
      url: r.fallback_url,
    });
  }

  if (Array.isArray(r.version_links)) {
    for (const vl of r.version_links) {
      if (vl.url) {
        versions.push({ label: vl.label, url: vl.url });
      }
    }
  }

  return {
    id: r.id,
    section: r.section,
    type: r.type,
    topic: r.topic,
    sub_group: r.date_version ?? null,
    source: r.source,
    summary: r.summary ?? null,
    notes: r.notes ?? null,
    status,
    regional_variation: false,
    local_overlay_needed: false,
    last_checked: parseDate(r.last_checked),
    cross_listed_in: r.also_show_in_sections ?? [],
    archived: false,
    source_access_status: null,
    link_verification_status: linkVerificationStatus,
    link_last_verified: parseDate(r.link_last_verified),
    link_verification_notes: r.link_verification_notes ?? null,
    versions,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n📂  Reading: ${basename(INPUT_FILE)}`);

  let raw: ResearchRecord[];
  try {
    raw = JSON.parse(readFileSync(INPUT_FILE, 'utf-8')) as ResearchRecord[];
  } catch (err) {
    console.error(`\n❌ Could not read/parse ${INPUT_FILE}:\n`, err);
    process.exit(1);
  }

  if (!Array.isArray(raw) || raw.length === 0) {
    console.error('\n❌ File does not contain a non-empty JSON array.');
    process.exit(1);
  }

  console.log(`✅  Parsed ${raw.length} records.`);

  const rows = raw.map(toDbRow);

  // Upsert in batches of 50 to stay within PostgREST limits
  const BATCH = 50;
  let upserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(rows.length / BATCH);

    process.stdout.write(
      `⬆️   Upserting batch ${batchNum}/${totalBatches} (rows ${i + 1}–${Math.min(i + BATCH, rows.length)})… `,
    );

    const { error } = await supabase
      .from('guidelines')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`\n\n❌ Batch ${batchNum} failed:`);
      console.error('  Message:', error.message);
      if ('details' in error) console.error('  Details:', (error as { details: unknown }).details);
      if ('hint'    in error) console.error('  Hint:   ', (error as { hint: unknown }).hint);
      process.exit(1);
    }

    upserted += batch.length;
    console.log('✓');
  }

  console.log(`\n🎉  Done — ${upserted} records upserted into Supabase.\n`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
