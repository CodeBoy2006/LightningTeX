// Quick fixes for the commonest LaTeX errors. Pure: problems and source text in, source edits out.
// An edit is {file, start, end, text}; a fix without edits names a place to go instead ({file, offset}).
import {maskSource} from './outline.js';
import {nearest,distance} from './references.js';
import {unbalanced} from './brackets.js';

const table=spec=>Object.fromEntries(Object.entries(spec).flatMap(([pkg,names])=>names.split(/\s+/).filter(Boolean).map(name=>[name,pkg])));
/** Command (without backslash) -> the package that defines it. */
const COMMAND_PACKAGES=table({
  amssymb:'mathbb mathfrak leqslant geqslant varnothing square blacksquare therefore because nexists complement lesssim gtrsim ll gg nleq ngeq nsubseteq subsetneq supsetneq triangleq coloneq checkmark circledR curlyvee curlywedge digamma eth gimel beth daleth hbar hslash lozenge blacklozenge measuredangle sphericalangle smallsetminus Box Diamond vartriangle triangledown bigstar diagup diagdown backprime nleftarrow nrightarrow nLeftarrow nRightarrow twoheadrightarrow twoheadleftarrow rightrightarrows leftleftarrows upharpoonright restriction vDash Vdash Vvdash models intercal veebar barwedge doublebarwedge ltimes rtimes divideontimes dotplus centerdot boxplus boxminus boxtimes boxdot circledast circledcirc circleddash leftthreetimes rightthreetimes eqslantless eqslantgtr lessgtr gtrless approxeq thicksim thickapprox backsim backsimeq precsim succsim varpropto blacktriangle blacktriangledown blacktriangleleft blacktriangleright mho Finv Game Bbbk',
  amsfonts:'mathbbm',
  amsmath:'text dfrac tfrac binom dbinom tbinom boldsymbol pmb operatorname eqref tag notag nonumber xrightarrow xleftarrow overset underset substack intertext numberwithin iint iiint iiiint idotsint DeclareMathOperator mathring genfrac cfrac sideset overleftrightarrow underleftarrow underrightarrow underleftrightarrow allowdisplaybreaks shoveleft shoveright lvert rvert lVert rVert impliedby implies',
  amsthm:'theoremstyle qedhere qedsymbol swapnumbers newtheoremstyle',
  mathtools:'coloneqq eqqcolon Coloneqq mathclap mathllap mathrlap DeclarePairedDelimiter DeclarePairedDelimiterX prescript xmapsto xhookrightarrow vcentcolon shortintertext mathmbox cramped smashoperator adjustlimits',
  bm:'bm',mathrsfs:'mathscr',dsfont:'mathds',bbm:'mathbbm',upgreek:'upalpha upbeta upgamma updelta upepsilon upmu uppi upsigma uptau upphi uptheta uplambda',
  stmaryrd:'llbracket rrbracket shortrightarrow mapsfrom',esint:'oiint oiiint',
  physics:'dv pdv abs norm bra ket braket ev expval comm grad curl divergence order qty',
  braket:'Bra Ket Braket Set',cancel:'cancel bcancel xcancel cancelto',nicefrac:'nicefrac',xfrac:'sfrac',
  graphicx:'includegraphics rotatebox scalebox resizebox reflectbox graphicspath DeclareGraphicsExtensions',
  xcolor:'textcolor color colorbox fcolorbox definecolor pagecolor colorlet',
  colortbl:'rowcolor cellcolor columncolor arrayrulecolor',
  hyperref:'href hypersetup autoref nameref texorpdfstring phantomsection hyperlink hypertarget pdfbookmark',
  url:'url urlstyle',booktabs:'toprule midrule bottomrule cmidrule addlinespace specialrule',multirow:'multirow',
  array:'newcolumntype',makecell:'makecell thead',diagbox:'diagbox',
  siunitx:'SI si num qty unit ang sisetup SIrange numrange qtyrange complexnum',
  cleveref:'cref Cref crefname Crefname crefrange Crefrange cpageref labelcref',
  natbib:'citep citet citeauthor citeyear citealp citealt citenum citetext Citet Citep setcitestyle bibpunct',
  biblatex:'printbibliography addbibresource parencite textcite autocite footcite smartcite fullcite citetitle supercite',
  enumitem:'setlist newlist setlistdepth',geometry:'newgeometry restoregeometry geometry',
  fancyhdr:'fancyhf fancyhead fancyfoot fancypagestyle lhead chead rhead lfoot cfoot rfoot',
  tikz:'tikz usetikzlibrary tikzset draw filldraw shade node coordinate foreach pgfmathsetmacro',
  pgfplots:'addplot pgfplotsset addlegendentry',
  listings:'lstinline lstset lstinputlisting lstdefinestyle lstdefinelanguage',
  algpseudocode:'State Require Ensure Procedure EndProcedure Function EndFunction If EndIf ElsIf Else For EndFor While EndWhile Return Call Comment ForAll Repeat Until',
  caption:'captionsetup captionof DeclareCaptionFormat',subcaption:'subcaption subcaptionbox subref',
  soul:'hl ul st so sethlcolor',ulem:'uline uuline uwave sout xout dashuline dotuline',
  textcomp:'textdegree textcelsius textmu textohm textonehalf texttimes textdiv',gensymb:'degree celsius perthousand ohm micro',
  csquotes:'enquote textquote blockquote MakeOuterQuote',lipsum:'lipsum',blindtext:'blindtext Blindtext',
  todonotes:'todo listoftodos missingfigure',xspace:'xspace',
  tcolorbox:'tcbset newtcolorbox tcbuselibrary',fontspec:'setmainfont setsansfont setmonofont newfontfamily fontspec',
  setspace:'doublespacing onehalfspacing singlespacing setstretch',titlesec:'titleformat titlespacing titlelabel',
  mhchem:'ce cee',chemfig:'chemfig',etoolbox:'ifdefempty AtBeginEnvironment AtEndEnvironment patchcmd apptocmd pretocmd ifstrempty csdef csuse',
  ifthen:'ifthenelse equal whiledo',pdfpages:'includepdf',subfiles:'subfile',adjustbox:'adjustbox',
  nomencl:'nomenclature printnomenclature makenomenclature',glossaries:'gls Gls glspl newglossaryentry printglossaries makeglossaries newacronym acrshort acrlong acrfull',
  makeidx:'makeindex printindex',qrcode:'qrcode',float:'floatstyle restylefloat newfloat',
  wrapfig:'wrapfloat',framed:'FrameSep',multicol:'columnbreak',verbatim:'verbatiminput',
  appendix:'appendixpage addappheadtotoc',footmisc:'footref',marginnote:'marginnote',
  epigraph:'epigraph',lettrine:'lettrine',dirtytalk:'say',
});
/** Environment -> package. */
const ENVIRONMENT_PACKAGES=table({
  amsmath:'align align* gather gather* multline multline* flalign flalign* alignat alignat* split cases pmatrix bmatrix Bmatrix vmatrix Vmatrix matrix smallmatrix subequations aligned gathered alignedat',
  mathtools:'dcases dcases* rcases multlined',amsthm:'proof',tikz:'tikzpicture scope',pgfplots:'axis semilogxaxis semilogyaxis loglogaxis groupplot',
  listings:'lstlisting',algpseudocode:'algorithmic',algorithm:'algorithm',tabularx:'tabularx',longtable:'longtable',multicol:'multicols multicols*',
  subcaption:'subfigure subtable',wrapfig:'wrapfigure wraptable',pdflscape:'landscape',rotating:'sidewaysfigure sidewaystable sideways turn',
  tcolorbox:'tcolorbox',mdframed:'mdframed',framed:'framed shaded leftbar',verbatim:'comment','tikz-cd':'tikzcd',forest:'forest',circuitikz:'circuitikz',
  threeparttable:'threeparttable tablenotes',adjustbox:'adjustbox',minted:'minted',appendix:'appendices subappendices',
});
// Environments a document usually defines itself with \newtheorem.
const THEOREMS={theorem:'Theorem',lemma:'Lemma',proposition:'Proposition',corollary:'Corollary',definition:'Definition',remark:'Remark',example:'Example',conjecture:'Conjecture',claim:'Claim',assumption:'Assumption',exercise:'Exercise',problem:'Problem',observation:'Observation',note:'Note',notation:'Notation',question:'Question',fact:'Fact'};
/** Commands every LaTeX document knows; spelling suggestions draw on these, the packages above and the project's own macros. */
const KERNEL='section subsection subsubsection paragraph subparagraph chapter part label ref pageref cite nocite input include includeonly emph textbf textit texttt textsf textrm textsc textup textsl textnormal mathbf mathit mathrm mathsf mathtt mathcal mathnormal frac sqrt sum prod int oint lim limsup liminf sup inf max min det exp log ln sin cos tan sec csc cot arcsin arccos arctan sinh cosh tanh left right big Big bigg Bigg bigl bigr Bigl Bigr cdot cdots ldots dots vdots ddots times div pm mp leq geq neq approx equiv sim simeq propto in notin subset subseteq supset supseteq cup cap setminus emptyset infty partial nabla forall exists neg land lor to rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow mapsto uparrow downarrow alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega hat bar tilde vec dot ddot widehat widetilde overline underline overbrace underbrace mathop stackrel quad qquad hspace vspace hfill vfill newline linebreak pagebreak newpage clearpage cleardoublepage noindent indent centering raggedright raggedleft item caption footnote footnotemark footnotetext maketitle title author date thanks tableofcontents listoffigures listoftables appendix bibliography bibliographystyle usepackage documentclass newcommand renewcommand providecommand newenvironment renewenvironment newtheorem newcounter setcounter addtocounter stepcounter value arabic roman Roman alph Alph the today LaTeX TeX ldots textbackslash small footnotesize scriptsize tiny large Large LARGE huge Huge normalsize rmfamily sffamily ttfamily bfseries mdseries itshape upshape scshape hline cline vline multicolumn tabularnewline par mbox makebox fbox framebox parbox raisebox rule phantom hphantom vphantom smash displaystyle textstyle scriptstyle limits nolimits not prime ell Re Im wp aleph angle triangle star ast circ bullet diamond oplus ominus otimes oslash odot dagger ddagger wedge vee perp parallel mid nmid langle rangle lfloor rfloor lceil rceil lbrace rbrace vert Vert backslash'.split(' ');

