/**
 * scripts/lib/url-alternatives.ts
 * ────────────────────────────────
 * Recording URLs that RELATE to a discovered URL, without ever replacing it.
 *
 * PURE. No network, no disk. Everything here operates on observations that were
 * already made elsewhere; nothing in this module performs a request, which is
 * why no function here can fabricate evidence it did not have.
 *
 * ─── THE RULE ───────────────────────────────────────────────────────────────
 *
 * `DiscoveryCandidate.discoveredUrl` is the href the provider published, after
 * relative-reference resolution and nothing else. It is never rewritten,
 * normalised, host-substituted or replaced — not to tidy a hostname, not to
 * prefer a canonical form, not even when we are confident the alternative is
 * better. An adapter that emits a URL the provider never published is inventing
 * metadata, which scripts/lib/provider-adapter.ts exists to prevent.
 *
 * Alternatives are recorded ALONGSIDE, each with the evidence that produced it
 * and an explicit statement of what that evidence does not establish.
 *
 * ─── WHY EQUIVALENCE IS NEVER ASSERTED ──────────────────────────────────────
 *
 * It is tempting to treat "both hosts returned 200 with the same byte length"
 * as proof the two URLs serve the same document. It is not, and this module
 * refuses to say so:
 *
 *   - Content-Length is reported by the server, not measured by us. A proxy, a
 *     CDN, a transform or a misconfiguration can report a length that does not
 *     match what a client would receive.
 *   - Two genuinely different revisions of the same PDF can share a byte length
 *     by coincidence, and template-generated documents make that far likelier
 *     than it sounds.
 *   - Equal length says nothing about equal bytes. A single-character edit, a
 *     swapped image of identical size, or a re-save with different metadata can
 *     all preserve length.
 *   - A HEAD-style probe may be answered by a cache, an error page with a
 *     coincidental length, or a login wall.
 *
 * So `equivalence` is `'unverified'` wherever any probe was involved, and the
 * ONLY value that may ever claim more is `'byte-identical'`, which requires a
 * recorded digest of both bodies. Nothing in batch 1 computes one, so nothing
 * in batch 1 produces that value.
 */
import { normaliseCandidateUrl } from './ingestion';

/**
 * How an alternative relates to the discovered URL.
 *
 *   redirect-target     The discovered URL was fetched and the server redirected
 *                       to this one. The strongest relation available, because
 *                       the provider's own server asserted it — and still only
 *                       an assertion about where a request goes.
 *   canonical-host      Same path on a host believed to be the provider's
 *                       canonical public hostname, where the discovered href
 *                       pointed at an origin/backoffice host instead.
 *   co-publisher-host   A URL already in the catalogue that appears to be the
 *                       same document published by a co-publisher on their own
 *                       host. Derived from catalogue data, not from a request.
 */
export type UrlRelation = 'redirect-target' | 'canonical-host' | 'co-publisher-host';

/**
 * What a probe of a URL actually observed. Every field is as REPORTED by the
 * server, not as verified by us.
 */
export interface UrlProbe {
  status: number;
  contentType: string | null;
  /** The server's Content-Length header, parsed. Null when absent. */
  reportedContentLength: number | null;
  /** ISO-8601. */
  checkedAt: string;
}

/**
 * How confident we are that two URLs serve the same document.
 *
 *   unverified      Nothing establishes it. The default, and the only value any
 *                   probe-based or catalogue-derived alternative may carry.
 *   not-probed      No request was made against the alternative at all.
 *   byte-identical  Digests of both bodies were computed and matched. RESERVED —
 *                   nothing in batch 1 computes a digest, so nothing produces
 *                   this value. Present so a later batch has somewhere honest to
 *                   put a real result instead of overloading 'unverified'.
 */
export type EquivalenceClaim = 'unverified' | 'not-probed' | 'byte-identical';

export interface UrlAlternative {
  /** The alternative URL, verbatim. */
  url: string;
  relation: UrlRelation;
  /** The discovered URL this was derived from, verbatim. */
  derivedFrom: string;
  /**
   * Exactly what was done to produce `url` from `derivedFrom`, in words.
   * 'none — observed' when no transform was applied.
   */
  transform: string;
  /** Probe of the discovered URL, when one was made. */
  discoveredProbe?: UrlProbe;
  /** Probe of the alternative, when one was made. */
  alternativeProbe?: UrlProbe;
  equivalence: EquivalenceClaim;
  /**
   * What the evidence does and does not establish, in plain language, for a
   * reviewer. Never parsed. Required: an alternative with no statement of its
   * own limits is the failure mode this whole module exists to prevent.
   */
  statement: string;
}

/**
 * Record a redirect the fetch actually followed.
 *
 * `equivalence` stays 'unverified' even though the provider's server performed
 * the redirect: a redirect establishes where a request is sent, not that the
 * body served is the document the index intended to link.
 */
