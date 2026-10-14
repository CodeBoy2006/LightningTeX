// Source-level structure for navigation. TeX macros and custom section numbering are not expanded.
import {skipArgument} from './document.js';
const DEPTH={part:0,chapter:1,section:2,subsection:3,subsubsection:4,paragraph:5,subparagraph:6};

/** Hide comments and verbatim material without changing offsets or line numbers. */
export function maskSource(source){
  return source.replace(/\\begin\{(verbatim\*?|lstlisting|minted|comment)\}[\s\S]*?(?:\\end\{\1\}|$)|\\verb\*?([^\w\s])[^\n]*?\2|\\(?:[^A-Za-z]|[A-Za-z]+)|%[^\n]*/g,match=>match[0]==='%'||/^\\begin\{|^\\verb[^A-Za-z]/.test(match)?match.replace(/[^\n]/g,' '):match);
}
export function plainText(tex){
  return tex.replace(/\\((?:La)?TeX)(?![A-Za-z])/g,'$1').replace(/\\(?:[A-Za-z]+\*?|[^])/g,match=>match==='\\\\'?' ':/^\\[^A-Za-z]$/.test(match)&&match!=='\\,'?match[1]:'')
    .replace(/[{}$]/g,'').replace(/~/g,' ').replace(/\s+/g,' ').trim();
}
export function documentTitle(source){
  const text=maskSource(source),match=/\\title\s*(?:\[[^\]]*\])?\s*(?=\{)/.exec(text);
  if(!match)return '';
  const open=match.index+match[0].length,end=skipArgument(text,open);
  return end<0?'':plainText(text.slice(open+1,end-1)).slice(0,80);
}
/** files: Map<path,text>. Headings/labels have 1-based lines and source offsets. */
export function parseOutline(files,root){
  const headings=[],labels=[],seen=new Set();
  const walk=path=>{
    const source=files.get(path);if(typeof source!=='string'||seen.has(path))return;seen.add(path);
    const text=maskSource(source),environments=[],command=/\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph|input|include|label|begin|end)(\*?)\s*(?:\[[^\]]*\])?\s*(?=\{)/g;
    let line=1,last=0;
    for(let match;(match=command.exec(text));){
      line+=text.slice(last,match.index).split('\n').length-1;last=match.index;
      const open=command.lastIndex,end=skipArgument(text,open);if(end<0)continue;
      const argument=text.slice(open+1,end-1).trim(),name=match[1];command.lastIndex=end;
      if(name==='begin')environments.push(argument);
      else if(name==='end'){const at=environments.lastIndexOf(argument);if(at>=0)environments.length=at;}
      else if(name==='input'||name==='include'){
        const target=argument.replace(/^\.\//,''),found=[target,target+'.tex'].find(candidate=>files.has(candidate));if(found)walk(found);
      }else if(name==='label'){
        const kind=environments.findLast(environment=>environment!=='document')||'section',heading=headings.at(-1);
        labels.push({name:argument,kind:kind.replace(/\*$/,''),file:path,line,offset:match.index,text:kind==='section'?heading?.title||'':plainText(text.slice(end,text.indexOf('\n',end)<0?text.length:text.indexOf('\n',end))).slice(0,72)});
        if(kind==='section')heading?.labels.push(argument);
      }else headings.push({depth:DEPTH[name],starred:!!match[2]||name==='part'||name==='paragraph'||name==='subparagraph',title:plainText(argument)||name,file:path,line,offset:match.index,labels:[]});
    }
  };
  walk(root);
  const base=Math.min(...headings.filter(heading=>heading.depth>0).map(heading=>heading.depth),5),parts=headings.some(heading=>!heading.depth)?1:0,counters=Array(7).fill(0);
  for(const heading of headings){
    const {depth,starred}=heading;if(!starred){counters[depth]++;counters.fill(0,depth+1);}
    heading.number=starred?'':counters.slice(base,depth+1).join('.');heading.level=depth?Math.max(0,depth-base)+parts:0;
    delete heading.depth;delete heading.starred;
  }
  return {headings,labels,paths:[...seen]};
}
