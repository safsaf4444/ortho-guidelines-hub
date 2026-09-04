// Provider normalisation and outbound provider links.
//
// Moved verbatim out of App.tsx so the canonical-provider rules and the
// provider -> homepage map live together and can be unit-tested. Behaviour is
// unchanged; only the `export` keywords are new.

// "Also published by" (Feature 3): the real co-badging signal in this dataset
// lives inside a single row's `source` string (e.g. "GIRFT / BHS / BOA",
// "BOA (BOASt) with BOFAS"), NOT across separate records — 0 topics appear
// under more than one distinct source. So we surface the co-publishers by
// parsing the source field, splitting only on " / " and " with " at paren depth
// 0. We deliberately do NOT split on "&", "and", or "," because those occur
// inside single society names (e.g. "BAJIS (Bone & Joint Infection Society)",
// "NHFD (RCP / FFFAP)").
export function splitPublishers(source: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (ch === '(') { depth++; buf += ch; continue; }
    if (ch === ')') { depth = Math.max(0, depth - 1); buf += ch; continue; }
    if (depth === 0) {
      if (ch === '/' && source[i - 1] === ' ' && source[i + 1] === ' ') { out.push(buf); buf = ''; continue; }
      if (source.slice(i).toLowerCase().startsWith(' with ')) { out.push(buf); buf = ''; i += ' with '.length - 1; continue; }
    }
    buf += ch;
  }
  out.push(buf);
  return out.map(p => p.trim()).filter(Boolean);
}

// ─── Provider normalisation (Phase 0: presentation only) ─────────────────────
// The "By provider" view used to group on the raw `source` string, which yields
// 53 groups for 231 records because every collaboration spelling becomes its own
// bucket ("BESS", "BESS / BOA", "BESS / BOA / NHS EBI Programme", …).
//
// canonicalProvider() reduces a raw source to the single organisation that owns
// the document. It is a PURE function used only for grouping/sorting — the raw
// `source` string is still rendered verbatim on cards and in the detail view, and
// nothing here reads or writes the database.
//
// Rules (agreed 2026-08-23):
//   R1 first-listed publisher wins; collaborators never form their own group
//   R2 acronym expansions collapse to the acronym  (BASS (British Assoc…) → BASS)
//   R3 series/sub-brands collapse to the parent    (BOA (BOASt), BOA SpecS → BOA)
//   R4 parent-org parentheticals are dropped       (GIRFT (NHS England) → GIRFT)
//   R5 trailing " - Sub-report" is dropped         (GIRFT … - Spinal Services)
//   R6 a few whole strings are overridden outright (see OVERRIDES)
// NHFD is deliberately kept separate from FFFAP.

// Whole-source overrides. These win before any parsing, and exist because the
// first-listed publisher is NOT the owning body for these specific documents.
const PROVIDER_OVERRIDES: Record<string, string> = {
  'Academy of Medical Royal Colleges / NHS England / NICE / GIRFT': 'NHS EBI Programme',
  // UKSSB owns the standard; BASS is listed first but is not the owner here.
  'BASS / UKSSB': 'UKSSB',
};

// Canonical name for a single publisher token, after splitting. Maps long-form
// names and alternate spellings onto one label so the same body cannot produce
// two groups (e.g. "FFFAP (RCP)" and "RCP (FFFAP)").
const PROVIDER_ALIASES: Record<string, string> = {
  'academy of medical royal colleges': 'AoMRC',
  'british geriatrics society': 'BGS',
  'british hip society': 'BHS',
  'british sarcoma group': 'BSG',
  'british scoliosis society': 'BSS',
  'international osteoporosis foundation': 'IOF',
  'nhs evidence-based interventions (ebi) programme': 'NHS EBI Programme',
  'nhs ebi programme': 'NHS EBI Programme',
  'royal osteoporosis society': 'ROS',
  // Both spellings of the RCP falls & fragility fracture audit programme.
  'fffap (rcp)': 'FFFAP',
  'rcp (fffap)': 'FFFAP',
  // Parenthetical here is the parent org, not a sub-brand — keep NHFD distinct.
  'nhfd (rcp / fffap)': 'NHFD',
};

