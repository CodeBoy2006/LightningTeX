import {maskSource,plainText} from './outline.js';
import {skipArgument} from './document.js';
import {mathEnvironments} from './math-preview.js';
const environments=[...mathEnvironments].map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
const mathBlocks=new RegExp('\\\\begin\\{('+environments+')\\}[\\s\\S]*?(?:\\\\end\\{\\1\\}|$)','g');

/** Approximate prose words: CJK characters count individually; other scripts count word runs. */
export function wordCount(source){
  let text=maskSource(source),body=text.indexOf('\\begin{document}');if(body>=0)text=text.slice(body+16);
  const end=text.indexOf('\\end{document}');if(end>=0)text=text.slice(0,end);
  text=text.replace(mathBlocks,' ');
  text=text.replace(/\\\[[\s\S]*?(?:\\\]|$)|\\\([\s\S]*?(?:\\\)|$)|(?<!\\)\$\$[\s\S]*?(?:\$\$|$)|(?<!\\)\$[^$]*?(?:(?<!\\)\$|$)/g,' ');
  const commands=/\\(label|ref|eqref|pageref|cite\w*|input|include|includegraphics|bibliography|bibliographystyle|begin|end|documentclass|usepackage|title|author|date|newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*(?:\[[^\]]*\]\s*)*(?=\{)/g;
  let result='',at=0;
  for(let match;(match=commands.exec(text));){
    let stop=skipArgument(text,commands.lastIndex);if(stop<0)continue;
    if(/command|Operator/.test(match[1])){const options=/^\s*(?:\[[^\]]*\]\s*)*/.exec(text.slice(stop))[0];const body=skipArgument(text,stop+options.length);if(body>0)stop=body;}
    result+=text.slice(at,match.index)+' ';at=stop;commands.lastIndex=stop;
  }
  result+=text.slice(at);const prose=plainText(result),cjk=/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
  return [...prose.matchAll(cjk)].length+(prose.replace(cjk,' ').match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)||[]).length;
}
