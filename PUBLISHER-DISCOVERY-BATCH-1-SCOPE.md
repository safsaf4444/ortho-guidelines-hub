# Publisher discovery — implementation batch 1 scope

**Providers:** NHS EBI, ROS, BESS, BOFAS
**Prepared:** 2026-10-12 · **Revised:** 2026-10-12 (rev 2) · **Status:** scope only — nothing implemented, nothing scheduled, nothing deployed.

This document is the output of the pre-coding pass. It records what was checked
live, what that changes about the design, and the bounded set of work that
follows. It deliberately stops before the first line of adapter code.

**Revision note (rev 2).** Rev 1 claimed *"the catalogue holds 0 ROS entries"*.
**That was wrong.** It came from a naive substring test (`source.includes('ROS')`)
rather than the authoritative publisher splitter; ROS sources are spelled
`"Royal Osteoporosis Society"` in full, which contains no `ROS` substring. The
correct figure is **4 entries**. §2.0 reconciles every provider count using the
authoritative method, and §2.2 / §5 / §10 are revised accordingly. Four further
corrections in rev 2: discovered URLs are now preserved **verbatim** with
canonical-host alternatives recorded separately (§2.3); ROS access approval is
marked **unresolved** and gates the ROS adapter (§1.1); dependencies now separate
**file-output** requirements from **future database-staging** requirements (§8);
and the soft matcher must union the publisher set with the canonical owner to
survive `PROVIDER_OVERRIDES` (§4.2).

---

## 0. Boundary

What this batch **does not** do, stated first so it cannot be read as implied:

- No production change. No Supabase migration applied, no RPC deployed, no row written.
- **No schedule activation.** No workflow is armed, enabled or added to a cron.
  `detect-changes.yml` and `guideline-sync.yml` are untouched.
- **PR #174 (`feat/stage-detected-changes`, 72f796a) stays paused and unmerged.**
  Its schema — the `staged_guidelines` revision columns, `staged_detections`,
  `stage_detected_change()`, `advance_content_hashes()`, and the `42809`
  approval block — is **not live**. Nothing in this batch resumes it, merges it,
  or depends on it. **Batch 1 produces files and requires none of #174 to do so**
  (§8.1).
- No existing catalogue entry is modified. The new-edition model in §5 is a
  **proposal expressed as one worked entry**, not a migration and not a backfill.
- No scope beyond the four providers named above and the files listed in §9.

---

## 1. Access and reuse terms — what was actually checked

`robots.txt` fetched live on all four hosts, 2026-10-12. **No host disallows the
target discovery paths, and none publishes a `Crawl-delay`.**

| Provider | robots.txt on target paths | Declared reuse licence | Linking | Consequence for the batch |
|---|---|---|---|---|
| **NHS EBI** (`ebi.aomrc.org.uk`) | `User-agent: * / Disallow:` (empty — nothing blocked). Sitemap: `sitemap_index.xml` | **None.** Footer asserts `© 2026 Academy of Medical Royal Colleges`. No OGL, no Creative Commons. | Not addressed | Treat as all-rights-reserved. Title + URL + publisher-stated dates only. |
| **ROS** (`theros.org.uk`) | `Disallow:` empty. Sitemap: `sitemap-index.xml` | **Explicitly restrictive**: *"Unauthorised use of the Material including reproduction, storage, modification, distribution or republication without the prior written consent … is prohibited."* | *"It is not necessary to request permission to link to the Website, although we reserve the right to request the removal of any link."* | **Access approval unresolved — see §1.1. The ROS adapter is written but not run.** |
| **BESS** (`bess.ac.uk`) | Disallows only WooCommerce/`wp-admin` paths; guidance paths unrestricted. `admin-ajax.php` explicitly `Allow`ed | None found | Not addressed | Title + URL. Summary capture is possible but not needed in batch 1. |
| **BOFAS** (`www.bofas.org.uk`) | Disallows DNN platform paths (`/admin/`, `/bin/`, `/Config/`, `/*/ctl/` …); `/clinician/…` and `/Portals/…` unrestricted | None found | Not addressed | Title + URL. Already the existing adapter's behaviour. |

**Decision carried into the design:** no provider in this batch grants reuse. So
the discovery layer's output contract is narrowed to **bibliographic facts only —
title verbatim, URL, publisher-stated date strings**, and the response cache (§7)
is explicitly transient and non-published. This is a tightening of today's
behaviour, where `createRSSAdapter` stores a 250-character provider blurb.

No host's terms address automated access, crawling or data mining. That is an
**absence of permission as much as an absence of prohibition** — it is not a
licence, and the batch does not treat it as one.

### 1.1 ROS: permission to link is not permission to collect — **UNRESOLVED**

Rev 1 reasoned that because ROS expressly permits linking, title-and-URL
collection was within terms. **That inference does not hold and is withdrawn.**

ROS's terms grant exactly one thing: permission for a third party to *place a
hyperlink* to their site. They say nothing about **automated retrieval of their
pages, repeated scheduled fetching, or storage of anything derived from them** —
and the same terms separately prohibit *"reproduction, storage, modification,
distribution or republication"* of their Material without prior written consent.
Whether a scraped title string and a stored URL constitute "storage of Material"
is **a question for ROS, not for us to resolve by reading their link clause
generously.**

Accordingly:

- **ROS access approval status: `UNRESOLVED`.**
- The ROS adapter may be **written and unit-tested against offline fixture HTML**
  (no network), because that is not collection.
