// Same inputs and host for old/new binaries; timings exclude UI and canvas drawing.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {BrowserWorker} from './runtime-helpers.mjs';
import {BackgroundEngine,LiveEngine} from '../engine/client.js';
import {splitPreamble,captureSpans} from '../core/document.js';
import {unitContext,compareUnitBaseline,fontKey} from '../core/capture.js';
import {decodeDisplayList} from '../render/display-list.mjs';

const output=process.argv[2];if(!output)throw Error('Usage: node tests/engine-benchmark.mjs output.json [reference.json]');
const base=new URL(process.env.RTEX_ENGINE_BASE||'../public/',import.meta.url);
globalThis.Worker=BrowserWorker;
const source=String.raw`\documentclass{article}
\usepackage{amsmath,amssymb}
\begin{document}
Text with $x^2=81$ here.

A second paragraph with accents: naïve café.
\begin{equation}\sum_{k=1}^n k=\frac{n(n+1)}{2}.\end{equation}
\end{document}`;
const documents=[['opentype',source],['type1',source.replace('\\begin{document}','\\usepackage[T1]{fontenc}\\usepackage{lmodern,microtype}\n\\begin{document}')],['multipage',source.replace('Text with $x^2=81$ here.',Array.from({length:120},(_,i)=>`Paragraph ${i}: Text with $x^2=81$ here. This is a paragraph for page breaking.\n\n`).join(''))]];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const items=(list,fonts)=>list.map(item=>item[0]==='g'?['g',fontKey(fonts[item[1]]),...item.slice(2)]:item);
const signature=pages=>hash(pages.map(page=>({width:page.page_width,height:page.page_height,other:items(page.other||[],page.fonts),lines:page.lines.map(line=>({x:line.x,y:line.y,w:line.w,h:line.h,d:line.d,gs:line.gs,gorder:line.gorder,gsign:line.gsign,items:items(line.items,page.fonts)}))})));
const results=[];
for(let round=0;round<3;round++){
  const runtime={},background=new BackgroundEngine({base,runtime}),live=new LiveEngine({base,runtime});
  try{
    let started=performance.now();await background.start();const loadMs=performance.now()-started;
    const full=await background.compile(source);
    started=performance.now();await live.start(splitPreamble(source).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[],full.packageMisses);const liveStartMs=performance.now()-started;
    const span=captureSpans(source,full.capture)[0],ctx=unitContext(full.capture,span.unit),generation=live.generation;
    const proof=decodeDisplayList((await live.compile(ctx,span.original,span.unit.advanced||{})).binary);
    assert.equal(compareUnitBaseline(span.unit,full.pages,proof).ok,true);
    const times=[],liveSignatures=[];
    for(let i=0;i<30;i++){started=performance.now();const dl=decodeDisplayList((await live.typeset(ctx,span.original.replace('81',i%2?'82':'83'))).binary);times.push(performance.now()-started);liveSignatures.push(signature([{...dl,page_width:dl.box?.w,page_height:dl.box?.h}]));}
    assert.equal(live.generation,generation);live.stop();
    const layouts=[];
    for(const [name,text] of documents){const result=await background.compile(text);layouts.push({name,pages:result.pages.length,signature:signature(result.pages),ms:result.durationMs,passes:result.passes});}
    results.push({loadMs,liveStartMs,fullMs:full.durationMs,liveMedianMs:times.sort((a,b)=>a-b)[15],layouts,liveSignature:hash(liveSignatures)});
  }finally{background.stop();live.stop();}
}
const report={scope:'Three sequential fresh Worker pairs; core WASM and IPC only, no browser input timer or renderer.',sourceHash:hash(documents),results};
if(process.argv[3]){const reference=JSON.parse(await fs.readFile(process.argv[3],'utf8'));assert.equal(report.sourceHash,reference.sourceHash);for(let i=0;i<3;i++){assert.deepEqual(results[i].layouts.map(({name,pages,signature})=>({name,pages,signature})),reference.results[i].layouts.map(({name,pages,signature})=>({name,pages,signature})));assert.equal(results[i].liveSignature,reference.results[i].liveSignature);}report.matchesReference=true;}
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
