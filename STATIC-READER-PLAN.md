# Separate static reader: implementation boundary

Status: BLOCKED on architectural extraction and independent acceptance. This candidate retains the existing application. No environment-only or hidden-control claim of isolation is made.

The 3,000-line App combines reader cards/catalogue, session recovery, staged publication receipts, duplicate handling and history. Replacing it under the deadline would risk clinical warning rendering and recovery behaviour. The master handoff explicitly permits this design-plan fallback.

1. Extract existing read-only card/status/source-link and catalogue rendering unchanged into pure components. Capture DOM parity tests including all warnings, summaries, versions and unsafe-link handling first. Do not suppress clinical notes.
2. Create src/reader/main.tsx importing only frozen data, pure Search V2, those reader components, navigation and PWA hooks. Keep existing main.tsx/App.tsx and editor flows intact; no editor routes or providers in the reader graph.
3. Give the reader independent HTML and build configuration. No database env values, third-party fonts or runtime data fetch. Use the existing Pages base only in a separately authorised deployment; default local preview remains localhost.
4. Run the readerBoundary plugin against ALL resolved modules, including dynamic chunks. It fails on database/session/staging/history/editor imports. Inspect final asset hashes and scan emitted JS for hosts, tokens, createClient, auth and write paths as an additional check.
5. Preserve 231 records byte-for-byte, frozen 64+16 outcomes, source URLs, ranked unique cards, category cross-listings, facets, deep links and Back/Forward. Add real network capture with all off-origin traffic blocked, PWA waiting-worker update and offline/reconnect tests, axe, keyboard and zoom.
6. Only package a newly clean exact commit after every required gate passes. A preview of the combined application is not that reader artifact. Human clinical/rights/AT approval and explicit publication permission remain separate.

Reproduction of the current blocker: node node_modules/vite/bin/vite.js build --config vite.reader-boundary.config.ts --outDir reports/reader-boundary-build . Run with the repository test harness allowlisted environment and network guard. Expected current result is a nonzero exit listing prohibited imports; this is a detected blocker, not a passing reader build.
