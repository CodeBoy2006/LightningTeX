// Labels, references and other "points elsewhere" in source: exact offsets for jumping, renaming and counting.
// Comments and verbatim material are masked first, so a commented-out \ref never counts.
import {maskSource} from './outline.js';

export const REF_COMMANDS=['ref','eqref','pageref','autoref','nameref','cref','Cref','vref','Vref','cpageref','Cpageref','labelcref','namecref','nameCref','crefrange','Crefrange'];
const refPattern=new RegExp('\\\\('+REF_COMMANDS.join('|')+')\\*?\\s*\\{([^{}]*)\\}','g');
const labelPattern=/\\label\s*(?:\[[^\]]*\])?\s*\{([^{}]*)\}/g;

const lineIndex=text=>{const starts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')starts.push(i+1);return starts;};
const lineOf=(starts,offset)=>{let low=0,high=starts.length-1;while(low<high){const mid=(low+high+1)>>1;if(starts[mid]<=offset)low=mid;else high=mid-1;}return low+1;};
// Each comma-separated name inside {…}, with its own offsets. Spaces around names are not part of them.
function names(open,body){
  const out=[];let at=0;
  for(const part of body.split(',')){
    const lead=part.length-part.trimStart().length,name=part.trim();
    if(name)out.push({name,start:open+at+lead,end:open+at+lead+name.length});
    at+=part.length+1;
  }
  return out;
}
function scan(text,pattern,group,fixed){
  const masked=maskSource(text),starts=lineIndex(text),out=[];pattern.lastIndex=0;
  for(let match;(match=pattern.exec(masked));){
    const open=match.index+match[0].lastIndexOf('{')+1;
    for(const item of names(open,match[group]))out.push({...item,command:fixed||match[1],line:lineOf(starts,item.start),at:match.index});
  }
  return out;
}
/** files: Map<path,text>. -> [{name, file, start, end, line, command}] for every reference to a label. */
export function findReferences(files){
  const out=[];
  for(const [file,text] of files)if(typeof text==='string')for(const item of scan(text,refPattern,2))out.push({...item,file});
  return out;
}
/** -> [{name, file, start, end, line}] for every \label definition, offsets of the name itself. */
export function findLabels(files){
  const out=[];
  for(const [file,text] of files)if(typeof text==='string')for(const item of scan(text,labelPattern,1,'label'))out.push({...item,file});
  return out;
}
/** Map<label, count> of references, for the label view and hover cards. */
export function referenceCounts(files){
  const counts=new Map();
  for(const {name} of findReferences(files))counts.set(name,(counts.get(name)||0)+1);
  return counts;
}

/** What the source "points to" at offset: a label or reference name, a citation key, an \input or a graphic, or a macro.
 *  -> {kind:'ref'|'label'|'cite'|'input'|'graphics'|'macro', name, start, end, command} or null. */
export function targetAt(text,offset){
  const from=text.lastIndexOf('\n',offset-1)+1,to=text.indexOf('\n',offset)<0?text.length:text.indexOf('\n',offset);
  const line=text.slice(from,to),masked=maskSource(line),at=offset-from;
  const argument=/\\([A-Za-z]+)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}?/g;
  for(let match;(match=argument.exec(masked));){
    const open=match.index+match[0].indexOf('{')+1,close=open+match[2].length;
    if(at<match.index||at>close)continue;
    const command=match[1];
    let kind=REF_COMMANDS.includes(command)?'ref':command==='label'?'label':/cite/i.test(command)?'cite':command==='input'||command==='include'||command==='subfile'?'input':command==='includegraphics'?'graphics':command==='bibliography'||command==='addbibresource'?'bib':null;
    if(at<open){
      // On the command name itself: a project macro, or the argument for the commands above.
      if(!kind)return {kind:'macro',name:command,start:from+match.index,end:from+match.index+1+command.length,command};
    }
    if(!kind)continue;
    const parts=names(open,line.slice(open,close)),part=parts.find(item=>at>=item.start&&at<=item.end)||(at<open||['input','graphics','bib'].includes(kind)?parts[0]:null);
    if(!part)return null;
    return {kind,name:part.name,start:from+part.start,end:from+part.end,command};
  }
  const macro=/\\([A-Za-z@]+)/g;
  for(let match;(match=macro.exec(masked));)if(at>=match.index&&at<=match.index+match[0].length)return {kind:'macro',name:match[1],start:from+match.index,end:from+match.index+match[0].length,command:match[1]};
  return null;
}

/** Where a macro is defined: \newcommand, \renewcommand, \providecommand, \DeclareMathOperator, \def, \let. */
export function findDefinition(files,name){
  const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp('\\\\(?:(?:re|provide)?newcommand\\*?\\s*\\{?|DeclareMathOperator\\*?\\s*\\{?|[gex]?def\\s*|let\\s*)\\\\'+escaped+'(?![A-Za-z@])','g');
  for(const [file,text] of files){
    if(typeof text!=='string')continue;
    const masked=maskSource(text),match=pattern.exec(masked);pattern.lastIndex=0;
    if(match){const starts=lineIndex(text);return {file,start:match.index,end:match.index+match[0].length,line:lineOf(starts,match.index),text:text.slice(match.index,text.indexOf('\n',match.index)<0?text.length:text.indexOf('\n',match.index))};}
  }
  return null;
}

/** Levenshtein distance, capped for speed: anything above `limit` returns limit + 1. */
export function distance(a,b,limit=4){
  if(Math.abs(a.length-b.length)>limit)return limit+1;
  let previous=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const row=[i];let best=i;
    for(let j=1;j<=b.length;j++){row[j]=Math.min(previous[j]+1,row[j-1]+1,previous[j-1]+(a[i-1]===b[j-1]?0:1));best=Math.min(best,row[j]);}
    if(best>limit)return limit+1;previous=row;
  }
  return previous[b.length];
}
/** The candidates closest to name, best first. */
export function nearest(name,candidates,{limit=3,count=4}={}){
  const lower=name.toLowerCase();
  return [...new Set(candidates)].map(candidate=>{const other=candidate.toLowerCase();return {candidate,score:other.includes(lower)||lower.includes(other)?Math.min(1,distance(lower,other,limit)):distance(lower,other,limit)};})
    .filter(item=>item.score<=limit&&item.candidate!==name).sort((a,b)=>a.score-b.score||a.candidate.localeCompare(b.candidate)).slice(0,count).map(item=>item.candidate);
}
