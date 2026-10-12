import { asBytes, decodeDisplayList, displayListDiagnostics } from './display-list.mjs';
export const SP_PER_PT = 65536;
export const CSS_PX_PER_SP = 96 / (72.27 * SP_PER_PT);
export class UnsupportedDisplayListError extends Error {
  constructor(reasons) { super(`Display list requires PDF fallback: ${reasons.map(r => r.message).join('; ')}`); this.name = 'UnsupportedDisplayListError'; this.reasons = reasons; }
}
/** Only device gray/RGB are mapped to Canvas. CMYK/profile colors require PDF. */
export function parsePDFColor(data, previous = '#000000') {
  const words = String(data).trim().split(/\s+/).filter(Boolean); let operands = [], fill = previous;
  for (const word of words) {
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(word)) { const n = Number(word); if (n < 0 || n > 1) throw Error('Color component outside [0,1]'); operands.push(n); continue; }
    const count = { g: 1, G: 1, rg: 3, RG: 3 }[word];
    if (!count || operands.length !== count) throw Error(`Unsupported PDF color operator ${word}`);
    if (word === 'g') fill = `rgb(${Array(3).fill(operands[0] * 255).join(',')})`;
    if (word === 'rg') fill = `rgb(${operands.map(n => n * 255).join(',')})`;
    operands = [];
  }
  if (operands.length) throw Error('Incomplete PDF color operation'); return fill;
}
/** resolveFont(filename, descriptor) -> bytes; pdfFallback({canvas,displayList,reasons,options}). */
export function createDisplayListRenderer({ resolveFont, pdfFallback, parseFont } = {}) {
  const cache = new Map();
  async function fontFor(desc) {
    const key = `${desc.filename}#${desc.subfont || 0}`;
    if (!cache.has(key)) cache.set(key, (async () => {
      if (!resolveFont) throw Error('No font resolver supplied');
      const bytes = asBytes(await resolveFont(desc.filename, desc));
      // LuaTeX uses 1-based face IDs, including 1 for standalone OTF/TTF.
      // Other producers use 0 or the absent-face sentinels -1/0xffff.
      // Detect collections from their actual signature, not the filename or ID.
      if (String.fromCharCode(...bytes.subarray(0, 4)) === 'ttcf') throw Error(`Font collections are unsupported: ${desc.filename}`);
      if (![undefined, null, -1, 0, 1, 65535].includes(desc.subfont)) throw Error(`Standalone font has unsupported face selector ${desc.subfont}: ${desc.filename}`);
      const module = parseFont ? null : await import('opentype.js');
      const parser = parseFont || module.parse || module.default?.parse;
      const font = await parser(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),desc);
      if (!font?.glyphs || !Number.isFinite(font.unitsPerEm) || font.unitsPerEm <= 0) throw Error('Invalid parsed outline font');
      return font;
    })().catch(e => { cache.delete(key); throw e; }));
    return cache.get(key);
  }
  async function render(canvas, input, options = {}) {
    const dl = decodeDisplayList(input), diagnostics = displayListDiagnostics(dl), reasons = [], operations = [];
    const reason = (code, message) => reasons.push({ code, message });
    for (const [key, value] of Object.entries(dl.flags || {})) reason('flag', `${key}: ${value}`);
    for (const record of dl.binaryDiagnostics?.unknownRecords || []) reason('unknown-record', `Unknown record 0x${record.tag.toString(16)} at ${record.offset}`);
    const fonts = new Map(), stacks = new Map(), matrices = []; let fill = '#000000';
    for (const item of [...dl.other, ...dl.lines.flatMap(l => l.items)]) {
      try {
        switch (item[0]) {
          case 'g': {
            const [, id, char, glyphIndex, x, y, , expansion = 0] = item, desc = dl.fonts[id];
            if (!desc) throw Error(`Font ${id} is absent`);
            if (!desc.filename) throw Error(`Font ${id} has no filename`);
            if (/type.?3|tfm|virtual/i.test(`${desc.format || ''} ${desc.type || ''}`)) throw Error(`Font ${id}: unsupported font format`);
            if ((desc.squeeze || 0) !== 0 && desc.squeeze !== 1000) throw Error(`Font squeeze ${desc.squeeze} is unsupported`);
            for (const field of ['size', 'slant', 'extend']) if (desc[field] != null && !Number.isFinite(desc[field])) throw Error(`Invalid font ${field}`);
            if (!(desc.size > 0)) throw Error(`Font ${id} has invalid size`);
            let font = fonts.get(id); if (!font) { font = await fontFor(desc); fonts.set(id, font); }
            const index=desc.format==='type1'?font.codeToGlyph?.get(char):glyphIndex;
            if (!Number.isInteger(index) || index < 0 || index >= font.glyphs.length) throw Error(`Glyph index ${index} outside font ${id}`);
            if (font.tables?.fvar || font.tables?.colr || font.tables?.svg) throw Error(`Variable/color font requires PDF: ${desc.filename}`);
            const glyph = font.glyphs.get(index), path = glyph.path;
            if (!path || !Array.isArray(path.commands)) throw Error(`Missing glyph ${index} outline`);
            for (const c of path.commands) {
              if (!['M', 'L', 'C', 'Q', 'Z'].includes(c.type)) throw Error(`Unsupported outline command ${c.type}`);
              for (const [key, value] of Object.entries(c)) if (key !== 'type' && !Number.isFinite(value)) throw Error(`Non-finite outline coordinate ${key}`);
            }
            const unit = desc.size / font.unitsPerEm, horizontal = (1 + expansion / 1000000) * (desc.extend ? desc.extend / 1000 : 1), slant = (desc.slant || 0) / 1000;
            operations.push({ type: 'glyph', path, x, y, unit, horizontal, slant, fill }); break;
          }
          case 'r': operations.push({ type: 'rule', x: item[1], y: item[2], w: item[3], h: item[4], fill }); break;
          case 'c': {
            const [, id, cmd, data] = item; if (!stacks.has(id)) stacks.set(id, ['#000000']); const stack = stacks.get(id);
            if (cmd === 0) { fill = parsePDFColor(data, fill); stack[stack.length - 1] = fill; }
            else if (cmd === 1) { fill = parsePDFColor(data, fill); stack.push(fill); }
            else if (cmd === 2) { if (stack.length < 2) throw Error(`Color stack ${id} underflow`); stack.pop(); fill = stack.at(-1); }
            else if (cmd === 3) fill = stack.at(-1);
            else throw Error(`Unknown color command ${cmd}`); break;
          }
          case 'M': {
            const [, op, x, y, data] = item;
            if (op === 'save') { matrices.push(fill); operations.push({ type: 'save' }); }
            else if (op === 'restore') { if (!matrices.length) throw Error('Matrix stack underflow'); fill = matrices.pop(); operations.push({ type: 'restore' }); }
            else if (op === 'set') {
              const values = String(data).trim().split(/\s+/).map(Number);
              if (values.length !== 4 || !values.every(Number.isFinite)) throw Error('Invalid matrix');
              operations.push({ type: 'matrix', x, y, values });
            } else throw Error(`Unknown matrix command ${op}`); break;
          }
          case 'm': break; // Diagnostic boundary, no paint.
          case 'l': throw Error(`Raw PDF literal (mode ${item[1]}) requires PDF`);
          case 'u': throw Error(`Unsupported ${item[1]}: ${typeof item[2] === 'string' ? item[2] : JSON.stringify(item[2])}`);
          case 'i': throw Error(`Image resource ${item[1]} requires PDF`);
          default: throw Error(`Unknown item ${item[0]}`);
        }
      } catch (error) { reason(item[0] === 'g' ? 'font-or-glyph' : 'unsupported-item', error.message); }
    }
    if (matrices.length) reason('matrix-stack', 'Unclosed matrix save');
    // Never paint an incomplete display list as though it were exact.
    if (reasons.length) {
      if (pdfFallback) { const result = await pdfFallback({ canvas, displayList: dl, reasons, options }); return { status: 'pdf-fallback', exact: false, reasons, diagnostics, fallback: result }; }
      throw new UnsupportedDisplayListError(reasons);
    }
    const zoom = options.zoom ?? 1, dpr = options.devicePixelRatio ?? globalThis.devicePixelRatio ?? 1, padding = options.padding ?? 16;
    if (![zoom, dpr].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(padding) || padding < 0) throw Error('Invalid rendering scale or padding');
    const scale = CSS_PX_PER_SP * zoom;
    const widthSP = dl.kind === 'page' ? dl.page_width : Math.max(dl.width || 0, ...dl.lines.map(l => l.x + l.w));
    const heightSP = dl.kind === 'page' ? dl.page_height : Math.max((dl.height || 0) + (dl.depth || 0), ...dl.lines.map(l => l.y + l.d));
    const cssWidth = Math.max(1, widthSP * scale + 2 * padding), cssHeight = Math.max(1, heightSP * scale + 2 * padding);
    const width = Math.ceil(cssWidth * dpr), height = Math.ceil(cssHeight * dpr);
    if (!Number.isFinite(width * height) || width > 32767 || height > 32767 || width * height > 64000000) throw Error('Display-list canvas exceeds safe allocation limit');
    const ctx = canvas.getContext('2d'); if (!ctx) throw Error('Canvas 2D context unavailable');
    canvas.width = width; canvas.height = height;
    if (canvas.style) { canvas.style.width = `${cssWidth}px`; canvas.style.height = `${cssHeight}px`; }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = options.background || '#ffffff'; ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, padding * dpr, padding * dpr);
    ctx.save();
    for (const op of operations) {
      if (op.type === 'save') { ctx.save(); continue; }
      if (op.type === 'restore') { ctx.restore(); continue; }
      if (op.type === 'matrix') { const [a, b, c, d] = op.values; ctx.translate(op.x, op.y); ctx.transform(a, -b, -c, d, 0, 0); ctx.translate(-op.x, -op.y); continue; }
      ctx.fillStyle = op.fill;
      if (op.type === 'rule') { if (op.w > 0 && op.h > 0) ctx.fillRect(op.x, op.y, op.w, op.h); continue; }
      ctx.save(); ctx.translate(op.x, op.y);
      // Native font coordinates are y-up. Slant is independent of expansion/extend,
      // matching upstream rtex-verify/src/raster.rs.
      ctx.transform(op.unit * op.horizontal, 0, op.unit * op.slant, -op.unit, 0, 0);
      ctx.beginPath();
      for (const c of op.path.commands) {
        if (c.type === 'M') ctx.moveTo(c.x, c.y);
        else if (c.type === 'L') ctx.lineTo(c.x, c.y);
        else if (c.type === 'C') ctx.bezierCurveTo(c.x1, c.y1, c.x2, c.y2, c.x, c.y);
        else if (c.type === 'Q') ctx.quadraticCurveTo(c.x1, c.y1, c.x, c.y);
        else ctx.closePath();
      }
      ctx.fill('nonzero'); ctx.restore();
    }
    ctx.restore();
    return { status: 'display-list', exact: true, reasons: [], diagnostics, cssWidth, cssHeight, glyphCount: diagnostics.glyphs.length };
  }
  return { render, clearFontCache() { cache.clear(); } };
}