// Misspellings: names within one edit (two for longer names), closest first; case-only differences count as close.
function spelling(name,known,count=3){
  const limit=name.length<=4?1:2;
  return [...new Set(known)].filter(other=>other!==name&&Math.abs(other.length-name.length)<=limit).map(other=>({other,score:other.toLowerCase()===name.toLowerCase()?0:distance(name,other,limit)}))
    .filter(item=>item.score<=limit).sort((a,b)=>a.score-b.score||a.other.localeCompare(b.other)).slice(0,count).map(item=>item.other);
}
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const lineSpan=(text,line)=>{let start=0;for(let n=1;n<line&&start>=0;n++){start=text.indexOf('\n',start);if(start>=0)start++;}if(start<0)return null;const end=text.indexOf('\n',start);return {start,end:end<0?text.length:end};};
/** A preamble line for the main file, after the last \usepackage (or \documentclass), as an edit; null without a preamble. */
function preambleEdit(main,source,line){
  const masked=maskSource(source),body=masked.indexOf('\\begin{document}'),preamble=body<0?masked:masked.slice(0,body);
  let at=-1;for(const match of preamble.matchAll(/\\(?:usepackage|RequirePackage|documentclass)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}[^\n]*/g))at=match.index+match[0].length;
  if(at<0)return body<0?null:{file:main,start:body,end:body,text:line+'\n'};
  return {file:main,start:at,end:at,text:'\n'+line};
}
/** \usepackage{pkg} for the main file, or null when it is already loaded. */
export function packageEdit(main,source,pkg){
  const masked=maskSource(source),body=masked.indexOf('\\begin{document}'),preamble=body<0?masked:masked.slice(0,body);
  if(new RegExp('\\\\(?:usepackage|RequirePackage)\\s*(?:\\[[^\\]]*\\])?\\s*\\{[^}]*\\b'+escape(pkg)+'\\b').test(preamble))return null;
  return preambleEdit(main,source,`\\usepackage{${pkg}}`);
}
// The argument of the first \cmd{…} naming `name` on a line, as an edit range.
function argumentOn(text,span,name,commands){
  const line=text.slice(span.start,span.end),masked=maskSource(line);
  for(const match of masked.matchAll(new RegExp('\\\\(?:'+commands+')\\*?\\s*(?:\\[[^\\]]*\\]\\s*){0,2}\\{([^{}]*)\\}','g'))){
    const open=match.index+match[0].lastIndexOf('{')+1;let at=0;
    for(const part of match[1].split(',')){const key=part.trim();if(key===name){const start=span.start+open+at+part.indexOf(key);return {start,end:start+key.length};}at+=part.length+1;}
  }
  return null;
}
function argumentAnywhere(text,name,commands){
  let start=0;
  for(const line of text.split('\n')){const found=argumentOn(text,{start,end:start+line.length},name,commands);if(found)return found;start+=line.length+1;}
  return null;
}

