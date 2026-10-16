# Display-List Decoder & Canvas Outline Renderer

Standalone ES module (`render/index.mjs`) for decoding `rtex` binary (`RTDL` v1) and JSON display lists and rendering exact TeX glyph outlines, rules, color stacks, and transformation matrices onto an HTML5 Canvas.

---

## Quick Start

```js
import { decodeDisplayList, createDisplayListRenderer } from './render/index.mjs';

const renderer = createDisplayListRenderer({
  resolveFont: async (filename, descriptor) => engine.readFile(filename),
  pdfFallback: async ({ canvas, displayList, reasons, options }) => {
    return renderMatchingPDF(canvas, displayList, options);
  },
});

const result = await renderer.render(canvas, bytesOrJSON, {
  zoom: 1.25,
  devicePixelRatio: window.devicePixelRatio,
  padding: 16,
});
```

---

## Binary & JSON Display-List Decoder (`decodeDisplayList`)

`decodeDisplayList(input)` accepts an `ArrayBuffer`, `Uint8Array` slice, parsed JSON object, or JSON string and returns a normalized display-list structure:

- Validates header magic (`RTDL` or `LODL` v1), declared frame length, record boundaries, UTF-8 strings, line framing, and run counts.
- Supports binary font extension `0x04` carrying Type 1 encoding filenames and 256-entry glyph name vectors.
- Preserves unknown record tags by advancing past their declared payload length and recording them under `binaryDiagnostics.unknownRecords`.

---

## Canvas Outline Renderer (`createDisplayListRenderer`)

```js
const { render, clearFontCache } = createDisplayListRenderer({
  resolveFont,   // (filename, descriptor) => Promise<Uint8Array | ArrayBuffer>
  parseFont,     // Optional custom font parser (defaults to opentype.js)
  pdfFallback,   // Optional fallback handler when a display list contains PDF-only operations
});
```

### Coordinate System & Glyph Outlines

- **Scaled-Point Precision**: All coordinates are addressed in integer TeX scaled points (`sp`, $1\text{ pt} = 65536\text{ sp}$, `CSS_PX_PER_SP = 96 / (72.27 * 65536)`).
- **Direct Glyph-Index Painting**: OpenType and TrueType glyphs are retrieved by the engine's exact `glyphIndex` and drawn as quadratic and cubic Bézier paths (`M`, `L`, `Q`, `C`, `Z`) in font units.
- **Independent Horizontal Expansion & Slant**: Font expansion (`microtype`), `extend`, and `slant` transforms are applied directly to the 2D transformation matrix (`y`-up font coordinates mapped to `y`-down Canvas coordinates), matching `rtex-verify`.

### Type 1 PFB Outline Pipeline (`render/type1-font.mjs`)

For PostScript Type 1 (`.pfb`) fonts (such as Computer Modern / Latin Modern math extensions and T1-encoded text fonts), `parseEngineFont(buffer, descriptor, pdfjs, worker)` synthesizes an in-memory 1-page PDF containing all 256 charstrings and any static `ReEncodeFont` vector. It passes that minimal PDF once through the `PDF.js` worker to obtain converted OpenType glyph outlines and an exact `originalCharCode -> glyphIndex` lookup table, caching the parsed font by `filename#encoding#subfont`.

### Supported Primitives & Preflight Validation

The renderer executes a complete preflight pass over all display-list records before modifying the target Canvas:

- **Supported**: Glyph runs (`g`), filled rules (`r`), device-gray and device-RGB color stack operations (`c`: set, push, pop, current), math boundary markers (`m`), and 2D transformation matrix save/set/restore (`M`).
- **Preflight Fallback**: If a display list contains raw PDF literals (`l`), external image resources (`i`), unsupported items (`u`), Type 3 / virtual fonts, `ttcf` font collections, variable/color fonts (`fvar`/`colr`/`svg`), non-trivial `squeeze`, CMYK colors, or unbalanced stacks, preflight halts before painting and either delegates to `pdfFallback` or throws `UnsupportedDisplayListError` with structured `reasons`.

### Return Value & Ink Bounds

A completed render returns:

```js
{
  status: 'display-list',
  exact: true,
  reasons: [],
  diagnostics,   // Line metadata, glyph IDs, characters, coordinates, expansion, advances, glue
  cssWidth,
  cssHeight,
  glyphCount,
  inkBounds,     // { x, y, w, h } in scaled points (computed from glyph curve control points and rules)
}
```

The workspace coordinator uses `inkBounds` to:
1. **Patch fixed-geometry units (`Live`)** over a cached PDF page raster after verifying zero overlap with adjacent rows, images, and page headers/footers.
2. **Slice and shift horizontal page bands (`Reflow`)** when line counts or formula heights change.
3. **Crop standalone formulas** in the caret math popover and reference hover cards via the `options.viewport` rectangle (`{ x, y, w, h }` in `sp`).

---

## Dark-Page Filter (`render/dark-page.mjs`)

`darkenCanvas(canvas, rect)` selectively inverts low-saturation pixels by luminance onto dark paper (`#1c1e22`) while preserving the hue and saturation of colored figures and text. It accepts an optional sub-rectangle so incremental live bands and full PDF pages share identical rendering in dark mode.

---

## Tests

```sh
node --test render/*.test.mjs    # Run binary codec, outline renderer, Type 1 PFB, and preflight tests
npm run test:incremental         # Run 26-edit real-WASM + Type 1 + Canvas outline regression
npm run test:reflow              # Run 18-scenario real-WASM band reflow verification
```
