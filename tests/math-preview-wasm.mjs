// Real formula previews with the TOC paragraph context used by the multi-file report.
import {Worker as NodeWorker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
import {splitPreamble} from '../core/document.js';
import {finalizeCapture,unitContext,liveUnitEligibility} from '../core/capture.js';
import {mathAt,previewSource,parseMacros,inkBounds} from '../core/math-preview.js';
import {decodeDisplayList} from '../render/index.mjs';

const root=new URL('../',import.meta.url),base=new URL('public/',root),files={};
for(const name of ['rtex-json.lua','rtex-dl.lua','rtex-dl-bin.lua','rtex-capture.lua','rtex-serve.lua','rtex-pic.lua','latex/rtex-capture.sty','latex/rtex-pic.tex','latex/rtex-serve-patches.tex'])
 files[name]=await fs.readFile(new URL('rtex/'+name,base),'utf8');
globalThis.Worker=class {
 constructor(url){this.w=new NodeWorker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url)}});this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(data){this.w.postMessage(data);}terminate(){void this.w.terminate();}
};
const source=String.raw`\documentclass[11pt]{article}
\usepackage{amsmath,amssymb}
\input{macros}
\begin{document}
\tableofcontents
\input{introduction}
\end{document}`;
const macros=String.raw`\newcommand{\R}{\mathbb{R}}`,paragraph=String.raw`We study a matrix $A \in \R^{m \times n}$ and a vector $b \in \R^m$.`;
const project=[{path:'macros.tex',data:macros,rev:1},{path:'introduction.tex',data:'\\section{Introduction}\n'+paragraph+'\n',rev:1}];
const bg=new BackgroundEngine({base,files}),live=new LiveEngine({base,files});
try {
 const full=await bg.compile(source,{files:project}),capture=finalizeCapture(full.capture);
 const borrowed=capture.units.find(unit=>unit.kind==='par'&&liveUnitEligibility(capture,unit).ok),context=unitContext(capture,borrowed);
 assert.match(borrowed.file,/\.toc$/,'reproduce the preview borrowing the first TOC paragraph');
 assert.equal(context.glues.parfillskip[1],0,'TOC paragraphs do not have normal final-line stretch');
 await live.start(splitPreamble(source).preamble+'\n\\RequirePackage{luatexbase}\n',full.aux,[project[0]]);
 const body=capture.units.find(unit=>unit.kind==='par'&&/introduction\.tex$/.test(unit.file)),bodyContext=unitContext(capture,body);
 const before=decodeDisplayList((await live.compile(bodyContext,paragraph)).binary);
 const generation=live.generation,known=parseMacros(macros);
 const preview=async text=>{
   const found=mathAt(text,text.indexOf('A')+1),prepared=previewSource(found,text,known);
   assert.ok(prepared.tex,JSON.stringify(prepared));
   return decodeDisplayList((await live.typeset(context,prepared.tex)).binary);
 };
 const inline=await preview('$A \\in \\R^{m \\times n}$');
 assert.ok(inkBounds(inline).w<60*65536,'a short inline formula must keep its natural width instead of filling the TOC line');
 const display=await preview('\\[A \\in \\R^{m \\times n}\\]');
 assert.equal(inkBounds(inline).w,inkBounds(display).w,'these inline and display formulas have identical horizontal math spacing');
 const long=await preview('$A'+Array(100).fill('+A').join('')+'$');
 assert.equal(long.lines.length,1,'a standalone inline preview must not wrap at math operators');
 const align=await preview('\\begin{align}A&=b\\\\c&=d\\end{align}');
 assert.equal(align.lines.length,2,'display align retains both rows');
 const replay=decodeDisplayList((await live.compile(bodyContext,paragraph)).binary);
 assert.deepEqual(replay,before,'preview requests must not change subsequent paragraph layout');
 assert.equal(live.generation,generation,'preview and paragraph replay share the same engine');
 console.log('Passed: TOC spacing, long inline formula, display/align, and subsequent paragraph replay.');
} finally {bg.stop();live.stop();}
