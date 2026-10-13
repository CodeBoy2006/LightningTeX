import test from 'node:test';
import assert from 'node:assert/strict';
import {replaceUnitRows,unitInkRegion,pageFlow} from '../core/live-layout.js';
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
 assert.equal(page.glyphs,3,'count the replaced row, surrounding row and page drawing');
 const again=replaceUnitRows([page],unit,baseline,live).get(1);
 assert.deepEqual(again,page,'repeated edits must not drift or accumulate font IDs');
 assert.equal(before[0].lines[0].x,100,'original capture must remain immutable');
});
test('changed row count or height requires full pagination',()=>{
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,{...live,lines:[]}),/Line count/);
 const taller=structuredClone(live);taller.lines[0].h++;
 assert.throws(()=>replaceUnitRows(pages(),unit,baseline,taller),/Line height/);
});
test('glyph counts skip sparse row slots and include surrounding drawing',()=>{
 const before=pages(),sparse=structuredClone(live);
 before[0].lines[1].items.length=3;sparse.lines[0].items.length=3;
 const page=replaceUnitRows(before,unit,baseline,sparse).get(1);
 assert.equal(page.glyphs,3);
});
test('multiple rows share font IDs within each page without mixing page font tables',()=>{
 const placements=[{page:1,row:1,x:100,y:200},{page:1,row:2,x:100,y:240},{page:2,row:3,x:100,y:200}];
 const before=[...pages(),{page:2,fonts:{7:{id:7,...live.fonts[1]}},other:[],lines:[]}];
 for(const page of before)page.lines=[...placements.filter(row=>row.page===page.page).map(row=>({...row,unit:1,items:[]})),...page.lines.filter(row=>row.unit!==1)];
 const original=structuredClone(before),proof={lines:placements.map((_,i)=>({...baseline.lines[0],y:20+i*40}))};
 const output={...live,lines:proof.lines.map(row=>({...live.lines[0],y:row.y,items:[['g',1,50,null,12,row.y,10,0]]}))};
 const result=replaceUnitRows(before,{uid:1,placements},proof,output);
 assert.deepEqual(result.get(1).lines.filter(row=>row.unit===1).map(row=>row.items[0][1]),[2,2]);
 assert.equal(result.get(2).lines[0].items[0][1],7);
 assert.equal(result.get(1).glyphs,4);assert.equal(result.get(2).glyphs,1);
 assert.deepEqual(Object.keys(result.get(1).fonts),['1','2']);assert.deepEqual(Object.keys(result.get(2).fonts),['7']);
 assert.deepEqual(before,original,'captured pages remain untouched');
 assert.deepEqual(replaceUnitRows([...result.values()],{uid:1,placements},proof,output),result,'repeated edits preserve font IDs');
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
test('provisional reflow replaces all rows, supports deletion, and never shifts the captured backdrop',()=>{
 const before=pages(),grown={...live,lines:[live.lines[0],{...live.lines[0],y:60}]};
 const page=replaceUnitRows(before,unit,baseline,grown,{allowReflow:true}).get(1);
 assert.deepEqual(page.reflowUnits,[1]);assert.equal(page.lines.filter(row=>row.unit===1).length,2);
 assert.deepEqual(page.lines.find(row=>row.unit===2),before[0].lines[1]);assert.deepEqual(page.other,before[0].other);
 assert.equal(page.lines.find(row=>row.row===2).y,240);
 const deleted=replaceUnitRows(before,unit,baseline,{...live,lines:[]},{allowReflow:true}).get(1);
 assert.equal(deleted.lines.some(row=>row.unit===1),false);assert.deepEqual(deleted.reflowUnits,[1]);
 assert.deepEqual(before,pages(),'the authoritative capture stays immutable');
});
test('reflow bands move following content once and reject intersecting columns or graphics',()=>{
 const page={page_width:1000,page_height:1000,fonts:{},other:[],lines:[{unit:1,x:100,y:200,w:400,h:20,d:2},{unit:2,x:100,y:400,w:400,h:20,d:2}]};
 const before={x:100,y:180,w:150,h:22},after={x:100,y:170,w:170,h:62};
 const flow=pageFlow(page,[{uid:1,before,after,reflow:true},{uid:2,before:{...before,y:380},after:{...before,y:380},reflow:false}],1);
 assert.equal(flow.height,1040);assert.equal(flow.bands[0].delta,40);assert.equal(flow.bands[0].dy,10);assert.equal(flow.bands[1].shift,40);
 assert.equal(pageFlow(page,[{uid:1,before,after:null,reflow:true}],1).height,976);
 page.lines.push({unit:3,x:700,y:190,w:100,h:10,d:2});
 assert.throws(()=>pageFlow(page,[{uid:1,before,after,reflow:true}],1),/another row/);
 page.lines.pop();page.other=[['l',0,'graphics']];
 assert.throws(()=>pageFlow(page,[{uid:1,before,after,reflow:true}],1),/Unbounded/);
});
test('cross-page reflow keeps every glyph and erases emptied page fragments',()=>{
 const second={...structuredClone(pages()[0]),page:2};second.lines=second.lines.filter(row=>row.unit===1);second.lines[0].row=2;
 const both=[...pages(),second],multi={uid:1,placements:[...unit.placements,{...unit.placements[0],page:2,row:2}]};
 const proof={lines:[...baseline.lines,{...baseline.lines[0],y:60}]},rows=[20,60,100].map(y=>({...live.lines[0],y}));
 const grown=replaceUnitRows(both,multi,proof,{...live,lines:rows},{allowReflow:true});
 assert.equal(grown.get(1).lines.filter(row=>row.unit===1).length,1);assert.equal(grown.get(2).lines.length,2);
 const shrunk=replaceUnitRows(both,multi,proof,live,{allowReflow:true});
 assert.equal(shrunk.get(2).lines.length,0);assert.deepEqual(shrunk.get(2).reflowUnits,[1]);
});
test('fit-width padding cannot make adjacent edited paragraphs overlap',()=>{
 const page={page_width:1000,page_height:1000,fonts:{},other:[],lines:[{unit:1,x:100,y:200,w:400,h:20,d:2},{unit:2,x:100,y:226,w:400,h:20,d:2}]};
 const before={x:100,y:180,w:150,h:22};
 const flow=pageFlow(page,[{uid:1,before,after:{...before,h:40},reflow:true},{uid:2,before:{...before,y:206},after:null,reflow:true}],3);
 assert.ok(flow.bands[0].y+flow.bands[0].h<=flow.bands[1].y);
 assert.throws(()=>pageFlow(page,[],NaN),/padding/);
});
