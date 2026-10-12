import test from 'node:test';import assert from 'node:assert/strict';
import {splitPreamble,liveSourcePolicy,findLiveEdit,safeProjectPath} from '../core/document.js';
test('commented document marker ignored',()=>assert.equal(splitPreamble('% \\begin{document}\n\\documentclass{article}\n\\begin{document}Hi').preamble,'% \\begin{document}\n\\documentclass{article}\n'));
test('single captured paragraph mapping',()=>{let s='\\documentclass{article}\n\\begin{document}\nHello world.\n\nNext paragraph.\n\\end{document}\n';let c={units:[{kind:'par',file:'./main.tex',uid:1,begin_line:3,end_line:4}]};assert.equal(findLiveEdit(s,s.replace('world','reader'),c).source,'Hello reader.');assert.ok(findLiveEdit(s,s.replace('article','report'),c).reason);assert.ok(findLiveEdit(s,s.replace('world','world\n\nMore'),c).reason)});
test('path traversal denied',()=>{assert.equal(safeProjectPath('chapters/a.tex'),'chapters/a.tex');for(const p of ['../a','/a','x/../a','C:\\x','x//y'])assert.throws(()=>safeProjectPath(p))});

test('math source policy distinguishes unfinished input from structural changes',async()=>{
 const {liveSourcePolicy}=await import('../core/document.js');
 for(const text of [String.raw`$x^2+\frac{1}{2}$`,String.raw`\[\sqrt{x}+\alpha\]`,String.raw`\begin{align}x&=2\\y&=3\end{align}`])assert.ok(liveSourcePolicy(text).ok,text);
 for(const text of [String.raw`$x^{`,String.raw`\[x`,String.raw`\left(x`,String.raw`\begin{align}x&=2`,String.raw`$\fra$`])assert.ok(liveSourcePolicy(text).incomplete,text);
 for(const text of [String.raw`\input{file}`,String.raw`\def\x{1}`,String.raw`\begin{itemize}\item x\end{itemize}`,String.raw`^^5cinput{x}`,String.raw`\label{a\input{x}}`,String.raw`\tag{\input{x}}`])assert.ok(!liveSourcePolicy(text).ok,text);
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
