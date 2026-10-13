// Formula detection and preview policy. Pure logic; the engine itself is covered by tests/math-preview-wasm.mjs.
import test from 'node:test';import assert from 'node:assert/strict';
import {mathAt,previewSource,prepareBody,parseMacros,inkBounds} from '../core/math-preview.js';
const at=(marked,macros)=>{const offset=marked.indexOf('|'),source=marked.replace('|',''),found=mathAt(source,offset);return found&&{...found,body:source.slice(found.bodyStart,found.bodyEnd),preview:previewSource(found,source,macros)};};

test('caret inside delimiters finds the formula; on or outside them it does not',()=>{
  assert.equal(at(String.raw`Text $x^2|+1$ more`).body,'x^2+1');
  assert.equal(at(String.raw`Text $x^2+1|$ more`).preview.tex,String.raw`\hbox{$x^2+1$}`);
  for(const outside of [String.raw`Text |$x^2+1$ more`,String.raw`Text $x^2+1$| more`,String.raw`cost \$5 and | \$6`,String.raw`% $x|$`,'one $a$\n\nplain | text'])assert.equal(at(outside),null,outside);
  assert.equal(at(String.raw`a $x$ b $y|$ c`).body,'y');
  assert.equal(at(String.raw`a \(x+|y\) b`).preview.tex,String.raw`\hbox{$x+y$}`);
  assert.equal(at(String.raw`$a \text{ if $b$ ok}|$`).body,String.raw`a \text{ if $b$ ok}`,'nested text math stays inside');
});
test('display forms preview unnumbered and without labels',()=>{
  assert.equal(at('pre\n\\[\n  \\frac{a}{b|}\n\\]\npost').preview.tex,'\\[\n  \\frac{a}{b}\n\\]');
  assert.equal(at(String.raw`$$a|+b$$`).preview.tex,String.raw`\[a+b\]`);
  assert.equal(at('\\begin{equation}\\label{e} y=|1 \\end{equation}').preview.tex,'\\[ y=1 \\]');
  assert.equal(at('\\begin{align}\n a&=b\\label{eq:a}\\\\\n c&=|d\n\\end{align}').preview.tex,'\\begin{align*}\n a&=b\\\\\n c&=d\n\\end{align*}');
  assert.equal(at(String.raw`\begin{gather*}x|\end{gather*}`).preview.tex,String.raw`\begin{gather*}x\end{gather*}`);
});
test('an unclosed formula previews up to the caret with open groups closed',()=>{
  assert.equal(at(String.raw`so $x^2 + y|`).preview.tex,String.raw`\hbox{$x^2 + y$}`);
  assert.equal(at(String.raw`so $x^|`).preview.tex,String.raw`\hbox{$x$}`,'a dangling script is dropped');
  assert.equal(at(String.raw`\[\begin{pmatrix}a&b\\c&|`).preview.tex,'\\[\\begin{pmatrix}a&b\\\\c&\n\\end{pmatrix}\\]');
  assert.equal(at(String.raw`so $\left( \frac{1}{2}|`).preview.tex,'\\hbox{$\\left( \\frac{1}{2}\n\\right.$}');
  assert.equal(at(String.raw`so $\sqrt{x % note|`).preview.tex,'\\hbox{$\\sqrt{x % note\n}$}','closers survive a trailing comment');
});
test('input that TeX would choke on waits instead of reaching the engine',()=>{
  for(const text of [String.raw`$\frac|$`,String.raw`$\frac{a}|$`,String.raw`$\fra|$`,String.raw`$x^|$`,String.raw`$\left( x|$`,String.raw`$\sqrt[3|$`,String.raw`$\begin{pmatrix} a|$`,String.raw`$\begin{pma|$`,String.raw`$|$`])
    assert.ok(at(text).preview.incomplete,text);
  for(const text of [String.raw`$\input{x}|$`,String.raw`$\def\x{1}|$`,String.raw`$\foo|$`,String.raw`$a^^5c|$`,String.raw`$\begin{itemize}\end{itemize}|$`,String.raw`$#1|$`,String.raw`$\csname x\endcsname|$`,String.raw`$\iffalse|$`])
    assert.ok(at(text).preview.unsupported,text);
});
test('preamble macros are usable only when their bodies stay within the vocabulary',()=>{
  const macros=parseMacros(String.raw`\newcommand{\R}{\mathbb{R}} % reals
\newcommand{\norm}[1]{\left\lVert #1\right\rVert}
\DeclareMathOperator{\tr}{tr}
\def\half{\frac{1}{2}}
\newcommand{\uses}{\R^2 + \half}
\newcommand{\opt}[2][x]{#1_{#2}}
\newcommand{\bad}{\input{secret}}
\newcommand{\worse}{\bad}
% \newcommand{\hidden}{1}
\newcommand{\open}{\begin{pmatrix}}`);
  assert.deepEqual([...macros.keys()].sort(),['R','half','norm','opt','tr','uses']);
  assert.equal(macros.get('norm').arity,1);assert.equal(macros.get('opt').arity,1,'the optional argument is not required');
  assert.equal(at(String.raw`$\norm{x}+\R|$`,macros).preview.tex,String.raw`\hbox{$\norm{x}+\R$}`);
  assert.ok(at(String.raw`$\norm|$`,macros).preview.incomplete);
  assert.ok(at(String.raw`$\bad|$`,macros).preview.unsupported);
  assert.ok(at(String.raw`$\norm{x}|$`).preview.unsupported,'unknown without the preamble');
  assert.ok(at(String.raw`$\R|$`).preview.incomplete,'a prefix of known commands may still be typed further');
});
test('definitions may use parameters; formulas may not',()=>{
  assert.ok(prepareBody('#1+#2',new Map(),{definition:true}).tex);
  assert.ok(prepareBody('#1',new Map()).unsupported);
});
test('macro bodies share nested and escaped brace handling with ordinary arguments',()=>{
 const macros=parseMacros(String.raw`\newcommand{\braces}[1]{\{#1\}}
\newcommand{\nested}{\frac{{1}}{2}}
\newcommand{\unfinished}{\frac{1}{2}`);
 assert.deepEqual([...macros.keys()],['braces','nested']);assert.equal(macros.get('braces').arity,1);
});
test('ink bounds cover glyph advances, rules and line extents only where something is drawn',()=>{
  const list={lines:[{x:0,y:100,w:900,h:10,d:0,items:[]},{x:0,y:200,w:900,h:30,d:12,items:[['g',1,65,3,400,200,50,0],['g',1,66,4,450,200,40,0],['r',380,150,5,70]]}]};
  assert.deepEqual(inkBounds(list),{x:380,y:150,w:110,h:70});
  assert.equal(inkBounds({lines:[{x:0,y:1,w:9,h:1,d:0,items:[['m','on',0]]}]}),null);
});