- **The ROS adapter is not run against the live site** — not in CI, not in a
  local dry-run, not once "just to see" — until approval is resolved.
- Registry status is **`awaiting-approval`** (§6), which is visible in every
  coverage report, fetches nothing, and fails nothing.
- Resolution path: a written approach to ROS describing exactly what would be
  collected (title verbatim, URL, their own date strings), at what frequency
  (weekly), and what would be stored and published (a link and a title). That
  approach is **not drafted or sent by this batch** — it is decision 3 in §10.

The same question is open in principle for NHS EBI, BESS and BOFAS, none of whom
address automated access either. The difference is that ROS **affirmatively
asserts a storage prohibition**, which moves it from *unaddressed* to
*unresolved*. The other three proceed on the existing footing the project has
used for BOA, BSG, BOFAS and BSSH since August, with read volume at one
conditional request per surface per run; raising the question for them generally
is noted in §10 as a standing governance item, not as a batch-1 blocker.

---

## 2. Baselines and discovery surfaces — confirmed live

### 2.0 Reconciling the catalogue baseline — the authoritative method

Rev 1's per-provider counts were produced with `source.includes('<TAG>')`. That
is not the authoritative attribution rule and it was wrong in both directions:
it **missed** publishers written in long form, and it would **over-count** any
tag appearing inside another name.

The authoritative rule is the one the app itself uses —
`splitPublishers()` then `canonicalProvider()` from `src/lib/providers.ts`,
applied **per token**, because `canonicalProvider()` on a whole source string
yields only the *first-listed* publisher by its own rule R1. Re-run against all
231 entries:

| Provider | Owner (canonical, R1 + overrides) | Appears as any publisher | Rev 1 claimed | Correct? |
|---|---|---|---|---|
| **NHS EBI Programme** | **18** | **19** | 2 | ✗ rev 1 wrong |
| **BOFAS** | **15** | **17** | 17 | ~ rev 1 counted "any publisher" |
| **BESS** | **12** | **12** | 12 | ✓ |
| **ROS** | **4** | **4** | **0** | ✗ **rev 1 badly wrong** |

**Why ROS read as zero:** all four entries carry
`source: "Royal Osteoporosis Society"`. The string contains no uppercase `ROS`
substring, so `includes('ROS')` matched nothing. The alias
`'royal osteoporosis society' → 'ROS'` already exists in `PROVIDER_ALIASES` and
resolves it correctly. The error was entirely in the ad-hoc check, not in the
catalogue or the splitter.

The four ROS entries:

| id | `subGroup` | Primary URL |
|---|---|---|
| `ros-clinical-quality-toolkits` | — | `theros.org.uk/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/` |
| `ros-osteoporosis-quality-standards` | November 2017 | `theros.org.uk/media/0dillsrh/ros-op-standards-november-2017.pdf` |
| `ros-fls-clinical-standards` | 2019 | `theros.org.uk/healthcare-professionals/clinical-quality-hub/fracture-liaison-services/` |
| `ros-vertebral-fracture-identification` | November 2017 | `theros.org.uk/media/3daohfrq/ros-vertebral-fracture-guidelines-november-2017.pdf` |

Three things follow, none of which rev 1 could see:

1. **ROS is already in editorial scope.** The §10 question is no longer *"is ROS
   in scope at all"* — it is settled; the open question is access approval (§1.1).
2. **The catalogue already stores ROS PDFs in the canonical
   `theros.org.uk/media/<guid>/<slug>.pdf` form**, not the Umbraco origin form.
   This is decisive for §2.3: the canonical host is the form that matches, so a
   discovery adapter that recorded only the verbatim origin-host URL would match
   none of these and report every ROS document as new.
3. **Two entries carry stale paths** (`/healthcare-professionals/…`, without
   `for-`), while the live site serves `/for-healthcare-professionals/…`. Redirect
   handling is not optional.

### 2.1 Predicted batch-1 outcome per provider

Stated in advance so the first dry-run can be reconciled against it rather than
interpreted after the fact.

| Provider | Surface items | Catalogue baseline | Predicted |
|---|---|---|---|
| **NHS EBI** | 17 on `/specialty/musculoskeletal-spine/` | 17 `ebi-*` entries | **17 matched, 0 new — exact 1:1.** A control case: any candidate at all means either EBI published something or the matcher is broken. |
| **BOFAS** | 10 on the publications index | 17 (15 owner) | 5 matched by URL, 5 unmatched — of which **4 are already held on another host** (§4.1) |
| **BESS** | 9 on the static pathways page | 12 | Partial surface; 3 catalogue entries use a WPFD form this surface cannot see |
| **ROS** | 9 on the publications list | 4 | **Not run** (§1.1). On paper: ~1 likely edition/better-link match, ~1 soft-match needing judgement, remainder new |

The NHS EBI 1:1 result is the single most useful thing in this table: it is a
**calibration baseline** that can distinguish a matcher regression from a real
publication, which no other provider in the batch can offer.

### 2.2 Surfaces and filters

**NHS EBI — clean taxonomy, and the find of the pass.**

- `intervention-sitemap.xml` → **63 URLs**, all `/interventions/<slug>/`.
- `specialty-sitemap.xml` → 13 taxonomy terms, including
  **`/specialty/musculoskeletal-spine/` → 17 interventions** (the
  guidance-specific filter, using the publisher's own classification rather than
  a keyword guess) and **`/specialty/retired-guidance/` → 1** (troponin test).
- Each intervention page carries **publisher-stated dates**:
  `"Published January 2020"`, `"Last reviewed September 2024"` (verbatim labels,
  confirmed on `arthroscopic-surgery-for-meniscal-tears`).
