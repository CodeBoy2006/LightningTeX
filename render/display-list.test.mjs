import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeDisplayList, displayListDiagnostics, createDisplayListRenderer, parsePDFColor, UnsupportedDisplayListError } from './index.mjs';
const u8 = n => Buffer.from([n]);
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const i32 = n => { const b = Buffer.alloc(4); b.writeInt32LE(n); return b; };
const f64 = n => { const b = Buffer.alloc(8); b.writeDoubleLE(n); return b; };
const str = s => { const b = Buffer.from(s); return Buffer.concat([u16(b.length), b]); };
const ints = (...ns) => Buffer.concat(ns.map(i32));
const rec = (tag, ...parts) => { const p = Buffer.concat(parts); return Buffer.concat([u8(tag), u32(p.length), p]); };
const binary = (records, magic = 'RTDL', flags = 0) => { const body = Buffer.concat([...records, rec(255)]); return Buffer.concat([Buffer.from(magic), u16(1), u16(flags), u32(16 + body.length), u32(0), body]); };
function sample(magic = 'RTDL') { return binary([
  rec(1, ints(5000, 700, 200, 0, 0, 0, 0, 2), u32(2), u32(0)),
  rec(2, u32(27), i32(655360), u8(1), u8(0), u16(0), ints(100, 1100, 0, 0), str('font.otf'), str('Test'), str('Test'), str('Test Regular'), str('opentype')),
  rec(0x10, ints(3, 1, 100, 2000, 5000, 500, 200), f64(0.25), u8(1), u8(0)),
  rec(0x12, ints(7, 2)),
  rec(0x20, u32(27), ints(2000, 20000), u32(2), u32(65), u32(36), ints(100, 400), u32(66), u32(0xffffffff), ints(500, 420)),
  rec(0x21, ints(950, 1500, 30, 700)), rec(0x11),
], magic); }
test('binary RTDL and documented LODL decode exact glyph/line diagnostics', () => {
  for (const magic of ['RTDL', 'LODL']) {
    const dl = decodeDisplayList(sample(magic));
    assert.equal(dl.fonts[27].size, 655360); assert.equal(dl.inserts, 2);
    assert.deepEqual(dl.lines[0].items[0], ['g', 27, 65, 36, 100, 2000, 400, 20000]);
    assert.equal(dl.lines[0].items[1][3], null); assert.equal(dl.lines[0].gs, 0.25);
    const d = displayListDiagnostics(dl); assert.equal(d.glyphs.length, 2); assert.equal(d.lines[0].unit, 7); assert.equal(d.binary.magic, magic);
  }
});
test('typed array views respect byte offsets', () => { const b = sample(); const padded = Buffer.concat([Buffer.alloc(5), b, Buffer.alloc(8)]); assert.equal(decodeDisplayList(padded.subarray(5, 5 + b.length)).glyphs, 2); });
test('Type1 encoding extension attaches to its declared font', () => {
  const font=rec(2,u32(7),i32(655360),u8(0),u8(0),u16(0),ints(0,0,0,0),str('lmr10.pfb'),str('ec-lmr10'),str('LMRoman10-Regular'),str('LM'),str('type1'));
  const encoding=rec(4,u32(7),str('lm-ec.enc'),str('grave acute'));
  const dl=decodeDisplayList(binary([font,encoding]));
  assert.equal(dl.fonts[7].encoding_file,'lm-ec.enc');assert.equal(dl.fonts[7].encoding,'grave acute');
  assert.throws(()=>decodeDisplayList(binary([encoding])),/font/);
});
test('unknown tags skipped with diagnostics, including decoded-JSON normalization', () => {
  const dl = decodeDisplayList(binary([rec(0x7e, Buffer.from([1,2,3]))]));
  assert.equal(dl.binaryDiagnostics.unknownRecords[0].payloadLength, 3);
  assert.equal(decodeDisplayList(dl).binaryDiagnostics.unknownRecords.length, 1);
});
test('reject truncation, length mismatch, bad magic, version, unclosed lines and hostile run counts', () => {
  assert.throws(() => decodeDisplayList(sample().subarray(0, 20)), /Length mismatch/);
  const bad = sample(); bad[0] = 0; assert.throws(() => decodeDisplayList(bad), /magic/);
  const version = sample(); version[4] = 2; assert.throws(() => decodeDisplayList(version), /version/);
  assert.throws(() => decodeDisplayList(binary([rec(0x20, u32(1), ints(0, 0), u32(0xffffffff))])), /Truncated/);
  assert.throws(() => decodeDisplayList(binary([rec(0x11)])), /without LINE/);
  assert.throws(() => decodeDisplayList(binary([rec(0x10, ints(0,0,0,0,0,0,0), f64(0), u8(0), u8(0))])), /Unclosed/);
  assert.throws(() => decodeDisplayList(binary([rec(3, u16(1), u8(255), i32(1))])), /UTF-8/);
});
test('decodes resource, color, literal, math, unsupported and matrix records', () => {
  const dl = decodeDisplayList(binary([
    rec(0x22, u8(1), u8(0), u16(2), str('1 0 0 rg')), rec(0x23, i32(-1), str('special')),
    rec(0x24, str('cached_picture'), str('1 2 3')), rec(0x25, u8(1), i32(9)),
    rec(0x26, ints(2, 10, 20, 30, 40)), rec(0x27, u32(2), u32(1), u32(4), str('photo.pdf')),
    rec(0x28, u8(1), ints(10, 20), str('1 0 0 1')), rec(3, str('__proto__'), i32(1)),
  ], 'RTDL', 1));
  assert.equal(dl.kind, 'page'); assert.equal(dl.images_info[2].file, 'photo.pdf');
  assert.deepEqual(dl.other[0], ['c', 2, 1, '1 0 0 rg']); assert.deepEqual(dl.other[3], ['m', 'on', 9]);
  assert.deepEqual(dl.other[5], ['M', 'set', 10, 20, '1 0 0 1']);
  assert.equal(Object.getPrototypeOf(dl.flags), Object.prototype); assert.equal(dl.flags.__proto__, 1);
});
const jsonDL = items => ({ kind: 'paragraph', unit: 'sp', width: 6553600, height: 655360, depth: 0, fonts: { 1: { filename: 'fixture.otf', size: 655360, format: 'opentype', slant: 100, extend: 1100 } }, flags: {}, other: [], lines: [{ par: 0, i: 1, x: 0, y: 500000, w: 6553600, h: 500000, d: 100000, items }], glyphs: 1 });
function fakeCanvas() {
  const calls = []; const ctx = new Proxy({}, { get: (_, key) => (...args) => calls.push([key, ...args]), set: (_, key, value) => { calls.push(['set', key, value]); return true; } });
  return { calls, style: {}, getContext: () => ctx };
}
const fixtureFont = { unitsPerEm: 1000, tables: {}, glyphs: { length: 5, get: index => { assert.equal(index, 3); return { path: { commands: [{ type: 'M', x: 0, y: 0 }, { type: 'L', x: 400, y: 0 }, { type: 'Q', x1: 500, y1: 500, x: 0, y: 700 }, { type: 'C', x1: 0, y1: 500, x2: 0, y2: 200, x: 0, y: 0 }, { type: 'Z' }] } }; } } };
test('outline renderer addresses glyph ID, native curves, expansion/extend/slant and color stack', async () => {
  let reads = 0; const renderer = createDisplayListRenderer({ resolveFont: async () => { reads++; return new Uint8Array([0]); }, parseFont: () => fixtureFont });
  const canvas = fakeCanvas(); const dl = jsonDL([['c',0,1,'1 0 0 rg'], ['g',1,999,3,100,500000,200,20000], ['c',0,2,''], ['r',0,0,100,200]]);
  const result = await renderer.render(canvas, dl, { devicePixelRatio: 1 });
  assert.deepEqual(result.inkBounds,{x:0,y:0,w:400524.96,h:500000});
  assert.equal(result.status, 'display-list'); assert.equal(result.diagnostics.glyphs[0].charCode, 999);
  assert.ok(canvas.calls.some(c => c[0] === 'quadraticCurveTo')); assert.ok(canvas.calls.some(c => c[0] === 'bezierCurveTo'));
  assert.ok(!canvas.calls.some(c => c[0] === 'fillText'));
  const transform = canvas.calls.find(c => c[0] === 'transform');
  assert.ok(Math.abs(transform[1] - 655.36 * 1.02 * 1.1) < 1e-8); assert.equal(transform[3], 65.536); assert.equal(transform[4], -655.36);
  assert.ok(canvas.calls.some(c => c[0] === 'set' && c[2] === 'rgb(255,0,0)'));
  await renderer.render(fakeCanvas(), dl); assert.equal(reads, 1);
});
test('font conversion cache separates reencodings of the same PFB', async () => {
  const parsed=[],renderer=createDisplayListRenderer({resolveFont:async()=>new Uint8Array([0]),parseFont:(_,desc)=>{parsed.push(desc.encoding_file);return fixtureFont;}});
  const dl=jsonDL([['g',1,65,3,0,500000,200,0]]);
  dl.fonts[1].encoding_file='lm-ec.enc';await renderer.render(fakeCanvas(),dl);
  dl.fonts[1].encoding_file='lm-rm.enc';await renderer.render(fakeCanvas(),dl);
  await renderer.render(fakeCanvas(),dl);assert.deepEqual(parsed,['lm-ec.enc','lm-rm.enc']);
});
test('viewport crops the canvas to a region and a transparent background is left unpainted', async () => {
  const renderer = createDisplayListRenderer({ resolveFont: async () => new Uint8Array([0]), parseFont: () => fixtureFont });
  const canvas = fakeCanvas(), dl = jsonDL([['g',1,65,3,2000000,500000,200000,0]]);
  const result = await renderer.render(canvas, dl, { devicePixelRatio: 2, zoom: 2, padding: 0, background: 'transparent', viewport: { x: 1900000, y: 0, w: 655360, h: 655360 } });
  const css = 655360 * 2 * 96 / (72.27 * 65536);
  assert.ok(Math.abs(result.cssWidth - css) < 1e-9); assert.ok(Math.abs(result.cssHeight - css) < 1e-9); assert.equal(canvas.width, Math.ceil(css * 2));
  assert.ok(!canvas.calls.some(c => c[0] === 'fillRect'), 'nothing is painted behind the glyphs');
  const placed = canvas.calls.filter(c => c[0] === 'setTransform').at(-1), scale = 2 * 2 * 96 / (72.27 * 65536);
  assert.ok(Math.abs(placed[5] + 1900000 * scale) < 1e-6); assert.equal(placed[6], 0);
  await assert.rejects(renderer.render(fakeCanvas(), dl, { viewport: { x: 0, y: 0, w: NaN, h: 1 } }), /viewport/);
});
test('degraded lists never partially paint and invoke explicit PDF fallback', async () => {
  for (const item of [['l',0,'q'], ['u','cached_picture','1'], ['i',1,0,0,10,10], ['g',1,65,null,0,0,10,0]]) {
    const canvas = fakeCanvas(); await assert.rejects(createDisplayListRenderer().render(canvas, jsonDL([item])), UnsupportedDisplayListError); assert.equal(canvas.calls.length, 0);
  }
  let received; const renderer = createDisplayListRenderer({ pdfFallback: async payload => { received = payload; return 'pdf painted'; } });
  const result = await renderer.render(fakeCanvas(), jsonDL([['i',1,0,0,10,10]]));
  assert.equal(result.status, 'pdf-fallback'); assert.equal(received.reasons.length, 1);
});
test('strict color operations and malformed JSON rejection', () => {
  assert.equal(parsePDFColor('0.5 g 1 0 0 RG'), 'rgb(127.5,127.5,127.5)');
  assert.throws(() => parsePDFColor('0 1 0 0 k'), /Unsupported/);
  assert.throws(() => parsePDFColor('0.1 0.2 rg'), /Unsupported/);
  assert.throws(() => decodeDisplayList(jsonDL([['g',1,65,3,Infinity,0,1,0]])), /Invalid/);
});
test('installed opentype.js reads a real TrueType outline (font-parser smoke test, not engine test)', async () => {
  const { readFile } = await import('node:fs/promises');
  const renderer = createDisplayListRenderer({ resolveFont: async () => readFile(new URL('../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf', import.meta.url)) });
  const canvas = fakeCanvas(), dl = jsonDL([['g',1,65,36,100,500000,200,0]]);
  dl.fonts[1].filename = 'LiberationSans-Regular.ttf'; dl.fonts[1].format = 'truetype';
  const result = await renderer.render(canvas, dl);
  assert.equal(result.glyphCount, 1); assert.ok(canvas.calls.some(c => c[0] === 'lineTo'));
});
test('standalone face sentinels and LuaTeX 1-based selector accepted; actual TTC rejected', async () => {
  for (const subfont of [-1, 0, 1, 65535]) {
    const dl = jsonDL([['g',1,65,3,0,500000,200,0]]); dl.fonts[1].subfont = subfont;
    const renderer = createDisplayListRenderer({ resolveFont: async () => new Uint8Array([79,84,84,79]), parseFont: () => fixtureFont });
    assert.equal((await renderer.render(fakeCanvas(), dl)).status, 'display-list');
  }
  const dl = jsonDL([['g',1,65,3,0,500000,200,0]]); dl.fonts[1].subfont = 0;
  const renderer = createDisplayListRenderer({ resolveFont: async () => new Uint8Array([116,116,99,102]), parseFont: () => fixtureFont });
  await assert.rejects(renderer.render(fakeCanvas(), dl), /Font collections are unsupported/);
});
