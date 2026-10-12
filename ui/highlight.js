// Line tokenizer for the source overlay. `state` carries open math or verbatim across lines:
// '' | '$' | '$$' | '[' | '(' | 'e:<env>' (math environment) | 'v:<env>' (verbatim).
import {mathEnvironments} from '../core/math-preview.js';
const verbatim=new Set(['verbatim','verbatim*','lstlisting','minted','comment']);
const sectioning=new Set('part chapter section subsection subsubsection paragraph subparagraph title author date maketitle tableofcontents appendix'.split(' '));
const command=/\\(?:([A-Za-z@]+)\*?|[^])?/y,environment=/\s*\{([^{}\s]*)\}/y;

/** -> {tokens:[[className,text],…], state} ; className '' is plain text. */
export function tokenizeLine(text,state=''){
  const tokens=[];let i=0,plain=0,math=state;
  const flush=to=>{if(to>plain)tokens.push([math?'math':'',text.slice(plain,to)]);};
  const add=(name,length)=>{flush(i);tokens.push([name,text.slice(i,i+length)]);i+=length;plain=i;};
  if(state.startsWith('v:')){
    const end=text.indexOf('\\end{'+state.slice(2)+'}');
    if(end<0)return {tokens:text?[['verb',text]]:[],state};
    if(end)tokens.push(['verb',text.slice(0,end)]);
    i=plain=end;math='';
  }
  while(i<text.length){
    const c=text[i];
    if(c==='%'){add('com',text.length-i);break;}
    if(c==='\\'){
      command.lastIndex=i;const match=command.exec(text),name=match[1];
      if(name==='begin'||name==='end'){
        add('kw',match[0].length);
        environment.lastIndex=i;const arg=environment.exec(text);
        if(!arg)continue;
        const env=arg[1],lead=arg[0].indexOf('{');
        if(lead)add('',lead);
        add('br',1);if(env)add('env',env.length);add('br',1);
        if(name==='begin'){
          if(verbatim.has(env)){if(i<text.length)tokens.push(['verb',text.slice(i)]);return {tokens,state:'v:'+env};}
          if(!math&&mathEnvironments.has(env))math='e:'+env;
        }else if(math==='e:'+env)math='';
        continue;
      }
      if(name){add(sectioning.has(name)?'sec':math?'mcmd':'cmd',match[0].length);continue;}
      const symbol=text[i+1];
      if(symbol==='['||symbol==='('){add('mdel',2);if(!math)math=symbol;}
      else if(symbol===']'||symbol===')'){const opener=symbol===']'?'[':'(';flush(i);if(math===opener)math='';plain=i;add('mdel',2);}
      else add(math?'mcmd':'cmd',match[0].length);
      continue;
    }
    if(c==='$'){
      const double=text[i+1]==='$';
      if(!math){add('mdel',double?2:1);math=double?'$$':'$';}
      else if(math==='$'){flush(i);math='';plain=i;add('mdel',1);}
      else if(math==='$$'&&double){flush(i);math='';plain=i;add('mdel',2);}
      else i++; // `$` of nested text inside display math
      continue;
    }
    if(c==='{'||c==='}'){add('br',1);continue;}
    if(c==='&'){add('op',1);continue;}
    i++;
  }
  flush(text.length);
  // Inline math cannot cross a paragraph break.
  if(!text.trim()&&(math==='$'||math==='('))math='';
  return {tokens,state:math};
}
