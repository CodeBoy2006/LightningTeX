// Menus, confirmation dialogs and toasts. Labels are inserted as text; icons are trusted markup.
import {icon} from './icons.js';

let dismissMenu=null;
/** items: {label, icon?, hint?, danger?, disabled?, checked?, run} | 'separator' | {heading}. at: DOMRect-like or {x,y}. */
export function openMenu(host,at,items){
  dismissMenu?.();
  const menu=document.createElement('div');menu.className='menu';menu.setAttribute('role','menu');menu.tabIndex=-1;
  const previous=document.activeElement;
  const close=(restore=true)=>{
    dismissMenu=null;menu.remove();document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',keys,true);
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
    button.innerHTML=`<span class="menu-icon">${item.checked?icon('check'):item.icon?icon(item.icon):''}</span><span class="menu-label"></span><span class="menu-hint"></span>`;
    button.children[1].textContent=item.label;button.children[2].textContent=item.hint||'';
    button.addEventListener('click',()=>{close();item.run?.();});
    menu.append(button);
  }
  dismissMenu=()=>close(false);
  host.append(menu);
  // Keep the menu inside the window, flipping above or left of the anchor when needed.
  const bounds=host.getBoundingClientRect?.()||{left:0,top:0,width:1e4,height:1e4},width=menu.offsetWidth,height=menu.offsetHeight;
  const x=at.x??at.left,y=at.y??at.bottom+4,anchorTop=at.y??at.top;
  menu.style.left=Math.max(8,Math.min(x-bounds.left,bounds.width-width-8))+'px';
  menu.style.top=Math.max(8,y-bounds.top+height>bounds.height-8?anchorTop-bounds.top-height-4:y-bounds.top)+'px';
  document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',keys,true);
  (buttons()[0]||menu).focus({preventScroll:true});
  return close;
}

/** Resolves true when confirmed. */
export function confirmDialog(host,{title,message,confirm,cancel,danger=false}){
  return new Promise(resolve=>{
    const backdrop=document.createElement('div');backdrop.className='dialog-backdrop';
    backdrop.innerHTML='<div class="dialog" role="alertdialog" aria-modal="true"><h2></h2><p></p><div class="dialog-actions"><button type="button" class="btn"></button><button type="button" class="btn primary"></button></div></div>';
    const [heading,body,actions]=backdrop.firstChild.children,[no,yes]=actions.children,previous=document.activeElement;
    heading.textContent=title;body.textContent=message||'';body.hidden=!message;no.textContent=cancel;yes.textContent=confirm;
    if(danger)yes.classList.add('danger');
    const finish=value=>{backdrop.remove();previous?.focus?.({preventScroll:true});resolve(value);};
    no.addEventListener('click',()=>finish(false));yes.addEventListener('click',()=>finish(true));
    backdrop.addEventListener('pointerdown',event=>{if(event.target===backdrop)finish(false);});
    backdrop.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.key==='Escape')finish(false);
      else if(event.key==='Tab'){event.preventDefault();(document.activeElement===yes?no:yes).focus();}
    });
    host.append(backdrop);yes.focus();
  });
}

export function createToast(el){
  let timer;
  const hide=()=>{clearTimeout(timer);el.hidden=true;};
  /** action: {label, run} adds a button, e.g. Undo. */
  const show=(text,action)=>{
    clearTimeout(timer);el.replaceChildren(Object.assign(document.createElement('span'),{textContent:text}));
    if(action){
      const button=Object.assign(document.createElement('button'),{type:'button',className:'toast-action',textContent:action.label});
      button.addEventListener('click',()=>{hide();action.run();});el.append(button);
    }
    el.hidden=false;timer=setTimeout(hide,action?7000:4000);
  };
  return {show,hide};
}
