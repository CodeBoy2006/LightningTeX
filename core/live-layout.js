import {fontKey,globalDrawingReason} from './capture.js';

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
