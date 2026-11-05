/**
 * FROZEN TEST FIXTURE: genuine URL-key v3 implementation, not a rewrite.
 * Source: scripts/lib/ingestion.ts at caf34be9f52addb176a5d7ca863e8e2b4531fc42.
 * Source Git blob: 8c17a0f717e33cca7d66f2e632579c429f1759d1.
 * Exact contiguous excerpt from the ECMAScript trim-set comment through
 * documentIdentityKey(), stopping before the canonical-provider comment.
 * Excerpt SHA-256 (LF): 8c669fd9ded4355f23285c7b44a40c335e3e8419a62f51249e9500ee7eaf5b7d
 * Scope: only key constants, ver stripping, match and identity functions.
 * No imports, candidate logic, I/O, clinical content or publisher HTML.
 * Never update to follow production; this is the historical comparison oracle.
 * Any correction requires source/provenance review and a reviewed hash update.
 * Runtime tests need neither Git nor the historical commit object.
 */
/**
 * Exactly the characters ECMAScript's `String.prototype.trim()` removes,
 * spelled out so the SQL mirror (`public._url_strip_ver`) can list the
 * same set rather than rely on a locale's idea of whitespace.
 */
const KEY_WHITESPACE = '\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
const KEY_TRIM = new RegExp(`^[${KEY_WHITESPACE}]+|[${KEY_WHITESPACE}]+$`, 'g');

/** A scheme prefix. Only such strings have their query string inspected. */
const ABSOLUTE_URL = /^[A-Za-z][A-Za-z0-9+.-]*:/;

/** Query-parameter name `ver`, ASCII case-insensitive, compared raw (undecoded). */
const VER_NAME = /^[Vv][Ee][Rr]$/;

/**
 * Strips every `ver` query parameter from a URL, LEXICALLY: the string is cut
 * and re-joined, never parsed and re-serialised.
 *
 * Scope is deliberately narrow: `ver` only. It exists because BOFAS's DNN CMS
 * appends a `?ver=<cache-busting-token>` to every document link that changes
 * on each republish with no change to the document itself, which made exact
 * URL matching report all 10 BOFAS Publications as "new" on every sync run —
 * see SER-6 follow-up. No catalogue URL uses a `ver` parameter for anything
 * (checked against src/data/guidelines-data.ts before adding this), so
 * removing it cannot collide with a real document identity.
 *
 * The rule, which `public._url_strip_ver` implements identically and
 * scripts/tests/fixtures/url-key-vectors.json pins for both:
 *
 *   - Only a string with a scheme prefix is inspected; anything else is
 *     returned unchanged.
 *   - The fragment starts at the first `#`; the query at the first `?` before
 *     it. A `?ver=` inside a fragment is not a query parameter.
 *   - The query is split on `&`. A segment is a `ver` parameter when the text
 *     before its first `=` (or the whole segment, if it has none) is `ver` in
 *     any ASCII case. The name is NOT percent-decoded: `%76er` is not `ver`.
 *   - If no segment is `ver`, the URL is returned unchanged, byte for byte.
 *     nhfd.co.uk's `?open&<filename>` is the document identity there.
 *   - Otherwise every `ver` segment is removed (repeats included), empty
 *     segments are dropped, the rest are kept verbatim and in order —
 *     repeated non-`ver` parameters included — and `?` is dropped if nothing
 *     remains. The fragment is re-attached unchanged.
 *
 * Why not `new URL()`: the WHATWG serialiser re-encodes the WHOLE URL once
 * anything changes (`a%20b` in the query became `a+b`, `,` became `%2C`, a raw
 * space in the path became `%20`, `/a/../b` collapsed, `:443` vanished), so
 * the key of a `ver` URL depended on encoding details the SQL mirror could not
 * reproduce. Two keys for one document is exactly what this function exists
 * to prevent.
 */
function stripVolatileCacheBustingParam(url: string): string {
  if (!ABSOLUTE_URL.test(url)) return url;

  const hash = url.indexOf('#');
  const head = hash < 0 ? url : url.slice(0, hash);
  const fragment = hash < 0 ? '' : url.slice(hash);
  const q = head.indexOf('?');
  if (q < 0) return url;

  const segments = head.slice(q + 1).split('&');
  const kept = segments.filter(s => !VER_NAME.test(s.split('=', 1)[0]));
  if (kept.length === segments.length) return url;

  const remaining = kept.filter(s => s !== '');
  return head.slice(0, q) + (remaining.length > 0 ? `?${remaining.join('&')}` : '') + fragment;
}