- No pagination, no "List 1 / List 2" label on the page or in the taxonomy.
- The `musculoskeletal-spine` URL is **already a catalogue version link** on all
  17 `ebi-*` entries (as their fallback index page), which is independent
  confirmation that this is the right surface.

`retired-guidance` is a **publisher-asserted withdrawal signal** — the thing
`scripts/lib/ingestion.ts` names as undetectable under URL-only matching
(`WITHDRAWN`). Membership is a *source assertion*, reported as such, and changes
no catalogue status by itself.

**ROS — not greenfield, and the hrefs point at the origin host.**

- Surface: `/for-healthcare-professionals/clinical-quality-hub/clinical-quality-toolkits/clinical-publications-and-resources/`
  → **9 publications**, a plain `<ul>/<li>/<a>` list of PDFs.
- Edition evidence sits in anchor text and filename: `"August 2025"`,
  `"2022 revision"`, `v2`, `"March 2019"`.
- **Every PDF href points at `royal-osteoporosis-society.uksouth01.umbraco.io`**
  — the Umbraco origin host, not the canonical site. See §2.3.
- One of the nine is **NOGG/ROS co-published** (romosozumab consensus statement)
  and will interact with the 2 existing NOGG entries.
- Nothing is fetched from this surface until §1.1 is resolved. The figures above
  come from the single pre-coding read already performed to write this document;
  no scheduled or repeated collection has occurred.

**BESS — the static page only; the file manager is out of scope.**

- Surface: **`/patient-care-pathways-and-guidelines/` → 9 documents**, all
  `/wp-content/uploads/<yyyy>/<mm>/<file>.pdf`, under two `<h3>` headings
  ("Patient Care Pathways", "Guidelines").
- **`/national-guidelines/` is deliberately excluded.** It is a
  `wp-file-download` manager whose category tree loads via `admin-ajax.php`;
  static HTML contains no document links. Reverse-engineering that is a separate
  decision, not batch-1 work.
- Consequence stated now rather than discovered later: **the catalogue holds BESS
  URLs this surface cannot see** — the WPFD form
  `/download/<catId>/<cat-slug>/<fileId>/<file>.pdf` (e.g.
  `…/1421/primary-intermediate-care-guidelines/6238/…`, verified still `200`).
  Three entries use it. BESS coverage is **partial by design** (§6).
- The earlier finding stands and is not re-litigated: the BESS RSS feed is
  general site content (events, fellowships, member posts), not guidance. No feed
  adapter.

**BOFAS — index unchanged, matching is the problem.**

- Surface: `/clinician/research/bofas-publications` → **10 PDFs** under three
  `<h2>` sections. The existing `BOFASAdapter` still parses it correctly; its
  parse rules are not touched.
- Still out of scope, unchanged: **Round Table consensus booklets** and the
  **Hyperbook**, both already in the catalogue (1 and 6 entries respectively) via
  a route this adapter does not cover.
- Every href carries a DNN `?ver=<token>` cache-buster — both a hazard and the
  only in-place-replacement signal BOFAS offers (§4.1).

### 2.3 URL handling: verbatim discovery, canonical alternative recorded separately

