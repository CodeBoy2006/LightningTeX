// Writing features without a browser: line diff, quick fixes, BibTeX, snippets and table templates.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {diffLines,foldDiff,diffStats} from '../core/diff.js';
import {quickFixes,packageEdit} from '../core/quick-fix.js';
import {expandSnippet,stopOrder,shiftStops,SNIPPETS} from '../ui/snippets.js';
import {tableTemplate,matrixTemplate} from '../ui/table-picker.js';
const R=String.raw;

const bibtex=await (async()=>{const context={};context.self=context;vm.createContext(context);vm.runInContext(await fs.readFile(new URL('../public/runtime/bibtex.js',import.meta.url),'utf8'),context);return context.BibTeX;})();
const plain=await fs.readFile(new URL('fixtures/plain.bst',import.meta.url),'utf8');

test('line diff turns one text into the other and folds long unchanged runs',()=>{
  const apply=ops=>ops.filter(op=>op.type!=='del').map(op=>op.text).join('\n'),undo=ops=>ops.filter(op=>op.type!=='add').map(op=>op.text).join('\n');
  let seed=7;const random=()=>(seed=seed*16807%2147483647)/2147483647;
  for(let i=0;i<400;i++){
    const text=()=>Array.from({length:Math.floor(random()*14)},()=>'abcd'[Math.floor(random()*4)]).join('\n'),a=text(),b=text(),ops=diffLines(a,b);
    assert.equal(apply(ops),b);assert.equal(undo(ops),a);
  }
  const ops=diffLines('a\nb\nc\nd\ne\nf\ng\nh','a\nb\nc\nd\nX\nf\ng\nh');
  assert.deepEqual(diffStats(ops),{added:1,removed:1});
  const folded=foldDiff(ops,1);
  assert.equal(folded[0].type,'fold');assert.equal(folded[0].count,3);assert.equal(folded.at(-1).type,'fold');
  assert.deepEqual(ops.find(op=>op.type==='add'),{type:'add',text:'X',b:5});
});

test('quick fixes: packages, spelling, theorem environments, math, references and files',()=>{
  const main=R`\documentclass{article}
\usepackage{amsmath}
\begin{document}
for $x \in \mathbb{R}$ and \mathbff{x}
Let x^2 be large.
\begin{lemma} hi \end{lemma}
see \ref{eq:sun} and \cite{golub2031}
\includegraphics{figures/plt}
\end{document}`;
  const context={files:new Map([['main.tex',main]]),main:'main.tex',labels:['eq:sum'],bibKeys:['golub2013'],paths:['main.tex','figures/plot.png']};
  const fix=(message,line)=>quickFixes({message,file:'main.tex',line},context);
  const apply=edits=>[...edits].sort((a,b)=>b.start-a.start).reduce((text,edit)=>text.slice(0,edit.start)+edit.text+text.slice(edit.end),main);
  const pkg=fix(R`Undefined control sequence \mathbb`,4)[0];
  assert.equal(pkg.kind,'package');assert.match(apply(pkg.edits),/\\usepackage\{amsmath\}\n\\usepackage\{amssymb\}\n/);
  assert.equal(packageEdit('main.tex',main,'amsmath'),null,'a loaded package is not offered again');
  assert.deepEqual(fix(R`Undefined control sequence \mathbff`,4).map(item=>item.label).slice(0,1),[R`\mathbf`]);
  assert.match(apply(fix(R`Undefined control sequence \mathbff`,4)[0].edits),/ and \\mathbf\{x\}/);
  assert.equal(fix(R`Undefined control sequence \includegraphics`,8).length,1,'no far-fetched spellings beside the package');
  assert.match(apply(fix('Environment lemma undefined',6)[0].edits),/\\newtheorem\{lemma\}\{Lemma\}/);
  assert.match(apply(fix('Missing $ inserted',5)[0].edits),/Let \$x\^2\$ be large\./);
  assert.match(apply(fix("Reference `eq:sun' on page 1 undefined",7)[0].edits),/\\ref\{eq:sum\}/);
  assert.match(apply(fix("Citation `golub2031' on page 1 undefined",7)[0].edits),/\\cite\{golub2013\}/);
  assert.match(apply(fix("File `figures/plt' not found",8)[0].edits),/\\includegraphics\{figures\/plot\}/);
  const unbalanced=quickFixes({message:'File ended while scanning use of \\textbf',file:'a.tex',line:1},{files:new Map([['a.tex','x \\textbf{bold\n\nmore']])})[0];
  assert.equal(unbalanced.kind,'unbalanced');assert.equal(unbalanced.go.offset,9);
});

