// Project tree: open, create, rename in place, delete, set main file, move by drag, drop to upload.
import {icon} from './icons.js';
import {basename,dirname,joinPath,isImagePath,canBeMain} from './project.js';
import {openMenu} from './overlays.js';
const DRAG='text/x-lightningtex';
const fileIcon=path=>isImagePath(path)?'image':/\.(tex|sty|cls|bib|ltx)$/i.test(path)?'tex':'file';

/** actions: open(path), remove(path), download(path), upload(files, dir), pick(dir), notify(key, values) */
export function createFileTree({el,host,project,t,actions}){
  const collapsed=new Set();let selected=null,active=null,renaming=null;
  const rows=()=>{
    const folders=project.folders(),files=project.paths(),out=[];
    const walk=(dir,depth)=>{
      for(const folder of folders)if(dirname(folder)===dir){out.push({path:folder,folder:true,depth});if(!collapsed.has(folder))walk(folder,depth+1);}
      for(const file of files)if(dirname(file)===dir)out.push({path:file,folder:false,depth});
    };
    walk('',0);return out;
  };
  const rowOf=path=>[...el.children].find(row=>row.dataset.path===path);
  function render(){
    const focused=el.contains(document.activeElement)&&document.activeElement.tagName!=='INPUT',list=rows();
    if(selected&&!list.some(row=>row.path===selected))selected=null;
    el.replaceChildren();
    for(const row of list){
      const item=document.createElement('div');item.className='row';item.setAttribute('role','treeitem');item.draggable=true;
      item.dataset.path=row.path;item.dataset.kind=row.folder?'folder':'file';item.style.setProperty('--depth',String(row.depth));
      item.tabIndex=row.path===(selected??list[0].path)?0:-1;
      item.setAttribute('aria-selected',String(row.path===active));
      if(row.folder)item.setAttribute('aria-expanded',String(!collapsed.has(row.path)));
      if(row.path===selected)item.classList.add('selected');
      const main=row.path===project.main;
      item.innerHTML=`<span class="row-twist">${row.folder?icon(collapsed.has(row.path)?'chevronRight':'chevronDown',12):''}</span><span class="row-icon">${icon(row.folder?'folder':fileIcon(row.path))}</span><span class="row-name"></span>`+
        (main?`<span class="row-main">${icon('bolt',12)}</span>`:'')+`<button type="button" class="icon-btn row-more" tabindex="-1">${icon('more')}</button>`;
      item.children[2].textContent=basename(row.path);
      if(main)item.children[3].title=t('file.main');
      item.lastChild.setAttribute('aria-label',t('file.more'));
      if(row.path===renaming)item.children[2].replaceWith(renameInput(row.path));
      el.append(item);
    }
    if(renaming){const input=el.querySelector('.row-rename');input?.focus();const dot=input?.value.lastIndexOf('.');input?.setSelectionRange(0,dot>0?dot:input.value.length);}
    else if(focused)(rowOf(selected)||el.firstChild)?.focus();
  }
  function renameInput(path){
    const input=document.createElement('input');input.className='row-rename';input.value=basename(path);input.spellcheck=false;input.setAttribute('aria-label',t('file.rename'));
    let done=false;
    const finish=commit=>{
      if(done)return;done=true;renaming=null;
      const name=input.value.trim();let target=path;
      if(commit&&name&&name!==basename(path))try{target=project.rename(path,joinPath(dirname(path),name));}catch(error){actions.notify(error.message==='exists'?'toast.exists':'toast.badName',{name});}
      selected=target;render();rowOf(target)?.focus();
      if(project.has(target))actions.open(target);
    };
    // Focus moves to the editor on commit; the key must not act there as well.
    input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key!=='Enter'&&event.key!=='Escape')return;event.preventDefault();finish(event.key==='Enter');});
    input.addEventListener('blur',()=>finish(true));
    for(const type of ['click','dblclick','pointerdown'])input.addEventListener(type,event=>event.stopPropagation());
    return input;
  }
  const expandTo=path=>{for(let dir=dirname(path);dir;dir=dirname(dir))collapsed.delete(dir);};
  function create(folder,dir=''){
    try{
      const path=folder?project.mkdir(project.unique(dir,'folder')):project.write(project.unique(dir,'untitled.tex'),'');
      collapsed.delete(dir);expandTo(path);selected=path;renaming=path;render();
    }catch{actions.notify('toast.badName');}
  }
  const rename=path=>{renaming=path;selected=path;render();};
  function toggle(path){collapsed.has(path)?collapsed.delete(path):collapsed.add(path);render();}
  function menu(path,at){
    const folder=path&&project.isFolder(path),dir=!path?'':folder?path:dirname(path);
    const creation=[{label:t(path?'file.newHere':'file.new'),icon:'fileAdd',run:()=>create(false,dir)},{label:t(path?'folder.newHere':'folder.new'),icon:'folderAdd',run:()=>create(true,dir)},{label:t('file.upload'),icon:'upload',run:()=>actions.pick(dir)}];
    if(!path){openMenu(host,at,creation);return;}
    openMenu(host,at,[...(folder?[...creation,'separator']:[]),{label:t('file.rename'),icon:'edit',hint:'F2',run:()=>rename(path)},
      ...(folder?[]:[{label:t('file.setMain'),icon:'bolt',disabled:!canBeMain(path)||path===project.main,run:()=>project.setMain(path)},{label:t('file.download'),icon:'download',run:()=>actions.download(path)}]),
      'separator',{label:t('file.delete'),icon:'trash',danger:true,run:()=>actions.remove(path)}]);
  }
  const pathAt=event=>event.target.closest?.('.row')?.dataset.path??null;
  const dropDir=event=>{const path=pathAt(event);return !path?'':project.isFolder(path)?path:dirname(path);};
  const clearDrop=()=>{el.removeAttribute('data-drop');for(const row of el.querySelectorAll('.drop'))row.classList.remove('drop');};
  el.addEventListener('click',event=>{
    const path=pathAt(event);if(!path||renaming)return;
    selected=path;
    if(event.target.closest('.row-more')){render();menu(path,event.target.closest('.row-more').getBoundingClientRect());return;}
    if(project.isFolder(path))toggle(path);else{render();actions.open(path);}
  });
  el.addEventListener('dblclick',event=>{const path=pathAt(event);if(path&&!project.isFolder(path)&&!event.target.closest('.row-more'))rename(path);});
  el.addEventListener('contextmenu',event=>{event.preventDefault();const path=pathAt(event);if(path){selected=path;render();}menu(path,{x:event.clientX,y:event.clientY});});
  el.addEventListener('keydown',event=>{
    const path=pathAt(event);if(!path||renaming)return;
    const list=[...el.children],index=list.findIndex(row=>row.dataset.path===path),folder=project.isFolder(path);
    const move=to=>{const row=list[to];if(row){selected=row.dataset.path;render();rowOf(selected)?.focus();}};
    if(event.key==='ArrowDown')move(index+1);else if(event.key==='ArrowUp')move(index-1);
    else if(event.key==='ArrowRight'&&folder&&collapsed.has(path))toggle(path);
    else if(event.key==='ArrowLeft'&&folder&&!collapsed.has(path))toggle(path);
    else if(event.key==='Enter'||event.key===' ')folder?toggle(path):actions.open(path);
    else if(event.key==='F2')rename(path);
    else if(event.key==='Delete'||(event.key==='Backspace'&&(event.metaKey||event.ctrlKey)))actions.remove(path);
    else return;
    event.preventDefault();
  });
  el.addEventListener('dragstart',event=>{const path=pathAt(event);if(!path||renaming){event.preventDefault();return;}event.dataTransfer.setData(DRAG,path);event.dataTransfer.effectAllowed='move';});
  el.addEventListener('dragover',event=>{
    const types=[...(event.dataTransfer?.types||[])];if(!types.includes(DRAG)&&!types.includes('Files'))return;
    event.preventDefault();clearDrop();
    const dir=dropDir(event);if(dir)rowOf(dir)?.classList.add('drop');else el.dataset.drop='true';
  });
  el.addEventListener('dragleave',event=>{if(!el.contains(event.relatedTarget))clearDrop();});
  el.addEventListener('drop',event=>{
    const from=event.dataTransfer.getData(DRAG),dir=dropDir(event);event.preventDefault();event.stopPropagation();clearDrop();
    if(!from){if(event.dataTransfer.files.length)actions.upload([...event.dataTransfer.files],dir);return;}
    if(dirname(from)===dir||dir===from||dir.startsWith(from+'/'))return;
    try{selected=project.rename(from,joinPath(dir,basename(from)));collapsed.delete(dir);render();}
    catch(error){actions.notify(error.message==='exists'?'toast.exists':'toast.badName',{name:basename(from)});}
  });
  return {
    render,create,menu,
    /** Highlight the file shown in the editor and make sure its folders are open. */
    setActive(path){active=path;if(path){selected=path;expandTo(path);}render();},
    /** Folder that new or uploaded files should land in, from the current selection. */
    get directory(){return !selected?'':project.isFolder(selected)?selected:dirname(selected);},
  };
}
