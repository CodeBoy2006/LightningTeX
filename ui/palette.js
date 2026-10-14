import {openDialog} from './overlays.js';
import {icon} from './icons.js';

/** Ordered subsequence matching; contiguous runs and word starts rank first. */
export function fuzzyMatch(query,text){
  const q=query.toLocaleLowerCase(),s=text.toLocaleLowerCase(),indices=[];let at=0,score=0;
  for(const char of q){const i=s.indexOf(char,at);if(i<0)return null;score+=i===at?4:1;if(i===0||/[\s/_.-]/.test(s[i-1]))score+=3;indices.push(i);at=i+1;}
  return {score:score-text.length*.001,indices};
}
export function openPalette({host,t,items,onClose}){
  const content=document.createElement('div');content.className='palette-body';
  content.innerHTML='<div class="palette-input">'+icon('search')+'<input type="text" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true"></div><div class="palette-list" role="listbox" id="command-results"></div><footer></footer>';
  const input=content.firstChild.lastChild,list=content.children[1];input.placeholder=input.ariaLabel=t('palette.placeholder');input.setAttribute('aria-controls',list.id);content.lastChild.textContent=t('palette.hint');
  let results=[],selected=0;
  const dialog=openDialog(host,{title:t('palette.open'),content,className:'palette-dialog',onClose,hideTitle:true});
  function choose(index){const item=results[index];if(!item)return;dialog.close();item.run();}
  function paint(){
    list.replaceChildren();
    for(const [index,item] of results.entries()){
      const row=document.createElement('div');row.className='palette-item';row.id='command-result-'+index;row.setAttribute('role','option');row.setAttribute('aria-selected',String(index===selected));
      row.innerHTML=icon(item.icon||'file')+'<span></span><small></small><kbd></kbd>';
      const label=row.children[1],positions=new Set(item.match?.indices);
      [...item.label].forEach((char,i)=>{if(positions.has(i)){const mark=document.createElement('mark');mark.textContent=char;label.append(mark);}else label.append(char);});
      row.children[2].textContent=item.detail||'';row.lastChild.textContent=item.hint||'';row.lastChild.hidden=!item.hint;
      row.onpointerdown=event=>event.preventDefault();row.onclick=()=>choose(index);list.append(row);
    }
    if(!results.length){list.append(Object.assign(document.createElement('p'),{className:'panel-empty',textContent:t('palette.none')}));input.removeAttribute('aria-activedescendant');}
    else{input.setAttribute('aria-activedescendant','command-result-'+selected);list.children[selected]?.scrollIntoView?.({block:'nearest'});}
  }
  function search(){
    const query=input.value.trim(),prefix=/^[@>:]/.test(query)?query[0]:'',term=prefix?query.slice(1).trim():query;
    results=items(prefix,term).filter(item=>!item.disabled).map(item=>({...item,match:fuzzyMatch(term,item.label)})).filter(item=>prefix===':'||item.match).sort((a,b)=>term?(b.match?.score||0)-(a.match?.score||0):0).slice(0,60);selected=0;paint();
  }
  input.oninput=search;
  input.onkeydown=event=>{
    if(event.isComposing)return;
    if(event.key==='Enter'){event.preventDefault();choose(selected);}
    else if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selected=results.length?(selected+(event.key==='ArrowDown'?1:results.length-1))%results.length:0;paint();}
  };
  search();input.focus();return dialog;
}
