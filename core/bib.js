// BibTeX database reading for the editor: entries with their fields and source positions.
// Field values keep their TeX; plainField gives readable text for menus and cards.
import {plainText} from './outline.js';

/** -> [{type, key, fields:{name:value}, start, end, line}] for every entry; @string, @preamble and @comment are skipped. */
export function parseBib(text,file=''){
  const entries=[],lineStarts=[0];for(let i=0;i<text.length;i++)if(text[i]==='\n')lineStarts.push(i+1);
  const lineOf=offset=>{let low=0,high=lineStarts.length-1;while(low<high){const mid=(low+high+1)>>1;if(lineStarts[mid]<=offset)low=mid;else high=mid-1;}return low+1;};
  const strings=new Map(Object.entries({jan:'January',feb:'February',mar:'March',apr:'April',may:'May',jun:'June',jul:'July',aug:'August',sep:'September',oct:'October',nov:'November',dec:'December'}));
  const at=/@\s*([A-Za-z]+)\s*([{(])/g;
  for(let match;(match=at.exec(text));){
    const type=match[1].toLowerCase(),open=match[2],close=open==='{'?'}':')',start=match.index;
    // Find the end of the entry by brace depth; quotes do not nest.
    let depth=1,i=at.lastIndex;
    for(;i<text.length&&depth;i++){const c=text[i];if(c==='\\'){i++;continue;}if(c==='{'||c===open&&open==='(')depth++;else if(c==='}'||c===close&&close===')')depth--;}
    const body=text.slice(at.lastIndex,i-1);at.lastIndex=i;
    if(type==='comment'||type==='preamble')continue;
    if(type==='string'){for(const [name,value] of fieldsOf(body,strings))strings.set(name,value);continue;}
    const comma=body.indexOf(',');if(comma<0)continue;
    const key=body.slice(0,comma).trim();if(!key)continue;
    entries.push({type,key,fields:Object.fromEntries(fieldsOf(body.slice(comma+1),strings)),start,end:i,line:lineOf(start),file});
  }
  return entries;
}
function fieldsOf(body,strings){
  const out=[];let i=0;
  while(i<body.length){
    const name=/^\s*,?\s*([A-Za-z][\w:.+-]*)\s*=\s*/.exec(body.slice(i));if(!name)break;
    i+=name[0].length;let value='';
    // A value is a concatenation (#) of braced text, quoted text, numbers and @string names.
    for(;;){
      while(/\s/.test(body[i]??''))i++;
      const c=body[i];
      if(c==='{'){let depth=0,j=i;for(;j<body.length;j++){if(body[j]==='\\'){j++;continue;}if(body[j]==='{')depth++;else if(body[j]==='}'&&!--depth)break;}value+=body.slice(i+1,j);i=j+1;}
      else if(c==='"'){let depth=0,j=i+1;for(;j<body.length;j++){if(body[j]==='\\'){j++;continue;}if(body[j]==='{')depth++;else if(body[j]==='}')depth--;else if(body[j]==='"'&&!depth)break;}value+=body.slice(i+1,j);i=j+1;}
      else{const word=/^[^\s,#}]+/.exec(body.slice(i))?.[0]||'';i+=word.length;value+=/^\d+$/.test(word)?word:strings.get(word.toLowerCase())??word;}
      while(/\s/.test(body[i]??''))i++;
      if(body[i]==='#'){i++;continue;}
      break;
    }
    out.push([name[1].toLowerCase(),value.replace(/\s+/g,' ').trim()]);
  }
  return out;
}
/** Readable text of a field value: TeX accents and groups removed. */
const ACCENTS={'`':'\u0300',"'":'\u0301','^':'\u0302','"':'\u0308','~':'\u0303','=':'\u0304','.':'\u0307',u:'\u0306',v:'\u030c',H:'\u030b',c:'\u0327',d:'\u0323',b:'\u0331',k:'\u0328'};
const LETTERS={ss:'ß',o:'ø',O:'Ø',ae:'æ',AE:'Æ',oe:'œ',OE:'Œ',aa:'å',AA:'Å',l:'ł',L:'Ł',i:'ı',j:'ȷ'};
export const plainField=value=>plainText(String(value||'').replace(/\\(ss|o|O|ae|AE|oe|OE|aa|AA|l|L|i|j)(?![A-Za-z])\s*/g,(_,name)=>LETTERS[name]).replace(/\\([`'^"~=.uvHcdbk])\s*\{?([A-Za-z])\}?/g,(_,accent,letter)=>(letter+ACCENTS[accent]).normalize('NFC'))).replace(/\s+/g,' ').trim();
/** Family names from an author list: "Golub, Gene H. and Van Loan, Charles F." -> ["Golub", "Van Loan"]. */
export function familyNames(authors){
  return String(authors||'').split(/\s+and\s+/i).map(name=>name.trim()).filter(Boolean).map(name=>{
    const plain=plainField(name);if(/,/.test(plain))return plain.split(',')[0].trim();
    const words=plain.split(/\s+/),von=words.findIndex((word,index)=>index<words.length-1&&/^[a-z]/.test(word));
    return von>=0?words.slice(von).join(' '):words.at(-1);
  }).filter(Boolean);
}
/** "Golub & Van Loan · 2013" */
export function byline(entry){
  const names=familyNames(entry.fields.author||entry.fields.editor),who=names.length>2?names[0]+' et al.':names.join(' & ');
  return [who,plainField(entry.fields.year||entry.fields.date?.slice(0,4))].filter(Boolean).join(' · ');
}
