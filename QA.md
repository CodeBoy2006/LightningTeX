# Verification & Benchmark Report

This document summarizes the automated test suites, differential layout verifications, and performance benchmarks for **LightningTeX**, along with pointers to the machine-readable artifacts in [`qa/`](qa/).

---

## 1. Automated Test Suite Overview

All 201 unit, DOM, and display-list renderer tests, as well as the real-WASM integration and benchmark suites, execute against the shipped LuaHBTeX 1.24.0 WebAssembly runtime and worker scripts:

| Command | Suite Scope | Verified Assertions |
| :--- | :--- | :--- |
| `npm test` | **201 Unit, DOM & Renderer Tests** | Source span tracking & boundary merges, macro arity & live policy, cumulative context delta replay, baseline comparison, guarded ink regions & band slicing, `RTDL` binary codec, Type 1 PFB PDF synthesis, Myers line diff, quick fixes, autocompletion, snippets, cross-file `F2` rename, PDF text search, and workspace UI state. |
| `npm run test:runtime` | **WASM Runtime Smoke** (`tests/runtime-smoke.mjs`) | Cold WASM initialization, prose & math PDF compilation, recoverable undefined-command error handling, and subsequent compilation on the same worker. |
| `npm run test:incremental` | **26-Edit Math & Prose Exact-Coordinate Regression** (`tests/incremental-math.mjs`) | 26 consecutive edits across inline math, fractions/summations, numbered `equation`, `align`, `\det`, `proof`/`abstract`, run-in headings, T1/Latin Modern, `microtype`, and newly introduced Type 1 math glyphs (`\alpha`). **1 initial full compile, 0 live restarts, 100% exact glyph identity and `sp` coordinate match** against a fresh full compile. |
| `npm run test:reflow` | **18-Scenario Provisional Band Reflow** (`tests/live-reflow.mjs`) | Paragraph split/join/deletion, list item insertion, taller display formulas, section headings, multi-file `\input` updates, and `theorem`/`lemma`/`proposition`/`corollary`/`remark`/`proof` environments with shared counters and nested lists. **1 initial full compile, 0 restarts, 100% glyph/metric/rule agreement** against 18 independent full compiles. |
| `npm run test:sequence` | **112-Step Cumulative Editing & Incomplete Input Benchmark** (`tests/live-sequence.mjs`) | 112 accepted live edits + 17 unclosed math prefixes across a multi-page article (character typing/backspace, paragraph split/join, leading paragraph insertion, cross-page growth/shrink, whole-equation deletion & slot-preserving counter restoration). Verified against independent full compiles at 15 checkpoints. |
| `npm run test:preview` | **Full-Compile Auxiliary Reuse & Cold First-Pass Optimization** (`tests/full-preview.mjs`) | Byte-for-byte reuse of `.aux` (including nested `\include`), `.toc`, `.out`, `.lof`, `.lot`, and `.bbl`; single-pass completion on stable edits; cold first-pass capture suppression; invalidation on root/file changes; user end-document hook preservation. |
| `npm run test:bibliography` | **In-Browser JS BibTeX & `.bst` Styles** (`tests/bibliography.mjs`) | Tests `public/runtime/bibtex.js` across 12 standard TeX Live `.bst` styles (`plain`, `unsrt`, `alpha`, `abbrv`, `plainnat`, `unsrtnat`, `apalike`, `IEEEtran`, `siam`, `ieeetr`, `acm`, `amsplain`) plus `biblatex.bst` (`backend=bibtex`), verifying 3-pass initial generation, 1-pass `.bbl` reuse, and `.bib` line-numbered diagnostics. |
| `npm run test:project` | **Multi-File Project & Caret Math Preview** (`tests/project-math.mjs`, `tests/math-preview-wasm.mjs`) | Multi-file `\input` resolution, natural-width `\hbox` inline formula previews (preventing borrowed TOC justification stretch), display/align formula previews, and unclosed group auto-repair. |
| `npm run test:engine` | **Relocated Standalone Engine SDK** (`tests/standalone-engine.mjs`) | Copies `dist-engine/` to an isolated temporary directory outside the repository, verifying zero external dependencies, `WebAssembly.Module` sharing between background and live workers, deduplicated font transport, 8 incremental edits with exact layout match, and error recovery. |

