import {mountEditor} from './ui/editor.js';
import {createEngine,splitPreamble,findLiveEdit,captureSpans,acceptLiveEdit,unitContext,liveUnitEligibility,compareUnitBaseline,parseMacros,parseTexLog,decodeDisplayList,replaceUnitRows} from './engine/index.js';
import {previewSource,inkBounds} from './core/math-preview.js';
import {createDisplayListRenderer,CSS_PX_PER_SP} from './render/index.mjs';
import {pageFlow} from './core/live-layout.js';
import {parseEngineFont} from './render/type1-font.mjs';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const base=new URL('../',document.baseURI),fonts=new Map(),blocked=new Set(),MATH_ZOOM={s:1.25,m:1.6,l:2.1};
const pixelRatio=()=>Math.min(devicePixelRatio||1,2),projectPath=file=>String(file).replace(/^\.\//,'');
let background,live,snapshot,pdfRenderWorker,generation=0,liveStart,fullReason,caret=null;

// Page widths here and in the UI's zoom layout must agree: natural width is CSS px at 100%.
async function renderPdf({bytes,container,signal,zoom,viewport}){
 const state=snapshot;
 const task=pdfjs.getDocument({data:bytes,worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
 const abort=()=>task.destroy();signal.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise,fit=Math.max(240,viewport.clientWidth-48);for(let i=1;i<=pdf.numPages;i++){
   if(signal.aborted)throw Error('PDF rendering cancelled');const page=await pdf.getPage(i);
   const raw=page.getViewport({scale:1}),natural=raw.width*96/72,width=zoom==='fit'?Math.min(fit,natural*2.5):natural*zoom;
   // Large zooms stay within a safe canvas size by giving up device pixels first.
   const ratio=Math.min(pixelRatio(),Math.sqrt(24e6/(width*width*raw.height/raw.width))),view=page.getViewport({scale:width/raw.width*ratio});
   const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.dataset.base=String(natural);canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=`${width}px`;canvas.setAttribute('aria-label',`PDF page ${i}`);container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;page.cleanup();
   if(state===snapshot)state?.baseCanvases.set(i,canvas);
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
 onPreviewHover:hit,
 onCancel:()=>{generation++;background?.stop();live?.stop();liveStart=null;snapshot=null;ui.setLiveStatus({state:'ready'});ui.setMarker(null);},
 onPreview:request=>updateLive(request),
 onCompile:async({source,root,files,filesRev,revision,reason})=>{
   if(source.length>500000)throw Error('This browser edition supports source files up to 500,000 characters.');
   const fallback=fullReason;fullReason=null;
   if(reason==='zoom'&&snapshot?.root===root&&snapshot.filesRev===filesRev&&snapshot.source===source){
     try{const drawn=await drawLivePages(snapshot.drawnPages.map(page=>[page.page,page]));if(ui.setLivePages({...drawn,revision})){snapshot.flows=drawn.flows;syncMarker(false);return;}}
     catch(error){fullReason=error.message;}
   }
   let result;
   try{result=await background.compile(source,{root,files});}
   catch(error){
     if(ui.getState().revision!==revision)return;
     ui.setProblems(parseTexLog(error.log??error.message,{root}));
     // Nothing to typeset yet is not a failure: show an empty page.
     if(!error.empty)throw error;
     if(ui.getState().revision===revision){generation++;snapshot=null;liveStart=null;ui.setLiveStatus({state:'ready'});ui.setMarker(null);}
     return {empty:true};
   }
   if(ui.getState().revision!==revision)return;
   {
     const capture=result.capture,preamble=splitPreamble(source)?.preamble??'',support=supportFiles(preamble,files);
     const documents=new Map([{path:root,data:source},...files].filter(file=>typeof file.data==='string').map(file=>[file.path,{source:file.data,spans:captureSpans(file.data,capture,file.path)}]));
     snapshot={source,root,files,filesRev,documents,capture,pages:result.pages,drawnPages:result.pages,pdf:result.pdf,baseCanvases:new Map(),inkBounds:new Map(),liveUnits:new Set(),edits:new Map(),flows:new Map(),reflow:false,aux:result.aux,proofs:new Map(),
       support,packageMisses:result.packageMisses,macros:parseMacros([preamble,...support.map(file=>file.data)].join('\n')),context:previewContext(capture)};
     for(const[k,v]of Object.entries(result.fonts))fonts.set(k,v);
     prepareLive(snapshot);syncMarker(false);
   }
   ui.setProblems(parseTexLog(result.log,{root}));
   ui.setLiveStatus(fallback?{state:'full',reason:fallback}:{state:'ready'});
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
async function drawLivePages(pages,units=snapshot.liveUnits){
 const state=snapshot,canvases=new Map(),flows=new Map();let pdfTask,pdf;
 try{for(const [number,page] of pages){
   const target=document.querySelector(`[data-id="preview-viewport"] canvas[data-page="${number}"]`);
   if(!target)throw Error('Full page is not ready');
   const width=parseFloat(target.style.width),ratio=Math.min(pixelRatio(),Math.sqrt(24e6/(width*width*page.page_height/page.page_width)));
   let base=state.baseCanvases.get(number);
   if(!base||base.width!==Math.ceil(width*ratio)){
     // A zoom changes raster resolution, not the document; reuse its verified PDF.
     pdfTask??=pdfjs.getDocument({data:state.pdf.slice(),worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
     pdf??=await pdfTask.promise;
     const sheet=await pdf.getPage(number),view=sheet.getViewport({scale:width/sheet.getViewport({scale:1}).width*ratio});
     base=document.createElement('canvas');base.width=Math.ceil(view.width);base.height=Math.ceil(view.height);
     await sheet.render({canvasContext:base.getContext('2d'),viewport:view}).promise;sheet.cleanup();state.baseCanvases.set(number,base);
   }
   const canvas=document.createElement('canvas');canvas.width=base.width;canvas.style.width=width+'px';
   const original=state.pages.find(page=>page.page===number),scale=width/page.page_width,options={zoom:scale/CSS_PX_PER_SP,devicePixelRatio:ratio,padding:0,background:'transparent'},layers=new Map(),patches=[];
   for(const uid of units){
     const rows=page.lines.filter(line=>line.unit===uid),oldRows=original.lines.filter(line=>line.unit===uid);if(!oldRows.length)continue;
     const layer=document.createElement('canvas'),local={...page,flags:{},other:[],lines:rows};
     const painted=await renderer.render(layer,local,{...options,viewport:{x:0,y:0,w:page.page_width,h:Math.max(page.page_height,...rows.map(row=>row.y+row.d+655360))}}),key=number+':'+uid;
     let before=state.inkBounds.get(key);
     if(!before){
       const scratch=document.createElement('canvas');
       before=(await renderer.render(scratch,{...original,flags:{},other:[],lines:oldRows},options)).inkBounds;
       state.inkBounds.set(key,before);
     }
     patches.push({uid,before,after:painted.inkBounds,reflow:page.reflowUnits?.includes(uid)});layers.set(uid,layer);
   }
   const flow=pageFlow(original,patches,2/(scale*ratio)),pixel=scale*ratio;
   const height=Math.ceil(flow.height*pixel);
   if(canvas.width*height>24e6)throw Error('Reflow preview exceeds canvas size limit');
   canvas.height=height;
   const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   const slice=(top,bottom,shift)=>{if(bottom>top)ctx.drawImage(base,0,top*pixel,base.width,(bottom-top)*pixel,0,(top+shift)*pixel,base.width,(bottom-top)*pixel);};
   let top=0,shift=0;
   for(const band of flow.bands){
     slice(top,band.y,shift);
     if(!band.delta){slice(band.y,band.y+band.h,shift);ctx.fillRect(band.x*pixel,(band.y+shift)*pixel,band.w*pixel,band.h*pixel);}
     top=band.y+band.h;shift+=band.delta;
   }
   slice(top,original.page_height,shift);
   for(const band of flow.bands)ctx.drawImage(layers.get(band.uid),0,(band.shift+band.dy)*pixel);
   canvases.set(number,canvas);
   flows.set(number,flow);
 }return {canvases,flows};}finally{await pdfTask?.destroy();}
}
async function updateLive({source,root,files,filesRev,revision}){
 const state=snapshot,gen=generation;
 fullReason=null;
 if(!state||!liveStart||state.root!==root||source.length>500000)return false;
 const incoming=new Map([{path:root,data:source},...files].map(file=>[file.path,file]));
 if(incoming.size!==state.files.length+1||state.files.some(file=>!incoming.has(file.path)))return false;
 const changed=[...state.documents].filter(([path,document])=>incoming.get(path)?.data!==document.source);
 if(state.files.some(file=>typeof file.data!=='string'&&incoming.get(file.path).rev!==file.rev)||changed.length>1)return false;
 if(!changed.length){state.files=files;state.filesRev=filesRev;ui.setLivePages({canvases:new Map(),revision,durationMs:0});return state.reflow?'reflow':true;}
 const [path,document]=changed[0],text=incoming.get(path).data;
 if(typeof text!=='string'||text.length>500000||state.support.some(file=>file.path===path))return false;
 const edit=findLiveEdit(document.source,text,state.capture,document.spans,state.macros);
 if(edit.incomplete){ui.setLiveStatus({state:'waiting',reason:edit.reason,revision});return true;}
 if(!edit.unit){fullReason=edit.reason;return false;}
 for(const unit of [edit.unit,...edit.removed.map(span=>span.unit)]){
   const eligible=liveUnitEligibility(state.capture,unit);
   if(!eligible.ok){fullReason=eligible.reason;return false;}
 }
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
   // The server restores counters; changed numbering is provisional until the full pass.
   const result=await live.typeset(ctx,edit.source);
   if(!current())return true;
   const list=decodeDisplayList(result.binary),edits=new Map(state.edits).set(edit.unit.uid,{unit:edit.unit,proof,list});
   for(const {unit} of edit.removed)edits.set(unit.uid,{unit,proof:{lines:state.pages.flatMap(page=>page.lines.filter(row=>row.unit===unit.uid)).sort((a,b)=>a.row-b.row)},list:{fonts:{},lines:[]}});
   const units=new Set(edits.keys());
   let layout=state.pages;const pages=new Map();
   for(const item of edits.values()){
     const updated=replaceUnitRows(layout,item.unit,item.proof,item.list,{allowReflow:true});
     for(const [number,page] of updated)pages.set(number,page);
     layout=layout.map(page=>updated.get(page.page)||page);
   }
   const affected=new Set([edit.unit,...edit.removed.map(span=>span.unit)].flatMap(unit=>unit.placements.map(row=>row.page)));
   const {canvases,flows}=await drawLivePages([...pages].filter(([number])=>affected.has(number)),units);
   if(!current())return true;
   const counters=result.header.counters||{},renumbered=Object.keys(counters).length!==Object.keys(expected).length||Object.entries(counters).some(([key,value])=>value!==expected[key]);
   state.reflow||=edit.reflow||layout.some(page=>page.reflowUnits?.length)||renumbered;
   const regions=[...flows].flatMap(([page,flow])=>flow.bands.filter(band=>affected.has(page)&&[edit.unit,...edit.removed.map(span=>span.unit)].some(unit=>unit.uid===band.uid)).map(band=>({page,top:(band.y+band.shift)/flow.height,bottom:(band.y+band.shift+Math.max(0,band.h+band.delta))/flow.height})));
   if(!ui.setLivePages({canvases,revision,durationMs:performance.now()-began,reflow:state.reflow,regions}))return false;
   state.drawnPages=layout;for(const [number,flow] of flows)state.flows.set(number,flow);state.edits=edits;state.liveUnits=units;
   acceptLiveEdit(document,edit,text);state.source=source;state.files=files;state.filesRev=filesRev;
   syncMarker(false);
   return state.reflow?'reflow':true;
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
 // Spans follow local edits in each source file; stale sources fall back to captured line numbers.
 const document=state.documents.get(position.path),span=document?.source===ui.project.get(position.path)?.text?document.spans.find(span=>position.offset>=span.start&&position.offset<=span.end):null;
 const unit=span?.unit??placed.findLast(unit=>unit.begin_line<=position.line);
 const first=unit?.placements?.[0],page=first&&state.pages.find(page=>page.page===first.page);
 if(!page){ui.setMarker(null);return;}
 const rows=state.drawnPages.find(page=>page.page===first.page).lines.filter(row=>row.unit===unit.uid),flow=state.flows.get(first.page),height=flow?.height??page.page_height;
 if(!rows.length){ui.setMarker(null);return;}
 const offset=flowOffset(flow,rows[0]);
 ui.setMarker({page:first.page,top:(Math.min(...rows.map(row=>row.y-row.h))+offset)/height,bottom:(Math.max(...rows.map(row=>row.y+row.d))+offset)/height},{scroll});
}
function flowOffset(flow,line){
 const own=flow?.bands.find(band=>band.uid===line.unit);
 return own?own.shift+own.dy:(flow?.bands||[]).reduce((sum,band)=>sum+(band.y+band.h<=line.y?band.delta:0),0);
}
// Preview -> source: double-click a line to jump to the text that produced it.
function hit({page,y}){
 const state=snapshot,sheet=state?.drawnPages.find(candidate=>candidate.page===page);
 if(!sheet)return;
 const flow=state.flows.get(page),at=y*(flow?.height??sheet.page_height);let best=null,distance=Infinity;
 for(const line of sheet.lines){
   if(line.unit==null)continue;
   const baseline=line.y+flowOffset(flow,line),gap=at<baseline-line.h?baseline-line.h-at:at>baseline+line.d?at-baseline-line.d:0;
   if(gap<distance){distance=gap;best=line;}
 }
 const unit=best&&state.capture.units.find(candidate=>candidate.uid===best.unit);
 if(!unit||distance>sheet.page_height*.025)return null;
 const path=projectPath(unit.file||state.root),document=state.documents.get(path),span=document?.source===ui.project.get(path)?.text?document.spans.find(candidate=>candidate.unit===unit):null;
 // Within a paragraph, land roughly on the clicked row.
 const rows=sheet.lines.filter(line=>line.unit===unit.uid),height=flow?.height??sheet.page_height;
 return {path,line:unit.begin_line,offset:span?span.start+Math.floor((span.end-span.start)*(best.row-1)/Math.max(1,state.drawnPages.reduce((count,page)=>count+page.lines.filter(row=>row.unit===unit.uid).length,0))):undefined,
   page,top:Math.min(...rows.map(line=>line.y-line.h+flowOffset(flow,line)))/height,bottom:Math.max(...rows.map(line=>line.y+line.d+flowOffset(flow,line)))/height};
}
function pick(point){const target=hit(point);if(target)ui.reveal(target);}
async function boot(){try{
 ui.setEngineStatus({status:'loading'});
 const manifest=await fetch(new URL('busytex/asset-manifest.json',base)).then(response=>response.ok?response.json():null).catch(()=>null);
 const assets=manifest?.assets||{},loaded=new Map();
 ui.setLoadProgress({step:0,assets});
 ({background,live}=await createEngine({base,onLog:text=>{
   const part=/^(Loading|Loaded) (\S+) part (\d+)\/(\d+)/.exec(text);
   if(part){const [,stage,name,index]=part,asset=assets[name],step=name==='busytex.wasm'?0:1;
     if(stage==='Loaded')loaded.set(name,Number(index));
     const done=asset?.parts.slice(0,loaded.get(name)||0).reduce((sum,part)=>sum+part.size,0)||0,total=asset?.encodedSize;
     ui.setLoadProgress({step,done,total});
     const all=Object.values(assets).reduce((sum,asset)=>sum+asset.encodedSize,0),received=Object.entries(assets).reduce((sum,[key,asset])=>sum+asset.parts.slice(0,loaded.get(key)||0).reduce((sum,part)=>sum+part.size,0),0);
     if(all)ui.setEngineStatus({status:'loading',progress:Math.min(.95,received/all)});
   }else if(/^Runtime loaded/.test(text))ui.setLoadProgress({step:2});
   else if(/^!|Error|Warning/i.test(text))ui.log(text,'warning');
 },onFonts:items=>{for(const[k,v]of Object.entries(items))fonts.set(k,v)},onLiveLog:text=>{if(/^!/.test(text))ui.log(text,'warning')}}));
 await Promise.all([background.start(),ui.ready]);ui.setEngineStatus({status:'ready'});ui.setLoadProgress({step:3});await ui.compile('initial');
 }catch(e){ui.setEngineStatus({status:'error'});ui.log(e.message,'error')}}
void boot();
window.addEventListener('pagehide',()=>{background?.stop();live?.stop();pdfRenderWorker?.destroy();pdfRenderWorker=null});
