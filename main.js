import {mountEditor} from './ui/editor.js';
import {createEngine,splitPreamble,findLiveEdit,captureSpans,acceptLiveEdit,unitContext,liveUnitEligibility,compareUnitBaseline,parseMacros,parseTexLog,decodeDisplayList,replaceUnitRows} from './engine/index.js';
import {previewSource,inkBounds} from './core/math-preview.js';
import {createDisplayListRenderer,CSS_PX_PER_SP} from './render/index.mjs';
import {pageFlow} from './core/live-layout.js';
import {maskSource} from './core/outline.js';
import {parseEngineFont} from './render/type1-font.mjs';
import {darkenCanvas} from './render/dark-page.mjs';
import * as pdfjs from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc=pdfWorkerUrl;
const base=new URL('../',document.baseURI),fonts=new Map(),blocked=new Set(),MATH_ZOOM={s:1.25,m:1.6,l:2.1};
const pixelRatio=()=>Math.min(devicePixelRatio||1,2),projectPath=file=>String(file).replace(/^\.\//,'');
let background,live,snapshot,pdfRenderWorker,generation=0,liveStart,fullReason,caret=null,restarts=0;

// Page widths here and in the UI's zoom layout must agree: natural width is CSS px at 100%.
// Each page also gets pdf.js's text layer (for selection and search), sized by one CSS variable so it follows zoom.
async function renderPdf({bytes,container,signal,zoom,viewport,width:widthOf,dark=false}){
 const state=snapshot;
 const task=pdfjs.getDocument({data:bytes,worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
 const abort=()=>task.destroy();signal.addEventListener('abort',abort,{once:true});
 try{const pdf=await task.promise,fit=Math.max(240,viewport.clientWidth-48);for(let i=1;i<=pdf.numPages;i++){
   if(signal.aborted)throw Error('PDF rendering cancelled');const page=await pdf.getPage(i);
   const raw=page.getViewport({scale:1}),natural=raw.width*96/72,width=widthOf?widthOf(natural):zoom==='fit'?Math.min(fit,natural*2.5):natural*zoom;
   // Large zooms stay within a safe canvas size by giving up device pixels first.
   const ratio=Math.min(pixelRatio(),Math.sqrt(24e6/(width*width*raw.height/raw.width))),view=page.getViewport({scale:width/raw.width*ratio});
   const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.dataset.base=String(natural);canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);canvas.style.width=`${width}px`;canvas.setAttribute('aria-label',`PDF page ${i}`);container.append(canvas);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
   if(dark){darkenCanvas(canvas);canvas.dataset.dark='true';}
   try{
     const layer=document.createElement('div'),text=await page.getTextContent();layer.className='textLayer text-layer';layer.dataset.textPage=String(i);layer.dataset.pageWidth=String(raw.width);
     layer.style.setProperty('--total-scale-factor',String(width/raw.width));
     const textLayer=new pdfjs.TextLayer({textContentSource:text,container:layer,viewport:page.getViewport({scale:width/raw.width})});
     await textLayer.render();container.append(layer);
   }catch{/* a page without a text layer still shows */}
   page.cleanup();
   if(state===snapshot)state?.baseCanvases.set(i,canvas);
 }return {pages:pdf.numPages}}finally{signal.removeEventListener('abort',abort);await task.destroy()}
}
const renderer=createDisplayListRenderer({
 resolveFont:async filename=>{const bytes=fonts.get(filename);if(!bytes)throw Error('Missing live font: '+filename);return bytes;},
 parseFont:(buffer,descriptor)=>parseEngineFont(buffer,descriptor,pdfjs,pdfRenderWorker),
});
// Files the preamble can read: the persistent engine needs them next to its copy of the preamble.
function supportFiles(preamble,files){
 const local=new Map(files.filter(file=>typeof file.data==='string').map(file=>[file.path,file]));
 const wanted=new Set([...local.keys()].filter(path=>/\.(sty|cls|def|cfg|clo|fd|ldf|lua)$/i.test(path)));
 const sources=[preamble,...[...wanted].map(path=>local.get(path).data)];
 // Follow preamble inputs transitively; copying only the first level leaves the live worker without their macros.
 for(const source of sources)for(const match of maskSource(source).matchAll(/\\(?:input|include)\s*\{([^{}]+)\}/g)){
   const name=projectPath(match[1].trim());
   for(const path of [name,name+'.tex'])if(local.has(path)&&!wanted.has(path)){wanted.add(path);sources.push(local.get(path).data);}
 }
 return files.filter(file=>wanted.has(file.path));
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
 onPreviewHover:point=>hit({...point,x:undefined}),
 onCancel:()=>{generation++;background?.stop();live?.stop();liveStart=null;snapshot=null;ui.setEngineInfo({live:'off'});ui.setLiveStatus({state:'ready'});ui.setMarker(null);},
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
   ui.setProblems([...parseTexLog(result.log,{root}),...bibProblems(result.bibtex)]);
   if(result.bibtex)ui.log(result.bibtex.log,result.bibtex.errors.length?'warning':'info');
   ui.setLiveStatus(fallback?{state:'full',reason:fallback}:{state:'ready'});
   ui.log(`Full LuaLaTeX: ${result.pages.length} page(s), ${result.durationMs.toFixed(0)} ms (${result.passes} pass${result.passes===1?'':'es'}).`);
   if(/undefined references|Rerun to get cross-references|Label\(s\) may have changed/i.test(result.log))ui.log('References may need another document pass; automatic compilation runs at most two passes, or three after a bibliography update.','warning');
   return {...result,pages:result.pages.length,revision};
 }});
