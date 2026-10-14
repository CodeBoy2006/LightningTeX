import test from 'node:test';
import assert from 'node:assert/strict';
import {parseOutline,documentTitle,maskSource} from '../core/outline.js';
import {wordCount} from '../core/word-count.js';
const R=String.raw;

test('outline follows includes once, reads multiline titles, labels and ignores comments/verbatim',()=>{
 const main=R`\title{A \textbf{paper}}
% \section{Hidden}
\begin{document}
\section{First
heading}\label{sec:first}
\input{chapters/one}
\section*{Last}
\begin{verbatim}
\section{Not a heading}
\end{verbatim}
\end{document}`;
 const files=new Map([['main.tex',main],['chapters/one.tex',R`\subsection{Child}
\begin{equation}\label{eq:a}x=1\end{equation}
\input{main}`]]),outline=parseOutline(files,'main.tex');
 assert.equal(documentTitle(main),'A paper');assert.deepEqual(outline.headings.map(h=>[h.title,h.number,h.level,h.line]),[['First heading','1',0,4],['Child','1.1',1,1],['Last','',0,7]]);
 assert.deepEqual(outline.labels.map(l=>[l.name,l.kind]),[['sec:first','section'],['eq:a','equation']]);assert.deepEqual(outline.paths,['main.tex','chapters/one.tex']);
 assert.equal(main.slice(outline.headings[0].offset).startsWith('\\section'),true);
});
test('comment masking respects escaped percent and preserves positions',()=>{
 const source=R`Text \% intact \\% hidden
\verb|\section{fake}| \section{Real}`;
 const masked=maskSource(source);assert.equal(masked.length,source.length);assert.match(masked,/\\% intact/);assert.ok(!masked.includes('hidden'));assert.ok(!masked.includes('fake'));assert.match(masked,/Real/);
});
test('word count excludes preamble, metadata, math and comments but retains prose formatting',()=>{
 const source=R`\documentclass{article}
\newcommand{\name}{ignored words}
\begin{document}
\section{Hello world}
中文测试 \textbf{two words} $x + y$ \eqref{eq:a}.
\begin{theorem}Visible prose. \begin{align}a+b=c\end{align}\end{theorem}
% ignored words
\verb|ignored words|
\end{document}`;
 assert.equal(wordCount(source),10);assert.equal(wordCount('Hello, well-known world!'),3);assert.equal(wordCount('文字 $unfinished'),2);
});
