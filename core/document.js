// Conservative browser host for realtime-tex. Native rtex supports a wider policy.
// Captured prose and a bounded math vocabulary enter the warmed engine.
export function splitPreamble(source) {
  const lines=source.split('\n'); let offset=0;
  for(const line of lines){
    let visible='';
    for(let i=0;i<line.length;i++){if(line[i]==='%'&&(i===0||line[i-1]!=='\\'))break;visible+=line[i]}
    const i=visible.indexOf('\\begin{document}');
    if(i>=0)return {preamble:source.slice(0,offset+i),bodyStart:offset+i+16};
    offset+=line.length+1;
  }return null;
}
const mathEnvironments=new Set('equation equation* align align* gather gather* multline multline* displaymath aligned gathered split cases matrix pmatrix bmatrix Bmatrix vmatrix Vmatrix smallmatrix'.split(' '));
// A bounded vocabulary keeps state-changing TeX out of the persistent worker.
export const liveCommands=new Set(('text textbf textit textrm textsf texttt emph mathrm mathit mathbf mathsf mathtt mathcal mathbb mathfrak mathnormal boldsymbol operatorname '+
 'frac dfrac tfrac cfrac binom dbinom tbinom sqrt sum prod coprod int iint iiint oint lim limsup liminf min max sup inf log ln exp sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh '+
 'alpha beta gamma delta epsilon varepsilon zeta eta theta vartheta iota kappa lambda mu nu xi pi varpi rho varrho sigma varsigma tau upsilon phi varphi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Upsilon Phi Psi Omega '+
 'infty partial nabla ell hbar imath jmath Re Im aleph emptyset varnothing forall exists neg in notin ni subset supset subseteq supseteq cup cap setminus land lor '+
 'cdot cdots ldots vdots ddots dots times div pm mp ast star circ bullet le leq ge geq neq ne approx sim simeq equiv propto cong to mapsto rightarrow leftarrow leftrightarrow Rightarrow Leftarrow Leftrightarrow implies iff '+
 'left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr langle rangle lbrace rbrace lvert rvert lVert rVert vert Vert floor lfloor rfloor lceil rceil '+
 'overline underline bar hat widehat tilde widetilde vec dot ddot overbrace underbrace overset underset stackrel limits nolimits displaystyle textstyle scriptstyle scriptscriptstyle quad qquad thinspace medspace thickspace negthinspace phantom hphantom vphantom smash nonumber notag').split(' '));
