// Every \label in the project, grouped by what it names, with how often it is referenced.
// Labels nobody references are faded: usually a leftover, sometimes a missing \ref.
const KINDS=[
  ['equation',/^(?:equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math|subequations)$/,'∑'],
  ['figure',/^(?:figure|subfigure|wrapfigure)$/,'▣'],
  ['table',/^(?:table|subtable|tabular|longtable)$/,'▦'],
  ['section',/^section$/,'§'],
  ['theorem',/^(?:theorem|lemma|proposition|corollary|definition|remark|example|proof|claim|conjecture|assumption)$/,'◇'],
  ['item',/^(?:enumerate|itemize|description)$/,'•'],
];
export const labelKind=kind=>KINDS.find(([,pattern])=>pattern.test(kind))?.[0]??'other';
export function createLabels(el,t,reveal){
  let rows=[];
  return {
    /** labels: parseOutline labels; counts: Map<name, references>. */
    update(labels,counts){
      el.replaceChildren();rows=[];
      if(!labels.length){el.append(Object.assign(document.createElement('p'),{className:'outline-empty',textContent:t('labels.empty')}));return;}
      const groups=new Map(KINDS.map(([kind])=>[kind,[]]));groups.set('other',[]);
      for(const label of labels)groups.get(labelKind(label.kind)).push(label);
      for(const [kind,list] of groups){
        if(!list.length)continue;
        const head=document.createElement('span');head.className='label-group';head.textContent=`${t('labels.'+kind)} · ${list.length}`;el.append(head);
        const glyph=KINDS.find(([name])=>name===kind)?.[2]??'#';
        for(const label of list){
          const n=counts.get(label.name)||0,row=document.createElement('button');row.type='button';row.className='label-item';row.dataset.unused=String(!n);
          row.innerHTML='<i aria-hidden="true"></i><span></span><small></small>';row.firstChild.textContent=glyph;row.children[1].textContent=label.name;
          row.lastChild.textContent=n?t('labels.refs',{n}):t('labels.unused');
          row.dataset.tip=[label.text,`${label.file}:${label.line}`].filter(Boolean).join(' · ');
          row.onclick=()=>reveal({path:label.file,line:label.line});
          rows.push([label,row]);el.append(row);
        }
      }
    },
    cursor(path,line){for(const [label,row] of rows)row.setAttribute('aria-current',String(label.file===path&&label.line===line));},
  };
}
