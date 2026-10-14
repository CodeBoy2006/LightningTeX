// Section outline. Each row shows its words with a bar scaled to the longest section; a section with
// problems shows their count instead. Multi-file projects get a quiet file heading where the file changes.
export function createOutline(el,t,reveal){
  let headings=[];
  return {
    /** next: headings from parseOutline; words: [{heading, n}] in the same order. */
    update(next,problems=[],words=[]){
      headings=next;el.replaceChildren();
      if(!headings.length)el.append(Object.assign(document.createElement('p'),{className:'outline-empty',textContent:t('outline.empty')}));
      const counts=new Map(words.map(({heading,n})=>[heading,n])),most=Math.max(1,...counts.values()),files=new Set(headings.map(heading=>heading.file)).size>1;
      for(const [index,heading] of headings.entries()){
        if(files&&heading.file!==headings[index-1]?.file){const file=Object.assign(document.createElement('span'),{className:'outline-file',textContent:heading.file});file.dataset.tip=heading.file;el.append(file);}
        const row=document.createElement('button');row.type='button';row.className='outline-item';row.style.setProperty('--depth',heading.level);row.dataset.index=index;
        const end=headings.slice(index+1).find(other=>other.file===heading.file)?.line??Infinity,mine=problems.filter(problem=>problem.file===heading.file&&problem.line>=heading.line&&problem.line<end);
        const errors=mine.filter(problem=>problem.severity==='error').length,warnings=mine.filter(problem=>problem.severity==='warning').length,n=counts.get(heading)??0;
        row.innerHTML='<b></b><span></span><small class="outline-words"></small>';row.firstChild.textContent=heading.number;row.children[1].textContent=heading.title;
        const right=row.lastChild;
        if(errors||warnings){right.textContent='! '+(errors||warnings);right.dataset.problem=errors?'error':'warning';}
        else{right.append(String(n.toLocaleString()),Object.assign(document.createElement('i'),{ariaHidden:'true'}));right.style.setProperty('--share',String(n/most));}
        row.dataset.tip=[heading.title,`${heading.file}:${heading.line}`,errors||warnings?t('outline.problems',{n:errors+warnings}):t('words.count',{n:n.toLocaleString()})].join(' · ');
        row.onclick=()=>reveal({path:heading.file,line:heading.line});el.append(row);
      }
    },
    cursor(path,line){
      const current=headings.findLastIndex(heading=>heading.file===path&&heading.line<=line);
      for(const row of el.querySelectorAll('button'))row.setAttribute('aria-current',String(Number(row.dataset.index)===current));
      return headings[current]??null;
    },
  };
}