// Mandatory arguments. A command typed before its arguments would otherwise swallow the
// tokens that close the persistent engine's unit group.
export const liveArity=Object.assign(Object.create(null),{frac:2,dfrac:2,tfrac:2,cfrac:2,binom:2,dbinom:2,tbinom:2,overset:2,underset:2,stackrel:2});
for(const name of 'text textbf textit textrm textsf texttt emph mathrm mathit mathbf mathsf mathtt mathcal mathbb mathfrak mathnormal boldsymbol operatorname sqrt overline underline bar hat widehat tilde widetilde vec dot ddot overbrace underbrace phantom hphantom vphantom smash left right middle big Big bigg Bigg bigl bigr Bigl Bigr biggl biggr Biggl Biggr'.split(' '))liveArity[name]=1;
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
export function liveSourcePolicy(text){
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
      if(missingArgument(text,command,i+1))return {incomplete:true,reason:'Waiting for an argument'};
      if(['begin','end','label','ref','eqref','pageref','tag'].includes(command)){
        const arg=/^\s*(\*)?\s*\{([^{}]*)\}/.exec(text.slice(i+1));
        if(!arg)return {incomplete:true,reason:'Waiting for a command argument'};
        i+=arg[0].length;const name=arg[2];signature.push(command+(arg[1]||'')+':'+name);
        if(['label','ref','eqref','pageref'].includes(command)&&!/^[A-Za-z0-9:_.-]+$/.test(name))return {reason:'Complex label needs full layout'};
        if(command==='tag'&&!/^[A-Za-z0-9 .()+*/=-]+$/.test(name))return {reason:'Complex tag needs full layout'};
        if(command==='begin'){if(!mathEnvironments.has(name))return {reason:'Environment needs full layout'};stack.push(name);}
        if(command==='end'&&stack.pop()!==name)return {incomplete:true,reason:'Unbalanced environment'};
      }else if(command==='\\'){
        // A star changes page-break penalties even when every row has the same size.
        signature.push('rowbreak:'+(/^\s*\*?(?:\s*\[[^\]]*\])?/.exec(text.slice(i+1))?.[0]||'').replace(/\s+/g,''));
      }else if(command==='['||command==='(')stack.push(command);
      else if(command===']'||command===')'){if(stack.pop()!==(command===']'?'[':'('))return {incomplete:true,reason:'Unbalanced math delimiter'};}
      else if(command==='left')stack.push('left');
      else if(command==='right'){if(stack.pop()!=='left')return {incomplete:true,reason:'Unbalanced delimiters'};}
      else if(!liveCommands.has(command)&&!['{','}','$','%','&','#','_',',',';',':','!',' ','/','|'].includes(command)){
        if([...liveCommands].some(name=>name.startsWith(command)))return {incomplete:true,reason:'Waiting for a command'};
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
  const lines=offsets(source),bodyStart=splitPreamble(source)?.bodyStart??0,end=source.lastIndexOf('\\end{document}'),units=capture?.units||[];
  return units.map((unit,index)=>{
    const start=Math.max(lines[unit.begin_line-1],bodyStart),next=lines[units[index+1]?.begin_line-1];
    const limit=Math.min(lines[unit.end_line]??source.length,end>=0?end:source.length,next>start?next:source.length);
    const text=source.slice(start,limit).trimEnd();
    return {unit,start,end:start+text.length,original:text};
  }).filter(span=>Number.isInteger(span.start)&&span.end>span.start&&(!span.unit.file||sameFile(span.unit.file,root)));
}
export function findLiveEdit(before,after,capture,spans=captureSpans(before,capture)){
  if(before===after)return {unchanged:true,reason:'unchanged'};
  const a=splitPreamble(before),b=splitPreamble(after);
  if(!a||!b||a.preamble!==b.preamble)return {reason:'Preamble changed; rebuilding the engine'};
  if(/\\(?:def|gdef|edef|xdef|let|newcommand|renewcommand|newenvironment|newif|catcode|directlua|mathversion|pdfmapline|pdfmapfile|pdfextension)\b/.test(before))return {reason:'Custom setup needs a full document pass'};
  let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;
  let oldEnd=before.length,newEnd=after.length;
  while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}
  const delta=after.length-before.length,candidates=spans.filter(span=>start>=span.start&&oldEnd<=span.end);
  if(candidates.length!==1)return {reason:'This edit needs full-document layout'};
  const span=candidates[0],oldText=before.slice(span.start,span.end),source=after.slice(span.start,span.end+delta);
  if(/\n\s*\n/.test(source))return {reason:'Paragraph boundaries changed'};
  const oldPolicy=liveSourcePolicy(oldText),policy=liveSourcePolicy(source);
  if(!oldPolicy.ok)return {reason:oldPolicy.reason};
  if(!policy.ok)return policy;
  if(oldPolicy.signature!==policy.signature)return {reason:'Environment, label or reference changed'};
  return {unit:span.unit,span,source,start:span.start,end:span.end+delta};
}
export function acceptLiveEdit(state,edit,source){
  const delta=source.length-state.source.length,boundary=edit.span.end;
  for(const span of state.spans){
    if(span===edit.span)span.end+=delta;
    else if(span.start>=boundary){span.start+=delta;span.end+=delta;}
  }
  state.source=source;
}
export function safeProjectPath(path){
  const p=String(path).replaceAll('\\','/');
  if(!p||p.startsWith('/')||p.split('/').some(x=>x==='..'||x==='.'||!x)||/[\x00-\x1f:]/.test(p))throw Error('Unsafe project path');
  return p;
}
