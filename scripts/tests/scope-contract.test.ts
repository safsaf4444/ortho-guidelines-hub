/**
 * Cross-layer structured-scope contract (962fca4 review P2-2 / P2-3 / P3-1).
 * Offline: reads the proposal SQL and producer sources; no database or network.
 */
import fs from 'node:fs';
import { EVIDENCE_SCOPES, VERSION_SCOPES, DISCOVER_ALTERNATIVE_SCOPES, isEvidenceScope, scopeExemptsFromComparison } from '../lib/scope-contract';
import { validateCandidate } from '../stage-discovery';

let passed = 0, failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) { passed++; console.log('  PASS  ' + name); } else { failed++; console.log('  FAIL  ' + name + (detail === undefined ? '' : ' :: ' + JSON.stringify(detail))); }
};
const sqlText = fs.readFileSync('supabase/proposals/20261107_editorial_governance_hardening.sql', 'utf8');
const sorted = (xs: readonly string[]) => [...xs].sort().join(',');

console.log('\n[1] Database and TypeScript accept the same scope set');
const validFn = /create function public\._governance_scope_valid[\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(sqlText)?.[1] ?? '';
const dbSet = /in\(([^)]*)\)/.exec(validFn)?.[1].split(',').map((s) => s.trim().replace(/^'|'$/g, '')) ?? [];
check('the SQL validator is present', validFn.length > 0);
check('SQL _governance_scope_valid lists exactly EVIDENCE_SCOPES', sorted(dbSet) === sorted(EVIDENCE_SCOPES), { db: dbSet, ts: EVIDENCE_SCOPES });
check('VERSION_SCOPES and DISCOVER_ALTERNATIVE_SCOPES are subsets of EVIDENCE_SCOPES',
  [...VERSION_SCOPES, ...DISCOVER_ALTERNATIVE_SCOPES].every((s) => isEvidenceScope(s)));
check('versions can never carry surface (no recorded surface_url on that path)', !(VERSION_SCOPES as readonly string[]).includes('surface'));
check('case variants and look-alikes are not scopes', !['Index', 'INDEX', ' index', 'surface ', 'doc', '', 'іndex'].some((s) => isEvidenceScope(s)));

console.log('\n[2] No producer claim can exempt a link (P2-2)');
const trustFn = /create function public\._governance_alias_trust[\s\S]*?\$\$([\s\S]*?)\$\$;/.exec(sqlText)?.[1] ?? '';
check('the SQL trust function is present', trustFn.length > 0);
check('every SQL trust status the classifier can return is comparison-only',
  trustFn.length > 0 && !/'navigation-only/.test(trustFn) && (trustFn.match(/'comparison-only;/g) ?? []).length >= 2);
check('the proposal contains no navigation-only (exempt) classification path', !/'navigation-only/.test(sqlText));
check('the TypeScript contract states the same rule', EVIDENCE_SCOPES.every((s) => scopeExemptsFromComparison(s) === false) && scopeExemptsFromComparison(undefined) === false);
check('SQL hold check still keys on comparison-only rows', /trust_status like 'comparison-only%'/.test(sqlText));

console.log('\n[3] Producer-specific restrictions are enforced where the evidence enters');
check('SQL refuses surface on evidence without a recorded surface_url', /scope'='surface' and coalesce\(btrim\(new\.surface_url\),''\)=''/.test(sqlText));
check('SQL refuses surface on staged queue versions', /v->>'scope'='surface'\) then raise exception 'Staged versions cannot carry a surface scope/.test(sqlText));
check('SQL staging contradiction check treats an omitted scope as document-level (P3-1)', /coalesce\(a->>'scope', 'document'\) = 'document'/.test(sqlText));
const base = { discoveryId: 'x', provider: 'P', providerName: 'P', topic: 'T', classification: 'NEW_GUIDELINE', discoveredUrl: 'https://example.test/a', surface: 'https://example.test/', discoveredAt: '2026-11-11T00:00:00Z', statedLabels: [], matchedGuidelineId: null };
const accepts = (scope: unknown) => validateCandidate({ ...base, urlAlternatives: [{ url: 'https://example.test/b', relation: 'redirect-target', scope }] }).length === 0;
check('the discovery producer accepts exactly DISCOVER_ALTERNATIVE_SCOPES', DISCOVER_ALTERNATIVE_SCOPES.every((s) => accepts(s)));
check('the discovery producer refuses index/fallback/navigation, case variants and missing scope', ['index', 'fallback', 'navigation', 'Index', undefined, 7].every((s) => !accepts(s)));

console.log('\n[4] Every producer layer takes its scope type from the shared contract');
const urlAlt = fs.readFileSync('scripts/lib/url-alternatives.ts', 'utf8');
const ingestion = fs.readFileSync('scripts/lib/ingestion.ts', 'utf8');
const stageDiscovery = fs.readFileSync('scripts/stage-discovery.ts', 'utf8');
check('url-alternatives.ts derives AlternativeScope from scope-contract', /export type AlternativeScope = DiscoverAlternativeScope;/.test(urlAlt) && /from '\.\/scope-contract'/.test(urlAlt));
check('ingestion.ts types version scope as VersionScope from scope-contract', /scope\?: VersionScope;/.test(ingestion) && /from '\.\/scope-contract'/.test(ingestion));
check('stage-discovery.ts validates with the shared discover subset', /isDiscoverAlternativeScope\(a\.scope\)/.test(stageDiscovery));
check('no producer declares its own literal scope union', ![urlAlt, ingestion].some((t) => /scope\??:\s*'document'\s*\|/.test(t) || /=\s*'document'\s*\|\s*'surface'/.test(t)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