---

## 2. Source-Built LuaHBTeX WASM & Asset Trimming

Building a dedicated LuaHBTeX 1.24.0 executable from TeX Live 2026 source (`engine/build/luahbtex.mk`), embedding `/rtex` into the WASM image, pruning 1,587 non-LuaHBTeX resource files (`engine/build/prune-data.mjs`), and pairing 16 KiB LZ4 chunks produced a **44.2% reduction** in total compressed startup size while maintaining 100% identical layout signatures (`qa/luahbtex-before.json`, `qa/luahbtex-after.json`, `qa/luahbtex-verification.json`):

### Asset Size Comparison

| Asset Metric | Multi-Call Baseline | Source-Built LuaHBTeX | Reduction |
| :--- | ---: | ---: | ---: |
| Raw WASM binary (`luahbtex.wasm`) | 32,507,525 B (31.0 MiB) | **4,902,183 B (4.68 MiB)** | **−84.9%** |
| Gzipped WASM (`luahbtex.wasm.gz.part000`) | 13,104,205 B (12.5 MiB) | **1,922,759 B (1.83 MiB)** | **−85.3%** |
| Gzipped TeX Live data (`texlive-luahbtex.data.gz.*`) | 66,583,309 B (63.5 MiB) | **42,574,731 B (40.6 MiB)** | **−36.1%** |
| **Total Compressed Startup Assets** | **79,687,514 B (76.0 MiB)** | **44,497,490 B (42.4 MiB)** | **−44.2%** |

### Engine Startup & Compilation Latency (Median of 3 Rounds)

| Operation (`node tests/engine-benchmark.mjs`) | Multi-Call Baseline | Source-Built LuaHBTeX |
| :--- | ---: | ---: |
| Cold Worker WASM + VFS load | 689 ms | **342 ms** |
| Persistent Live Service startup (`live.start`) | 993 ms | **675 ms** |
| Initial full compilation | 1,209 ms | **1,106 ms** |
| OpenType math full compilation | 564 ms | **514 ms** |
| Type 1 + `microtype` full compilation | 1,184 ms | **1,144 ms** |
| 6-page document full compilation | 1,347 ms | **1,252 ms** |
| Warm live request (WASM + `SharedArrayBuffer` IPC) | 0.23 ms | **0.27 ms** |

---

## 3. Incremental Editing & 13-Page Academic Paper Benchmarks

### 112-Step Cumulative Editing Sequence (`qa/live-sequence.json`)

Across 112 sequential live edits and 17 incomplete formula prefixes on a multi-page document:
- **Full compilations during editing**: `1` (initial capture only)
- **Live engine restarts**: `0`
- **Node compile + outline render latency**: Median **`5.95 ms`**, P95 **`102.88 ms`** (includes first-use baseline proof and font conversion on initial edits)
- **Browser continuous typing (`qa/live-sequence-browser.json`)**: Warm live updates rendered in **`3.6–5.6 ms`**; formula height expansion in **`37 ms`**; whole-equation deletion and restoration in **`45 ms` / `31 ms`** with exact equation counter preservation.

### 13-Page Academic Paper Sequential Keyboard Benchmark (`qa/full-paper-input.json`)

Tested in the browser using `/tests/browser-input.html` on a complete 13-page mathematics paper (**46,485 bytes** of LaTeX source with custom preamble macros, theorems, proofs, `align` environments, bibliography, and two embedded PDF figures):

| Paper Editing Scenario | Keystrokes / Live Updates | Live Update Latency | Full Compiles During Typing |
| :--- | ---: | ---: | ---: |
| Theorem statement continuous typing | 20 keys / 11 Live updates | **9.9–17 ms** | 0 |
| Long proof on page 4 | 63 keys / 31 Live updates | **29–38 ms** | 0 |
| Cross-page proof (pages 5–6) | 61 keys / 32 Live updates | **16–39 ms** | 0 |
| Insert new paragraph inside proof | 48 keys / 24 Live updates | **13–31 ms** | 0 |
| Delete paragraph and merge adjacent prose | 1 key / 1 Live update | **35 ms** | 0 |
| Type fraction with square root (`\frac{1}{\sqrt{82}}`) | 19 keys / 1 Live update | **27 ms** | 0 |
| Type taller summation fraction across pages 5–6 | 28 keys / 4 Live updates | **18–32 ms** | 0 |

