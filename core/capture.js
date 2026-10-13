/** In-memory subset of rtex capture.rs::finalize and layout.rs::EngineUnit/probe_check.
 * This intentionally rejects drawing/state outside the browser's bounded live path.
 * Coordinates remain integer scaled points; engine-local font IDs are never compared.
 */
const clone = value => structuredClone(value);
const map = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const fail = reason => ({ok:false, reason});
const nonempty = value => Object.keys(map(value)).length > 0;

function resolveUnit(capture, unitOrId) {
  const uid = typeof unitOrId==='object' ? unitOrId?.uid : unitOrId;
  const unit = (capture.units || []).find(u=>u.uid===uid);
  if (!unit) throw new Error(`Capture unit ${uid} not found`);
  return unit;
}
export function firstParagraph(capture, unitOrId) {
  const unit = resolveUnit(capture,unitOrId), paragraphs = new Map((capture.paragraphs || []).map(p=>[p.seq,p]));
  const members = (unit.seqs || []).map(seq=>paragraphs.get(seq)).filter(Boolean);
  // Match native layout.rs:245 exactly: the final fallback is the first seq, not
  // the first existing seq (a missing first record must not select a later one).
  return members.find(p=>p.nest===1 && p.begin != null)
    || members.find(p=>p.begin != null) || paragraphs.get(unit.seqs?.[0]) || null;
}
export function unitContext(capture, unitOrId) {
  const unit = resolveUnit(capture,unitOrId), counters = {}, thefmt = {}, macros = {};
  const merge = (target, delta, valid) => { for (const [key,value] of Object.entries(map(delta))) {
    if (valid(value)) Object.defineProperty(target,key,{value,enumerable:true,writable:true,configurable:true});
  }};
  // Replay deltas through this unit; later units cannot affect its context.
  for (const current of capture.units) {
    merge(counters,current.counters,Number.isSafeInteger);
    merge(thefmt,current.thefmt,v=>typeof v==='string');
    merge(macros,current.macros,v=>typeof v==='string');
    if(current===unit)break;
  }
  const first = firstParagraph(capture,unit), params = unit.kind==='par' && first ? first : unit;
  const start = unit.kind==='par' && first?.begin != null ? first.begin : unit;
  return clone({kind:unit.kind,name:unit.name??null,
    ints:map(params.ints),dims:map(params.dims),glues:map(params.glues),parshape:params.parshape??null,
    // A captured heading includes its own command, which installs its own everypar.
    everypar:unit.kind==='heading'?'':unit.everypar??'',nobreak:unit.nobreak??false,afterindent:unit.afterindent??false,noskipsec:unit.noskipsec??false,
    counters,thefmt,macros,
    begin:{nfss:map(start.nfss),color:start.color??null}});
}

/** Additional gate, not a TeX parser or replacement for checking old/new source. */
export function liveUnitEligibility(capture, unitOrId) {
  let unit; try {unit=resolveUnit(capture,unitOrId);} catch(e) {return fail(e.message);}
  const math=unit.kind==='env'&&/^(equation|align|gather|multline|displaymath)\*?$/.test(unit.name);
  const composite=unit.kind==='env'&&['proof','abstract'].includes(unit.name)
    ||unit.kind==='heading'&&['paragraph','subparagraph'].includes(unit.name);
  if (!math&&!composite&&(unit.kind!=='par' || unit.nest!==1)) return fail('Only top-level text and math units are live');
  if (!math&&!composite&&unit.seqs?.length!==1) return fail('Composite or nested paragraphs require full layout');
  const p=firstParagraph(capture,unit);
  if (!math&&!composite&&(!p?.begin || p.nest!==1)) return fail('No unambiguous paragraph context');
  if (!unit.placements?.length) return fail('No captured row placements');
  // The server validates/replays kernel everypar (including paragraphs after headings).
  if (unit.noskipsec) return fail('Run-in headings require full layout');
  if (Object.keys(map(unit.advanced)).some(key=>key!=='equation'&&!(unit.kind==='heading'&&['bookmark@seq@number','section@level'].includes(key)))) return fail('Counter changes require full layout');
  // capture.lua::scan_flags reports node COUNTS, not only degradation flags.
  // Ordinary prose has glyphs and an indentation hlist. Accept structural counts;
  // inserts, marks, adjustments, direction changes and whatsits still fall back.
  const structural = new Set(['glyphs','hlist','vlist','rule','math','whatsit_pdf_start_link','whatsit_pdf_end_link','whatsit_write']);
  if (unit.kind==='env'&&unit.name==='abstract')structural.add('adjust');
  const members=(capture.paragraphs||[]).filter(paragraph=>unit.seqs?.includes(paragraph.seq));
  if (members.some(paragraph=>Object.entries(map(paragraph.flags)).some(([key,value]) =>
    !Number.isSafeInteger(value) || value < 0 || (value !== 0 && !structural.has(key)))))
    return fail('Paragraph has unsupported engine flags');
  // The capture records these standard kernel meanings even in a blank article.
  // Permit only their exact idle defaults, not arbitrary body redefinitions.
  const idleMacros = {arraystretch:'->1',baselinestretch:'->'};
  if (Object.entries(unitContext(capture,unit).macros).some(([key,value]) =>
    !Object.hasOwn(idleMacros,key) || value !== idleMacros[key]))
    return fail('Body macro state requires full layout');
  return {ok:true};
}

