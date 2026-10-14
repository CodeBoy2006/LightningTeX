// Command palette: grouped results (recent, files, sections and labels, commands, symbols), scope badges,
// remembered choices and, on wide screens, a preview of the selected file or section.
import {openDialog} from './overlays.js';
import {icon} from './icons.js';

/** Ordered subsequence matching; contiguous runs and word starts rank first. */
export function fuzzyMatch(query,text){
  const q=query.toLocaleLowerCase(),s=text.toLocaleLowerCase(),indices=[];let at=0,score=0;
  for(const char of q){const i=s.indexOf(char,at);if(i<0)return null;score+=i===at?4:1;if(i===0||/[\s/_.-]/.test(s[i-1]))score+=3;indices.push(i);at=i+1;}
  return {score:score-text.length*.001,indices};
}
const RECENT='lightningtex:palette-recent',KEEP=8,PER_GROUP=5;
export const SCOPES=[['@','sections'],['>','commands'],[':','line'],['#','symbols']];
const scopeOf=prefix=>SCOPES.find(([key])=>key===prefix)?.[1]??'';
const loadRecent=()=>{try{const list=JSON.parse(localStorage.getItem(RECENT)||'[]');return Array.isArray(list)?list.filter(id=>typeof id==='string').slice(0,KEEP):[];}catch{return [];}};
const saveRecent=list=>{try{localStorage.setItem(RECENT,JSON.stringify(list.slice(0,KEEP)));}catch{/* this session only */}};

/** sources: {files(), sections(), commands(), symbols(), line(n)} -> items {id, label, detail?, icon?, glyph?, hint?, run, preview?()}.
 *  preview() returns {title, text, line?}. Item ids persist as "recently used". */
