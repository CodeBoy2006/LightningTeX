# Verification record — 2026-10-12

## True incremental Full and math preview

- One full compilation captures page rows and unit context. On first edit of a unit, the persistent LuaTeX worker reproduces its original layout and verifies exact glyphs, geometry and font identities. Later edits compile only that unit; source spans shift as text changes.
- Full replaces affected page canvases from display lists, preserving surrounding content and page placements. The persistent engine and font outlines are reused. No full-document compile is scheduled after a successful local update.
- Native direct Type 1 map entries resolve to actual PFB files. Installed PDF.js converts their outlines and exact character-code mapping once per font. No dependency or separate math layout engine was added.
- A single 60 ms leading timer coalesces input. Unclosed expressions and partial known commands retain the last successful preview without compiling. Preview and PDF revisions are separate; downloading a stale PDF first compiles the latest source.
- Changed row count/height/baselines, preamble, environment, labels/references or row-break modifiers require full layout. Unsupported fonts, drawing or state fail closed. Full fallback retains adaptive one/two-pass compilation and aux reuse.

## Passed

- `npm test`: 70 unit, mock-Worker, renderer and jsdom tests; zero failures, skips or cancellations. Includes source span updates across units, math input guards, row-break star/spacing changes, equation counter validation, page replacement without drift, atomic stale-page rejection, latest-only scheduling, cancellation and fresh PDF export.
- `npm run test:incremental`: actual browser Worker scripts and LuaHBTeX WASM in Node worker_threads, PDF.js Type 1 conversion and native canvas outlines. All 26 consecutive inline/display/equation/align/prose edits used only the one initial full compile, with zero engine restarts. A newly introduced `\alpha` glyph also renders. Final glyph identities and integer coordinates equal an independent fresh full compile exactly. Warm local compile plus render median: 2.05 ms; first edit: 87.2 ms, excluding original-unit proof and browser input scheduling.
- `npm run test:integration`: all three current UI examples generate PDFs. The default prose baseline matches 2 rows / 153 glyphs; 20 local edits share one engine and recover after an undefined command. Median engine round trip: 1.31 ms, excluding UI and rendering.
- `npm run test:preview`: actual WASM/PDF.js full fallback and export path covers inline math, fractions/radicals, equation/align, removed/restored labels, incomplete math recovery, preamble invalidation and TOC regeneration. This test intentionally requests full compilation; the incremental test separately proves no full compilation during edits.
- `npm run build`: production bundle and runtime assets built successfully.
- Independent read-only review found a page-break case where changing `\\` to `\\*` kept row geometry but moved a page break in a 50-row align. Row-break modifiers now enter the structural signature and have a regression test, forcing full layout for this edit.
- Actual Codex in-app browser: inline formula edits, correction after an incomplete formula, and then a different paragraph all updated Full locally. The incomplete expression caused no engine compile and retained the last canvas. A correction-to-preview observation was 131 ms; warm local processing was 6.3–8.2 ms. First mathematical font use was 125.3–156.2 ms. These are individual local observations, not percentiles or latency guarantees.
- A separate browser fixture verified numbered equation and align edits with unchanged equation numbers and surrounding text. Engine logs explicitly show `no full compile` for each local update.
- Clicking PDF after local edits caused a full compile and returned the UI to Up to date. The actual downloaded PDF was parsed with PDF.js and contained the latest text, `A quick change`.

## Limits and checks not run

- Pagination is deliberately conservative: changing row geometry or structural state falls back to a full document pass. Arbitrary macros, packages, reencoded fonts, images and graphics are not universally incremental.
- Full page canvases are redrawn only on affected pages; this is local typesetting, not a pixel-level canvas patch or a reimplementation of TeX's page builder.
- Safari, Firefox, mobile, large-document latency and browser memory profiling were not tested. PDF.js and canvas outlines can rasterize edges differently; exact tested glyph placement does not claim pixel equivalence.
- Compilation still has a maximum of two passes per update. Unusual cross-reference convergence may require another manual pass and retains warning logs.
- No deployment was performed. This workspace has no Git repository, so no commit or push was created.

## Evidence

`qa/incremental-math.json`, `qa/incremental-math.png`, `qa/true-incremental-browser.jpg`, `qa/true-incremental-browser.log`, `qa/full-preview.json`, `qa/integration-wasm.json`, `qa/unit-tests.log`, `qa/build.log`, and executable tests in `tests/` and `ui/editor.test.mjs`. Earlier browser screenshots and other logs are historical unless explicitly covered above. Node/WASM and jsdom checks are distinct from actual browser checks.

