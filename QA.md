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

## Full paper live acceptance — failed

- Tested production commit `e46e314` in the actual Codex in-app browser at `http://127.0.0.1:4188/`. Imported the exact 46,485-byte attached paper, **Exact Reachability under Vertex- and Area-Centroid Control**, with both supplied PDF figures. Packages, macros, headings, bibliography, formulas and figures were retained. Initial compilation produced 13 pages in 9,306 ms (two passes); the epstopdf warning was nonfatal.
- Kept Auto compile enabled and made six consecutive, alternating prose/math edits in the same imported project. These were temporary changes to the browser copy for testing. Every edit added exactly one `Full LuaLaTeX:` log entry and ended with `Full pass`; **zero edits used Live**. No blank lines, labels, references or preamble definitions were changed.

| Edit | Full compile time | Reported fallback reason |
| --- | ---: | --- |
| Reachability prose: relevant → useful | 11,026 ms | Baseline verification: Drawing outside unit rows requires full layout |
| Normalization equation: subscript d → n | 11,497 ms | Paragraph boundaries changed |
| Proof prose: surjective → injective | 12,579 ms | Paragraph boundaries changed |
| Abstract inline math: d+2 → d+3 | 13,291 ms | Paragraph boundaries changed |
| Introduction prose: topology → geometry | 12,830 ms | Command needs full layout: paragraph |
| Appendix align: denominator 81 → 82 | 8,329 ms | Command needs full layout: paragraph |

- Downloaded the resulting PDF and used `pdftotext` assertions to confirm all six edits reached the exported document. Restored the exact original source, recompiled and downloaded again; assertions confirmed all six original values. The restored PDF is 373,845 bytes and 13 pages. Both figures were visually checked in the production preview. The research directory and attached source were not modified.
- This fails full-paper realtime acceptance. The earlier minimal-example and synthetic incremental checks do not establish live support for this paper. The observed failures involve page drawing outside captured rows and source-unit policy/boundaries; the latter rejects edits even when blank lines were unchanged. No renderer or engine code was changed in this testing pass, and these limitations remain unresolved.
- Timings are individual worker full-compilation measurements, excluding UI scheduling/rendering, with package caches already populated. Safari/Firefox and broader performance profiling were not tested; no new unit suite or build was run for this evidence-only change.
- Evidence: `qa/full-paper-realtime.json` (source/figure hashes and per-edit compile counts), `qa/full-paper-realtime.log`, `qa/full-paper-realtime.png` (temporary test values), and `qa/full-paper-restored.png` (original paper restored). The earlier minimal example is run 1 in the retained UI log, paper import is run 2, edits are runs 3–8, and restoration is run 9.

## Full paper live optimization — 2026-10-12

- Fixed the source policy that rejected existing blank lines inside a captured unit. Reused the existing proof, abstract and run-in heading units; replayed their own context and retained structural signatures, counter checks and exact original-unit baseline comparison. Shared the existing approved preamble-macro parser with page edits. No new segmentation engine or dependency was added.
- Latin Modern's static Type 1 reencodings now retain the actual 256-name encoding through Lua, binary display lists and PDF.js conversion. Other PostScript transforms and dynamic encodings remain unsupported. Corrected the LuaHBTeX color-stack field from `cmd` to `command`; balanced canonical-black operations are validated, including underflow and unclosed stacks.
- Retained the original PDF raster as a page backdrop and replaced only proven fixed-geometry unit ink. Conservative curve-control-point bounds include old/new glyph overhangs and rules; neighbouring rows, image bounds, headers and unbounded page drawing protect against erasing other content. Zoom renders the same PDF backdrop at the new resolution and reapplies current units. Unknown binary records and unsupported local drawing still reject Live.
- Production build in the actual Codex in-app browser: exact 46,485-byte paper plus both original PDF figures, 13 pages, first full compile 8,869 ms. Auto compile remained enabled. Six consecutive prose/math edits all used Live; the `Full LuaLaTeX:` count remained **1** throughout.

| Edit | Live processing | Full runs before / after |
| --- | ---: | --- |
| Reachability prose: relevant → useful | 155 ms | 1 / 1 |
| Cross-page proof equation: subscript d → n | 187 ms | 1 / 1 |
| Same proof prose: surjective → injective | 43 ms | 1 / 1 |
| Abstract inline math: d+2 → d+3 | 105 ms | 1 / 1 |
| Introduction run-in heading body: topology → geometry | 22 ms | 1 / 1 |
| Page 13 align: denominator 81 → 82 | 23 ms | 1 / 1 |

- A separate pass verified Live edits beside both PDF figures (page 2: only → sole, 14 ms; page 8: convex set → convex cone, 24 ms). Full count did not increase for either. The page 2 image and changed Results text were visually checked together. Zoom preserved denominator 82 without another full compilation. An extra page 2 edit above the scaled image deliberately fell back with `Unit ink overlaps an image`: the raw image bounds are conservative under graphicx transforms, so this remains a known false-positive fallback.
- Download after the six edits added one full compile (2,129 ms). `pdftotext` assertions on the actual downloaded PDF confirmed all six latest values. Restored the exact original browser source (SHA-256 `f5f81fae06a13691844c7560302ffe30d531e155ba10f1dfd9811b78ff01f070`), compiled and downloaded again; all six original values and the absence of all extra test edits were asserted. The restored PDF is 13 pages / 373,845 bytes. The research folder and attachment were not modified.
- `npm test`: **122 passed**, zero failures/skips/cancellations. Includes real WASM lazy font lookup, actual static encoding and color fields, dynamic-encoding rejection, selected-row degradation, font-cache encoding identity, ink/overlap bounds and composite source guards. Expanded `npm run test:incremental`: **26 edits**, one initial full compile, zero engine restarts, exact final glyph identities/coordinates versus a fresh full compile; covers T1/lmodern/microtype/hyperref, abstract/proof, run-in heading body and a custom math alias. Warm median 5.21 ms / first edit 198.94 ms in Node, excluding baseline proof and UI scheduling. `npm run test:project` and `npm run build` passed; the existing bundle-size advisory remains.
- These browser Live times include original-unit proof on first use, font conversion and page painting, but exclude the UI's 60 ms input scheduling. They are individual local measurements with package caches populated. White paper and fixed row geometry remain required; pagination changes and uncertain drawing still use full compilation. No claim of universal package support, pixel-identical PDF/outline rasterization, cross-browser coverage or memory profiling is made.
- Evidence: `qa/full-paper-live-optimized.json`, `qa/full-paper-live-optimized.png`, `qa/full-paper-figure-live-optimized.png`, `qa/full-paper-live-restored.png`, updated `qa/incremental-math.{json,png}` and executable regression tests. The earlier failed acceptance remains historical evidence; this pass resolves its six reported cases.
