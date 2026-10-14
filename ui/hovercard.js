// A card about what the source under the pointer points to: a label, a file, a figure, a macro, a citation.
// It waits 400 ms of stillness, never takes focus, and steps aside for typing and scrolling.
// Holding Command/Control underlines the target as a link (Mod+click follows it; the workspace handles that).
export function createHoverCard(editor,{describe}){
  const card=document.createElement('div');card.className='hover-card';card.hidden=true;card.setAttribute('role','tooltip');editor.el.append(card);
  let timer,point=null,shown=null,sequence=0,overCard=false,mod=false;
  const hide=()=>{clearTimeout(timer);sequence++;card.hidden=true;shown=null;card.replaceChildren();};
  function place(start,end){
    const box=editor.rangeRects(start,end)[0];if(!box)return false;
    const scroller=editor.scroller,x=box.x-scroller.scrollLeft,top=box.top-scroller.scrollTop,below=top+box.height+6;
    card.style.left=Math.max(8,Math.min(x,editor.el.clientWidth-card.offsetWidth-8))+'px';
    card.style.top=(below+card.offsetHeight>editor.el.clientHeight-8&&top-card.offsetHeight-6>4?top-card.offsetHeight-6:below)+'px';
    card.style.setProperty('--arrow',Math.max(10,Math.min(card.offsetWidth-18,x-parseFloat(card.style.left)+Math.min(box.width,40)/2-5))+'px');
    return true;
  }
  async function open(){
    if(!point||document.activeElement&&editor.el.querySelector('.completion:not([hidden])'))return;
    const offset=editor.offsetAtPoint(point.x,point.y),mine=++sequence,found=describe(offset);
    if(!found){hide();return;}
    if(shown&&shown.start===found.start&&shown.end===found.end)return;
    card.replaceChildren(found.content);card.hidden=false;shown=found;
    if(!place(found.start,found.end)){hide();return;}
    // Content that arrives later (a typeset formula) keeps the card where it is.
    await found.ready;if(mine===sequence&&!card.hidden)place(found.start,found.end);
  }
  function link(){
    if(!mod||!point){editor.setDecorations('link',[]);editor.input.style.cursor='';return;}
    const found=describe(editor.offsetAtPoint(point.x,point.y),{peek:true});
    editor.setDecorations('link',found?.go?[{start:found.start,end:found.end,className:'deco-link'}]:[]);editor.input.style.cursor=found?.go?'pointer':'';
  }
  const move=event=>{
    point={x:event.clientX,y:event.clientY};mod=event.metaKey||event.ctrlKey;link();
    if(shown){const box=editor.rangeRects(shown.start,shown.end)[0],origin=editor.body.getBoundingClientRect();
      if(box&&event.clientX>=box.x+origin.left-2&&event.clientX<=box.x+origin.left+box.width+2&&event.clientY>=box.top+origin.top-2&&event.clientY<=box.top+origin.top+box.height+2)return;}
    clearTimeout(timer);if(shown&&!overCard)hide();timer=setTimeout(open,400);
  };
  const leave=()=>{clearTimeout(timer);point=null;mod=false;link();setTimeout(()=>{if(!overCard)hide();},120);};
  const keys=event=>{
    if(event.key==='Meta'||event.key==='Control'){mod=event.type==='keydown';link();return;}
    if(event.type==='keydown')hide();
  };
  const events=[[editor.input,'pointermove',move],[editor.input,'pointerleave',leave],[editor.input,'pointerdown',hide],[editor.input,'input',hide],[editor.scroller,'scroll',hide],
    [card,'pointerenter',()=>{overCard=true;}],[card,'pointerleave',()=>{overCard=false;hide();}],[document,'keydown',keys],[document,'keyup',keys],[document.defaultView,'blur',()=>{mod=false;link();}]];
  for(const [target,type,handler] of events)target.addEventListener(type,handler);
  return {hide,destroy(){hide();for(const [target,type,handler] of events)target.removeEventListener(type,handler);card.remove();}};
}
