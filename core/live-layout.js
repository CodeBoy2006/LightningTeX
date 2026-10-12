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

// shortcut: reuse fixed row slots; changed geometry needs a full pagination pass.
export function replaceUnitRows(pages,unit,baseline,live){
  const reason=globalDrawingReason(live,true);if(reason)throw Error(reason);
  if(live.lines.length!==baseline.lines.length||unit.placements?.length!==live.lines.length)
    throw Error('Line count changed; full pagination is needed');
  if(live.lines.some((line,i)=>line.h!==baseline.lines[i].h||line.d!==baseline.lines[i].d||line.y!==baseline.lines[i].y))
    throw Error('Line height changed; full pagination is needed');
  const changed=new Map();
  for(let i=0;i<live.lines.length;i++){
    const reference=unit.placements.find(row=>row.row===i+1),proof=baseline.lines[i];
    if(!reference)throw Error('Missing row placement');
    let page=changed.get(reference.page);
    if(!page){page=structuredClone(pages.find(page=>page.page===reference.page));changed.set(reference.page,page);}
    const ids=new Map(),keys=new Map(Object.entries(page.fonts).map(([id,desc])=>[fontKey(desc),Number(id)]));
    let next=Math.max(0,...Object.keys(page.fonts).map(Number));
    for(const [id,desc] of Object.entries(live.fonts)){
      const key=fontKey(desc);let target=keys.get(key);
      if(target===undefined){target=++next;page.fonts[target]={...desc,id:target};keys.set(key,target);}
      ids.set(Number(id),target);
    }
    // A centered formula's x coordinate changes with its width; retain that offset.
    const dx=reference.x-proof.x,dy=reference.y-proof.y,line=structuredClone(live.lines[i]);
    line.x+=dx;line.y+=dy;line.unit=unit.uid;line.row=reference.row;
    line.items=line.items.map(item=>{
      const out=[...item];
      if(out[0]==='g'){out[1]=ids.get(out[1]);out[4]+=dx;out[5]+=dy;}
      else if(out[0]==='r'){out[1]+=dx;out[2]+=dy;}
      else if(out[0]==='m')out[2]+=dx;
      else if(out[0]!=='c')throw Error('Unsupported local drawing');
      return out;
    });
    const index=page.lines.findIndex(row=>row.unit===unit.uid&&row.row===reference.row);
    if(index<0)throw Error('Missing captured row');
    page.lines[index]=line;
  }
  for(const page of changed.values())page.glyphs=[...(page.other||[]),...page.lines.flatMap(line=>line.items)].filter(item=>item[0]==='g').length;
  return changed;
}
