// Where the caret is: folder › file › section › environment. While the caret is scrolled out of view the
// section follows the top of the view instead, so the bar doubles as a sticky section header.
import {icon} from './icons.js';
export function createBreadcrumbs(el,{t,onPath,onSection,onEnvironment}){
  let key='';
  /** at: {path, heading?, environment?:{name,display?}, stuck?} */
  function update(at){
    const next=JSON.stringify([at?.path,at?.heading?.offset,at?.heading?.file,at?.heading?.title,at?.environment?.name,at?.environment?.from,!!at?.stuck]);
    if(next===key)return;key=next;el.replaceChildren();el.hidden=!at?.path;if(!at?.path)return;
    const separator=()=>{const sep=document.createElement('span');sep.className='crumb-sep';sep.setAttribute('aria-hidden','true');sep.innerHTML=icon('chevronRight',10);el.append(sep);};
    const parts=at.path.split('/');
    parts.forEach((part,index)=>{
      if(index)separator();
      const button=document.createElement('button');button.type='button';button.className='crumb'+(index===parts.length-1?' crumb-file':'');button.textContent=part;
      button.onclick=()=>onPath(parts.slice(0,index+1).join('/'));el.append(button);
    });
    if(at.heading){
      separator();
      const button=document.createElement('button');button.type='button';button.className='crumb crumb-section'+(at.stuck?' stuck':'');button.setAttribute('aria-haspopup','menu');
      button.innerHTML='<b></b><span></span>'+icon('chevronDown',10);button.firstChild.textContent=at.heading.number;button.firstChild.hidden=!at.heading.number;button.children[1].textContent=at.heading.title;
      button.dataset.tip=t(at.stuck?'crumbs.stuck':'crumbs.sections');button.onclick=()=>onSection(at.heading,button.getBoundingClientRect());el.append(button);
    }
    if(at.environment){
      separator();
      const button=document.createElement('button');button.type='button';button.className='crumb crumb-env';
      button.textContent=at.environment.display||at.environment.name;button.dataset.tip=t('crumbs.select');button.onclick=()=>onEnvironment(at.environment);el.append(button);
    }
  }
  return {update,reset(){key='';}};
}