export function canonicalProvider(source: string): string {
  const raw = (source ?? '').trim();
  if (!raw) return 'Unspecified';
  if (PROVIDER_OVERRIDES[raw]) return PROVIDER_OVERRIDES[raw];

  // R1: the owning body is the first publisher listed.
  let name = splitPublishers(raw)[0] ?? raw;

  // Alias check before stripping, so multi-word keys like "NHFD (RCP / FFFAP)"
  // and "FFFAP (RCP)" match while their parentheses are still intact.
  const aliased = PROVIDER_ALIASES[name.toLowerCase()];
  if (aliased) return aliased;

  // R5: drop a trailing " - Sub-report" (GIRFT (NHS England) - Spinal Services).
  name = name.replace(/\s+-\s+.+$/, '').trim();

  // R2/R3/R4: drop a trailing parenthetical. The text OUTSIDE the parentheses is
  // always the provider, whether the inside is an acronym expansion
  // ("BAJIS (Bone & Joint Infection Society)"), a series ("BOA (BOASt)",
  // "British Hip Society (NAHR)"), or a parent org ("GIRFT (NHS England)").
  //
  // Do NOT try to guess from string length which side is the acronym: NAHR is
  // shorter than "British Hip Society" but is a registry/series, not an alias for
  // it, so a length rule wrongly creates a top-level "NAHR" group. The reverse
  // cases where the acronym really is inside the brackets
  // ("British Sarcoma Group (BSG)") are handled by PROVIDER_ALIASES on the outer
  // text instead, which is explicit and cannot misfire.
  const paren = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (paren) name = paren[1].trim();

  // R3: space-separated sub-brand with no parentheses ("BOA SpecS" → "BOA").
  name = name.replace(/^(BOA)\s+SpecS$/i, '$1');

  return PROVIDER_ALIASES[name.toLowerCase()] ?? name.trim();
}

// ─── Outbound provider links ────────────────────────────────────────────────
// Keyed on the CANONICAL provider label (see canonicalProvider above), so every
// collaboration spelling of a source resolves to one entry rather than needing
// one per raw string.
//
// Each URL is the organisation top-level or guidance index page. Top-level
// pages are preferred over deep guidance paths because they are far more
// stable — a deep link that 404s during a demo is worse than one extra click.
//
// Domains were taken from the links already present in the dataset for that
// provider, not invented. Four entries are judgement calls flagged for review:
//   BLRS, BOOS  — no own-domain link exists in the dataset; their documents are
//                 hosted on boa.ac.uk, so the BOA site is used.
//   BSS         — British Scoliosis Society sits under the UK Spine Societies
//                 Board; its dataset links are all journal DOIs.
//   IOF         — dataset links point at the Capture the Fracture programme
//                 rather than the IOF corporate site.
//
// A provider with no entry here renders as plain text, exactly as before — the
// UI degrades rather than emitting a guessed link.
export const PROVIDER_URLS: Record<string, string> = {
  'BAJIS': 'https://bajis.org/',
  'BASK': 'https://baskonline.com/',
  'BASS': 'https://spinesurgeons.ac.uk/',
  'BESS': 'https://bess.ac.uk/',
  'BHS': 'https://britishhipsociety.com/',
  'BLRS': 'https://www.boa.ac.uk/',
  'BOA': 'https://www.boa.ac.uk/',
  'BOFAS': 'https://www.bofas.org.uk/',
  'BOOS': 'https://www.boa.ac.uk/',
  'BOSTAA': 'https://bostaa.ac.uk/',
  'BSCOS': 'https://www.bscos.org.uk/',
  'BSG': 'https://britishsarcomagroup.org.uk/',
  'BSS': 'https://ukssb.com/',
  'BSSH': 'https://www.bssh.ac.uk/',
  'EANM': 'https://www.eanm.org/',
  'FFFAP': 'https://www.fffap.org.uk/',
  'GIRFT': 'https://gettingitrightfirsttime.co.uk/',
  'IOF': 'https://www.capturethefracture.org/',
  'NHFD': 'https://www.nhfd.co.uk/',
  'NHS EBI Programme': 'https://ebi.aomrc.org.uk/',
  'NHS England': 'https://www.england.nhs.uk/',
  'NICE': 'https://www.nice.org.uk/guidance',
  'NOGG': 'https://www.nogg.org.uk/',
  'OTS': 'https://www.orthopaedictrauma.org.uk/',
  'ROS': 'https://theros.org.uk/',
  'UKSSB': 'https://ukssb.com/',
};

/**
 * Homepage for the body that owns `source`, or null when we have no confident
 * URL for it. Callers must render plain text on null rather than guessing.
 */
export function providerUrl(source: string): string | null {
  return PROVIDER_URLS[canonicalProvider(source)] ?? null;
}