// BibTeX's own findings. A cited key without an entry is left to LaTeX's warning, which knows the line.
function bibProblems(bibtex){
 if(!bibtex)return [];
 return [...bibtex.errors.map(message=>({severity:'error',message:'BibTeX: '+message,file:null,line:null})),
  ...bibtex.warnings.filter(warning=>!warning.missing).map(warning=>({severity:'warning',message:'BibTeX: '+warning.message,file:warning.file??null,line:warning.line??null}))];
}
function prepareLive(state,{restart=false}={}){
 const gen=++generation;
 if(!crossOriginIsolated||typeof SharedArrayBuffer==='undefined'){liveStart=null;ui.setEngineInfo({live:'off'});ui.setLiveStatus({state:'off',reason:'Incremental mode requires COOP/COEP headers.'});return;}
 if(restart)restarts++;
 ui.setEngineInfo({live:'warming',restarts});
 liveStart=live.start(splitPreamble(state.source).preamble+'\n\\RequirePackage{luatexbase}\n',state.aux,state.support,state.packageMisses);
 void liveStart.then(()=>{if(gen===generation){ui.setEngineInfo({live:'ready'});ui.refreshMath();}},error=>{if(gen===generation){ui.setEngineInfo({live:'off'});ui.setLiveStatus({state:'off',reason:error.message});}});
}
async function drawLivePages(pages,units=snapshot.liveUnits){
 const state=snapshot,canvases=new Map(),flows=new Map(),dark=ui.getState().darkPages;let pdfTask,pdf;
 try{for(const [number,page] of pages){
   const target=document.querySelector(`[data-id="preview-viewport"] canvas[data-page="${number}"]`);
   if(!target)throw Error('Full page is not ready');
   const width=parseFloat(target.style.width),ratio=Math.min(pixelRatio(),Math.sqrt(24e6/(width*width*page.page_height/page.page_width)));
   let base=state.baseCanvases.get(number);
   if(!base||base.width!==Math.ceil(width*ratio)||(base.dataset.dark==='true')!==dark){
     // A zoom changes raster resolution, not the document; reuse its verified PDF.
     pdfTask??=pdfjs.getDocument({data:state.pdf.slice(),worker:pdfRenderWorker??=new pdfjs.PDFWorker(),isEvalSupported:false,useSystemFonts:false});
     pdf??=await pdfTask.promise;
     const sheet=await pdf.getPage(number),view=sheet.getViewport({scale:width/sheet.getViewport({scale:1}).width*ratio});
     base=document.createElement('canvas');base.width=Math.ceil(view.width);base.height=Math.ceil(view.height);
     await sheet.render({canvasContext:base.getContext('2d'),viewport:view}).promise;sheet.cleanup();
     if(dark){darkenCanvas(base);base.dataset.dark='true';}
     state.baseCanvases.set(number,base);
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
   const ctx=canvas.getContext('2d');ctx.fillStyle=dark?'#1c1e22':'#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';
   // Dark pages: paper outside the slices is already dark; the rows to repaint start white like the PDF.
   if(dark)for(const band of flow.bands)if(band.delta)ctx.fillRect(0,(band.y+band.shift)*pixel,canvas.width,Math.max(0,band.h+band.delta)*pixel);
   const slice=(top,bottom,shift)=>{if(bottom>top)ctx.drawImage(base,0,top*pixel,base.width,(bottom-top)*pixel,0,(top+shift)*pixel,base.width,(bottom-top)*pixel);};
   let top=0,shift=0;
   for(const band of flow.bands){
     slice(top,band.y,shift);
     if(!band.delta){slice(band.y,band.y+band.h,shift);ctx.fillRect(band.x*pixel,(band.y+shift)*pixel,band.w*pixel,band.h*pixel);}
     top=band.y+band.h;shift+=band.delta;
   }
   slice(top,original.page_height,shift);
   for(const band of flow.bands)ctx.drawImage(layers.get(band.uid),0,(band.shift+band.dy)*pixel);
   // On dark pages only the freshly painted (white) parts need darkening; the slices come from the darkened base.
   if(dark){
     canvas.dataset.dark='true';
     for(const band of flow.bands){
       const y=(band.y+band.shift)*pixel,h=Math.max(0,band.h+band.delta)*pixel;
       darkenCanvas(canvas,band.delta?{x:0,y,w:canvas.width,h}:{x:band.x*pixel,y,w:band.w*pixel,h});
     }
   }
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
 if(state.files.some(file=>typeof file.data!=='string'&&incoming.get(file.path).rev!==file.rev))return false;
 if(!changed.length){state.files=files;state.filesRev=filesRev;ui.setLivePages({canvases:new Map(),revision,durationMs:0});return state.reflow?'reflow':true;}
 const pending=[];
 for(const [path,document] of changed){
   const text=incoming.get(path).data;
   if(typeof text!=='string'||text.length>500000||state.support.some(file=>file.path===path))return false;
   const edit=findLiveEdit(document.source,text,state.capture,document.spans,state.macros);
   if(edit.incomplete){ui.setLiveStatus({state:'waiting',reason:edit.reason,revision});return true;}
   if(!edit.unit){fullReason=edit.reason;return false;}
   for(const unit of [edit.unit,...edit.removed.map(span=>span.unit)]){
     const eligible=liveUnitEligibility(state.capture,unit);
     if(!eligible.ok){fullReason=eligible.reason;return false;}
   }
   pending.push({document,text,edit});
 }
 const current=()=>gen===generation&&state===snapshot&&revision===ui.getState().revision;
 const began=performance.now();
 try{
   await liveStart;if(!current())return true;
   const edits=new Map(state.edits),affectedUnits=new Set();let reflow=state.reflow;
   for(const {edit} of pending){
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
     edits.set(edit.unit.uid,{unit:edit.unit,proof,list:decodeDisplayList(result.binary)});
     for(const {unit} of edit.removed)edits.set(unit.uid,{unit,proof:{lines:state.pages.flatMap(page=>page.lines.filter(row=>row.unit===unit.uid)).sort((a,b)=>a.row-b.row)},list:{fonts:{},lines:[]}});
     for(const unit of [edit.unit,...edit.removed.map(span=>span.unit)])affectedUnits.add(unit.uid);
     const counters=result.header.counters||{},renumbered=Object.keys(counters).length!==Object.keys(expected).length||Object.entries(counters).some(([key,value])=>value!==expected[key]);
     reflow||=edit.reflow||renumbered;
   }
   const units=new Set(edits.keys());
   let layout=state.pages;const pages=new Map();
   for(const item of edits.values()){
     const updated=replaceUnitRows(layout,item.unit,item.proof,item.list,{allowReflow:true});
     for(const [number,page] of updated)pages.set(number,page);
     layout=layout.map(page=>updated.get(page.page)||page);
   }
   const affected=new Set([...affectedUnits].flatMap(uid=>edits.get(uid).unit.placements.map(row=>row.page)));
   const {canvases,flows}=await drawLivePages([...pages].filter(([number])=>affected.has(number)),units);
   if(!current())return true;
   reflow||=layout.some(page=>page.reflowUnits?.length);
   const regions=[...flows].flatMap(([page,flow])=>flow.bands.filter(band=>affectedUnits.has(band.uid)).map(band=>({page,uid:band.uid,top:(band.y+band.shift)/flow.height,bottom:(band.y+band.shift+Math.max(0,band.h+band.delta))/flow.height,...column(layout.find(sheet=>sheet.page===page),band.uid)})));
   if(!ui.setLivePages({canvases,revision,durationMs:performance.now()-began,reflow,regions}))return false;
   state.drawnPages=layout;for(const [number,flow] of flows)state.flows.set(number,flow);state.edits=edits;state.liveUnits=units;
   for(const {document,edit,text} of pending)acceptLiveEdit(document,edit,text);
   state.reflow=reflow;state.source=source;state.files=files;state.filesRev=filesRev;
   syncMarker(false);
   return state.reflow?'reflow':true;
 }catch(error){
   if(!current())return true;
   fullReason=error.message;if(/^Live engine (?:restarted|ended)/.test(error.message)){restarts++;ui.setEngineInfo({live:'off',restarts});}
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
   if(!live.worker){blocked.add(prepared.tex);if(snapshot===state)prepareLive(state,{restart:true});return {state:'unsupported'};}
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
 const drawn=state.drawnPages.find(page=>page.page===first.page),rows=drawn.lines.filter(row=>row.unit===unit.uid),flow=state.flows.get(first.page),height=flow?.height??page.page_height;
 if(!rows.length){ui.setMarker(null);return;}
 const offset=flowOffset(flow,rows[0]);
 ui.setMarker({page:first.page,uid:unit.uid,top:(Math.min(...rows.map(row=>row.y-row.h))+offset)/height,bottom:(Math.max(...rows.map(row=>row.y+row.d))+offset)/height,...column(drawn,unit.uid)},{scroll});
}
// The horizontal extent of a unit's rows on its page, as fractions of the page width.
function column(sheet,uid){
 const rows=sheet?.lines.filter(row=>row.unit===uid&&Number.isFinite(row.x)&&Number.isFinite(row.w))||[];
 return rows.length?{left:Math.min(...rows.map(row=>row.x))/sheet.page_width,right:Math.max(...rows.map(row=>row.x+row.w))/sheet.page_width}:{};
}
function flowOffset(flow,line){
 const own=flow?.bands.find(band=>band.uid===line.unit);
 return own?own.shift+own.dy:(flow?.bands||[]).reduce((sum,band)=>sum+(band.y+band.h<=line.y?band.delta:0),0);
}
// Preview -> source: click a line to jump to the text that produced it.
function hit({page,x,y}){
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
 const rows=sheet.lines.filter(line=>line.unit===unit.uid),height=flow?.height??sheet.page_height;
 let offset;
 if(span){
   const ordered=state.drawnPages.flatMap(other=>other.lines.filter(line=>line.unit===unit.uid)).sort((a,b)=>a.row-b.row);
   offset=Number.isFinite(x)?alignGlyph(document.source,span,ordered,best,x*sheet.page_width):null;
   // Without glyphs to match, land roughly on the clicked row.
   offset??=span.start+Math.floor((span.end-span.start)*(best.row-1)/Math.max(1,ordered.length));
 }
 return {path,line:unit.begin_line,offset,page,top:Math.min(...rows.map(line=>line.y-line.h+flowOffset(flow,line)))/height,bottom:Math.max(...rows.map(line=>line.y+line.d+flowOffset(flow,line)))/height};
}
// The glyph under the click, with its neighbours, matched against the letters of the source paragraph.
// Glyph codes normalise to letters (ligatures and math italics included); commands and comments are skipped.
const LETTER=/[\p{L}\p{N}]/u;
function alignGlyph(source,span,rows,row,x){
 const glyphs=[];let clicked=-1,nearest=Infinity;
 for(const line of rows){
   for(const item of line.items.filter(item=>item[0]==='g').sort((a,b)=>a[4]-b[4])){
     let text='';try{text=String.fromCodePoint(item[2]).normalize('NFKC');}catch{continue;}
     const first=glyphs.length;for(const char of text)if(LETTER.test(char))glyphs.push(char.toLowerCase());
     if(line===row&&glyphs.length>first&&Math.abs(item[4]-x)<nearest){nearest=Math.abs(item[4]-x);clicked=first;}
   }
 }
 if(clicked<0||!glyphs.length)return null;
 const letters=[],text=source.slice(span.start,span.end);
 for(let i=0;i<text.length;i++){
   const c=text[i];
   if(c==='%'){while(i<text.length&&text[i]!=='\n')i++;continue;}
   if(c==='\\'){const name=/^\\[A-Za-z@]+/.exec(text.slice(i,i+40));i+=name?name[0].length-1:1;continue;}
   for(const char of c.normalize('NFKC'))if(LETTER.test(char))letters.push({char:char.toLowerCase(),offset:span.start+i});
 }
 if(!letters.length)return null;
 const haystack=letters.map(letter=>letter.char).join(''),expected=clicked/glyphs.length*letters.length;
 for(const radius of [8,5,3,1]){
   const from=Math.max(0,clicked-radius),needle=glyphs.slice(from,clicked+radius+1).join('');let best=-1;
   for(let at=haystack.indexOf(needle);at>=0;at=haystack.indexOf(needle,at+1))if(best<0||Math.abs(at-expected)<Math.abs(best-expected))best=at;
   if(best>=0){
     let offset=letters[Math.min(letters.length-1,best+clicked-from)].offset;
     // Land on the start of the word, where a caret is most useful.
     while(offset>span.start&&LETTER.test(source[offset-1]))offset--;
     return offset;
   }
 }
 return null;
}
function pick(point){const target=hit(point);if(target)ui.reveal(target);}
async function boot(){try{
 ui.setEngineStatus({status:'loading'});
 const manifest=await fetch(new URL('luahbtex/asset-manifest.json',base)).then(response=>response.ok?response.json():null).catch(()=>null);
 const assets=manifest?.assets||{},loaded=new Map();
 ui.setLoadProgress({step:0,assets});
 ({background,live}=await createEngine({base,onLog:text=>{
   const part=/^(Loading|Loaded) (\S+) part (\d+)\/(\d+)/.exec(text);
   if(part){const [,stage,name,index]=part,asset=assets[name],step=name==='luahbtex.wasm'?0:1;
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
