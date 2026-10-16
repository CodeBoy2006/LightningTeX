# `@lightningtex/engine`

A standalone, zero-dependency browser ES module providing **LuaHBLaTeX 1.24.0 (TeX Live 2026)** full-document compilation, the persistent `/rtex` incremental typesetting service, document capture and context-replay utilities, and the `RTDL` binary display-list decoder.

---

## Build & Deployment

From the repository root, build the standalone distribution:

```sh
npm ci
npm run build:engine
```

This generates a self-contained, relocatable `dist-engine/` directory (and can be packed into a tarball via `npm pack ./dist-engine`). Both the LightningTeX web application and external integrations consume this exact module entry.

### Static Hosting Requirements

Deploy the entire `dist-engine/` directory to your static host:

- Serve `.js` files with `text/javascript` and `.partNNN` chunks as `application/octet-stream` without transparent server-side gzip decompression (chunks are assembled and decompressed inside the Worker via `DecompressionStream`).
- Serve over HTTPS (or `http://127.0.0.1` / `localhost`) with Cross-Origin Isolation headers so `SharedArrayBuffer` is available for the persistent live channel:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
```

---

## Quick Start

```js
import {
  createEngine, splitPreamble, captureSpans, unitContext,
  liveUnitEligibility, compareUnitBaseline, decodeDisplayList,
} from '/engine/index.js';

const fonts = new Map();
const engine = await createEngine({
  onLog: console.log,
  onFonts: entries => Object.entries(entries).forEach(([name, bytes]) => fonts.set(name, bytes)),
});

