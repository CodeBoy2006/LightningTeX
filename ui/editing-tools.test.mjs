import test from 'node:test';
import assert from 'node:assert/strict';
import {findMatches,replacementText} from './find-bar.js';
import {fuzzyMatch} from './palette.js';
import {completions} from './complete.js';
const R=String.raw;

test('find handles literal metacharacters, unicode words, regex captures and zero-length matches',()=>{
 assert.equal(findMatches('a.b aXb','a.b').matches.length,1);
 assert.equal(findMatches('Cat cat scatter','cat',{wholeWord:true}).matches.length,2);
 assert.equal(findMatches('中文 中文字','中文',{wholeWord:true}).matches.length,1);
 assert.equal(findMatches('a','[' ,{regex:true}).error,true);
 assert.equal(findMatches('abc','(?=.)',{regex:true}).matches.length,3);
 const text='one two',match=findMatches(text,'(?<first>one) (two)',{regex:true}).matches[0];
 assert.equal(replacementText('$2 $<first> $$ $&',match,text),'two one $ one two');
});
test('fuzzy matching ranks contiguous names and rejects out-of-order letters',()=>{
 assert.ok(fuzzyMatch('main','main.tex').score>fuzzyMatch('main','macros/included.tex').score);
 assert.equal(fuzzyMatch('xyz','main.tex'),null);
});
test('completion offers macros, environments, labels and graphics with precise source edits',()=>{
 const files=new Map([['main.tex',R`\newcommand{\custom}[2]{#1 + #2}`],['figures/a.png',undefined],['parts/intro.tex','text']]);
 let source=R`\cus`,item=completions(source,source.length,{files})[0];assert.equal(item.text,'custom{}{}');assert.equal(item.caret,8);
 source=R`\begin{equ}`;item=completions(source,source.length-1,{files})[0];const result=source.slice(0,item.start)+item.text+source.slice(item.end);assert.equal(result,R`\begin{equation}`+'\n  \n'+R`\end{equation}`);assert.equal(result.slice(0,item.caret).endsWith('\n  '),true);
 source=R`\includegraphics{fig}`;assert.equal(completions(source,source.length-1,{files})[0].text,'figures/a.png}');
 source=R`\eqref{eq:`;assert.deepEqual(completions(source,source.length,{labels:[{name:'eq:x',kind:'equation',file:'main.tex',line:3,text:'x'}, {name:'eq:section',kind:'section'}]}).map(i=>i.label),['eq:x']);
 assert.equal(completions(R`% \sec`,6,{files}).length,0);assert.equal(completions(R`\begin{verbatim}\sec`,20,{files}).length,0);
});
