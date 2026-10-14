// Menus, dialogs and toasts. Labels are inserted as text; icons are trusted markup.
import {icon} from './icons.js';

// A closing surface stops being a menu or dialog at once, plays its exit, then leaves the DOM.
function leave(node,ms=110){node.removeAttribute('role');node.classList.add('closing');node.inert=true;setTimeout(()=>node.remove(),ms);}

let dismissMenu=null;
/** items: {label, icon?, hint?, checked?, danger?, disabled?, run} | 'separator' | {heading}. at: DOMRect-like or {x,y}. */
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
    else if(event.key==='Tab')close(false);
  }
  for(const item of items){
    if(item==='separator'){menu.append(Object.assign(document.createElement('div'),{className:'menu-separator'}));continue;}
    if(item.heading){menu.append(Object.assign(document.createElement('div'),{className:'menu-heading',textContent:item.heading}));continue;}
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

/** A modal surface around `content` (a Node). Returns {el, close}; onClose runs once however it closes. */
export function openDialog(host,{title,content,className='',onClose}){
  dismissMenu?.();
  const backdrop=document.createElement('div');backdrop.className='dialog-backdrop';
  backdrop.innerHTML='<div class="dialog" role="dialog" aria-modal="true"><h2></h2></div>';
  const dialog=backdrop.firstChild,previous=document.activeElement,background=[...host.children].map(node=>[node,node.inert]);let closed=false;
  for(const [node] of background)node.inert=true;
  if(className)dialog.classList.add(className);
  dialog.firstChild.textContent=title;dialog.setAttribute('aria-label',title);dialog.append(content);
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

export function createToast(el){
  let timer;
  const hide=()=>{clearTimeout(timer);el.hidden=true;};
  /** action: {label, run} adds a button, e.g. Undo. A thin line counts down the time left. */
  const show=(text,action)=>{
    const life=action?7000:4000,bar=Object.assign(document.createElement('i'),{className:'toast-life'});
    clearTimeout(timer);el.replaceChildren(Object.assign(document.createElement('span'),{textContent:text}));
    if(action){
      const button=Object.assign(document.createElement('button'),{type:'button',className:'toast-action',textContent:action.label});
      button.addEventListener('click',()=>{hide();action.run();});el.append(button);
    }
    bar.style.animationDuration=life+'ms';el.append(bar);
    el.hidden=false;timer=setTimeout(hide,life);
  };
  return {show,hide};
}
