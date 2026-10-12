// DOM interaction tests only. These do not exercise a real browser or TeX engine.
// Setup: npm ci in app (jsdom is a development dependency)
// Run from project root: node --test app/ui/editor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEditor, DEFAULT_SOURCE } from './editor.js';
const tick = (ms=0) => new Promise(resolve=>setTimeout(resolve,ms));
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const bytes = value => new Uint8Array([37,80,68,70,value]);
function setup(options={}) {
  const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://local.test'});
  const previous={};
  for(const key of ['window','document','localStorage','Node','confirm']){previous[key]=globalThis[key];globalThis[key]=key==='confirm'?()=>true:dom.window[key];}
  const root=document.querySelector('#app');
  const rendered=[];
  const ui=mountEditor({root,previewIntervalMs:5,renderPdf:async ({bytes,container})=>{rendered.push(bytes.at(-1));container.textContent=`PDF ${bytes.at(-1)}`;return {pages:1};},...options});
  const q=id=>root.querySelector(`[data-id="${id}"]`);
  const a=id=>root.querySelector(`[data-action="${id}"]`);
  const event=(el,name,extra={})=>el.dispatchEvent(name==='keydown'?new dom.window.KeyboardEvent(name,{bubbles:true,cancelable:true,...extra}):new dom.window.Event(name,{bubbles:true,...extra}));
  const edit=text=>{q('source').value=text;event(q('source'),'input');};
  const auto=value=>{q('auto-compile').checked=value;event(q('auto-compile'),'change');};
  ui.setEngineStatus({status:'ready'});
  return {ui,root,q,a,event,edit,auto,rendered,dom,cleanup(){ui.destroy();dom.window.close();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}

test('default document does not force legacy T1 fonts',()=>assert.ok(!DEFAULT_SOURCE.includes('fontenc')));

test('repeat compilation replaces PDF and manual requests do not overlap',async()=>{
  let calls=0;const wait=deferred();const h=setup({onCompile:async()=>{calls++;if(calls===1)await wait.promise;return {pdf:bytes(calls)};}});
  try {const first=h.ui.compile();await h.ui.compile();assert.equal(calls,1);wait.resolve();await first;await h.ui.compile();assert.equal(calls,2);assert.deepEqual(h.rendered,[1,2]);assert.equal(h.q('preview-status-text').textContent,'Up to date');}finally{h.cleanup();}
});

test('cancellation ignores stale response and allows a fresh compilation',async()=>{
  const first=deferred();let calls=0,cancels=0;const h=setup({onCancel:()=>cancels++,onCompile:()=>++calls===1?first.promise:Promise.resolve({pdf:bytes(2)})});
  try {const old=h.ui.compile();h.ui.cancel();assert.equal(cancels,1);assert.equal(h.ui.getState().compiling,false);await h.ui.compile();first.resolve({pdf:bytes(1)});await old;assert.deepEqual(h.rendered,[2]);assert.match(h.q('preview-viewport').textContent,/PDF 2/);}finally{h.cleanup();}
});

test('newer edit during compile schedules a second compile, then reaches current revision',async()=>{
  const first=deferred();const requests=[];const h=setup({onCompile:request=>{requests.push(request);return requests.length===1?first.promise:Promise.resolve({pdf:bytes(2)});}});
  try {const run=h.ui.compile();h.edit('new document');await tick(10);assert.equal(requests.length,1);first.resolve({pdf:bytes(1)});await run;assert.equal(h.q('preview-status-text').textContent,'Out of date');await tick(30);assert.equal(requests.length,2);assert.equal(requests[1].source,'new document');assert.equal(h.ui.getState().pdfRevision,h.ui.getState().revision);}finally{h.cleanup();}
});

test('compile errors preserve last good PDF and mark edits stale',async()=>{
  let calls=0;const h=setup({onCompile:async()=>{if(++calls===1)return {pdf:bytes(1)};throw new Error('Undefined control sequence <unsafe>');}});
  try {h.auto(false);await h.ui.compile();h.edit('broken source');await h.ui.compile();assert.match(h.q('preview-viewport').textContent,/PDF 1/);assert.equal(h.q('preview-status-text').textContent,'Out of date');assert.equal(h.a('download-pdf').disabled,false);assert.equal(h.q('diagnostics').open,true);assert.match(h.q('logs').textContent,/<unsafe>/);assert.equal(h.q('logs').querySelector('unsafe'),null);}finally{h.cleanup();}
});

test('older asynchronous PDF rendering cannot replace a newer preview',async()=>{
  const pending=new Map();const h=setup({renderPdf:({bytes,container})=>{const wait=deferred();pending.set(bytes.at(-1),wait);container.textContent=`PDF ${bytes.at(-1)}`;return wait.promise;}});
  try {const old=h.ui.setPdf(bytes(1),{revision:0});const newer=h.ui.setPdf(bytes(2),{revision:0});pending.get(2).resolve({pages:1});await newer;pending.get(1).resolve({pages:1});await old;assert.equal(h.q('preview-viewport').textContent,'PDF 2');}finally{h.cleanup();}
});

test('failed PDF rendering preserves the last good preview',async()=>{
  const h=setup({renderPdf:async({bytes,container})=>{if(bytes.at(-1)===2)throw new Error('bad PDF');container.textContent='good PDF';}});
  try {await h.ui.setPdf(bytes(1));await h.ui.setPdf(bytes(2));assert.equal(h.q('preview-viewport').textContent,'good PDF');assert.match(h.q('logs').textContent,/bad PDF/);}finally{h.cleanup();}
});

test('source, filenames, logs and paragraph text cannot inject HTML',()=>{
  const h=setup();const attack='<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>';
  try {h.auto(false);h.ui.setSource(attack,{filename:attack});h.ui.log(attack);h.ui.setLiveStatus({text:attack,status:attack});assert.equal(h.q('source').value,attack);assert.equal(h.q('filename').textContent,attack);assert.equal(h.root.querySelectorAll('img,script').length,0);assert.equal(h.dom.window.pwned,undefined);}finally{h.cleanup();}
});

test('draft storage defaults off, opt-in saves, opt-out clears it',()=>{
  const h=setup();
  try {h.auto(false);h.edit('private draft');assert.equal(localStorage.length,0);h.q('persist').checked=true;h.event(h.q('persist'),'change');assert.equal(localStorage.getItem('realtime-tex-web:save-draft:v1'),'yes');assert.equal(JSON.parse(localStorage.getItem('realtime-tex-web:draft:v1')).source,'private draft');h.edit('revised draft');assert.equal(JSON.parse(localStorage.getItem('realtime-tex-web:draft:v1')).source,'revised draft');h.q('persist').checked=false;h.event(h.q('persist'),'change');assert.equal(localStorage.length,0);assert.equal(h.q('save-status').textContent,'Draft is not saved');}finally{h.cleanup();}
});

test('upload rejects oversized and non-TeX files without reading them',async()=>{
  const h=setup();let reads=0;const original=h.ui.getSource();
  const upload=file=>{Object.defineProperty(h.q('file-input'),'files',{configurable:true,value:[{...file,text:async()=>{reads++;return 'uploaded source';}}]});h.event(h.q('file-input'),'change');};
  try {upload({name:'attack.html',size:20});await tick();assert.match(h.q('toast').textContent,/Choose a .tex/);upload({name:'huge.tex',size:6*1024*1024});await tick();assert.match(h.q('toast').textContent,/smaller than 5 MB/);assert.equal(reads,0);assert.equal(h.ui.getSource(),original);upload({name:'valid.tex',size:20});await tick();assert.equal(reads,1);assert.equal(h.ui.getSource(),'uploaded source');assert.equal(h.ui.getState().filename,'valid.tex');}finally{h.cleanup();}
});

test('keyboard Escape exits source editor and cancels active compilation',async()=>{
  const waiting=deferred();let cancelled=0;const h=setup({onCompile:()=>waiting.promise,onCancel:()=>cancelled++});
  try {h.q('source').focus();h.event(h.q('source'),'keydown',{key:'Tab'});assert.ok(h.ui.getSource().includes('  '));h.event(h.q('source'),'keydown',{key:'Escape'});assert.equal(document.activeElement,h.a('upload'));const run=h.ui.compile();h.event(h.root,'keydown',{key:'Escape'});assert.equal(cancelled,1);assert.equal(h.ui.getState().compiling,false);waiting.resolve({pdf:bytes(1)});await run;assert.equal(h.rendered.length,0);}finally{h.cleanup();}
});

test('cancellation during PDF rendering aborts renderer and cannot install cancelled output',async()=>{
  const rendering=deferred(),started=deferred();let signal;
  const h=setup({onCompile:async()=>({pdf:bytes(2)}),renderPdf:async request=>{
    request.container.textContent=`PDF ${request.bytes.at(-1)}`;
    if(request.bytes.at(-1)===2){signal=request.signal;started.resolve();await rendering.promise;}
  }});
  try {h.auto(false);await h.ui.setPdf(bytes(1));const run=h.ui.compile();await started.promise;h.ui.cancel();assert.equal(signal.aborted,true);rendering.resolve();await run;assert.equal(h.q('preview-viewport').textContent,'PDF 1');assert.equal(h.ui.getState().compiling,false);assert.equal(h.q('diagnostics').open,false);}finally{h.cleanup();}
});

test('continuous input cannot postpone Full indefinitely; busy work coalesces to latest source',async()=>{
  const first=deferred(),requests=[];
  const h=setup({previewIntervalMs:40,onCompile:request=>{
    requests.push(request);return requests.length===1?first.promise:Promise.resolve({pdf:bytes(2)});
  }});
  try {
    for(let i=0;i<6;i++){h.edit(`Equation $x^${i}$`);await tick(12);}
    assert.equal(requests.length,1,'the first compile must start while typing continues');
    h.edit('Latest equation $x^{99}$');
    first.resolve({pdf:bytes(1)});await tick(25);
    assert.equal(requests.length,2);
    assert.equal(requests[1].source,'Latest equation $x^{99}$');
    assert.deepEqual(h.rendered,[1,2]);
    assert.equal(h.ui.getState().pdfRevision,h.ui.getState().revision);
  }finally{h.cleanup();}
});

test('disabling Auto stops pending and follow-up compilation; re-enabling resumes',async()=>{
  const first=deferred();let calls=0;
  const h=setup({onCompile:()=>++calls===1?first.promise:Promise.resolve({pdf:bytes(2)})});
  try {
    h.edit('pending');h.auto(false);await tick(15);assert.equal(calls,0);
    h.auto(true);await tick(15);assert.equal(calls,1);
    h.edit('newest');h.auto(false);first.resolve({pdf:bytes(1)});await tick(15);assert.equal(calls,1);
    h.auto(true);await tick(15);assert.equal(calls,2);
    assert.equal(h.ui.getState().pdfRevision,h.ui.getState().revision);
  }finally{h.cleanup();}
});

test('unfinished automatic math keeps PDF and focus without opening diagnostics; correction recovers',async()=>{
  const h=setup({onCompile:async({source})=>{
    if(source.endsWith('{'))throw Error('Missing closing brace');return {pdf:bytes(2)};
  }});
  try {
    await h.ui.setPdf(bytes(1));h.q('source').focus();h.edit('Equation $x^{');await tick(20);
    assert.equal(h.q('preview-viewport').textContent,'PDF 1');
    assert.equal(h.q('diagnostics').open,false);assert.equal(h.q('toast').hidden,true);
    assert.equal(document.activeElement,h.q('source'));assert.match(h.q('logs').textContent,/closing brace/);
    h.edit('Equation $x^{2}$');await tick(20);
    assert.equal(h.q('preview-status-text').textContent,'Up to date');
  }finally{h.cleanup();}
});

test('local Full update replaces only affected pages and preserves PDF revision',async()=>{
 const h=setup({renderPdf:async({container})=>{for(let i=1;i<=2;i++){const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.setAttribute('aria-label',`PDF page ${i}`);container.append(canvas);}}});
 try {
   h.auto(false);await h.ui.setPdf(bytes(1));const second=h.root.querySelector('[data-page="2"]');
   h.edit('local formula edit');const node=document.createElement('canvas'),revision=h.ui.getState().revision;
   assert.equal(h.ui.setLivePages({canvases:new Map([[1,node]]),revision,durationMs:3}),true);
   assert.equal(h.root.querySelector('[data-page="1"]'),node);assert.equal(h.root.querySelector('[data-page="2"]'),second);
   assert.equal(h.ui.getState().previewRevision,revision);assert.equal(h.ui.getState().pdfRevision,0);
   assert.equal(h.q('preview-status-text').textContent,'Live · PDF pending');
   h.edit('newer formula');assert.equal(h.ui.setLivePages({canvases:new Map([[1,document.createElement('canvas')]]),revision,durationMs:1}),false);
   assert.equal(h.root.querySelector('[data-page="1"]'),node);
 }finally{h.cleanup();}
});
test('missing page makes a local update atomic',async()=>{
 const h=setup({renderPdf:async({container})=>{const canvas=document.createElement('canvas');canvas.dataset.page='1';container.append(canvas);}});
 try {
   h.auto(false);await h.ui.setPdf(bytes(1));const first=h.root.querySelector('[data-page="1"]');h.edit('edited');
   assert.equal(h.ui.setLivePages({canvases:new Map([[1,document.createElement('canvas')],[2,document.createElement('canvas')]]),revision:1,durationMs:1}),false);
   assert.equal(h.root.querySelector('[data-page="1"]'),first);
 }finally{h.cleanup();}
});
test('downloading an incrementally changed preview compiles current PDF before download',async()=>{
 let downloads=0;const reasons=[];
 const h=setup({onCompile:async({reason})=>{reasons.push(reason);return {pdf:bytes(2)};}});
 try {
   h.dom.window.HTMLAnchorElement.prototype.click=()=>downloads++;
   h.auto(false);await h.ui.setPdf(bytes(1));h.edit('math edit');
   h.ui.setLivePages({canvases:new Map(),revision:1,durationMs:2});
   h.event(h.a('download-pdf'),'click');await tick(20);
   assert.deepEqual(reasons,['download']);assert.equal(downloads,1);assert.equal(h.ui.getState().pdfRevision,1);
 }finally{h.cleanup();}
});