try {
  const source = String.raw`\documentclass{article}
\begin{document}
Hello from LuaHBTeX.

A second paragraph with $x^2$.
\end{document}`;

  // 1. Run full compilation with capture instrumentation
  const full = await engine.background.compile(source);
  Object.entries(full.fonts).forEach(([name, bytes]) => fonts.set(name, bytes));

  // 2. Start the persistent incremental service (reuses compiled WebAssembly.Module)
  await engine.live.start(
    splitPreamble(source).preamble + '\n\\RequirePackage{luatexbase}\n',
    full.aux, [], full.packageMisses,
  );

  // 3. Locate an eligible captured unit and verify baseline equivalence
  const span = captureSpans(source, full.capture).find(({ unit }) =>
    liveUnitEligibility(full.capture, unit).ok);
  const context = unitContext(full.capture, span.unit);
  const baseline = decodeDisplayList((await engine.live.compile(
    context, span.original, span.unit.advanced || {},
  )).binary);
  const proof = compareUnitBaseline(span.unit, full.pages, baseline);
  if (!proof.ok) throw new Error(proof.reason);

  // 4. Typeset an incremental update in milliseconds
  const result = await engine.live.typeset(context, 'Hello from the incremental service.');
  const displayList = decodeDisplayList(result.binary);
  console.log(displayList.lines);
} finally {
  engine.dispose();
}
```

---

## API Reference

### `createEngine(options)`

```js
const engine = await createEngine({
  base,          // Optional base URL (defaults to directory of index.js)
  endpoint,      // TeX Live 2026 file service URL (default: 'https://texlive2026.texlyre.org'; '' disables remote lookup)
  onLog,         // Callback for background worker and asset-loader logs
  onLiveLog,     // Callback for live worker logs
  onFonts,       // Callback receiving { [filename]: Uint8Array } from the live worker
});
```

Because the `/rtex` Lua and LaTeX support files are embedded directly in the WASM filesystem image, `createEngine()` performs no network requests until `background.start()`, `background.compile()`, or `live.start()` is invoked.

### `engine.background` (Full Compilation Worker)

- **`background.start()`**: Initializes the background Worker, streams and compiles `luahbtex.wasm`, mounts the TeX Live data image, and restores cached packages from browser `Cache Storage`.
- **`background.compile(source, { root = 'main.tex', files = [] })`**:
  - `files` is an array of `{ path, data, rev }` records (`string` or `Uint8Array`). Providing an incremented `rev` when a file changes allows the client to send only modified project files across jobs.
  - **Auxiliary & Bibliography Reuse**: Retains the last successful `.aux` (including nested `\include` aux files), `.toc`, `.out`, `.lof`, `.lot`, and `.bbl` for the same root and preamble. When these outputs are unchanged, no rerun warning is present, and no unrecognized auxiliary output exists, compilation finishes in a single pass.
  - **Cold First-Pass Optimization**: When no prior auxiliary state exists, pass 1 dynamically omits `rtex-capture`'s shipout page traversal and JSON serialization (`\RemoveFromHook` / `remove_from_callback`) and restores full capture on pass 2.
  - **In-Browser BibTeX**: Automatically executes the built-in JavaScript BibTeX interpreter (`runtime/bibtex.js`) between passes when `\bibdata` is present in `.aux`, running up to 3 passes when `.bbl` changes.
  - Returns `{ pdf, capture, pages, fonts, aux, passes, packageMisses, bibtex, log, durationMs }`.
- **`background.stop()`**: Terminates the Worker and rejects in-flight jobs.

### `engine.live` (Persistent Incremental Worker)

- **`live.start(preamble, aux, files, packageMisses)`**:
  - Starts the persistent LuaHBTeX instance in a dedicated Worker. If `background` has already compiled the WASM module, `live.start()` reuses the compiled `WebAssembly.Module` while maintaining isolated linear memory.
  - Calling `live.start()` again with identical preamble, `.aux`, and support files reuses the running Worker without restarting.
- **`live.compile(context, source, expectedCounters)`**:
  - Installs `context` (if changed since the previous request) and typesets `source` in an isolated `\vbox`, enforcing strict counter invariance against `expectedCounters` as well as state-leak checks. Used for baseline verification.
- **`live.typeset(context, source)`**:
  - Typesets `source` under `context`, allowing counter deltas for provisional previews while still rejecting engine state leaks or fatal errors.
  - Both `compile()` and `typeset()` resolve `{ header, binary }`, where `binary` is an `RTDL` v1 buffer. Each font file referenced in the display list is emitted once per Worker lifetime via `onFonts`.
- **`live.stop()`**: Immediately terminates the live Worker.

### Document, Context & Layout Helpers

The package re-exports the pure coordination primitives used by the LightningTeX workspace:

- **Source Segmentation & Policy**: `splitPreamble(source)`, `captureSpans(source, capture, rootPath)`, `findLiveEdit(before, after, capture, spans, macros)`, `acceptLiveEdit(state, edit, source)`, `parseMacros(preamble)`
- **Context Replay & Baseline Proof**: `unitContext(capture, unitOrId)`, `liveUnitEligibility(capture, unitOrId)`, `compareUnitBaseline(unit, pages, liveDisplayList)`
- **Layout & Diagnostics**: `replaceUnitRows(pages, unit, baseline, liveDisplayList, { allowReflow })`, `decodeDisplayList(input)`, `parseTexLog(log, { root })`

---

## Engine Binary & Resource Profile

The runtime executable is compiled from **TeX Live 2026 (`LuaHBTeX 1.24.0`)** source using **Emscripten 5.0.4 (`-Oz`)**:

- **Direct LuaHBTeX Entry**: Links only LuaHBTeX, HarfBuzz/Graphite, Lua, Kpathsea, and PDF/font/image libraries—excluding pdfTeX, XeTeX, BibTeX, MakeIndex, DVI applets, ICU, fontconfig, TECkit, and FreeType.
- **Embedded `/rtex` Service**: All Lua and LaTeX incremental capture/server modules (`engine/tex/*`) are compiled directly into the WASM virtual filesystem at `/rtex`.
- **Pruned Data & 16 KiB LZ4 Chunks**: Retains the `luahblatex.fmt` format, shared `pdftex.map`, OTF/TFM/PFB fonts, and core macro packages (5,597 files), packed with 16 KiB LZ4 frames and split into $\le 16\text{ MiB}$ gzip parts:
  - `luahbtex.wasm`: **4,902,183 bytes** raw (**1,922,759 bytes** gzip)
  - `texlive-luahbtex.data`: **52,123,184 bytes** raw (**42,574,731 bytes** gzip)
  - Total compressed transfer: **44,497,490 bytes (~42.4 MiB)**

The build recipe is `engine/build/README.md` in the source checkout and `BUILDING.md` in the standalone package. Provenance records are in `public/luahbtex/build-info.json` in the checkout and `luahbtex/build-info.json` in the package.

---

## Verification & Benchmarking

```sh
npm run test:engine                                    # Relocate dist-engine/ outside repo and verify full/live WASM pipeline
npm run test:preview                                   # Verify aux byte reuse, cold first-pass capture skip, and TOC/bookmarks
node tests/engine-benchmark.mjs out.json [ref.json]    # Benchmark cold load, service startup, full compile, and warm live IPC
node tests/full-compile-benchmark.mjs out.json [ref]   # Benchmark 3 rounds across 6 fixture types with normalized PDF byte checks
```
