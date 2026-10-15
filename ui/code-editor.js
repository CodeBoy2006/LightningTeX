// A native textarea (caret, selection, IME, undo) over a highlighted mirror of the same text.
// Both layers share one grid cell and identical metrics; the outer element is the only scroller.
import {tokenizeLine} from './highlight.js';
import {icon} from './icons.js';
import {matchBracket,environmentAt,unbalanced} from '../core/brackets.js';
import {SNIPPETS,expandSnippet,stopOrder,shiftStops} from './snippets.js';
const pairs={'{':'}','[':']','(':')','$':'$'},closers=new Set(Object.values(pairs));
const count=(text,needle)=>text.split(needle).length-1;

/** structure: highlight bracket pairs and the enclosing environment at the caret, and unbalanced ones after a pause. */
export function createCodeEditor({value='',settings,label='',describedBy,onChange,onCursor,onEscape,onQuickFix,structure=false}={}){
  const el=document.createElement('div');el.className='code';
  el.innerHTML='<div class="code-scroll"><div class="code-body"><div class="code-lines" aria-hidden="true"></div><textarea class="code-input" autocomplete="off" autocapitalize="off" autocorrect="off"></textarea></div></div>';
  const scroller=el.firstChild,body=scroller.firstChild,layer=body.firstChild,input=body.lastChild;
  input.setAttribute('aria-label',label);if(describedBy)input.setAttribute('aria-describedby',describedBy);
  const style=()=>document.defaultView.getComputedStyle(layer);
  let text=null,lines=[],states=[],nodes=[],starts=null,active=-1,markers=new Map(),diagnostics=[],options={...settings},flashTimer,editing=false,pinned=0;
  const lenses=Object.assign(document.createElement('div'),{className:'code-diagnostics'});body.append(lenses);
  // Decorations are boxes over the text, in content coordinates, grouped by owner so each can be replaced alone.
  const decor=Object.assign(document.createElement('div'),{className:'code-decor'});decor.setAttribute('aria-hidden','true');body.prepend(decor);
  const decorations=new Map();let decorFrame=0,idleTimer;
  // A snippet session: tab stops in text offsets, kept in step with every edit until the caret leaves them.
  let snippet=null;

  const lineNode=tokens=>{
    const node=document.createElement('div');node.className='cl';
    for(const [name,part] of tokens){
      if(!name){node.append(document.createTextNode(part));continue;}
      const span=document.createElement('span');span.className='t-'+name;span.textContent=part;node.append(span);
    }
    return node;
  };
  const decorate=(index,node=nodes[index])=>{
    if(!node)return;
    node.classList.toggle('active',index===active);
    const mark=markers.get(index);
    node.classList.toggle('mark-error',mark==='error');node.classList.toggle('mark-warning',mark==='warning');node.classList.toggle('mark-info',mark==='info');
  };
  // Re-tokenize only the changed lines, then onward until the carried state matches again.
  function render(next){
    nodes[active]?.classList.remove('active');active=-1;
    const max=Math.min(lines.length,next.length);let a=0,b=0;
    while(a<max&&lines[a]===next[a])a++;
    while(b<max-a&&lines[lines.length-1-b]===next[next.length-1-b])b++;
    const removed=lines.length-a-b,added=next.length-a-b,fresh=[],freshStates=[],before=nodes[a+removed]||null;
    let state=states[a]??'';
    for(let i=0;i<added;i++){freshStates.push(state);const result=tokenizeLine(next[a+i],state);fresh.push(lineNode(result.tokens));state=result.state;}
    for(let i=0;i<removed;i++)nodes[a+i].remove();
    for(const node of fresh)layer.insertBefore(node,before);
    nodes.splice(a,removed,...fresh);states.splice(a,removed,...freshStates);
    if(markers.size&&(removed||added)){
      const shifted=new Map();
      for(const [index,mark] of markers){if(index<a)shifted.set(index,mark);else if(index>=a+removed)shifted.set(index+added-removed,mark);}
      markers=shifted;
    }
    if(removed||added)diagnostics=diagnostics.flatMap(problem=>problem.line-1<a?[problem]:problem.line-1>=a+removed?[{...problem,line:problem.line+added-removed}]:[]);
    lines=next;starts=null;
    for(let i=a+added;i<lines.length&&states[i]!==state;i++){
      states[i]=state;const result=tokenizeLine(lines[i],state),node=lineNode(result.tokens);
      nodes[i].replaceWith(node);nodes[i]=node;state=result.state;
    }
    if(markers.size)for(let i=a;i<nodes.length;i++)decorate(i);
    el.style.setProperty('--digits',String(Math.max(2,String(lines.length).length)));
  }
  const lineStarts=()=>{
    if(!starts){starts=[0];let at=0;for(const line of lines){at+=line.length+1;starts.push(at);}}
    return starts;
  };
  const locate=offset=>{
    const table=lineStarts();let low=0,high=lines.length-1;
    while(low<high){const middle=(low+high+1)>>1;if(table[middle]<=offset)low=middle;else high=middle-1;}
    return {line:low,col:Math.max(0,offset-table[low])};
  };
  /** Caret box for a text offset in content coordinates (they scroll with the text), or null without layout. */
  function rectAt(offset){
    const {line,col}=locate(offset),node=nodes[line];
    if(!node||!body.getBoundingClientRect)return null;
    try{
      const origin=body.getBoundingClientRect(),range=document.createRange(),walker=document.createTreeWalker(node,4);
      let remaining=col,target=null,last=null,box=null,x=0;
      while(walker.nextNode()){last=walker.currentNode;if(remaining<last.data.length){target=last;break;}remaining-=last.data.length;}
      if(target){range.setStart(target,remaining);range.setEnd(target,remaining+1);box=range.getClientRects()[0];x=box?.left;}
      else if(last?.data.length){range.setStart(last,last.data.length-1);range.setEnd(last,last.data.length);const boxes=range.getClientRects();box=boxes[boxes.length-1];x=box?.right;}
      if(!box){box=node.getBoundingClientRect();x=box.left+parseFloat(style().paddingLeft||0);if(!box.height)return null;
        return {x:x-origin.left,top:box.top-origin.top,bottom:box.top-origin.top+parseFloat(style().lineHeight||box.height)};}
      return {x:x-origin.left,top:box.top-origin.top,bottom:box.bottom-origin.top};
    }catch{return null;}
  }
  // A DOM position for a text offset inside the mirror, or null for an empty line.
  function point(offset){
    const {line,col}=locate(offset),node=nodes[line];if(!node)return null;
    const walker=document.createTreeWalker(node,4);let remaining=col,last=null;
    while(walker.nextNode()){last=walker.currentNode;if(remaining<=last.data.length)return {node:last,offset:remaining};remaining-=last.data.length;}
    return last?{node:last,offset:last.data.length}:null;
  }
  /** Line boxes covering [start, end) in content coordinates. */
  function rangeRects(start,end){
    const a=point(start),b=point(Math.max(start,end));if(!a||!b||!body.getBoundingClientRect)return [];
    try{
      const range=document.createRange(),origin=body.getBoundingClientRect();range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
      return [...range.getClientRects()].filter(box=>box.width>0||start===end).map(box=>({x:box.left-origin.left,top:box.top-origin.top,width:box.width,height:box.height}));
    }catch{return [];}
  }
  function paintDecorations(){
    decorFrame=0;decor.replaceChildren();
    for(const list of decorations.values())for(const item of list){
      if(item.start>text.length||item.end>text.length)continue;
      for(const box of rangeRects(item.start,item.end)){
        const node=document.createElement('i');node.className='deco '+item.className;
        const wave=item.className.includes('deco-wave'),top=wave?box.top+box.height-3:box.top;
        const empty=item.start===item.end,width=empty&&item.className.includes('deco-stop')?7:Math.max(2,box.width);
        node.style.cssText=`left:${empty?box.x-1:box.x}px;top:${top}px;width:${width}px;height:${wave?3:box.height}px`;
        if(item.title)node.title=item.title;decor.append(node);
      }
    }
  }
  const queueDecorations=()=>{if(!decorFrame)decorFrame=(globalThis.requestAnimationFrame||setTimeout)(paintDecorations);};
  /** list: [{start, end, className}] replaces the group's decorations; an empty list removes them. */
  function setDecorations(group,list){if(list?.length)decorations.set(group,list);else decorations.delete(group);queueDecorations();}
  // Caret structure: the bracket pair it touches and the environment around it.
  function structureAtCaret(){
    if(!structure)return;
    const list=[],caret=input.selectionEnd;
    if(input.selectionStart===caret){
      const pair=matchBracket(text,caret);
      if(pair?.close!=null)list.push({start:pair.open,end:pair.open+1,className:'deco-pair'},{start:pair.close,end:pair.close+1,className:'deco-pair'});
      const environment=environmentAt(text,caret);
      if(environment&&environment.name!=='document')list.push({start:environment.begin.start,end:environment.begin.end,className:'deco-env'},{start:environment.end.start,end:environment.end.end,className:'deco-env'});
    }
    setDecorations('caret',list);
  }
  // Unbalanced structure waits for a pause, so a brace that is about to be closed is never flagged.
  function checkBalance(){
    clearTimeout(idleTimer);setDecorations('balance',[]);
    if(!structure)return;
    idleTimer=setTimeout(()=>setDecorations('balance',unbalanced(text).map(item=>({start:item.start,end:item.end,className:'deco-wave'}))),600);
  }
  function reveal(offset=input.selectionEnd,center=false){
    const box=rectAt(offset);if(!box)return;
    const pad=28,top=scroller.scrollTop,height=scroller.clientHeight;
    if(center)scroller.scrollTop=Math.max(0,box.top-height/3);
    else if(box.top<top+pad)scroller.scrollTop=Math.max(0,box.top-pad);
    else if(box.bottom>top+height-pad)scroller.scrollTop=box.bottom-height+pad;
    const left=scroller.scrollLeft,width=scroller.clientWidth,gutter=parseFloat(style().paddingLeft||0);
    if(box.x<left+gutter+8)scroller.scrollLeft=Math.max(0,box.x-gutter-48);
    else if(box.x>left+width-24)scroller.scrollLeft=box.x-width+72;
  }
  function cursor(){
    const offset=input.selectionEnd,{line,col}=locate(offset);
    if(line!==active){const previous=active;active=line;decorate(previous);decorate(line);}
    structureAtCaret();
    if(snippet&&!snippet.busy){
      // Leaving the snippet's stops ends the session; clicking into another stop moves to it.
      const at=input.selectionStart,to=input.selectionEnd,own=snippet.stops.find(stop=>stop.start<=at&&to<=stop.end&&stop.n);
      if(own&&own.n!==snippet.order[snippet.index]&&snippet.stops.find(stop=>stop.n===own.n)===own){syncMirrors();snippet.index=snippet.order.indexOf(own.n);paintSnippet();}
      else if(!own&&!(at===to&&snippet.stops.some(stop=>stop.start===at&&stop.end===at)))endSnippet();
    }
    onCursor?.({offset,line:line+1,col:col+1});
  }
  function sync(silent=false){
    const current=input.value;
    if(current!==text){const previous=text;text=current;if(snippet)followSnippet(previous,current);render(current.split('\n'));checkBalance();queueDecorations();if(!silent)onChange?.(current);}
    cursor();placeDiagnostics();
    el.dispatchEvent(new document.defaultView.Event('editor-change'));
  }
  function placeDiagnostics(){
    lenses.replaceChildren();
    const grouped=new Map();
    for(const problem of diagnostics){if(!nodes[problem.line-1])continue;const group=grouped.get(problem.line)||[];group.push(problem);grouped.set(problem.line,group);}
    for(const [line,problems] of grouped){
      const node=nodes[line-1],message=problems.map(problem=>problem.message).join('\n'),end=rectAt(lineStarts()[line-1]+lines[line-1].length);
      const gutter=document.createElement('button');gutter.type='button';gutter.className='diagnostic-gutter';gutter.dataset.tip=message;gutter.setAttribute('aria-label',message);gutter.style.top=node.offsetTop+'px';gutter.style.height=node.offsetHeight+'px';
      gutter.addEventListener('click',()=>{input.focus();input.setSelectionRange(lineStarts()[line-1],lineStarts()[line-1]);cursor();});lenses.append(gutter);
      // A line with a known fix gets a bulb in the gutter; it opens the same menu as Mod+.
      if(onQuickFix&&problems.some(problem=>problem.fixable)){
        const bulb=document.createElement('button');bulb.type='button';bulb.className='fix-bulb';bulb.innerHTML=icon('bulb',12);bulb.tabIndex=-1;bulb.style.top=node.offsetTop+'px';bulb.style.height=Math.min(node.offsetHeight,parseFloat(style().lineHeight)||node.offsetHeight)+'px';
        bulb.addEventListener('pointerdown',event=>event.preventDefault());
        bulb.addEventListener('click',event=>{event.stopPropagation();input.focus({preventScroll:true});input.setSelectionRange(lineStarts()[line-1],lineStarts()[line-1]);cursor();onQuickFix(line,bulb.getBoundingClientRect());});lenses.append(bulb);
      }
      const error=problems.find(problem=>problem.severity==='error');
      if(error&&end){const lens=document.createElement('span');lens.className='error-lens';lens.textContent=error.message;lens.dataset.tip=message;lens.style.top=end.top+'px';lens.style.left=end.x+20+'px';lenses.append(lens);}
    }
  }
  // execCommand keeps the edit on the native undo stack; setRangeText is the fallback (and jsdom).
  function edit(start,end,replacement,selectStart,selectEnd=selectStart){
    input.focus({preventScroll:true});
    input.setSelectionRange(start,end);
    let done=false;editing=true;
    try{done=replacement?document.execCommand?.('insertText',false,replacement):start===end||document.execCommand?.('delete');}catch{/* fall through */}
    editing=false;
    if(!done)input.setRangeText(replacement,start,end,'end');
    if(selectStart!=null)input.setSelectionRange(selectStart,selectEnd);
    sync();reveal();
  }
  const lineRange=(start,end)=>{
    const from=text.lastIndexOf('\n',start-1)+1;let to=text.indexOf('\n',end>start&&text[end-1]==='\n'?end-1:end);
    if(to<0)to=text.length;
    return [from,to];
  };
  function editLines(transform){
    const start=input.selectionStart,end=input.selectionEnd,[from,to]=lineRange(start,end),block=text.slice(from,to).split('\n');
    const changed=transform(block);
    const replacement=changed.join('\n'),first=changed[0].length-block[0].length,total=replacement.length-(to-from);
    edit(from,to,replacement,Math.max(from,start+first),Math.max(from,end+total));
  }
  function indent(outdent){
    const start=input.selectionStart,end=input.selectionEnd,unit=' '.repeat(options.tabSize);
    if(start===end&&!outdent){edit(start,end,unit);return;}
    const prefix=outdent&&new RegExp(`^(?: {1,${options.tabSize}}|\\t)`);
    editLines(block=>block.map(line=>outdent?line.replace(prefix,''):line?unit+line:line));
  }
  function toggleComment(){
    editLines(block=>{
      const filled=block.filter(line=>line.trim()),off=filled.length>0&&filled.every(line=>/^\s*%/.test(line));
      return block.map(line=>!line.trim()?line:off?line.replace(/^(\s*)% ?/,'$1'):line.replace(/^(\s*)/,'$1% '));
    });
  }
  function newline(){
    const start=input.selectionStart,end=input.selectionEnd,from=text.lastIndexOf('\n',start-1)+1,before=text.slice(from,start);
    const lead=/^[ \t]*/.exec(before)[0],unit=' '.repeat(options.tabSize);
    if(options.autoClose&&start===end){
      // A freshly opened block gets its closing line; the document body is not indented.
      const begin=/\\begin\{([^{}]+)\}(?:\[[^\]]*\]|\{[^{}]*\})*\s*$/.exec(before),display=/\\\[\s*$/.test(before);
      const open=begin?'\\begin{'+begin[1]+'}':'\\[',close=begin?'\\end{'+begin[1]+'}':'\\]';
      if((begin||display)&&count(text,open)>count(text,close)){
        const head='\n'+lead+(begin?.[1]==='document'?'':unit);
        edit(start,end,head+'\n'+lead+close,start+head.length);return;
      }
    }
    edit(start,end,'\n'+lead);
  }
  // ---- snippets ---------------------------------------------------------------------------------
  /** Replace [start, end) with a template; its first stop is selected and Tab moves on. */
  function insertSnippet(start,end,template){
    endSnippet();
    const from=text.lastIndexOf('\n',start-1)+1,indentText=/^[ \t]*/.exec(text.slice(from,start))[0];
    const {text:body,stops}=expandSnippet(template,{indent:indentText,unit:' '.repeat(options.tabSize)});
    edit(start,end,body);
    for(const stop of stops){stop.start+=start;stop.end+=start;}
    const order=stopOrder(stops);
    if(order.length<2){const last=stops.find(stop=>stop.n===0);select(last.start,last.end);return;}
    snippet={stops,order,index:0,busy:false};goStop(0);
  }
  function followSnippet(previous,next){
    let head=0;const max=Math.min(previous.length,next.length);
    while(head<max&&previous[head]===next[head])head++;
    let tail=0;while(tail<max-head&&previous[previous.length-1-tail]===next[next.length-1-tail])tail++;
    const current=snippet.stops.find(stop=>stop.n===snippet.order[snippet.index]);
    if(!shiftStops(snippet.stops,head,previous.length-head-tail,next.length-head-tail,snippet.editing||current))snippet=null,setDecorations('snippet',[]);
  }
  function paintSnippet(){
    if(!snippet){setDecorations('snippet',[]);return;}
    const current=snippet.order[snippet.index];
    setDecorations('snippet',snippet.stops.filter(stop=>stop.n).map(stop=>({start:stop.start,end:stop.end,className:'deco-stop'+(stop.n===current?' on':'')})));
  }
  // Mirrors of the current stop take its text, as one edit per mirror (each undoable).
  function syncMirrors(){
    if(!snippet)return;
    const n=snippet.order[snippet.index],[first,...mirrors]=snippet.stops.filter(stop=>stop.n===n);if(!first)return;
    const value=text.slice(first.start,first.end);let from=input.selectionStart,to=input.selectionEnd;snippet.busy=true;
    try{for(const mirror of mirrors)if(text.slice(mirror.start,mirror.end)!==value){
      const delta=value.length-(mirror.end-mirror.start);if(mirror.end<=from){from+=delta;to+=delta;}
      snippet.editing=mirror;edit(mirror.start,mirror.end,value);if(!snippet)return;snippet.editing=null;
    }}
    finally{if(snippet)snippet.busy=false;}
    // The caret stays where it was; only the mirrors changed.
    if(mirrors.length){input.setSelectionRange(from,to);reveal(to);}
  }
  function goStop(index){
    if(!snippet)return;
    syncMirrors();if(!snippet)return;
    snippet.index=Math.max(0,Math.min(snippet.order.length-1,index));
    const n=snippet.order[snippet.index],stop=snippet.stops.find(item=>item.n===n);
    snippet.busy=true;select(stop.start,stop.end,{center:false});snippet.busy=false;
    if(n===0)endSnippet();else paintSnippet();
  }
  function endSnippet(){if(!snippet)return;const ending=snippet;snippet.busy=true;syncMirrors();if(snippet===ending)snippet=null;setDecorations('snippet',[]);}
  /** A snippet word alone on its line before the caret: fig, tab, … */
  function snippetWord(){
    const caret=input.selectionStart;if(caret!==input.selectionEnd)return null;
    const word=/^[ \t]*([a-z]+)$/.exec(text.slice(text.lastIndexOf('\n',caret-1)+1,caret));
    return word&&SNIPPETS[word[1]]?{name:word[1],start:caret-word[1].length,end:caret}:null;
  }

  // ---- line editing -----------------------------------------------------------------------------
  function moveLines(direction){
    const start=input.selectionStart,end=input.selectionEnd,[from,to]=lineRange(start,end),block=text.slice(from,to);
    if(direction<0){
      if(!from)return;
      const above=text.lastIndexOf('\n',from-2)+1,line=text.slice(above,from-1),shift=from-above;
      edit(above,to,block+'\n'+line,start-shift,end-shift);
    }else{
      if(to>=text.length)return;
      let below=text.indexOf('\n',to+1);if(below<0)below=text.length;
      const line=text.slice(to+1,below),shift=line.length+1;
      edit(from,below,line+'\n'+block,start+shift,end+shift);
    }
  }
  function duplicateLines(direction){
    const start=input.selectionStart,end=input.selectionEnd,[from,to]=lineRange(start,end),block=text.slice(from,to),shift=direction>0?block.length+1:0;
    edit(to,to,'\n'+block,start+shift,end+shift);
  }
  function deleteLines(){
    const start=input.selectionStart,end=input.selectionEnd,[from,to]=lineRange(start,end);
    const [a,b]=to<text.length?[from,to+1]:[Math.max(0,from-1),to],col=start-from,next=text.slice(b,text.indexOf('\n',b)<0?text.length:text.indexOf('\n',b));
    const caret=a+(to<text.length?Math.min(col,next.length):0);
    edit(a,b,'',caret);
  }
  // Each press of Mod+L takes one more whole line.
  function selectLines(){
    const start=input.selectionStart,end=input.selectionEnd,whole=start!==end&&(start===0||text[start-1]==='\n')&&text[end-1]==='\n';
    const [from,to]=whole?[start,(text.indexOf('\n',end)<0?text.length:text.indexOf('\n',end)+1)]:(([a,b])=>[a,Math.min(text.length,b+1)])(lineRange(start,end));
    input.setSelectionRange(from,to);cursor();reveal(to);
  }
  // A textarea has one selection, so Mod+D selects the word at the caret, then jumps to its next occurrence.
  function selectNext(){
    const start=input.selectionStart,end=input.selectionEnd;
    if(start===end){
      const word=/[\\]?[\p{L}\p{N}_@]+$/u.exec(text.slice(0,start))?.[0]||'',after=/^[\p{L}\p{N}_@]*/u.exec(text.slice(start))[0];
      if(word||after){input.setSelectionRange(start-word.length,start+after.length);cursor();}
      return;
    }
    const needle=text.slice(start,end);let at=text.indexOf(needle,end);if(at<0)at=text.indexOf(needle);
    if(at>=0&&at!==start){input.setSelectionRange(at,at+needle.length);cursor();reveal(at+needle.length,true);}
  }
  function keydown(event){
    if(event.isComposing||event.keyCode===229)return;
    const start=input.selectionStart,end=input.selectionEnd,mod=event.ctrlKey||event.metaKey,key=event.key;
    if(snippet&&!mod&&!event.altKey){
      if(key==='Tab'){event.preventDefault();goStop(snippet.index+(event.shiftKey?-1:1));return;}
      if(key==='Escape'){event.preventDefault();event.stopPropagation();endSnippet();return;}
    }
    if(key==='Tab'&&!mod&&!event.altKey&&!event.shiftKey){const word=snippetWord();if(word){event.preventDefault();insertSnippet(word.start,word.end,SNIPPETS[word.name]);return;}}
    if((key==='ArrowUp'||key==='ArrowDown')&&event.altKey&&!mod){event.preventDefault();(event.shiftKey?duplicateLines:moveLines)(key==='ArrowUp'?-1:1);return;}
    if(mod&&!event.altKey){
      const letter=key.toLowerCase();
      if(letter==='k'&&event.shiftKey){event.preventDefault();deleteLines();return;}
      if(letter==='l'&&!event.shiftKey){event.preventDefault();selectLines();return;}
      if(letter==='d'&&!event.shiftKey){event.preventDefault();selectNext();return;}
    }
    if(key==='Escape'){if(onEscape?.()!==false)event.preventDefault();return;}
    if(key==='Tab'&&!mod&&!event.altKey){event.preventDefault();indent(event.shiftKey);return;}
    if(key==='Enter'&&!mod&&!event.altKey&&!event.shiftKey){event.preventDefault();newline();return;}
    if(key==='/'&&mod){event.preventDefault();toggleComment();return;}
    // Deleting the opener of an empty pair takes its closer along.
    if(options.autoClose&&key==='Backspace'&&!mod&&!event.altKey&&start===end&&start>0&&pairs[text[start-1]]===text[end]&&text[start-2]!=='\\'){event.preventDefault();edit(start-1,start+1,'',start-1);}
  }
  // Bracket pairing reads typed characters from beforeinput, which also covers virtual keyboards.
  function beforeInput(event){
    if(editing||!options.autoClose||event.inputType!=='insertText'||event.isComposing||event.data?.length!==1)return;
    const start=input.selectionStart,end=input.selectionEnd,key=event.data,next=text[end],previous=text[start-1];
    // A selection after a backslash becomes \( … \) or \[ … \].
    if(previous==='\\'&&start!==end&&(key==='('||key==='[')){event.preventDefault();edit(start,end,key+text.slice(start,end)+'\\'+pairs[key],start+1,end+1);return;}
    if(previous==='\\')return;
    if(start!==end){
      if(pairs[key]){event.preventDefault();edit(start,end,key+text.slice(start,end)+pairs[key],start+1,end+1);}
      return;
    }
    if(closers.has(key)&&next===key){event.preventDefault();input.setSelectionRange(start+1,start+1);cursor();return;}
    if(!pairs[key]||(next&&!/[\s)\]}$,.;:]/.test(next)))return;
    if(key==='$'){
      // An odd number of `$` earlier in the paragraph means this one closes a formula.
      const paragraph=text.slice(Math.max(text.lastIndexOf('\n\n',start-1),0),start);
      if(count(paragraph.replace(/\\./g,''),'$')%2)return;
    }
    event.preventDefault();edit(start,end,key+pairs[key],start+1);
  }
  const selectionChanged=()=>{if(document.activeElement===input){cursor();reveal();}};
  const listeners=[[input,'input',()=>{sync();reveal();}],[input,'keydown',keydown],[input,'beforeinput',beforeInput],[input,'keyup',cursor],[input,'click',cursor],[input,'focus',cursor],
    // The textarea must never scroll on its own, or the layers drift apart.
    [input,'scroll',()=>{if(input.scrollTop)input.scrollTop=0;if(input.scrollLeft)input.scrollLeft=0;}],[document,'selectionchange',selectionChanged],
    [scroller,'scroll',()=>{if(scroller.scrollLeft!==pinned){pinned=scroller.scrollLeft;layer.style.setProperty('--scroll-x',pinned+'px');}}]];
  for(const [target,type,handler] of listeners)target.addEventListener(type,handler);

  function configure(next){
    options={...options,...next};
    el.dataset.wrap=String(!!options.wrap);input.wrap=options.wrap?'soft':'off';input.spellcheck=!!options.spellcheck;
    el.style.setProperty('--code-size',options.fontSize+'px');el.style.setProperty('--tab',String(options.tabSize));
    placeDiagnostics();queueDecorations();
  }
  function offsetAtPoint(x,y){
    // Temporarily hit-test the text mirror; the transparent textarea normally owns the pointer.
    input.style.pointerEvents='none';layer.style.pointerEvents='auto';
    let node,offset;
    try{const point=document.caretPositionFromPoint?.(x,y),range=!point&&document.caretRangeFromPoint?.(x,y);node=point?.offsetNode||range?.startContainer;offset=point?.offset??range?.startOffset;}
    finally{input.style.pointerEvents='';layer.style.pointerEvents='';}
    const row=node?.nodeType===3?node.parentElement.closest('.cl'):node?.closest?.('.cl'),line=nodes.indexOf(row);
    if(line<0)return input.selectionEnd;
    const range=document.createRange();range.selectNodeContents(row);range.setEnd(node,offset);return lineStarts()[line]+range.toString().length;
  }
  function select(start,end=start,{center=true}={}){input.focus({preventScroll:true});input.setSelectionRange(start,end);cursor();reveal(end,center);}
  configure({});input.value=value;sync(true);
  return {
    el,input,body,scroller,rectAt,rangeRects,configure,edit,offsetAtPoint,setDecorations,
    /** 1-based line at a content y coordinate (for the line at the top of the view, pass scrollTop). */
    lineAtY(y){let low=0,high=nodes.length-1;while(low<high){const middle=(low+high+1)>>1;if(nodes[middle].offsetTop<=y)low=middle;else high=middle-1;}return low+1;},
    getValue:()=>text,
    setValue(next){input.value=next;sync(true);},
    focus(){input.focus({preventScroll:true});placeDiagnostics();},
    get caret(){return input.selectionEnd;},
    get lineHeight(){return parseFloat(style().lineHeight)||20;},
    get gutter(){return parseFloat(style().paddingLeft)||0;},
    offsetOf:(line,col=1)=>Math.min(lineStarts()[Math.min(lines.length-1,Math.max(0,line-1))]+col-1,text.length),
    select,insertSnippet,
    flash(line){
      const node=nodes[line-1];if(!node)return;
      clearTimeout(flashTimer);for(const other of layer.querySelectorAll('.flash'))other.classList.remove('flash');
      node.classList.add('flash');flashTimer=setTimeout(()=>node.classList.remove('flash'),1100);
    },
    /** marks: Map of 1-based line -> 'error' | 'warning' | 'info' */
    setMarkers(marks){
      const previous=markers;markers=new Map([...marks].map(([line,mark])=>[line-1,mark]));
      for(const index of new Set([...previous.keys(),...markers.keys()]))decorate(index);
    },
    setDiagnostics(problems){diagnostics=problems;placeDiagnostics();},
    /** The problems on a 1-based line, with lines kept in step with edits since they were set. */
    diagnosticsAt:line=>diagnostics.filter(problem=>problem.line===line),
    destroy(){snippet=null;clearTimeout(flashTimer);clearTimeout(idleTimer);if(decorFrame)(globalThis.cancelAnimationFrame||clearTimeout)(decorFrame);for(const [target,type,handler] of listeners)target.removeEventListener(type,handler);el.remove();},
  };
}
