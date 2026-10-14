// Run the distributed entry and assets outside the source tree, with basic TeX only.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';

const directory=await fs.realpath(await fs.mkdtemp(path.join(tmpdir(),'lightningtex-engine-')));
const base=pathToFileURL(directory+'/'),priorFetch=globalThis.fetch,priorWorker=globalThis.Worker;
const messages=[],logs=[],workers=[];
class EngineWorker {
  constructor(url){
    assert.ok(url.href.startsWith(base.href),'workers must come from the relocated distribution');
    this.worker=new Worker(new URL('./worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url),offlinePackages:false}});
    this.worker.on('message',data=>{messages.push(data);this.onmessage?.({data});});
    this.worker.on('error',error=>this.onerror?.(error));workers.push(this);
  }
  postMessage(data){this.worker.postMessage(data);}
  terminate(){return this.worker.terminate();}
}
let engine;
try {
  await fs.cp(new URL('../dist-engine/',import.meta.url),directory,{recursive:true});
  const pkg=JSON.parse(await fs.readFile(new URL('package.json',base),'utf8'));
  assert.equal(pkg.dependencies,undefined);
  await assert.rejects(fs.access(new URL('rtex/rtex-bg.lua',base)));
  globalThis.Worker=EngineWorker;
  globalThis.fetch=async url=>{
    assert.ok(String(url).startsWith(base.href),'support fetches must stay inside the package');
    return new Response(await fs.readFile(new URL(url)));
  };
  const {createEngine,splitPreamble,captureSpans,unitContext,compareUnitBaseline,decodeDisplayList,replaceUnitRows}=await import(new URL('index.js',base));
  engine=await createEngine({endpoint:'',onLog:text=>logs.push(text)});
  const source=String.raw`\documentclass{article}
\begin{document}
Text with $x^2=81$ here.

Another paragraph stays here.
\end{document}`;
  const full=await engine.background.compile(source);
  assert.equal(new TextDecoder().decode(full.pdf.subarray(0,5)),'%PDF-');
  assert.ok(engine.background.runtime.module instanceof WebAssembly.Module);
  const beforeStart=logs.length;
  await engine.live.start(splitPreamble(source).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[],full.packageMisses);
  assert.ok(!logs.slice(beforeStart).some(text=>text.includes('busytex.wasm')),'live startup must skip WASM fetching/decompression');
  assert.equal(engine.live.runtime.module,engine.background.runtime.module);
  const generation=engine.live.generation,span=captureSpans(source,full.capture)[0],ctx=unitContext(full.capture,span.unit);
  const proof=decodeDisplayList((await engine.live.compile(ctx,span.original,span.unit.advanced||{})).binary);
  assert.equal(compareUnitBaseline(span.unit,full.pages,proof).ok,true);
  const fontBytes=()=>messages.reduce((sum,message)=>sum+Object.values(message.fonts||{}).reduce((n,bytes)=>n+bytes.byteLength,0),0);
  const firstFontBytes=fontBytes();assert.ok(firstFontBytes>0);
  let list;const times=[];
  for(let i=0;i<8;i++){
    const began=performance.now();
    list=decodeDisplayList((await engine.live.typeset(ctx,span.original.replace('81',i%2?'82':'83'))).binary);
    times.push(performance.now()-began);
  }
  assert.equal(fontBytes(),firstFontBytes,'warm edits must not retransmit known font bytes');
  assert.equal(engine.background.next,1);assert.equal(engine.live.generation,generation);
  const changed=replaceUnitRows(full.pages,span.unit,proof,list),fresh=await engine.background.compile(source.replace('81','82'));
  const ink=page=>page.lines.flatMap(row=>row.items).filter(item=>['g','r'].includes(item[0])).map(item=>item[0]==='g'?
    ['g',page.fonts[item[1]].filename,page.fonts[item[1]].size,...item.slice(2)]:item);
  assert.deepEqual(full.pages.map(page=>ink(changed.get(page.page)||page)),fresh.pages.map(ink));
  await assert.rejects(engine.live.typeset(ctx,'\\undefinedStandaloneCommand'),/Undefined control sequence/);
  await engine.live.typeset(ctx,span.original);assert.equal(engine.live.generation,generation);
  await assert.rejects(engine.background.compile(source.replace('81','\\undefinedStandaloneCommand')),/Undefined control sequence/);
  const projectSource=String.raw`\documentclass{article}\begin{document}\input{part}\end{document}`;
  const project=await engine.background.compile(projectSource,{root:'nested/main.tex',files:[{path:'part.tex',data:'Project file without a revision.'}]});
  assert.ok(project.pdf.byteLength>1000);
  const recovered=await engine.background.compile(source);assert.ok(recovered.pdf.byteLength>1000);
  console.log(JSON.stringify({relocated:true,sourceDependencies:0,wasmModuleReused:true,warmEdits:times.length,
    warmFontBytes:0,exactEditedLayout:true,liveRecovery:true,fullRecovery:true,projectWithoutRevisions:true,timesMs:times},null,2));
} finally {
  engine?.dispose();await Promise.all(workers.map(worker=>worker.terminate()));
  globalThis.fetch=priorFetch;globalThis.Worker=priorWorker;await fs.rm(directory,{recursive:true,force:true});
}
