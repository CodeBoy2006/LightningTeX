// Conservative browser host for realtime-tex. Native rtex supports a wider policy.
// Captured prose and a bounded math vocabulary enter the warmed engine.
export function splitPreamble(source) {
  const lines=source.split('\n'); let offset=0;
  for(const line of lines){
    const i=line.indexOf('\\begin{document}');
    if(i>=0&&!/(^|[^\\])%/.test(line.slice(0,i)))return {preamble:source.slice(0,offset+i),bodyStart:offset+i+16};
    offset+=line.length+1;
  }return null;
}
const liveEnvironments=new Set('equation equation* align align* gather gather* multline multline* displaymath aligned gathered split cases matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix proof abstract itemize enumerate description quote quotation verse center flushleft flushright tabular tabular* theorem lemma proposition corollary remark'.split(' '));
// A bounded vocabulary keeps state-changing TeX out of the persistent worker.
export const liveCommands=new Set(('text textbf textit textup textrm textsf texttt emph roman mathrm mathit mathbf mathsf mathtt mathcal mathbb mathfrak mathnormal boldsymbol operatorname '+
 'frac dfrac tfrac cfrac binom dbinom tbinom sqrt sum prod coprod int iint iiint oint lim limsup liminf min max sup inf log ln exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh det dim ker deg arg Pr hom gcd colon '+
 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega '+
 'infty partial nabla ell hbar imath jmath Re Im aleph emptyset varnothing forall exists neg in notin ni subset supset subseteq supseteq cup cap setminus land lor perp '+
 'cdot cdots ldots vdots ddots dots times div pm mp ast star circ bullet le leq ge geq neq ne approx sim simeq equiv propto cong to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff '+
 'left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr langle rangle lbrace rbrace lvert rvert lVert rVert vert Vert floor lfloor rfloor lceil rceil '+
 'overline underline bar hat widehat tilde widetilde vec dot ddot overbrace underbrace overset underset stackrel limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle quad qquad thinspace medspace thickspace negthinspace phantom hphantom vphantom smash nonumber notag item par noindent newline linebreak hline toprule midrule bottomrule multicolumn').split(' '));
