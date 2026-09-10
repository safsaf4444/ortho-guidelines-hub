# Follow-ups

Known work that is deliberately **not** being done before the PRUH presentation
on **20 September 2026**. Each item says why it was deferred, so a later reader
can tell a decision from an oversight.

Nothing here is a bug in shipped behaviour unless it says so.

---

## Do before the 20th

### `pelvic-fracture` summary reads as a treatment protocol
**Editorial, not code.** Its summary is, verbatim: *"apply a pelvic binder at
the greater trochanters (pre-hospital), give IV tranexamic acid within 1 hour,
activate massive transfusion, and transfer unstable patients directly to an
MTC."* That instructs a clinician rather than describing a document, which is a
larger claim than the hub makes anywhere else — including its own disclaimer.
It scores highest (9) in the tone audit and had already been flagged once before
as needing an editorial call.

Regenerate the full list any time with `npm run audit-summaries`.

### Real phone-width check at 375 / 390 px
Never confirmed by anyone holding a device. Browser tooling in this environment
has an unreliable width floor (~740–800px), so this cannot be simulated
honestly. Needs a person and a phone. Repeatedly deferred — do not let it slip
again.

---

## Do immediately after merging

### Deliberate two-deploy test of the PWA update prompt
The service-worker lifecycle was rewritten from `autoUpdate` to `prompt`
(`src/lib/pwa-update.ts`). The mechanism is verified — `dist/sw.js` carries the
`SKIP_WAITING` listener, has no unconditional `self.skipWaiting()`, and the
prompt provably does not appear on an ordinary load — but the prompt **actually
firing** needs two successive deploys to the same origin, which cannot be done
from a branch.

Push, then make a trivial no-op commit and push again, and watch for the
"A new version of the hub is available" toast. Do this deliberately rather than
discovering it during presentation week.

### One cheap end-to-end run of `approve-change.ts`
The silent-no-op bug is fixed and typechecks, but the fix has never been
exercised against a real GitHub issue. Before relying on the discovery/approval
pipeline for anything real, run it once with a test issue and a sandbox token.
A type-level fix is not a working workflow.

---

## After the 20th

### No clean publication-date field
`subGroup` is the de-facto publication date and is overloaded. It holds
`"Published Aug 2024"` on some rows and `"Withdrawn pending review"` on
`girft-bunions`. The card renders it under **Published** as-is rather than
parsing it, because parsing free text into a date would invent precision that
is not there.

Fixing it properly means another column, another backfill and another
migration. That is new scope discovered mid-flight, not one of the original
items, so it was deliberately left alone rather than allowed to expand the
presentation branch.

### The remaining 64 flagged summaries
65 were flagged, one prioritised above. The rest are an editorial pass at
whatever pace suits. The audit deliberately does not rewrite anything:
neutralising clinical text is a clinical and editorial judgement, and getting it
wrong silently would be worse than leaving it flagged.

### A change cannot be *required* to carry a note
`guideline_changelog_description_not_blank` guarantees no note is **empty**. It
cannot guarantee every guideline change **has** one: PostgREST issues the
guideline write and the note write as two separate requests, so a direct API
caller can `PATCH` a guideline and never post a note. The UI always writes both.

Closing it means moving both writes into one `SECURITY DEFINER` function and
revoking direct `UPDATE`/`INSERT` from `anon`. Documented in SECURITY.md.

### Discovery covers 4 of 26 publishers
Adapters exist for BOA, BSG, BOFAS and BSSH. NICE alone is 74 entries and has a
real syndication API rather than needing its pages scraped — the single highest-
value upgrade, and licensing-blocked pending the governance decision.

### Confirm the backups are current
`backups/` is local-only and gitignored. Un-archiving covers accidental removal;
it does not cover someone overwriting the text of many entries. Worth confirming
before the site is shown widely.

---

## Not deferred — decided

- **`local-pruh` has zero rows.** Nothing in the catalogue is PRUH-authored.
  This is a real state, not a gap, and the About page says so.
- **`scope_note` is NULL on all 231 entries.** It may only record what a source
  actually states. Cards render "not specified by the source" so a blank is
  legible as *checked, not stated*.
- **The known-gaps register breaks the `reports/` convention deliberately.**
  `.gitignore` was changed from `reports/` to `reports/*` plus a negation, so
  `reports/known-gaps.md` is tracked while generated reports stay ignored. A
  register lost on a fresh clone would not be a register.