function pageEntries(pages) {
  if (pages instanceof Map) return [...pages.entries()].map(([n,dl])=>[Number(n),dl]);
  if (Array.isArray(pages)) return pages.map((entry,index)=>Array.isArray(entry)?entry:[entry.page??index+1,entry]);
  return Object.entries(pages || {}).map(([n,dl])=>[Number(n),dl]);
}
const black = data => /^(?:0\s+g(?:\s+0\s+G)?|0\s+G|0\s+0\s+0\s+rg(?:\s+0\s+0\s+0\s+RG)?)$/.test(String(data).trim());
const blackColor = item => item[0]==='c'&&([0,1].includes(item[2])?black(item[3]):[2,3].includes(item[2])&&item[3]==='');
export function globalDrawingReason(dl, live=false) {
  if (!dl || !Array.isArray(dl.lines)) return 'Missing display-list rows';
  if (nonempty(dl.flags) || dl.inserts || dl.binaryDiagnostics?.unknownRecords?.length) return 'Unsupported or degraded display list';
  // Page other glyphs/rules belong to headers etc.; cannot compare them to unit output.
  // Black color assignments are harmless; any other state might affect selected rows.
  for (const item of dl.other || []) {
    if (blackColor(item)) continue;
    if (!live && ['g','r'].includes(item[0])) continue;
    return 'Drawing outside unit rows requires full layout';
  }
  const stacks=new Map();
  for(const item of [...dl.other||[],...dl.lines.flatMap(line=>line.items||[])])if(item[0]==='c'){
    if(!blackColor(item))return 'Unsupported color state requires full layout';
    const depth=stacks.get(item[1])??1;
    if(item[2]===2&&depth===1)return 'Color stack underflow requires full layout';
    stacks.set(item[1],depth+(item[2]===1?1:item[2]===2?-1:0));
  }
  if([...stacks.values()].some(depth=>depth!==1))return 'Unclosed color stack requires full layout';
  return null;
}
export function extractUnitRows(pages, unit) {
  if (!unit?.placements?.length) return fail('No captured placements');
  const entries=pageEntries(pages), rows=[], needed=new Set(unit.placements.map(p=>p.page));
  for (const page of needed) {
    const dl=entries.find(([n])=>n===page)?.[1];
    if (!dl) return fail(`Missing page ${page} display list`);
    // Unedited PDF graphics are retained as the page backdrop; prove selected rows only.
    if(Object.keys(map(dl.flags)).some(key=>key!=='literal'))return fail('Unsupported or degraded display list');
    const selected=dl.lines.filter(l=>l.unit===unit.uid);
    const reason=globalDrawingReason({...dl,binaryDiagnostics:dl.binaryDiagnostics,flags:{},other:[],lines:selected}); if(reason)return fail(reason);
    for(const line of selected) rows.push({page,line,fonts:dl.fonts||{}});
  }
  rows.sort((a,b)=>a.line.row-b.line.row);
  if (!rows.length || rows.length!==unit.placements.length) return fail('Captured rows do not match placements');
  for(let i=0;i<rows.length;i++) {
    if (rows[i].line.row!==i+1) return fail('Ambiguous or missing unit row index');
    const placement=unit.placements.find(p=>p.row===i+1);
    if(!placement || placement.page!==rows[i].page || placement.x!==rows[i].line.x || placement.y!==rows[i].line.y)
      return fail('Captured row and placement disagree');
  }
  return {ok:true,uid:unit.uid,rows:clone(rows)};
}

