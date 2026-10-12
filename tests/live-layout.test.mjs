import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceUnitRows,unitInkRegion} from '../core/live-layout.js';
const font={filename:'text.otf',size:655360};
const unit={uid:1,placements:[{page:1,row:1,x:100,y:200}]};
const baseline={lines:[{x:0,y:20,h:20,d:2}]};
const live={fonts:{1:{filename:'math.pfb',size:655360}},lines:[{x:10,y:20,w:60,h:20,d:2,items:[['g',1,50,null,12,20,10,0]]}]};
const pages=()=>[{page:1,fonts:{1:font},other:[['g',1,49,1,100,900,20,0]],lines:[{unit:1,row:1,x:100,y:200,h:20,d:2,items:[]},{unit:2,row:1,x:100,y:300,items:[['g',1,65,1,100,300,20,0]]}]}];
test('local replacement preserves surrounding content and remaps colliding font IDs',()=>{
 const before=pages(),page=replaceUnitRows(before,unit,baseline,live).get(1);
 assert.equal(page.lines[0].x,110);assert.equal(page.lines[0].items[0][4],112);
 assert.equal(page.lines[0].items[0][1],2);assert.equal(page.fonts[2].filename,'math.pfb');
 assert.deepEqual(page.lines[1],before[0].lines[1]);assert.deepEqual(page.other,before[0].other);
 const again=replaceUnitRows([page],unit,baseline,live).get(1);
 assert.deepEqual(again,page,'repeated edits must not drift or accumulate font IDs');
 assert.equal(before[0].lines[0].x,100,'original capture must remain immutable');
});
test('changed row count or height requires full pagination',()=>{
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,{...live,lines:[]}),/Line count/);
 const taller=structuredClone(live);taller.lines[0].h++;
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,taller),/Line height/);
});
test('local drawing outside rows and degraded output require full layout',()=>{
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,{...live,other:[['g',1,50,null,0,0,10,0]]}),/outside unit rows/);
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,{...live,flags:{unsupported:1}}),/Unsupported/);
});
test('patch bounds include old and new ink while protecting adjacent rows and page drawing',()=>{
 const page={...pages()[0],other:[],page_width:1000,page_height:1000,lines:[{unit:1,x:100,y:200,w:400,h:20,d:2},{unit:2,x:100,y:300,w:400,h:20,d:2}]};
 const before={x:100,y:180,w:150,h:22},after={x:98,y:180,w:180,h:22};
 assert.deepEqual(unitInkRegion(page,1,before,after,1),{x:97,y:179,w:182,h:24});
 assert.throws(()=>unitInkRegion(page,1,before,{...after,h:150},1),/another row/);
 assert.throws(()=>unitInkRegion(page,1,before,{...after,x:-5},1),/leaves the page/);
 page.other=[['r',120,185,3,4]];assert.throws(()=>unitInkRegion(page,1,before,after,1),/page drawing/);
 page.other=[['l',0,'unbounded graphics']];assert.throws(()=>unitInkRegion(page,1,before,after,1),/Unbounded/);
 page.other=[];page.lines[1].items=[['i',1,120,180,10,20]];
 assert.throws(()=>unitInkRegion(page,1,before,after,1),/image/);
 assert.throws(()=>unitInkRegion(page,1,before,{...after,w:NaN},1),/Invalid/);
});
