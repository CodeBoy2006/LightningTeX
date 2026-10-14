import{BrowserWorker}from'./runtime-helpers.mjs';import fs from'node:fs/promises';import path from'node:path';import{pathToFileURL}from'node:url';import assert from'node:assert/strict';
import{BackgroundEngine,LiveEngine}from'../engine/client.js';import{splitPreamble,findLiveEdit}from'../core/document.js';import{unitContext,liveUnitEligibility,compareUnitBaseline}from'../core/capture.js';import{decodeDisplayList,createDisplayListRenderer}from'../render/index.mjs';import{createCanvas}from'@napi-rs/canvas';import*as pdfjs from'pdfjs-dist/legacy/build/pdf.mjs';import{parseEngineFont}from'../render/type1-font.mjs';
const root=path.resolve(import.meta.dirname,'..'),base=pathToFileURL(root+'/public/');
globalThis.Worker=BrowserWorker;
const {TEMPLATES}=await import('../ui/templates.js'),samples=TEMPLATES.map(template=>template.files[template.main]);
const others=template=>Object.entries(template.files).filter(([name])=>name!==template.main).map(([name,data],rev)=>({path:name,data,rev}));
const fonts=new Map(),bg=new BackgroundEngine({base}),live=new LiveEngine({base,onFonts:o=>{for(const[k,v]of Object.entries(o))fonts.set(k,v)}}),results=[];
try{await bg.start();for(let i=0;i<samples.length;i++){
 // The blank template has no content yet: the engine reports an empty document, not a TeX error.
 if(TEMPLATES[i].id==='blank'){await assert.rejects(bg.compile(samples[i]),error=>error.empty===true&&/No pages of output/.test(error.message));results.push({sample:'blank',empty:true});continue;}
 const r=await bg.compile(samples[i],{root:TEMPLATES[i].main,files:others(TEMPLATES[i])});assert.ok(r.pdf.length>1000);results.push({sample:TEMPLATES[i].id,pages:r.pages.length,bytes:r.pdf.length,durationMs:r.durationMs});await fs.writeFile(root+`/qa/sample-${i}.pdf`,r.pdf);
 if(i===0){const changed=samples[0].replace('closed form. Pairing','closed thoughtful form. Pairing'),edit=findLiveEdit(samples[0],changed,r.capture);assert.ok(edit.unit,edit.reason);assert.ok(liveUnitEligibility(r.capture,edit.unit).ok);
 const ready=await live.start(splitPreamble(samples[0]).preamble+'\n\\RequirePackage{luatexbase}\n',r.aux);assert.equal(ready.op,'ready');
 const ctx=unitContext(r.capture,edit.unit),old=edit.span.original;
 const original=await live.compile(ctx,old);const proof=compareUnitBaseline(edit.unit,r.pages,decodeDisplayList(original.binary));assert.ok(proof.ok,proof.reason);
 const times=[];for(let n=0;n<20;n++){const t=performance.now();const result=await live.compile(ctx,edit.source.replace('thoughtful',n%2?'careful':'thoughtful'));times.push(performance.now()-t);assert.equal(result.header.status,'ok');assert.ok(result.header.glyphs>50);if(n===0){const canvas=createCanvas(1,1);await createDisplayListRenderer({resolveFont:async k=>fonts.get(k),parseFont:(buffer,desc)=>parseEngineFont(buffer,desc,pdfjs)}).render(canvas,decodeDisplayList(result.binary),{zoom:1.4,devicePixelRatio:1,padding:12});await fs.writeFile(root+'/qa/live-edit.png',canvas.toBuffer('image/png'))}}
 let caught=false;try{await live.compile(ctx,'\\undefinedcommand')}catch{caught=true}assert.ok(caught);assert.equal((await live.compile(ctx,old)).header.status,'ok');results.push({live:{edits:20,baseline:proof,medianMs:times.sort((a,b)=>a-b)[10],minMs:times[0],maxMs:times.at(-1),errorRecovery:true}});live.stop();
 }}await fs.writeFile(root+'/qa/integration-wasm.json',JSON.stringify({runtime:'actual browser Worker scripts and WASM in Node worker_threads (not browser UI)',results},null,2));console.log(JSON.stringify(results,null,2))}finally{bg.stop();live.stop()}
