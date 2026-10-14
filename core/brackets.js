// Bracket and environment structure around the caret, for highlighting in the source editor.
// Comments and verbatim material are masked; escaped braces (\{ \}) never pair.
import {maskSource} from './outline.js';

const OPEN={'{':'}','[':']','(':')'},CLOSE={'}':'{',']':'[',')':'('};
const WINDOW=40000;
const escaped=(text,i)=>{let n=0;while(i-1-n>=0&&text[i-1-n]==='\\')n++;return n%2===1;};

/** The bracket touching offset (just before or after it) and its partner: {open, close} offsets, or null.
 *  The partner search stays within WINDOW characters and does not cross a blank line for [ ] and ( ). */
export function matchBracket(source,offset){
  const from=Math.max(0,offset-WINDOW),text=maskSource(source.slice(from,offset+WINDOW)),at=offset-from;
  for(const i of [at-1,at]){
    const c=text[i];if(!(c in OPEN||c in CLOSE)||escaped(text,i))continue;
    const forward=c in OPEN,want=forward?OPEN[c]:CLOSE[c],brace=c==='{'||c==='}';let depth=0;
    for(let j=i+(forward?1:-1);j>=0&&j<text.length;j+=forward?1:-1){
      const d=text[j];
      if(!brace&&d==='\n'&&/^\s*$/.test(forward?text.slice(j+1,text.indexOf('\n',j+1)>>>0):text.slice(text.lastIndexOf('\n',j-1)+1,j)))break;
      if(escaped(text,j))continue;
      if(d===c)depth++;
      else if(d===want){if(depth)depth--;else return forward?{open:from+i,close:from+j}:{open:from+j,close:from+i};}
    }
    return {open:from+i,close:null,unmatched:true};
  }
  return null;
}

/** The innermost \begin{name}…\end{name} around offset: {name, begin:{start,end}, end:{start,end}} with
 *  start/end the offsets of the name inside each pair of braces, plus outer {from, to}; or null. */
export function environmentAt(source,offset){
  const from=Math.max(0,offset-WINDOW),to=Math.min(source.length,offset+WINDOW),text=maskSource(source.slice(from,to)),at=offset-from;
  const pattern=/\\(begin|end)\s*\{([^{}\s]+)\}/g,stack=[],pairs=[];
  for(let match;(match=pattern.exec(text));){
    const nameStart=match.index+match[0].indexOf('{')+1,item={name:match[2],start:from+nameStart,end:from+nameStart+match[2].length,at:from+match.index,stop:from+match.index+match[0].length};
    if(match[1]==='begin')stack.push(item);
    else{const index=stack.findLastIndex(open=>open.name===item.name);if(index>=0){const open=stack[index];stack.length=index;pairs.push({open,close:item});}}
  }
  let best=null;
  for(const {open,close} of pairs)if(open.at<=offset&&close.stop>=offset&&(!best||open.at>=best.open.at))best={open,close};
  if(!best)return null;
  return {name:best.open.name,begin:{start:best.open.start,end:best.open.end},end:{start:best.close.start,end:best.close.end},from:best.open.at,to:best.close.stop};
}

/** Every unbalanced brace and environment in source: [{start, end, kind:'brace'|'environment', name?}].
 *  An unclosed opener is reported where it opens; a stray closer where it stands. */
export function unbalanced(source){
  const text=maskSource(source),out=[],braces=[],environments=[];
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='\\'){
      const match=/^\\(begin|end)\s*\{([^{}\s]+)\}/.exec(text.slice(i,i+120));
      if(match){
        const item={start:i,end:i+match[0].length,kind:'environment',name:match[2]};
        if(match[1]==='begin')environments.push(item);
        else{const index=environments.findLastIndex(open=>open.name===match[2]);if(index<0)out.push(item);else{out.push(...environments.slice(index+1));environments.length=index;}}
        // The braces of \begin{…}/\end{…} are balanced by construction; skip past the name.
        i+=match[0].length-1;continue;
      }
      i++;continue;
    }
    if(c==='{')braces.push(i);
    else if(c==='}'){if(braces.length)braces.pop();else out.push({start:i,end:i+1,kind:'brace'});}
  }
  for(const start of braces)out.push({start,end:start+1,kind:'brace'});
  out.push(...environments);
  return out.sort((a,b)=>a.start-b.start);
}
