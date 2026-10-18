import {openDialog,confirmDialog} from './overlays.js';
import {diffLines,foldDiff,diffStats} from '../core/diff.js';

/** Snapshot text is previewed as text, never HTML. Restoration is owned by the workspace.
 *  current() -> [{path, text}] of the project now; a chosen snapshot opens on its changes against it.
 *  restore(snapshot) puts the whole snapshot back; restoreFile(snapshot, path) only one of its files. */
export async function openHistory({host,t,lang,store,projectId,persist,restore,restoreFile,current=()=>[],notify}){
  const content=document.createElement('div');content.className='history-body';
  content.innerHTML='<p class="history-note"></p><div class="history-content"><div class="history-list"></div><div class="history-preview"><div class="history-bar"><div class="history-files" role="tablist"></div><div class="history-view" role="radiogroup"></div></div><div class="history-diff" tabindex="0"></div><pre tabindex="0" hidden></pre></div></div><div class="dialog-actions"><button class="btn"></button><span class="spacer"></span><button class="btn restore-file" disabled></button><button class="btn primary" disabled></button></div>';
  const note=content.firstChild,list=content.querySelector('.history-list'),filesBar=content.querySelector('.history-files'),viewBar=content.querySelector('.history-view');
  const diffBox=content.querySelector('.history-diff'),preview=content.querySelector('pre'),[close,,fileButton,button]=content.lastChild.children;
  let chosen=null,closed=false,path=null,view='changes';
  const dialog=openDialog(host,{title:t('history.open'),content,className:'history-dialog',onClose:()=>{closed=true;}});
  note.textContent=t(!persist?'history.off':!store?.listSnapshots?'history.unavailable':'history.note');close.textContent=t('common.close');close.onclick=dialog.close;
  button.textContent=t('history.restore');fileButton.textContent=t('history.restoreFile');
  for(const [value,key] of [['changes','history.changes'],['full','history.full']]){
    const option=document.createElement('button');option.type='button';option.setAttribute('role','radio');option.dataset.value=value;option.textContent=t(key);
    option.onclick=()=>{view=value;paint();};viewBar.append(option);
  }
  const now=()=>new Map(current().map(file=>[file.path,file.text]));
  // Per-file comparison of a snapshot (before) with the project now (after).
  function compare(snapshot){
    const live=now(),old=new Map(snapshot.files.map(file=>[file.path,file.text])),rows=[];
    for(const name of new Set([...old.keys(),...live.keys()])){
      const before=old.get(name),after=live.get(name);
      if(typeof after!=='string'&&typeof before!=='string')continue;
      const big=(before?.length||0)+(after?.length||0)>600000,ops=big?null:diffLines(before??'',after??'');
      const stats=ops?(before==null?{added:after.split('\n').length,removed:0}:after==null?{added:0,removed:before.split('\n').length}:diffStats(ops)):{added:0,removed:0};
      rows.push({path:name,before,after,ops,stats,changed:before!==after});
    }
    return rows.sort((a,b)=>Number(b.path===snapshot.main)-Number(a.path===snapshot.main)||a.path.localeCompare(b.path));
  }
  let rows=[];
  function paint(){
    for(const option of viewBar.children)option.setAttribute('aria-checked',String(option.dataset.value===view));
    filesBar.replaceChildren();
    for(const row of rows){
      const chip=document.createElement('button');chip.type='button';chip.className='history-file';chip.setAttribute('role','tab');chip.setAttribute('aria-selected',String(row.path===path));chip.dataset.changed=String(row.changed);
      chip.append(Object.assign(document.createElement('span'),{textContent:row.path}));
      if(row.changed){
        if(row.stats.added)chip.append(Object.assign(document.createElement('b'),{className:'plus',textContent:'+'+row.stats.added}));
        if(row.stats.removed)chip.append(Object.assign(document.createElement('b'),{className:'minus',textContent:'−'+row.stats.removed}));
        if(row.before==null)chip.dataset.tip=t('history.newFile');else if(row.after==null)chip.dataset.tip=t('history.goneFile');
      }
      chip.onclick=()=>{path=row.path;paint();};filesBar.append(chip);
    }
    const row=rows.find(item=>item.path===path);
    preview.textContent=row?.before??'';
    preview.hidden=view!=='full';diffBox.hidden=view==='full';
    fileButton.disabled=!row||row.before==null||!row.changed||!restoreFile;
    diffBox.replaceChildren();
    if(view!=='changes'||!row)return;
    if(!row.changed){diffBox.append(Object.assign(document.createElement('p'),{className:'history-same',textContent:t('history.same')}));return;}
    if(!row.ops){diffBox.append(Object.assign(document.createElement('p'),{className:'history-same',textContent:t('history.tooBig')}));return;}
    const head=document.createElement('div');head.className='diff-head';head.append(Object.assign(document.createElement('span'),{textContent:t('history.direction')}));diffBox.append(head);
    renderOps(foldDiff(row.ops,2),row.ops);
  }
  function renderOps(items,ops){
    for(const item of items){
      if(item.type==='fold'){
        const fold=document.createElement('button');fold.type='button';fold.className='diff-fold';fold.textContent=t('history.unchanged',{n:item.count});
        // Expanding a fold shows exactly the unchanged run it stands for.
        fold.onclick=()=>{const start=ops.indexOf(item.from),node=fold;const frag=document.createDocumentFragment();for(const op of ops.slice(start,start+item.count))frag.append(line(op));node.replaceWith(frag);};
        diffBox.append(fold);continue;
      }
      diffBox.append(line(item));
    }
  }
  function line(op){
    const row=document.createElement('div');row.className='diff-line '+op.type;
    row.append(Object.assign(document.createElement('span'),{className:'diff-no',textContent:op.a??''}),Object.assign(document.createElement('span'),{className:'diff-no',textContent:op.b??''}),
      Object.assign(document.createElement('span'),{className:'diff-sign',textContent:op.type==='add'?'+':op.type==='del'?'−':''}),Object.assign(document.createElement('code'),{textContent:op.text||' '}));
    return row;
  }
  button.onclick=async()=>{
    if(!chosen)return;
    if(!await confirmDialog(host,{title:t('history.confirm'),message:t('history.body'),confirm:t('history.restore'),cancel:t('common.cancel')}))return;
    button.disabled=true;
    try{if(await restore(chosen)){dialog.close();notify('history.restored');}}
    catch{notify('history.failed');}finally{button.disabled=false;}
  };
  fileButton.onclick=async()=>{
    if(!chosen||!path)return;
    if(!await confirmDialog(host,{title:t('history.fileConfirm',{name:path}),message:t('history.fileBody'),confirm:t('history.restoreFile'),cancel:t('common.cancel')}))return;
    fileButton.disabled=true;
    try{if(await restoreFile(chosen,path)){dialog.close();notify('history.fileRestored',{name:path});}}
    catch{notify('history.failed');}finally{fileButton.disabled=false;}
  };
  if(!persist||!store?.listSnapshots){content.querySelector('.history-content').hidden=true;return dialog;}
  try{
    const snapshots=await store.listSnapshots(projectId);if(closed)return dialog;
    if(!snapshots.length){note.textContent=t('history.empty');content.querySelector('.history-content').hidden=true;}
    const formatter=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en',{dateStyle:'medium',timeStyle:'short'});
    for(const snapshot of snapshots){
      const row=document.createElement('button');row.type='button';row.innerHTML='<strong></strong><small></small>';row.firstChild.textContent=formatter.format(snapshot.time);
      const summary=compare(snapshot),changed=summary.filter(item=>item.changed),added=changed.reduce((n,item)=>n+item.stats.added,0),removed=changed.reduce((n,item)=>n+item.stats.removed,0);
      row.lastChild.textContent=changed.length?t('history.delta',{added,removed,files:changed.length}):t('history.identical');
      row.onclick=()=>{
        chosen=snapshot;rows=compare(snapshot);
        for(const other of list.children)other.setAttribute('aria-pressed',String(other===row));
        // With one changed file, open it; otherwise the main file if it changed, else the first change.
        const changes=rows.filter(item=>item.changed);
        path=(changes.length===1?changes[0]:changes.find(item=>item.path===snapshot.main)||changes[0]||rows.find(item=>item.path===snapshot.main)||rows[0])?.path??null;
        button.disabled=false;paint();
      };
      list.append(row);
    }
    list.firstChild?.click();
  }catch{note.textContent=t('history.unavailable');}
  return dialog;
}
