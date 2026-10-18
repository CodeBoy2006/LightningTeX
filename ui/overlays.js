// Menus, dialogs and toasts. Labels are inserted as text; icons are trusted markup.
import {icon} from './icons.js';

// A closing surface stops being a menu or dialog at once, plays its exit, then leaves the DOM.
function leave(node,ms=110){node.removeAttribute('role');node.classList.add('closing');node.inert=true;setTimeout(()=>node.remove(),ms);}

let dismissMenu=null;
/** items: {label, icon?, hint?, checked?, danger?, disabled?, run} | 'separator' | {heading} | {note, noteIcon?, tone?}. at: DOMRect-like or {x,y}. */
export function openMenu(host,at,items){
  dismissMenu?.();
  const menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.tabIndex=-1;
  const previous=document.activeElement;
  const close=(restore=true)=>{
    dismissMenu=null;leave(menu);document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);
    if(restore)previous?.focus?.({preventScroll:true});
  };
  const outside=event=>{if(!menu.contains(event.target))close(false);};
  const buttons=()=>[...menu.querySelectorAll('button:not(:disabled)')];
  function keys(event){
    const list=buttons(),index=list.indexOf(document.activeElement);
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='ArrowDown'){event.preventDefault();list[(index+1)%list.length]?.focus();}
    else if(event.key==='ArrowUp'){event.preventDefault();list[(index-1+list.length)%list.length]?.focus();}
    else if(event.key==='Tab')close();
  }
  for(const item of items){
    if(item==='separator'){menu.append(Object.assign(document.createElement('div'),{className:'menu-separator'}));continue;}
    if(item.heading){menu.append(Object.assign(document.createElement('div'),{className:'menu-heading',textContent:item.heading}));continue;}
    if(item.note){const note=Object.assign(document.createElement('div'),{className:'menu-note'});note.innerHTML=icon(item.noteIcon||'error',13);note.append(item.note);if(item.tone)note.dataset.tone=item.tone;menu.append(note);continue;}
    const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.disabled=!!item.disabled;
    if(item.danger)button.classList.add('danger');
    if(item.checked!==undefined){button.setAttribute('role','menuitemcheckbox');button.setAttribute('aria-checked',String(!!item.checked));}
    button.innerHTML=`<span class="menu-icon">${item.checked?icon('check'):item.icon?icon(item.icon):''}</span><span class="menu-label"></span><span class="menu-hint"></span>`;
    button.children[1].textContent=item.label;button.children[2].textContent=item.hint||'';
    button.addEventListener('click',()=>{close();item.run?.();});
    menu.append(button);
  }
  dismissMenu=()=>close(false);
  host.append(menu);
  // Keep the menu inside the window, flipping above or left of the anchor when needed; it grows out of the anchor.
  const bounds=host.getBoundingClientRect?.()||{left:0,top:0,width:1e4,height:1e4},width=menu.offsetWidth,height=menu.offsetHeight;
  const x=at.left??at.x,y=at.bottom!=null?at.bottom+4:at.y,anchorTop=at.top??at.y,left=Math.max(8,Math.min(x-bounds.left,bounds.width-width-8)),above=y-bounds.top+height>bounds.height-8;
  menu.style.left=left+'px';menu.style.top=Math.max(8,above?anchorTop-bounds.top-height-4:y-bounds.top)+'px';
  menu.style.transformOrigin=`${left<x-bounds.left?'right':'left'} ${above?'bottom':'top'}`;
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
  (buttons()[0]||menu).focus({preventScroll:true});
}

/** A non-modal surface anchored below `at` (a DOMRect). It closes on Escape, an outside press, or close().
 *  Returns {el, close}; onClose runs once. */
