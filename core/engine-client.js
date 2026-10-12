import {splitPreamble} from './document.js';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const TEX_FILES=['rtex-json.lua','rtex-dl.lua','rtex-dl-bin.lua','rtex-capture.lua','rtex-serve.lua','rtex-pic.lua','latex/rtex-capture.sty','latex/rtex-pic.tex','latex/rtex-serve-patches.tex'];
export async function loadSupport(base){return Object.fromEntries(await Promise.all(TEX_FILES.map(async p=>{const r=await fetch(new URL('rtex/'+p,base));if(!r.ok)throw Error(`Missing rtex support: ${p}`);return [p,await r.text()]})))}
export class BackgroundEngine {
 constructor({base,files,onLog=()=>{}}){Object.assign(this,{base,files,onLog});this.next=0;this.pending=new Map();this.generation=0;this.ready=null;this.worker=null}
 start(){
  if(this.ready)return this.ready;
  const generation=++this.generation;
  try{this.worker=new Worker(new URL('runtime/background-worker.js',this.base))}catch(error){return Promise.reject(error)}
  const worker=this.worker;
  this.ready=new Promise((resolve,reject)=>{
   this.rejectReady=reject;
   const current=()=>generation===this.generation&&worker===this.worker;
   this.timer=setTimeout(()=>{if(current())this.stop(Error('TeX engine loading timed out'))},120000);
   worker.onmessage=({data})=>{
    if(!current())return;
    if(data.type==='ready'){clearTimeout(this.timer);this.rejectReady=null;resolve()}
    else if(data.type==='log')this.onLog(data.text);
    else if(data.type==='result'||data.type==='error'){
     const task=this.pending.get(data.id);
     if(task){clearTimeout(task.timer);this.pending.delete(data.id);data.type==='result'?task.resolve(data):task.reject(Error(data.message))}
     else if(data.type==='error'&&this.rejectReady)this.stop(Error(data.message));
    }
   };
   worker.onerror=e=>{if(current())this.stop(Error(e.message||'TeX worker failed'))};
   // Defer postMessage until this.ready has been assigned, including sync mock failures.
   queueMicrotask(()=>{if(current())try{worker.postMessage({type:'init',base:new URL('busytex/',this.base).href,files:this.files})}catch(error){this.stop(error)}});
  });
  return this.ready;
 }
 async compile(source){
  const start=this.start(),generation=this.generation;
  await start;
  if(generation!==this.generation||!this.worker)throw Error('Compilation cancelled');
  const id=++this.next,worker=this.worker;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{if(generation===this.generation)this.stop(Error('Compilation exceeded 30 seconds; worker stopped'))},30000);
   this.pending.set(id,{resolve,reject,timer});
   try{worker.postMessage({type:'compile',id,source,preamble:splitPreamble(source)?.preamble??null})}catch(error){this.stop(error)}
  });
 }
 stop(error=Error('Compilation cancelled')){
  ++this.generation;this.worker?.terminate();this.worker=null;clearTimeout(this.timer);
  const reject=this.rejectReady;this.rejectReady=null;reject?.(error);
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}
  this.pending.clear();this.ready=null;
 }
}
export class LiveEngine {
 constructor({base,files,onLog=()=>{},onFonts=()=>{}}){Object.assign(this,{base,files,onLog,onFonts});this.queue=Promise.resolve();this.req=0;this.frames=[];this.readers=[];this.buffer=new Uint8Array();this.generation=0;this.worker=null;this.failure=Error('Live engine not started')}
 current(generation){if(generation!==this.generation||!this.worker)throw this.failure||Error('Live engine restarted')}
 async start(preamble,aux){
  const key=JSON.stringify([preamble,decoder.decode(aux??new Uint8Array())]);
  if(this.worker&&key===this.startKey)return this.ready;
  this.stop();this.startKey=key;const generation=this.generation;
  try{
   this.mailbox=new SharedArrayBuffer(1024*1024+16);this.ctl=new Int32Array(this.mailbox,0,4);this.payload=new Uint8Array(this.mailbox,16);
   const worker=this.worker=new Worker(new URL('runtime/live-worker.js',this.base));this.failure=null;
   worker.onmessage=({data})=>{if(generation!==this.generation||worker!==this.worker)return;try{if(data.log)this.onLog(data.log);if(data.fonts)this.onFonts(data.fonts);if(data.bytes)this.feed(data.bytes,generation);if(data.error)this.fail(Error(data.error),generation);if(data.done)this.fail(Error('Live engine ended'),generation)}catch(error){this.fail(error,generation)}};
   worker.onerror=e=>this.fail(Error(e.message||'Live worker failed'),generation);
   worker.postMessage({base:new URL('busytex/',this.base).href,files:this.files,preamble,aux,mailbox:this.mailbox});
   this.ready=this.read(120000,generation).then(ready=>{
    this.current(generation);
    if(ready.header.op!=='ready')throw Error('Live engine did not become ready');return ready.header;
   });
   return await this.ready;
  }catch(error){this.fail(error,generation);throw error}
 }
 feed(chunk,generation=this.generation){
  if(generation!==this.generation||!this.worker)return;
  const all=new Uint8Array(this.buffer.length+chunk.length);all.set(this.buffer);all.set(chunk,this.buffer.length);let pos=0;
  while(all.length-pos>=4){
   const len=new DataView(all.buffer,all.byteOffset+pos,4).getUint32(0,true);
   if(len<1||len>32*1024*1024){this.fail(Error('Invalid live frame length'),generation);return}
   if(all.length-pos<4+len)break;
   const body=all.slice(pos+4,pos+4+len);let frame;
   try{
    if(body[0]===0)frame={header:JSON.parse(decoder.decode(body.subarray(1)))};
    else if(body[0]===1){
     if(body.length<5)throw Error('Truncated binary live frame');
     const n=new DataView(body.buffer,body.byteOffset+1,4).getUint32(0,true);
     if(n>body.length-5)throw Error('Invalid live frame header length');
     frame={header:JSON.parse(decoder.decode(body.subarray(5,5+n))),binary:body.slice(5+n)};
    }else throw Error('Unknown frame kind');
    if(!frame.header||typeof frame.header.op!=='string')throw Error('Invalid live frame header');
   }catch(error){this.fail(error,generation);return}
   const reader=this.readers.shift();if(reader){clearTimeout(reader.timer);reader.resolve(frame)}else this.frames.push(frame);pos+=4+len;
  }
  this.buffer=all.slice(pos);
 }
 read(timeout=6000,generation=this.generation){
  try{this.current(generation)}catch(error){return Promise.reject(error)}
  if(this.frames.length)return Promise.resolve(this.frames.shift());
  return new Promise((resolve,reject)=>{const entry={resolve,reject,timer:setTimeout(()=>this.fail(Error('Live typesetting timed out'),generation),timeout)};this.readers.push(entry)});
 }
 async send(object,generation=this.generation){
  this.current(generation);const bytes=encoder.encode(JSON.stringify(object)+'\n');
  const ctl=this.ctl,payload=this.payload;
  if(bytes.length>payload.length)throw Error('Paragraph request too large');
  const deadline=Date.now()+6000;
  while(Atomics.load(ctl,0)){
   this.current(generation);
   if(Date.now()>=deadline){const error=Error('Live request mailbox timed out');this.fail(error,generation);throw error}
   await new Promise(resolve=>setTimeout(resolve,1));
  }
  this.current(generation);payload.set(bytes);Atomics.store(ctl,0,bytes.length);Atomics.notify(ctl,0);
 }
 enqueue(operation){
  const generation=this.generation;
  const job=this.queue.then(async()=>{this.current(generation);return operation(generation)});
  this.queue=job.catch(()=>{});return job;
 }
 async exchange(object,generation){
  await this.send(object,generation);const frame=await this.read(6000,generation);this.current(generation);
  if(['fatal','error'].includes(frame.header.op)){
   const error=Error(frame.header.message||frame.header.reason||'Live engine error');
   if(frame.header.op==='fatal')this.fail(error,generation);throw error;
  }
  return frame;
 }
 transact(object){return this.enqueue(generation=>this.exchange(object,generation))}
 compile(ctx,source,expectedCounters={}){
  return this.enqueue(async generation=>{
   const context=await this.exchange({op:'context',id:1,ctx},generation);
   if(context.header.op!=='ok'||context.header.id!==1){const error=Error('Unexpected live context response');this.fail(error,generation);throw error}
   const req=++this.req,frame=await this.exchange({op:'compile',req,ctx:1,source},generation);
   if(frame.header.op!=='result'||frame.header.req!==req||frame.header.ctx!==1){const error=Error('Mismatched live result');this.fail(error,generation);throw error}
   const nonempty=value=>value!=null&&typeof value==='object'&&Object.keys(value).length>0;
   const counters=frame.header.counters||{};
   const counterMismatch=Object.keys(counters).length!==Object.keys(expectedCounters).length||Object.entries(counters).some(([key,value])=>value!==expectedCounters[key]);
   if(nonempty(frame.header.leaks)||counterMismatch||frame.header.internal){
    const error=Error(frame.header.errors?.map(x=>x.message).join('\n')||'Live engine state changed; worker discarded');
    this.fail(error,generation);throw error;
   }
   if(frame.header.status!=='ok')throw Error(frame.header.errors?.map(x=>x.message).join('\n')||'Live result rejected');
   return frame;
  });
 }
 fail(error,generation=this.generation){
  if(generation!==this.generation)return;
  ++this.generation;this.failure=error;this.ready=null;this.startKey=null;
  for(const reader of this.readers){clearTimeout(reader.timer);reader.reject(error)}
  this.readers=[];this.worker?.terminate();this.worker=null;this.frames=[];this.buffer=new Uint8Array();this.queue=Promise.resolve();
 }
 stop(){this.fail(Error('Live engine restarted'))}
}
