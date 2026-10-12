// Formula under the caret, and a standalone TeX snippet for previewing it in the warmed engine.
// The snippet shares that engine with page updates, so only a bounded vocabulary may reach it.
import {liveCommands,liveArity,skipArgument,missingArgument} from './document.js';

const starred=names=>names.split(' ').flatMap(name=>[name,name+'*']);
const amsEnvironments=new Set(starred('align gather multline flalign alignat eqnarray'));
export const mathEnvironments=new Set([...amsEnvironments,...starred('equation'),'displaymath','math']);
const innerEnvironments=new Set('aligned alignedat gathered split cases matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix array subarray'.split(' '));

// Symbols and operators of the kernel, amsmath and amssymb beyond the page-update vocabulary.
// None assigns globally; an undefined one is an ordinary, recoverable TeX error.
const extraCommands=('mathscr bm pmb not dagger ddagger top bot parallel nparallel angle measuredangle sphericalangle triangle square Box Diamond blacksquare lozenge '+
 'oplus ominus otimes oslash odot wedge vee uplus sqcup sqcap amalg wr diamond bigtriangleup bigtriangledown triangleleft triangleright lhd rhd unlhd unrhd '+
 'gets uparrow downarrow updownarrow Uparrow Downarrow Updownarrow nearrow searrow swarrow nwarrow hookrightarrow hookleftarrow longrightarrow longleftarrow longleftrightarrow '+
 'Longrightarrow Longleftarrow Longleftrightarrow longmapsto leftharpoonup leftharpoondown rightharpoonup rightharpoondown rightleftharpoons leadsto rightsquigarrow twoheadrightarrow '+
 'xrightarrow xleftarrow overrightarrow overleftarrow overleftrightarrow underrightarrow underleftarrow '+
 'pmod bmod mod pod lg varlimsup varliminf varinjlim varprojlim injlim projlim '+
 'll gg lll ggg prec succ preceq succeq mid nmid asymp doteq models vdash dashv Vdash vDash nvdash lessgtr lesssim gtrsim lessapprox gtrapprox leqslant geqslant '+
 'nleq ngeq nless ngtr lneq gneq lneqq gneqq nsim ncong nequiv subsetneq supsetneq nsubseteq nsupseteq sqsubset sqsupset sqsubseteq sqsupseteq Subset Supset '+
 'smile frown bowtie Join triangleq coloneqq eqqcolon approxeq thickapprox thicksim backsim eqsim fallingdotseq risingdotseq therefore because between pitchfork '+
 'varGamma varDelta varTheta varLambda varXi varPi varSigma varUpsilon varPhi varPsi varOmega digamma varkappa beth gimel daleth hslash Bbbk complement mho eth Finv Game '+
 'check breve acute grave mathring dddot ddddot prime backprime backslash lbrack rbrack lgroup rgroup lmoustache rmoustache arrowvert Arrowvert bracevert '+
 'substack boxed bigcup bigcap bigoplus bigotimes bigodot bigvee bigwedge biguplus bigsqcup iiiint idotsint dotsc dotsb dotsm dotsi dotso ldotp cdotp '+
 'enspace enskip mathop mathbin mathrel mathord mathopen mathclose mathpunct mathinner textup textnormal textsc textmd mbox tag eqref ref intertext '+
 'flat natural sharp clubsuit diamondsuit heartsuit spadesuit wp surd checkmark maltese circledS bigstar blacktriangle blacktriangledown blacktriangleleft blacktriangleright '+
 'ulcorner urcorner llcorner lrcorner dotplus ltimes rtimes leftthreetimes rightthreetimes circledast circledcirc circleddash boxplus boxminus boxtimes boxdot '+
 'veebar barwedge doublebarwedge curlyvee curlywedge Cap Cup intercal divideontimes centerdot varpropto vartriangle vartriangleleft vartriangleright trianglelefteq trianglerighteq '+
 'upharpoonright upharpoonleft downharpoonright downharpoonleft restriction multimap leftrightarrows rightleftarrows leftleftarrows rightrightarrows upuparrows downdownarrows '+
 'Lleftarrow Rrightarrow leftarrowtail rightarrowtail looparrowleft looparrowright curvearrowleft curvearrowright circlearrowleft circlearrowright nleftarrow nrightarrow nLeftarrow nRightarrow nleftrightarrow nLeftrightarrow '+
 'tfrac mspace hspace hskip mkern mskip kern').split(' ');
export const previewCommands=new Set([...liveCommands,...extraCommands]);
const previewArity=Object.assign(Object.create(null),liveArity);
for(const name of 'mathscr bm pmb not xrightarrow xleftarrow overrightarrow overleftarrow overleftrightarrow underrightarrow underleftarrow pmod pod check breve acute grave mathring dddot ddddot substack boxed mathop mathbin mathrel mathord mathopen mathclose mathpunct mathinner textup textnormal textsc textmd mbox tag eqref ref intertext mspace hspace'.split(' '))previewArity[name]=1;
const symbols=new Set(['\\',',',';',':','!',' ','{','}','|','&','%','$','#','_','/','-','>','<','\n']);

