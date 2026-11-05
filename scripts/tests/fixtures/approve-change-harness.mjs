/**
 * scripts/tests/fixtures/approve-change-harness.mjs
 * ──────────────────────────────────────────────────
 * Preload for scripts/tests/approve-change.test.ts. Loaded with
 * `node --import tsx --import <this file> scripts/approve-change.ts`, it
 * replaces globalThis.fetch BEFORE the script runs, so the real script (env →
 * GitHub API → Supabase PostgREST → the guideline URL) executes end to end
 * against synthetic responses. NO SOCKET IS EVER OPENED: every request is
 * answered here, and an unrecognised host is answered with a thrown error
 * rather than passed through.
 *
 * Scenario (JSON file named by HARNESS_SCENARIO):
 *   issue      the GitHub issue object returned for GET /issues/N (any JSON —
 *              malformed shapes are a test case)
 *   row        the guidelines row for GET /rest/v1/guidelines, or null
 *   link       how the guideline URL answers: { status, finalUrl? } | "abort" | "dns"
 * Every request is appended as one JSON line to HARNESS_LOG.
 */
import { appendFileSync, readFileSync } from 'node:fs';

const scenario = JSON.parse(readFileSync(process.env.HARNESS_SCENARIO, 'utf8'));
const LOG = process.env.HARNESS_LOG;
const SUPABASE = process.env.SUPABASE_URL;

function log(entry) {
  appendFileSync(LOG, JSON.stringify(entry) + '\n');
}

function json(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const method = (init.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase();
  const headers = new Headers(init.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : {}));
  let body = init.body ?? null;
  if (body && typeof body !== 'string') body = String(body);
  log({ method, url, body, prefer: headers.get('prefer'), accept: headers.get('accept') });

  // ── GitHub ──────────────────────────────────────────────────────────────
  if (url.startsWith('https://api.github.com/')) {
    if (method === 'GET' && /\/issues\/\d+$/.test(url)) return json(200, scenario.issue);
    if (method === 'POST' && /\/issues\/\d+\/comments$/.test(url)) return json(201, { id: 1 });
    if (method === 'PATCH' && /\/issues\/\d+$/.test(url)) return json(200, { state: 'closed' });
    return json(404, { message: 'harness: unrouted GitHub call' });
  }

  // ── Supabase PostgREST ──────────────────────────────────────────────────
  if (SUPABASE && url.startsWith(SUPABASE)) {
    const u = new URL(url);
    const wantsObject = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
    const minimal = (headers.get('prefer') ?? '').includes('return=minimal');
    const rows = scenario.row ? [scenario.row] : [];
    const idFilter = u.searchParams.get('id');
    const matching = rows.filter((r) => !idFilter || idFilter === `eq.${r.id}`);

    if (u.pathname === '/rest/v1/guidelines') {
      if (method === 'GET') {
        if (wantsObject) {
          return matching.length === 1
            ? json(200, matching[0])
            : json(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${matching.length} rows` });
        }
        return json(200, matching);
      }
      if (method === 'PATCH') {
        // An UPDATE matching zero rows is NOT an error in PostgREST: it is 204
        // (return=minimal) or 200 with [] — exactly the silent no-op case.
        if (minimal) return new Response(null, { status: 204 });
        const out = matching.map((r) => ({ ...r, ...JSON.parse(body ?? '{}') }));
        return json(200, wantsObject ? out[0] ?? null : out);
      }
    }
    if (u.pathname === '/rest/v1/guideline_changelog' && method === 'POST') {
      if (minimal) return new Response(null, { status: 201 });
      return json(201, [{ id: '00000000-0000-0000-0000-000000000001', ...JSON.parse(body ?? '{}') }]);
    }
    return json(404, { message: `harness: unrouted Supabase call ${method} ${u.pathname}` });
  }

  // ── The guideline URL itself (the link check) ───────────────────────────
  const link = scenario.link;
  if (link === 'abort') {
    const err = new Error('This operation was aborted');
    err.name = 'AbortError';
    throw err;
  }
  if (link === 'dns' || !link) throw new TypeError('fetch failed (harness: getaddrinfo ENOTFOUND)');
  const res = new Response(method === 'HEAD' ? null : '<html>synthetic</html>', { status: link.status });
  Object.defineProperty(res, 'url', { value: link.finalUrl ?? url });
  Object.defineProperty(res, 'redirected', { value: Boolean(link.finalUrl && link.finalUrl !== url) });
  return res;
};