export function openPalette({host,t,sources,onClose}){
  const content=document.createElement('div');content.className='palette-body';
  content.innerHTML='<div class="palette-input">'+icon('search')+'<span class="palette-scope" hidden></span><input type="text" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="true"></div><div class="palette-main"><div class="palette-list" role="listbox" id="command-results"></div><aside class="palette-preview" hidden></aside></div><footer><span class="palette-scopes"></span><span class="palette-keys"></span></footer>';
  const [field,main,footer]=content.children,input=field.lastChild,chip=field.children[1],list=main.firstChild,pane=main.lastChild;
  input.placeholder=t('palette.placeholder');input.setAttribute('aria-label',t('palette.placeholder'));input.setAttribute('aria-controls',list.id);
  let scope='',results=[],groups=[],selected=0;const recent=loadRecent(),cache=new Map();
  const all=name=>{if(!cache.has(name))cache.set(name,(sources[name]?.()||[]).filter(item=>!item.disabled));return cache.get(name);};
  for(const [key,name] of SCOPES){
    const button=document.createElement('button');button.type='button';button.className='palette-chip';button.innerHTML='<b></b>';button.firstChild.textContent=key;button.append(t('palette.scope.'+name));
    button.onclick=()=>{setScope(key);input.focus();};footer.firstChild.append(button);
  }
  footer.lastChild.textContent=t('palette.keys');
  const wide=()=>(host.clientWidth||0)>=900;
  const dialog=openDialog(host,{title:t('palette.open'),content,className:'palette-dialog',onClose,hideTitle:true});
  function choose(index){
    const item=results[index];if(!item)return;
    if(item.id){saveRecent([item.id,...loadRecent().filter(id=>id!==item.id)]);}
    dialog.close();item.run();
  }
  function setScope(key){
    scope=key;chip.hidden=!key;chip.replaceChildren();
    if(key){const name=scopeOf(key);chip.innerHTML='<b></b>';chip.firstChild.textContent=key;chip.append(t('palette.scope.'+name));chip.dataset.tip=t('palette.clearScope');}
    for(const button of footer.firstChild.children)button.setAttribute('aria-pressed',String(button.firstChild.textContent===key));
    search();
  }
  chip.onclick=()=>{setScope('');input.focus();};
  function rank(items,term,limit){
    if(!term)return items.slice(0,limit);
    return items.map(item=>({...item,match:fuzzyMatch(term,item.label)||(item.keywords&&fuzzyMatch(term,item.keywords)&&{score:-1,indices:[]})})).filter(item=>item.match).sort((a,b)=>b.match.score-a.match.score).slice(0,limit);
  }
  function search(){
    const term=input.value.trim();groups=[];
    const name=scopeOf(scope);
    if(name==='line'){const item=/^\d+$/.test(term)?sources.line?.(Number(term)):null;if(item)groups.push(['line',[item]]);}
    else if(name){groups.push([name,rank(all(name),term,60)]);}
    else{
      if(!term){
        const byId=new Map(['files','sections','commands'].flatMap(group=>all(group)).map(item=>[item.id,item]));
        groups.push(['recent',recent.map(id=>byId.get(id)).filter(Boolean)]);
        groups.push(['files',all('files').slice(0,PER_GROUP)],['commands',all('commands').slice(0,PER_GROUP)]);
      }else for(const group of ['files','sections','commands','symbols'])groups.push([group,rank(all(group),term,PER_GROUP)]);
    }
    groups=groups.filter(([,items])=>items.length);
    // An item seen in "recent" is not repeated below it.
    const seen=new Set();groups=groups.map(([group,items])=>[group,items.filter(item=>!item.id||!seen.has(item.id)&&seen.add(item.id))]).filter(([,items])=>items.length);
    results=groups.flatMap(([,items])=>items);selected=0;paint();
  }
  function paint(){
    list.replaceChildren();let index=0;
    for(const [group,items] of groups){
      if(groups.length>1||scope==='')list.append(Object.assign(document.createElement('div'),{className:'palette-group',textContent:t('palette.group.'+group)}));
      for(const item of items){
        const at=index++,row=document.createElement('div');row.className='palette-item';row.id='command-result-'+at;row.setAttribute('role','option');row.setAttribute('aria-selected',String(at===selected));
        row.innerHTML=(item.glyph?'<i class="palette-glyph"></i>':icon(item.icon||'file'))+'<span></span><small></small><kbd></kbd>';
        if(item.glyph)row.firstChild.textContent=item.glyph;
        const label=row.children[1],positions=new Set(item.match?.indices);
        [...item.label].forEach((char,i)=>{if(positions.has(i)){const mark=document.createElement('mark');mark.textContent=char;label.append(mark);}else label.append(char);});
        row.children[2].textContent=item.detail||'';row.lastChild.textContent=item.hint||'';row.lastChild.hidden=!item.hint;
        row.onpointerdown=event=>event.preventDefault();row.onclick=()=>choose(at);row.onpointermove=()=>{if(selected!==at){selected=at;mark();}};list.append(row);
      }
    }
    if(!results.length){list.append(Object.assign(document.createElement('p'),{className:'panel-empty',textContent:t(scopeOf(scope)==='line'?'palette.lineHint':'palette.none')}));input.removeAttribute('aria-activedescendant');}
    mark();
  }
  function mark(){
    for(const row of list.querySelectorAll('.palette-item'))row.setAttribute('aria-selected',String(row.id==='command-result-'+selected));
    if(results.length){input.setAttribute('aria-activedescendant','command-result-'+selected);list.querySelector('#command-result-'+selected)?.scrollIntoView?.({block:'nearest'});}
    const preview=wide()&&results[selected]?.preview?.();
    pane.hidden=!preview;content.classList.toggle('with-preview',!!preview);pane.replaceChildren();
    if(preview){
      const title=Object.assign(document.createElement('div'),{className:'palette-preview-title',textContent:preview.title}),body=Object.assign(document.createElement('pre'),{textContent:preview.text});
      pane.append(title,body);
    }
  }
  // Tab moves between groups; arrows move between items; Backspace on an empty field leaves the scope.
  function jumpGroup(direction){
    let start=0;const starts=groups.map(([,items])=>{const at=start;start+=items.length;return at;});
    const current=starts.findLastIndex(at=>at<=selected);const next=starts[(current+direction+starts.length)%starts.length];
    if(next!=null){selected=next;mark();}
  }
  input.oninput=()=>{
    const prefix=input.value[0];
    if(!scope&&scopeOf(prefix)){input.value=input.value.slice(1).trimStart();setScope(prefix);return;}
    search();
  };
  input.onkeydown=event=>{
    if(event.isComposing)return;
    if(event.key==='Enter'){event.preventDefault();choose(selected);}
    else if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();if(results.length){selected=(selected+(event.key==='ArrowDown'?1:results.length-1))%results.length;mark();}}
    else if(event.key==='Tab'){event.preventDefault();event.stopPropagation();jumpGroup(event.shiftKey?-1:1);}
    else if(event.key==='Backspace'&&!input.value&&scope){event.preventDefault();setScope('');}
  };
  search();input.focus();return dialog;
}
