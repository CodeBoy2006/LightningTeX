import {mountEditor} from './ui/editor.js';
import {BackgroundEngine,LiveEngine,loadSupport} from './core/engine-client.js';
import {splitPreamble,findLiveEdit,captureSpans,acceptLiveEdit} from './core/document.js';
import {finalizeCapture,unitContext,liveUnitEligibility,compareUnitBaseline} from './core/capture.js';
import {decodeDisplayList,createDisplayListRenderer} from './render/index.mjs';
import {replaceUnitRows} from './core/live-layout.js';
import {parseEngineFont} from './render/type1-font.mjs';
import {CSS_PX_PER_SP} from './render/canvas-renderer.mjs';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const base=new URL('../',document.baseURI),fonts=new Map();
let background,live,snapshot,pdfRenderWorker,generation=0,liveStart;
const samples=[{name:'Incremental playground',source:String.raw`\documentclass[11pt]{article}
\usepackage{amsmath}
\usepackage[margin=1in]{geometry}
\begin{document}
A small change should not interrupt your train of thought. Edit this paragraph and watch Full update locally. The same warmed LuaTeX engine typesets only the edited text or equation.

Full compilation handles page breaks and structural changes, or runs when you download the PDF. Your source stays on your device.

Mathematics is compiled by TeX too: $E=mc^2$, and
\[ \sum_{k=1}^{n} k = \frac{n(n+1)}{2}. \]

Try changing a word in the first paragraph, then try a longer sentence. You can download the real PDF or save the source at any time.
\end{document}
`},{name:'Equations and references',source:String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{A useful identity}
The sum in Equation~\ref{eq:sum} follows by pairing the first and last terms.
\begin{equation}\label{eq:sum}
\sum_{k=1}^{n} k=\frac{n(n+1)}{2}.
\end{equation}
\begin{align}
(a+b)^2 &= a^2+2ab+b^2,\\
\int_0^1 x^2\,dx &= \frac{1}{3}.
\end{align}
\end{document}
`},{name:'Lists and a table',source:String.raw`\documentclass{article}
\begin{document}
\section{A little structure}
\begin{itemize}
\item Source stays in your browser.
\item The compiler is real LuaLaTeX.
\item Complex blocks use full-document compilation.
\end{itemize}
\begin{center}\begin{tabular}{lrr}
Item & Quantity & Price\\\hline
Notebook & 2 & 8.00\\
Pencil & 5 & 1.20
\end{tabular}\end{center}
\end{document}
`}];
async function renderPdf({bytes,container,signal}){
 const task=pdfjs.getDocument({data:bytes,worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
 const abort=()=>task.destroy();signal.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise;for(let i=1;i<=pdf.numPages;i++){
   if(signal.aborted)throw Error('PDF rendering cancelled');const page=await pdf.getPage(i);
   const width=Math.max(280,Math.min(900,document.querySelector('[data-id="preview-viewport"]').clientWidth-40));
   const raw=page.getViewport({scale:1}),scale=width/raw.width,ratio=Math.min(devicePixelRatio||1,2),viewport=page.getViewport({scale:scale*ratio});
   const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);canvas.style.width=`${width}px`;canvas.style.maxWidth='100%';canvas.style.height='auto';canvas.setAttribute('aria-label',`PDF page ${i}`);canvas.style.background='white';canvas.style.boxShadow='0 4px 20px #0002';canvas.style.margin='0 auto 20px';canvas.style.display='block';container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;page.cleanup();
 }return {pages:pdf.numPages}}finally{signal.removeEventListener('abort',abort);await task.destroy()}
}
const renderer=createDisplayListRenderer({
 resolveFont:async filename=>{const bytes=fonts.get(filename);if(!bytes)throw Error('Missing live font: '+filename);return bytes;},
 parseFont:(buffer,descriptor)=>parseEngineFont(buffer,descriptor,pdfjs,pdfRenderWorker),
});
const ui=mountEditor({samples,renderPdf,
 onSourceChange:()=>ui.setLiveStatus({status:'Out of date'}),
 onCancel:()=>{generation++;background?.stop();live?.stop();liveStart=null;snapshot=null;ui.setLiveStatus({text:'Compilation cancelled. Edit or compile to start again.',status:'Stopped'});},
 onCompile:async({source,revision,reason})=>{
   if(source.length>500000)throw Error('This browser edition supports source files up to 500,000 characters.');
   if(reason==='auto'&&await updateLive(source,revision))return;
   const result=await background.compile(source);
   if(ui.getState().revision===revision){
     const capture=finalizeCapture(result.capture);
     snapshot={source,revision,capture,pages:result.pages,drawnPages:result.pages,aux:result.aux,proofs:new Map(),spans:captureSpans(source,capture)};
     for(const[k,v]of Object.entries(result.fonts))fonts.set(k,v);
     prepareLive(snapshot);
   }
   ui.log(`Full LuaLaTeX: ${result.pages.length} page(s), ${result.durationMs.toFixed(0)} ms (${result.passes} pass${result.passes===1?'':'es'}).`);
   if(/undefined references|Rerun to get cross-references|Label\(s\) may have changed/i.test(result.log))ui.log('References may need another document pass; automatic compilation runs at most two passes per update.','warning');
   return {...result,pages:result.pages.length,revision};
 }});
function summary(){const p=document.createElement('p');p.textContent='Text and equations update locally in Full. Page breaks and structural changes use full compilation. Downloading PDF includes your latest edits. Compilation stays on your device.';p.style.cssText='font-size:12px;line-height:1.5;margin:12px 24px;color:var(--muted)';document.querySelector('.bottom-bar').before(p);}summary();
function prepareLive(state){
 const gen=++generation;
 if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){liveStart=null;ui.setLiveStatus({status:'Full-PDF mode',text:'Incremental mode requires COOP/COEP headers.'});return;}
 ui.setLiveStatus({status:'Preparing live preview',text:'Edit text or an equation. Its original layout is checked before the first local update.'});
 liveStart=live.start(splitPreamble(state.source).preamble+'\n\\RequirePackage{luatexbase}\n',state.aux);
 void liveStart.then(()=>{if(gen===generation)ui.setLiveStatus({status:'Ready'});},error=>{if(gen===generation)ui.setLiveStatus({status:'Full-PDF mode',text:error.message});});
}
async function updateLive(source,revision){
 const state=snapshot,gen=generation;
 if(!state||!liveStart)return false;
 const edit=findLiveEdit(state.source,source,state.capture,state.spans);
 if(edit.unchanged){ui.setLivePages({canvases:new Map(),revision,durationMs:0});return true;}
 if(edit.incomplete){ui.setLiveStatus({status:'Waiting for complete formula',text:edit.reason,revision});return true;}
 if(!edit.unit){ui.setLiveStatus({status:'Full layout',text:edit.reason,revision});return false;}
 const eligible=liveUnitEligibility(state.capture,edit.unit);
 if(!eligible.ok){ui.setLiveStatus({status:'Full layout',text:eligible.reason,revision});return false;}
 const current=()=>gen===generation&&state===snapshot&&revision===ui.getState().revision;
 const began=performance.now();
 try{
   await liveStart;if(!current())return true;
   const ctx=unitContext(state.capture,edit.unit),expected=edit.unit.advanced||{};
   let proof=state.proofs.get(edit.unit.uid);
   if(!proof){
     proof=decodeDisplayList((await live.compile(ctx,edit.span.original,expected)).binary);
     if(!current())return true;
     const comparison=compareUnitBaseline(edit.unit,state.pages,proof);
     if(!comparison.ok)throw Error('Baseline verification: '+comparison.reason);
     state.proofs.set(edit.unit.uid,proof);
   }
   const result=await live.compile(ctx,edit.source,expected);
   if(!current())return true;
   const list=decodeDisplayList(result.binary),pages=replaceUnitRows(state.drawnPages,edit.unit,proof,list),canvases=new Map();
   for(const [number,page] of pages){
     const target=document.querySelector(`.preview-content canvas[data-page="${number}"]`);
     if(!target)throw Error('Full page is not ready');
     const canvas=document.createElement('canvas'),width=parseFloat(target.style.width);
     await renderer.render(canvas,page,{zoom:width/(page.page_width*CSS_PX_PER_SP),devicePixelRatio:Math.min(devicePixelRatio||1,2),padding:0});
     canvases.set(number,canvas);
   }
   if(!current())return true;
   const elapsed=performance.now()-began;
   if(!ui.setLivePages({canvases,revision,durationMs:elapsed}))return false;
   state.drawnPages=state.drawnPages.map(page=>pages.get(page.page)||page);
   acceptLiveEdit(state,edit,source);
   ui.setLiveStatus({status:`Live · ${elapsed.toFixed(1)} ms`,text:'The edited text or equation has been updated directly in Full. No full-document compilation was needed.',revision});
   ui.log(`Incremental LuaLaTeX: unit ${edit.unit.uid}, ${result.header.lines} row(s), ${elapsed.toFixed(1)} ms; no full compile.`);
   return true;
 }catch(error){
   if(!current())return true;
   ui.log('Full layout fallback: '+error.message,'warning');
   return false;
 }
}
async function boot(){try{
 ui.setEngineStatus({status:'loading',message:'Loading local TeX assets (about 76 MiB compressed on first use)…'});
 const files=await loadSupport(base);
 background=new BackgroundEngine({base,files,onLog:t=>{if(/^!|Error|Warning/i.test(t))ui.log(t,'warning')}});
 live=new LiveEngine({base,files,onFonts:items=>{for(const[k,v]of Object.entries(items))fonts.set(k,v)},onLog:t=>{if(/^!/.test(t))ui.log(t,'warning')}});
 await background.start();ui.setEngineStatus({status:'ready',message:'LuaLaTeX WASM ready · Your document stays in this browser'});await ui.compile('initial');
 }catch(e){ui.setEngineStatus({status:'error',message:e.message});ui.log(e.message,'error')}}
void boot();
window.addEventListener('pagehide',()=>{background?.stop();live?.stop();pdfRenderWorker?.destroy();pdfRenderWorker=null});
