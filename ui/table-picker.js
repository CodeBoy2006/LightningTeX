// Table and matrix builder: pick rows × columns on a grid, choose a few options, insert a snippet whose
// cells are tab stops. Pure template building lives in tableTemplate/matrixTemplate.
import {openDialog} from './overlays.js';

export const MAX_ROWS=10,MAX_COLS=8;
const MATRICES=['pmatrix','bmatrix','vmatrix','Bmatrix','Vmatrix','matrix'];

/** -> snippet template for a rows × cols tabular. options: {align:'l'|'c'|'r', booktabs, float} */
export function tableTemplate(rows,cols,{align='c',booktabs=false,float=true}={}){
  let n=0;const stop=()=>'${'+(++n)+'}',spec='l'+align.repeat(Math.max(0,cols-1));
  const rule=name=>booktabs?'\\'+name:'\\hline',indent=float?'\t\t':'\t',lines=[];
  if(float)lines.push('\\begin{table}[t]','\t\\centering','\t\\caption{'+stop()+'}','\t\\label{tab:'+stop()+'}');
  lines.push((float?'\t':'')+'\\begin{tabular}{'+spec+'}',indent+rule('toprule'));
  for(let r=0;r<rows;r++){
    lines.push(indent+Array.from({length:cols},stop).join(' & ')+' \\\\');
    if(r===0&&rows>1)lines.push(indent+rule('midrule'));
  }
  lines.push(indent+rule('bottomrule'),(float?'\t':'')+'\\end{tabular}');
  if(float)lines.push('\\end{table}');
  return lines.join('\n')+(float?'\n$0':'$0');
}
/** -> snippet template for a rows × cols matrix; display wraps it in \[ … \] for use outside math. */
export function matrixTemplate(rows,cols,{kind='pmatrix',display=false}={}){
  let n=0;const stop=()=>'${'+(++n)+'}',pad=display?'\t\t':'\t';
  const body=Array.from({length:rows},(_,r)=>pad+Array.from({length:cols},stop).join(' & ')+(r<rows-1?' \\\\':''));
  const lines=[(display?'\t':'')+'\\begin{'+kind+'}',...body,(display?'\t':'')+'\\end{'+kind+'}'];
  return display?'\\[\n'+lines.join('\n')+'\n\\]$0':lines.join('\n')+'$0';
}

/** insert(template, packages) inserts at the caret; mode 'table' | 'matrix'. inMath tells whether the caret is in math. */
export function openTablePicker({host,t,mode='table',inMath=false,insert}){
  const state={mode,rows:3,cols:3,align:'c',booktabs:false,float:true,kind:'pmatrix'};
  const body=document.createElement('div');body.className='tp';
  body.innerHTML='<div class="tp-modes" role="radiogroup"></div><div class="tp-grid" role="grid" tabindex="0"></div><div class="tp-out" aria-live="polite"></div><div class="tp-options"></div><div class="dialog-actions"><button type="button" class="btn"></button><button type="button" class="btn primary"></button></div>';
  const [modes,grid,out,optionsBox,actions]=body.children,[cancel,ok]=actions.children;
  cancel.textContent=t('common.cancel');ok.textContent=t('table.insert');
  const dialog=openDialog(host,{title:t(mode==='matrix'?'matrix.title':'table.title'),content:body,className:'tp-dialog'});
  grid.setAttribute('aria-label',t('table.size'));
  const cells=[];
  for(let r=0;r<MAX_ROWS;r++)for(let c=0;c<MAX_COLS;c++){
    const cell=document.createElement('i');cell.dataset.r=String(r+1);cell.dataset.c=String(c+1);grid.append(cell);cells.push(cell);
  }
  const chips=(values,current,label,set)=>{
    const group=document.createElement('div');group.className='tp-chips';group.setAttribute('role','radiogroup');group.setAttribute('aria-label',label);
    for(const [value,text] of values){
      const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('role','radio');button.setAttribute('aria-checked',String(value===current));
      button.onclick=()=>{set(value);for(const other of group.children)other.setAttribute('aria-checked',String(other===button));paint();};group.append(button);
    }
    return group;
  };
  const toggle=(label,value,set)=>{
    const row=document.createElement('label');row.className='tp-toggle';
    const box=Object.assign(document.createElement('input'),{type:'checkbox',checked:value});box.onchange=()=>{set(box.checked);paint();};
    row.append(box,document.createElement('i'),Object.assign(document.createElement('span'),{textContent:label}));return row;
  };
  const field=(label,control)=>{const row=document.createElement('div');row.className='tp-field';row.append(Object.assign(document.createElement('span'),{textContent:label}),control);return row;};
  function options(){
    optionsBox.replaceChildren();
    if(state.mode==='table'){
      optionsBox.append(field(t('table.align'),chips([['l',t('table.left')],['c',t('table.center')],['r',t('table.right')]],state.align,t('table.align'),value=>{state.align=value;})),
        toggle(t('table.booktabs'),state.booktabs,value=>{state.booktabs=value;}),toggle(t('table.float'),state.float,value=>{state.float=value;}));
    }else optionsBox.append(field(t('matrix.kind'),chips(MATRICES.map(kind=>[kind,kind]),state.kind,t('matrix.kind'),value=>{state.kind=value;})));
  }
  for(const [value,key] of [['table','table.mode'],['matrix','matrix.mode']]){
    const button=document.createElement('button');button.type='button';button.setAttribute('role','radio');button.textContent=t(key);button.dataset.value=value;
    button.onclick=()=>{state.mode=value;dialog.el.querySelector('h2').textContent=t(value==='matrix'?'matrix.title':'table.title');options();paint();};
    modes.append(button);
  }
  function paint(){
    for(const button of modes.children)button.setAttribute('aria-checked',String(button.dataset.value===state.mode));
    for(const cell of cells)cell.classList.toggle('on',Number(cell.dataset.r)<=state.rows&&Number(cell.dataset.c)<=state.cols);
    out.textContent=`${state.rows} × ${state.cols} · `+(state.mode==='table'?`tabular{l${state.align.repeat(state.cols-1)}}`:state.kind);
  }
  const pick=(rows,cols)=>{state.rows=Math.max(1,Math.min(MAX_ROWS,rows));state.cols=Math.max(1,Math.min(MAX_COLS,cols));paint();};
  grid.addEventListener('pointerover',event=>{const cell=event.target.closest('i');if(cell)pick(Number(cell.dataset.r),Number(cell.dataset.c));});
  grid.addEventListener('click',event=>{if(event.target.closest('i'))done();});
  grid.addEventListener('keydown',event=>{
    const moves={ArrowRight:[0,1],ArrowLeft:[0,-1],ArrowDown:[1,0],ArrowUp:[-1,0]}[event.key];
    if(moves){event.preventDefault();pick(state.rows+moves[0],state.cols+moves[1]);}
    else if(event.key==='Enter'){event.preventDefault();done();}
  });
  function done(){
    const template=state.mode==='table'?tableTemplate(state.rows,state.cols,state):matrixTemplate(state.rows,state.cols,{kind:state.kind,display:!inMath});
    const packages=state.mode==='table'?(state.booktabs?['booktabs']:[]):['amsmath'];
    dialog.close();insert(template,packages);
  }
  cancel.onclick=dialog.close;ok.onclick=done;
  options();paint();grid.focus();
  return dialog;
}
