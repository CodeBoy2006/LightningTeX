import {icon} from './icons.js';

export function findMatches(text,query,{matchCase=false,wholeWord=false,regex=false}={}){
  if(!query)return {matches:[],error:false};
  try{
    let pattern=regex?query:query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    if(wholeWord)pattern='(?<![\\p{L}\\p{N}_])(?:'+pattern+')(?![\\p{L}\\p{N}_])';
    const expression=new RegExp(pattern,matchCase?'gu':'giu');
    return {matches:[...text.matchAll(expression)],error:false};
  }catch{return {matches:[],error:true};}
}
export function replacementText(template,match,source){
  return template.replace(/\$(\$|&|`|'|\d{1,2}|<[^>]+>)/g,(token,key)=>{
    if(key==='$')return '$';if(key==='&')return match[0];
    if(key==='`')return source.slice(0,match.index);if(key==="'")return source.slice(match.index+match[0].length);
    if(key[0]==='<')return match.groups?match.groups[key.slice(1,-1)]??'':token;
    const n=Number(key);if(n>0&&n<match.length)return match[n]??'';
    return key.length===2&&Number(key[0])>0&&Number(key[0])<match.length?(match[Number(key[0])]??'')+key[1]:token;
  });
}
export function createFindBar(editor,t){
  const el=document.createElement('div');el.className='find-bar';el.hidden=true;el.setAttribute('role','search');
  el.innerHTML='<div class="find-row"><input class="find-query" type="text" spellcheck="false"><output aria-live="polite"></output></div><div class="find-options"></div><div class="find-row replace-row" hidden><input class="find-replacement" type="text" spellcheck="false"></div>';
  const [row,options,replaceRow]=el.children,query=row.firstChild,output=row.lastChild,replacement=replaceRow.firstChild;
  const overlay=document.createElement('div');overlay.className='code-matches';overlay.setAttribute('aria-hidden','true');editor.body.append(overlay);editor.el.append(el);
  let matches=[],current=0,invalid=false;const flags={matchCase:false,wholeWord:false,regex:false};
  const button=(host,label,content,run)=>{const b=document.createElement('button');b.type='button';b.className='icon-btn';b.dataset.tip=t(label);b.setAttribute('aria-label',t(label));b.innerHTML=content;b.onclick=run;host.append(b);return b;};
  query.placeholder=query.ariaLabel=t('find.placeholder');replacement.placeholder=replacement.ariaLabel=t('find.with');
  button(row,'find.prev',icon('chevronUp'),()=>jump(-1));button(row,'find.next',icon('chevronDown'),()=>jump(1));button(row,'common.close',icon('close'),close);
  for(const [key,label,text] of [['matchCase','case','Aa'],['wholeWord','word','Ab'],['regex','regex','.*']]){
    const b=button(options,'find.'+label,text,()=>{flags[key]=!flags[key];b.setAttribute('aria-pressed',String(flags[key]));refresh();});b.setAttribute('aria-pressed','false');
  }
  const toggle=button(options,'find.replaceOpen',icon('edit'),()=>{replaceRow.hidden=!replaceRow.hidden;toggle.setAttribute('aria-expanded',String(!replaceRow.hidden));});
  const one=button(replaceRow,'find.replace','',()=>replace(false)),all=button(replaceRow,'find.all','',()=>replace(true));
  for(const [b,key] of [[one,'find.replace'],[all,'find.all']]){b.textContent=t(key);b.className='btn';}
  function paint(){
    const source=editor.getValue();overlay.replaceChildren();let at=0;
    matches.forEach((match,index)=>{overlay.append(document.createTextNode(source.slice(at,match.index)));const mark=document.createElement('mark');mark.textContent=match[0];mark.className=index===current?'current':'';overlay.append(mark);at=match.index+match[0].length;});
    overlay.append(document.createTextNode(source.slice(at)+'\n'));
    output.textContent=invalid?t('find.invalid'):matches.length?`${current+1} / ${matches.length}`:query.value?t('find.none'):'';
    output.dataset.error=String(invalid);one.disabled=all.disabled=!matches.length;
  }
  function refresh(){if(el.hidden)return;const found=findMatches(editor.getValue(),query.value,flags);matches=found.matches;invalid=found.error;current=Math.min(current,Math.max(0,matches.length-1));paint();}
  function select(){const match=matches[current];if(match)editor.select(match.index,match.index+match[0].length);}
  function jump(delta){if(!matches.length)return;current=(current+delta+matches.length)%matches.length;paint();const focused=document.activeElement;select();if(el.contains(focused))focused.focus();}
  function replace(every){
    if(!matches.length)return;const source=editor.getValue(),selected=every?matches:[matches[current]];let result='',at=selected[0].index;
    const start=at;
    for(const match of selected){result+=source.slice(at,match.index)+(flags.regex?replacementText(replacement.value,match,source):replacement.value);at=match.index+match[0].length;}
    editor.edit(start,at,result);refresh();query.focus();
  }
  function close(){el.hidden=true;overlay.replaceChildren();select();editor.focus();}
  const input=()=>refresh(),keys=event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();jump(event.shiftKey?-1:1);}
  };
  query.addEventListener('input',()=>{current=0;refresh();});el.addEventListener('keydown',keys);editor.el.addEventListener('editor-change',input);
  return {open(replace=false){const selected=editor.input.value.slice(editor.input.selectionStart,editor.input.selectionEnd);if(selected&&!selected.includes('\n'))query.value=selected;el.hidden=false;replaceRow.hidden=!replace;toggle.setAttribute('aria-expanded',String(replace));current=0;refresh();query.focus();query.select();},refresh,close,
    destroy(){editor.el.removeEventListener('editor-change',input);overlay.remove();el.remove();}};
}
