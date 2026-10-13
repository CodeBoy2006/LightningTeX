import test from 'node:test';
import assert from 'node:assert/strict';
import {firstParagraph,unitContext,liveUnitEligibility,extractUnitRows,compareBaseline,compareUnitBaseline} from '../core/capture.js';
const copy=structuredClone;
function capture(){return {units:[
 {uid:1,kind:'par',nest:1,seqs:[10],counters:{section:1},thefmt:{section:'arabic'},macros:{},everypar:'',ints:{tolerance:2},dims:{hsize:2},nfss:{family:'unit'},color:'unit-color',placements:[{page:1,row:1,x:100,y:200}]},
 {uid:2,kind:'par',nest:1,seqs:[20,21],counters:{equation:2},thefmt:[],macros:{x:'->x'},placements:[]}],paragraphs:[
 {seq:10,nest:1,ints:{tolerance:100},dims:{hsize:900},glues:{baselineskip:[20,0,0,0,0]},parshape:null,begin:{nfss:{family:'body'},color:'0 g 0 G'}},
 {seq:20,nest:2,ints:{tolerance:999},begin:{nfss:{family:'nested'}}},
 {seq:21,nest:1,ints:{tolerance:50},begin:{nfss:{family:'outer'}}}]};}
function drawing(){
 const font={filename:'/fonts/test.otf',size:655360,subfont:0,slant:0,extend:0,squeeze:0};
 const row={unit:1,row:1,x:100,y:200,w:500,h:20,d:4,gs:0,items:[['g',7,65,4,110,200,30,0],['r',120,190,5,2]]};
 const page={kind:'page',unit:'sp',page:1,fonts:{7:font},flags:[],other:[],lines:[row]};
 const live={kind:'paragraph',unit:'sp',fonts:{99:{...font,id:99}},flags:{},other:[],lines:[{...copy(row),x:0,y:20,items:[['g',99,65,4,10,20,30,0],['r',20,10,5,2]]}]};
 return {unit:capture().units[0],page,live};
}
test('contexts replay cumulative state only through the requested unit and remain independent',()=>{
 const c=capture(),before=copy(c),first=unitContext(c,1),second=unitContext(c,2);
 assert.deepEqual(c,before);assert.deepEqual(first.counters,{section:1});assert.deepEqual(first.macros,{});
 assert.deepEqual(second.counters,{section:1,equation:2});assert.deepEqual(second.thefmt,{section:'arabic'});assert.deepEqual(second.macros,{x:'->x'});
 first.counters.section=42;assert.equal(second.counters.section,1);
 assert.deepEqual(unitContext(c,2),second);assert.deepEqual(unitContext(c,1).counters,{section:1});
});
test('context deltas retain typed values and own prototype-like keys without trusting derived fields',()=>{
 const c=capture();
 c.units[0].macros=JSON.parse('{"__proto__":"->safe","x":"->x"}');
 c.units[1].counters={section:1.5,equation:2,unsafe:Number.MAX_SAFE_INTEGER+1};
 c.units[1].thefmt={section:null};c.units[1].macros={x:42};
 c.units[1].abs_counters={section:99};c.units[1].abs_macros={x:'->wrong'};
 c.units.push({uid:3,counters:{section:3},macros:{x:'->later'}});
 const before=copy(c),ctx=unitContext(c,{uid:2});
 assert.deepEqual(ctx.counters,{section:1,equation:2});assert.deepEqual(ctx.thefmt,{section:'arabic'});
 assert.equal(ctx.macros.x,'->x');assert.equal(Object.hasOwn(ctx.macros,'__proto__'),true);assert.equal(ctx.macros.__proto__,'->safe');
 assert.deepEqual(c,before);assert.throws(()=>unitContext(c,999),/not found/);
});
test('context uses first body paragraph parameters and NFSS with unit state',()=>{
 const c=capture();c.units[0].nobreak=true;c.units[0].afterindent=true;
 const ctx=unitContext(c,1);assert.equal(ctx.ints.tolerance,100);assert.equal(ctx.dims.hsize,900);
 assert.equal(ctx.begin.nfss.family,'body');assert.equal(ctx.begin.color,'0 g 0 G');
 assert.equal(ctx.nobreak,true);assert.equal(ctx.afterindent,true);assert.deepEqual(ctx.counters,{section:1});
 ctx.glues.baselineskip[0]=99;assert.equal(c.paragraphs[0].glues.baselineskip[0],20);
 assert.equal(firstParagraph(c,2).seq,21);assert.equal(unitContext(c,2).ints.tolerance,50);
});
test('first paragraph exact fallback order and environment context',()=>{
 const c=capture();c.paragraphs[2].begin=null;assert.equal(firstParagraph(c,2).seq,20);
 c.paragraphs[1].begin=null;assert.equal(firstParagraph(c,2).seq,20);
 c.units[1].seqs=[999,21];assert.equal(firstParagraph(c,2),null);
 c.units[0].kind='env';assert.equal(unitContext(c,1).ints.tolerance,2);assert.equal(unitContext(c,1).begin.nfss.family,'unit');
 c.units[0].name='equation';c.paragraphs=[];
 assert.deepEqual(liveUnitEligibility(c,1),{ok:true});assert.equal(unitContext(c,1).ints.tolerance,2);
});
test('strict paragraph eligibility declines side effects and complex contexts',()=>{
 const c=capture();assert.equal(liveUnitEligibility(c,1).ok,true);assert.equal(liveUnitEligibility(c,2).ok,false);
 c.units[0].advanced={equation:1};assert.equal(liveUnitEligibility(c,1).ok,true);
 c.units[0].advanced={section:1};assert.match(liveUnitEligibility(c,1).reason,/Counter/);
 delete c.units[0].advanced;c.paragraphs[0].flags={dir:1};assert.equal(liveUnitEligibility(c,1).ok,false);
});
test('captured theorem families replay shared numbering and nested hyperref lists without allowing unrelated counters',()=>{
 const c=capture(),unit=c.units[0];unit.kind='env';unit.seqs.push(21);
 for(const name of ['theorem','lemma','proposition','corollary','remark']){
  unit.name=name;unit.advanced={theorem:2,equation:1,Item:3,enumi:3};c.paragraphs[0].flags={glyphs:10,whatsit_pdf_colorstack:2};
  assert.equal(liveUnitEligibility(c,unit).ok,true,name);
 }
 unit.advanced.section=4;assert.match(liveUnitEligibility(c,unit).reason,/Counter/);delete unit.advanced.section;
 c.paragraphs[2].flags={ins:1};assert.equal(liveUnitEligibility(c,unit).ok,false);
 delete c.paragraphs[2].flags;unit.name='customtheorem';assert.equal(liveUnitEligibility(c,unit).ok,false);
 unit.name='enumerate';unit.advanced={enumi:3,Item:3};assert.equal(liveUnitEligibility(c,unit).ok,true);
});
test('baseline compares relative origins with stable font identity and rules',()=>{
 const {unit,page,live}=drawing();assert.deepEqual(compareUnitBaseline(unit,[page],live),{ok:true,rows:1,glyphs:1});
 const baseline=extractUnitRows(new Map([[1,page]]),unit);page.lines[0].x=900;assert.equal(baseline.rows[0].line.x,100);
 assert.equal(compareBaseline(baseline,live).ok,true);
});
test('trailing infinite fill may differ only when every glyph still matches',()=>{
 const {unit,page,live}=drawing();page.lines[0].gorder=live.lines[0].gorder=2;live.lines[0].gs=20;
 assert.equal(compareUnitBaseline(unit,[page],live).ok,true);
 live.lines[0].items[0][4]++;assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
 live.lines[0].items[0][4]--;page.lines[0].gorder=live.lines[0].gorder=0;
 assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
});
test('selected-row proof retains unedited graphics and rejects hidden binary degradation',()=>{
 const {unit,page,live}=drawing();page.flags={literal:1};page.other=[['l',0,'untouched PDF graphics']];
 page.lines.push({unit:9,row:1,items:[['i',1,0,0,1,1]]});
 assert.equal(compareUnitBaseline(unit,[page],live).ok,true);
 Object.defineProperty(page,'binaryDiagnostics',{value:{unknownRecords:[{tag:123}]}});
 assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
});
test('glyph identity, font, expansion, positions, dimensions and rule changes fail',()=>{
 for(const alter of [l=>l.lines[0].items[0][2]++,l=>l.lines[0].items[0][3]++,l=>l.lines[0].items[0][4]++,
  l=>l.lines[0].items[0][7]++,l=>l.fonts[99].filename+='other',l=>l.lines[0].w++,l=>l.lines[0].items[1][3]++]){
  const {unit,page,live}=drawing();alter(live);assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
 }
});
test('missing pages, bad placements, duplicate row indices and extra rows fail',()=>{
 const {unit,page,live}=drawing();assert.equal(compareUnitBaseline(unit,[],live).ok,false);
 unit.placements[0].x++;assert.equal(extractUnitRows([page],unit).ok,false);unit.placements[0].x--;
 live.lines.push(copy(live.lines[0]));assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
 page.lines[0].row=0;assert.equal(extractUnitRows([page],unit).ok,false);
});
test('unsupported drawing, missing fonts, out-of-row content and empty proof fail',()=>{
 for(const alter of [l=>l.lines[0].items.push(['i',1,0,0,1,1]),l=>l.flags={literal:1},l=>l.inserts=1,
  l=>delete l.fonts[99],l=>l.other.push(['g',99,65,4,0,0,1,0]),l=>l.lines[0].items.push(['c',0,0,'1 0 0 rg']),
  l=>l.binaryDiagnostics={unknownRecords:[{tag:123}]}]){
  const {unit,page,live}=drawing();alter(live);assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
 }
 const {unit,page,live}=drawing();page.lines[0].items=[];live.lines[0].items=[];
 assert.match(compareUnitBaseline(unit,[page],live).reason,/No glyphs/);
});
test('harmless black color setup accepted; color stack pop rejected',()=>{
 const {unit,page,live}=drawing();live.other=[['c',0,0,'0 g 0 G']];assert.equal(compareUnitBaseline(unit,[page],live).ok,true);
 live.other=[['c',0,2,'0 g 0 G']];assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
});
test('rows sort by unit row across pages and preserve per-row origins',()=>{
 const {unit,page,live}=drawing();const second=copy(page);second.page=2;
 second.lines[0].row=2;second.lines[0].x=250;second.lines[0].y=400;
 second.lines[0].items=[['g',7,66,5,260,400,31,0]];
 unit.placements.push({page:2,row:2,x:250,y:400});
 live.lines.push({...copy(live.lines[0]),y:80,items:[['g',99,66,5,10,80,31,0]]});
 assert.deepEqual(compareUnitBaseline(unit,{'2':second,'1':page},live),{ok:true,rows:2,glyphs:2});
 second.lines[0].row=1;assert.equal(extractUnitRows([second,page],unit).ok,false);
});
test('empty Lua maps and missing optional begin fields match native defaults',()=>{
 const c=capture();c.units[0].counters=[];c.paragraphs[0].begin={};
 const ctx=unitContext(c,1);assert.deepEqual(ctx.counters,{});assert.deepEqual(ctx.begin,{nfss:{},color:null});
 c.paragraphs[0].ints=[];assert.deepEqual(unitContext(c,1).ints,{});
});

