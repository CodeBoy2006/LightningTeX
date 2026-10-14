// Exercise the actual main.js host with real WASM, fonts and canvas rendering; only the editor DOM is adapted.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createCanvas} from '@napi-rs/canvas';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as engine from '../engine/index.js';
import {fontKey} from '../core/capture.js';
import {BrowserWorker} from './runtime-helpers.mjs';

globalThis.Worker=BrowserWorker;
const source=String.raw`\documentclass{article}
\input{macros}
\begin{document}
Root start with $r=1$.

\input{chapters/one}
\section{Second}
\input{chapters/two}
\include{chapters/three}

Root tail with $t=4$.
\end{document}`;
const texts=new Map([
 ['paper/main.tex',source],
 ['macros.tex',String.raw`\newcommand{\R}{\mathbf{R}}`],
 ['chapters/one.tex','First paragraph.\n\nA final paragraph\ncontinues with $x=1$ in $\\R$.\n'],
 ['chapters/two.tex','\\input{chapters/nested}\n'],
 ['chapters/nested.tex','Nested first paragraph.\n\nNested last paragraph\ncontinues with $y=2$.\n'],
 ['chapters/three.tex','Included first paragraph.\n\nIncluded last paragraph with $z=3$.\n'],
]);
let revision=0,options,runtime,liveGate;
const canvases=new Map(),painted=[],statuses=[],times=[],listeners=new Map();
const request=reason=>({root:'paper/main.tex',source:texts.get('paper/main.tex'),files:[...texts].filter(([path])=>path!=='paper/main.tex').map(([path,data])=>({path,data,rev:revision})),filesRev:revision,revision,reason});
const canvas=()=>Object.assign(createCanvas(1,1),{style:{},dataset:{},setAttribute(){}});
let resolveBoot,rejectBoot;const booted=new Promise((resolve,reject)=>{resolveBoot=resolve;rejectBoot=reject;});
const ui={
 ready:Promise.resolve(),getState:()=>({revision}),project:{get:path=>({text:texts.get(path)})},
 setEngineStatus:()=>{},setLoadProgress:()=>{},setMarker:()=>{},refreshMath:()=>{},setProblems:()=>{},
 setLiveStatus:value=>statuses.push(value),log:(message,level)=>{if(level==='error')rejectBoot(Error(message));},
 setLivePages:result=>{
  if(result.revision!==revision)return false;
  for(const [page,value] of result.canvases)canvases.set(page,value);
  painted.push(result);times.push(result.durationMs);return true;
 },
 async compile(reason){
  try{
   const result=await options.onCompile(request(reason));
   if(result?.pdf){canvases.clear();await options.renderPdf({bytes:result.pdf.slice(),container:{append:value=>canvases.set(Number(value.dataset.page),value)},signal:new AbortController().signal,zoom:1,viewport:{clientWidth:900}});}
   if(reason==='initial')resolveBoot();return result;
  }catch(error){rejectBoot(error);throw error;}
 },
};
const context=vm.createContext({console,URL,Map,Set,Uint8Array,SharedArrayBuffer,AbortController,performance,devicePixelRatio:1,crossOriginIsolated:true,
 fetch:async()=>({ok:false}),window:{addEventListener:(name,fn)=>listeners.set(name,fn)},
 document:{baseURI:'http://localhost/ui/index.html',createElement:canvas,querySelector:selector=>canvases.get(Number(/data-page="(\d+)"/.exec(selector)?.[1]))}});
