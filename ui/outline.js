import {basename} from './project.js';
export function createOutline(el,t,reveal){
  let headings=[];
  return {
    update(next,problems=[]){
      headings=next;el.replaceChildren();
      if(!headings.length)el.append(Object.assign(document.createElement('p'),{className:'outline-empty',textContent:t('outline.empty')}));
      for(const [index,heading] of headings.entries()){
        const row=document.createElement('button');row.type='button';row.className='outline-item';row.style.setProperty('--depth',heading.level);row.dataset.index=index;
        const end=headings.slice(index+1).find(other=>other.file===heading.file)?.line??Infinity,count=problems.filter(problem=>problem.file===heading.file&&problem.line>=heading.line&&problem.line<end).length;
        row.innerHTML='<b></b><span></span><small></small>';row.firstChild.textContent=heading.number;row.children[1].textContent=heading.title;row.lastChild.textContent=count?'! '+count:basename(heading.file);row.lastChild.dataset.problem=String(!!count);
        row.dataset.tip=`${heading.title} · ${heading.file}:${heading.line}`;row.onclick=()=>reveal({path:heading.file,line:heading.line});el.append(row);
      }
    },
    cursor(path,line){const current=headings.findLastIndex(heading=>heading.file===path&&heading.line<=line);for(const row of el.querySelectorAll('button'))row.setAttribute('aria-current',String(Number(row.dataset.index)===current));},
  };
}
