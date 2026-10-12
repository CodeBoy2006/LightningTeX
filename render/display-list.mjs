/** rtex revision-1 decoder. Upstream encoder uses RTDL; published docs say LODL. */
export class DisplayListError extends Error {
  constructor(message, offset) { super(`${message}${offset == null ? '' : ` at byte ${offset}`}`); this.name = 'DisplayListError'; this.offset = offset; }
}
class Reader {
  constructor(bytes, base = 0) { this.bytes = bytes; this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); this.pos = 0; this.base = base; }
  need(n) { if (n > this.bytes.length - this.pos) throw new DisplayListError('Truncated record', this.base + this.pos); }
  number(method, size) { this.need(size); const v = this.view[method](this.pos, true); this.pos += size; return v; }
  u8() { return this.number('getUint8', 1); } u16() { return this.number('getUint16', 2); }
  u32() { return this.number('getUint32', 4); } i32() { return this.number('getInt32', 4); }
  f64() { const v = this.number('getFloat64', 8); if (!Number.isFinite(v)) throw new DisplayListError('Non-finite float', this.base + this.pos - 8); return v; }
  take(n) { this.need(n); const b = this.bytes.subarray(this.pos, this.pos + n); this.pos += n; return b; }
  str() { const b = this.take(this.u16()); try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { throw new DisplayListError('Invalid UTF-8', this.base + this.pos - b.length); } }
}
export function asBytes(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new DisplayListError('Expected ArrayBuffer or typed array');
}
export function decodeDisplayList(input) {
  if (typeof input === 'string') return validateJSON(JSON.parse(input));
  if (input && !ArrayBuffer.isView(input) && !(input instanceof ArrayBuffer)) return validateJSON(input);
  const bytes = asBytes(input), r = new Reader(bytes);
  const magic = String.fromCharCode(...r.take(4));
  if (!['RTDL', 'LODL'].includes(magic)) throw new DisplayListError('Invalid display-list magic', 0);
  const version = r.u16(); if (version !== 1) throw new DisplayListError(`Unsupported version ${version}`, 4);
  const flags = r.u16(), total = r.u32(), reserved = r.u32();
  if (total !== bytes.length) throw new DisplayListError(`Length mismatch: header ${total}, input ${bytes.length}`, 8);
  if (flags & ~1 || reserved) throw new DisplayListError('Unknown header flags or reserved bits', 6);
  const dl = { kind: flags & 1 ? 'page' : 'paragraph', unit: 'sp', width: 0, height: 0, depth: 0,
    page: null, page_width: null, page_height: null, origin: null, fonts: {}, images_info: {}, flags: {}, glyphs: 0, inserts: 0, lines: [], other: [] };
  const unknownRecords = []; let line = null, ended = false;
  const add = item => (line ? line.items : dl.other).push(item);
  while (r.pos < bytes.length) {
    const offset = r.pos, tag = r.u8(), n = r.u32(), p = new Reader(r.take(n), offset + 5);
    switch (tag) {
      case 1: {
        dl.width = p.i32(); dl.height = p.i32(); dl.depth = p.i32(); const page = p.i32(); dl.page = page > 0 ? page : null;
        const pw = p.i32(), ph = p.i32(), ox = p.i32(), oy = p.i32();
        if (dl.kind === 'page') { dl.page_width = pw; dl.page_height = ph; dl.origin = [ox, oy]; } else dl.inserts = oy;
        dl.glyphs = p.u32(); p.u32(); break;
      }
      case 2: {
        const id = p.u32(), size = p.i32(), kind = p.u8(); p.u8(); const subfont = p.u16();
        const slant = p.i32(), extend = p.i32(), squeeze = p.i32(), designsize = p.i32();
        const filename = p.str() || null, psname = p.str() || null, name = p.str() || null, fullname = p.str() || null;
        const format = p.str() || [null, 'opentype', 'truetype', 'type1', 'type3'][kind] || null;
        dl.fonts[id] = { id, size, subfont, slant, extend, squeeze, designsize, filename, psname, name, fullname, format, type: kind === 5 ? 'virtual' : 'real', encodingbytes: null, embedding: null }; break;
      }
      case 3: { const key = p.str(); Object.defineProperty(dl.flags, key, { value: p.i32(), enumerable: true, configurable: true }); break; }
      case 0x10:
        if (line) throw new DisplayListError('Nested LINE', offset);
        line = { par: p.i32(), i: p.i32(), x: p.i32(), y: p.i32(), w: p.i32(), h: p.i32(), d: p.i32(), gs: p.f64(), gsign: p.u8(), gorder: p.u8(), items: [] }; break;
      case 0x12:
        if (!line) throw new DisplayListError('LINE_UNIT without LINE', offset);
        line.unit = p.i32(); line.row = p.i32(); break;
      case 0x11:
        if (!line) throw new DisplayListError('LINE_END without LINE', offset);
        dl.lines.push(line); line = null; break;
      case 0x20: {
        const font = p.u32(), y = p.i32(), expansion = p.i32(), count = p.u32(); p.need(count * 16);
        for (let i = 0; i < count; i++) { const ch = p.u32(), index = p.u32(); add(['g', font, ch, index === 0xffffffff ? null : index, p.i32(), y, p.i32(), expansion]); } break;
      }
      case 0x21: add(['r', p.i32(), p.i32(), p.i32(), p.i32()]); break;
      case 0x22: { const cmd = p.u8(); p.u8(); add(['c', p.u16(), cmd === 255 ? null : cmd, p.str()]); break; }
      case 0x23: add(['l', p.i32(), p.str()]); break;
      case 0x24: add(['u', p.str(), p.str()]); break;
      case 0x25: add(['m', p.u8() === 1 ? 'on' : 'off', p.i32()]); break;
      case 0x26: add(['i', p.i32(), p.i32(), p.i32(), p.i32(), p.i32()]); break;
      case 0x27: { const index = p.u32(); dl.images_info[index] = { index, page: p.u32(), pages: p.u32(), file: p.str() }; break; }
      case 0x28: { const op = p.u8(); add(['M', ['save', 'set', 'restore'][op] ?? `unknown:${op}`, p.i32(), p.i32(), p.str()]); break; }
      case 0xff:
        if (line) throw new DisplayListError('Unclosed LINE', offset);
        if (r.pos !== bytes.length) throw new DisplayListError('Trailing data after END', r.pos);
        ended = true; break;
      default: unknownRecords.push({ tag, offset, payloadLength: n }); p.pos = n;
    }
    // Known record extensions are safely skipped, consistent with the upstream reader.
    if (tag === 0xff) { if (n) throw new DisplayListError('END payload must be empty', offset); break; }
  }
  if (!ended) throw new DisplayListError('Missing END', r.pos);
  Object.defineProperty(dl, 'binaryDiagnostics', { value: { magic, version, unknownRecords }, enumerable: false });
  return dl;
}
function validateJSON(dl) {
  if (!dl || !['paragraph', 'page'].includes(dl.kind) || dl.unit !== 'sp' || !Array.isArray(dl.lines)) throw new DisplayListError('Invalid JSON display list');
  const finite = (v, label) => { if (!Number.isFinite(v)) throw new DisplayListError(`Invalid ${label}`); };
  for (const k of ['width', 'height', 'depth']) finite(dl[k] ?? 0, k);
  for (const line of dl.lines) { for (const k of ['x', 'y', 'w', 'h', 'd']) finite(line[k], `line ${k}`); if (!Array.isArray(line.items)) throw new DisplayListError('Invalid line items'); }
  for (const item of [...(dl.other || []), ...dl.lines.flatMap(l => l.items)]) {
    if (!Array.isArray(item) || typeof item[0] !== 'string') throw new DisplayListError('Invalid item');
    const numeric = { g: [1,2,4,5,6], r: [1,2,3,4], c: [1], m: [2], i: [1,2,3,4,5], M: [2,3] }[item[0]] || [];
    for (const i of numeric) finite(item[i], `${item[0]} field ${i}`);
    if (item[0] === 'g' && item[3] !== null && (!Number.isInteger(item[3]) || item[3] < 0)) throw new DisplayListError('Invalid glyph index');
    if (item[0] === 'g') finite(item[7] ?? 0, 'glyph expansion');
  }
  const normalized = { width: 0, height: 0, depth: 0, fonts: {}, flags: {}, images_info: {}, other: [], ...dl };
  if (dl.binaryDiagnostics) Object.defineProperty(normalized, 'binaryDiagnostics', { value: dl.binaryDiagnostics });
  return normalized;
}
export function displayListDiagnostics(dl) {
  const glyph = (item, line) => ({ line, fontId: item[1], charCode: item[2], glyphIndex: item[3], x: item[4], baselineY: item[5], advance: item[6], expansion: item[7] ?? 0 });
  return { kind: dl.kind, unit: 'sp', declaredGlyphCount: dl.glyphs, inserts: dl.inserts || 0, binary: dl.binaryDiagnostics || null,
    lines: dl.lines.map(l => ({ paragraph: l.par, index: l.i, unit: l.unit ?? null, row: l.row ?? null, x: l.x, baselineY: l.y, width: l.w, height: l.h, depth: l.d, glueSet: l.gs, glueSign: l.gsign, glueOrder: l.gorder, glyphCount: l.items.filter(i => i[0] === 'g').length })),
    glyphs: [...dl.other.filter(i => i[0] === 'g').map(i => glyph(i, null)), ...dl.lines.flatMap(l => l.items.filter(i => i[0] === 'g').map(i => glyph(i, l.i)))] };
}
