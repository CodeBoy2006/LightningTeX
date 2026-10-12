import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createDisplayListRenderer, decodeDisplayList } from './index.mjs';

// baseline.json is emitted by the real WASM engine capture harness. It is not
// fabricated here and this test is explicitly skipped if no capture is present.
let source;
try { source = JSON.parse(await readFile(new URL('../qa/baseline.json', import.meta.url), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
test('real captured LuaTeX OTF with 1-based subfont renders outlines to canvas', { skip: !source && 'Run the WASM baseline capture first' }, async () => {
  const { createCanvas } = await import('@napi-rs/canvas');
  const page = decodeDisplayList(source.pages[0]);
  const descriptor = Object.values(page.fonts).find(f => f.format === 'opentype' && f.subfont === 1);
  assert.ok(descriptor, 'real engine must retain its 1-based standalone OTF font descriptor');
  assert.equal(String.fromCharCode(...source.fonts[descriptor.filename].slice(0, 4)), 'OTTO');
  const canvas = createCanvas(1, 1);
  const renderer = createDisplayListRenderer({ resolveFont: async filename => new Uint8Array(source.fonts[filename]) });
  const result = await renderer.render(canvas, page, { zoom: 1.2, devicePixelRatio: 1, padding: 10 });
  assert.equal(result.status, 'display-list'); assert.deepEqual(result.reasons, []);
  assert.equal(result.glyphCount, page.glyphs); assert.ok(result.glyphCount > 0);
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let dark = 0; for (let p = 0; p < pixels.length; p += 4) if (pixels[p] < 100 && pixels[p + 1] < 100 && pixels[p + 2] < 100) dark++;
  assert.ok(dark > 100, `expected actual painted outlines, got ${dark} dark pixels`);
});