test('environment spelling fixes keep every choice complete across files and skip masked text',()=>{
  const main=R`\begin{alignn}a\end{alignn}`+'\n'+R`% \begin{alignn}`;
  const child=R`\begin{verbatim}\begin{alignn}\end{verbatim}`+'\n'+R`\begin{alignn}b\end{alignn}`;
  const files=new Map([['main.tex',main],['child.tex',child],['image.png',undefined]]);
  const fixes=quickFixes({message:'Environment alignn undefined',file:'main.tex',line:1},{files,main:'main.tex'});
  assert.ok(fixes.length>=2,'the typo offers multiple independent choices');
  for(const fix of fixes){
    assert.equal(fix.edits.length,4);
    const apply=path=>fix.edits.filter(edit=>edit.file===path).sort((a,b)=>b.start-a.start).reduce((text,edit)=>text.slice(0,edit.start)+edit.text+text.slice(edit.end),files.get(path));
    assert.equal(apply('main.tex'),`\\begin{${fix.label}}a\\end{${fix.label}}\n`+R`% \begin{alignn}`);
    assert.equal(apply('child.tex'),R`\begin{verbatim}\begin{alignn}\end{verbatim}`+`\n\\begin{${fix.label}}b\\end{${fix.label}}`);
  }
});

test('BibTeX names, case, purification and prefixes follow bibtex.web',()=>{
  const {formatName,changeCase,purify,textPrefix,textLength,splitNames}=bibtex;
  assert.equal(formatName('Donald E. Knuth',1,'{ff~}{vv~}{ll}{, jj}'),'Donald~E. Knuth');
  assert.equal(formatName('Van Loan, Charles F.',1,'{f.~}{vv~}{ll}'),'C.~F. Van~Loan');
  assert.equal(formatName('Ludwig van Beethoven',1,'{vv~}{ll}{, f.}'),'van Beethoven, L.','a long enough part ends in a space, not a tie');
  assert.equal(formatName('Jean-Pierre Serre',1,'{f.~}{ll}'),'J.-P. Serre');
  assert.equal(formatName('Martin Luther King, Jr.',1,'{ll}{, jj}'),'Martin Luther~King','one comma means "von Last, First": Jr. is the first name here');
  assert.equal(formatName('King, Jr., Martin Luther',1,'{ll}{, jj}{, ff}'),'King, Jr., Martin~Luther');
  assert.equal(formatName(R`J{\"o}rg M{\"u}ller`,1,'{f.~}{ll}'),R`J.~M{\"u}ller`);
  assert.equal(splitNames('A and B AND C and {D and E}').length,4);
  assert.equal(changeCase('The {TeX} Book: An Introduction','t'),'The {TeX} book: An introduction');
  assert.equal(changeCase(R`{\AE}sop`,'l'),R`{\ae}sop`);
  assert.equal(purify(R`G{\"o}del's {\ss}-Theorem`),'Godels ss Theorem');
  assert.equal(textPrefix(R`{\"O}stlund`,2),R`{\"O}s`);assert.equal(textPrefix('{Ab}cd',1),'{A}');
  assert.equal(textLength(R`{\"O}st`),3);
});

