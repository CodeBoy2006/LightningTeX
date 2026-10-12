// A native textarea (caret, selection, IME, undo) over a highlighted mirror of the same text.
// Both layers share one grid cell and identical metrics; the outer element is the only scroller.
import {tokenizeLine} from './highlight.js';
const pairs={'{':'}','[':']','(':')','$':'$'},closers=new Set(Object.values(pairs));
const count=(text,needle)=>text.split(needle).length-1;

export function createCodeEditor({value='',settings,label='',describedBy,onChange,onCursor,onEscape}={}){
  const el=document.createElement('div');el.className='code';
  el.innerHTML='<div class="code-scroll"><div class="code-body"><div class="code-lines" aria-hidden="true"></div><textarea class="code-input" autocomplete="off" autocapitalize="off" autocorrect="off"></textarea></div></div>';
  const scroller=el.firstChild,body=scroller.firstChild,layer=body.firstChild,input=body.lastChild;
  input.setAttribute('aria-label',label);if(describedBy)input.setAttribute('aria-describedby',describedBy);
  const style=()=>document.defaultView.getComputedStyle(layer);
  let text=null,lines=[],states=[],nodes=[],starts=null,active=-1,markers=new Map(),options={...settings},flashTimer,editing=false,pinned=0;

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
    onCursor?.({offset,start:input.selectionStart,line:line+1,col:col+1,length:text.length});
  }
  function sync(silent=false){
    const current=input.value;
    if(current!==text){text=current;render(current.split('\n'));if(!silent)onChange?.(current);}
    cursor();
  }
  // execCommand keeps the edit on the native undo stack; setRangeText is the fallback (and jsdom).
  function edit(start,end,replacement,selectStart,selectEnd=selectStart){
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
  function indent(outdent){
    const start=input.selectionStart,end=input.selectionEnd,unit=' '.repeat(options.tabSize);
    if(start===end&&!outdent){edit(start,end,unit);return;}
    const [from,to]=lineRange(start,end),block=text.slice(from,to).split('\n');
    const changed=block.map(line=>outdent?line.replace(new RegExp(`^(?: {1,${options.tabSize}}|\\t)`),''):line?unit+line:line);
    const first=changed[0].length-block[0].length,total=changed.join('\n').length-(to-from);
    edit(from,to,changed.join('\n'),Math.max(from,start+first),Math.max(from,end+total));
  }
  function toggleComment(){
    const start=input.selectionStart,end=input.selectionEnd,[from,to]=lineRange(start,end),block=text.slice(from,to).split('\n');
    const filled=block.filter(line=>line.trim()),off=filled.length>0&&filled.every(line=>/^\s*%/.test(line));
    const changed=block.map(line=>!line.trim()?line:off?line.replace(/^(\s*)% ?/,'$1'):line.replace(/^(\s*)/,'$1% '));
    const first=changed[0].length-block[0].length,total=changed.join('\n').length-(to-from);
    edit(from,to,changed.join('\n'),Math.max(from,start+first),Math.max(from,end+total));
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
  function keydown(event){
    if(event.isComposing||event.keyCode===229)return;
    const start=input.selectionStart,end=input.selectionEnd,mod=event.ctrlKey||event.metaKey,key=event.key;
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
  }
  configure({});input.value=value;sync(true);
  return {
    el,input,body,scroller,rectAt,reveal,configure,
    getValue:()=>text,
    setValue(next){input.value=next;sync(true);},
    focus(){input.focus({preventScroll:true});},
    get caret(){return input.selectionEnd;},
    get lineHeight(){return parseFloat(style().lineHeight)||20;},
    get gutter(){return parseFloat(style().paddingLeft)||0;},
    offsetOf:(line,col=1)=>Math.min(lineStarts()[Math.min(lines.length-1,Math.max(0,line-1))]+col-1,text.length),
    select(start,end=start,{center=true}={}){input.focus({preventScroll:true});input.setSelectionRange(start,end);cursor();reveal(end,center);},
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
    destroy(){clearTimeout(flashTimer);for(const [target,type,handler] of listeners)target.removeEventListener(type,handler);el.remove();},
  };
}
