import test from 'node:test';import assert from 'node:assert/strict';
import {splitPreamble,liveSourcePolicy,findLiveEdit,safeProjectPath} from '../core/document.js';
import {parseMacros} from '../core/math-preview.js';
test('commented document marker ignored',()=>assert.equal(splitPreamble('% \\begin{document}\n\\documentclass{article}\n\\begin{document}Hi').preamble,'% \\begin{document}\n\\documentclass{article}\n'));
test('document markers retain the existing immediate-backslash comment rule and source offsets',()=>{
 const marker=String.raw`\begin{document}`;
 for(const prefix of ['',String.raw`\% `,String.raw`\\% `,'text ']){
   const source=prefix+marker+'Body % comment';
   assert.deepEqual(splitPreamble(source),{preamble:prefix,bodyStart:prefix.length+16});
 }
 for(const prefix of ['% ',String.raw`\%% `,'text % ']){
   const line=prefix+marker+' '+marker+'\n';
   assert.deepEqual(splitPreamble(line+marker+'Body'),{preamble:line,bodyStart:line.length+16});
 }
 assert.equal(splitPreamble('no marker\n% '+marker),null);
});
test('single captured paragraph mapping',()=>{let s='\\documentclass{article}\n\\begin{document}\nHello world.\n\nNext paragraph.\n\\end{document}\n';let c={units:[{kind:'par',file:'./main.tex',uid:1,begin_line:3,end_line:4}]};assert.equal(findLiveEdit(s,s.replace('world','reader'),c).source,'Hello reader.');assert.ok(findLiveEdit(s,s.replace('article','report'),c).reason);assert.equal(findLiveEdit(s,s.replace('world','world\n\nMore'),c).reflow,true)});
test('unchanged preamble definitions allow local edits; body definitions still require a full pass',()=>{
 const source='\\documentclass{article}\n\\newcommand{\\R}{\\mathbb{R}}\n\\begin{document}\nHello world.\n\\end{document}',capture={units:[{kind:'par',uid:1,begin_line:4,end_line:5}]};
 assert.equal(findLiveEdit(source,source.replace('world','reader'),capture).source,'Hello reader.');
 const body=source.replace('Hello','\\def\\x{1} Hello');
 assert.match(findLiveEdit(body,body.replace('world','reader'),capture).reason,/Custom setup/);
});
test('path traversal denied',()=>{assert.equal(safeProjectPath('chapters/a.tex'),'chapters/a.tex');for(const p of ['../a','/a','x/../a','C:\\x','x//y'])assert.throws(()=>safeProjectPath(p))});

test('math source policy distinguishes unfinished input from structural changes',async()=>{
 const {liveSourcePolicy}=await import('../core/document.js');
 for(const text of [String.raw`$x^2+\frac{1}{2}$`,String.raw`\[\sqrt{x}+\alpha\]`,String.raw`\begin{align}x&=2\\y&=3\end{align}`])assert.ok(liveSourcePolicy(text).ok,text);
 for(const text of [String.raw`$x^{`,String.raw`\[x`,String.raw`\left(x`,String.raw`\begin{align}x&=2`,String.raw`$\fra$`])assert.ok(liveSourcePolicy(text).incomplete,text);
 for(const text of [String.raw`\input{file}`,String.raw`\def\x{1}`,String.raw`\begin{verbatim}raw\end{verbatim}`,String.raw`^^5cinput{x}`,String.raw`\label{a\input{x}}`,String.raw`\tag{\input{x}}`])assert.ok(!liveSourcePolicy(text).ok,text);
});
test('standard linear algebra operators remain eligible for local math edits',()=>{
 assert.ok(liveSourcePolicy(String.raw`\begin{align}\det R_\theta &= \cos^2\theta + \sin^2\theta = 1.\end{align}`).ok);
 assert.ok(liveSourcePolicy(String.raw`For $T\colon V\to W$, $\dim V=\dim\ker T+\dim\operatorname{im}T$.`).ok);
});
test('theorem text and roman list labels are bounded and require complete arguments',()=>{
 assert.equal(liveSourcePolicy(String.raw`\begin{theorem}[Control]\begin{enumerate}[label=\textup{(\roman*)},nosep]\item A claim.\end{enumerate}\end{theorem}`).ok,true);
 for(const source of [String.raw`\textup`,String.raw`\roman`,String.raw`\textup{`,String.raw`\begin{lemma}A claim.`])assert.equal(liveSourcePolicy(source).incomplete,true);
 for(const source of [String.raw`\begin{customtheorem}A claim.\end{customtheorem}`,String.raw`\textup{\input{other}}`,String.raw`\roman{\def\x{1}}`])assert.ok(!liveSourcePolicy(source).ok);
});
test('row-break stars and spacing change the structural signature',()=>{
 const a=String.raw`\begin{align}x&=44\\y&=45\end{align}`;
 for(const modifier of [String.raw`\\*`,String.raw`\\[2pt]`,String.raw`\\*[2pt]`]){
   const b=a.replace(String.raw`\\`,modifier);
   assert.ok(liveSourcePolicy(b).ok);assert.notEqual(liveSourcePolicy(a).signature,liveSourcePolicy(b).signature);
 }
 assert.equal(liveSourcePolicy(a).signature,liveSourcePolicy(a.replace('44','43')).signature);
});
test('captured spans survive newlines, growth, shrink and edits in later units',async()=>{
 const {captureSpans,acceptLiveEdit}=await import('../core/document.js');
 const source=String.raw`\documentclass{article}
\begin{document}
First $x^2$.

Last paragraph.
\end{document}`;
 const capture={units:[{uid:1,kind:'par',begin_line:3,end_line:4},{uid:2,kind:'par',begin_line:5,end_line:6}]};
 const state={source,spans:captureSpans(source,capture)};
 for(const [a,b,uid] of [['First','First\nlonger',1],['Last','Final',2],['First\nlonger','Short',1],['Final','Last',2]]){
   const next=state.source.replace(a,b),edit=findLiveEdit(state.source,next,capture,state.spans);
   assert.equal(edit.unit?.uid,uid,edit.reason);acceptLiveEdit(state,edit,next);
   assert.equal(state.source.slice(state.spans[1].start,state.spans[1].end),uid===2?b+' paragraph.':state.source.includes('Final')?'Final paragraph.':'Last paragraph.');
 }
 assert.equal(state.spans[0].original,'First $x^2$.');
 assert.equal(state.spans[1].original,'Last paragraph.');
});