// Mandatory arguments. A command typed before its arguments would otherwise swallow the
// tokens that close the persistent engine's unit group.
export const liveArity=Object.assign(Object.create(null),{frac:2,dfrac:2,tfrac:2,cfrac:2,binom:2,dbinom:2,tbinom:2,overset:2,underset:2,stackrel:2,multicolumn:3});
for(const name of 'text textbf textit textup textrm textsf texttt emph roman mathrm mathit mathbf mathsf mathtt mathcal mathbb mathfrak mathnormal boldsymbol operatorname sqrt overline underline bar hat widehat tilde widetilde vec dot ddot overbrace underbrace phantom hphantom vphantom smash left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr'.split(' '))liveArity[name]=1;
/** Index just past one plausible macro argument starting at i, or -1 when none has been typed yet. */
export function skipArgument(text,i){
  for(;;){const c=text[i];if(c===' '||c==='\t'||c==='\n')i++;else if(c==='%'){while(i<text.length&&text[i]!=='\n')i++;}else break;}
  const c=text[i];
  if(c===undefined||'}$&#^_~'.includes(c))return -1;
  if(c==='{'){let depth=0;for(;i<text.length;i++){const d=text[i];if(d==='\\')i++;else if(d==='{')depth++;else if(d==='}'&&!--depth)return i+1;}return -1;}
  if(c!=='\\')return i+1;
  const match=/^\\([A-Za-z]+|[^\n])/.exec(text.slice(i,i+64));
  return !match||['end','right','\\',']',')'].includes(match[1])?-1:i+match[0].length;
}
export function missingArgument(text,command,after,arity=liveArity[command]){
  if(!arity)return false;
  let p=after;
  if(command==='sqrt'&&text[p]==='['){p=text.indexOf(']',p);if(p<0)return true;p++;}
  for(let n=0;n<arity;n++){p=skipArgument(text,p);if(p<0)return true;}
  return false;
}
export function liveSourcePolicy(text,macros=new Map()){
  if(!text.trim())return {incomplete:true,reason:'Waiting for content'};
  if(/[\u0000-\u0008]/.test(text)||text.includes('^^'))return {reason:'Unsupported source characters'};
  const stack=[],signature=[];let braces=0;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='%'){while(i<text.length&&text[i]!=='\n')i++;continue;}
    if(c==='\\'){
      const match=/^([A-Za-z]+|[^\n])/.exec(text.slice(i+1));
      if(!match)return {incomplete:true,reason:'Waiting for a command'};
      const command=match[0];i+=command.length;
      const macro=macros.get(command);
      if(missingArgument(text,command,i+1,macro?.arity??liveArity[command]))return {incomplete:true,reason:'Waiting for an argument'};
      if(['section','subsection','subsubsection','paragraph','subparagraph'].includes(command)){
        let start=i+1+(/^\s*\*?\s*/.exec(text.slice(i+1))[0].length);
        if(text[start]==='['){
          const close=text.indexOf(']',start+1);if(close<0)return {incomplete:true,reason:'Waiting for a short title'};
          start=close+1+(/^\s*/.exec(text.slice(close+1))[0].length);
          if(text[start]&&text[start]!=='{')return {reason:'Complex short title needs full layout'};
        }
        const end=skipArgument(text,start);
        if(text[start]!=='{'||end<0)return {incomplete:true,reason:'Waiting for a heading title'};
        signature.push(command+text.slice(i+1,end));
      }else if(['begin','end','label','ref','eqref','pageref','tag','cite'].includes(command)){
        const tail=text.slice(i+1),notes=command==='cite'?/^(?:\s*\[[^\[\]\\{}$]*\]){0,2}/.exec(tail)[0]:'';
        if(command==='cite'&&tail.slice(notes.length).trimStart().startsWith('['))return {reason:'Complex citation needs full layout'};
        const arg=/^\s*(\*)?\s*\{([^{}]*)\}/.exec(tail.slice(notes.length));
        if(!arg)return {incomplete:true,reason:'Waiting for a command argument'};
        i+=notes.length+arg[0].length;const name=arg[2];signature.push(command+(arg[1]||'')+notes+':'+name);
        if(['label','ref','eqref','pageref'].includes(command)&&!/^[A-Za-z0-9:_.-]+$/.test(name))return {reason:'Complex label needs full layout'};
        if(command==='cite'&&!/^[A-Za-z0-9:_,. -]+$/.test(name))return {reason:'Complex citation needs full layout'};
        if(command==='tag'&&!/^[A-Za-z0-9 .()+*/=-]+$/.test(name))return {reason:'Complex tag needs full layout'};
        if(command==='begin'){if(!liveEnvironments.has(name))return {reason:'Environment needs full layout'};stack.push(name);}
        if(command==='end'&&stack.pop()!==name)return {incomplete:true,reason:'Unbalanced environment'};
      }else if(command==='\\'){
        // A star changes page-break penalties even when every row has the same size.
        signature.push('rowbreak:'+(/^\s*\*?(?:\s*\[[^\]]*\])?/.exec(text.slice(i+1))?.[0]||'').replace(/\s+/g,''));
      }else if(command==='['||command==='(')stack.push(command);
      else if(command===']'||command===')'){if(stack.pop()!==(command===']'?'[':'('))return {incomplete:true,reason:'Unbalanced math delimiter'};}
      else if(command==='left')stack.push('left');
      else if(command==='right'){if(stack.pop()!=='left')return {incomplete:true,reason:'Unbalanced delimiters'};}
      else if(!macro&&!liveCommands.has(command)&&!['{','}','$','%','&','#','_',',',';',':','!',' ','/','|'].includes(command)){
        if([...liveCommands,...macros.keys()].some(name=>name.startsWith(command)))return {incomplete:true,reason:'Waiting for a command'};
        return {reason:'Command needs full layout: '+command};
      }
    }else if((c==='^'||c==='_')&&skipArgument(text,i+1)<0)return {incomplete:true,reason:'Waiting for a script'};
    else if(c==='{')braces++;
    else if(c==='}'&&--braces<0)return {incomplete:true,reason:'Unbalanced braces'};
    else if(c==='$'){
      const delimiter=text[i+1]==='$'?'$$':'$';if(delimiter==='$$')i++;
      if(stack.at(-1)===delimiter)stack.pop();else stack.push(delimiter);
    }
  }
  if(braces||stack.length)return {incomplete:true,reason:'Waiting for the expression to close'};
  return {ok:true,signature:JSON.stringify(signature)};
}
function offsets(s){let a=[0];for(let i=0;i<s.length;i++)if(s[i]==='\n')a.push(i+1);return a;}
const sameFile=(a,b)=>String(a).replace(/^\.\//,'')===b;
export function captureSpans(source,capture,root='main.tex'){
  const lines=offsets(source),bodyStart=splitPreamble(source)?.bodyStart??0,end=source.lastIndexOf('\\end{document}'),units=(capture?.units||[]).filter(unit=>!unit.file||sameFile(unit.file,root));
  const paragraphs=new Map((capture?.paragraphs||[]).map(paragraph=>[paragraph.seq,paragraph]));
  return units.map((unit,index)=>{
    const start=Math.max(lines[unit.begin_line-1],bodyStart),next=lines[units[index+1]?.begin_line-1];
    // TeX can close the last paragraph after returning from an input file; its end line then belongs to that other file.
    const tail=paragraphs.get(unit.seqs?.at(-1)),returned=tail?.file&&!sameFile(tail.file,root);
    const limit=Math.min(returned?source.length:lines[unit.end_line]??source.length,end>=0?end:source.length,next>start?next:source.length);
    const text=source.slice(start,limit).trimEnd();
    return {unit,start,end:start+text.length,original:text};
  }).filter(span=>Number.isInteger(span.start)&&span.end>span.start);
}
export function findLiveEdit(before,after,capture,spans=captureSpans(before,capture),macros=new Map()){
  if(before===after)return {unchanged:true,reason:'unchanged'};
  const a=splitPreamble(before),b=splitPreamble(after);
  if(!!a!==!!b||a?.preamble!==b?.preamble)return {reason:'Preamble changed; rebuilding the engine'};
  if(/\\(?:def|gdef|edef|xdef|let|newcommand|renewcommand|newenvironment|newif|catcode|directlua|mathversion|pdfmapline|pdfmapfile|pdfextension)\b/.test(before.slice(a?.bodyStart??0)))return {reason:'Custom setup needs a full document pass'};
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  let oldEnd=before.length,newEnd=after.length;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  const delta=after.length-before.length;
  let candidates=spans.filter(span=>start>=span.start&&oldEnd<=span.end);
  // Restore an empty slot across its leftover whitespace before borrowing the following unit.
  const empty=spans.filter(span=>span.start===span.end&&span.end<=start&&!before.slice(span.end,oldEnd).trim());
  if(start===oldEnd&&empty.length)candidates=empty;
  let members=candidates;
  if(!members.length){
    const left=spans.findLast(span=>span.end<=start),right=spans.find(span=>span.start>=oldEnd);
    const gap=left&&right&&before.slice(left.end,right.start);
    // Removing the last blank line joins both paragraphs, even with trailing spaces.
    const joining=gap&&!gap.trim()&&/\n\s*\n/.test(gap)&&!/\n\s*\n/.test(after.slice(left.end,right.start+delta));
    // Include surrounding whitespace without borrowing another unit's context.
    const adjacent=!joining&&spans.find(span=>(start<span.end&&oldEnd>span.start||span.end<start||oldEnd<span.start)
      &&!before.slice(Math.min(start,span.start),span.start).trim()
      &&!before.slice(span.end,Math.max(oldEnd,span.end)).trim());
    if(adjacent)members=[adjacent];
  }
  if(!members.length){
    const first=spans.findLastIndex(span=>span.start<=start),last=spans.findIndex(span=>span.end>=oldEnd);
    members=first>=0&&last>=first?spans.slice(first,last+1):[];
    // Borrow only adjacent plain paragraphs; headings, includes and state changes retain full layout.
    if(members.some((span,index)=>span.unit.kind!=='par'||span.unit.nest!==1||index&&before.slice(members[index-1].end,span.start).trim()))members=[];
  }
  if(!members.length||candidates.length>1)return {reason:'This edit needs full-document layout'};
  const span=members[0],begin=Math.min(span.start,start),end=Math.max(members.at(-1).end,oldEnd),oldText=before.slice(begin,end),source=after.slice(begin,end+delta);
  const boundaries=/\n\s*\n/.test(before.slice(start-1,oldEnd+1))||/\n\s*\n/.test(after.slice(start-1,newEnd+1));
  const oldPolicy=oldText.trim()?liveSourcePolicy(oldText,macros):{ok:true,signature:'[]'};
  if(!oldPolicy.ok)return {reason:oldPolicy.reason};
  const policy=source.trim()?liveSourcePolicy(source,macros):{ok:true,signature:'[]'};
  if(!policy.ok)return policy;
  return {unit:span.unit,span,removed:members.slice(1),start:begin,end,source,reflow:members.length>1||begin!==span.start||end!==span.end||boundaries||oldPolicy.signature!==policy.signature||!source.trim()};
}
export function acceptLiveEdit(state,edit,source){
  const delta=source.length-state.source.length,boundary=edit.end;
  state.spans=state.spans.filter(span=>!edit.removed.includes(span));
  for(const span of state.spans){
    if(span===edit.span){span.start=edit.start;span.end=boundary+delta;}
    else if(span.start>=boundary){span.start+=delta;span.end+=delta;}
  }
  state.source=source;
}
export function safeProjectPath(path){
  const p=String(path).replaceAll('\\','/');
  if(!p||p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.'||!x)||/[\x00-\x1f:]/.test(p))throw Error('Unsafe project path');
  return p;
}