export function redirectAlternative(
  discoveredUrl: string,
  finalUrl: string,
  probe: UrlProbe,
): UrlAlternative {
  return {
    url: finalUrl,
    relation: 'redirect-target',
    derivedFrom: discoveredUrl,
    transform: 'none — the server redirected this request and this is where it landed',
    discoveredProbe: probe,
    equivalence: 'unverified',
    statement:
      'The provider’s server redirected a request for the discovered URL to this one. ' +
      'That establishes where the request went on this occasion; it does not establish that ' +
      'the two URLs are permanently equivalent, nor which one the provider intends to publish. ' +
      'The discovered URL is retained verbatim.',
  };
}

/**
 * Record the same path on a different host, with NO probe performed.
 *
 * This is the ROS case: hrefs on the publications list point at an Umbraco
 * origin hostname rather than the canonical public site. The rewrite is
 * mechanically trivial and the canonical form is what the catalogue already
 * stores — which makes it worth RECORDING and worth an editor's attention, and
 * still does not make it a verified fact about the bytes served.
 *
 * Deliberately takes no probe argument. Batch 1 performs no speculative
 * requests against hosts a provider did not link, so the only honest
 * equivalence value here is 'not-probed'.
 */
export function canonicalHostAlternative(
  discoveredUrl: string,
  canonicalHost: string,
): UrlAlternative | null {
  let parsed: URL;
  try {
    parsed = new URL(discoveredUrl);
  } catch {
    return null;
  }
  if (parsed.hostname.toLowerCase() === canonicalHost.toLowerCase()) return null;

  const rewritten = new URL(discoveredUrl);
  rewritten.hostname = canonicalHost;

  return {
    url: rewritten.href,
    relation: 'canonical-host',
    derivedFrom: discoveredUrl,
    transform: `host substitution ${parsed.hostname} → ${canonicalHost}; path, query and fragment preserved`,
    equivalence: 'not-probed',
    statement:
      `The discovered href points at ${parsed.hostname}, which appears to be an origin or ` +
      `backoffice hostname rather than the provider’s canonical public site. This alternative ` +
      'is the same path on the canonical host, constructed by substitution. NO REQUEST WAS MADE ' +
      'against it: nothing here establishes that it resolves, that it serves the same document, ' +
      'or that the provider intends it as the public address. An editor should confirm before ' +
      'any catalogue entry prefers it. The discovered URL is retained verbatim.',
  };
}

/**
 * Record a catalogue URL that looks like the same document on a co-publisher's
 * host. Derived entirely from catalogue data — no request is made.
 */
export function coPublisherAlternative(
  discoveredUrl: string,
  catalogueUrl: string,
  guidelineId: string,
  sharedPublishers: string[],
): UrlAlternative {
  return {
    url: catalogueUrl,
    relation: 'co-publisher-host',
    derivedFrom: discoveredUrl,
    transform: 'none — read from the existing catalogue entry',
    equivalence: 'not-probed',
    statement:
      `The catalogue entry ${guidelineId} holds this URL, and its publisher set shares ` +
      `${sharedPublishers.join(', ')} with the discovered item. Co-published guidance is commonly ` +
      'republished by each publisher at its own address, so this MAY be the same document on a ' +
      'second host — or a different document by overlapping authors, or a different edition. ' +
      'No request was made against either URL for this comparison and no content was compared. ' +
      'A human must decide which, if either, the catalogue should carry.',
  };
}

/**
 * Every normalised key under which this candidate should be looked up in the
 * catalogue index: the discovered URL plus every recorded alternative.
 *
 * Load-bearing rather than tidy. ROS stores its PDFs in the catalogue under the
 * CANONICAL host while publishing hrefs on the origin host, so a lookup keyed
 * only on the discovered URL would match none of the existing ROS entries and
 * would report every ROS document as new.
 *
 * Normalisation is `normaliseCandidateUrl` from the shared contract, so the
 * discovery matcher and the existing pipelines agree on what "the same URL"
 * means — including its narrow `ver`-stripping, which is what makes the BOFAS
 * token case a token observation rather than a phantom new document.
 */
export function matchKeys(discoveredUrl: string, alternatives: UrlAlternative[]): string[] {
  const keys = [normaliseCandidateUrl(discoveredUrl)];
  for (const alt of alternatives) {
    const key = normaliseCandidateUrl(alt.url);
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** Query parameters treated as volatile cache-busters rather than identity. */
export const VOLATILE_QUERY_PARAMS = ['ver'] as const;

/**
 * The value of a volatile cache-busting parameter on a URL, if present.
 *
 * Returns the parameter's name and raw value so a change in it can be REPORTED
 * AS A STRING DIFFERENCE and nothing more. See the EDITION_TOKEN_CHANGED doc in
 * ./discovery-classification.ts for why that is the whole claim: a `?ver=`
 * token can move for reasons entirely unrelated to the document, so observing
 * that it moved is not evidence of a re-upload, a content change, or an edition.
 */
export function volatileToken(url: string): { parameter: string; value: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  for (const key of Array.from(parsed.searchParams.keys())) {
    if ((VOLATILE_QUERY_PARAMS as readonly string[]).includes(key.toLowerCase())) {
      const value = parsed.searchParams.get(key);
      if (value !== null && value !== '') return { parameter: key.toLowerCase(), value };
    }
  }
  return null;
}
