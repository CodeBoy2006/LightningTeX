// Full jobs only: identical offline inputs, fresh workers, no UI/rendering in the timings.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getDocument,PDFWorker} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {BrowserWorker} from './runtime-helpers.mjs';
import {BackgroundEngine} from '../engine/client.js';
import {fontKey} from '../core/capture.js';

const output=process.argv[2];
if(!output)throw Error('Usage: node tests/full-compile-benchmark.mjs output.json [reference.json]');
globalThis.Worker=BrowserWorker;
const base=new URL(process.env.RTEX_ENGINE_BASE||'../public/',import.meta.url),pdfWorker=new PDFWorker();
const variants=process.env.RTEX_REFERENCE_BASE?[{variant:'before',base:new URL(process.env.RTEX_REFERENCE_BASE)},{variant:'after',base}]:[{base}];
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const picture=await fs.readFile(new URL('../qa/smoke-1.pdf',import.meta.url));
const raster=await fs.readFile(new URL('../qa/incremental-math.png',import.meta.url));
const paragraph='Original prose with $x^2+1$ for a full compilation benchmark.\n\n';
const doc=(body,packages='')=>`\\documentclass{article}\n\\usepackage{amsmath}\n${packages}\n\\begin{document}\n${body}\n\\end{document}`;
const documents=[
  {name:'math',source:doc(paragraph.repeat(120))},
  {name:'type1',source:doc(paragraph.repeat(120),'\\usepackage[T1]{fontenc}\\usepackage{lmodern,microtype}')},
  {name:'contents-bookmarks',source:doc('\\tableofcontents\n\\section{First heading}\\label{first}\n'+paragraph.repeat(120)+'See Section~\\ref{first}.','\\usepackage{hyperref}')},
  {name:'include',source:doc(paragraph+'\\include{chapters/first}\nSee Section~\\ref{first}.'),files:[{path:'chapters/first.tex',data:'\\section{First heading}\\label{first}\n'+paragraph.repeat(120),rev:1}]},
  {name:'bibliography',source:doc(paragraph+'See~\\cite{book}.\n\\bibliographystyle{plain}\n\\bibliography{refs}'),files:[
    {path:'refs.bib',data:'@book{book,author={A. Author},title={A Book},publisher={Publisher},year={2026}}',rev:1},
    {path:'plain.bst',data:await fs.readFile(new URL('fixtures/plain.bst',import.meta.url),'utf8'),rev:1},
  ]},
  {name:'graphics',source:doc(paragraph+'\\includegraphics[width=8cm]{picture.pdf}\n\\newpage\n\\includegraphics[width=8cm]{picture.png}', '\\usepackage{graphicx}'),files:[{path:'picture.pdf',data:picture,rev:1},{path:'picture.png',data:raster,rev:1}]},
];
async function signature(result){
  const task=getDocument({data:result.pdf.slice(),worker:pdfWorker,isEvalSupported:false});
  try{
    const pdf=await task.promise,text=[];
    for(let page=1;page<=pdf.numPages;page++)text.push((await (await pdf.getPage(page)).getTextContent()).items.map(item=>item.str));
    const items=(list,fonts)=>list.map(item=>item[0]==='g'?['g',fontKey(fonts[item[1]]),...item.slice(2)]:item);
    const layout=result.pages.map(page=>({...page,fonts:undefined,other:items(page.other||[],page.fonts),lines:page.lines.map(line=>({...line,items:items(line.items,page.fonts)}))}));
    // PDF dates and trailer IDs vary per run; all other bytes must agree, including images.
    const stablePdf=Buffer.from(result.pdf).toString('latin1').replace(/\/(?:CreationDate|ModDate)\s*\(D:[^)]*\)/g,'').replace(/\/ID\s*\[\s*<[\da-fA-F]+>\s*<[\da-fA-F]+>\s*\]/g,'');
    return {layout:hash(layout),text:hash(text),outline:hash(await pdf.getOutline()),aux:hash([...result.aux]),capture:hash(result.capture),pdf:hash(stablePdf)};
  }finally{await task.destroy();}
}
const results=[];
try{
  for(let round=0;round<3;round++)for(const {name,source,files=[]} of documents)for(const {variant,base} of (round%2?variants.toReversed():variants)){
    const engine=new BackgroundEngine({base});
    try{
      const loadStarted=performance.now();await engine.start();const loadMs=performance.now()-loadStarted;
      for(const [phase,text] of [['initial',source],['edit',source.replace('Original prose','Revised prose')],['repeat',source.replace('Original prose','Revised prose')]]){
        const start=performance.now(),result=await engine.compile(text,{files});
        const wallMs=performance.now()-start;
        assert.ok(result.pdf.length>1000);
        assert.doesNotMatch(result.log,/undefined references|undefined citations/);
        results.push({round,name,phase,...(variant?{variant}:{}),passes:result.passes,pages:result.pages.length,ms:result.durationMs,wallMs,...(phase==='initial'?{loadMs,initialTotalMs:loadMs+wallMs}:{}),...await signature(result)});
      }
    }finally{engine.stop();}
  }
}finally{pdfWorker.destroy();}
const report={scope:'Three rounds, fresh Worker per document. Compilation excludes startup, downloads and rendering; initialTotalMs includes local engine loading. Offline packages. Exact display lists, capture, text, bookmarks, aux and PDF bytes (except dates/IDs) checked separately.',sourceHash:hash(documents),results};
const stable=rows=>rows.map(({ms,wallMs,passes,loadMs,initialTotalMs,variant,...row})=>row);
if(variants.length===2){
  assert.deepEqual(stable(results.filter(row=>row.variant==='before')),stable(results.filter(row=>row.variant==='after')));
  assert.deepEqual(results.filter(row=>row.variant==='before').map(row=>row.passes),results.filter(row=>row.variant==='after').map(row=>row.passes));
  report.matchesPairedReference=true;report.scope+=' Before/after workers alternate per document, with order reversed in the middle round.';
}
if(process.argv[3]){
  const reference=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
  assert.equal(report.sourceHash,reference.sourceHash);
  assert.deepEqual(stable(results),stable(reference.results));report.matchesReference=true;
}
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
for(const {variant} of variants)for(const {name} of documents)for(const phase of ['initial','edit','repeat']){
  const rows=results.filter(row=>row.variant===variant&&row.name===name&&row.phase===phase),times=rows.map(row=>row.ms).sort((a,b)=>a-b);
  console.log(variant||'',name,phase,rows[0].passes+' pass(es)',Math.round(times[1])+' ms median');
}
