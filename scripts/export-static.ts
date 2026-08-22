/**
 * export-static.ts
 * ────────────────
 * Regenerates `src/data/guidelines-data.ts` from the live Supabase `guidelines`
 * table. Every row is mapped through the existing `toGuideline()` mapper, so the
 * generated array matches the runtime shape the app already consumes.
 *
 * Only the GUIDELINES_DATA array is rewritten — the `Guideline` /
 * `GuidelineVersion` type definitions at the top of the data file are preserved
 * verbatim (App.tsx and others import those types from this module).
 *
 * Run from the project root:
 *   npm run export-static
 *
 * Requires in .env.local (or .env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (preferred — bypasses RLS)
 *     OR
 *   VITE_SUPABASE_ANON_KEY
 */
import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync, writeFileSync } from 'fs';

// Load .env.local first (Vite convention), then .env as fallback.
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';
import { toGuideline, type DbGuideline } from '../src/lib/guidelines-mapper';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '\n❌ Missing environment variables.\n' +
      'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local\n',
  );
  process.exit(1);
}

const supabase = createClient(url, key);

const DATA_FILE = resolve(process.cwd(), 'src/data/guidelines-data.ts');
const MARKER = 'export const GUIDELINES_DATA';

async function run() {
  console.log('\n📥  Fetching all rows from Supabase `guidelines`…');

  const { data, error } = await supabase
    .from('guidelines')
    .select('*')
    .order('section')
    .order('topic')
    .order('id');

  if (error) {
    console.error('\n❌ Query failed:', error.message);
    process.exit(1);
  }
  if (!data || data.length === 0) {
    // Guard: never blow away the static file with an empty array.
    console.error('\n❌ Query returned 0 rows — refusing to overwrite the static file.');
    process.exit(1);
  }

  const guidelines = (data as DbGuideline[]).map(toGuideline);
  console.log(`✅  Mapped ${guidelines.length} rows via toGuideline().`);

  // Preserve the type-definition header verbatim: everything from the first
  // `export type` up to the array marker. Starting at `export type` (not the
  // file start) means any previously-written banner is dropped, so re-running
  // never stacks duplicate banners.
  const current = readFileSync(DATA_FILE, 'utf-8');
  const typeStart = current.indexOf('export type');
  const markerIdx = current.indexOf(MARKER);
  if (typeStart === -1 || markerIdx === -1 || typeStart >= markerIdx) {
    console.error(`\n❌ Could not locate the type header / "${MARKER}" in ${DATA_FILE}. Aborting.`);
    process.exit(1);
  }
  const header = current.slice(typeStart, markerIdx);

  const banner =
    '// AUTO-GENERATED from the Supabase `guidelines` table by scripts/export-static.ts.\n' +
    '// Do not edit by hand — change the database and run `npm run export-static`.\n' +
    `// Generated: ${new Date().toISOString().slice(0, 10)} — ${guidelines.length} records.\n\n`;

  const body = `${MARKER}: Guideline[] = ${JSON.stringify(guidelines, null, 2)};\n`;

  writeFileSync(DATA_FILE, banner + header + body, 'utf-8');
  console.log(`\n🎉  Wrote ${guidelines.length} records to src/data/guidelines-data.ts\n`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
