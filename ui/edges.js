// Scroll edges: host gets data-edge-top / data-edge-bottom while content hides past that side of scroller.
// Attributes change only when the answer changes, so scrolling costs one comparison per frame.
export function watchEdges(scroller,host=scroller.parentElement){
  host.classList.add('edges');let frame=0,top=null,bottom=null;
  const measure=()=>{
    frame=0;
    if(!scroller.isConnected||scroller.hidden)return;
    const nextTop=scroller.scrollTop>1,nextBottom=scroller.scrollTop+scroller.clientHeight<scroller.scrollHeight-1;
    if(nextTop!==top)host.dataset.edgeTop=String(top=nextTop);
    if(nextBottom!==bottom)host.dataset.edgeBottom=String(bottom=nextBottom);
  };
  const queue=()=>{if(!frame)frame=(globalThis.requestAnimationFrame||setTimeout)(measure);};
  scroller.addEventListener('scroll',queue,{passive:true});
  const observer=globalThis.ResizeObserver?new ResizeObserver(queue):null;
  observer?.observe(scroller);if(scroller.firstElementChild)observer?.observe(scroller.firstElementChild);
  queue();
  return {destroy(){scroller.removeEventListener('scroll',queue);observer?.disconnect();if(frame)(globalThis.cancelAnimationFrame||clearTimeout)(frame);}};
}
