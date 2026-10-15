/* BibTeX in JavaScript: reads the citations from .aux, the entries from .bib files and runs any .bst style,
   producing the .bbl LaTeX reads on its next pass. Follows bibtex.web for the style language, name formatting,
   case changing and purification. Classic script: defines self.runBibtex. */
(function(){
'use strict';
const ENTRY_MAX=250,GLOBAL_MAX=20000,MAX_LINE=79;
const MISSING={missing:true};
class BstError extends Error{}

// ---- characters -------------------------------------------------------------------------------
const white=c=>c===' '||c==='\t'||c==='\n'||c==='\r';
const alpha=c=>/[A-Za-z]/.test(c);
const alnum=c=>/[A-Za-z0-9]/.test(c);
// Control sequences that stand for letters: they keep their letters in purify$ and change case in change.case$.
const LETTER_CS={i:'i',j:'j',oe:'oe',OE:'OE',ae:'ae',AE:'AE',aa:'aa',AA:'AA',o:'o',O:'O',l:'l',L:'L',ss:'ss'};
const WIDTHS={' ':278,'!':278,'"':500,'#':833,'$':500,'%':833,'&':778,"'":278,'(':389,')':389,'*':500,'+':778,',':278,'-':333,'.':278,'/':500,
  ':':278,';':278,'<':278,'=':778,'>':472,'?':472,'@':778,'[':278,'\\':500,']':278,'^':500,'_':500,'`':278,'{':500,'|':1000,'}':500,'~':500,
  A:750,B:708,C:722,D:764,E:681,F:653,G:785,H:750,I:361,J:514,K:778,L:625,M:917,N:750,O:778,P:681,Q:778,R:736,S:556,T:722,U:750,V:750,W:1028,X:750,Y:750,Z:611,
  a:500,b:556,c:444,d:556,e:444,f:306,g:500,h:556,i:278,j:306,k:528,l:278,m:833,n:556,o:500,p:556,q:528,r:392,s:394,t:389,u:556,v:528,w:722,x:528,y:528,z:444};
for(const d of '0123456789')WIDTHS[d]=500;
const CS_WIDTH={ss:500,ae:722,oe:778,AE:903,OE:1014};

/** Splits s into top-level pieces: plain characters, or {group} (with special true when it starts with {\). */
function pieces(s){
  const out=[];
  for(let i=0;i<s.length;i++){
    if(s[i]==='{'){
      let depth=0,j=i;for(;j<s.length;j++){if(s[j]==='{')depth++;else if(s[j]==='}'&&!--depth)break;}
      out.push({group:s.slice(i,j+1),special:s[i+1]==='\\'});i=j;continue;
    }
    out.push({char:s[i]});
  }
  return out;
}
// The control sequence that starts a special character's group: "{\'E}" -> {name:"'", rest:"E}"}.
function controlSequence(group,at=1){
  const m=/^\\([A-Za-z]+|.)/.exec(group.slice(at));
  return m?{name:m[1],end:at+m[0].length}:null;
}

// ---- name parsing -----------------------------------------------------------------------------
function splitNames(s){
  const out=[];let depth=0,start=0;
  for(let i=0;i<s.length;i++){
    const c=s[i];if(c==='{')depth++;else if(c==='}')depth--;
    else if(!depth&&white(c)&&/^and\s/i.test(s.slice(i+1,i+5))&&(white(s[i+4]??' '))){out.push(s.slice(start,i));i+=4;start=i;}
  }
  out.push(s.slice(start));
  return out.map(name=>name.trim()).filter((name,index,all)=>name||all.length===1);
}
// Words of a name part with the separator that followed each: ' ', '-' or '~'.
function tokens(s){
  const words=[],seps=[];let depth=0,current='';
  const push=sep=>{if(current){words.push(current);seps.push(sep);current='';}else if(seps.length&&sep!==' ')seps[seps.length-1]=sep;};
  for(const c of s.trim()){
    if(c==='{')depth++;else if(c==='}')depth--;
    if(!depth&&(white(c)||c==='-'||c==='~')){push(white(c)?' ':c);continue;}
    current+=c;
  }
  if(current){words.push(current);seps.push(' ');}
  return {words,seps};
}
// A word starts lowercase if its first letter at brace level 0 (or in a leading special character) is lowercase.
function isVon(word){
  for(let i=0;i<word.length;i++){
    const c=word[i];
    if(c==='{'){
      if(word[i+1]==='\\'){
        const cs=controlSequence(word,i+1);if(!cs)return false;
        if(LETTER_CS[cs.name])return /^[a-z]/.test(cs.name);
        for(let j=i+cs.end;j<word.length&&word[j]!=='}';j++)if(alpha(word[j]))return word[j]===word[j].toLowerCase();
        return false;
      }
      let depth=0;for(;i<word.length;i++){if(word[i]==='{')depth++;else if(word[i]==='}'&&!--depth)break;}
      continue;
    }
    if(alpha(c))return c===c.toLowerCase();
  }
  return false;
}
/** -> {first, von, last, jr} as {words, seps} lists. */
function parseName(name){
  const parts=[];let depth=0,start=0;
  for(let i=0;i<name.length;i++){const c=name[i];if(c==='{')depth++;else if(c==='}')depth--;else if(c===','&&!depth){parts.push(name.slice(start,i));start=i+1;}}
  parts.push(name.slice(start));
  const pick=(t,from,to)=>({words:t.words.slice(from,to),seps:t.seps.slice(from,to)});
  const empty={words:[],seps:[]};
  if(parts.length===1){
    const t=tokens(parts[0]),n=t.words.length;if(!n)return {first:empty,von:empty,last:empty,jr:empty};
    let vonStart=-1;for(let i=0;i<n-1;i++)if(isVon(t.words[i])){vonStart=i;break;}
    if(vonStart<0)return {first:pick(t,0,n-1),von:empty,last:pick(t,n-1,n),jr:empty};
    let vonEnd=vonStart;for(let i=n-2;i>=vonStart;i--)if(isVon(t.words[i])){vonEnd=i;break;}
    return {first:pick(t,0,vonStart),von:pick(t,vonStart,vonEnd+1),last:pick(t,vonEnd+1,n),jr:empty};
  }
  const head=tokens(parts[0]),n=head.words.length;let vonEnd=-1;
  for(let i=0;i<n-1;i++)if(isVon(head.words[i]))vonEnd=i;
  const von=pick(head,0,vonEnd+1),last=pick(head,vonEnd+1,n);
  if(parts.length===2)return {first:tokens(parts[1]),von,last,jr:empty};
  return {first:tokens(parts.slice(2).join(',')),von,last,jr:tokens(parts[1])};
}
// The first letter of a word for abbreviation, keeping a leading special character whole.
function initial(word){
  for(let i=0;i<word.length;i++){
    const c=word[i];
    if(c==='{'){
      let depth=0,j=i;for(;j<word.length;j++){if(word[j]==='{')depth++;else if(word[j]==='}'&&!--depth)break;}
      if(word[i+1]==='\\')return word.slice(i,j+1);
      const inner=initial(word.slice(i+1,j));if(inner)return '{'+inner+'}';i=j;continue;
    }
    if(alpha(c))return c;
  }
  return '';
}
const textLength=s=>pieces(s).reduce((n,p)=>n+(p.char!=null?(p.char==='}'?0:1):p.special?1:p.group.replace(/[{}]/g,'').length),0);
function formatName(names,n,format){
  const list=splitNames(names);if(n<1||n>list.length)throw new BstError(`There is no name ${n} in "${names}"`);
  const parts=parseName(list[n-1]);let out='';
  for(const p of pieces(format)){
    if(p.char!=null){out+=p.char;continue;}
    const g=p.group.slice(1,-1);let i=0,depth=0,pre='';
    for(;i<g.length;i++){const c=g[i];if(c==='{')depth++;else if(c==='}')depth--;if(!depth&&/[fvlj]/i.test(c))break;pre+=c;}
    if(i>=g.length){out+=p.group;continue;}
    const letter=g[i].toLowerCase(),full=g[i+1]?.toLowerCase()===letter;i+=full?2:1;
    let between=null;
    if(g[i]==='{'){let d=0,j=i;for(;j<g.length;j++){if(g[j]==='{')d++;else if(g[j]==='}'&&!--d)break;}between=g.slice(i+1,j);i=j+1;}
    const post=g.slice(i),part=parts[{f:'first',v:'von',l:'last',j:'jr'}[letter]];
    if(!part.words.length)continue;
    let text=pre;const begin=text.length;
    part.words.forEach((word,index)=>{
      text+=full?word:initial(word);
      if(index===part.words.length-1)return;
      if(between!=null){text+=between;return;}
      if(!full)text+='.';
      const sep=part.seps[index];
      text+=sep==='-'||sep==='~'?sep:index===part.words.length-2||textLength(text.slice(begin))<3?'~':' ';
    });
    // A tie that ends the post-text becomes a space once the part is long enough.
    let tail=post;
    if(tail.endsWith('~')&&!tail.endsWith('\\~')&&textLength(text.slice(begin))>=3&&!(tail.length>1&&tail.endsWith('~~')))tail=tail.slice(0,-1)+' ';
    out+=text+tail;
  }
  return out;
}

// ---- case and purification --------------------------------------------------------------------
function changeCase(s,spec){
  const mode=spec.toLowerCase()[0];if(!'tlu'.includes(mode))throw new BstError(`Illegal string ("${spec}") for change.case$`);
  const lower=mode!=='u',out=[];let first=true,afterColon=false;
  const convert=c=>lower?c.toLowerCase():c.toUpperCase();
  for(const p of pieces(s)){
    if(p.char!=null){
      const c=p.char,keep=mode==='t'&&(first||afterColon);
      out.push(keep?c:convert(c));
      if(!white(c))first=false;
      if(c===':')afterColon='colon';else if(afterColon==='colon'&&white(c))afterColon=true;else if(!white(c))afterColon=false;
      continue;
    }
    const keep=mode==='t'&&(first||afterColon);first=false;afterColon=false;
    if(!p.special||keep){out.push(p.group);continue;}
    // A special character changes case in its text; letter-like control sequences change too.
    let g=p.group,result='{';
    for(let i=1;i<g.length-1;){
      if(g[i]==='\\'){
        const cs=controlSequence(g,i)||{name:'',end:i+1};let name=g.slice(i+1,cs.end);
        if(LETTER_CS[name])name=lower?(name==='SS'?'ss':name.toLowerCase()):name==='ss'?'SS':name.toUpperCase();
        result+='\\'+name;i=cs.end;continue;
      }
      result+=convert(g[i]);i++;
    }
    out.push(result+'}');
  }
  return out.join('');
}
function purify(s){
  let out='';
  for(const p of pieces(s)){
    if(p.char!=null){const c=p.char;if(alnum(c))out+=c;else if(white(c)||c==='-'||c==='~')out+=' ';continue;}
    const g=p.group;
    if(p.special){
      for(let i=1;i<g.length-1;){
        if(g[i]==='\\'){const cs=controlSequence(g,i);if(!cs){i++;continue;}const name=g.slice(i+1,cs.end);if(LETTER_CS[name])out+=name;i=cs.end;continue;}
        if(alnum(g[i]))out+=g[i];i++;
      }
    }else for(const c of g)if(alnum(c))out+=c;else if(white(c)||c==='-'||c==='~')out+=' ';
  }
  return out;
}
function textPrefix(s,n){
  let out='',count=0,depth=0;
  for(let i=0;i<s.length&&count<n;i++){
    const c=s[i];
    if(c==='{'){
      if(depth===0&&s[i+1]==='\\'){let d=0,j=i;for(;j<s.length;j++){if(s[j]==='{')d++;else if(s[j]==='}'&&!--d)break;}out+=s.slice(i,j+1);count++;i=j;continue;}
      depth++;out+=c;continue;
    }
    if(c==='}'){if(depth>0){depth--;out+=c;}continue;}
    out+=c;count++;
  }
  return out+'}'.repeat(depth);
}
function width(s){
  let total=0;
  for(const p of pieces(s)){
    if(p.char!=null){total+=WIDTHS[p.char]??0;continue;}
    if(p.special){const cs=controlSequence(p.group);if(cs&&CS_WIDTH[cs.name]!=null){total+=CS_WIDTH[cs.name];continue;}for(const c of p.group.slice(cs?cs.end:1,-1))total+=WIDTHS[c]??0;continue;}
    for(const c of p.group.slice(1,-1))total+=WIDTHS[c]??0;
  }
  return total;
}
function addPeriod(s){
  const trimmed=s.replace(/\}+$/,'');
  if(!trimmed||/[.?!]$/.test(trimmed))return s;
  return s+'.';
}
function numNames(s){return s.trim()?splitNames(s).length:0;}

// ---- .aux and .bib ----------------------------------------------------------------------------
function readAux(text,readAuxFile,seen=new Set()){
  const result={citations:[],databases:[],style:null};
  const visit=source=>{
    for(const match of source.matchAll(/\\(citation|bibdata|bibstyle|@input)\{([^}]*)\}/g)){
      const [,command,arg]=match;
      if(command==='citation'){for(const key of arg.split(','))result.citations.push(key.trim());}
      else if(command==='bibdata'){for(const name of arg.split(','))if(name.trim())result.databases.push(name.trim());}
      else if(command==='bibstyle')result.style??=arg.trim();
      else if(!seen.has(arg)){seen.add(arg);const nested=readAuxFile(arg);if(nested)visit(nested);}
    }
  };
  visit(text);
  return result;
}
function parseDatabase(text,file,macros,warn){
  const entries=[],preambles=[];let line=1,at=0;
  const lineAt=offset=>{for(;at<offset;at++)if(text[at]==='\n')line++;return line;};
  const re=/@\s*([A-Za-z][\w:.+-]*)\s*([{(])/g;
  for(let m;(m=re.exec(text));){
    const type=m[1].toLowerCase(),open=m[2],close=open==='{'?'}':')',start=m.index;
    let i=re.lastIndex;
    const skipWhite=()=>{while(i<text.length&&white(text[i]))i++;};
    const value=()=>{
      let out='';
      for(;;){
        skipWhite();const c=text[i];
        if(c==='{'){let d=0,j=i;for(;j<text.length;j++){if(text[j]==='{')d++;else if(text[j]==='}'&&!--d)break;}out+=text.slice(i+1,j);i=j+1;}
        else if(c==='"'){let d=0,j=i+1;for(;j<text.length;j++){if(text[j]==='{')d++;else if(text[j]==='}')d--;else if(text[j]==='"'&&!d)break;}out+=text.slice(i+1,j);i=j+1;}
        else if(/[0-9]/.test(c??'')){const n=/^[0-9]+/.exec(text.slice(i))[0];out+=n;i+=n.length;}
        else{
          const name=/^[^\s"#%'(),={}]+/.exec(text.slice(i))?.[0];if(!name)break;i+=name.length;
          const key=name.toLowerCase();if(macros.has(key))out+=macros.get(key);else warn(`string name "${name}" is undefined`,{file,line:lineAt(i)});
        }
        skipWhite();if(text[i]==='#'){i++;continue;}break;
      }
      return out.replace(/\s+/g,' ').trim();
    };
    try{
      if(type==='comment')continue;
      if(type==='preamble'){preambles.push(value());skipWhite();if(text[i]===close)i++;re.lastIndex=i;continue;}
      if(type==='string'){
        skipWhite();const name=/^[^\s"#%'(),={}]+/.exec(text.slice(i))?.[0];if(!name)continue;i+=name.length;skipWhite();if(text[i]!=='=')continue;i++;
        macros.set(name.toLowerCase(),value());skipWhite();if(text[i]===close)i++;re.lastIndex=i;continue;
      }
      skipWhite();
      const key=(open==='{'?/^[^\s,}]*/:/^[^\s,)]*/).exec(text.slice(i))[0];i+=key.length;skipWhite();
      const fields=new Map();
      while(text[i]===','){
        i++;skipWhite();if(text[i]===close)break;
        const name=/^[^\s"#%'(),={}]+/.exec(text.slice(i))?.[0];if(!name)break;i+=name.length;skipWhite();
        if(text[i]!=='='){warn(`I was expecting an "=" in ${file}`,{file,line:lineAt(i)});break;}
        i++;const v=value(),field=name.toLowerCase();
        if(fields.has(field))warn(`I'm skipping whatever remains of this entry: repeated field "${field}" in ${key}`,{file,line:lineAt(i)});else fields.set(field,v);
        skipWhite();
      }
      skipWhite();if(text[i]===close)i++;
      re.lastIndex=i;
      if(key)entries.push({type,key,fields,file,line:lineAt(start)});
    }catch{re.lastIndex=i+1;}
  }
  return {entries,preambles};
}

// ---- the style language -----------------------------------------------------------------------
function parseStyle(text){
  const tokens=[];let i=0,line=1;
  const src=text.replace(/\r\n?/g,'\n');
  while(i<src.length){
    const c=src[i];
    if(c==='\n'){line++;i++;continue;}
    if(white(c)){i++;continue;}
    if(c==='%'){while(i<src.length&&src[i]!=='\n')i++;continue;}
    if(c==='{'||c==='}'){tokens.push({t:c,line});i++;continue;}
    if(c==='"'){const j=src.indexOf('"',i+1);if(j<0)throw new BstError(`Unterminated string on line ${line}`);tokens.push({t:'str',v:src.slice(i+1,j),line});line+=(src.slice(i,j).match(/\n/g)||[]).length;i=j+1;continue;}
    if(c==='#'){const m=/^#[+-]?[0-9]+/.exec(src.slice(i));if(!m)throw new BstError(`Illegal integer on line ${line}`);tokens.push({t:'int',v:parseInt(m[0].slice(1),10),line});i+=m[0].length;continue;}
    if(c==="'"){const m=/^'([^\s{}%"#']+)/.exec(src.slice(i));if(!m)throw new BstError(`Illegal quoted name on line ${line}`);tokens.push({t:'quote',v:m[1].toLowerCase(),line});i+=m[0].length;continue;}
    const m=/^[^\s{}%"#']+/.exec(src.slice(i));tokens.push({t:'id',v:m[0].toLowerCase(),line});i+=m[0].length;
  }
  let p=0;
  const expect=t=>{const token=tokens[p++];if(!token||token.t!==t)throw new BstError(`Expected ${t} near line ${token?.line??'end'}`);return token;};
  const list=()=>{expect('{');const out=[];while(tokens[p]&&tokens[p].t!=='}')out.push(tokens[p++]);expect('}');return out;};
  // A function body: a list of tokens and nested bodies.
  const body=()=>{expect('{');const out=[];while(tokens[p]&&tokens[p].t!=='}'){if(tokens[p].t==='{')out.push({t:'body',v:body()});else out.push(tokens[p++]);}expect('}');return out;};
  const commands=[];
  while(p<tokens.length){
    const token=tokens[p++];if(token.t!=='id')throw new BstError(`Unexpected token near line ${token.line}`);
    const name=token.v;
    if(name==='entry')commands.push({name,fields:list().map(t=>t.v),ints:list().map(t=>t.v),strs:list().map(t=>t.v)});
    else if(name==='function')commands.push({name,id:list()[0].v,body:body()});
    else if(name==='macro'){const id=list()[0].v,value=list()[0];commands.push({name,id,value:value?.v??''});}
    else if(name==='integers'||name==='strings')commands.push({name,ids:list().map(t=>t.v)});
    else if(name==='execute'||name==='iterate'||name==='reverse')commands.push({name,id:list()[0].v});
    else if(name==='read'||name==='sort')commands.push({name});
    else throw new BstError(`Unknown command ${name} near line ${token.line}`);
  }
  return commands;
}

/** aux: main .aux text. readAux(name) -> text of a nested .aux; readBib(name) -> {text, file} | null; readStyle(name) -> text | null.
 *  -> {bbl, log, warnings:[{message, file?, line?, key?}], errors:[message], style, databases, citations} */
function runBibtex({aux,readAux:readNested=()=>null,readBib=()=>null,readStyle=()=>null}){
  const warnings=[],errors=[],log=[];
  const warn=(message,where={})=>{warnings.push({message,...where});log.push('Warning--'+message+(where.file?` (${where.file}${where.line?':'+where.line:''})`:''));};
  const info=readAux(aux,readNested);
  if(!info.style||!info.databases.length)return null;
  const styleText=readStyle(info.style);
  if(styleText==null){errors.push(`I couldn't open style file ${info.style}.bst`);return {bbl:null,log:errors.join('\n'),warnings,errors,style:info.style,databases:info.databases,citations:info.citations};}
  const commands=parseStyle(styleText);
  // Name space: fields, entry variables, globals, functions and macros share one table, case-insensitively.
  const fns=new Map(),globals=new Map(),entryInts=[],entryStrs=[],fields=['crossref'],macros=new Map();
  let entries=[],current=null,output='',bbl=[],preambles=[];
  const flushLine=()=>{
    let text=output.replace(/[ \t]+$/,'');output='';
    // Long lines break at a space; continuation lines are indented by two spaces.
    while(text.length>MAX_LINE){
      let at=MAX_LINE;while(at>2&&!white(text[at]))at--;
      if(at<=2){at=text.slice(MAX_LINE).search(/\s/);if(at<0)break;at+=MAX_LINE;}
      bbl.push(text.slice(0,at).replace(/\s+$/,''));text='  '+text.slice(at).replace(/^\s+/,'');
    }
    bbl.push(text);
  };
  const stack=[];
  const pop=()=>{if(!stack.length)throw new BstError('You can\'t pop an empty literal stack');return stack.pop();};
  const popInt=name=>{const v=pop();if(typeof v!=='number')throw new BstError(`${name}: expected an integer`);return v;};
  const popStr=name=>{const v=pop();if(v===MISSING)return '';if(typeof v!=='string')throw new BstError(`${name}: expected a string`);return v;};
  const popFn=name=>{const v=pop();if(!v||typeof v!=='object'||!v.fn)throw new BstError(`${name}: expected a function`);return v;};
  const fieldOf=name=>{if(!current)throw new BstError(`You can't use field ${name} outside of an entry`);const v=current.fields.get(name);return v==null?MISSING:v;};
  let steps=0;
  function execute(fn){
    if(fn.builtin){fn.builtin();return;}
    if(fn.body)run(fn.body);
  }
  function lookup(name){
    if(fns.has(name))return fns.get(name);
    throw new BstError(`${name} is an unknown function`);
  }
  function run(body){
    for(const token of body){
      if(++steps>5e7)throw new BstError('The style ran too long');
      if(token.t==='int'||token.t==='str')stack.push(token.v);
      else if(token.t==='quote')stack.push(lookup(token.v));
      else if(token.t==='body')stack.push({fn:true,body:token.v});
      else execute(lookup(token.v));
    }
  }
  const define=(name,fn)=>fns.set(name,{fn:true,name,...fn});
  const assign=(target,value)=>{
    if(target.global){if(target.int?typeof value!=='number':typeof value!=='string'&&value!==MISSING)throw new BstError(`Type mismatch assigning ${target.name}`);globals.set(target.name,target.int?value:(value===MISSING?'':value).slice(0,GLOBAL_MAX));return;}
    if(target.entryVar){if(!current)throw new BstError(`You can't assign ${target.name} outside an entry`);current.vars.set(target.name,target.int?value:(value===MISSING?'':value).slice(0,ENTRY_MAX));return;}
    throw new BstError(`You can't assign to ${target.name}`);
  };
  const builtins={
    '>':()=>{const b=popInt('>'),a=popInt('>');stack.push(a>b?1:0);},
    '<':()=>{const b=popInt('<'),a=popInt('<');stack.push(a<b?1:0);},
    '=':()=>{let b=pop(),a=pop();if(a===MISSING)a='';if(b===MISSING)b='';stack.push(a===b?1:0);},
    '+':()=>{const b=popInt('+'),a=popInt('+');stack.push(a+b);},
    '-':()=>{const b=popInt('-'),a=popInt('-');stack.push(a-b);},
    '*':()=>{const b=popStr('*'),a=popStr('*');stack.push(a+b);},
    ':=':()=>{const target=popFn(':='),value=pop();assign(target,value);},
    'add.period$':()=>stack.push(addPeriod(popStr('add.period$'))),
    'call.type$':()=>{if(!current)throw new BstError('call.type$ outside an entry');execute(fns.get(current.type)?.body?fns.get(current.type):lookup('default.type'));},
    'change.case$':()=>{const spec=popStr('change.case$'),s=popStr('change.case$');stack.push(changeCase(s,spec));},
    'chr.to.int$':()=>{const s=popStr('chr.to.int$');if([...s].length!==1)throw new BstError(`String "${s}" is not a single character`);stack.push(s.codePointAt(0));},
    'cite$':()=>{if(!current)throw new BstError('cite$ outside an entry');stack.push(current.cite);},
    'duplicate$':()=>{const v=pop();stack.push(v,v);},
    'empty$':()=>{const v=pop();stack.push(v===MISSING||typeof v==='string'&&!v.trim()?1:0);},
    'format.name$':()=>{const format=popStr('format.name$'),n=popInt('format.name$'),names=popStr('format.name$');stack.push(formatName(names,n,format));},
    'if$':()=>{const no=popFn('if$'),yes=popFn('if$'),test=popInt('if$');execute(test>0?yes:no);},
    'int.to.chr$':()=>stack.push(String.fromCodePoint(popInt('int.to.chr$'))),
    'int.to.str$':()=>stack.push(String(popInt('int.to.str$'))),
    'missing$':()=>{const v=pop();stack.push(v===MISSING?1:0);},
    'newline$':flushLine,
    'num.names$':()=>stack.push(numNames(popStr('num.names$'))),
    'pop$':()=>{pop();},
    'preamble$':()=>stack.push(preambles.join('')),
    'purify$':()=>stack.push(purify(popStr('purify$'))),
    'quote$':()=>stack.push('"'),
    'skip$':()=>{},
    'stack$':()=>{while(stack.length)log.push(String(stack.pop()));},
    'substring$':()=>{
      const len=popInt('substring$'),start=popInt('substring$'),s=popStr('substring$');
      if(start>0)stack.push(s.slice(start-1,start-1+Math.max(0,len)));
      else if(start<0){const end=s.length+start+1;stack.push(s.slice(Math.max(0,end-len),Math.max(0,end)));}
      else stack.push('');
    },
    'swap$':()=>{const b=pop(),a=pop();stack.push(b,a);},
    'text.length$':()=>stack.push(textLength(popStr('text.length$'))),
    'text.prefix$':()=>{const n=popInt('text.prefix$'),s=popStr('text.prefix$');stack.push(textPrefix(s,n));},
    'top$':()=>log.push(String(pop())),
    'type$':()=>stack.push(current&&fns.get(current.type)?.body?current.type:''),
    'warning$':()=>{const message=popStr('warning$');warn(message,current?{key:current.cite,file:current.file,line:current.line}:{});},
    'while$':()=>{const body=popFn('while$'),test=popFn('while$');for(let guard=0;;guard++){if(guard>1e7)throw new BstError('while$ loop does not end');execute(test);if(popInt('while$')<=0)break;execute(body);}},
    'width$':()=>stack.push(width(popStr('width$'))),
    'write$':()=>{output+=popStr('write$');},
  };
  for(const [name,fn] of Object.entries(builtins))define(name,{builtin:fn});
  define('entry.max$',{builtin:()=>stack.push(ENTRY_MAX)});define('global.max$',{builtin:()=>stack.push(GLOBAL_MAX)});
  const entryVar=(name,int)=>define(name,{entryVar:true,int,builtin(){if(!current)throw new BstError(`${name} outside an entry`);const v=current.vars.get(name);stack.push(v??(int?0:''));}});
  entryVar('sort.key$',false);
  const fieldFn=name=>define(name,{field:true,builtin:()=>stack.push(fieldOf(name))});
  fieldFn('crossref');
  let read=false;
  function readDatabases(){
    read=true;const all=[];const byKey=new Map();
    for(const name of info.databases){
      const found=readBib(name);
      if(!found){errors.push(`I couldn't open database file ${name}.bib`);continue;}
      const {entries:list,preambles:more}=parseDatabase(found.text,found.file,macros,warn);
      preambles.push(...more);
      for(const entry of list){const key=entry.key.toLowerCase();if(byKey.has(key)){warn(`Repeated entry ${entry.key}`,{file:entry.file,line:entry.line});continue;}byKey.set(key,entry);all.push(entry);}
    }
    // Citation order: as cited; \nocite{*} adds every other entry in database order at that point.
    const order=[],chosen=new Set();
    const add=(entry,cite)=>{const key=entry.key.toLowerCase();if(chosen.has(key))return;chosen.add(key);order.push({entry,cite});};
    for(const key of info.citations){
      if(key==='*'){for(const entry of all)add(entry,entry.key);continue;}
      const entry=byKey.get(key.toLowerCase());
      if(!entry){if(!chosen.has(key.toLowerCase())){chosen.add(key.toLowerCase());warn(`I didn't find a database entry for "${key}"`,{key,missing:true});}continue;}
      if(entry.key!==key&&!chosen.has(key.toLowerCase()))warn(`Case mismatch error between cite keys ${key} and ${entry.key}`,{key});
      add(entry,key);
    }
    // Cross-referenced entries are included when cited often enough (min.crossrefs = 2) or directly.
    const crossCount=new Map();
    for(const {entry} of order){const parent=entry.fields.get('crossref');if(parent)crossCount.set(parent.toLowerCase(),(crossCount.get(parent.toLowerCase())||0)+1);}
    for(const [key,count] of crossCount)if(count>=2&&byKey.has(key))add(byKey.get(key),byKey.get(key).key);
    entries=order.map(({entry,cite})=>{
      const values=new Map();
      const parent=entry.fields.get('crossref')&&byKey.get(entry.fields.get('crossref').toLowerCase());
      if(entry.fields.get('crossref')&&!parent)warn(`A bad cross reference---entry "${entry.key}" refers to entry "${entry.fields.get('crossref')}", which doesn't exist`,{file:entry.file,line:entry.line,key:entry.key});
      for(const field of fields){
        let v=entry.fields.get(field);
        if(v==null&&parent&&field!=='crossref')v=parent.fields.get(field);
        if(v!=null)values.set(field,v);
      }
      // A crossref to an entry that is not in the list is dropped, as BibTeX does.
      if(values.has('crossref')&&!chosen.has(values.get('crossref').toLowerCase()))values.delete('crossref');
      return {type:entry.type,cite,fields:values,vars:new Map(),file:entry.file,line:entry.line};
    });
  }
  try{
    for(const command of commands){
      if(command.name==='entry'){
        for(const name of command.fields)if(!fields.includes(name)){fields.push(name);fieldFn(name);}
        for(const name of command.ints){entryInts.push(name);entryVar(name,true);}
        for(const name of command.strs){entryStrs.push(name);entryVar(name,false);}
      }else if(command.name==='integers')for(const name of command.ids){globals.set(name,0);define(name,{global:true,int:true,builtin:()=>stack.push(globals.get(name))});}
      else if(command.name==='strings')for(const name of command.ids){globals.set(name,'');define(name,{global:true,int:false,builtin:()=>stack.push(globals.get(name))});}
      else if(command.name==='macro')macros.set(command.id,command.value);
      else if(command.name==='function')define(command.id,{body:command.body});
      else if(command.name==='read'){if(read)throw new BstError('Illegal, another read command');readDatabases();}
      else if(command.name==='execute'){current=null;execute(lookup(command.id));}
      else if(command.name==='iterate'||command.name==='reverse'){
        const fn=lookup(command.id),list=command.name==='iterate'?entries:[...entries].reverse();
        for(const entry of list){
          current=entry;execute(fn);
        }
        current=null;
      }else if(command.name==='sort'){
        const keyed=entries.map((entry,index)=>({entry,index,key:entry.vars.get('sort.key$')??''}));
        keyed.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:a.index-b.index);entries=keyed.map(item=>item.entry);
      }
    }
    for(const entry of entries)if(!fns.get(entry.type)?.body)warn(`entry type for "${entry.cite}" isn't style-file defined`,{key:entry.cite,file:entry.file,line:entry.line});
  }catch(error){
    if(!(error instanceof BstError))throw error;
    errors.push(error.message+(current?` (entry ${current.cite})`:''));
  }
  if(output)flushLine();
  const text=bbl.join('\n')+'\n';
  log.unshift(`This is BibTeX (LightningTeX JavaScript), style ${info.style}, database file(s) ${info.databases.join(', ')}`);
  if(errors.length)log.push(...errors.map(message=>'Error--'+message));
  log.push(`(There ${warnings.length===1?'was 1 warning':`were ${warnings.length} warnings`})`);
  return {bbl:errors.length&&!bbl.length?null:text,log:log.join('\n'),warnings,errors,style:info.style,databases:info.databases,citations:info.citations};
}

const api={runBibtex,formatName,changeCase,purify,textPrefix,textLength,width,splitNames,parseName};
if(typeof self!=='undefined')Object.assign(self,{runBibtex,BibTeX:api});
if(typeof module!=='undefined')module.exports=api;
})();