/** context: {files: Map<path,text>, main, labels:[names], bibKeys:[keys], paths:[project paths], macros:[names]}
 *  -> [{label, edits?, go?, primary?}] for one problem; empty when nothing is known to help. */
export function quickFixes(problem,{files=new Map(),main=null,labels=[],bibKeys=[],paths=[],macros=[]}={}){
  const file=problem.file,text=files.get(file),message=String(problem.message||''),fixes=[];
  const span=typeof text==='string'&&problem.line?lineSpan(text,problem.line):null,mainText=files.get(main);
  const addPackage=(pkg,primary=true)=>{if(typeof mainText!=='string')return;const edit=packageEdit(main,mainText,pkg);if(edit)fixes.push({kind:'package',label:pkg,edits:[edit],primary});};
  let match;
  if((match=/^Undefined control sequence\s*\\([A-Za-z@]+)/.exec(message))){
    const name=match[1];if(COMMAND_PACKAGES[name])addPackage(COMMAND_PACKAGES[name]);
    if(span){
      const at=maskSource(text.slice(span.start,span.end)).search(new RegExp('\\\\'+escape(name)+'(?![A-Za-z@])'));
      if(at>=0){
        const known=[...KERNEL,...Object.keys(COMMAND_PACKAGES),...macros];
        for(const other of spelling(name,known))fixes.push({kind:'replace',label:'\\'+other,edits:[{file,start:span.start+at+1,end:span.start+at+1+name.length,text:other}]});
      }
    }
  }else if((match=/^Environment (\S+) undefined/.exec(message))){
    const name=match[1];
    if(ENVIRONMENT_PACKAGES[name])addPackage(ENVIRONMENT_PACKAGES[name]);
    else if(THEOREMS[name.replace(/\*$/,'')]&&typeof mainText==='string'){
      // An unnumbered variant needs amsthm's \newtheorem*.
      const base=name.replace(/\*$/,''),starred=name.endsWith('*'),line=starred?`${packageEdit(main,mainText,'amsthm')?'\\usepackage{amsthm}\n':''}\\newtheorem*{${name}}{${THEOREMS[base]}}`:`\\newtheorem{${name}}{${THEOREMS[base]}}`,edit=preambleEdit(main,mainText,line);
      if(edit)fixes.push({kind:'theorem',label:line,edits:[edit],primary:true});
    }
    const known=[...Object.keys(ENVIRONMENT_PACKAGES),'equation','equation*','figure','table','tabular','itemize','enumerate','description','center','quote','quotation','abstract','minipage','verbatim','thebibliography','array','eqnarray','flushleft','flushright','titlepage'];
    if(span){
      const suggestions=spelling(name,known),sites=[];
      if(suggestions.length){
        const pattern=new RegExp('\\\\(begin|end)\\s*\\{'+escape(name)+'\\}','g');
        for(const [path,source] of files){if(typeof source!=='string')continue;for(const found of maskSource(source).matchAll(pattern)){const start=found.index+found[0].indexOf('{')+1;sites.push({file:path,start,end:start+name.length});}}
      }
      if(sites.length)for(const other of suggestions)fixes.push({kind:'replace',label:other,edits:sites.map(site=>({...site,text:other}))});
    }
  }else if(/^Missing \$ inserted/.test(message)&&span){
    const wrap=mathFragment(text,span);if(wrap)fixes.push({kind:'math',label:text.slice(wrap.start,wrap.end),edits:[{file,start:wrap.start,end:wrap.start,text:'$'},{file,start:wrap.end,end:wrap.end,text:'$'}],primary:true});
  }else if((match=/^Reference [`'‘]([^'’]+)['’] on page \d+ undefined/.exec(message))){
    const name=match[1],at=span&&argumentOn(text,span,name,'[A-Za-z]*ref')||typeof text==='string'&&argumentAnywhere(text,name,'[A-Za-z]*ref');
    if(at)for(const other of nearest(name,labels,{limit:4}))fixes.push({kind:'replace',label:other,edits:[{file,...at,text:other}]});
  }else if((match=/^Citation [`'‘]([^'’]+)['’] (?:on page \d+ )?undefined/.exec(message))){
    const name=match[1],at=span&&argumentOn(text,span,name,'[A-Za-z]*cite[A-Za-z]*|nocite')||typeof text==='string'&&argumentAnywhere(text,name,'[A-Za-z]*cite[A-Za-z]*|nocite');
    if(at)for(const other of nearest(name,bibKeys,{limit:4}))fixes.push({kind:'replace',label:other,edits:[{file,...at,text:other}]});
  }else if((match=/^File [`'‘]([^'’]+)['’] not found/.exec(message))){
    const name=match[1];
    if(/\.(sty|cls)$/.test(name))return fixes;
    const stem=name.replace(/\.[^./]+$/,''),stems=new Map(paths.map(path=>[path.replace(/\.[^./]+$/,''),path]));
    const at=span&&(()=>{const line=text.slice(span.start,span.end),index=line.indexOf(name)>=0?line.indexOf(name):line.indexOf(stem);return index<0?null:{start:span.start+index,end:span.start+index+(line.indexOf(name)>=0?name.length:stem.length)};})();
    if(at){const wanted=text.slice(at.start,at.end);for(const other of nearest(wanted.replace(/\.[^./]+$/,''),[...stems.keys()],{limit:5}))fixes.push({kind:'replace',label:/\.[^./]+$/.test(wanted)?stems.get(other):other,edits:[{file,...at,text:/\.[^./]+$/.test(wanted)?stems.get(other):other}]});}
  }
  if(/^(?:Missing \} inserted|Extra \}|Too many \}'s|Runaway argument|File ended while scanning|Paragraph ended before|Extra alignment tab)/.test(message)||/^Missing \$ inserted/.test(message)&&!fixes.length){
    // Jump to the first unbalanced brace or environment in the problem's file.
    const open=typeof text==='string'&&unbalanced(text)[0];
    if(open)fixes.push({kind:'unbalanced',label:text.slice(open.start,Math.min(open.end,open.start+24)),go:{file,offset:open.start}});
  }
  return fixes;
}

// The math-looking run on a line that is not already in math: around the first ^, _ or math-only command.
const MATH_COMMAND=/\\(?:alpha|beta|gamma|delta|epsilon|varepsilon|theta|lambda|mu|pi|sigma|tau|phi|varphi|omega|Gamma|Delta|Theta|Lambda|Pi|Sigma|Phi|Omega|frac|sqrt|sum|int|prod|infty|leq|geq|neq|approx|cdot|times|in|subset|mathbb|mathbf|mathcal|partial|nabla|to|rightarrow|hat|bar|vec|tilde)(?![A-Za-z])/;
function mathFragment(text,span){
  const line=text.slice(span.start,span.end),masked=maskSource(line);
  let depth=0,first=-1;
  for(let i=0;i<masked.length;i++){
    const c=masked[i];
    if(c==='\\'&&masked[i+1]==='$'){i++;continue;}
    if(c==='$'){depth^=1;continue;}
    if(depth)continue;
    if(c==='^'||c==='_'||c==='\\'&&MATH_COMMAND.test(masked.slice(i,i+16))){first=i;break;}
  }
  if(first<0)return null;
  // Grow over the token run: letters, digits, operators, braces and commands, stopping at prose words.
  const token=/[\\A-Za-z0-9_^{}()+\-=*/<>|.,']/;
  let start=first,end=first;
  while(start>0&&token.test(masked[start-1])&&!/[.,]/.test(masked[start-1])&&masked[start-1]!==' ')start--;
  let braces=0;
  while(end<masked.length&&(braces>0||token.test(masked[end])&&masked[end]!==' ')){if(masked[end]==='{')braces++;else if(masked[end]==='}')braces--;end++;}
  while(end>start&&/[.,]/.test(masked[end-1]))end--;
  return end>start?{start:span.start+start,end:span.start+end}:null;
}
