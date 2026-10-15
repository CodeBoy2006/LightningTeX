// Actual WASM -> PDF.js regression, separate from browser UI acceptance.
import {BrowserWorker} from './runtime-helpers.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {getDocument,PDFWorker} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {BackgroundEngine} from '../engine/client.js';

const root=new URL('../',import.meta.url),base=new URL('public/',root);
globalThis.Worker=BrowserWorker;
let captureWrites=0,userHooks=0;
const engine=new BackgroundEngine({base,onLog:text=>{if(/rtex-capture: .* pages written/.test(text))captureWrites++;if(text==='USER-TAIL')userHooks++;}}),worker=new PDFWorker(),results=[];
const document=body=>String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
`+body+String.raw`
\end{document}`;
async function compile(name,source,passes,pattern,options){
  captureWrites=0;userHooks=0;
  const result=await engine.compile(source,options);
  assert.equal(result.passes,passes,name);
  const task=getDocument({data:result.pdf.slice(),worker,isEvalSupported:false});
  try {
    const pdf=await task.promise,texts=[];
    for(let page=1;page<=pdf.numPages;page++)texts.push((await (await pdf.getPage(page)).getTextContent()).items.map(item=>item.str).join(' '));
    const text=texts.join(' ');
    assert.match(text,pattern,name);
    results.push({name,passes:result.passes,pages:pdf.numPages,durationMs:result.durationMs,text});
  }finally{await task.destroy();}
  return result;
}
try {
  await assert.rejects(engine.compile(document('\\undefinedColdStart')),/Undefined control sequence/);
  const initial=document(String.raw`Inline $x^2=81$.

\[\frac{1}{2}+\sqrt{4}=42.\]

\begin{equation}\label{eq:value}y=10\end{equation}
See Equation~\ref{eq:value}.

\begin{align}a&=20,\\b&=30.\end{align}`);
  await compile('initial math and references',initial,2,/See Equation\s+1/);
  assert.equal(captureWrites,1,'only the final cold pass writes page captures');
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
  assert.equal(captureWrites,2,'a warm first pass may be final, so it retains capture');
  assert.match(removed.log,/undefined references/);
  await compile('restored label converges',source,2,/See Equation\s+1/);
  await assert.rejects(engine.compile(source.replace('x^2','x^{')),/./);
  await compile('unfinished math recovery preserves last good aux',source.replace('82','83'),1,/83/);
  const newPreamble=source.replace('{article}','[12pt]{article}');
  await compile('preamble changes invalidate cached aux',newPreamble,2,/See Equation\s+1/);
  assert.equal(captureWrites,1,'a changed preamble again has a mandatory preparation pass');
  const contents=document(String.raw`\tableofcontents
\section{First heading}
Some prose.`);
  await compile('table of contents',contents,2,/First heading[\s\S]*First heading/);
  await compile('stable TOC is reused',contents.replace('Some prose','Revised prose'),1,/First heading[\s\S]*First heading/);
  const renamed=contents.replace('First heading','Renamed heading');
  await compile('changed TOC is regenerated',renamed,2,/Renamed heading[\s\S]*Renamed heading/);
  await compile('removed heading disappears from TOC',renamed.replace('\\section{Renamed heading}',''),2,/Contents\s+Some prose/);
  await compile('restored heading reappears in TOC',contents,2,/First heading[\s\S]*First heading/);
  await assert.rejects(engine.compile(contents.replace('Some prose','\\undefinedCommand')),/./);
  await compile('failed edit preserves successful TOC',contents,1,/First heading[\s\S]*First heading/);

  const linked=contents.replace('\\usepackage{amsmath}','\\usepackage{amsmath,hyperref}');
  await compile('initial bookmarks',linked,2,/First heading[\s\S]*First heading/);
  await compile('stable bookmarks and TOC',linked.replace('Some prose','Revised prose'),1,/Revised prose/);
  await compile('renamed bookmarks and TOC',linked.replace('First heading','New bookmark'),2,/New bookmark[\s\S]*New bookmark/);

  const included=document(String.raw`\include{chapters/one}
See Section~\ref{child}.`);
  const child=String.raw`\section{Child heading}\label{child} Child prose.`;
  const project=data=>({files:[{path:'chapters/one.tex',data}]});
  await compile('initial include reference',included,2,/See Section\s+1/,project(child));
  await compile('included file edit reuses nested aux',included,1,/Revised prose[\s\S]*See Section\s+1/,project(child.replace('Child prose','Revised prose')));
  await compile('removed child label cannot survive',included,2,/See Section\s+\?\?/,project(child.replace('\\label{child}','')));
  await compile('restored child label resolves',included,2,/See Section\s+1/,project(child));
  await compile('deleted include file cannot retain its labels',included,2,/See Section\s+\?\?/);
  await compile('restored include file restores its labels',included,2,/See Section\s+1/,project(child));
  await compile('removed include cannot retain child reference',included.replace('\\include{chapters/one}',''),2,/See Section\s+\?\?/);
  await compile('root change invalidates aux',included,2,/See Section\s+1/,{...project(child),root:'other.tex'});
  await compile('same root reuses aux',included,1,/See Section\s+1/,{...project(child),root:'other.tex'});

  const lists=document(String.raw`\listoffigures\listoftables
\begin{figure}\centering Figure body.\caption{Figure title}\end{figure}
\begin{table}\centering Table body.\caption{Table title}\end{table}`);
  await compile('initial figure and table lists',lists,2,/Figure title[\s\S]*Figure title/);
  await compile('stable figure and table lists',lists,1,/Table title[\s\S]*Table title/);
  await compile('changed figure and table lists',lists.replaceAll('title','revised'),2,/Figure revised[\s\S]*Figure revised/);

  const custom=document(String.raw`\AddToHook{enddocument/afterlastpage}[qa-check]{\typeout{USER-TAIL}}
\newwrite\custom\immediate\openout\custom=main.custom
\immediate\write\custom{Stable custom output}\immediate\closeout\custom
Custom prose.`);
  await compile('unknown output stays conservative',custom,2,/Custom prose/,{root:'custom.tex'});
  assert.equal(captureWrites,1);assert.equal(userHooks,2,'preparation preserves other end-document hooks');
  await compile('unknown output still uses two passes',custom,2,/Custom prose/,{root:'custom.tex'});
  assert.equal(captureWrites,2);assert.equal(userHooks,2);
  const nofiles=document('No auxiliary file.').replace('\\begin{document}','\\nofiles\n\\begin{document}');
  await compile('cold nofiles still finishes with a captured PDF',nofiles,2,/No auxiliary file/);
  assert.equal(captureWrites,1);
  await compile('warm nofiles keeps its one-pass capture',nofiles,1,/No auxiliary file/);
  assert.equal(captureWrites,1);
  assert.equal(engine.generation,generation,'full edits must reuse the loaded worker');
  await fs.writeFile(new URL('qa/full-preview.json',root),JSON.stringify({runtime:'actual WASM and PDF.js in Node; not browser latency',results},null,2));
  console.log(JSON.stringify(results,null,2));
}finally{engine.stop();worker.destroy();}