/** Mirrors native FontDesc::key; no process-local-ID fallback in this strict gate. */
export function fontKey(desc) {
  const name=desc?.filename??desc?.psname??desc?.name;
  if (!name || !Number.isFinite(desc?.size)) return null;
  // Rust f64::round rounds halves away from zero (sizes are positive).
  return `${name}#${desc.encoding_file??''}#${desc.subfont??0}@${Math.round(desc.size)}/${desc.slant??0}/${desc.extend??0}/${desc.squeeze??0}`;
}
function normalizeRow(line, fonts) {
  for(const key of ['x','y','w','h','d']) if(!Number.isSafeInteger(line[key])) return fail(`Invalid row ${key}`);
  if(!Number.isFinite(line.gs??0))return fail('Invalid row glue');
  const items=[];let glyphs=0;
  for(const item of line.items || []) {
    if(!Array.isArray(item))return fail('Malformed drawing item');
    if(item[0]==='g') {
      const key=fontKey(fonts[item[1]]);
      if(!key)return fail('Missing stable font descriptor');
      if(![item[2],item[4],item[5],item[6],item[7]??0].every(Number.isSafeInteger)
        || (item[3]!=null && !Number.isSafeInteger(item[3])))return fail('Invalid glyph metrics');
      items.push(['g',key,item[2],item[3]??null,item[4]-line.x,item[5]-line.y,item[6],item[7]??0]);glyphs++;
    } else if(item[0]==='r') {
      if(!item.slice(1,5).every(Number.isSafeInteger)||item.length<5)return fail('Invalid rule metrics');
      items.push(['r',item[1]-line.x,item[2]-line.y,item[3],item[4]]);
    } else if(item[0]==='m'&&['on','off'].includes(item[1])&&Number.isSafeInteger(item[2])) {
      // Math boundaries have no ink; the surrounding glyph positions carry the layout.
    } else if(blackColor(item)) {
      // Canonical black assignments can differ between page and paragraph setup.
    } else return fail(`Unsupported drawing item ${item[0]} requires full layout`);
  }
  return {ok:true,items,glyphs};
}

export function compareBaseline(baseline, live) {
  if(!baseline?.ok)return fail(baseline?.reason || 'Missing baseline rows');
  const reason=globalDrawingReason(live,true);if(reason)return fail(reason);
  if(live.lines.length!==baseline.rows.length)return fail('Row count differs from captured baseline');
  let glyphs=0;
  for(let i=0;i<baseline.rows.length;i++) {
    const reference=baseline.rows[i],a=live.lines[i],b=reference.line;
    if(['w','h','d'].some(k=>a[k]!==b[k]) || Math.abs((a.gs??0)-(b.gs??0))>1e-12
      || (a.gsign??0)!==(b.gsign??0) || (a.gorder??0)!==(b.gorder??0))return fail(`Row ${i+1} box or glue differs`);
    const left=normalizeRow(a,live.fonts||{}),right=normalizeRow(b,reference.fonts);
    if(!left.ok)return left;if(!right.ok)return right;
    if(JSON.stringify(left.items)!==JSON.stringify(right.items))return fail(`Row ${i+1} glyphs or rules differ`);
    glyphs+=left.glyphs;
  }
  if(!glyphs)return fail('No glyphs to prove baseline equivalence');
  return {ok:true,rows:baseline.rows.length,glyphs};
}
export function compareUnitBaseline(unit,pages,live) {return compareBaseline(extractUnitRows(pages,unit),live);}
