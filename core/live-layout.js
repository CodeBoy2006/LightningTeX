import {fontKey,globalDrawingReason} from './capture.js';

// shortcut: erasure assumes white paper; colored page backgrounds need verified compositing.
export function unitInkRegion(page,uid,before,after,pad){
  if(!before||!after)throw Error('Missing unit ink bounds');
  if(![...Object.values(before),...Object.values(after),pad].every(Number.isFinite)||pad<0||before.w<0||before.h<0||after.w<0||after.h<0)throw Error('Invalid unit ink bounds');
  const x=Math.min(before.x,after.x)-pad,y=Math.min(before.y,after.y)-pad;
  const right=Math.max(before.x+before.w,after.x+after.w)+pad,bottom=Math.max(before.y+before.h,after.y+after.h)+pad;
  const overlaps=(x0,y0,x1,y1)=>x<x1&&right>x0&&y<y1&&bottom>y0;
  if(x<0||y<0||right>page.page_width||bottom>page.page_height)throw Error('Unit ink leaves the page');
  for(const line of page.lines)if(line.unit!==uid){
    if(overlaps(line.x,line.y-line.h,line.x+line.w,line.y+line.d))throw Error('Unit ink overlaps another row');
    for(const item of line.items||[])if(item[0]==='i'&&overlaps(item[2],item[3],item[2]+item[4],item[3]+item[5]))throw Error('Unit ink overlaps an image');
  }
  for(const item of page.other||[]){
    if(item[0]==='c'||item[0]==='m')continue;
    if(item[0]==='r'){
      if(overlaps(item[1],item[2],item[1]+item[3],item[2]+item[4]))throw Error('Unit ink overlaps page drawing');
    }else if(item[0]==='g'){
      const size=page.fonts[item[1]]?.size;
      if(!Number.isFinite(size)||overlaps(item[4]-size,item[5]-size,item[4]+item[6]+size,item[5]+size))throw Error('Unit ink overlaps page drawing');
    }else throw Error('Unbounded page drawing requires full layout');
  }
  return {x,y,w:right-x,h:bottom-y};
}

export function replaceUnitRows(pages,unit,baseline,live,{allowReflow=false}={}){
  const reason=globalDrawingReason(live,true);if(reason)throw Error(reason);
  const countChanged=live.lines.length!==baseline.lines.length||unit.placements?.length!==live.lines.length;
  const reflow=countChanged||live.lines.some((line,i)=>line.h!==baseline.lines[i].h||line.d!==baseline.lines[i].d||line.y!==baseline.lines[i].y);
  if(reflow&&!allowReflow)throw Error(countChanged?'Line count changed; full pagination is needed':'Line height changed; full pagination is needed');
  const changed=new Map(),fontIds=new Map();
  // Keep captured page breaks provisionally; extra rows extend the final fragment until TeX repaginates.
  for(let i=0;i<Math.max(unit.placements.length,live.lines.length);i++){
    const slot=unit.placements.find(row=>row.row===Math.min(i+1,unit.placements.length));
    const reference=reflow?unit.placements.find(row=>row.page===slot?.page):slot,proof=baseline.lines[reference?.row-1];
    if(!reference)throw Error('Missing row placement');
    let page=changed.get(reference.page),ids=fontIds.get(reference.page);
    if(!page){
      page=structuredClone(pages.find(page=>page.page===reference.page));changed.set(reference.page,page);
      if(reflow){page.lines=page.lines.filter(row=>row.unit!==unit.uid);page.reflowUnits??=[];page.reflowUnits.push(unit.uid);}
      ids=new Map();fontIds.set(reference.page,ids);
      const keys=new Map();let next=0;
      for(const [id,desc] of Object.entries(page.fonts)){const number=Number(id);keys.set(fontKey(desc),number);next=Math.max(next,number);}
      for(const [id,desc] of Object.entries(live.fonts)){
        const key=fontKey(desc);let target=keys.get(key);
        if(target===undefined){target=++next;page.fonts[target]={...desc,id:target};keys.set(key,target);}
        ids.set(Number(id),target);
      }
    }
    if(!live.lines[i])continue;
    // A centered formula's x coordinate changes with its width; retain that offset.
    const dx=reference.x-proof.x,dy=reference.y-proof.y,line=structuredClone(live.lines[i]);
    line.x+=dx;line.y+=dy;line.unit=unit.uid;line.row=i+1;
    line.items=line.items.map(item=>{
      const out=[...item];
      if(out[0]==='g'){out[1]=ids.get(out[1]);out[4]+=dx;out[5]+=dy;}
      else if(out[0]==='r'){out[1]+=dx;out[2]+=dy;}
      else if(out[0]==='m')out[2]+=dx;
      else if(out[0]!=='c')throw Error('Unsupported local drawing');
      return out;
    });
    if(reflow)page.lines.push(line);
    else{
      const index=page.lines.findIndex(row=>row.unit===unit.uid&&row.row===reference.row);
      if(index<0)throw Error('Missing captured row');
      page.lines[index]=line;
    }
  }
  for(const page of changed.values()){
    let glyphs=0;
    for(const item of page.other||[])if(item[0]==='g')glyphs++;
    page.lines.forEach(line=>line.items.forEach(item=>{if(item[0]==='g')glyphs++;}));
    page.glyphs=glyphs;
  }
  return changed;
}

// shortcut: stretch preview paper until TeX repaginates; never use these bands for PDF export.
export function pageFlow(page,patches,pad){
  if(!Number.isFinite(pad)||pad<0)throw Error('Invalid page padding');
  const original=patches.map(patch=>patch.before).filter(Boolean).sort((a,b)=>a.y-b.y);
  // At fit-width, two device pixels can exceed half the gap between adjacent paragraphs.
  for(let i=1;i<original.length;i++)pad=Math.min(pad,Math.max(0,(original[i].y-original[i-1].y-original[i-1].h)/2-1));
  const bands=[];
  for(const {uid,before,after,reflow} of patches){
    if(!reflow){bands.push({uid,...unitInkRegion(page,uid,before,after,pad),delta:0,dy:0});continue;}
    if(!before)throw Error('Missing original unit bounds');
    const strip={x:0,y:before.y-pad,w:page.page_width,h:before.h+2*pad};
    unitInkRegion(page,uid,strip,strip,0);
    if(after&&(!Object.values(after).every(Number.isFinite)||after.x-pad<0||after.x+after.w+pad>page.page_width||after.h<0))throw Error('Reflow ink leaves the page width');
    const height=after?after.h+2*pad:0;
    bands.push({uid,...strip,delta:height-strip.h,dy:after?before.y-after.y:0});
  }
  bands.sort((a,b)=>a.y-b.y);
  let shift=0,end=0;
  for(const band of bands){
    if(band.y<end)throw Error('Live regions overlap');
    end=band.y+band.h;band.shift=shift;shift+=band.delta;
  }
  return {bands,height:page.page_height+shift};
}