export function openPopover(host,at,content,{className='',label='',onClose}={}){
  dismissMenu?.();
  const el=document.createElement('div');el.className='popover '+className;el.setAttribute('role','dialog');if(label)el.setAttribute('aria-label',label);el.tabIndex=-1;el.append(content);
  let closed=false;const previous=document.activeElement;
  const close=(restore=true)=>{if(closed)return;closed=true;dismissMenu=null;document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);leave(el);if(restore&&el.contains(document.activeElement))previous?.focus?.({preventScroll:true});onClose?.();};
  const outside=event=>{if(!el.contains(event.target)&&!event.target.closest?.('[data-popover-anchor]'))close(false);};
  const keys=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}};
  host.append(el);
  const bounds=host.getBoundingClientRect?.()||{left:0,top:0,width:1e4,height:1e4},width=el.offsetWidth;
  const left=Math.max(8,Math.min(at.right!=null?at.right-width-bounds.left:at.left-bounds.left,bounds.width-width-8));
  el.style.left=left+'px';el.style.top=(at.bottom-bounds.top+6)+'px';el.style.transformOrigin=`${at.right!=null?'right':'left'} top`;
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
  dismissMenu=()=>close(false);
  return {el,close};
}

/** A modal surface around `content` (a Node). Returns {el, close}; onClose runs once however it closes.
 *  hideTitle keeps the title as the accessible name only, for surfaces whose content already says what they are. */
export function openDialog(host,{title,content,className='',onClose,hideTitle=false}){
  dismissMenu?.();
  const backdrop=document.createElement('div');backdrop.className='dialog-backdrop';
  backdrop.innerHTML='<div class="dialog" role="dialog" aria-modal="true"><h2></h2></div>';
  // Notices stay usable above a dialog, so an Undo offered from inside it can be taken.
  const dialog=backdrop.firstChild,previous=document.activeElement,background=[...host.children].filter(node=>!node.classList.contains('toasts')).map(node=>[node,node.inert]);let closed=false;
  for(const [node] of background)node.inert=true;
  if(className)dialog.classList.add(className);
  if(hideTitle)dialog.firstChild.remove();else dialog.firstChild.textContent=title;dialog.setAttribute('aria-label',title);dialog.append(content);
  const close=()=>{if(closed)return;closed=true;for(const [node,inert] of background)node.inert=inert;dialog.removeAttribute('role');leave(backdrop,140);previous?.focus?.({preventScroll:true});onClose?.();};
  backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)close();});
  backdrop.addEventListener('keydown',event=>{
    event.stopPropagation();
    if(event.key==='Escape'){event.preventDefault();close();return;}
    if(event.key!=='Tab')return;
    const stops=[...dialog.querySelectorAll('button:not(:disabled),input:not(:disabled):not([type="hidden"]),textarea,select,[tabindex="0"]')].filter(node=>!node.hidden&&!node.closest('[hidden]')),edge=stops[event.shiftKey?0:stops.length-1];
    if(!stops.length||document.activeElement===edge||!dialog.contains(document.activeElement)){event.preventDefault();stops[event.shiftKey?stops.length-1:0]?.focus();}
  });
  host.append(backdrop);dialog.tabIndex=-1;dialog.focus({preventScroll:true});
  return {el:dialog,close};
}

/** Resolves true when confirmed. */
export function confirmDialog(host,{title,message,confirm,cancel,danger=false}){
  return new Promise(resolve=>{
    const body=document.createElement('div');body.className='dialog-body';
    body.innerHTML='<p></p><div class="dialog-actions"><button type="button" class="btn"></button><button type="button" class="btn primary"></button></div>';
    const [text,actions]=body.children,[no,yes]=actions.children;let result=false;
    text.textContent=message||'';text.hidden=!message;no.textContent=cancel;yes.textContent=confirm;
    if(danger)yes.classList.add('danger');
    const dialog=openDialog(host,{title,content:body,onClose:()=>resolve(result)});dialog.el.setAttribute('role','alertdialog');
    no.addEventListener('click',dialog.close);yes.addEventListener('click',()=>{result=true;dialog.close();});
    yes.focus();
  });
}

