// Floating formula preview anchored beside the formula being edited. It never takes pointer
// events, so the text underneath stays clickable.
export function createMathPopover({typeset,t}){
  const el=document.createElement('div');el.className='math-pop';el.hidden=true;el.setAttribute('role','status');
  el.innerHTML='<div class="math-pop-view"></div><div class="math-pop-note" hidden></div>';
  const view=el.firstChild,note=el.lastChild;
  let key=null,dismissed=null,busy=false,queued=null,sequence=0,current=null;

  function place(){
    if(el.hidden||!current)return;
    const {editor,found}=current,caret=editor.rectAt(editor.caret),first=editor.rectAt(found.start),last=editor.rectAt(Math.max(found.start,found.end-1));
    if(!caret)return;
    const scroller=editor.scroller,line=editor.lineHeight,width=el.offsetWidth,height=el.offsetHeight,top=scroller.scrollTop,bottom=top+scroller.clientHeight;
    // Stay clear of the formula's own lines unless it is long enough to push the preview out of reach.
    const below=last&&last.bottom-caret.bottom<line*6?last.bottom:caret.bottom,above=first&&caret.top-first.top<line*6?first.top:caret.top;
    let y=below+6;
    if(y+height>bottom-4&&above-height-6>=top+4)y=above-height-6;
    const start=first&&Math.abs(first.top-caret.top)<1?first.x:editor.gutter,minimum=scroller.scrollLeft+editor.gutter;
    el.style.top=y+'px';el.style.left=Math.max(minimum,Math.min(start,scroller.scrollLeft+scroller.clientWidth-width-12))+'px';
  }
  function hide(){el.hidden=true;key=null;current=null;view.replaceChildren();}
  function show(result){
    const drawn=view.firstChild;
    if(result.canvas){view.replaceChildren(result.canvas);el.dataset.state='ok';note.hidden=true;el.hidden=false;return;}
    if(result.state==='unavailable'){el.hidden=true;return;}
    const message=result.state==='error'?result.message||t('math.error'):result.state==='unsupported'&&result.message?t('math.unsupported',{what:result.message}):'';
    note.textContent=message;note.hidden=!message;el.dataset.state=result.state;
    // Without an earlier picture there is nothing to keep on screen but an error worth reading.
    el.hidden=!drawn&&result.state!=='error';
  }
  /** found: the formula at the caret (core/math-preview mathAt) or null. */
  async function update(editor,found,source,id=''){
    if(!found){hide();dismissed=null;return;}
    const next=id+':'+found.start;
    if(next===dismissed)return;
    dismissed=null;
    // A different formula must never show the previous one's picture.
    if(next!==key){hide();key=next;}
    current={editor,found};
    if(el.parentNode!==editor.body)editor.body.append(el);
    place();
    if(busy){queued=[editor,found,source,id];return;}
    busy=true;const mine=++sequence;let result;
    try{result=await typeset({found,source,maxWidth:Math.max(200,Math.min(640,editor.scroller.clientWidth-editor.gutter-40))});}
    catch(error){result={state:'error',message:String(error?.message||error).split('\n')[0]};}
    busy=false;
    // Only the newest request matters while typing.
    if(queued){const [a,b,c,d]=queued;queued=null;void update(a,b,c,d);return;}
    if(mine!==sequence||key!==next)return;
    show(result||{state:'unavailable'});place();
  }
  return {
    el,update,place,
    hide(){queued=null;sequence++;hide();dismissed=null;},
    /** Escape: stay hidden until the caret leaves this formula. */
    dismiss(){if(el.hidden)return false;dismissed=key;queued=null;sequence++;el.hidden=true;return true;},
    destroy(){queued=null;sequence++;el.remove();},
  };
}