const host=new vm.SourceTextModule(await fs.readFile(new URL('../main.js',import.meta.url),'utf8')+'\nexport {snapshot};',{context});
await host.link(async specifier=>{
 let exports;
 if(specifier==='./ui/editor.js')exports={mountEditor:value=>{options=value;return ui;}};
 else if(specifier==='./engine/index.js')exports={...engine,createEngine:async args=>{
  runtime=await engine.createEngine({...args,base:new URL('../public/',import.meta.url)});
  const typeset=runtime.live.typeset.bind(runtime.live);
  runtime.live.typeset=async(...args)=>{if(liveGate)await liveGate();return typeset(...args);};
  return runtime;
 }};
 else if(specifier==='pdfjs-dist')exports=pdfjs;
 else if(specifier.endsWith('?url'))exports={default:new URL('../node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs',import.meta.url).href};
 else exports=await import(new URL('../'+specifier,import.meta.url));
 return new vm.SyntheticModule(Object.keys(exports),function(){for(const [key,value] of Object.entries(exports))this.setExport(key,value);},{context});
});
const edit=(path,from,to)=>{assert.ok(texts.get(path).includes(from),from);texts.set(path,texts.get(path).replace(from,to));revision++;};
const ink=pages=>pages.flatMap(page=>page.lines.flatMap(line=>line.items.filter(item=>item[0]==='g'||item[0]==='r').map(item=>JSON.stringify(item[0]==='g'?['g',fontKey(page.fonts[item[1]]),...item.slice(2,4),...item.slice(6)]:['r',...item.slice(3)])))).sort();
const checkpoints=[];
async function preview(label){
 const count=painted.length,result=await options.onPreview(request('auto'));
 assert.ok(result,label+': '+statuses.at(-1)?.reason);
 assert.equal(painted.length,count+1,label+': paints once');
 assert.equal(painted.at(-1).revision,revision);
 checkpoints.push({label,job:request('check'),ink:ink(host.namespace.snapshot.drawnPages)});
}
try{
 await host.evaluate();await booted;
 const initial=host.namespace.snapshot;
 for(const path of ['chapters/one.tex','chapters/nested.tex','chapters/three.tex'])assert.equal(initial.documents.get(path).spans.length,2,path);
 edit('chapters/one.tex','x=1','x=5');await preview('input EOF');
 const generation=runtime.live.generation;
 edit('chapters/nested.tex','y=2','y=6');await preview('nested input EOF');
 edit('chapters/three.tex','z=3','z=7');await preview('include EOF');
 edit('paper/main.tex','r=1','r=8');edit('chapters/one.tex','x=5','x=9');edit('chapters/nested.tex','y=6','y=4');await preview('three files in one revision');
 edit('chapters/one.tex','A final paragraph','A final paragraph.\n\nA split paragraph');await preview('split child paragraph');
 edit('chapters/nested.tex','Nested last','Updated last');await preview('switch after split');
 const beforeWaiting=painted.length;
 edit('chapters/one.tex','x=9','x=\\frac{1}');assert.equal(await options.onPreview(request('auto')),true);assert.equal(statuses.at(-1).state,'waiting');assert.equal(painted.length,beforeWaiting);
 edit('chapters/nested.tex','y=4','y=8');edit('chapters/one.tex','x=\\frac{1}','x=\\frac{1}{2}');await preview('complete pending math plus other file');
 // A later file edit while TeX is working must discard the entire older batch.
 let release,entered;const waiting=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
 liveGate=()=>{liveGate=null;entered();return gate;};
 edit('chapters/one.tex','x=\\frac{1}{2}','x=3');const stale=options.onPreview(request('auto'));await waiting;
 const beforeStale=painted.length;edit('chapters/three.tex','z=7','z=9');release();await stale;assert.equal(painted.length,beforeStale);
 await preview('latest batch after stale response');
 assert.equal(runtime.background.next,1,'no full compile during local edits');assert.equal(runtime.live.generation,generation,'no live engine restart');
 for(const point of checkpoints){const full=await runtime.background.compile(point.job.source,point.job);assert.deepEqual(point.ink,ink(full.pages),point.label+': glyphs and rules match fresh full compilation');}
 // Unsupported dependencies and file membership changes retain the previous preview for full compilation.
 const beforeFallback=painted.length;
 edit('macros.tex','mathbf','mathrm');assert.equal(await options.onPreview(request('auto')),false);assert.equal(painted.length,beforeFallback);
 edit('macros.tex','mathrm','mathbf');texts.set('new.tex','New content.');revision++;assert.equal(await options.onPreview(request('auto')),false);texts.delete('new.tex');revision++;
 // A real paragraph spanning files cannot be safely replayed as one source file.
 texts.set('paper/main.tex',String.raw`\documentclass{article}\input{macros}\begin{document}
\input{chapters/one}
\section{Boundary}
\input{joined}
Continuation in the root.

\end{document}`);texts.set('joined.tex','Text in the child.\n');revision++;await ui.compile('manual');
 const acceptedSource=host.namespace.snapshot.documents.get('chapters/one.tex').source;
 edit('chapters/one.tex','x=3','x=8');edit('joined.tex','Text','Changed');assert.equal(await options.onPreview(request('auto')),false);
 assert.equal(painted.length,beforeFallback,'failed baseline never paints a partial update');
 assert.equal(host.namespace.snapshot.documents.get('chapters/one.tex').source,acceptedSource,'a later failure does not accept the earlier file');
 console.log(JSON.stringify({updates:checkpoints.length,fullCompilesDuringEdits:1,restarts:0,independentFullComparisons:checkpoints.length,staleAndIncompletePreserved:true,ms:times.map(value=>Number(value.toFixed(2)))},null,2));
}finally{listeners.get('pagehide')?.();runtime?.dispose();}
