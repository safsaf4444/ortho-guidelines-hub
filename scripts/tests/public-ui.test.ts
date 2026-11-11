/**
 * scripts/tests/public-ui.test.ts
 * ───────────────────────────────
 * Offline regression tests for the public browse view's search/filter logic
 * (src/lib/guideline-filter.ts), the fallback-banner sentence helper, and a
 * small set of SOURCE-LEVEL guards on src/App.tsx for accessibility fixes
 * that have no pure function to test (this repo has no DOM renderer; the
 * browser-level checks live in public-ui.e2e.ts).
 *
 * Run:   npx tsx scripts/tests/public-ui.test.ts   (or: npm run test:offline)
 * Exit:  0 = all assertions passed, 1 = at least one failure.
 */
import fs from 'node:fs';
import {
  filterGuidelines, hasActiveFilters, normaliseQuery, resultCountText, emptyResultText, NEW_TAB_REL,
} from '../../src/lib/guideline-filter';
import { endSentence } from '../../src/lib/utils';
import { GUIDELINES_DATA } from '../../src/data/guidelines-data';
import type { Guideline } from '../../src/data/guidelines-data';

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

function mk(id: string, over: Partial<Guideline> = {}): Guideline {
  return {
    id, section: 'Trauma', topic: `Topic ${id}`, source: 'BOA', type: 'Specialist society guidance',
    summary: 'Summary text', regionalVariation: false, localOverlayNeeded: false, lastChecked: '2026-01-01',
    status: 'Live', versions: [], sourceType: 'specialist-society', guidanceStatus: 'current', ...over,
  };
}
const ALL = { section: 'All', linkStatus: 'All', query: '' };

console.log('\n[1] Search and filtering');
const data = [
  mk('a', { topic: 'Hip fracture', source: 'NICE', linkVerificationStatus: 'verified' }),
  mk('b', { topic: 'Ankle fracture', section: 'Foot & Ankle', summary: 'Weight bearing after ORIF' }),
  mk('c', { topic: 'Scaphoid', source: 'BSSH', linkVerificationStatus: 'broken' }),
];
check('no filter returns everything', filterGuidelines(data, ALL).length === 3);
check('topic match is case-insensitive', filterGuidelines(data, { ...ALL, query: 'HIP' }).map(g => g.id).join() === 'a');
check('summary is searched', filterGuidelines(data, { ...ALL, query: 'orif' }).map(g => g.id).join() === 'b');
check('source is searched', filterGuidelines(data, { ...ALL, query: 'bssh' }).map(g => g.id).join() === 'c');
check('whitespace-only query does NOT empty the list (was a bug)', filterGuidelines(data, { ...ALL, query: '   ' }).length === 3);
check('surrounding spaces are ignored', filterGuidelines(data, { ...ALL, query: '  fracture ' }).length === 2);
check('section filter', filterGuidelines(data, { ...ALL, section: 'Foot & Ankle' }).map(g => g.id).join() === 'b');
check('link status filter', filterGuidelines(data, { ...ALL, linkStatus: 'broken' }).map(g => g.id).join() === 'c');
check('missing link status counts as unchecked', filterGuidelines(data, { ...ALL, linkStatus: 'unchecked' }).map(g => g.id).join() === 'b');
check('filters combine (AND)', filterGuidelines(data, { section: 'Trauma', linkStatus: 'verified', query: 'fracture' }).map(g => g.id).join() === 'a');
check('normaliseQuery trims and lowercases', normaliseQuery('  Hip ') === 'hip');
check('hasActiveFilters ignores a whitespace query', !hasActiveFilters({ ...ALL, query: '  ' }));
check('hasActiveFilters sees each filter', hasActiveFilters({ ...ALL, query: 'x' }) && hasActiveFilters({ ...ALL, section: 'Spine' }) && hasActiveFilters({ ...ALL, linkStatus: 'moved' }));
check('the real catalogue is filterable and the filter never adds rows',
  filterGuidelines(GUIDELINES_DATA, { ...ALL, query: 'fracture' }).length > 0
  && filterGuidelines(GUIDELINES_DATA, ALL).length === GUIDELINES_DATA.length);

console.log('\n[2] Result count and empty-state wording');
check('count when unfiltered', resultCountText(231, 231) === '231 guidelines');
check('count when filtered', resultCountText(4, 231) === '4 of 231 guidelines match');
check('singular', resultCountText(1, 1) === '1 guideline');
check('empty text names the query', emptyResultText({ ...ALL, query: ' zzz ' }, s => s) === 'No guidelines match “zzz”.');
check('empty text names every active filter',
  emptyResultText({ section: 'Spine', linkStatus: 'broken', query: 'x' }, () => 'Link failure')
    === 'No guidelines match “x”, link check “Link failure”, section “Spine”.');
check('empty text with no filter', emptyResultText(ALL, s => s) === 'No guidelines to show.');

console.log('\n[3] Fallback banner sentence');
check('adds a full stop to a bare error', endSentence('The database could not be reached: Failed to fetch') === 'The database could not be reached: Failed to fetch.');
check('keeps an existing full stop', endSentence('No rows.') === 'No rows.');
check('empty stays empty', endSentence('  ') === '');

console.log('\n[4] Source guards on src/App.tsx');
// Comments are stripped first: several explain the old markup in words
// ("role=\"button\" with the provider <a> nested inside it"), which must not
// count as the markup itself.
const app = fs.readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const blankLinks = (app.match(/target="_blank"/g) ?? []).length;
const safeBlankLinks = (app.match(/target="_blank"\s+rel=\{NEW_TAB_REL\}/g) ?? []).length;
check('App.tsx has new-tab links to check', blankLinks >= 6, String(blankLinks));
check('every target="_blank" in App.tsx is immediately followed by rel={NEW_TAB_REL}',
  safeBlankLinks === blankLinks, `${safeBlankLinks} of ${blankLinks}`);
check('every new-tab link carries the screen-reader new-tab cue',
  (app.match(/<NewTabCue \/>/g) ?? []).length >= blankLinks, `${(app.match(/<NewTabCue \/>/g) ?? []).length} cues for ${blankLinks} links`);
check('NEW_TAB_REL is noopener noreferrer', NEW_TAB_REL === 'noopener noreferrer');
check('no role="button" elements remain (nested-interactive rows replaced by real buttons)', !/role="button"/.test(app));
check('the search input has a programmatic label', /htmlFor="guideline-search"/.test(app) && /id="guideline-search"/.test(app));
check('the link-status filter has an accessible name', /aria-label="Filter by link-check status"/.test(app));
check('section headers are buttons with aria-expanded', /onClick=\{onToggleCollapse\}\s*\n\s*aria-expanded=\{!isCollapsed\}/.test(app));
const drawer = fs.readFileSync(new URL('../../src/components/NavigationDrawer.tsx', import.meta.url), 'utf8');
check('mobile navigation delegates to a native modal dialog (closed dialogs are hidden and untabbable)', /<NavigationDrawer/.test(app) && /<dialog/.test(drawer) && /dialog.showModal\(\)/.test(drawer) && /aria-modal="true"/.test(drawer));
check('the result count is a live region', /id="guideline-result-count"\s*\n\s*role="status"/.test(app));
check('exactly one <h1>', (app.match(/<h1[\s>]/g) ?? []).length === 1);
check('editorial controls stay behind the write gate (Add, Edit, quick link-status)',
  (app.match(/WRITES_ENABLED && canEdit/g) ?? []).length >= 3);

console.log(`\n──────────────\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