When typing paused after the 61-key cross-page burst, a single background pass started automatically after `530 ms` to converge global pagination. Exported PDF text extraction (`pdftotext`) confirmed all edits and figure captions across all 13 pages.

---

## 4. Full-Compilation Optimization Benchmarks

### Single-Pass Auxiliary Byte Reuse (`qa/full-compile-before.json`, `qa/full-compile-after.json`)

By retaining and comparing byte snapshots of `.aux` (including nested `\include` aux files), `.toc`, `.out`, `.lof`, `.lot`, and `.bbl`, ordinary prose edits that do not alter sectioning or cross-reference targets finish in **1 pass** instead of 2:

| Document Type (Warm Prose Edit, Median of 3 Rounds) | Before Aux Byte Reuse | After Aux Byte Reuse | Passes |
| :--- | ---: | ---: | ---: |
| Table of contents & PDF bookmarks | 1,429 ms | **715 ms (−50.0%)** | 2 → **1** |
| Multi-file nested `\include` | 1,255 ms | **622 ms (−50.4%)** | 2 → **1** |
| Multi-page math | 598 ms | **615 ms** | 1 → 1 |
| Bibliography (`.bbl` reused) | 567 ms | **538 ms** | 1 → 1 |

### Cold First-Pass Capture Suppression (`qa/cold-compile-paired.json`, `qa/cold-compile-browser.json`)

On cold initial compiles where no prior `.aux` state exists and a second pass is required, omitting `rtex-capture`'s shipout page traversal and JSON export during pass 1 reduces initial compile time across all 6 benchmark document classes while producing byte-identical normalized PDFs, capture contexts, and display lists across 54 paired runs (108 jobs):

| Document Type (Cold First Compile, Median of 3 Rounds) | Before | After | Compile Reduction | Total with Local Engine Load |
| :--- | ---: | ---: | ---: | ---: |
| Multi-page math | 1,292 ms | **1,115 ms** | **−13.7%** | 1,662 → **1,472 ms** |
| Type 1 fonts + `microtype` | 1,323 ms | **1,141 ms** | **−13.7%** | 1,682 → **1,504 ms** |
| Table of contents + bookmarks | 1,649 ms | **1,488 ms** | **−9.8%** | 2,008 → **1,857 ms** |
| Multi-file nested `\include` | 1,488 ms | **1,307 ms** | **−12.1%** | 1,839 → **1,664 ms** |
| Bibliography (3 passes with JS BibTeX) | 1,910 ms | **1,800 ms** | **−5.7%** | 2,278 → **2,152 ms** |
| PDF + PNG figures (`graphicx`) | 1,215 ms | **1,104 ms** | **−9.1%** | 1,576 → **1,451 ms** |
| 5-page 120-paragraph browser fixture | 1,463 ms | **1,251 ms** | **−14.5%** | 1,788 → **1,556 ms** |

---

## 5. Artifact Index (`qa/`)

- **Engine & Binary**: `qa/luahbtex-before.json`, `qa/luahbtex-after.json`, `qa/luahbtex-verification.json`, `qa/standalone-engine-browser.png`
- **Incremental & Reflow**: `qa/incremental-math.json`, `qa/incremental-math.png`, `qa/live-reflow.json`, `qa/live-sequence.json`, `qa/live-sequence-browser.json`, `qa/live-sequence-browser.png`
- **13-Page Academic Paper**: `qa/full-paper-input.json`, `qa/full-paper-live-optimized.json`, `qa/full-paper-live-optimized.png`, `qa/paper-cross-page-formula.png`
- **Full-Compile & Bibliography**: `qa/full-compile-before.json`, `qa/full-compile-after.json`, `qa/full-compile-regressions.json`, `qa/cold-compile-paired.json`, `qa/cold-compile-browser.json`, `qa/cold-compile-regressions.json`, `qa/bibliography.json`
