/**
 * Seed script — upserts all 128 guidelines from the static data file into Supabase.
 *
 * Run from the project root:
 *   npm run seed
 *
 * Requires in .env.local (or .env):
 *   VITE_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   (preferred — bypasses RLS)
 *     OR
 *   VITE_SUPABASE_ANON_KEY      (acceptable when RLS is disabled)
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.local first (Vite convention for local secrets), then .env as fallback.
// dotenv does not override already-set vars, so .env.local takes precedence.
config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

import { createClient } from '@supabase/supabase-js';
import { GUIDELINES_DATA } from '../src/data/guidelines-data';
import { toDbRow } from '../src/lib/guidelines-mapper';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    '\nMissing environment variables.\n' +
    'Set VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or VITE_SUPABASE_ANON_KEY) in .env.local\n'
  );
  process.exit(1);
}

const supabase = createClient(url, key);

async function seed() {
  // Check if guidelines table is already populated
  const { count, error: countError } = await supabase
    .from('guidelines')
    .select('id', { count: 'exact', head: true });

  if (countError) {
    console.error('\n❌ Could not check guidelines count:', countError.message);
    process.exit(1);
  }

  if (count && count > 0) {
    console.log(`\n⚠️  Supabase guidelines table already contains ${count} rows.`);
    console.log(`🛡️  Seed cancelled to prevent introducing duplicate entries over verified data.`);
    console.log(`💡 To update verified data, run: npm run upsert-verified (or npx tsx scripts/upsert-verified.ts)\n`);
    return;
  }

  const rows = GUIDELINES_DATA.map(toDbRow);
  console.log(`Upserting ${rows.length} static guidelines into empty Supabase table…`);

  const { error } = await supabase
    .from('guidelines')
    .upsert(rows, { onConflict: 'id' });

  if (error) {
    console.error('\nSeed failed:', error.message);
    if (error.details) console.error('Details:', error.details);
    process.exit(1);
  }

  console.log(`Done. ${rows.length} records upserted.`);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