/** A stack of at most three notices in el (the container). Each keeps its own action and countdown;
 *  hovering or focusing the stack pauses every countdown. */
export function createToast(el,{limit=3}={}){
  const items=[];let paused=false;
  const motion=()=>!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // Older notices glide to their new places instead of jumping when one arrives or leaves.
  function settle(change){
    const before=new Map(items.map(item=>[item,item.el.getBoundingClientRect?.().top]));
    change();
    if(!motion())return;
    for(const [item,top] of before){
      const now=item.el.isConnected&&item.el.getBoundingClientRect?.().top;
      if(Number.isFinite(top)&&Number.isFinite(now)&&Math.abs(top-now)>.5)item.el.animate?.([{transform:`translateY(${top-now}px)`},{transform:'none'}],{duration:240,easing:'cubic-bezier(.2,0,0,1)'});
    }
  }
  function arm(item){clearTimeout(item.timer);item.deadline=Date.now()+item.left;if(!paused)item.timer=setTimeout(()=>dismiss(item),item.left);}
  function dismiss(item){
    const index=items.indexOf(item);if(index<0)return;
    clearTimeout(item.timer);items.splice(index,1);
    item.el.removeAttribute('role');item.el.classList.add('leaving');item.el.inert=true;
    const gone=()=>{if(item.el.isConnected)settle(()=>item.el.remove());if(!items.length)el.hidden=true;};
    if(motion()&&item.el.animate)setTimeout(gone,140);else gone();
  }
  function paint(item){
    item.text.textContent=item.label;
    item.button.hidden=!item.undo.length;
    item.bar.style.animation='none';void item.bar.offsetWidth;item.bar.style.animation='';item.bar.style.animationDuration=item.life+'ms';
  }
  /** action: {label, run} adds a button, e.g. Undo. options.key merges repeated notices of one kind:
   *  options.merged(count) gives the combined text, and the action then undoes every merged step. */
  function show(text,action,{key,merged}={}){
    const life=action?7000:4000,same=key&&items.find(item=>item.key===key&&item.action?.label===action?.label);
    if(same){
      same.count++;same.label=merged?merged(same.count):text;if(action)same.undo.push(action.run);
      same.left=same.life=life;paint(same);arm(same);return;
    }
    const node=document.createElement('div');node.className='toast';node.setAttribute('role','status');
    const item={key,action,life,left:life,count:1,label:text,undo:action?[action.run]:[],el:node,
      text:Object.assign(document.createElement('span'),{className:'toast-text'}),
      button:Object.assign(document.createElement('button'),{type:'button',className:'toast-action',textContent:action?.label||''}),
      bar:Object.assign(document.createElement('i'),{className:'toast-life'})};
    item.button.addEventListener('click',()=>{const steps=[...item.undo].reverse();dismiss(item);for(const step of steps)step();});
    node.append(item.text);if(action)node.append(item.button);node.append(item.bar);paint(item);
    // Newest first in reading order; the stack is drawn bottom-up, so it also sits lowest on screen.
    settle(()=>{el.prepend(node);items.push(item);while(items.length>limit)dismiss(items[0]);});
    el.hidden=false;arm(item);
  }
  const pause=()=>{if(paused)return;paused=true;el.dataset.paused='';for(const item of items){clearTimeout(item.timer);item.left=Math.max(600,item.deadline-Date.now());}};
  const resume=()=>{if(!paused||el.matches?.(':hover,:focus-within'))return;paused=false;delete el.dataset.paused;for(const item of items)arm(item);};
  el.addEventListener('pointerenter',pause);el.addEventListener('pointerleave',resume);el.addEventListener('focusin',pause);el.addEventListener('focusout',()=>setTimeout(resume));
  const hide=()=>{for(const item of items){clearTimeout(item.timer);}items.length=0;el.replaceChildren();el.hidden=true;};
  return {show,hide};
}
