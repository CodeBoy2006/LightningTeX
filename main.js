import {mountEditor} from './ui/editor.js';
import {BackgroundEngine,LiveEngine,loadSupport} from './core/engine-client.js';
import {splitPreamble,findLiveEdit,captureSpans,acceptLiveEdit} from './core/document.js';
import {finalizeCapture,unitContext,liveUnitEligibility,compareUnitBaseline} from './core/capture.js';
import {previewSource,parseMacros,inkBounds} from './core/math-preview.js';
import {parseTexLog} from './core/tex-log.js';
import {decodeDisplayList,createDisplayListRenderer} from './render/index.mjs';
import {replaceUnitRows} from './core/live-layout.js';
import {parseEngineFont} from './render/type1-font.mjs';
import {CSS_PX_PER_SP} from './render/canvas-renderer.mjs';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const base=new URL('../',document.baseURI),fonts=new Map(),blocked=new Set(),MATH_ZOOM={s:1.25,m:1.6,l:2.1};
const pixelRatio=()=>Math.min(devicePixelRatio||1,2),projectPath=file=>String(file).replace(/^\.\//,'');
let background,live,snapshot,pdfRenderWorker,generation=0,liveStart,fullReason,caret=null;

// Page widths here and in the UI's zoom layout must agree: natural width is CSS px at 100%.
async function renderPdf({bytes,container,signal,zoom,viewport}){
 const task=pdfjs.getDocument({data:bytes,worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
 const abort=()=>task.destroy();signal.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise,fit=Math.max(240,viewport.clientWidth-48);for(let i=1;i<=pdf.numPages;i++){
   if(signal.aborted)throw Error('PDF rendering cancelled');const page=await pdf.getPage(i);
   const raw=page.getViewport({scale:1}),natural=raw.width*96/72,width=zoom==='fit'?Math.min(fit,natural*2.5):natural*zoom;
   // Large zooms stay within a safe canvas size by giving up device pixels first.
   const ratio=Math.min(pixelRatio(),Math.sqrt(24e6/(width*width*raw.height/raw.width))),view=page.getViewport({scale:width/raw.width*ratio});
   const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.dataset.base=String(natural);canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=`${width}px`;canvas.setAttribute('aria-label',`PDF page ${i}`);container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;page.cleanup();
 }return {pages:pdf.numPages}}finally{signal.removeEventListener('abort',abort);await task.destroy()}
}
const renderer=createDisplayListRenderer({
 resolveFont:async filename=>{const bytes=fonts.get(filename);if(!bytes)throw Error('Missing live font: '+filename);return bytes;},
 parseFont:(buffer,descriptor)=>parseEngineFont(buffer,descriptor,pdfjs,pdfRenderWorker),
});
// Files the preamble can read: the persistent engine needs them next to its copy of the preamble.
function supportFiles(preamble,files){
 const wanted=new Set();
 for(const match of preamble.matchAll(/\\(?:input|include)\s*\{([^{}]+)\}/g)){wanted.add(match[1].trim());wanted.add(match[1].trim()+'.tex');}
 return files.filter(file=>typeof file.data==='string'&&(wanted.has(file.path)||/\.(sty|cls|def|cfg|clo|fd|ldf|lua)$/i.test(file.path)));
}
// A paragraph context to typeset standalone formulas in: the first one the engine can replay.
function previewContext(capture){
 const pars=capture.units.filter(unit=>unit.kind==='par'),unit=pars.find(unit=>liveUnitEligibility(capture,unit).ok);
 if(unit)return unitContext(capture,unit);
 return pars[0]?{...unitContext(capture,pars[0]),everypar:'',nobreak:false,afterindent:false,noskipsec:false,parshape:null,macros:{}}:null;
}
const ui=mountEditor({renderPdf,typesetMath,
 onCursor:position=>{caret=position;if(snapshot)syncMarker();},
 onPreviewPick:pick,
 onCancel:()=>{generation++;background?.stop();live?.stop();liveStart=null;snapshot=null;ui.setLiveStatus({state:'ready'});ui.setMarker(null);},
 onCompile:async({source,root,files,filesRev,revision,reason})=>{
   if(source.length>500000)throw Error('This browser edition supports source files up to 500,000 characters.');
   fullReason=null;
   if(reason==='zoom'&&snapshot?.root===root&&snapshot.filesRev===filesRev&&snapshot.source===source){
     try{if(ui.setLivePages({canvases:await drawLivePages(snapshot.drawnPages.map(page=>[page.page,page])),revision}))return;}
     catch(error){fullReason=error.message;}
   }
   if(reason==='auto'&&snapshot?.root===root&&snapshot.filesRev===filesRev&&await updateLive(source,revision))return;
   let result;
   try{result=await background.compile(source,{root,files});}
   catch(error){
     ui.setProblems(parseTexLog(error.log??error.message,{root}));
     // Nothing to typeset yet is not a failure: show an empty page.
     if(!error.empty)throw error;
     if(ui.getState().revision===revision){generation++;snapshot=null;liveStart=null;ui.setLiveStatus({state:'ready'});ui.setMarker(null);}
     return {empty:true};
   }
   if(ui.getState().revision===revision){
     const capture=finalizeCapture(result.capture),preamble=splitPreamble(source)?.preamble??'',support=supportFiles(preamble,files);
     snapshot={source,root,filesRev,revision,capture,pages:result.pages,drawnPages:result.pages,aux:result.aux,proofs:new Map(),spans:captureSpans(source,capture,root),
       support,packageMisses:result.packageMisses,macros:parseMacros([preamble,...support.map(file=>file.data)].join('\n')),context:previewContext(capture)};
     for(const[k,v]of Object.entries(result.fonts))fonts.set(k,v);
     prepareLive(snapshot);syncMarker(false);
   }
   ui.setProblems(parseTexLog(result.log,{root}));
   ui.setLiveStatus(fullReason?{state:'full',reason:fullReason}:{state:'ready'});
   ui.log(`Full LuaLaTeX: ${result.pages.length} page(s), ${result.durationMs.toFixed(0)} ms (${result.passes} pass${result.passes===1?'':'es'}).`);
   if(/undefined references|Rerun to get cross-references|Label\(s\) may have changed/i.test(result.log))ui.log('References may need another document pass; automatic compilation runs at most two passes per update.','warning');
   return {...result,pages:result.pages.length,revision};
 }});
function prepareLive(state){
 const gen=++generation;
 if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){liveStart=null;ui.setLiveStatus({state:'off',reason:'Incremental mode requires COOP/COEP headers.'});return;}
 liveStart=live.start(splitPreamble(state.source).preamble+'\n\\RequirePackage{luatexbase}\n',state.aux,state.support,state.packageMisses);
 void liveStart.then(()=>{if(gen===generation)ui.refreshMath();},error=>{if(gen===generation)ui.setLiveStatus({state:'off',reason:error.message});});
}
async function drawLivePages(pages){
 const canvases=new Map();
 for(const [number,page] of pages){
   const target=document.querySelector(`[data-id="preview-viewport"] canvas[data-page="${number}"]`);
   if(!target)throw Error('Full page is not ready');
   const canvas=document.createElement('canvas'),width=parseFloat(target.style.width);
   await renderer.render(canvas,page,{zoom:width/(page.page_width*CSS_PX_PER_SP),devicePixelRatio:pixelRatio(),padding:0});
   canvases.set(number,canvas);
 }
 return canvases;
}
async function updateLive(source,revision){
 const state=snapshot,gen=generation;
 if(!state||!liveStart)return false;
 const edit=findLiveEdit(state.source,source,state.capture,state.spans);
 if(edit.unchanged){ui.setLivePages({canvases:new Map(),revision,durationMs:0});return true;}
 if(edit.incomplete){ui.setLiveStatus({state:'waiting',reason:edit.reason,revision});return true;}
 if(!edit.unit){fullReason=edit.reason;return false;}
 const eligible=liveUnitEligibility(state.capture,edit.unit);
 if(!eligible.ok){fullReason=eligible.reason;return false;}
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
   const list=decodeDisplayList(result.binary),pages=replaceUnitRows(state.drawnPages,edit.unit,proof,list),canvases=await drawLivePages(pages);
   if(!current())return true;
   if(!ui.setLivePages({canvases,revision,durationMs:performance.now()-began}))return false;
   state.drawnPages=state.drawnPages.map(page=>pages.get(page.page)||page);
   acceptLiveEdit(state,edit,source);
   return true;
 }catch(error){
   if(!current())return true;
   fullReason=error.message;
   return false;
 }
}
// The formula at the caret, typeset alone by the warmed engine. Resolves {canvas} or {state, message}.
async function typesetMath({found,source,scale,maxWidth}){
 const state=snapshot;
 if(!state?.context||!liveStart)return {state:'unavailable'};
 const prepared=previewSource(found,source,state.macros);
 if(!prepared.tex)return {state:prepared.incomplete?'incomplete':'unsupported',message:prepared.unsupported?prepared.reason:undefined};
 if(blocked.has(prepared.tex))return {state:'unsupported'};
 try{
   await liveStart;
   const list=decodeDisplayList((await live.typeset(state.context,prepared.tex)).binary),box=inkBounds(list);
   if(!box)return {state:'incomplete'};
   const canvas=document.createElement('canvas'),natural=box.w*CSS_PX_PER_SP,zoom=Math.min(MATH_ZOOM[scale]||MATH_ZOOM.m,Math.max(0.5,(maxWidth-8)/natural)),pad=4/(CSS_PX_PER_SP*zoom);
   await renderer.render(canvas,list,{zoom,devicePixelRatio:pixelRatio(),padding:0,background:'transparent',viewport:{x:box.x-pad,y:box.y-pad,w:box.w+2*pad,h:box.h+2*pad}});
   return {canvas};
 }catch(error){
   // The server exits when a unit corrupts its state: never send that formula again, and warm a new engine.
   if(!live.worker){blocked.add(prepared.tex);if(snapshot===state)prepareLive(state);return {state:'unsupported'};}
   return {state:'error',message:String(error.message||error).split('\n')[0]};
 }
}
// Source -> preview: mark where the caret's paragraph, formula or heading sits on its page.
function syncMarker(scroll=true){
 const state=snapshot,position=caret;
 if(!state||!position){ui.setMarker(null);return;}
 const placed=state.capture.units.filter(unit=>unit.placements?.length&&projectPath(unit.file||state.root)===position.path);
 // Spans follow local edits exactly; other files and stale sources fall back to line numbers.
 const span=position.main&&state.source===ui.getSource()?state.spans.find(span=>position.offset>=span.start&&position.offset<=span.end):null;
 const unit=span?.unit??placed.findLast(unit=>unit.begin_line<=position.line);
 const first=unit?.placements?.[0],page=first&&state.pages.find(page=>page.page===first.page);
 if(!page){ui.setMarker(null);return;}
 const rows=unit.placements.filter(row=>row.page===first.page);
 ui.setMarker({page:first.page,top:Math.min(...rows.map(row=>row.y-row.h))/page.page_height,bottom:Math.max(...rows.map(row=>row.y+row.d))/page.page_height},{scroll});
}
// Preview -> source: double-click a line to jump to the text that produced it.
function pick({page,y}){
 const state=snapshot,sheet=state?.drawnPages.find(candidate=>candidate.page===page);
 if(!sheet)return;
 const at=y*sheet.page_height;let best=null,distance=Infinity;
 for(const line of sheet.lines){
   if(line.unit==null)continue;
   const gap=at<line.y-line.h?line.y-line.h-at:at>line.y+line.d?at-line.y-line.d:0;
   if(gap<distance){distance=gap;best=line;}
 }
 const unit=best&&state.capture.units.find(candidate=>candidate.uid===best.unit);
 if(!unit)return;
 const path=projectPath(unit.file||state.root),span=path===state.root&&state.source===ui.getSource()?state.spans.find(candidate=>candidate.unit===unit):null;
 // Within a paragraph, land roughly on the clicked row.
 if(span)ui.reveal({path,offset:span.start+Math.floor((span.end-span.start)*(best.row-1)/Math.max(1,unit.placements.length))});
 else ui.reveal({path,line:unit.begin_line});
}
async function boot(){try{
 ui.setEngineStatus({status:'loading'});
 const [files,manifest]=await Promise.all([loadSupport(base),fetch(new URL('busytex/asset-manifest.json',base)).then(response=>response.ok?response.json():null).catch(()=>null)]);
 const parts=manifest?Object.values(manifest.assets).reduce((sum,asset)=>sum+asset.parts.length,0):0;let fetched=0;
 background=new BackgroundEngine({base,files,onLog:text=>{
   if(/^Loading \S+ part \d+\/\d+/.test(text)){if(parts)ui.setEngineStatus({status:'loading',progress:Math.min(0.95,(++fetched-0.5)/parts)});}
   else if(/^!|Error|Warning/i.test(text))ui.log(text,'warning');
 }});
 live=new LiveEngine({base,files,onFonts:items=>{for(const[k,v]of Object.entries(items))fonts.set(k,v)},onLog:text=>{if(/^!/.test(text))ui.log(text,'warning')}});
 await Promise.all([background.start(),ui.ready]);ui.setEngineStatus({status:'ready'});await ui.compile('initial');
 }catch(e){ui.setEngineStatus({status:'error'});ui.log(e.message,'error')}}
void boot();
window.addEventListener('pagehide',()=>{background?.stop();live?.stop();pdfRenderWorker?.destroy();pdfRenderWorker=null});
