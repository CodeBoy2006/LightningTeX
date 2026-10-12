import test from 'node:test';import assert from 'node:assert/strict';
import {parseTexLog} from '../core/tex-log.js';
const log=String.raw`This is LuaHBTeX, Version 1.24.0
(./paper.tex
LaTeX2e <2025-11-01>
(/texlive/texmf-dist/tex/latex/base/article.cls
Document Class: article 2025/01/22 v1.4n Standard LaTeX document class
(/texlive/texmf-dist/tex/latex/base/size10.clo
File: size10.clo
)) (./macros.tex)
LaTeX Warning: Reference 'eq:x' on page 1 undefined on input line 12.

Package hyperref Warning: Token not allowed in a PDF string (Unicode):
(hyperref)                removing 'math shift' on input line 9.

Overfull \hbox (12.3pt too wide) in paragraph at lines 20--22
 (./chapters/one.tex
! Undefined control sequence.
l.1 Chapter \badmacro
                      one.
! LaTeX Error: Environment foo undefined.

See the LaTeX manual or LaTeX Companion for explanation.
Type  H <return>  for immediate help.
 ...

l.3 \begin{foo}

)
! Missing $ inserted.
<inserted text>
                $
l.30 a_b
LaTeX Warning: There were undefined references.
!  ==> Fatal error occurred, no output PDF file produced!
`;
test('errors, warnings and box reports carry the file being read and its line',()=>{
  assert.deepEqual(parseTexLog(log,{root:'paper.tex'}),[
    {severity:'warning',message:"Reference 'eq:x' on page 1 undefined",file:'paper.tex',line:12},
    {severity:'warning',message:"hyperref: Token not allowed in a PDF string (Unicode): removing 'math shift'",file:'paper.tex',line:9},
    {severity:'info',message:'Overfull \\hbox (12.3pt too wide)',file:'paper.tex',line:20},
    {severity:'error',message:'Undefined control sequence \\badmacro',file:'chapters/one.tex',line:1},
    {severity:'error',message:'Environment foo undefined',file:'chapters/one.tex',line:3},
    {severity:'error',message:'Missing $ inserted',file:'paper.tex',line:30},
  ]);
});
test('an error inside a system file has no project file; an empty or foreign log yields nothing',()=>{
  const system=parseTexLog('(./main.tex (/texlive/texmf-dist/tex/latex/x/x.sty\n! Package x Error: Bad option.\nl.7 \\ProcessOptions\n))');
  assert.deepEqual(system,[{severity:'error',message:'Package x Error: Bad option',file:null,line:7}]);
  assert.deepEqual(parseTexLog(''),[]);assert.deepEqual(parseTexLog(undefined),[]);assert.deepEqual(parseTexLog('Compilation cancelled'),[]);
});
test('repeated passes do not list the same problem twice',()=>{
  const once='LaTeX Warning: Citation `k\' on page 1 undefined on input line 4.\n';
  assert.equal(parseTexLog(once+once).length,1);
});