/** The formula whose delimiters enclose `offset`, or null. An unclosed formula ends at the caret. */
export function mathAt(source,offset){
  // Math cannot cross a blank line, so the paragraph around the caret bounds the scan.
  let from=source.lastIndexOf('\n',offset-1)+1;
  while(from>0&&offset-from<20000){
    const previous=source.lastIndexOf('\n',from-2)+1;
    if(!source.slice(previous,from-1).trim())break;
    from=previous;
  }
  let open=null,depth=0;
  const inside=(start,end)=>offset>start&&offset<end;
  const found=(bodyEnd,end,closed=true)=>({start:open.start,end,bodyStart:open.bodyStart,bodyEnd,kind:open.kind,env:open.env??null,closed});
  for(let i=from;i<source.length;i++){
    const c=source[i];
    if(c==='\n'){if(/^[ \t]*(?:\n|$)/.test(source.slice(i+1,i+200)))break;continue;}
    if(c==='%'){const line=source.indexOf('\n',i);if(line<0)break;i=line-1;continue;}
    if(c==='\\'){
      const next=source[i+1];
      if(next==='['||next==='('){if(!open){open={start:i,bodyStart:i+2,kind:next==='['?'display':'inline',close:next==='['?']':')'};depth=0;}i++;}
      else if(next===']'||next===')'){
        if(open?.close===next){if(inside(open.start,i+2))return found(i,i+2);open=null;}
        i++;
      }else if(next&&/[A-Za-z]/.test(next)){
        const name=/^[A-Za-z]+/.exec(source.slice(i+1,i+40))[0],after=i+1+name.length;
        const arg=name==='begin'||name==='end'?/^\s*\{([A-Za-z]+\*?)\}/.exec(source.slice(after,after+40)):null;
        if(arg){
          const env=arg[1],end=after+arg[0].length;
          if(name==='begin'&&!open&&mathEnvironments.has(env)){open={start:i,bodyStart:end,kind:env==='math'?'inline':'display',env,close:'env'};depth=0;}
          else if(name==='end'&&open?.env===env){if(inside(open.start,end))return found(i,end);open=null;}
          i=end-1;
        }else i=after-1;
      }else i++;
      if(!open&&i>=offset)return null;
      continue;
    }
    if(c==='{')depth++;else if(c==='}')depth--;
    else if(c==='$'){
      const double=source[i+1]==='$';
      // A caret between two dollars is an empty inline formula just opened, not display math.
      if(!open&&double&&offset===i+1)return {start:i,end:i+2,bodyStart:i+1,bodyEnd:i+1,kind:'inline',env:null,closed:true};
      if(!open){open=double?{start:i,bodyStart:i+2,kind:'display',close:'$$'}:{start:i,bodyStart:i+1,kind:'inline',close:'$'};depth=0;if(double)i++;}
      // `$` inside a group, \[ \] or an environment belongs to nested text.
      else if(open.close==='$'&&depth<=0){if(inside(open.start,i+1))return found(i,i+1);open=null;}
      else if(open.close==='$$'&&double){if(inside(open.start,i+2))return found(i,i+2);open=null;i++;}
    }
    if(!open&&i>=offset)return null;
  }
  return open&&open.start<offset&&offset>=open.bodyStart?found(offset,offset,false):null;
}

const waiting=reason=>({incomplete:true,reason});
const refused=reason=>({unsupported:true,reason});
/** Validated formula body. `repair` closes what an unfinished formula left open at the caret. */
export function prepareBody(body,macros=new Map(),{repair=false,definition=false}={}){
  if(!repair)return scanBody(body,macros,false,definition);
  // Close the open groups first, then hold the completed text to the usual rules.
  const closed=scanBody(body,macros,true,definition);
  return closed.tex?scanBody(closed.tex,macros,false,definition):closed;
}
function scanBody(body,macros,repair,definition){
  if(!body.trim())return waiting('empty');
  if(/[\u0000-\u0008]/.test(body)||body.includes('^^'))return refused('characters');
  if(/\n[ \t]*\n/.test(body))return refused('blank line');
  const stack=[];let out='';
  for(let i=0;i<body.length;i++){
    const c=body[i];
    if(c==='%'){const line=body.indexOf('\n',i),end=line<0?body.length:line;out+=body.slice(i,end);i=end-1;continue;}
    if(c==='\\'){
      const match=/^([A-Za-z]+|[^])/.exec(body.slice(i+1,i+64));
      if(!match)return waiting('command');
      const name=match[0],after=i+1+name.length;
      if(!/[A-Za-z]/.test(name[0])){
        if(!symbols.has(name))return refused('\\'+name);
        out+='\\'+name;i=after-1;continue;
      }
      if(name==='begin'||name==='end'||name==='label'){
        const arg=/^\s*\{([^{}]*)\}/.exec(body.slice(after));
        if(!arg)return waiting('argument');
        i=after+arg[0].length-1;
        if(name==='label')continue; // A preview has no number to label.
        if(!innerEnvironments.has(arg[1]))return refused(arg[1]);
        if(name==='begin')stack.push(arg[1]);
        else if(stack.pop()!==arg[1])return waiting('environment');
        out+='\\'+name+'{'+arg[1]+'}';continue;
      }
      const macro=macros.get(name);
      if(!macro&&!previewCommands.has(name)){
        if([...previewCommands,...macros.keys()].some(known=>known.startsWith(name)))return waiting('command');
        return refused('\\'+name);
      }
      if(!repair&&missingArgument(body,name,after,macro?macro.arity:previewArity[name]))return waiting('argument');
      if(name==='left')stack.push('left');
      else if(name==='right'&&stack.pop()!=='left')return waiting('delimiter');
      out+='\\'+name;i=after-1;continue;
    }
    if(c==='#'){
      if(!definition||!/[1-9]/.test(body[i+1]||''))return refused('#');
      out+='{}';i++;continue;
    }
    if(c==='{')stack.push('{');
    else if(c==='}'){if(stack.pop()!=='{')return waiting('brace');}
    else if(c==='$'&&!stack.includes('{'))return refused('$');
    else if((c==='^'||c==='_')&&skipArgument(body,i+1)<0){
      if(!repair)return waiting('script');
      // The caret sits right after a script character: preview what is already complete.
      if(!body.slice(i+1).trim())continue;
    }
    out+=c;
  }
  if(stack.length&&!repair)return waiting('open');
  // Closers go on their own line so a trailing comment cannot swallow them.
  if(stack.length||/%[^\n]*$/.test(out))out+='\n';
  while(stack.length){const top=stack.pop();out+=top==='{'?'}':top==='left'?'\\right.':'\\end{'+top+'}';}
  return {tex:out};
}

