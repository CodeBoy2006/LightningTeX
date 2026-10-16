# Browser WebAssembly Architecture & `realtime-tex` Port Design

This document details how [`realtime-tex`](https://github.com/HenryXiaoYang/realtime-tex) (upstream commit `1f681835cfcbeeabcca340b7784316a0ef186d81`) is architected for the browser WebAssembly environment in LightningTeX.

---

## 1. Architectural Overview

Porting incremental LaTeX typesetting to the browser involves two complementary subsystems:

1. **Embedded Lua/TeX Incremental Runtime (`/rtex`)**: Runs inside a custom-built **LuaHBTeX 1.24.0 (TeX Live 2026)** WebAssembly binary, executing `rtex-capture.lua`, `rtex-serve.lua`, `rtex-dl.lua`, `rtex-dl-bin.lua`, `rtex-json.lua`, and `rtex-pic.lua` against LuaTeX's native node, token, font, callback, and Kpathsea APIs.
2. **Event-Driven Browser Host (`core/`, `engine/`, `render/`, `main.js`)**: Replaces native OS threads, POSIX named pipes (`mkfifo`), and filesystem process spawning with two isolated Web Workers, a `SharedArrayBuffer` + `Atomics.wait` character device bridge, an in-memory context-delta replay engine, and a direct Canvas outline renderer.

---

## 2. Subsystem Mapping

| Upstream Component | Browser Adaptation in LightningTeX |
| :--- | :--- |
| `tex/rtex-capture.lua`, `tex/rtex-serve.lua`, `tex/rtex-dl*.lua` | Embedded directly at `/rtex` inside `luahbtex.wasm`. Extended with lazy Type 1 font map resolution, static 256-name encoding vector export (`0x04`), LuaHBTeX color-stack command alignment, and theorem/proof/heading unit hooks. |
| `crates/rtex-dl` (Display-List Model & Binary Codec) | Implemented in [`render/display-list.mjs`](../render/display-list.mjs), supporting both `RTDL` and `LODL` v1 binary frames and JSON representations. |
| `document.rs` & `eligibility.rs` (Segmentation & Policy) | Implemented in [`core/document.js`](../core/document.js) with UTF-16 source span tracking across root and `\input`/`\include` files, macro arity checking, and structural signature validation. |
| `capture.rs` & `layout.rs` (Context Replay & Baseline Proof) | Implemented in [`core/capture.js`](../core/capture.js) and [`core/live-layout.js`](../core/live-layout.js): cumulative document-order delta merging (`unitContext`), unit eligibility checks (`liveUnitEligibility`), exact baseline verification (`compareUnitBaseline`), and row replacement/reflow (`replaceUnitRows`, `pageFlow`). |
| `transport.rs` & `engine.rs` (`FastServer` IPC) | Implemented in [`engine/client.js`](../engine/client.js) and [`public/runtime/live-worker.js`](../public/runtime/live-worker.js) using Emscripten `FS.registerDevice` over a 1 MiB `SharedArrayBuffer` mailbox (`/dev/rtex-req` and `/dev/rtex-resp`). |
| `passes.rs` & `background.rs` (Full Compilation & Convergence) | Implemented in [`public/runtime/background-worker.js`](../public/runtime/background-worker.js) with linear-memory heap snapshot resets, byte-for-byte auxiliary file reuse (`.aux`, `.toc`, `.out`, `.lof`, `.lot`, `.bbl`), cold first-pass capture suppression, and in-browser JS BibTeX (`bibtex.js`). |
| `rtex-verify` (Outline Rasterizer) | Implemented in [`render/canvas-renderer.mjs`](../render/canvas-renderer.mjs) and [`render/type1-font.mjs`](../render/type1-font.mjs) using `opentype.js` and `PDF.js` Type 1 PFB conversion at integer scaled-point (`sp`) coordinates. |

---

## 3. Persistent Engine Wire Protocol & Driver Loop

### Server Driver (`/live/serve.tex`)

When `LiveEngine.start()` initializes, `live-worker.js` writes the document preamble to `/live/rtex-preamble.tex` alongside any preamble-referenced project files and `.aux` data, then boots LuaHBTeX once with `/live/serve.tex`:

```tex
\input{/live/rtex-preamble.tex}
\newbox\rtexbox\newcount\rtexcontinue\rtexcontinue=1
\edef\rtexcountnum{\number\allocationnumber}\newcatcodetable\rtexcct{\makeatletter\savecatcodetable\rtexcct}
\begin{document}\input{rtex-serve-patches}
\directlua{rtex_serve = dofile(kpse.find_file("rtex-serve.lua", "lua") or "rtex-serve.lua") rtex_serve.init(\number\rtexbox, \rtexcountnum, \number\rtexcct)}
\loop\rtexstep\ifnum\rtexcontinue>0 \repeat\end{document}
```

Executing `\loop\rtexstep\ifnum\rtexcontinue>0 \repeat` in TeX's outer loop (rather than nested `tex.runtoks` calls) keeps TeX's input stack flat across thousands of consecutive paragraph requests.

### Request & Response Framing

- **Requests (`/dev/rtex-req`)**: Newline-delimited JSON commands (`{"op":"context","id":1,"ctx":...}`, `{"op":"compile","req":1,"ctx":1,"source":...}`, `{"op":"ping"}`, `{"op":"shutdown"}`) or compact `C` frames written into the `SharedArrayBuffer` payload and signaled via `Atomics.notify`.
- **Responses (`/dev/rtex-resp`)**: Framed as `[u32LE length][u8 kind][payload]`:
  - `kind = 0`: UTF-8 JSON control/status payload (`ready`, `ok`, `error`, `fatal`).
  - `kind = 1`: `[u32LE jsonLength][JSON result header][RTDL v1 binary display list]`.

---

## 4. Cumulative Context Delta Reconstruction

During a full compilation pass (`\RequirePackage{rtex-capture}\input{main.tex}`), `rtex-capture.lua` records each unit's state changes (`counters`, `thefmt`, `macros`) as deltas relative to previous units to keep `main.rtex.json` compact.

To construct a standalone replay context for unit $u$, [`unitContext(capture, u)`](../core/capture.js) merges deltas in document order from the first captured unit through $u$:

- **`counters`, `thefmt`, `macros`**: Accumulated in document order up to and including unit $u$.
- **Paragraph Geometry (`ints`, `dims`, `glues`, `parshape`)**: For `kind === 'par'`, extracted from the first captured paragraph record matching `u.seqs` (with top-level `nest === 1` and valid `begin` state); otherwise taken directly from `u`.
- **Font & Color State (`begin.nfss`, `begin.color`)**: Taken from the first paragraph's `begin` descriptor when present, or from `u`.
- **Hooks & Flags (`everypar`, `nobreak`, `afterindent`, `noskipsec`)**: Taken from `u` (with `everypar` cleared for `heading` units whose own sectioning command installs `everypar`).

---

## 5. End-to-End Incremental Update Lifecycle

1. **Span Segmentation & Edit Detection**: After a full compile, `captureSpans()` maps each captured unit to UTF-16 character offsets in its respective source file (`main.tex` or `\input`/`\include` child files). On user input, `findLiveEdit()` identifies the modified unit span(s) and validates both the old and new text against `liveSourcePolicy()`.
2. **Baseline Equivalence Proof**: On the first edit to unit $u$, `LiveEngine.compile()` typesets `span.original` under `unitContext(capture, u)`. `compareUnitBaseline()` verifies that every row's dimensions, glue settings, font keys, glyph indices, and relative `sp` coordinates match the captured full-page rows.
3. **Incremental Typesetting & State Verification**: `LiveEngine.typeset()` compiles the edited source in `\rtexbox`, verifies that no global macros or unexpected registers leaked, and emits the binary `RTDL` display list along with any newly referenced font bytes.
4. **Row Replacement & Page Band Composition**: `replaceUnitRows()` maps engine-local font IDs to page font descriptors and updates the unit's rows. `pageFlow()` either computes a guarded fixed-geometry ink patch (`Live`) or slices the cached PDF page canvas into vertical bands (`Reflow`) until the background worker settles global pagination.
