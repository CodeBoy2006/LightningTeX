// Search in the PDF's own text (pdf.js text layers over the pages). Matches are marked inside the layers' spans;
// the count reads "Page 4 · 2 / 7". Ligatures and letter case are normalised.
import {icon} from './icons.js';

/** host: the preview pane; layers() lists the current, searchable .text-layer elements in page order;
 *  reveal(mark) scrolls a match into view. */
export function createPdfFind(host,{t,layers,reveal}){
  const el=document.createElement('div');el.className='find-bar pdf-find';el.hidden=true;el.setAttribute('role','search');
  el.innerHTML='<div class="find-row"><input class="find-query" type="text" spellcheck="false"><output aria-live="polite"></output></div>';
  const row=el.firstChild,query=row.firstChild,output=row.lastChild;
  const button=(label,content,run)=>{const b=document.createElement('button');b.type='button';b.className='icon-btn';b.dataset.tip=t(label);b.setAttribute('aria-label',t(label));b.innerHTML=content;b.onclick=run;row.append(b);return b;};
  query.placeholder=query.ariaLabel=t('pdfFind.placeholder');
  button('find.prev',icon('chevronUp'),()=>jump(-1));button('find.next',icon('chevronDown'),()=>jump(1));button('common.close',icon('close'),close);
  host.append(el);
  let hits=[],current=0;const originals=new Map();
  function clear(){
    for(const [span,text] of originals)if(span.isConnected)span.textContent=text;
    originals.clear();hits=[];
  }
  // Normalised text of a layer with, for every normalised character, the span and offset it came from.
  function index(layer){
    let text='';const map=[];
    for(const node of layer.querySelectorAll('span:not(.markedContent),br')){
      if(node.tagName==='BR'){text+='\n';map.push(null);continue;}
      const source=originals.get(node)??node.textContent;let offset=0;
      for(const char of source){
        const normal=char.normalize('NFKC').toLowerCase();
        for(const piece of normal){text+=piece;map.push({span:node,offset});}
        offset+=char.length;
      }
    }
    return {text,map};
  }
  function search(){
    clear();
    const needle=query.value.normalize('NFKC').toLowerCase().replace(/\s+/g,' ');
    if(!needle.trim()){paint();return;}
    for(const layer of layers()){
      const {text,map}=index(layer),flat=text.replace(/\s/g,' '),found=new Map();
      for(let at=flat.indexOf(needle);at>=0;at=flat.indexOf(needle,at+Math.max(1,needle.length))){
        const pieces=[];
        for(let i=at;i<at+needle.length;i++){const spot=map[i];if(!spot)continue;const last=pieces.at(-1);if(last?.span===spot.span)last.end=spot.offset+1;else pieces.push({span:spot.span,start:spot.offset,end:spot.offset+1});}
        if(!pieces.length)continue;
        const hit={page:Number(layer.dataset.textPage),marks:[]};hits.push(hit);
        for(const piece of pieces){const list=found.get(piece.span)||[];list.push({...piece,hit});found.set(piece.span,list);}
      }
      // Rebuild each touched span once: its text with the matched stretches wrapped in marks.
      for(const [span,ranges] of found){
        const source=span.textContent;originals.set(span,source);span.textContent='';let at=0;
        for(const range of ranges.sort((a,b)=>a.start-b.start)){
          if(range.start<at)continue;
          if(range.start>at)span.append(source.slice(at,range.start));
          const mark=document.createElement('mark');mark.className='pdf-hit';mark.textContent=source.slice(range.start,range.end);span.append(mark);range.hit.marks.push(mark);at=range.end;
        }
        if(at<source.length)span.append(source.slice(at));
      }
    }
    current=Math.min(current,Math.max(0,hits.length-1));paint();
  }
  function paint(){
    for(const [index,hit] of hits.entries())for(const mark of hit.marks)mark.classList.toggle('current',index===current);
    const hit=hits[current];
    output.textContent=!query.value.trim()?'':hits.length?t('pdfFind.count',{page:hit.page,i:current+1,n:hits.length}):layers().length?t('find.none'):t('pdfFind.noText');
    if(hit?.marks[0])reveal(hit.marks[0]);
  }
  function jump(delta){if(!hits.length)return;current=(current+delta+hits.length)%hits.length;paint();}
  function close(){el.hidden=true;clear();host.dispatchEvent(new host.ownerDocument.defaultView.Event('pdf-find-close',{bubbles:true}));}
  query.addEventListener('input',()=>{current=0;search();});
  el.addEventListener('keydown',event=>{
    if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
    else if(event.key==='Enter'){event.preventDefault();event.stopPropagation();jump(event.shiftKey?-1:1);}
  });
  return {
    open(text){el.hidden=false;if(text)query.value=text;search();query.focus();query.select();},
    /** New pages arrived: search them again with the same query. */
    refresh(){if(!el.hidden&&query.value.trim()){originals.clear();hits=[];search();}},
    get isOpen(){return !el.hidden;},
    close,destroy(){clear();el.remove();},
  };
}
