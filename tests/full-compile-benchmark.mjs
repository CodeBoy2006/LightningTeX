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
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const paragraph='Original prose with $x^2+1$ for a full compilation benchmark.\n\n';
const doc=(body,packages='')=>`\\documentclass{article}\n\\usepackage{amsmath}\n${packages}\n\\begin{document}\n${body}\n\\end{document}`;
const documents=[
  {name:'math',source:doc(paragraph.repeat(120))},
  {name:'contents-bookmarks',source:doc('\\tableofcontents\n\\section{First heading}\\label{first}\n'+paragraph.repeat(120)+'See Section~\\ref{first}.','\\usepackage{hyperref}')},
  {name:'include',source:doc(paragraph+'\\include{chapters/first}\nSee Section~\\ref{first}.'),files:[{path:'chapters/first.tex',data:'\\section{First heading}\\label{first}\n'+paragraph.repeat(120),rev:1}]},
  {name:'bibliography',source:doc(paragraph+'See~\\cite{book}.\n\\bibliographystyle{plain}\n\\bibliography{refs}'),files:[
    {path:'refs.bib',data:'@book{book,author={A. Author},title={A Book},publisher={Publisher},year={2026}}',rev:1},
    {path:'plain.bst',data:await fs.readFile(new URL('fixtures/plain.bst',import.meta.url),'utf8'),rev:1},
  ]},
];
async function signature(result){
  const task=getDocument({data:result.pdf.slice(),worker:pdfWorker,isEvalSupported:false});
  try{
    const pdf=await task.promise,text=[];
    for(let page=1;page<=pdf.numPages;page++)text.push((await (await pdf.getPage(page)).getTextContent()).items.map(item=>item.str));
    const items=(list,fonts)=>list.map(item=>item[0]==='g'?['g',fontKey(fonts[item[1]]),...item.slice(2)]:item);
    const layout=result.pages.map(page=>({...page,fonts:undefined,other:items(page.other||[],page.fonts),lines:page.lines.map(line=>({...line,items:items(line.items,page.fonts)}))}));
    return {layout:hash(layout),text:hash(text),outline:hash(await pdf.getOutline()),aux:hash([...result.aux])};
  }finally{await task.destroy();}
}
const results=[];
try{
  for(let round=0;round<3;round++)for(const {name,source,files=[]} of documents){
    const engine=new BackgroundEngine({base});
    try{
      await engine.start();
      for(const [phase,text] of [['initial',source],['edit',source.replace('Original prose','Revised prose')],['repeat',source.replace('Original prose','Revised prose')]]){
        const start=performance.now(),result=await engine.compile(text,{files});
        const wallMs=performance.now()-start;
        assert.ok(result.pdf.length>1000);
        assert.doesNotMatch(result.log,/undefined references|undefined citations/);
        results.push({round,name,phase,passes:result.passes,pages:result.pages.length,ms:result.durationMs,wallMs,...await signature(result)});
      }
    }finally{engine.stop();}
  }
}finally{pdfWorker.destroy();}
const report={scope:'Three rounds, fresh Worker per document; compilation excludes engine startup, package downloads, PDF.js and UI. PDF text, bookmarks, aux and exact display-list signatures checked separately.',sourceHash:hash(documents),results};
if(process.argv[3]){
  const reference=JSON.parse(await fs.readFile(process.argv[3],'utf8'));
  assert.equal(report.sourceHash,reference.sourceHash);
  const stable=rows=>rows.map(({ms,wallMs,passes,...row})=>row);
  assert.deepEqual(stable(results),stable(reference.results));report.matchesReference=true;
}
await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
for(const {name} of documents)for(const phase of ['initial','edit','repeat']){
  const rows=results.filter(row=>row.name===name&&row.phase===phase),times=rows.map(row=>row.ms).sort((a,b)=>a-b);
  console.log(name,phase,rows[0].passes+' pass(es)',Math.round(times[1])+' ms median');
}
