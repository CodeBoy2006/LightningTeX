import {openDialog,confirmDialog} from './overlays.js';

/** Snapshot text is previewed as text, never HTML. Restoration is owned by the workspace. */
export async function openHistory({host,t,lang,store,projectId,persist,restore,notify}){
  const content=document.createElement('div');content.className='history-body';
  content.innerHTML='<p class="history-note"></p><div class="history-content"><div class="history-list"></div><div class="history-preview"><select></select><pre tabindex="0"></pre></div></div><div class="dialog-actions"><button class="btn"></button><button class="btn primary" disabled></button></div>';
  const note=content.firstChild,list=content.querySelector('.history-list'),select=content.querySelector('select'),preview=content.querySelector('pre'),[close,button]=content.lastChild.children;let chosen=null,closed=false;
  const dialog=openDialog(host,{title:t('history.open'),content,className:'history-dialog',onClose:()=>{closed=true;}});
  note.textContent=t(!persist?'history.off':!store?.listSnapshots?'history.unavailable':'history.note');close.textContent=t('common.close');close.onclick=dialog.close;button.textContent=t('history.restore');select.ariaLabel=t('words.file');
  const showText=()=>{preview.textContent=chosen?.files.find(file=>file.path===select.value)?.text||'';};select.onchange=showText;
  button.onclick=async()=>{
    if(!chosen)return;
    if(!await confirmDialog(host,{title:t('history.confirm'),message:t('history.body'),confirm:t('history.restore'),cancel:t('common.cancel')}))return;
    button.disabled=true;
    try{if(await restore(chosen)){dialog.close();notify('history.restored');}}
    catch{notify('history.failed');}finally{button.disabled=false;}
  };
  if(!persist||!store?.listSnapshots){content.querySelector('.history-content').hidden=true;return dialog;}
  try{
    const snapshots=await store.listSnapshots(projectId);if(closed)return dialog;
    if(!snapshots.length){note.textContent=t('history.empty');content.querySelector('.history-content').hidden=true;}
    const formatter=new Intl.DateTimeFormat(lang==='zh'?'zh-CN':'en',{dateStyle:'medium',timeStyle:'short'});
    for(const snapshot of snapshots){
      const row=document.createElement('button');row.type='button';row.innerHTML='<strong></strong><small></small>';row.firstChild.textContent=formatter.format(snapshot.time);row.lastChild.textContent=snapshot.main||'';
      row.onclick=()=>{chosen=snapshot;for(const other of list.children)other.setAttribute('aria-pressed',String(other===row));select.replaceChildren();for(const file of snapshot.files){const option=document.createElement('option');option.value=option.textContent=file.path;select.append(option);}if(snapshot.files.some(f=>f.path===snapshot.main))select.value=snapshot.main;showText();button.disabled=false;};list.append(row);
    }
    list.firstChild?.click();
  }catch{note.textContent=t('history.unavailable');}
  return dialog;
}
