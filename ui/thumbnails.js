// Page thumbnails beside the preview. Each is a scaled copy of the page canvas already on screen (no second
// PDF render), drawn only while visible in the rail and redrawn when idle after a page changes.
const idle=globalThis.requestIdleCallback?callback=>requestIdleCallback(callback,{timeout:300}):callback=>setTimeout(callback,32);
const WIDTH=52;

export function createThumbnails(rail,{t,pages,goTo}){
  const thumbs=new Map(),dirty=new Set();let current=0,queued=false;
  const observer=globalThis.IntersectionObserver?new IntersectionObserver(entries=>{for(const entry of entries){const page=Number(entry.target.dataset.thumb);entry.target.dataset.visible=String(entry.isIntersecting);if(entry.isIntersecting&&dirty.has(page))queue();}},{root:rail,rootMargin:'120px 0px'}):null;
  function draw(){
    queued=false;const list=pages();
    for(const page of [...dirty]){
      const thumb=thumbs.get(page),source=list.find(canvas=>Number(canvas.dataset.page)===page);
      if(!thumb||!source?.width){dirty.delete(page);continue;}
      if(observer&&thumb.button.dataset.visible!=='true')continue;
      const ratio=Math.min(2,globalThis.devicePixelRatio||1),height=Math.round(WIDTH*source.height/source.width),canvas=thumb.canvas;
      canvas.width=WIDTH*ratio;canvas.height=height*ratio;canvas.style.height=height+'px';
      try{const context=canvas.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(source,0,0,canvas.width,canvas.height);}catch{/* a canvas without a 2D context (tests) */}
      dirty.delete(page);
    }
  }
  const queue=()=>{if(!queued){queued=true;idle(draw);}};
  /** Rebuild the rail for the current pages; every thumbnail is redrawn. */
  function sync(){
    const list=pages(),numbers=list.map(canvas=>Number(canvas.dataset.page));
    if(numbers.length!==thumbs.size||numbers.some(page=>!thumbs.has(page))){
      for(const thumb of thumbs.values())observer?.unobserve(thumb.button);
      thumbs.clear();rail.replaceChildren();
      for(const source of list){
        const page=Number(source.dataset.page);
        const button=document.createElement('button');button.type='button';button.className='thumb';button.dataset.thumb=String(page);button.setAttribute('aria-label',t('thumbs.page',{n:page}));
        const canvas=document.createElement('canvas');canvas.style.width=WIDTH+'px';
        if(source.width)canvas.style.height=Math.round(WIDTH*source.height/source.width)+'px';
        const label=document.createElement('span');label.textContent=String(page);button.append(canvas,label);
        button.onclick=()=>goTo(page);rail.append(button);thumbs.set(page,{button,canvas});observer?.observe(button);
      }
    }
    for(const canvas of list){const thumb=thumbs.get(Number(canvas.dataset.page));thumb?.button.toggleAttribute('data-provisional',canvas.classList.contains('provisional'));}
    for(const page of numbers)dirty.add(page);
    setCurrent(current);queue();
  }
  /** Pages redrawn by a local update: a brief accent flash and a redraw once idle. */
  function changed(numbers){
    const list=pages();
    for(const page of numbers){
      const thumb=thumbs.get(page);if(!thumb)continue;dirty.add(page);
      thumb.button.classList.remove('flash');void thumb.button.offsetWidth;thumb.button.classList.add('flash');
      thumb.button.toggleAttribute('data-provisional',!!list.find(canvas=>Number(canvas.dataset.page)===page)?.classList.contains('provisional'));
    }
    queue();
  }
  function setCurrent(page){
    current=page;
    for(const [number,thumb] of thumbs){
      const on=number===page;thumb.button.setAttribute('aria-current',String(on));thumb.button.tabIndex=on?0:-1;
      if(on&&!rail.matches(':hover'))thumb.button.scrollIntoView?.({block:'nearest'});
    }
  }
  rail.addEventListener('keydown',event=>{
    if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();
    const list=[...thumbs.keys()],index=list.indexOf(Number(event.target.closest('.thumb')?.dataset.thumb)),next=list[Math.max(0,Math.min(list.length-1,index+(event.key==='ArrowDown'?1:-1)))];
    if(next!=null){goTo(next);setCurrent(next);thumbs.get(next).button.focus();}
  });
  return {sync,changed,setCurrent,destroy(){observer?.disconnect();}};
}
