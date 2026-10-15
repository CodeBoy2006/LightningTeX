// Real WASM: BibTeX between LuaLaTeX passes (JavaScript .bst interpreter in the full-compile worker).
import {BrowserWorker} from './runtime-helpers.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {BackgroundEngine} from '../engine/client.js';
import {parseTexLog} from '../core/tex-log.js';
const root=new URL('../',import.meta.url),base=new URL('public/',root);
globalThis.Worker=BrowserWorker;
const bg=new BackgroundEngine({base}),decoder=new TextDecoder(),out={};
const bib=`@book{golub2013,
  author = {Golub, Gene H. and Van Loan, Charles F.},
  title = {Matrix Computations}, edition = {4th},
  publisher = {Johns Hopkins University Press}, address = {Baltimore}, year = 2013 }
@article{golub1965,
  author = "G. Golub", title = "Numerical methods for solving linear least squares problems",
  journal = {Numerische Mathematik}, volume = 7, pages = {206--216}, year = {1965}, month = jun }
@misc{knuth84, author = {Donald E. Knuth}, title = {Literate Programming}, year = 1984 }
`;
let rev=0;
const files=extra=>[{path:'refs.bib',data:bib,rev:++rev},{path:'plain.bst',data:plain,rev:1},...extra];
const plain=await fs.readFile(new URL('fixtures/plain.bst',import.meta.url),'utf8');
const doc=body=>`\\documentclass{article}\n\\begin{document}\n${body}\n\\bibliographystyle{plain}\n\\bibliography{refs}\n\\end{document}\n`;
const bibcites=result=>Object.fromEntries([...decoder.decode(result.aux).matchAll(/\\bibcite\{([^}]*)\}\{([^}]*)\}/g)].map(m=>[m[1],m[2]]));
try {
 // First compile: citations, then BibTeX writes the .bbl, then LaTeX reads its labels — three passes.
 const first=await bg.compile(doc('Least squares~\\cite{golub1965} and matrices~\\cite{golub2013}.'),{root:'main.tex',files:files([])});
 assert.equal(first.passes,3,'a new bibliography takes three passes');
 assert.equal(first.bibtex.style,'plain');assert.deepEqual(first.bibtex.errors,[]);
 assert.deepEqual(bibcites(first),{golub1965:'1',golub2013:'2'},'plain sorts by author, then year');
 assert.ok(!/Citation .* undefined|There were undefined citations/.test(first.log),'every citation resolves on the last pass');
 out.first={passes:first.passes,ms:Math.round(first.durationMs),bibcite:bibcites(first)};

 // Editing the text keeps the citations: the stored .bbl and aux are reused, so no extra pass for BibTeX.
 const edit=await bg.compile(doc('Least squares~\\cite{golub1965} and matrices~\\cite{golub2013}. One more sentence.'),{root:'main.tex',files:files([])});
 assert.ok(edit.passes<=2,'an unchanged bibliography adds no pass');assert.deepEqual(bibcites(edit),bibcites(first));
 out.edit={passes:edit.passes,ms:Math.round(edit.durationMs)};

 // A new citation is picked up in the same compile.
 const added=await bg.compile(doc('Least squares~\\cite{golub1965}, matrices~\\cite{golub2013} and programs~\\cite{knuth84}.'),{root:'main.tex',files:files([])});
 assert.deepEqual(bibcites(added),{golub1965:'1',golub2013:'2',knuth84:'3'});
 assert.ok(!/Citation .* undefined/.test(added.log));
 out.added={passes:added.passes,ms:Math.round(added.durationMs)};

 // A key missing from the database: BibTeX says so and LaTeX's warning carries the line for the quick fix.
 const missing=await bg.compile(doc('See~\\cite{golub2031}.'),{root:'main.tex',files:files([])});
 assert.ok(missing.bibtex.warnings.some(warning=>warning.missing&&warning.key==='golub2031'));
 const problems=parseTexLog(missing.log,{root:'main.tex'});
 assert.ok(problems.some(problem=>/^Citation [`'‘]golub2031['’]/.test(problem.message)&&problem.line===3),'the undefined citation is a problem on its line');
 out.missing={passes:missing.passes,warnings:missing.bibtex.warnings.map(warning=>warning.message)};

 // An entry with a problem in the .bib is reported against that file and line.
 const empty=await bg.compile(doc('\\nocite{*}'),{root:'main.tex',files:[{path:'refs.bib',data:bib+'@article{broken, author={A. Author}, title={T}, year=2000}\n',rev:++rev},{path:'plain.bst',data:plain,rev:1}]});
 const journal=empty.bibtex.warnings.find(warning=>/empty journal in broken/.test(warning.message))
 assert.ok(journal&&journal.file==='refs.bib'&&journal.line===9,'style warnings point at the entry');
 out.nocite={entries:Object.keys(bibcites(empty)).length,warning:journal.message};

 await fs.writeFile(new URL('qa/bibliography.json',root),JSON.stringify({runtime:'actual browser Worker scripts and LuaHBTeX WASM in Node worker_threads (not browser UI)',...out},null,2));
 console.log(JSON.stringify(out,null,2));
} finally {bg.stop();}
