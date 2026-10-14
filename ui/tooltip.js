// One floating label for every [data-tip] control below host. The first waits; moving on to a neighbour is immediate.
// data-keys adds the shortcut as a keycap. Text is inserted as text.
export function createTooltips(host){
  const tip=Object.assign(document.createElement('div'),{className:'tip',hidden:true});tip.setAttribute('role','tooltip');host.append(tip);
  let timer,warm=0,current=null;
  function show(el){
    if(!el.isConnected||!el.dataset.tip)return;
    tip.replaceChildren(document.createTextNode(el.dataset.tip));
    if(el.dataset.keys)tip.append(Object.assign(document.createElement('kbd'),{textContent:el.dataset.keys}));
    tip.hidden=false;
    const box=el.getBoundingClientRect(),bounds=host.getBoundingClientRect(),width=tip.offsetWidth,height=tip.offsetHeight,below=box.bottom+6+height<=bounds.bottom-4;
    tip.style.left=Math.max(6,Math.min(box.left+box.width/2-width/2-bounds.left,bounds.width-width-6))+'px';
    tip.style.top=(below?box.bottom+6:box.top-height-6)-bounds.top+'px';
  }
  const leave=()=>{clearTimeout(timer);if(!tip.hidden){warm=Date.now()+320;tip.hidden=true;}current=null;};
  const enter=el=>{if(el===current)return;leave();current=el;timer=setTimeout(()=>show(el),Date.now()<warm?0:400);};
  const over=event=>{const el=event.target.closest?.('[data-tip]');if(el&&host.contains(el))enter(el);else leave();};
  const focus=event=>{const el=event.target.closest?.('[data-tip]');if(el&&event.target.matches?.(':focus-visible'))enter(el);};
  const events=[['pointerover',over],['pointerleave',leave],['pointerdown',leave,true],['focusin',focus],['focusout',leave],['keydown',leave,true]];
  for(const [type,handler,capture] of events)host.addEventListener(type,handler,capture);
  return {hide:leave,destroy(){leave();for(const [type,handler,capture] of events)host.removeEventListener(type,handler,capture);tip.remove();}};
}
