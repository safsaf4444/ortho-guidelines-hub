# Search integration boundaries

The public filter seam in `../guideline-filter.ts` applies section and link-status
filters before calling `app-adapter.ts`. Blank queries preserve catalogue order;
nonempty queries require all query concepts (`minCoverage: 1`) and exclude
related-only suggestions. Archived boolean flags remain excluded. Stored
guidance-status labels affect ranking; they are not independent clinical review.
The existing UI groups results by section, then retains ranking within a section.

The engine can return partial suggestions for other callers. They are explicitly
labelled partial and follow full matches. The public UI does not mix these into
its primary results. Search is lexical retrieval and does not interpret clinical
negation or establish treatment suitability.

The imported dictionary has **102 entries**, despite its author's earlier
103-entry report. Engineering review is not clinical validation. Clinical review
must assess abbreviation ambiguity, broader/narrower concepts grouped as
synonyms, and evidence references before production release. Examples needing
attention include the lumbar-fusion group and facet-injection/medial-branch-block
group. Catalogue-ID references are retrieval provenance, not proof of synonymy.
The integration preserves the supplied dictionary for that review.

The 64-query development benchmark retains its original relevance labels.
`recallAt5` now means relevant hits / all expected relevant IDs and `precisionAt5`
means relevant hits / 5. The author's capacity-normalised recall and precision
among returned results remain separately named historical metrics. The benchmark
is author-selected, and one label was changed during its development; it cannot
establish independent clinical accuracy.

The independent 16-query known-item fixture was SHA-256 pinned before execution.
Its 14 target sets are deliberately non-exhaustive, so it reports target hit@5,
top-1 and MRR, plus two negative controls, rather than precision or clinical
accuracy. No relevance labels or ranking weights were tuned to its results.