## Automatic TeX packages — follow-up verification

- Replaced basic with the matching recommended data (13,236 files, including all 7,185 basic paths). Verified downloaded upstream hashes, every shipped gzip part's size/SHA-256, and the 16 MiB part limit. The engine bytes are unchanged. The recommended loader differs from upstream only by the existing preload hook.
- `npm test`: 109 tests passed. New cache coverage includes restoration by both workers, ignoring missing-file records and unsafe cache entries, storage denial/quota errors, and disabling remote lookup.
- `npm run test:runtime`: real WASM compiles `microtype` and `booktabs` without network; ordinary errors still recover. Node harnesses explicitly disable remote lookup because they do not provide browser XMLHttpRequest.
- `npm run test:incremental`: 26 edits, one initial full compile, no live restart, exact final layout agreement with a fresh full compile.
- `npm run test:integration`: article, notes and report templates produce PDFs; the blank template reports no pages; 20 live edits and error recovery pass.
- Headless Chromium with the actual workers and public TeX Live 2026 endpoint: `microtype,enumitem,xstring,csquotes` produces a 5,371-byte PDF. The latter three packages fetch six remote files, including indirect `.tex`, `.def` and `.cfg` dependencies, then persist them in Cache Storage. A live worker starts and typesets successfully using the same cache.
- After an actual page reload, with every request to the package endpoint blocked, new background and live workers still compile the same document and typeset successfully. Cached package files are not requested again; optional missing-file probes may still be attempted. This tests cached package availability, not offline loading of the website itself.
- `npm run build` passed; its existing large-JavaScript-chunk advisory remains. The production directory contains recommended assets and no obsolete basic assets.
- No new dependency or package-management service was added. Safari/Firefox, arbitrary packages and external-program features remain unverified or unsupported as described in the README. The first bundled transfer grows from about 76 MiB to 168 MiB; browser memory profiling was not performed.

## Type 1 font lookup timeout — 2026-10-12

- Reproduced the 120-second timeout in the actual in-app browser. The capture module eagerly resolved every direct entry in `pdftex.map`, downloading unrelated Type 1 fonts. It now resolves only requested fonts and caches both successful and missing lookups; full and live workers share this code.
- Added a real WASM regression that rejects unrelated font lookups, verifies one lookup per requested font across different font IDs, and checks descriptors for found and missing files. `npm test`: 110 passed. `npm run test:incremental`: 26 edits, no engine restart, exact final layout agreement. `npm run build` passed with the existing chunk-size advisory.
- The user's unmodified rank–nullity example rendered a one-page PDF in the production UI (8.46 seconds). The attached full paper, with both supplied PDF figures, compiled through the same browser worker into 13 pages (373,845 bytes, 52.19 seconds). Its epstopdf shell-escape warning remained nonfatal. These timings are individual local observations, not latency guarantees.

## Remote lookup latency and live fallback — follow-up

- Confirmed a one-letter edit in the user's example fell back with `Live typesetting timed out`. Bundled fonts now skip absent optional companion formats, and full-job 404 results are passed to new live workers in memory. Negative results are not persisted in browser Cache Storage; missing unbundled package files still download normally.
- Preamble definitions no longer trigger the blanket body-setup rejection. Common linear algebra operators now share the live/preview vocabulary. Resizing or switching preview panes redraws current display lists instead of compiling a stale PDF solely to refresh the image.
- Actual production UI: full compilation of the example took 3.32–4.74 seconds after reload; warm prose edits took 8.8 ms and warm align edits 8.5 ms. First align proof/font conversion took 0.71–1.17 seconds. The log retained exactly one full compilation while editing and switching panes. The paper with both figures compiled to the identical 373,845-byte, 13-page PDF in 9.81 seconds with packages already cached. Individual local measurements exclude the UI's 60 ms input scheduling delay and are not performance guarantees.
- `npm test`: 114 passed. Updated real WASM incremental coverage includes `\det` in align, 26 edits without full recompilation or engine restart, and exact final glyph/layout agreement with a fresh full compile. Production build passed with its existing chunk-size advisory. Browser check: Codex in-app browser; Safari/Firefox not checked. Complex macros, unsupported fonts/graphics, and pagination changes retain full-layout fallback.
