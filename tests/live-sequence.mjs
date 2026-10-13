// Cumulative editing benchmark using the shipped WASM, source routing and real font outlines.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {BrowserWorker,loadSupportFiles} from './runtime-helpers.mjs';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
import {captureSpans,findLiveEdit,acceptLiveEdit,splitPreamble} from '../core/document.js';
import {unitContext,compareUnitBaseline,liveUnitEligibility,fontKey} from '../core/capture.js';
import {replaceUnitRows,pageFlow} from '../core/live-layout.js';
import {decodeDisplayList,createDisplayListRenderer} from '../render/index.mjs';
import {parseEngineFont} from '../render/type1-font.mjs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';

globalThis.Worker=BrowserWorker;
const base=new URL('../public/',import.meta.url),files=await loadSupportFiles(base),fonts=new Map();
const bg=new BackgroundEngine({base,files}),live=new LiveEngine({base,files,onFonts:items=>Object.entries(items).forEach(([k,v])=>fonts.set(k,v))});
const renderer=createDisplayListRenderer({resolveFont:async name=>fonts.get(name),parseFont:(bytes,desc)=>parseEngineFont(bytes,desc,pdfjs)});
const long='Crossing pages keeps all of this paragraph visible. '.repeat(120);
const equation=String.raw`\begin{equation}
z=3
\end{equation}`;
const initial=String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}

First paragraph with $x=1$ and a typing marker.${'  '}

Second paragraph remains visible.

${equation}

${long}

