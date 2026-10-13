# rtex display-list renderer

ES modules, independent of page repagination. Import from `render/index.mjs`.

```js
import { decodeDisplayList, createDisplayListRenderer } from './render/index.mjs';
const renderer = createDisplayListRenderer({
  // Return the actual engine font file bytes, never a substituted system font.
  resolveFont: async (filename, descriptor) => engine.readFile(filename),
  // Optional. This hook owns retrieving/rendering a verified matching PDF.
  pdfFallback: async ({ canvas, displayList, reasons, options }) => {
    return renderMatchingPDF(canvas, displayList, options);
  },
});
const result = await renderer.render(canvas, bytesOrJSON, {
  zoom: 1.25, devicePixelRatio: window.devicePixelRatio, padding: 16,
});
```

`decodeDisplayList` accepts an ArrayBuffer, typed-array slice, parsed JSON object, or JSON string. The JSON representation matches upstream compact item arrays. It validates record bounds, declared length, version, UTF-8, line framing, and run counts. Unknown tags are skipped by payload length and retained as diagnostics. Known-record trailing extensions are skipped, matching upstream behavior. Both `RTDL` (actual upstream Rust/Lua encoder) and `LODL` (published documentation) v1 magic are accepted.

`createDisplayListRenderer({resolveFont,pdfFallback,parseFont})` returns `{render,clearFontCache}`. The optional `parseFont(buffer, descriptor)` hook may be async; the default parses with installed `opentype.js`. Fonts are cached by file/encoding/subfont. Glyph outlines are addressed by engine glyph index, with quadratic/cubic curves drawn in font units. No `fillText`, Unicode-to-glyph substitution, shaping, or text measurement is used. Positions are absolute scaled TeX points; CSS pixels use 96 / 72.27 / 65536. Expansion, extend and slant follow the reference rasterizer's independent horizontal scale and shear. Advances are diagnostics only.

The application injects `parseEngineFont` from `type1-font.mjs` to support direct Type 1 map entries and static `ReEncodeFont` entries with one 256-name encoding vector. Lua captures the actual PFB file, PostScript name and encoding; other PostScript transforms or dynamic encodings remain unsupported. The binary font extension `0x04` carries font ID, encoding filename and space-separated glyph names after its FONT record. A font-only PDF reuses installed PDF.js 6.4.299 to convert all encoded charstrings, then maps original TeX character codes to converted OpenType glyphs. This works for glyphs absent from the initial document PDF. Conversion is cached once per font/encoding; it does not compile a TeX document. It uses PDF.js font-extra-properties and operator-list internals, so dependency upgrades must rerun `npm run test:incremental`.

The renderer supports filled rules, device-gray and device-RGB color stack set/push/pop/current operations, math boundaries (diagnostics only), and save/set/restore matrices with PDF y-up to canvas y-down conversion. Canvas dimensions use the unit's box/rows or page dimensions; output is allocation-limited. Line metadata, glyph IDs, characters, coordinates, expansion, advances and glue settings are in `result.diagnostics` and `displayListDiagnostics(dl)`.

Every flag, literal, unsupported item, image, unknown record, missing/invalid font or glyph, Type1 glyph without an exact code mapping, TFM/virtual glyph, unsupported face selector, font collection (identified by its ttcf bytes), variable/color font, nontrivial squeeze, unsupported color operator (including CMYK), or malformed graphics state produces explicit reasons. Preflight runs before painting; the renderer either calls the supplied PDF hook or throws `UnsupportedDisplayListError` with `reasons`. It never silently paints a partly supported list. Fallback is not automatically fetched and does not claim that a stale layout PDF reflects the newest unit edit.

A successful result has `status: 'display-list'`, `exact: true` (all records supported with engine glyph coordinates, not an independent raster-equivalence proof), `glyphCount`, `cssWidth`, `cssHeight`, `diagnostics`, and conservative `inkBounds` in scaled points from glyph curve control points and rules. Bounds are null for empty or matrix-transformed output. The application uses these bounds to patch proven fixed-geometry units over a retained white PDF backdrop, guarding against adjacent rows, image bounds and unbounded page drawing. It does not interpret untouched images/literals through this renderer. PDF delegation returns `status: 'pdf-fallback'`, `exact: false`, `reasons`, `diagnostics`, and the hook's result. Callers must use update/version tokens to prevent an older asynchronous font load or PDF render from overwriting newer UI state.

The host also uses these bounds for provisional reflow: validated full-width bands grow or shrink, moving subsequent PDF raster content without interpreting its drawing commands. Cross-page units retain their captured row allocation until the background engine repaginates. These previews are explicitly marked as pagination pending; `exact: true` for a rendered unit does not mean the provisional page layout is final. `npm run test:reflow` checks 11 editing scenarios against independently compiled glyph identities, font metrics and rules, while the fixed-geometry regression still compares final coordinates exactly.

## Tests and verification boundary

`npm run test:incremental` runs the actual persistent WASM engine, Type 1 conversion and canvas outlines. It applies 26 consecutive edits with only one initial full compile and compares the final glyph identities and coordinates against a fresh full compile. `qa/incremental-math.png` shows this output. Browser verification includes Full inline/display math, numbered equations, align, incomplete-input recovery and PDF export; see `QA.md`. This establishes the tested layouts, not universal package support or pixel-identical rasterization between PDF.js and canvas outlines.

Run `node --test render/*.test.mjs` from app. Fixtures exercise binary fields, both magic signatures, malformed/truncated buffers, prototype-like flag names, safe tag skipping, outline commands/transforms, color stacks, fail-closed painting, and fallback. One smoke test parses a real TrueType font distributed with the installed pdfjs-dist package. This is **not** a real rtex engine run, PDF pixel comparison, browser canvas screenshot test, or proof of complete font-format support. The optional real-capture regression consumes qa/baseline.json emitted by the real WASM harness, renders its actual OTF outlines with napi-canvas, and asserts a nonempty painted result. It is explicitly skipped when the capture is absent. The captured page was visually inspected at full size and cropped in qa/real-page-outline.png and qa/real-page-outline-crop.png. This still does not establish PDF pixel equivalence or full browser integration. Standalone OTF/TTF files accept LuaTeX’s 1-based subfont value 1, plus absent/default selectors 0, -1 and 65535; actual ttcf collections remain unsupported.
