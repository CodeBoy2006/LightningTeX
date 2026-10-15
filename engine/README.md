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

The Lua/TeX service is embedded in the WASM filesystem at `/rtex`, so `createEngine()` makes no support-file requests; the first `background.start()` or `compile()` initializes WASM. `live.start()` starts a separate persistent instance. Starting it after the background engine is ready reuses the already compiled `WebAssembly.Module`, skipping a second WASM download/decompression/compilation. TeX data and mutable memories remain isolated. Repeated `live.start()` with unchanged preamble, aux and project files reuses the running service.

`createEngine({base, endpoint, onLog, onLiveLog, onFonts})` resolves resources relative to `index.js` by default. Supply an absolute directory URL ending in `/` as `base` if a bundler relocates the JS entry. `endpoint: ''` disables remote TeX package downloads; otherwise the default is `https://texlive2026.texlyre.org`. A custom endpoint must implement BusyTeX's matching TeX Live 2026 file protocol. Shell escape and Lua sockets are disabled.

`background.compile(source, {root: 'main.tex', files: [{path, data, rev}]})` accepts text or Uint8Array project files. Paths are relative to the project; traversal and absolute paths are rejected. Include the complete file list each time: omitted files are deleted. `rev` is optional; provide a changed revision whenever file data changes to skip resending unchanged files. Without a revision the file is always sent. The root source is supplied separately. `background.stop()` cancels loading and all pending jobs; it can subsequently restart.

Full jobs retain the last successful `.aux` (including nested `\include` files), `.toc`, `.out`, `.lof`, `.lot` and bibliography output for the same root and preamble. Each pass compares auxiliary bytes, so stable references, contents, bookmarks and figure/table lists take one pass after ordinary edits. Changed auxiliaries or rerun warnings still trigger another pass. Root changes, project resets and file removals invalidate reuse; failed jobs never replace the saved output. Unknown package outputs retain the conservative two-pass behavior. This is in-memory reuse within one Worker, not a persistent document cache.

`live.start(preamble, aux, files, packageMisses)` accepts the preamble's project dependencies. `live.compile(context, source, expectedCounters)` checks counter changes, errors and state leaks. `live.typeset(context, source)` allows changed counters for provisional previews but still rejects polluted engine state. Both return `{header, binary}`. `onFonts` receives each actual font file once per live Worker lifetime; retain these bytes for rendering. Context and compilation requests are serialized. `live.stop()` cancels current/queued requests; start again to recover a discarded worker.

For document edits, use the exported `findLiveEdit`, `acceptLiveEdit`, `parseMacros` and `replaceUnitRows` helpers. First prove each captured unit's original output using `compareUnitBaseline`. Preserve source/generation tokens around asynchronous work and reject stale results. Route unsupported edits to full compilation. `typeset()` is a low-level operation, not a source-policy check. Line-count, numbering and pagination changes remain provisional until a new full compile. Incremental output is a display list, not an updated PDF: export by calling `background.compile()` with the latest sources. `parseTexLog` is also exported.

For multi-file projects, keep a separate source/span record per file and pass its project-relative path to `captureSpans(source, capture, path)`. Retain `capture.paragraphs`: its file metadata identifies an included file's final paragraph when TeX closes it after returning to its parent. The application can replay edits to several files before committing their combined preview. Ambiguous repeated inputs, paragraphs containing text from multiple files, and preamble/dependency changes still require full compilation.

## Scope and verification

`npm run test:engine` builds the package, copies it outside the repository, imports its public entry, then runs real WASM full/incremental/error-recovery checks with no editor or Node dependency lookup in that directory. The test compares the edited glyph positions to a fresh full compile and checks module reuse and font transport. `npm run test:incremental`, `test:reflow` and `test:sequence` cover the existing richer fixtures.

`npm run test:preview` checks full-job auxiliary reuse, invalidation, changed/deleted labels and headings, lists, and error recovery through actual WASM and PDF.js. `node tests/full-compile-benchmark.mjs output.json [reference.json]` measures three rounds of initial/edit/repeat full jobs and compares exact layout, PDF text, bookmarks and aux signatures against an optional baseline. Set `RTEX_ENGINE_BASE` to a directory URL with `runtime/` and `luahbtex/` to benchmark another worker implementation. Timings exclude startup, package downloads and rendering.

The executable is source-built LuaHBTeX 1.24.0 / TeX Live 2026 with Emscripten 5.0.4 and the incremental service embedded. The direct entry point links only LuaHBTeX and its dependencies: no pdfTeX, XeTeX, BibTeX, MakeIndex or DVI converter applets, ICU, fontconfig, TECkit or FreeType. The WASM is 4,902,183 bytes (1,922,759 gzip); pruned TeX data is 52,123,184 bytes (42,574,731 gzip). Combined encoded assets are 44,497,490 bytes, 44.2% smaller than the previous package.

The resource tree retains LuaHBLaTeX format, shared PDF maps, OTF/TFM/PFB fonts and core macro packages. Other engine formats, ICU/fontconfig data, unused tool resources, Metafont sources, logs and AFM metrics are removed. Optional AFM metrics and extra packages need the configured file service unless already cached. The `.fmt` is the matching 1.24.0 format from the pinned original data snapshot; it is not regenerated. LZ4 chunks are 16 KiB in both the compiler and data packager.

The companion source includes `engine/build/README.md`, the C entry point, JS remote lookup and resource filter. The distribution also carries the recipe as `BUILDING.md`. Packaged `luahbtex/build-info.json` records source/toolchain pins, hashes, linked archives and embedded support hashes. Distribute this source with the runtime and retain `THIRD-PARTY-NOTICES.md`.

The full worker includes a JavaScript BibTeX interpreter for `.bst` styles; Biber is unsupported. Full compilation runs at most two passes, or three when the bibliography changes. The live service does not reflow the bibliography, implement a general pagination engine, or reproduce native rtex's entire Rust session. TeX execution has a 120-second host timeout; live requests have a six-second timeout after startup. Cancellation terminates workers. Safari, Firefox and mobile performance require separate validation.
