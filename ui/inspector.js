// Live inspector: the last updates as a timeline, the path the latest one took and why, the warmed engine,
// and how far the downloadable PDF trails the preview. Rendered from a plain snapshot of workspace state.
const KINDS=['live','reflow','full','waiting'];
const height=ms=>Math.max(.08,Math.min(1,Math.log10((ms||0)+1)/Math.log10(3000)));
const formatMs=ms=>!Number.isFinite(ms)?'':ms<10?ms.toFixed(1)+' ms':ms<1000?Math.round(ms)+' ms':(ms/1000).toFixed(2)+' s';

export function createInspector({t}){
  const el=document.createElement('div');el.className='inspector';
  el.innerHTML='<header><strong></strong><span class="insp-chip"></span></header><div class="insp-timeline" role="img"></div><div class="insp-legend"></div><div class="insp-route"></div><dl class="insp-kv"></dl>';
  const [head,timeline,legend,route,facts]=el.children;
  head.firstChild.textContent=t('insp.title');
  for(const kind of KINDS){const item=document.createElement('span');item.innerHTML=`<i data-kind="${kind}"></i>`;item.append(t('insp.kind.'+kind));legend.append(item);}
  let drawn=0;
  /** data: {timeline:[{kind, ms, at}], live:{state, ms, reason}, explain(reason)->{text, tone, raw, code}, pages:[n], engine:{live, restarts}, lag, settling, compiling} */
  function render(data){
    const last=data.timeline.at(-1),live=data.live;
    head.lastChild.textContent=!live?t('status.none'):live.state==='live'||live.state==='reflow'?t('live.ms',{ms:formatMs(live.ms).replace(' ms','')}):live.state==='full'?t('live.full'):live.state==='waiting'?t('live.wait'):live.state==='off'?t('live.off'):t('status.ok');
    head.lastChild.dataset.kind=live?.state||'';
    // Bars are keyed by update id: old ones scroll off the left, only a new one grows in.
    const entries=data.timeline.slice(-24),ids=new Set(entries.map(entry=>String(entry.id)));
    for(const bar of [...timeline.children])if(!ids.has(bar.dataset.id))bar.remove();
    const have=new Set([...timeline.children].map(bar=>bar.dataset.id));
    for(const entry of entries){
      let bar=timeline.querySelector(`[data-id="${entry.id}"]`);
      if(!have.has(String(entry.id))){bar=document.createElement('i');bar.dataset.id=String(entry.id);if(drawn)bar.classList.add('new');timeline.append(bar);}
      bar.dataset.kind=entry.kind;bar.style.setProperty('--h',String(entry.kind==='waiting'?.08:height(entry.ms)));bar.title=`${t('insp.kind.'+entry.kind)} · ${formatMs(entry.ms)}`;
    }
    drawn=1;timeline.setAttribute('aria-label',t('insp.timeline',{n:entries.length}));
    route.replaceChildren();
    const tag=document.createElement('span');tag.className='insp-tag';const kind=live?.state==='ready'||!live?'none':live.state;tag.dataset.kind=kind;tag.textContent=t('insp.kind.'+(KINDS.includes(kind)?kind:'none'));
    const sentence=document.createElement('p');sentence.append(tag);
    const why=live?.reason?data.explain(live.reason):null;
    sentence.append(live?.state==='live'?t('insp.live',{pages:data.pages.join(', ')||'—',ms:formatMs(live.ms)}):live?.state==='reflow'?t('insp.reflow',{pages:data.pages.join(', ')||'—',ms:formatMs(live.ms)}):why?.text||(live?.state==='full'?t('insp.full',{time:formatMs(last?.ms)}):t('insp.idle')));
    route.append(sentence);
    if(why?.tone){const note=document.createElement('p');note.className='insp-why';note.textContent=t('reason.why.'+why.tone);route.append(note);}
    if(why&&(why.tone==='check'||why.code===null)){
      const details=document.createElement('details'),summary=document.createElement('summary'),code=document.createElement('code');
      summary.textContent=t('insp.raw');code.textContent=why.raw;details.append(summary,code);route.append(details);
    }
    facts.replaceChildren();
    const fact=(label,value,state)=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;if(state)dd.dataset.state=state;facts.append(dt,dd);};
    fact(t('insp.engine'),t('insp.engine.'+(data.engine.live||'off'))+' · '+t('insp.restarts',{n:data.engine.restarts||0}),data.engine.live==='ready'?'ok':data.engine.live==='warming'?'busy':'');
    fact('PDF',data.compiling?t('pdf.updating'):data.lag?t('pdf.behind',{n:data.lag})+(data.settling?' · '+t('insp.settle'):''):t('pdf.synced'),data.lag?'lag':'ok');
    const total=data.timeline.filter(entry=>entry.kind==='live'||entry.kind==='reflow'),median=total.length?[...total.map(entry=>entry.ms)].sort((a,b)=>a-b)[total.length>>1]:null;
    if(median!=null)fact(t('insp.median'),formatMs(median)+' · '+t('insp.count',{n:total.length}));
  }
  return {el,render};
}