/**
 * MATCH key — a deliberately LOOSE heuristic. Used for candidate IDs, for
 * "is this already in the catalogue?" matching in sync-providers.ts, for
 * staging holds, and for the approval near-match refusal. NOT the queue's
 * document identity: see {@link documentIdentityKey}.
 *
 * In order: trimmed (the ECMAScript trim set), `ver` cache-busting parameters
 * stripped (see stripVolatileCacheBustingParam), ASCII letters lowercased
 * EVERYWHERE — path and query values included — and trailing slashes removed
 * from the end of the whole string. It does not strip other query strings,
 * fragments or `www.`, does not decode or re-encode anything, and does not
 * lowercase non-ASCII letters (Unicode case mapping differs between
 * JavaScript and the database's locale).
 *
 * Because it folds path and query-value case, two DIFFERENT documents can
 * share a match key (`/Docs/A.pdf` vs `/docs/a.pdf` on a case-sensitive
 * server; `?token=AbC` vs `?token=abc`). That is acceptable for a heuristic
 * that proposes "probably the same", and it is why the queue does not use it
 * as identity. Its definition is unchanged from url-key v2 so candidate IDs
 * — and the editor decisions keyed on them — do not move.
 *
 * `public.document_match_key` in
 * supabase/migrations/20261024_discovery_review_queue.sql is its exact SQL
 * mirror. Change both together, and the shared vectors with them.
 *
 * The result is a KEY, never a URL to store or display: original hrefs are
 * kept verbatim in `versions[].url` and in the queue's primary_url.
 */
export function normaliseCandidateUrl(url: string): string {
  const trimmed = url.replace(KEY_TRIM, '');
  return stripVolatileCacheBustingParam(trimmed)
    .replace(/[A-Z]+/g, s => s.toLowerCase())
    .replace(/\/+$/, '');
}

/** Scheme and authority of a scheme-prefixed string; path onwards excluded. */
const SCHEME_AUTHORITY = /^([A-Za-z][A-Za-z0-9+.-]*:)(\/\/[^/?#]*)?/;

/**
 * IDENTITY key — CONSERVATIVE. Defines "the same document" for the review
 * queue: the one-open-row-per-document slot, and exact catalogue matches at
 * approval. Two URLs share an identity key only when they are equivalent
 * under RFC 3986 or under one of exactly two documented, deliberate merges.
 *
 * In order:
 *   1. trim the ECMAScript trim set (whitespace around an href is not part of it);
 *   2. remove `ver` query parameters exactly as {@link normaliseCandidateUrl}
 *      does — DELIBERATE MERGE #1: on BOFAS's DNN CMS (and WordPress assets)
 *      `?ver=` is a cache-buster, so a changed token is the same document. A
 *      changed token is still recorded verbatim, as evidence;
 *   3. lowercase the scheme and the host (after any `userinfo@`) — RFC 3986
 *      §6.2.2.1: both are case-insensitive. Path, query and fragment keep
 *      their case: servers may treat them as case-sensitive;
 *   4. uppercase the hex digits of `%XX` escapes — RFC 3986 §6.2.2.1
 *      (`%3d` ≡ `%3D`). Nothing is decoded or re-encoded;
 *   5. strip trailing `/`s from the PATH only — DELIBERATE MERGE #2: `/a/` and
 *      `/a` are treated as one document. A `/` ending a query value or a
 *      fragment is kept.
 * The fragment is kept verbatim: it never reaches the server, but on
 * hash-routed sites it can select a different document, so keeping it can
 * only split (a visible duplicate), never merge.
 *
 * A non-scheme string is only trimmed and has its trailing path slashes
 * stripped. `public.document_identity_key` is the exact SQL mirror.
 */
export function documentIdentityKey(url: string): string {
  let s = stripVolatileCacheBustingParam(url.replace(KEY_TRIM, ''));
  const asciiLower = (t: string) => t.replace(/[A-Z]+/g, c => c.toLowerCase());
  const m = SCHEME_AUTHORITY.exec(s);
  if (m) {
    let authority = m[2] ?? '';
    const at = authority.lastIndexOf('@');
    authority = at < 0 ? asciiLower(authority) : authority.slice(0, at + 1) + asciiLower(authority.slice(at + 1));
    s = asciiLower(m[1]) + authority + s.slice(m[0].length);
  }
  s = s.replace(/%[0-9A-Fa-f]{2}/g, e => e.toUpperCase());
  const cut = s.search(/[?#]/);
  return cut < 0 ? s.replace(/\/+$/, '') : s.slice(0, cut).replace(/\/+$/, '') + s.slice(cut);
}
