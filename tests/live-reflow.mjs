// Actual WASM: broadened unit replay, changed geometry, and preserved PDF backdrop regions.
import assert from 'node:assert/strict';
import {BrowserWorker,loadSupportFiles} from './runtime-helpers.mjs';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
import {captureSpans,findLiveEdit,splitPreamble} from '../core/document.js';
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
const longParagraph='This long paragraph crosses a captured page boundary. '.repeat(120);
const source=String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}
\section{Introduction}
First short paragraph with $x=1$ and room to grow.

Second paragraph stays visible after every local edit.

\begin{itemize}
\item First item.
\item Second item with $y=2$.
\end{itemize}

\begin{enumerate}
\item One numbered item.
\item Another numbered item.
\end{enumerate}

\begin{equation}
z=3
\end{equation}

\begin{quote}
A quotation with ordinary text.
\end{quote}

${longParagraph}

\input{part}
\end{document}`;
const part='Included paragraph with $v=4$.\n';
const edits=[
 ['wrap','First short paragraph',('A longer paragraph adds several useful words. ').repeat(6)],
 ['split','with $x=1$','with $x=1$.\n\nA newly split paragraph'],
 ['delete','First short paragraph with $x=1$ and room to grow.',''],
 ['join','grow.\n\nSecond','grow. Second'],
 ['taller math','z=3',String.raw`z=\frac{1}{\displaystyle\sum_{k=1}^{n}k}`],
 ['list item','First item.','First item.\n\\item Inserted item.'],
 ['numbered item','One numbered item.','One numbered item.\n\\item Inserted numbered item.'],
 ['heading','Introduction','An updated introduction'],
 ['quotation','ordinary text','more words and an inline formula $a^2+b^2=c^2$'],
 ['included file','v=4','v=5',true],
 ['cross-page',longParagraph,longParagraph+'Additional lines extend the final captured fragment. '.repeat(25)],
];
try{
 const full=await bg.compile(source,{files:[{path:'part.tex',data:part,rev:1}]});
 Object.entries(full.fonts).forEach(([k,v])=>fonts.set(k,v));
 await live.start(splitPreamble(source).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[],full.packageMisses);
 const generation=live.generation,results=[],scenarios=[];
 for(const [name,from,to,included] of edits){
  const before=included?part:source,spans=captureSpans(before,full.capture,included?'part.tex':'main.tex'),after=before.replace(from,to);
  const edit=findLiveEdit(before,after,full.capture,spans);assert.ok(edit.unit,name+': '+edit.reason);
  const eligible=liveUnitEligibility(full.capture,edit.unit);assert.ok(eligible.ok,name+': '+eligible.reason);
  const ctx=unitContext(full.capture,edit.unit),proof=decodeDisplayList((await live.compile(ctx,edit.span.original,edit.unit.advanced||{})).binary);
  const comparison=compareUnitBaseline(edit.unit,full.pages,proof);
  assert.ok(comparison.ok,name+': '+comparison.reason);
  const began=performance.now(),list=decodeDisplayList((await live.typeset(ctx,edit.source)).binary);
  const changed=replaceUnitRows(full.pages,edit.unit,proof,list,{allowReflow:true}),members=new Set([edit.unit.uid,...edit.removed.map(span=>span.unit.uid)]);
  for(const {unit} of edit.removed){
   const layout=full.pages.map(page=>changed.get(page.page)||page),old={lines:full.pages.flatMap(page=>page.lines.filter(row=>row.unit===unit.uid)).sort((a,b)=>a.row-b.row)};
   for(const [number,page] of replaceUnitRows(layout,unit,old,{fonts:{},lines:[]},{allowReflow:true}))changed.set(number,page);
  }
  for(const [number,page] of changed){
   const original=full.pages.find(p=>p.page===number),bounds=async(sheet,uid)=>(await renderer.render(createCanvas(1,1),{...sheet,flags:{},other:[],lines:sheet.lines.filter(row=>row.unit===uid)},{padding:0})).inkBounds,patches=[];
   for(const uid of members)if(original.lines.some(row=>row.unit===uid))patches.push({uid,before:await bounds(original,uid),after:await bounds(page,uid),reflow:page.reflowUnits?.includes(uid)});
   const flow=pageFlow(original,patches,65536);
   assert.ok(flow.height>0,name);assert.deepEqual(page.other,original.other,'keep page drawing');
   assert.deepEqual(page.lines.filter(row=>!members.has(row.unit)),original.lines.filter(row=>!members.has(row.unit)),'keep other rows');
  }
  results.push({name,oldRows:proof.lines.length,newRows:list.lines.length,ms:Math.round(performance.now()-began)});
  scenarios.push({name,source:included?source:after,part:included?after:part,pages:full.pages.map(page=>changed.get(page.page)||page)});
 }
 assert.equal(bg.next,1);assert.equal(live.generation,generation);
 // Provisional pagination may move ink; glyph identities, sizes, advances and rules must remain real TeX output.
 const ink=pages=>pages.flatMap(page=>page.lines.flatMap(line=>line.items.filter(item=>item[0]==='g'||item[0]==='r').map(item=>JSON.stringify(item[0]==='g'?['g',fontKey(page.fonts[item[1]]),...item.slice(2,4),...item.slice(6)]:['r',...item.slice(3)])))).sort();
 for(const [i,scenario] of scenarios.entries()){
  const fresh=await bg.compile(scenario.source,{files:[{path:'part.tex',data:scenario.part,rev:i+2}]});
  assert.deepEqual(ink(scenario.pages),ink(fresh.pages),scenario.name+': preview ink matches a fresh full compile');
 }
 console.log(JSON.stringify({fullCompilesDuringLocalEdits:1,restarts:0,independentFullComparisons:scenarios.length,results},null,2));
}finally{bg.stop();live.stop();}
