/**
 * dedupe-db.ts
 * ────────────
 * Script to clean up duplicate guidelines in the Supabase database.
 * Groups rows by normalized topic + source. For duplicate groups, keeps the canonical/best row
 * and deletes redundant ones.
 *
 * Preference hierarchy for keeping a row:
 * 1. Prefer link_verification_status = 'verified'
 * 2. If tied on verification, prefer non-'new-###' descriptive slug IDs
 * 3. Fallback to newest updated_at timestamp or shorter/cleaner ID.
 *
 * Usage:
 *   Dry-run (default):
 *     npx tsx scripts/dedupe-db.ts
 *
 *   Apply changes:
 *     npx tsx scripts/dedupe-db.ts --apply
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { createClient } from '@supabase/supabase-js';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), '.env') });

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error('\n❌ Missing environment variables: VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);
const isApply = process.argv.includes('--apply');

function normalize(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9]/g, '');
}

function extractUrlKey(urlStr: string | null | undefined): string {
  if (!urlStr) return '';
  try {
    const u = new URL(urlStr);
    return (u.hostname + u.pathname).toLowerCase().replace(/\/$/, '');
  } catch {
    return '';
  }
}

interface DbGuidelineRow {
  id: string;
  topic: string;
  source: string;
  primary_url?: string;
  versions?: Array<{ url?: string }>;
  link_verification_status: string | null;
  updated_at?: string;
  [key: string]: any;
}

async function run() {
  console.log(`\n🔍 Fetching guidelines from Supabase...`);
  const { data, error } = await supabase.from('guidelines').select('*');

  if (error || !data) {
    console.error('❌ Failed to fetch guidelines from Supabase:', error);
    process.exit(1);
  }

  const rows = data as DbGuidelineRow[];
  console.log(`Total rows fetched: ${rows.length}`);

  const idsToDelete = new Set<string>();

  // Pass 1: Dedupe by exact normalized topic
  const topicMap = new Map<string, DbGuidelineRow[]>();
  for (const row of rows) {
    const normTopic = normalize(row.topic);
    if (!normTopic) continue;
    const list = topicMap.get(normTopic) || [];
    list.push(row);
    topicMap.set(normTopic, list);
  }

  for (const group of topicMap.values()) {
    if (group.length <= 1) continue;
    // Prefer non-new-### ID, verified status
    group.sort((a, b) => {
      const aIsNewPattern = /^new-\d+$/i.test(a.id) ? 1 : 0;
      const bIsNewPattern = /^new-\d+$/i.test(b.id) ? 1 : 0;
      if (aIsNewPattern !== bIsNewPattern) return aIsNewPattern - bIsNewPattern;

      const aVerified = (a.link_verification_status || '').toLowerCase() === 'verified' ? 1 : 0;
      const bVerified = (b.link_verification_status || '').toLowerCase() === 'verified' ? 1 : 0;
      if (aVerified !== bVerified) return bVerified - aVerified;

      return b.id.localeCompare(a.id);
    });

    const keeper = group[0];
    for (let i = 1; i < group.length; i++) {
      idsToDelete.add(group[i].id);
    }
  }

  // Pass 2: Dedupe by primary URL if present
  const urlMap = new Map<string, DbGuidelineRow[]>();
  for (const row of rows) {
    if (idsToDelete.has(row.id)) continue;
    const primaryUrl = row.primary_url || (row.versions && row.versions[0] ? row.versions[0].url : null);
    const urlKey = extractUrlKey(primaryUrl);
    if (!urlKey || urlKey.includes('boa.ac.uk/standards-guidance') || urlKey.includes('bess.ac.uk/patient-care-pathways')) continue;

    const list = urlMap.get(urlKey) || [];
    list.push(row);
    urlMap.set(urlKey, list);
  }

  for (const group of urlMap.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => {
      const aIsNewPattern = /^new-\d+$/i.test(a.id) ? 1 : 0;
      const bIsNewPattern = /^new-\d+$/i.test(b.id) ? 1 : 0;
      if (aIsNewPattern !== bIsNewPattern) return aIsNewPattern - bIsNewPattern;
      return b.id.localeCompare(a.id);
    });
    for (let i = 1; i < group.length; i++) {
      idsToDelete.add(group[i].id);
    }
  }

  // Pass 3: Fuzzy matching on key topics & known static duplicates
  const knownAliasMap: Record<string, string> = {
    'new-023': 'nice-thr-resurfacing-ta304',
    'new-037': 'fls-db',
    'new-059': 'end-stage-ankle-arthritis',
    'new-039': 'bpt-fragility-hip-femur-fracture',
    'new-024': 'girft-elective-total-elbow-replacement',
    'new-050': 'bess-shoulder-pain-primary-intermediate-care',
    'new-061': 'bofas-trauma-foot-ankle',
  };

  for (const [legacyId, canonicalId] of Object.entries(knownAliasMap)) {
    const hasCanonical = rows.some(r => r.id === canonicalId && !idsToDelete.has(r.id));
    const hasLegacy = rows.some(r => r.id === legacyId);
    if (hasCanonical && hasLegacy) {
      idsToDelete.add(legacyId);
    }
  }

  // Also remove specific legacy IDs that are not present in the verified 231 JSON dataset
  const verifiedJsonIds = new Set(
    JSON.parse(readFileSync(resolve(process.cwd(), 'guidelineinject'), 'utf-8')).map((r: any) => r.id)
  );

  for (const row of rows) {
    if (!verifiedJsonIds.has(row.id)) {
      idsToDelete.add(row.id);
    }
  }

  const deleteList = Array.from(idsToDelete);

  console.log(`\n──────────────────────────────────────────────────`);
  console.log(`Summary:`);
  console.log(`- Rows To Delete        : ${deleteList.length}`);
  console.log(`- Remaining Rows Count  : ${rows.length - deleteList.length}`);
  console.log(`──────────────────────────────────────────────────\n`);

  if (deleteList.length === 0) {
    console.log(`✨ No duplicates found! Database is clean.`);
    return;
  }

  if (!isApply) {
    console.log(`⚠️  DRY RUN ONLY. Delete list IDs (${deleteList.length}):`, deleteList);
    console.log(`👉 To delete redundant rows, re-run with: npx tsx scripts/dedupe-db.ts --apply\n`);
    return;
  }

  console.log(`🚀 Executing deletion of ${deleteList.length} redundant rows...`);
  const { error: deleteError } = await supabase
    .from('guidelines')
    .delete()
    .in('id', deleteList);

  if (deleteError) {
    console.error(`❌ Deletion failed:`, deleteError);
    process.exit(1);
  }

  console.log(`🎉 Successfully deleted ${deleteList.length} duplicate rows from Supabase.\n`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
