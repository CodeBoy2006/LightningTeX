# LightningTeX WASM engine

A standalone browser ES module containing LuaHBLaTeX, the persistent rtex incremental service, capture/context helpers and the display-list decoder. No editor, DOM, PDF.js, canvas renderer or npm runtime dependency is included.

## Build and deploy

From the source repository, run `npm ci` and `npm run build:engine`. Copy the entire `dist-engine/` directory to a static host. It is relocatable; do not copy only `index.js` or let a bundler drop the worker/data files. `npm pack ./dist-engine` produces an installable distribution archive. The application and standalone build use the same engine implementation.

Serve JavaScript with its JavaScript MIME type and `.partNNN` as binary, without server-side decompression. Use HTTPS (localhost HTTP also works) with:

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Full compilation needs Web Workers, WebAssembly and `DecompressionStream`. Incremental compilation additionally needs `SharedArrayBuffer` and cross-origin isolation. The package targets browsers; Node verification uses a test Worker adapter and is not a shipped Node API.

## Full compilation and incremental typesetting

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
  const full = await engine.background.compile(source);
  // full.pdf is Uint8Array; capture, pages, fonts, aux, log and passes accompany it.
  Object.entries(full.fonts).forEach(([name, bytes]) => fonts.set(name, bytes));
  await engine.live.start(
    splitPreamble(source).preamble + '\n\\RequirePackage{luatexbase}\n',
    full.aux, [], full.packageMisses,
  );
  const span = captureSpans(source, full.capture).find(({unit}) =>
    liveUnitEligibility(full.capture, unit).ok);
  if (!span) throw Error('This document needs full compilation');
  const context = unitContext(full.capture, span.unit);
  const baseline = decodeDisplayList((await engine.live.compile(
    context, span.original, span.unit.advanced || {},
  )).binary);
  const proof = compareUnitBaseline(span.unit, full.pages, baseline);
  if (!proof.ok) throw Error(proof.reason);
  const result = await engine.live.typeset(context, 'Hello from the incremental service.');
  const displayList = decodeDisplayList(result.binary);
  console.log(displayList.lines);
} finally {
  engine.dispose();
}
```

`createEngine()` loads the Lua/TeX support files; the first `background.start()` or `compile()` initializes WASM. `live.start()` starts a separate persistent instance. Starting it after the background engine is ready reuses the already compiled `WebAssembly.Module`, skipping a second WASM download/decompression/compilation. TeX data and mutable memories remain isolated. Repeated `live.start()` with unchanged preamble, aux and support files reuses the running service.

`createEngine({base, endpoint, onLog, onLiveLog, onFonts})` resolves resources relative to `index.js` by default. Supply an absolute directory URL ending in `/` as `base` if a bundler relocates the JS entry. `endpoint: ''` disables remote TeX package downloads; otherwise the default is `https://texlive2026.texlyre.org`. A custom endpoint must implement BusyTeX's matching TeX Live 2026 file protocol. Shell escape and Lua sockets are disabled.

`background.compile(source, {root: 'main.tex', files: [{path, data, rev}]})` accepts text or Uint8Array project files. Paths are relative to the project; traversal and absolute paths are rejected. Include the complete file list each time: omitted files are deleted. `rev` is optional; provide a changed revision whenever file data changes to skip resending unchanged files. Without a revision the file is always sent. The root source is supplied separately. `background.stop()` cancels loading and all pending jobs; it can subsequently restart.

`live.start(preamble, aux, files, packageMisses)` accepts the preamble's project dependencies. `live.compile(context, source, expectedCounters)` checks counter changes, errors and state leaks. `live.typeset(context, source)` allows changed counters for provisional previews but still rejects polluted engine state. Both return `{header, binary}`. `onFonts` receives each actual font file once per live Worker lifetime; retain these bytes for rendering. Context and compilation requests are serialized. `live.stop()` cancels current/queued requests; start again to recover a discarded worker.

For document edits, use the exported `findLiveEdit`, `acceptLiveEdit`, `parseMacros` and `replaceUnitRows` helpers. First prove each captured unit's original output using `compareUnitBaseline`. Preserve source/generation tokens around asynchronous work and reject stale results. Route unsupported edits to full compilation. `typeset()` is a low-level operation, not a source-policy check. Line-count, numbering and pagination changes remain provisional until a new full compile. Incremental output is a display list, not an updated PDF: export by calling `background.compile()` with the latest sources. `parseTexLog` is also exported.

## Scope and verification

`npm run test:engine` builds the package, copies it outside the repository, imports its public entry, then runs real WASM full/incremental/error-recovery checks with no editor or Node dependency lookup in that directory. The test compares the edited glyph positions to a fresh full compile and checks module reuse and font transport. `npm run test:incremental`, `test:reflow` and `test:sequence` cover the existing richer fixtures.

The executable is the pinned upstream BusyTeX WASM (LuaHBTeX 1.24 / TeX Live 2026); this API only runs LuaHBLaTeX. The binary still contains upstream pdfTeX/XeTeX and utility code. It has not been rebuilt or binary-stripped. The compressed WASM/basic data total 79,687,514 bytes. Recommended/extra collections, Biber, the unused native background Lua driver, rendering libraries and UI are excluded. Removing other engines from the executable requires a source build; deleting their names or files is not a safe substitute. See [the upstream build project](https://github.com/TeXlyre/texlyre-busytex-build), `busytex/versions.txt` and `THIRD-PARTY-NOTICES.md` for provenance and source/license information.

The service does not implement a general pagination engine, BibTeX/Biber, or native rtex's entire Rust session. Full passes retain the existing two-pass limit. TeX execution has a 120-second host timeout; live requests have a six-second timeout after startup. Cancellation terminates workers. Safari, Firefox and mobile performance require separate validation.
