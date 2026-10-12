// Real WASM: multi-file projects, error attribution, and standalone formula previews in the persistent engine.
import {Worker as NodeWorker} from 'node:worker_threads';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
import {splitPreamble} from '../core/document.js';
import {finalizeCapture,unitContext,liveUnitEligibility} from '../core/capture.js';
import {mathAt,previewSource,parseMacros,inkBounds} from '../core/math-preview.js';
import {parseTexLog} from '../core/tex-log.js';
import {decodeDisplayList} from '../render/index.mjs';
import {TEMPLATES} from '../ui/templates.js';
const root=new URL('../',import.meta.url),base=new URL('public/',root),files={};
for(const name of ['rtex-json.lua','rtex-dl.lua','rtex-dl-bin.lua','rtex-capture.lua','rtex-serve.lua','rtex-pic.lua','latex/rtex-capture.sty','latex/rtex-pic.tex','latex/rtex-serve-patches.tex'])
 files[name]=await fs.readFile(new URL('rtex/'+name,base),'utf8');
globalThis.Worker=class {
 constructor(url){this.w=new NodeWorker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url)}});this.w.on('message',data=>this.onmessage?.({data}));this.w.on('error',e=>this.onerror?.(e));}
 postMessage(data){this.w.postMessage(data);}terminate(){void this.w.terminate();}
};
const bg=new BackgroundEngine({base,files}),live=new LiveEngine({base,files});
const report=TEMPLATES.find(template=>template.id==='report'),png=Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),c=>c.charCodeAt(0));
let rev=0;const project=overrides=>Object.entries({...report.files,...overrides}).filter(([path,data])=>path!=='main.tex'&&data!=null).map(([path,data])=>({path,data,rev:++rev}));
const main=report.files['main.tex'],out={};
try {
 // The root may have any name; other files are read from their project paths, images included.
 const figure=main.replace('\\input{macros}','\\usepackage{graphicx}\n\\input{macros}').replace('\\input{sections/method}','\\input{sections/method}\n\\includegraphics[width=1cm]{figures/dot.png}');
 const full=await bg.compile(figure,{root:'report.tex',files:project({'figures/dot.png':png})});
 assert.ok(full.pdf.length>1000);assert.match(full.log,/<\.\/figures\/dot\.png>/);
 const capture=finalizeCapture(full.capture),sources=new Set(capture.units.map(unit=>unit.file));
 for(const file of ['./report.tex','./sections/introduction.tex','./sections/method.tex'])assert.ok(sources.has(file),'units from '+file);
 out.multiFile={pages:full.pages.length,passes:full.passes,units:capture.units.length,ms:Math.round(full.durationMs)};

 // An error inside an included file is reported against that file and line; the next job recovers.
 const broken=await bg.compile(figure,{root:'report.tex',files:project({'figures/dot.png':png,'sections/method.tex':'\\section{Method}\nGood line.\nBad \\nosuchmacro here.\n'})}).then(()=>null,error=>error);
 assert.ok(broken,'a broken include must fail');
 const problems=parseTexLog(broken.log??broken.message,{root:'report.tex'});
 assert.deepEqual(problems.filter(problem=>problem.severity==='error'),[{severity:'error',message:'Undefined control sequence \\nosuchmacro',file:'sections/method.tex',line:3}]);
 const again=await bg.compile(main,{root:'main.tex',files:project()});assert.equal(parseTexLog(again.log).filter(problem=>problem.severity==='error').length,0);
 out.errorAttribution=problems.filter(problem=>problem.severity==='error');

 // Formula previews: the engine gets the preamble's files, so macros defined there are available.
 const preamble=splitPreamble(main).preamble,macros=parseMacros(preamble+'\n'+report.files['macros.tex']);
 assert.deepEqual([...macros.keys()].sort(),['R','argmin','norm']);
 const unit=finalizeCapture(again.capture).units.find(candidate=>candidate.kind==='par'&&liveUnitEligibility(again.capture,candidate).ok);
 assert.ok(unit,'a paragraph context for previews');
 const context=unitContext(again.capture,unit);
 await live.start(preamble+'\n\\RequirePackage{luatexbase}\n',again.aux,[{path:'macros.tex',data:report.files['macros.tex'],rev:1}]);
 const generation=live.generation,times=[],sent=[];
 const preview=async marked=>{
   const offset=marked.indexOf('|'),source=marked.replace('|',''),found=mathAt(source,offset);assert.ok(found,marked);
   const prepared=previewSource(found,source,macros);if(!prepared.tex)return prepared;
   sent.push(prepared.tex);const began=performance.now(),frame=await live.typeset(context,prepared.tex);times.push(performance.now()-began);
   const box=inkBounds(decodeDisplayList(frame.binary));assert.ok(box&&box.w>0&&box.h>0,'ink for '+marked);return {box,header:frame.header};
 };
 const method=report.files['sections/method.tex'];
 const display=await preview(method.replace('\\argmin','|\\argmin')),inline=await preview(method.replace('A^{\\top} A','A^{\\top}| A'));
 assert.ok(display.box.h>inline.box.h,'display math is taller than the inline formula');
 const numbered=await preview('\\begin{align}\n a&=\\norm{x},\\label{eq:a}\\\\\n b&=|\\R^n\n\\end{align}');
 assert.equal(numbered.header.counters,undefined,'previews are unnumbered');assert.ok(numbered.box.h>display.box.h*0.9);
 // Unfinished input is either held back or repaired before it can reach the engine.
 for(const marked of ['$\\frac|$','$\\frac{a}|$','$\\norm|$','$x^|$','$\\left(a|$'])assert.ok((await preview(marked)).incomplete,marked);
 assert.ok((await preview('$\\def\\R{1}|$')).unsupported);
 assert.ok((await preview('so $\\frac{a}{b|')).box,'an unclosed formula previews up to the caret');
 assert.ok((await preview('\\[\\begin{pmatrix}a&b\\\\c&|')).box);
 // A TeX error in a formula is reported and leaves the engine usable.
 await assert.rejects(live.typeset(context,'$\\mathscr{A}$'),/Undefined control sequence/);
 assert.ok((await preview('$a+|b$')).box);
 assert.equal(live.generation,generation,'the persistent engine was never restarted');
 const first=times[0];times.sort((a,b)=>a-b);
 out.formulaPreview={typeset:sent.length,engineRestarts:0,firstMs:Number(first.toFixed(2)),medianMs:Number(times[times.length>>1].toFixed(2)),maxMs:Number(times.at(-1).toFixed(2))};
 await fs.writeFile(new URL('qa/project-math.json',root),JSON.stringify({runtime:'actual browser Worker scripts and LuaHBTeX WASM in Node worker_threads (not browser UI)',...out},null,2));
 console.log(JSON.stringify(out,null,2));
} finally {bg.stop();live.stop();}