Last paragraph with $v=4$.
\end{document}`;
// Compare ink independently of provisional page breaks and positions, as in live-reflow.mjs.
const ink=pages=>pages.flatMap(page=>page.lines.flatMap(line=>line.items.filter(item=>item[0]==='g'||item[0]==='r').map(item=>JSON.stringify(item[0]==='g'?['g',fontKey(page.fonts[item[1]]),...item.slice(2,4),...item.slice(6)]:['r',...item.slice(3)])))).sort();
try{
 const full=await bg.compile(initial),state={source:initial,spans:captureSpans(initial,full.capture)},proofs=new Map(),edits=new Map(),results=[],checkpoints=[];
 Object.entries(full.fonts).forEach(([k,v])=>fonts.set(k,v));
 await live.start(splitPreamble(initial).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[],full.packageMisses);
 const generation=live.generation;
 let pages=full.pages,waiting=0;
 async function apply(name,after,checkpoint=false){
  const began=performance.now(),edit=findLiveEdit(state.source,after,full.capture,state.spans);
  if(edit.incomplete){assert.equal(name,'formula typing');assert.equal(checkpoint,false);waiting++;return;}
  assert.ok(edit.unit,name+': '+edit.reason);
  for(const unit of [edit.unit,...edit.removed.map(span=>span.unit)])assert.ok(liveUnitEligibility(full.capture,unit).ok,name);
  const ctx=unitContext(full.capture,edit.unit);
  if(!proofs.has(edit.unit.uid)){
   const proof=decodeDisplayList((await live.compile(ctx,edit.span.original,edit.unit.advanced||{})).binary);
   const comparison=compareUnitBaseline(edit.unit,full.pages,proof);assert.ok(comparison.ok,name+': '+comparison.reason);proofs.set(edit.unit.uid,proof);
  }
  const list=decodeDisplayList((await live.typeset(ctx,edit.source)).binary);
  edits.set(edit.unit.uid,{unit:edit.unit,proof:proofs.get(edit.unit.uid),list});
  for(const {unit} of edit.removed)edits.set(unit.uid,{unit,proof:{lines:full.pages.flatMap(page=>page.lines.filter(row=>row.unit===unit.uid)).sort((a,b)=>a.row-b.row)},list:{fonts:{},lines:[]}});
  pages=full.pages;
  for(const item of edits.values()){
   const changed=replaceUnitRows(pages,item.unit,item.proof,item.list,{allowReflow:true});pages=pages.map(page=>changed.get(page.page)||page);
  }
  const affected=new Set([edit.unit,...edit.removed.map(span=>span.unit)].flatMap(unit=>unit.placements.map(row=>row.page)));
  for(const number of affected){
   const page=pages.find(page=>page.page===number),original=full.pages.find(page=>page.page===number),patches=[];
   const bounds=async(sheet,uid)=>(await renderer.render(createCanvas(1,1),{...sheet,flags:{},other:[],lines:sheet.lines.filter(row=>row.unit===uid)},{padding:0})).inkBounds;
   for(const uid of edits.keys())if(original.lines.some(row=>row.unit===uid))patches.push({uid,before:await bounds(original,uid),after:await bounds(page,uid),reflow:page.reflowUnits?.includes(uid)});
   assert.ok(pageFlow(original,patches,65536).height>0,name);
   assert.deepEqual(page.other,original.other,name+': surrounding drawing retained');
   assert.deepEqual(page.lines.filter(row=>!edits.has(row.unit)),original.lines.filter(row=>!edits.has(row.unit)),name+': untouched rows retained');
  }
  acceptLiveEdit(state,edit,after);
  results.push({name,ms:Number((performance.now()-began).toFixed(2)),pages:affected.size,rows:list.lines.length});
  if(checkpoint)checkpoints.push({name,source:after,ink:ink(pages)});
 }
 const phrase=' Continuous typing changes line breaks while keeping later paragraphs intact.';
 for(const char of phrase)await apply('typing',state.source.replace(' marker.',char+' marker.'));
 for(let i=0;i<20;i++)await apply('backspace',state.source.replace(/. marker\./,' marker.'));
 await apply('split',state.source.replace(' and a','\n\nA split paragraph and a'),true);
 await apply('join',state.source.replace('\n\nA split',' A split'),true);
 await apply('insert between paragraphs',state.source.replace('\n\nSecond','\n\nInserted paragraph with $a=2$.\n\nSecond'),true);
 await apply('delete inserted paragraph',state.source.replace('Inserted paragraph with $a=2$.\n\n',''),true);
 await apply('join with trailing spaces',state.source.replace('marker.  \n\nSecond','marker. Second'),true);
 const formula=String.raw`\frac{1}{\sqrt{2}}`;
 const beforeMath=state.source;
 for(let i=1;i<=formula.length;i++)await apply('formula typing',beforeMath.replace('x=1','x='+formula.slice(0,i)),i===formula.length);
 assert.equal(waiting,formula.length-1,'every unfinished formula prefix retains the last accepted source');
 await apply('grow equation',state.source.replace('z=3',String.raw`z=\frac{1}{\displaystyle\sum_{k=1}^{n}k}`),true);
 await apply('grow across pages',state.source.replace(long,long+'Extra lines after the old page break. '.repeat(25)),true);
 await apply('shrink across pages',state.source.replace(long,long.slice(0,100)),true);
 await apply('delete cross-page paragraph',state.source.replace(/Crossing pages[\s\S]*?(?=\n\nLast)/,''),true);
 await apply('restore cross-page paragraph',state.source.replace('\n\nLast','\n\n'+long+'\n\nLast'),true);
 await apply('edit later paragraph',state.source.replace('v=4','v=5'),true);
 await apply('insert before first paragraph',state.source.replace('\n\nFirst','\nA new leading paragraph.\n\nFirst'),true);
 const currentEquation=/\\begin\{equation\}[\s\S]*?\\end\{equation\}/.exec(state.source)[0];
 await apply('delete whole equation with separators',state.source.replace('\n\n'+currentEquation+'\n\n','\n\n'),true);
 await apply('restore whole equation',state.source.replace('\n\nCrossing','\n\n'+currentEquation+'\n\nCrossing'),true);
 assert.equal(bg.next,1,'no full compile during cumulative local edits');assert.equal(live.generation,generation,'no live engine restarts');
 for(const checkpoint of checkpoints){
  const fresh=await bg.compile(checkpoint.source);assert.deepEqual(checkpoint.ink,ink(fresh.pages),checkpoint.name+': same ink as independent full compilation');
 }
 const times=results.map(row=>row.ms).sort((a,b)=>a-b),report={runtime:'actual WASM and font outlines; sequential requests, no browser input timer',initialPages:full.pages.length,localEdits:results.length,incompleteInputsRetained:waiting,fullCompilesDuringLocalEdits:1,restarts:0,independentFullComparisons:checkpoints.length,medianMs:times[Math.floor(times.length/2)],p95Ms:times[Math.floor(times.length*.95)],maxMs:times.at(-1),results};
 await writeFile(new URL('../qa/live-sequence.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}finally{bg.stop();live.stop();}
