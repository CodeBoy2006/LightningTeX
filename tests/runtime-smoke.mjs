import {Worker} from 'node:worker_threads';import fs from 'node:fs/promises';import path from 'node:path';import{pathToFileURL}from'node:url';import assert from'node:assert/strict';
import {splitPreamble} from '../core/document.js';
const root=path.resolve(import.meta.dirname,'..');
const w=new Worker(path.join(import.meta.dirname,'worker-harness.cjs'),{workerData:{script:path.join(root,'public/runtime/background-worker.js')}});let waits=[],logs=[];
w.on('message',m=>{if(m.type==='log'){logs.push(m.text);return}const p=waits.shift();p?.resolve(m)});w.on('error',e=>{for(const p of waits)p.reject(e)});function next(){return new Promise((resolve,reject)=>waits.push({resolve,reject}))}
let p=next();w.postMessage({type:'init',base:pathToFileURL(root+'/public/luahbtex/').href});assert.equal((await p).type,'ready');
const results=[];for(const [id,source]of [[1,String.raw`\documentclass{article}\begin{document}
Hello actual WebAssembly.

Second paragraph.
\end{document}`],[2,String.raw`\documentclass{article}\usepackage{amsmath,microtype,booktabs}\begin{document}
Changed document with $x^2+1$ and an equation:
\[\sum_{k=1}^{n}k=\frac{n(n+1)}{2}.\]
\end{document}`],[3,String.raw`\documentclass{article}\begin{document}\undefinedcommand\end{document}`],[4,String.raw`\documentclass{article}\begin{document}Recovery works.\end{document}`]]){p=next();w.postMessage({type:'compile',id,source,preamble:splitPreamble(source)?.preamble??null});const r=await p;results.push({id,type:r.type,pdf:r.pdf?.length,pages:r.pages?.length,durationMs:r.durationMs,error:r.message?.slice(-1500)});if(id===3)assert.equal(r.type,'error');else{assert.equal(r.type,'result',r.message);assert.ok(r.pdf.length>1000);await fs.mkdir(root+'/qa',{recursive:true});await fs.writeFile(root+`/qa/smoke-${id}.pdf`,r.pdf);if(id===1){await fs.writeFile(root+'/qa/baseline.json',JSON.stringify(r,(k,v)=>ArrayBuffer.isView(v)?Array.from(v):v));}}}
await w.terminate();await fs.writeFile(root+'/qa/runtime-smoke.json',JSON.stringify({runtime:'Node worker running identical browser WASM worker scripts',results},null,2));console.log(JSON.stringify(results,null,2));