/** `{tex}` for the engine, or `{incomplete}` / `{unsupported}` with a reason. */
export function previewSource(found,source,macros){
  const prepared=prepareBody(source.slice(found.bodyStart,found.bodyEnd),macros,{repair:!found.closed});
  if(!prepared.tex)return prepared;
  // A borrowed paragraph (e.g. a TOC entry) can justify or wrap bare inline math.
  if(found.kind==='inline')return {tex:'\\hbox{$'+prepared.tex+'$}'};
  // Numbers would come from the borrowed context, not the document; show the unnumbered form.
  const env=found.env&&amsEnvironments.has(found.env)?found.env.replace(/\*$/,'')+'*':null;
  return {tex:env?`\\begin{${env}}${prepared.tex}\\end{${env}}`:'\\['+prepared.tex+'\\]'};
}

const balanced=(text,open)=>{let depth=0;for(let i=open;i<text.length;i++){const c=text[i];if(c==='\\')i++;else if(c==='{')depth++;else if(c==='}'&&!--depth)return i;}return -1;};
/** Preamble macros whose bodies stay inside the preview vocabulary: name -> {arity}. */
export function parseMacros(preamble){
  const text=preamble.replace(/(^|[^\\])%.*$/gm,'$1'),candidates=[];
  const pattern=/\\(?:(?:re)?newcommand|providecommand|DeclareMathOperator|DeclareRobustCommand)\*?\s*\{?\s*\\([A-Za-z]+)\s*\}?\s*(?:\[(\d)\])?\s*(\[[^\]]*\])?\s*(?=\{)|\\def\s*\\([A-Za-z]+)((?:#\d)*)\s*(?=\{)/g;
  for(let match;(match=pattern.exec(text));){
    const open=pattern.lastIndex,close=balanced(text,open);
    if(close<0)continue;
    const name=match[1]||match[4],count=match[1]?Number(match[2]||0):match[5].length/2;
    candidates.push({name,arity:Math.max(0,count-(match[3]?1:0)),body:text.slice(open+1,close)});
    pattern.lastIndex=close+1;
  }
  // A macro is usable once everything its body calls is; iterate until no more qualify.
  const macros=new Map();
  for(let grew=true;grew;){
    grew=false;
    for(const candidate of candidates){
      if(macros.has(candidate.name))continue;
      const checked=prepareBody(candidate.body||'{}',macros,{definition:true});
      if(checked.tex){macros.set(candidate.name,{arity:candidate.arity});grew=true;}
    }
  }
  return macros;
}

/** Ink bounds of a typeset unit in scaled points, or null when nothing was drawn. */
export function inkBounds(list){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const line of list.lines||[]){
    let inked=false;
    for(const item of line.items){
      if(item[0]==='g'){x0=Math.min(x0,item[4]);x1=Math.max(x1,item[4]+item[6]);inked=true;}
      else if(item[0]==='r'){x0=Math.min(x0,item[1]);x1=Math.max(x1,item[1]+item[3]);y0=Math.min(y0,item[2]);y1=Math.max(y1,item[2]+item[4]);inked=true;}
    }
    if(inked){y0=Math.min(y0,line.y-line.h);y1=Math.max(y1,line.y+line.d);}
  }
  return x1>x0&&y1>y0?{x:x0,y:y0,w:x1-x0,h:y1-y0}:null;
}