// Real LuaHBTeX 1.24 WASM output, runtime-probe/output/main.rtex{,-page1}.json
// and live-1.bin: original 51-glyph paragraph. Embedded for standalone regression.
const realFixtureGzip = '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';
test('genuine WASM capture and original 51-glyph live baseline agree exactly',async()=>{
 const {gunzipSync}=await import('node:zlib');
 const {decodeDisplayList}=await import('../render/display-list.mjs');
 const fixture=JSON.parse(gunzipSync(Buffer.from(realFixtureGzip,'base64')));
 const payload=Buffer.from(fixture.result,'base64'), jsonLength=payload.readUInt32LE(0);
 // Probe saves kind-1 payload, already stripped of outer length and kind byte.
 const header=JSON.parse(payload.subarray(4,4+jsonLength));
 const live=decodeDisplayList(payload.subarray(4+jsonLength));
 assert.equal(header.status,'ok');assert.deepEqual(header.errors,[]);
 assert.deepEqual(fixture.capture.paragraphs[0].flags,{glyphs:51,hlist:1});
 assert.deepEqual(liveUnitEligibility(fixture.capture,1),{ok:true});
 assert.deepEqual(compareUnitBaseline(fixture.capture.units[0],[fixture.page],live),{ok:true,rows:1,glyphs:51});
 const context=unitContext(fixture.capture,1);
 assert.equal(context.begin.nfss.family,'lmr');assert.equal(context.dims.hsize,22609920);
 assert.equal(context.macros.arraystretch,'->1');
 live.lines[0].items.find(i=>i[0]==='g')[4]++;
 assert.equal(compareUnitBaseline(fixture.capture.units[0],[fixture.page],live).ok,false);
});
test('normal structural counts pass, side-effect flags and nondefault macros fail',()=>{
 const c=capture();c.paragraphs[0].flags={glyphs:51,hlist:1,vlist:0,rule:0,math:0};
 c.units[0].macros={arraystretch:'->1',baselinestretch:'->'};
 assert.equal(liveUnitEligibility(c,1).ok,true);
 for(const flag of ['dir','ins','mark','adjust','whatsit_pdf_literal','unknown']){
   c.paragraphs[0].flags[flag]=1;assert.equal(liveUnitEligibility(c,1).ok,false);delete c.paragraphs[0].flags[flag];
 }
 c.units[0].macros.baselinestretch='->1.5';assert.equal(liveUnitEligibility(c,1).ok,false);
});
test('known composite units retain side-effect checks and heading context replays its own command',()=>{
 const c=capture();c.units[0].kind='heading';c.units[0].name='paragraph';c.units[0].everypar='previous run-in heading';
 c.paragraphs[0].flags={glyphs:10,whatsit_pdf_start_link:1,whatsit_pdf_end_link:1,whatsit_write:1};
 assert.equal(liveUnitEligibility(c,1).ok,true);assert.equal(unitContext(c,1).everypar,'');
 c.units[0].seqs.push(21);assert.equal(liveUnitEligibility(c,1).ok,true);
 c.paragraphs.push({seq:10,flags:{ins:1}});assert.equal(liveUnitEligibility(c,1).ok,false);c.paragraphs.pop();
 c.paragraphs[2].flags={ins:1};assert.equal(liveUnitEligibility(c,1).ok,false);
 delete c.paragraphs[2].flags;c.units[0].kind='env';c.units[0].name='proof';assert.equal(liveUnitEligibility(c,1).ok,true);
 c.paragraphs[0].flags.adjust=1;assert.equal(liveUnitEligibility(c,1).ok,false);
 c.units[0].name='abstract';assert.equal(liveUnitEligibility(c,1).ok,true);
 c.units[0].name='itemize';assert.equal(liveUnitEligibility(c,1).ok,false);
});
test('balanced black stacks are harmless but underflow and colored assignments fail',()=>{
 const {unit,page,live}=drawing();
 for(const dl of [page,live])dl.lines[0].items.unshift(['c',0,1,'0 g 0 G']);
 for(const dl of [page,live])dl.lines[0].items.push(['c',0,2,'']);
 assert.equal(compareUnitBaseline(unit,[page],live).ok,true);
 live.other.push(['c',0,2,'']);assert.equal(compareUnitBaseline(unit,[page],live).ok,false);live.other=[];
 live.lines[0].items[0][3]='1 0 0 rg';assert.equal(compareUnitBaseline(unit,[page],live).ok,false);
});