test('BibTeX runs a real style: plain sorts, labels and formats the bibliography',()=>{
  const bib=`@string{jhu = "Johns Hopkins University Press"}
@book{golub2013, author={Golub, Gene H. and Van Loan, Charles F.}, title={Matrix Computations}, publisher=jhu, year=2013}
@article{golub1965, author="G. Golub", title={Numerical methods}, journal={Numer. Math.}, volume=7, pages={206--216}, year=1965, month=jun}
@inproceedings{part, author={A. Author}, title={Part}, crossref={proc}, pages={1--2}}
@inproceedings{part2, author={B. Author}, title={Other}, crossref={proc}}
@proceedings{proc, title={Proceedings}, booktitle={Proceedings of Things}, year=1999}`;
  const run=aux=>bibtex.runBibtex({aux,readBib:name=>name==='refs'?{text:bib,file:'refs.bib'}:null,readStyle:name=>name==='plain'?plain:null});
  const result=run('\\citation{golub2013}\n\\citation{golub1965,nokey}\n\\citation{part,part2}\n\\bibstyle{plain}\n\\bibdata{refs}\n');
  assert.equal(result.errors.length,0,'no style errors');
  assert.ok(result.warnings.some(warning=>warning.missing&&warning.key==='nokey'));
  const items=[...result.bbl.matchAll(/\\bibitem\{([^}]+)\}/g)].map(match=>match[1]);
  // plain sorts by author; the proceedings has none (BibTeX warns) and so sorts first. Cited twice by crossref, it is included.
  assert.deepEqual(items,['proc','part','part2','golub1965','golub2013']);
  assert.ok(result.warnings.some(warning=>/to sort, need editor, organization, or key in proc/.test(warning.message)));
  assert.match(result.bbl,/^\\begin\{thebibliography\}\{1\}\n/);
  assert.match(result.bbl,/Gene~H\. Golub and Charles~F\. Van~Loan\.\n\\newblock \{\\em Matrix Computations\}\.\n\\newblock Johns Hopkins University Press, 2013\./);
  assert.match(result.bbl,/\{\\em Numer\. Math\.\}, 7:206--216, June 1965\./);
  assert.match(result.bbl,/In \{\\em Proceedings of Things\\\/\} \\cite\{proc\}, pages 1--2\./,'a cross-referenced entry cites its parent');
  assert.ok(result.bbl.split('\n').every(line=>line.length<=79||!/\s/.test(line.trim())),'lines wrap at 79 columns');
  assert.equal(run('\\citation{a}\n\\bibdata{refs}\n'),null,'no style, no bibliography');
  assert.match(run('\\citation{a}\n\\bibstyle{nostyle}\n\\bibdata{refs}\n').errors[0],/couldn't open style file nostyle\.bst/);
});

test('snippets expand with indentation, mirrors and stops kept in step with edits',()=>{
  const {text,stops}=expandSnippet(SNIPPETS.beg,{indent:'  ',unit:'  '});
  assert.equal(text,'\\begin{environment}\n    \n  \\end{environment}');
  assert.deepEqual(stopOrder(stops),[1,0]);
  const [first,mirror]=stops.filter(stop=>stop.n===1);
  assert.equal(text.slice(mirror.start,mirror.end),'environment');
  // Typing "x" over the first stop's text: the stop grows, everything after it moves.
  assert.ok(shiftStops(stops,first.start,first.end-first.start,1,first));
  assert.equal(first.end-first.start,1);assert.equal(mirror.start,text.indexOf('\\end{')+5-10);
  assert.equal(shiftStops(stops,0,0,1),false,'an edit outside every stop ends the session');
  const frac=expandSnippet('frac{${1}}{${2}}$0');assert.equal(frac.text,'frac{}{}');assert.deepEqual(frac.stops.map(stop=>[stop.n,stop.start]),[[1,5],[2,7],[0,8]]);
  const literal=expandSnippet('Cost $x and ${oops}; ${1:ok} $1 $0');
  assert.equal(literal.text,'Cost $x and ${oops}; ok ok ');assert.deepEqual(stopOrder(literal.stops),[1,0]);
});

test('table and matrix templates put a tab stop in every cell',()=>{
  const table=tableTemplate(2,3,{align:'c',booktabs:true,float:true});
  assert.match(table,/\\begin\{tabular\}\{lcc\}/);assert.match(table,/\\toprule[\s\S]*\\midrule[\s\S]*\\bottomrule/);
  const expanded=expandSnippet(table);assert.equal(stopOrder(expanded.stops).length,2+6+1,'caption, label, six cells, then the end');
  assert.match(tableTemplate(1,2,{float:false,booktabs:false}),/^\\begin\{tabular\}\{lc\}\n\t\\hline/);
  const matrix=expandSnippet(matrixTemplate(2,2,{kind:'bmatrix',display:true}));
  assert.equal(matrix.text,'\\[\n  \\begin{bmatrix}\n     &  \\\\\n     & \n  \\end{bmatrix}\n\\]');
});
