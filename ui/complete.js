import {liveCommands,liveArity} from '../core/document.js';
import {mathEnvironments,parseMacros} from '../core/math-preview.js';
import {maskSource} from '../core/outline.js';
import {SYMBOLS} from './symbols.js';
const commands=[...new Set([...liveCommands,...'begin end section subsection subsubsection chapter part label ref eqref pageref input include includegraphics cite usepackage documentclass newcommand title author date maketitle tableofcontents'.split(' ')])];
const environments=[...new Set([...'equation align document itemize enumerate description figure table tabular center quote quotation abstract theorem lemma proof align* equation*'.split(' '),...mathEnvironments])];
const arities={...liveArity,begin:1,end:1,section:1,subsection:1,subsubsection:1,chapter:1,part:1,label:1,ref:1,eqref:1,pageref:1,input:1,include:1,includegraphics:1,cite:1,usepackage:1,documentclass:1,title:1,author:1,date:1};

/** Return source edits; no DOM or TeX execution is needed to offer a completion. */
export function completions(source,caret,{files=new Map(),labels=[],bib=[]}={}){
  const before=maskSource(source.slice(0,caret)),argument=/\\(begin|end|ref|eqref|pageref|input|include|includegraphics)(?:\[[^\]]*\])?\{([^{}\n]*)$/.exec(before)
    ||/\\([A-Za-z]*cite[A-Za-z]*|nocite)\*?(?:\[[^\]]*\]){0,2}\{([^{}\n]*)$/.exec(before);
  let candidates=[],prefix='',start=caret,end=caret,environment=false;
  if(argument){
    const name=argument[1];prefix=argument[2];start=caret-prefix.length;if(source[caret]==='}')end++;
    const cite=/cite/i.test(name);
    // Citations take several keys: only the one being typed is completed, and the brace stays for the next.
    if(cite){const comma=prefix.lastIndexOf(',');prefix=prefix.slice(comma+1).trimStart();start=caret-prefix.length;end=caret;
      const taken=new Set(argument[2].split(',').map(key=>key.trim()));
      candidates=bib.filter(entry=>!taken.has(entry.key)||entry.key===prefix).map(entry=>({label:entry.key,detail:[entry.byline,entry.title].filter(Boolean).join(' · '),kind:'cite',title:entry.title,byline:entry.byline,match:[entry.key,entry.byline,entry.title].join(' ').toLowerCase()}));}
    else if(name==='begin'||name==='end'){environment=name==='begin';candidates=environments.map(label=>({label,kind:'environment'}));}
    else if(['ref','eqref','pageref'].includes(name))candidates=labels.filter(label=>name!=='eqref'||mathEnvironments.has(label.kind)||mathEnvironments.has(label.kind+'*')).map(label=>({label:label.name,detail:`${label.file}:${label.line} ${label.text}`,kind:'label'}));
    else candidates=[...files.keys()].filter(path=>name==='includegraphics'?/\.(png|jpe?g|pdf)$/i.test(path):/\.(tex|ltx)$/i.test(path)).map(label=>({label,kind:'file'}));
  }else{
    const command=/\\([A-Za-z]*)$/.exec(before);if(!command)return [];
    prefix=command[1];start=caret-prefix.length;
    const macros=new Map();
    for(const text of files.values())if(typeof text==='string'){
      const preamble=maskSource(text.split('\\begin{document}')[0]);
      for(const [name,macro] of parseMacros(preamble))macros.set(name,macro);
      for(const match of preamble.matchAll(/\\(?:newcommand|renewcommand|providecommand|DeclareMathOperator)\*?\s*\{?\\([A-Za-z]+)\}?\s*(?:\[(\d)\])?/g))if(!macros.has(match[1]))macros.set(match[1],{arity:Number(match[2]||0)});
    }
    candidates=[...macros].map(([label,macro])=>({label,kind:'macro',arity:macro.arity}));
    candidates.push(...commands.filter(name=>!macros.has(name)).map(label=>({label,kind:'command',arity:arities[label]||0,detail:SYMBOLS.find(s=>s.name===label)?.glyph||''})));
  }
  const lower=prefix.toLowerCase();
  // Citation keys also match on author and title words.
  return candidates.filter(item=>item.label.toLowerCase().startsWith(lower)||item.kind==='cite'&&lower&&item.match.split(/[^\p{L}\p{N}]+/u).some(word=>word.startsWith(lower))).sort((a,b)=>Number(b.label.startsWith(prefix))-Number(a.label.startsWith(prefix))).slice(0,40).map(item=>{
    const cite=item.kind==='cite';
    let text=item.label+(cite?'':argument?'}':source[caret]==='{'?'':'{}'.repeat(item.arity||0)),offset=argument?text.length:item.label.length+(item.arity&&source[caret]!=='{'?1:0);
    if(environment&&!source.slice(end).includes('\\end{'+item.label+'}')){const indent=/^[ \t]*/.exec(source.slice(source.lastIndexOf('\n',start-1)+1))[0];text+='\n'+indent+'  \n'+indent+'\\end{'+item.label+'}';offset=item.label.length+2+indent.length+2;}
    // Arguments become tab stops: Tab moves to the next one, then past the last brace.
    const template=!argument&&item.arity&&source[caret]!=='{'?item.label+Array.from({length:item.arity},(_,i)=>'{${'+(i+1)+'}}').join('')+'$0':null;
    return {...item,start,end,text,caret:start+offset,template};
  });
}
export function createCompletion(editor,{t,context,onVisible}){
  const el=document.createElement('div');el.className='completion';el.hidden=true;el.setAttribute('role','listbox');el.id='complete-'+Math.random().toString(36).slice(2);editor.el.append(el);
  let items=[],selected=0,composing=false,dead=false;
  function hide(){el.hidden=true;editor.input.removeAttribute('aria-controls');editor.input.removeAttribute('aria-activedescendant');onVisible?.(false);}
  function choose(index){const item=items[index];if(!item)return;hide();if(item.template&&editor.insertSnippet)editor.insertSnippet(item.start,item.end,item.template);else editor.edit(item.start,item.end,item.text,item.caret);hide();}
  function place(){const box=editor.rectAt(editor.caret);if(!box)return;const top=box.bottom-editor.scroller.scrollTop+4;el.style.left=Math.max(8,Math.min(box.x-editor.scroller.scrollLeft,editor.el.clientWidth-el.offsetWidth-8))+'px';el.style.top=(top+el.offsetHeight>editor.el.clientHeight?Math.max(4,box.top-editor.scroller.scrollTop-el.offsetHeight-4):top)+'px';}
  function paint(){
    el.replaceChildren();items.forEach((item,index)=>{const row=document.createElement('div');row.className='completion-item';row.id=el.id+'-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===selected));row.innerHTML='<b></b><small></small>';row.firstChild.textContent=item.label;row.lastChild.textContent=item.detail||t('complete.'+item.kind);
      if(item.kind==='cite'){row.classList.add('cite');row.lastChild.textContent=item.byline||'';if(item.title)row.append(Object.assign(document.createElement('span'),{className:'completion-title',textContent:item.title}));}row.onpointerdown=event=>event.preventDefault();row.onclick=()=>choose(index);el.append(row);});
    el.append(Object.assign(document.createElement('footer'),{textContent:t('complete.hint')}));editor.input.setAttribute('aria-controls',el.id);editor.input.setAttribute('aria-activedescendant',el.id+'-'+selected);el.children[selected]?.scrollIntoView?.({block:'nearest'});place();
  }
  function refresh(){if(dead||composing||document.activeElement!==editor.input||editor.input.selectionStart!==editor.caret){hide();return;}items=completions(editor.getValue(),editor.caret,context());selected=0;if(!items.length){hide();return;}el.hidden=false;onVisible?.(true);paint();}
  const keydown=event=>{
    if(event.isComposing||event.keyCode===229||el.hidden)return;
    if(['ArrowDown','ArrowUp','Tab','Enter','Escape'].includes(event.key)&&!event.ctrlKey&&!event.metaKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();
      if(event.key==='Escape')hide();else if(event.key==='Tab'||event.key==='Enter')choose(selected);else{selected=(selected+(event.key==='ArrowDown'?1:items.length-1))%items.length;paint();}
    }else if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key))hide();
  };
  const events=[[editor.input,'keydown',keydown,true],[editor.el,'editor-change',refresh],[editor.input,'compositionstart',()=>{composing=true;hide();}],[editor.input,'compositionend',()=>{composing=false;queueMicrotask(refresh);}],[editor.input,'blur',hide],[editor.input,'click',hide],[editor.scroller,'scroll',place]];
  for(const [target,type,handler,capture] of events)target.addEventListener(type,handler,capture);
  return {get visible(){return !el.hidden;},hide,refresh,destroy(){dead=true;for(const [target,type,handler,capture] of events)target.removeEventListener(type,handler,capture);el.remove();}};
}