Rev 1 proposed rewriting the ROS origin host to `theros.org.uk` in the adapter.
**That is withdrawn.** It would have made the adapter emit a URL the provider
never published, violating the verbatim contract in
`scripts/lib/provider-adapter.ts` (*"Every field is VERBATIM from the provider.
Whitespace collapsing and a fixed-length truncation are the only permitted
transforms"*). An adapter that silently substitutes a hostname is exactly the
kind of invented metadata that contract exists to prevent.

The rule instead:

1. **`versions[0].url` is the href the provider published, byte-for-byte**, after
   nothing but standard relative-reference resolution. For ROS that is the
   `…umbraco.io/media/<guid>/<slug>.pdf` URL.
2. **A canonical alternative is recorded in a separate field**, never overwriting
   the discovered one:

```jsonc
"urlAlternatives": [
  {
    "url": "https://theros.org.uk/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf",
    "relation": "canonical-host",
    "derivedFrom": "https://royal-osteoporosis-society.uksouth01.umbraco.io/media/kugfzmr2/ros-bone-densitometry-service-guidelines-august-2025-1.pdf",
    "transform": "host-substitution; path, query and fragment preserved byte-for-byte",
    "evidence": {
      "checkedOn": "2026-10-12",
      "discoveredHost": { "status": 200, "contentType": "application/pdf", "contentLength": 694663 },
      "alternativeHost": { "status": 200, "contentType": "application/pdf", "contentLength": 694663 },
      "basis": "both hosts served the same path with identical status, content type and byte length",
      "equivalenceProven": false,
      "note": "Identical byte length is strong evidence of the same file, NOT proof. No body comparison or digest was performed. Treat as a verified-equivalent candidate requiring human confirmation before the alternative is preferred in the catalogue."
    }
  }
]
```

3. **Matching tries the discovered URL and every recorded alternative.** This is
   load-bearing, not tidiness: §2.0 shows the catalogue stores ROS PDFs in the
   **canonical** form, so a discovered-URL-only match would report every ROS
   document as new. The candidate records **which** URL produced the match.
4. **An alternative is never silently promoted.** Which URL a catalogue entry
   should carry is an editorial decision. The candidate presents both with the
   evidence above and says plainly that the discovered host is an internal origin
   hostname — which is a reason for an editor to prefer the canonical one, not a
   licence for the pipeline to decide.
5. **The same mechanism covers redirects.** Where a fetch redirects (ROS's
   `/healthcare-professionals/` → `/for-healthcare-professionals/`), the
   requested URL stays verbatim and the final URL is recorded as an alternative
   with `relation: "redirect-target"` and its observed status chain. No existing
   catalogue entry's stale path is rewritten by this batch.

Nothing here is ROS-specific in design, and the `relation` vocabulary is
deliberately small — `canonical-host`, `redirect-target`, `co-publisher-host`
(§4.1) — with no fourth member added speculatively.

---

## 3. `lastmod` is discovery metadata, not publication proof

Held as a rule, and the pass produced direct evidence for it:

- **BESS disagrees with itself.** `sitemap.xml` reports the pathways page at
  `lastmod 2026-03-17T12:47:49Z`; the live `Last-Modified` header on the same
  page is `Fri, 25 Sep 2026 12:12:00 GMT`. Two server-generated timestamps, six
  months apart, for one page. Neither is a publication date.
- **NHS EBI's sitemap lastmods move in lockstep.** `intervention-`, `alphabet-`
  and `specialty-` sitemaps all report `2026-01-06T15:19:38+00:00` — a CMS-wide
  regeneration, not 63 documents revised at one instant.
- Meanwhile the EBI intervention page states `"Last reviewed September 2024"` in
  its own words.

**Rule for the implementation:**

| Signal | Class | Stored as | May it alter catalogue state? |
|---|---|---|---|
| sitemap `<lastmod>`, HTTP `Last-Modified`, `ETag` | **Discovery metadata** — server artefact | Fetch provenance on the candidate | **Never.** Not even as a date. |
| `"Published January 2020"`, `"August 2025"`, `"2022 revision"`, `v1.0`, a year in anchor text or filename | **Publisher-stated assertion** | Verbatim string, with the surface it was read from | Only via a human review decision |
| Body content hash | **Change observation** | Detection evidence | Signals *that* something moved; never *what* |

A date is never parsed into a structured date field by this batch. `subGroup` is
already overloaded free text (`"Published Aug 2024"`, `"Withdrawn pending
review"`, `"Nov 2020, updated March 2021"` — see `FOLLOW-UPS.md`); batch 1 adds
nothing to that pile and invents no precision the source did not state.

---

## 4. Title and reference matches are *possible* new editions, never confirmed ones

### 4.1 The evidence

URL-only matching is wrong in both directions, and the BOFAS index proves it.
Measured against the live catalogue (231 entries), of the 10 PDFs on the BOFAS
publications index:

| # | Index item | URL-only verdict | Reality |
|---|---|---|---|
| 1 | VTE position statement (2025) | matched | correct |
| 2 | FAME study statement (2019) | matched | correct |
| 3 | Total ankle replacement statement (2019) | matched | correct |
| 4 | Diabetic foot guidelines (2016) | matched | correct |
| 5 | BOFAS Pathways of Care | matched | correct |
| 6 | **SpecS: end-stage ankle arthritis (2025)** | **NEW_GUIDELINE** | Already held as `end-stage-ankle-arthritis`, on `boa.ac.uk/asset/…` |
| 7 | **BOFAS/BOA ankle fracture BOAST (2016)** | **NEW_GUIDELINE** | Already held as `ankle-fracture`, on `boa.ac.uk/asset/…` |
| 8 | **Flatfoot commissioning guidelines** | **NEW_GUIDELINE** | Already held as `bofas-flatfoot-commissioning`, on `boa.ac.uk/static/…` |
| 9 | **BOAST mobilisation guidelines (2024)** | **NEW_GUIDELINE** | Already held **twice** — `mobilisation-weightbearing` (boa.ac.uk) and inside `bscos-weightbearing-consensus` (bscos.org.uk) |
| 10 | UK-FALCON audit report (2022) | NEW_GUIDELINE | genuinely absent |

**4 of the 5 "new" BOFAS candidates are documents the catalogue already holds, on
a second or third host.** A co-published document is republished by each
co-publisher at its own URL; URL identity cannot see that. These are recorded
with `relation: "co-publisher-host"` under §2.3 — again preserving the discovered
URL and presenting the already-held URL as the alternative.

And the reverse: **BOFAS's `?ver=` token means an in-place replacement is
invisible.** `normaliseCandidateUrl()` strips `ver` (correctly — otherwise every
run re-emits every BOFAS document), so when BOFAS re-uploads the same path with
new content, the URL still matches and **no candidate is produced at all**.

### 4.2 The three candidate classes

1. **`NEW_GUIDELINE`** — no URL match (across the discovered URL *and* its
   recorded alternatives) and no soft match. Unchanged behaviour, unchanged
   semantics.
2. **`POSSIBLE_NEW_EDITION`** — URL unmatched, but title/reference overlaps an
   existing entry whose publisher set intersects. Carries `matchedGuidelineId`,
   the evidence that produced the match, and an explicit
   `verificationRequired: true`. Covers the BOFAS second-host rows above and the
   BESS new-upload-folder case in §5. **Never auto-applied.**
3. **`EDITION_TOKEN_CHANGED`** — URL matches after `ver`-stripping, but the raw
   `?ver=` token differs from the one last observed. Reported as *the publisher
   re-uploaded this path*, with no claim about what changed.

A soft match is a **prompt for a human**, and its wording stays at that altitude:
*"title and publisher overlap `ankle-fracture`; the URL is new. Possible new
edition, possible second host, possible neither."*

**Reuse, and the one trap in it.** The matcher reuses `topicTokens` +
`jaccardSimilarity` from `src/lib/duplicate-detection.ts` and `splitPublishers` /
`canonicalProvider` from `src/lib/providers.ts`. Two things it must *not* copy:

- The existing pair-matcher gates topic signals on `normalizedSource` **equality**,
  which is why it would miss rows 6–9 (`"BOA (BOASt) with BOFAS"` ≠ `"BOFAS"`).
  The discovery matcher compares **publisher sets for overlap**, not source
  strings for equality.
- **A publisher set alone is not enough**, because `PROVIDER_OVERRIDES` exists.
  `nhs-ebi-programme` has
  `source: "Academy of Medical Royal Colleges / NHS England / NICE / GIRFT"`,
  whose token set is `[AoMRC, NHS England, NICE, GIRFT]` — it does **not** contain
  `NHS EBI Programme`, even though the override makes NHS EBI its canonical
  owner. An EBI-discovered item would fail to overlap the one catalogue entry
  that *is* the EBI programme. So the comparison set is
  **`publisherSet(source) ∪ { canonicalProvider(source) }`**, which picks up
  override-only ownership. This is the single subtlety in the matcher and the
  reason `edition-match.ts` is its own tested module rather than three lines
  inline.

---

## 5. The new-edition model — one worked entry

Expressed as a single real entry so the shape is arguable. **Not applied. No
existing entry is updated by this batch, automatically or otherwise.**

### Why `versions[]` cannot carry this

`versions[]` is **a link list, not an edition history** — and the catalogue
proves it: 228 of 231 entries have ≥2 versions, almost all
`[primary document, "Fallback / index page"]`, with labels like
`"Supplementary material (BJJ)"` and
`"Attempted direct deep link (returns 'Error - Not found!' …)"`. Overloading it
with supersession would make a field that currently means *"here are the links"*
also mean *"here is the lineage"*, and no reader could tell which a given row is.
That is the `subGroup` mistake a second time.

So: a **separate, additive, nullable `editions[]`**, and `versions[]` untouched.

### The entry: `bess-subacromial-shoulder-pain`

Chosen because a real new edition **already happened here and the catalogue
absorbed it silently**: the 2025 PDF sits under the `/2026/03/` upload folder (a
new URL), the 2015 commissioning guide URL still resolves, and nothing records
that an edition boundary was crossed.

Today:

```jsonc
{
  "id": "bess-subacromial-shoulder-pain",
  "topic": "Subacromial shoulder pain",
  "source": "BESS / BOA",
  "subGroup": "2025",                     // free text, de-facto publication date
  "versions": [
    { "label": "2025", "url": ".../2026/03/Subacromial-Shoulder-Pain-2025.pdf" },
    { "label": "Fallback / index page", "url": ".../patient-care-pathways-and-guidelines/" },
    { "label": "Commissioning Guide - Subacromial Pain (2015)", "url": ".../Subacromial-Shoulder-Commissioning-Guide_final1.pdf" }
  ]
}
```

Proposed — **`versions[]`, `subGroup`, `source`, `topic` all byte-for-byte
unchanged**, one new optional array:

```jsonc
{
  // ... every existing field exactly as above, unchanged ...

  "editions": [
    {
      "editionLabel": "2025",                       // VERBATIM from the provider's anchor text
      "url": "https://bess.ac.uk/wp-content/uploads/2026/03/Subacromial-Shoulder-Pain-2025.pdf",
      "urlAlternatives": [],                        // §2.3; empty when the provider's own host is canonical
      "standing": "current",                        // current | retained | superseded | unknown
      "statedBy": "publisher",                      // publisher | editor
      "statedAs": "Subacromial Shoulder Pain – 2025",
      "statedOn": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
      "firstObserved": "2026-10-12",                // OUR observation. Not a publication date.
      "confirmedBy": null,                          // editor id once a human has read the document
      "confirmedOn": null
    },
    {
      "editionLabel": "2015 commissioning guide",
      "url": "https://bess.ac.uk/wp-content/uploads/2020/06/Subacromial-Shoulder-Commissioning-Guide_final1.pdf",
      "urlAlternatives": [],
      "standing": "unknown",
      "relationshipToCurrent": "unverified",        // ← the load-bearing field
      "relationshipNote": "Both are published on the BESS index and both resolve. A commissioning guide and a care pathway are different document types; whether the 2025 pathway supersedes the 2015 commissioning guide has NOT been established and is not asserted here.",
      "statedBy": "publisher",
      "statedOn": "https://bess.ac.uk/patient-care-pathways-and-guidelines/",
      "firstObserved": "2026-10-12",
      "confirmedBy": null,
      "confirmedOn": null
    }
  ],
  "editionHistoryStatus": "machine-proposed"        // machine-proposed | editor-confirmed | not-applicable
}
```

Five properties the model has to hold, and does:

1. **A machine can populate it, and it still reads as unconfirmed.**
   `editionHistoryStatus: "machine-proposed"` and `confirmedBy: null` are the
   whole claim. Nothing renders as fact until an editor sets them.
2. **"I don't know the relationship" is representable.** `standing: "unknown"` +
   `relationshipToCurrent: "unverified"` is a legitimate terminal state, not a
   gap to be filled by a guess. The second edition above is honestly in it.
3. **Publisher assertion is separated from our observation.** `statedAs` /
   `statedOn` (theirs, verbatim, with the surface it was read from) vs
   `firstObserved` (ours). No field mixes the two.
4. **The discovered URL stays verbatim**, with canonical and co-publisher hosts
   in `urlAlternatives` carrying their own evidence (§2.3). An edition is never
   identified by a URL we constructed.
5. **It is additive and nullable, and supersession is never machine-written.**
   231 entries are valid with `editions` absent — no backfill, no migration in
   this batch. A machine may propose `standing: "unknown"`; only an editor may
   write `"superseded"`, and only with `confirmedBy` set — the same separation
   the paused migration already makes between `superseded_at` (machine) and
   `reviewed_at` / `reviewed_by` (human).

---

## 6. Coverage reporting — five states, so exclusion is visible without failing

Today's model has two outcomes (`report` or `report.error`) plus a third that is
invisible: **a deliberately excluded provider simply has no adapter**, so GIRFT
and BASK appear in `blocked-sources.json` and nowhere in any coverage output.
That is the gap to close. A provider intentionally left out must be *visible in
the report* without *failing the run*.

A registry entry per provider, with an explicit status:

| Status | Meaning | Fetches? | Counts as failure? | Exit code impact |
|---|---|---|---|---|
| `active` | Adapter runs, results expected | yes | A throw does fail it | Non-zero only if an `active` adapter throws |
| `partial` | Adapter runs; a known sub-surface is not covered, named in the entry | yes | No | None |
| `awaiting-approval` | Adapter exists and is unit-tested offline; **access approval unresolved** | **no** | No | None |
| `excluded` | Deliberate and settled. Carries a reason and a date. | no | No | None |
| `blocked` | Provider wants to be reachable but is not (WAF/403/401) | no | No — but reported every run, never silently dropped | None |

`awaiting-approval` is distinct from `excluded` on purpose: `excluded` is a
closed decision, this is an **open question with a named owner**. Collapsing them
would hide the thing §1.1 exists to keep visible.

Batch-1 registry:

```
NHS EBI   active             musculoskeletal-spine + retired-guidance
BESS      partial            static pathways page only; /national-guidelines/ WPFD manager not covered
BOFAS     partial            publications index only; Round Table booklets + Hyperbook not covered
ROS       awaiting-approval  access approval unresolved (§1.1); adapter written, never fetched
GIRFT     excluded           403 to all automated clients by design (blocked-sources.json, 2026-08-22)
BASK      excluded           Cloudflare bot challenge (blocked-sources.json, 2026-07-28)
OTS       excluded           HTTP 401 to automated requests (blocked-sources.json, 2026-07-28)
```

Every status appears in the coverage report every run, with its reason and the
date it was set. `excluded` and `awaiting-approval` are sentences in the report,
not errors and not absences — so *"discovery covers N of 26 publishers"* becomes
answerable from the artefact instead of from `FOLLOW-UPS.md`.

The existing coverage assertion (`totalDiscovered == matched + blocked +
candidates`, warned and never fatal) is extended to the new candidate classes
rather than replaced.

---

## 7. Caching that cannot hide a new publication

Validator support was probed live on all four surfaces. It is not uniform — and
the first measurement was taken with the wrong client, which is worth recording
rather than quietly fixing.

**Correction (rev 3, after implementation).** The table below originally read
from `curl` probes, which send no `Accept-Encoding` by default. The implemented
fetcher uses Node's `fetch`, which advertises `gzip, deflate, br`. Under that
request **BESS serves `content-encoding: br` and drops `Last-Modified`
entirely**, so the `If-Modified-Since` path that curl verified is not available
to the code. Measured again with the actual client:

| Provider | Validators offered **to this client** | Conditional request | Measured |
|---|---|---|---|
| **NHS EBI** | **None** (Cloudflare `cf-cache-status: DYNAMIC`) | Not possible | confirmed in the live run — every request unconditional |
| **BESS** | **None under compression.** `Last-Modified` present to `curl` without `Accept-Encoding`; absent to Node `fetch` | Not possible as implemented | confirmed in the live run |
| **BOFAS** | **None.** `Cache-Control: no-cache` | Not possible | confirmed in the live run |
| **ROS** | `ETag` + `must-revalidate` to `curl`; **untested with this client** and will stay untested while access approval is unresolved | Unverified | **not measured with the real fetcher** |

So "this host supports conditional requests" is a fact about a host **and a
request**, not about a host. The design is unchanged by this — a host offering no
validator was always going to get an unconditional fetch plus a body-hash
comparison, which is what all three active providers now do — but two things
follow:

1. The implementation **does not** send `Accept-Encoding: identity` to
   manufacture a validator. That would spend the publisher's bandwidth on every
   run to buy us a header, which is the wrong trade.
2. The report must never imply a revalidation that did not happen, so every
   unconditional request records **why**: `no-stored-entry`,
   `no-validator-offered-by-host`, or `stored-validator-past-trust-window`.
   Those three read very differently and were previously indistinguishable.

The ROS row is the one to be careful with: a `304` was observed from `curl`, and
that is **not** evidence the implemented client would get one.

Rules:

1. **Every run performs a request for every `active` / `partial` surface.** A
   cache hit is never a reason to skip a surface. Two providers cannot be
   revalidated at all, so *"revalidate where possible, else refetch"* is the only
   honest rule.
2. **Where a validator exists, revalidate** (`If-None-Match` /
   `If-Modified-Since`). `304` → unchanged, reuse the stored body. `200` →
   re-parse and re-hash.
3. **Where no validator exists, always fetch the body and hash it.** EBI and
   BOFAS get a full fetch every run. Their sitemap `lastmod` is not a substitute
   (§3), and this is one page each.
4. **A hard TTL caps every entry regardless of validator** (proposed: 24h, under
   the weekly cadence). An entry past TTL is refetched unconditionally — the
   backstop against a provider serving a wrong `ETag` or a frozen
   `Last-Modified`, which is exactly the shape of BESS's self-contradicting
   timestamps.
5. **The cache is keyed on the final URL after redirects**, so ROS's
   `/healthcare-professionals/` → `/for-healthcare-professionals/` move cannot
   produce two entries for one page. The requested URL is still recorded verbatim
   (§2.3).
6. **The cache is transient, process-local or `.gitignore`d, and never
   published.** It holds nothing beyond the current run. It is a bandwidth
   courtesy to the publisher, never a source of truth: `304` means *the page did
   not change*, and the batch states that plainly rather than letting it read as
   *nothing was published*.
7. **A `304` is recorded in the coverage report as a revalidated no-change
   observation**, with its validator. A surface returning `304` for many
   consecutive runs is reported, not hidden — a frozen page is itself worth a
   human glance.
8. **No ROS entry is created at all** while §1.1 is unresolved, because nothing
   is fetched.

---

## 8. Dependencies

Rev 1 ran these together under one heading, which read as though batch 1 needed
PR #174. **It does not.** The two sets are separated here.

### 8.1 To produce the discovery files — what batch 1 actually needs

**Nothing from PR #174. No migration, no RPC, no column, no table, no grant.**

Batch 1's output target is the existing file path: `candidates.json` plus a
coverage report — `.gitignore`d, uploaded as a CI artefact, consumed by nobody
automatically. `sync-providers.ts` opens no database connection today and opens
none after this batch. There is no import from #174's branch, no branch taken off
it, and no ordering constraint between the two.

| # | Dependency | State | Why it blocks |
|---|---|---|---|
| F1 | Candidate vocabulary: `POSSIBLE_NEW_EDITION` + `EDITION_TOKEN_CHANGED` added to `ChangeReason` in `scripts/lib/ingestion.ts`, plus the evidence fields | Not started | Every member of that union is a promise some reviewer will triage. Adding two is a deliberate contract change; the file says not to do it casually. |
| F2 | `edition-match.ts` — publisher-set-overlap soft matcher returning evidence, with the `PROVIDER_OVERRIDES` union of §4.2 | Not started | §4. Without it BOFAS alone emits 4 false-new candidates out of 5. |
| F3 | Provider registry with the five statuses of §6 | Not started | §6. Exclusion and unresolved approval are currently invisible. |
| F4 | `urlAlternatives` on the candidate, and matching across discovered URL + alternatives | Not started | §2.3. Without it ROS matches none of its 4 existing entries. |
| F5 | Revalidating cache per §7 | Not started | Correctness of the no-change signal. |
| F6 | **ROS access approval** | **Unresolved** | §1.1. Gates *running* the ROS adapter only. Writing and offline-testing it is unblocked; the other three providers are unaffected. |

`ChangeReason` is a shared TypeScript union used by the file pipelines. The live
`staged_guidelines_change_reason_check` constraint lists the six current members,
so **F1 does not require a migration as long as no new-class candidate is ever
inserted** — which is guaranteed by batch 1 writing no rows at all. The
constraint and the union diverging is a known, bounded, documented state for the
duration of batch 1, and §8.2 is where it is reconciled.

### 8.2 Before any of this reaches the database — future staging requirements

These are **not batch-1 dependencies**. They are the preconditions for a *later*
batch that stages edition candidates in Supabase, recorded here so the boundary
is explicit and so nobody reads batch 1's file output as a step toward an
unguarded database write.

| # | Requirement | State | What it protects |
|---|---|---|---|
| S1 | `staged_guidelines.changed_url`, `detection_evidence`, `state_observed_at`, `superseded_by/at` | On PR #174, **not live** | A revision candidate cannot be inserted at all — neither the columns nor `staged_guidelines_revision_needs_target` exist yet |
| S2 | `staged_guidelines_one_pending_revision` unique index | On PR #174, **not live** | Repeated runs piling up duplicate pending revisions for one URL |
| S3 | `'superseded'` as a `review_status` | On PR #174, **not live** | No machine supersession path exists |
| S4 | The `42809` approval block in `approve_staged_guideline()` | On PR #174, **not live** | **The sharp one.** The *live* function is insert-only with **no guard rejecting a non-`NEW_GUIDELINE` candidate**. An edition candidate reaching the live queue and being approved would be **inserted as a duplicate row** rather than refused. |
| S5 | `staged_detections` + `stage_detected_change()` | On PR #174, **not live** | No append-only observation record; no service-role-only staging RPC |
| S6 | `staged_guidelines_change_reason_check` extended to the two new members | Not written | F1's union and the DB constraint reconciled — required only at the point of insertion |

S4 is the reason the file/database boundary matters rather than being
bookkeeping: **the live approve path would not refuse an edition candidate.** Any
future batch that stages one must land #174's migration first and merge second —
the sequencing rule for #174 is unchanged and untouched by this batch.

### 8.3 Non-blocking, proceeding in parallel

- Catalogue `editions[]` (§5) — a frontend type plus a nullable column, no
  coupling to #174. Worth doing only once an editor has agreed the shape.
- BESS WPFD `admin-ajax` surface — separate decision, separate batch.
- BOFAS Round Table booklets and Hyperbook — unchanged exclusions.

### 8.4 Safety properties already live and relied on

- `staged_guidelines` has **no** `INSERT` / `UPDATE` / `DELETE` policy with RLS
  enabled → `anon` and `authenticated` are denied all three.
- `is_editor()` is a hardcoded UUID allowlist, not a role check.
- `approve_staged_guideline()` is `SECURITY DEFINER` with `EXECUTE` revoked from
  `public` and `anon`, and a null-safe (`is not true`) editor guard.
- Adapters are read-only by contract (`scripts/lib/provider-adapter.ts`):
  network reads only — no disk, no DB, no GitHub, no mutation.

Batch 1 adds nothing to the server-side surface and so needs no new grant, no new
policy and no new function.

---

## 9. Bounded implementation scope

**In — new files:**

| File | Contents |
|---|---|
| `scripts/lib/provider-registry.ts` | The §6 registry: identity, status, surfaces, exclusion / approval reason + date. Types and data only. |
| `scripts/lib/edition-match.ts` | Publisher-set-overlap soft matcher (§4.2, including the `PROVIDER_OVERRIDES` union). Pure, returns evidence. Reuses `topicTokens` / `jaccardSimilarity` / `splitPublishers` / `canonicalProvider`. |
| `scripts/lib/url-alternatives.ts` | §2.3 — the `urlAlternatives` shape, the small `relation` vocabulary, and match-across-alternatives. Performs no substitution on the discovered URL. |
| `scripts/lib/revalidating-cache.ts` | §7. Conditional request, hard TTL, redirect-final-URL keying, `.gitignore`d store. |
| `scripts/adapters/ebi.ts` | `/specialty/musculoskeletal-spine/` + `/specialty/retired-guidance/`; captures the verbatim `Published` / `Last reviewed` strings. |
| `scripts/adapters/bess.ts` | Static pathways page; registry status `partial`. |
| `scripts/adapters/ros.ts` | Clinical publications list. **Registered `awaiting-approval`; never fetched** (§1.1). Offline-tested only. |
| `scripts/tests/{ebi,ros,bess}-adapter.test.ts` | Offline fixture-HTML parse tests, matching the existing four adapter tests. **No network.** |
| `scripts/tests/edition-match.test.ts` | The §4.1 table as fixtures — all 10 BOFAS index items, expected class each — plus the `nhs-ebi-programme` override case. |
| `scripts/tests/url-alternatives.test.ts` | Discovered URL preserved byte-for-byte; alternatives recorded with evidence; match succeeds via an alternative and reports which. |

**In — edits to existing files:**

| File | Edit |
|---|---|
| `scripts/lib/ingestion.ts` | F1: two `ChangeReason` members + evidence and `urlAlternatives` fields on the candidate. Documented to the standard of the existing members. |
| `scripts/sync-providers.ts` | Register the new adapters via the registry; route candidates through the soft matcher; extend the coverage assertion to the new classes. **No change to `BOFASAdapter`'s parse rules.** |
| `scripts/blocked-sources.json` | No new domains. Read by the registry for `excluded` / `blocked` reasons rather than re-stated. |

**Out — explicitly:**

- Any Supabase migration, RPC, grant, policy or row.
- Any change to `src/data/guidelines-data.ts` or to any existing catalogue entry —
  including the two ROS entries with stale `/healthcare-professionals/` paths.
- `editions[]` as shipped schema. §5 is a proposal awaiting an editorial decision.
- Any workflow file, schedule, cron or `workflow_dispatch` default.
- Anything touching PR #174.
- **Any live fetch of ROS** until §1.1 resolves.
- NICE (74 entries, syndication API, licensing-blocked pending governance).
- BESS `/national-guidelines/` ajax surface; BOFAS Round Table + Hyperbook.
- Summary / abstract capture for any provider in this batch (§1).
- Parsing any stated date into a structured date field (§3).

**Verification before anything is called done:** the existing offline test suite
plus the new fixture tests; one manual `npx tsx scripts/sync-providers.ts`
dry-run reviewed by eye; and reconciliation against the §2.1 predictions —
**NHS EBI must come back 17 matched / 0 new**, and any deviation is investigated
before the batch is called complete. Source assertions are reported separately
from behavioural evidence throughout.

---

## 10. Decisions needed from a human before coding starts

1. **Extend `ChangeReason` by two members?** (F1) The alternative is to emit
   edition candidates as `NEW_GUIDELINE` with a note, which hides the distinction
   in free text. Recommend extending; no migration is needed while batch 1 writes
   no rows (§8.1).
2. **`editions[]` as the new-edition model** (§5) — agree the shape, or reject it
   and keep edition history entirely outside the catalogue in the staging
   artefact.
3. **ROS access approval** (§1.1) — **the one open blocker.** Permission to link
   is not permission to collect, and ROS separately asserts a storage
   prohibition. Decide between: approach ROS in writing describing exactly what
   would be collected and how often; proceed on the same unaddressed-terms
   footing as the other providers, as a recorded decision; or drop ROS from the
   batch. The adapter can be written and offline-tested under all three.
4. **The standing governance question.** None of the four providers addresses
   automated access, and the project has been fetching BOA, BSG, BOFAS and BSSH
   on that footing since August. ROS is escalated here only because it
   affirmatively asserts a storage prohibition. Whether the same written approach
   is owed to the others is a governance item, not a batch-1 blocker — flagged so
   it is a decision rather than a drift.

**No longer a question.** Rev 1 asked whether ROS was in editorial scope at all,
on the false premise that it had no entries. It has 4 (§2.0), with two published
PDFs already catalogued. ROS is in scope; only access approval is open.
