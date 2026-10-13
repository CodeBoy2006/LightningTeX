// Real persistent WASM edits, exact full-layout comparison, and real font outlines.
import {BrowserWorker,loadSupportFiles} from './runtime-helpers.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
import {splitPreamble,captureSpans,findLiveEdit,acceptLiveEdit} from '../core/document.js';
import {unitContext,liveUnitEligibility,compareUnitBaseline,fontKey} from '../core/capture.js';
import {replaceUnitRows} from '../core/live-layout.js';
import {decodeDisplayList,createDisplayListRenderer} from '../render/index.mjs';
import {parseEngineFont} from '../render/type1-font.mjs';
import {parseMacros} from '../core/math-preview.js';
const root=new URL('../',import.meta.url),base=new URL('public/',root),files=await loadSupportFiles(base);
globalThis.Worker=BrowserWorker;
const fonts=new Map(),bg=new BackgroundEngine({base,files}),live=new LiveEngine({base,files,onFonts:items=>Object.entries(items).forEach(([key,value])=>fonts.set(key,value))});
const renderer=createDisplayListRenderer({resolveFont:async name=>fonts.get(name),parseFont:(buffer,desc)=>parseEngineFont(buffer,desc,pdfjs)});
const initial=String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\usepackage[T1]{fontenc}
\usepackage{lmodern,microtype,hyperref,amsthm}
\newcommand{\R}{\mathbb R}
\begin{document}
\begin{abstract}
A first statement has $s=10$.

A second statement lives in $\R$.
\end{abstract}
Text with $x^2=81$ here.

\[\sum_{k=1}^n k=\frac{n(n+1)}{2}.\]

\begin{equation}\label{eq:value}
y=10
\end{equation}

\begin{align}
a&=20,\\
\det R&=30.
\end{align}

Last paragraph stays here.

\begin{proof}
A bound holds for $v^2=44$.

Therefore the proof ends here.
\end{proof}

\paragraph{Approach.}
A method yields $w=21$.
\end{document}`;
const ink=page=>[...(page.other||[]),...page.lines.flatMap(line=>line.items)].filter(item=>['g','r'].includes(item[0])).map(item=>item[0]==='g'?['g',fontKey(page.fonts[item[1]]),...item.slice(2)]:item);
try {
 const full=await bg.compile(initial),capture=full.capture,state={source:initial,spans:captureSpans(initial,capture),macros:parseMacros(splitPreamble(initial).preamble)},proofs=new Map();
 let pages=full.pages;Object.entries(full.fonts).forEach(([key,value])=>fonts.set(key,value));
 await live.start(splitPreamble(initial).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[],full.packageMisses);
 const generation=live.generation,times=[];
 const edits=[['x^2','x^3'],['n(n+1)','n(n+2)'],['y=10','y=11'],['R&=30','R&=31'],['Last paragraph','Final paragraph'],['x^3','\\alpha^3'],['s=10','s=11'],['v^2','v^3'],['w=21','w=22']];
 for(let i=0;i<26;i++){
   const [before,after]=i<edits.length?edits[i]:(i-edits.length)%2?['=82','=81']:['=81','=82'];
   const source=state.source.replace(before,after),edit=findLiveEdit(state.source,source,capture,state.spans,state.macros);
   assert.ok(edit.unit,`${before}: ${edit.reason}`);assert.ok(liveUnitEligibility(capture,edit.unit).ok,JSON.stringify(liveUnitEligibility(capture,edit.unit)));
   const context=unitContext(capture,edit.unit),expected=edit.unit.advanced||{};
   if(!proofs.has(edit.unit.uid)){
     const proof=decodeDisplayList((await live.compile(context,edit.span.original,expected)).binary);
     const comparison=compareUnitBaseline(edit.unit,full.pages,proof);assert.ok(comparison.ok,`${before}: ${comparison.reason}`);proofs.set(edit.unit.uid,proof);
   }
   const began=performance.now(),result=await live.compile(context,edit.source,expected),list=decodeDisplayList(result.binary);
   const changed=replaceUnitRows(pages,edit.unit,proofs.get(edit.unit.uid),list);
   pages=pages.map(page=>changed.get(page.page)||page);acceptLiveEdit(state,edit,source);
   const canvas=createCanvas(1,1);await renderer.render(canvas,pages[0],{zoom:1.2,padding:0,devicePixelRatio:1});
   times.push(performance.now()-began);
   if(i===25)await fs.writeFile(new URL('qa/incremental-math.png',root),canvas.toBuffer('image/png'));
 }
 assert.equal(bg.next,1,'26 local edits must not trigger a full compile');assert.equal(live.generation,generation,'local edits must not restart TeX');
 const fresh=await bg.compile(state.source);
 assert.deepEqual(pages.map(ink),fresh.pages.map(ink),'incremental glyph positions and identities must equal a fresh full compile');
 const incomplete=findLiveEdit(state.source,state.source.replace('\\alpha^3','\\alpha^{'),capture,state.spans);assert.equal(incomplete.incomplete,true);
 const label=findLiveEdit(state.source,state.source.replace('eq:value','eq:other'),capture,state.spans);assert.equal(label.unit,undefined);
 const report={runtime:'actual WASM, PDF.js Type1 conversion, OpenType outline renderer',localEdits:26,fullCompilesDuringEdits:1,engineRestartsDuringEdits:0,exactFinalLayout:true,firstEditMs:times[0],warmMedianMs:times.slice(6).sort((a,b)=>a-b)[10],times};
 await fs.writeFile(new URL('qa/incremental-math.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{bg.stop();live.stop();}
