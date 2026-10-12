// Actual WASM -> PDF.js regression, separate from browser UI acceptance.
import {Worker as NodeWorker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {getDocument,PDFWorker} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {BackgroundEngine} from '../core/engine-client.js';

const root=new URL('../',import.meta.url),base=new URL('public/',root),files={};
for(const name of ['rtex-json.lua','rtex-dl.lua','rtex-dl-bin.lua','rtex-capture.lua','rtex-serve.lua','rtex-pic.lua','latex/rtex-capture.sty','latex/rtex-pic.tex','latex/rtex-serve-patches.tex'])
  files[name]=await fs.readFile(new URL('rtex/'+name,base),'utf8');
globalThis.Worker=class {
  constructor(url){this.worker=new NodeWorker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url)}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(data){this.worker.postMessage(data);}
  terminate(){void this.worker.terminate();}
};
const engine=new BackgroundEngine({base,files}),worker=new PDFWorker(),results=[];
const document=body=>String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
`+body+String.raw`
\end{document}`;
async function compile(name,source,passes,pattern){
  const result=await engine.compile(source);
  assert.equal(result.passes,passes,name);
  const task=getDocument({data:result.pdf.slice(),worker,isEvalSupported:false});
  try {
    const pdf=await task.promise,content=await (await pdf.getPage(1)).getTextContent();
    const text=content.items.map(item=>item.str).join(' ');
    assert.match(text,pattern,name);
    results.push({name,passes:result.passes,pages:pdf.numPages,durationMs:result.durationMs,text});
  }finally{await task.destroy();}
  return result;
}
try {
  const initial=document(String.raw`Inline $x^2=81$.

\[\frac{1}{2}+\sqrt{4}=42.\]

\begin{equation}\label{eq:value}y=10\end{equation}
See Equation~\ref{eq:value}.

\begin{align}a&=20,\\b&=30.\end{align}`);
  await compile('initial math and references',initial,2,/See Equation\s+1/);
  const generation=engine.generation;
  let source=initial.replace('81','82');
  await compile('inline math edit',source,1,/82/);
  source=source.replace('42','43');
  await compile('display fraction and radical edit',source,1,/43/);
  source=source.replace('y=10','y=11');
  await compile('numbered equation edit',source,1,/11/);
  source=source.replace('b&=30','b&=31');
  await compile('align edit',source,1,/31/);
  const missing=source.replace('\\label{eq:value}','');
  const removed=await compile('removed label cannot survive in cached aux',missing,2,/See Equation\s+\?\?/);
  assert.match(removed.log,/undefined references/);
  await compile('restored label converges',source,2,/See Equation\s+1/);
  await assert.rejects(engine.compile(source.replace('x^2','x^{')),/./);
  await compile('unfinished math recovery preserves last good aux',source.replace('82','83'),1,/83/);
  const newPreamble=source.replace('{article}','[12pt]{article}');
  await compile('preamble changes invalidate cached aux',newPreamble,2,/See Equation\s+1/);
  const contents=document(String.raw`\tableofcontents
\section{First heading}
Some prose.`);
  await compile('table of contents',contents,2,/First heading[\s\S]*First heading/);
  await compile('unchanged aux cannot suppress TOC regeneration',contents.replace('Some prose','Revised prose'),2,/First heading[\s\S]*First heading/);
  assert.equal(engine.generation,generation,'full edits must reuse the loaded worker');
  await fs.writeFile(new URL('qa/full-preview.json',root),JSON.stringify({runtime:'actual WASM and PDF.js in Node; not browser latency',results},null,2));
  console.log(JSON.stringify(results,null,2));
}finally{engine.stop();worker.destroy();}