test('commands and scripts wait for their arguments; complete forms pass',()=>{
 for(const text of [String.raw`$\frac$`,String.raw`$\frac{a}$`,String.raw`$\frac{a}{$`,String.raw`$\sqrt$`,String.raw`$\sqrt[3$`,String.raw`$x^$`,String.raw`$x_ $`,String.raw`$\left$`,String.raw`$\left( x \right$`,String.raw`\textbf`,String.raw`$\hat}$`])
   assert.ok(liveSourcePolicy(text).incomplete,text);
 for(const text of [String.raw`$\frac{a}{b}$`,String.raw`$\frac12$`,String.raw`$\frac\alpha\beta$`,String.raw`$\sqrt[3]{x}$`,String.raw`$\sqrt x$`,String.raw`$x^*$`,String.raw`$x^\ast_k$`,String.raw`$a^+ + b_-$`,String.raw`$\left\{ x \right.$`,String.raw`$\left( x \right)$`,String.raw`$\bigl[ x \bigr]$`,String.raw`\textbf{bold} and \emph x`,"$\\frac{a}% note\n{b}$",String.raw`$\operatorname*{argmax}_x$`,String.raw`$\overbrace{x}^{n}$`])
   assert.ok(liveSourcePolicy(text).ok,text+' '+JSON.stringify(liveSourcePolicy(text)));
});
test('spans follow the named root file, with or without a leading ./',async()=>{
 const {captureSpans}=await import('../core/document.js');
 const source='\\documentclass{article}\n\\begin{document}\nFirst.\n\nSecond.\n\\end{document}';
 const capture={units:[{uid:1,kind:'par',file:'./paper.tex',begin_line:3,end_line:4},{uid:2,kind:'par',file:'./chapters/one.tex',begin_line:1,end_line:2},{uid:3,kind:'par',file:'paper.tex',begin_line:5,end_line:6}]};
 assert.deepEqual(captureSpans(source,capture,'paper.tex').map(span=>span.original),['First.','Second.']);
 assert.deepEqual(captureSpans(source,capture).map(span=>span.unit.uid),[],'units of other files never map onto the root source');
});
test('existing paragraph breaks in captured proof units survive prose and math edits',()=>{
 const source=String.raw`\documentclass{article}
\newcommand{\R}{\mathbb R}
\begin{document}
\begin{proof}
For $x\in\R$, $x^2=1$.

The claim follows from~\cite[Lemma~2]{known}.
\end{proof}
\end{document}`;
 const capture={units:[{uid:1,kind:'env',name:'proof',begin_line:4,end_line:9}]},macros=parseMacros(splitPreamble(source).preamble);
 for(const [a,b] of [['x^2','x^3'],['claim','result']])assert.equal(findLiveEdit(source,source.replace(a,b),capture,undefined,macros).unit?.uid,1);
 for(const [a,b] of [['\n\nThe','\nThe'],['claim','claim\n\nThen'],['known','other']])assert.equal(findLiveEdit(source,source.replace(a,b),capture,undefined,macros).reflow,true);
});
test('run-in heading titles and preamble macro safety stay structural',()=>{
 const source=String.raw`\paragraph{Approach.} We use $\R$ here.`;
 const macros=parseMacros(String.raw`\newcommand{\R}{\mathbb R}\newcommand{\bad}{\input{secret}}`);
 assert.ok(liveSourcePolicy(source,macros).ok);
 assert.notEqual(liveSourcePolicy(source,macros).signature,liveSourcePolicy(source.replace('Approach.','Result.'),macros).signature);
 assert.ok(!liveSourcePolicy(source.replace('\\R','\\bad'),macros).ok);
 assert.ok(!liveSourcePolicy(String.raw`\cite[\directlua{x}]{known}`,macros).ok);
});
test('included-file spans ignore line numbers from other files and preserve unfinished input',()=>{
 const before='First paragraph.\n\nLast paragraph.\n',capture={units:[{uid:1,file:'part.tex',begin_line:1,end_line:2},{uid:2,file:'main.tex',begin_line:2,end_line:3},{uid:3,file:'part.tex',begin_line:3,end_line:4}]};
 return import('../core/document.js').then(({captureSpans})=>{
  const spans=captureSpans(before,capture,'part.tex');assert.deepEqual(spans.map(span=>span.original),['First paragraph.','Last paragraph.']);
  assert.equal(findLiveEdit(before,before.replace('Last','Final'),capture,spans).unit.uid,3);
  assert.equal(findLiveEdit(before,before.replace('First','First $x^{'),capture,spans).incomplete,true);
  assert.equal(findLiveEdit(before,before.replace('First paragraph.',''),capture,spans).reflow,true);
 });
});
test('the final included paragraph uses its own EOF when TeX closes it in another file',async()=>{
 const {captureSpans,acceptLiveEdit}=await import('../core/document.js');
 const source='First.\n\nLast paragraph\ncontinues here.\n';
 for(const end_line of [1,3,20]){
  const capture={units:[{uid:1,kind:'par',file:'./part.tex',begin_line:1,end_line:2,seqs:[1]},{uid:2,kind:'par',file:'./part.tex',begin_line:3,end_line,seqs:[2]}],
   paragraphs:[{seq:1,file:'./part.tex'},{seq:2,file:'./main.tex'}]};
  const state={source,spans:captureSpans(source,capture,'part.tex')};
  assert.deepEqual(state.spans.map(span=>span.original),['First.','Last paragraph\ncontinues here.']);
  const next=source.replace('continues','still continues'),edit=findLiveEdit(source,next,capture,state.spans);
  assert.equal(edit.unit?.uid,2);acceptLiveEdit(state,edit,next);
  assert.equal(findLiveEdit(next,next.replace('here','there'),capture,state.spans).unit?.uid,2);
 }
});
test('repeated input remains ambiguous and state-changing trailing source is not discarded',async()=>{
 const {captureSpans}=await import('../core/document.js');
 const unit={kind:'par',file:'./part.tex',begin_line:1,end_line:3};
 const capture={units:[{...unit,uid:1,seqs:[1]},{...unit,uid:2,seqs:[2]}],paragraphs:[{seq:1,file:'./main.tex'},{seq:2,file:'./main.tex'}]};
 const text='Repeated paragraph.\n';
 assert.equal(findLiveEdit(text,text.replace('Repeated','Changed'),capture,captureSpans(text,capture,'part.tex')).unit,undefined);
 const setup=text+'\\newpage\n',single={units:capture.units.slice(0,1),paragraphs:capture.paragraphs};
 assert.equal(findLiveEdit(setup,setup.replace('Repeated','Changed'),single,captureSpans(setup,single,'part.tex')).unit,undefined);
});
test('lists and heading formatting are bounded; unsafe commands inside titles stay rejected',()=>{
 for(const source of [String.raw`\begin{itemize}\item One.\item Two.\end{itemize}`,String.raw`\section{An \emph{important} result}`,String.raw`\section[Short]{An \emph{important} result}`,String.raw`\begin{tabular}{ll}A&B\\C&D\end{tabular}`])assert.equal(liveSourcePolicy(source).ok,true,source);
 for(const source of [String.raw`\section{\input secret}`,String.raw`\section[\input secret]{Title}`,String.raw`\paragraph{\csname input\endcsname}`,String.raw`\section{\def\x{1}}`])assert.ok(!liveSourcePolicy(source).ok,source);
});
test('joining adjacent prose merges spans and preserves later edit routing',async()=>{
 const {captureSpans,acceptLiveEdit}=await import('../core/document.js');
 const source='First paragraph.\n\nSecond paragraph.\n\nLast paragraph.',capture={units:[{uid:1,kind:'par',nest:1,begin_line:1,end_line:2},{uid:2,kind:'par',nest:1,begin_line:3,end_line:4},{uid:3,kind:'par',nest:1,begin_line:5,end_line:6}]};
 const state={source,spans:captureSpans(source,capture)},next=source.replace('paragraph.\n\nSecond','paragraph. Second');
 const edit=findLiveEdit(source,next,capture,state.spans);assert.equal(edit.source,'First paragraph. Second paragraph.');assert.equal(edit.reflow,true);assert.equal(edit.removed[0].unit.uid,2);
 acceptLiveEdit(state,edit,next);assert.deepEqual(state.spans.map(span=>span.unit.uid),[1,3]);
 assert.equal(findLiveEdit(next,next.replace('Second','Merged'),capture,state.spans).unit.uid,1);
 assert.equal(findLiveEdit(next,next.replace('Last','Final'),capture,state.spans).unit.uid,3);
 const withCommand=source.replace('\n\nSecond','\n\\newpage\nSecond');
 assert.equal(findLiveEdit(withCommand,withCommand.replace('First','First updated').replace('Last','Last updated'),capture).unit,undefined);
});
test('trailing whitespace insertion and undo after deleting a unit stay live',async()=>{
 const {captureSpans,acceptLiveEdit}=await import('../core/document.js');
 const source='First paragraph. \n\nLast paragraph.',capture={units:[{uid:1,kind:'par',nest:1,begin_line:1,end_line:2},{uid:2,kind:'par',nest:1,begin_line:3,end_line:4}]};
 const state={source,spans:captureSpans(source,capture)};
 assert.equal(findLiveEdit(source,source.replace('. \n','. More text.\n'),capture,state.spans).unit.uid,1);
 const empty=source.replace('First paragraph.',''),edit=findLiveEdit(source,empty,capture,state.spans);
 acceptLiveEdit(state,edit,empty);
 assert.equal(findLiveEdit(empty,source,capture,state.spans).unit.uid,1);
});
test('leading insertion and whole environment deletion include whitespace but preserve other units',async()=>{
 const {captureSpans,acceptLiveEdit}=await import('../core/document.js');
 const equation='\\begin{equation}\nx=1\n\\end{equation}';
 const source='\nFirst.\n\n'+equation+'\n\nLast.';
 const capture={units:[{uid:1,kind:'par',nest:1,begin_line:2,end_line:3},{uid:2,kind:'env',name:'equation',begin_line:4,end_line:6},{uid:3,kind:'par',nest:1,begin_line:8,end_line:8}]};
 const state={source,spans:captureSpans(source,capture)};
 for(const [from,to,uid] of [['\nFirst','Leading.\n\nFirst',1],['\n\n'+equation+'\n\n','\n\n',2],['\n\nLast','\n\n'+equation+'\n\nLast',2],['x=1','x=2',2],['Last','Final',3]]){
  const next=state.source.replace(from,to),edit=findLiveEdit(state.source,next,capture,state.spans);
  assert.equal(edit.unit?.uid,uid,edit.reason);assert.equal(edit.removed.length,0);
  acceptLiveEdit(state,edit,next);assert.equal(state.source.slice(edit.span.start,edit.span.end),edit.source);
 }
 assert.equal(state.spans[1].original,equation);
 const beforeDelete=state.source,deleted=beforeDelete.replace(equation.replace('x=1','x=2'),'');
 acceptLiveEdit(state,findLiveEdit(beforeDelete,deleted,capture,state.spans),deleted);
 const restored=findLiveEdit(deleted,beforeDelete,capture,state.spans);
 assert.equal(restored.unit?.uid,2,'leftover blank lines must not route restoration to the following paragraph');
 const boundary='First.\n\\input{part}\nLast.',units={units:[{uid:1,begin_line:1,end_line:1},{uid:2,begin_line:3,end_line:3}]};
 assert.equal(findLiveEdit(boundary,boundary.replace('\\input{part}','Added.'),units).unit,undefined,'non-whitespace gaps still require full layout');
});
test('removing a blank paragraph separator also joins paragraphs with trailing spaces or extra newlines',async()=>{
 const {captureSpans}=await import('../core/document.js');
 for(const gap of [' \n\n','\n\n\n',' \n \n\n']){
  const before='First.'+gap+'Second.',after='First. Second.';
  const capture={units:[{uid:1,kind:'par',nest:1,begin_line:1,end_line:1},{uid:2,kind:'par',nest:1,begin_line:before.split('\n').length,end_line:before.split('\n').length}]};
  const edit=findLiveEdit(before,after,capture,captureSpans(before,capture));
  assert.equal(edit.source,after,gap);assert.deepEqual(edit.removed.map(span=>span.unit.uid),[2]);
 }
});
