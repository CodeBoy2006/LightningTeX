import {openDialog} from './overlays.js';
import {TEMPLATES,templateProject} from './templates.js';

export function openTemplateGallery({host,t,lang,hasFiles,readArchive,create,notify}){
  const body=document.createElement('div');body.innerHTML='<div class="template-grid"></div><input type="file" accept=".zip,application/zip" hidden><button class="template-drop" type="button"></button><p class="template-warning"></p><div class="dialog-actions"><button class="btn" type="button"></button><button class="btn primary" type="button"></button></div>';
  const [grid,input,drop,warning,actions]=body.children,[cancel,accept]=actions.children;
  let chosen=templateProject(TEMPLATES[0]),busy=false;
  const dialog=openDialog(host,{title:t('project.new'),content:body,className:'template-dialog'});
  warning.textContent=hasFiles?t('project.replaceHint'):'';cancel.textContent=t('common.cancel');accept.textContent=t(hasFiles?'project.replace':'project.create');cancel.onclick=dialog.close;
  for(const [index,template] of TEMPLATES.entries()){
    const card=document.createElement('button');card.className='template-card';card.type='button';card.setAttribute('aria-pressed',String(index===0));
    card.innerHTML=`<span class="template-paper" data-template="${template.id}" aria-hidden="true">${'<i></i>'.repeat(template.id==='blank'?0:9)}</span><strong></strong><small></small>`;
    card.children[1].textContent=template.name[lang]||template.name.en;card.lastChild.textContent=t('template.'+template.id);
    card.onclick=()=>{if(busy)return;chosen=templateProject(template);for(const item of grid.children)item.setAttribute('aria-pressed',String(item===card));drop.textContent=t('project.drop');};grid.append(card);
  }
  drop.textContent=t('project.drop');drop.onclick=()=>input.click();
  async function load(file){
    if(!file||busy)return;busy=true;accept.disabled=true;
    try{chosen=await readArchive(file);for(const card of grid.children)card.setAttribute('aria-pressed','false');drop.textContent=file.name+' · '+chosen.files.length;}
    catch(error){notify('toast.zip',{message:error.message||error});}finally{busy=false;accept.disabled=false;}
  }
  input.onchange=()=>{void load(input.files[0]);input.value='';};
  drop.ondragover=event=>{event.preventDefault();event.stopPropagation();};drop.ondrop=event=>{event.preventDefault();event.stopPropagation();void load(event.dataTransfer.files[0]);};
  accept.onclick=()=>{if(busy)return;create(chosen);dialog.close();};
  grid.firstChild.focus();return dialog;
}
