// DOM interaction tests only. These do not exercise a real browser or TeX engine.
// Run from project root: node --test ui/editor.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountEditor } from './editor.js';
import { TEMPLATES } from './templates.js';
const tick = (ms=0) => new Promise(resolve=>setTimeout(resolve,ms));
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const bytes = value => new Uint8Array([37,80,68,70,value]);
const upload = (name,content,size) => {const data=typeof content==='string'?new TextEncoder().encode(content):content;return {name,size:size??data.length,reads:0,async arrayBuffer(){this.reads++;return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength);}};};
function setup(options={}) {
  const dom=new JSDOM('<!doctype html><div id="app"></div>',{url:'https://local.test'});
  const previous={};
  for(const key of ['window','document','localStorage','Node']){previous[key]=globalThis[key];globalThis[key]=dom.window[key];}
  for(const [key,value] of Object.entries(options.storage||{}))localStorage.setItem(key,value);
  const root=document.querySelector('#app');
  const rendered=[];
  const ui=mountEditor({root,previewIntervalMs:5,renderPdf:async ({bytes,container})=>{rendered.push(bytes.at(-1));container.textContent=`PDF ${bytes.at(-1)}`;return {pages:1};},...options});
  const q=id=>root.querySelector(`[data-id="${id}"]`);
  const a=id=>root.querySelector(`[data-action="${id}"]`);
  const event=(el,name,extra={})=>el.dispatchEvent(name==='keydown'?new dom.window.KeyboardEvent(name,{bubbles:true,cancelable:true,...extra}):new dom.window.Event(name,{bubbles:true,...extra}));
  const edit=text=>{q('source').value=text;event(q('source'),'input');};
  const auto=value=>{q('auto-compile').checked=value;event(q('auto-compile'),'change');};
  const type=data=>{const input=q('source'),typed=new dom.window.InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data});if(input.dispatchEvent(typed)){input.setRangeText(data,input.selectionStart,input.selectionEnd,'end');event(input,'input');}};
  ui.setEngineStatus({status:'ready'});
  return {ui,root,q,a,event,edit,auto,type,rendered,dom,cleanup(){ui.destroy();dom.window.close();for(const [key,value] of Object.entries(previous)){if(value===undefined)delete globalThis[key];else globalThis[key]=value;}}};
}
function memoryStore(saved=null){
  const files=new Map((saved?.files||[]).map(file=>[file.path,file]));let meta=saved?{main:saved.main,tabs:saved.tabs,active:saved.active,folders:saved.folders}:null;
  return {files,cleared:0,get meta(){return meta;},
    async load(){return meta?{...meta,files:[...files.values()]}:null;},
    async save({put=[],remove=[],meta:next,reset}){if(reset)files.clear();for(const path of remove)files.delete(path);for(const file of put)files.set(file.path,file);if(next)meta=next;},
    async clear(){files.clear();meta=null;this.cleared++;}};
}

test('templates do not force legacy T1 fonts',()=>{assert.ok(TEMPLATES[0].files['main.tex'].includes('\\documentclass'));for(const template of TEMPLATES)for(const text of Object.values(template.files))assert.ok(!text.includes('fontenc'));});

test('repeat compilation replaces PDF and manual requests do not overlap',async()=>{
  let calls=0;const wait=deferred();const h=setup({onCompile:async()=>{calls++;if(calls===1)await wait.promise;return {pdf:bytes(calls)};}});
  try {const first=h.ui.compile();await h.ui.compile();assert.equal(calls,1);wait.resolve();await first;await h.ui.compile();assert.equal(calls,2);assert.deepEqual(h.rendered,[1,2]);assert.equal(h.q('preview-status-text').textContent,'Up to date');}finally{h.cleanup();}
});
test('readiness and compile controls follow the engine status',async()=>{
  let calls=0;const h=setup({onCompile:async()=>{calls++;}});
  try {
    for(const status of ['loading','error']){
      h.ui.setEngineStatus({status});assert.equal(h.ui.getState().ready,false);assert.equal(h.a('compile').disabled,true);
      await h.ui.compile();assert.equal(calls,0);
    }
    h.ui.setEngineStatus({status:'ready'});assert.equal(h.ui.getState().ready,true);assert.equal(h.a('compile').disabled,false);
    await h.ui.compile();assert.equal(calls,1);
  }finally{h.cleanup();}
});

test('cancellation ignores stale response and allows a fresh compilation',async()=>{
  const first=deferred();let calls=0,cancels=0;const h=setup({onCancel:()=>cancels++,onCompile:()=>++calls===1?first.promise:Promise.resolve({pdf:bytes(2)})});
  try {const old=h.ui.compile();h.ui.cancel();assert.equal(cancels,1);assert.equal(h.ui.getState().compiling,false);await h.ui.compile();first.resolve({pdf:bytes(1)});await old;assert.deepEqual(h.rendered,[2]);assert.match(h.q('preview-viewport').textContent,/PDF 2/);}finally{h.cleanup();}
});

test('newer edit during compile schedules a second compile, then reaches current revision',async()=>{
  const first=deferred();const requests=[];const h=setup({onCompile:request=>{requests.push(request);return requests.length===1?first.promise:Promise.resolve({pdf:bytes(2)});}});
  try {const run=h.ui.compile();h.edit('new document');await tick(10);assert.equal(requests.length,1);first.resolve({pdf:bytes(1)});await run;assert.equal(h.q('preview-status-text').textContent,'Out of date');await tick(30);assert.equal(requests.length,2);assert.equal(requests[1].source,'new document');assert.equal(h.ui.getState().pdfRevision,h.ui.getState().revision);}finally{h.cleanup();}
});

test('compile errors preserve last good PDF, mark edits stale and open the panel',async()=>{
  let calls=0;const h=setup({onCompile:async()=>{if(++calls===1)return {pdf:bytes(1)};throw new Error('Undefined control sequence <unsafe>');}});
  try {h.auto(false);await h.ui.compile();assert.equal(h.q('panel').hidden,true);h.edit('broken source');await h.ui.compile();assert.match(h.q('preview-viewport').textContent,/PDF 1/);assert.equal(h.q('preview-status-text').textContent,'Out of date');assert.equal(h.a('download-pdf').disabled,false);assert.equal(h.q('panel').hidden,false);assert.equal(h.q('logs').hidden,false);assert.match(h.q('logs').textContent,/<unsafe>/);assert.equal(h.q('logs').querySelector('unsafe'),null);}finally{h.cleanup();}
});

test('a panel opened by an error closes again once the document compiles',async()=>{
  let fail=true;const h=setup({onCompile:async()=>{if(fail)throw new Error('broken');return {pdf:bytes(1)};}});
  try {h.auto(false);await h.ui.compile();assert.equal(h.q('panel').hidden,false);fail=false;await h.ui.compile();assert.equal(h.q('panel').hidden,true);
    fail=true;h.event(h.a('toggle-panel'),'click');h.edit('x');await h.ui.compile();fail=false;await h.ui.compile();assert.equal(h.q('panel').hidden,false,'a panel the user opened stays open');}finally{h.cleanup();}
});

test('older asynchronous PDF rendering cannot replace a newer preview',async()=>{
  const pending=new Map();const h=setup({renderPdf:({bytes,container})=>{const wait=deferred();pending.set(bytes.at(-1),wait);container.textContent=`PDF ${bytes.at(-1)}`;return wait.promise;}});
  try {const old=h.ui.setPdf(bytes(1),{revision:0});const newer=h.ui.setPdf(bytes(2),{revision:0});pending.get(2).resolve({pages:1});await newer;pending.get(1).resolve({pages:1});await old;assert.equal(h.q('preview-viewport').textContent,'PDF 2');}finally{h.cleanup();}
});

test('failed PDF rendering preserves the last good preview',async()=>{
  const h=setup({renderPdf:async({bytes,container})=>{if(bytes.at(-1)===2)throw new Error('bad PDF');container.textContent='good PDF';}});
  try {await h.ui.setPdf(bytes(1));await h.ui.setPdf(bytes(2));assert.equal(h.q('preview-viewport').textContent,'good PDF');assert.match(h.q('logs').textContent,/bad PDF/);}finally{h.cleanup();}
});

test('source, file names, logs, problems and status text cannot inject HTML',()=>{
  const h=setup();const attack='<img src=x onerror="window.pwned=1"><script>window.pwned=2</script>',name='<img src=x onerror="window.pwned=1">.tex';
  try {h.auto(false);h.ui.setSource(attack);h.ui.project.write(name,attack);h.ui.openFile(name);h.ui.log(attack);h.ui.setLiveStatus({state:'full',reason:attack});
    h.ui.setProblems([{severity:'error',message:attack,file:name,line:1}]);h.ui.setError(new Error(attack));
    assert.equal(h.q('source').value,attack);assert.equal(h.q('filename').textContent,name);assert.match(h.q('problems').textContent,/onerror/);
    assert.equal(h.root.querySelectorAll('img,script').length,0);assert.equal(h.dom.window.pwned,undefined);}finally{h.cleanup();}
});

test('files are kept in the store by default; turning that off clears it',async()=>{
  const store=memoryStore(),h=setup({store});
  try {await h.ui.ready;h.auto(false);assert.equal(h.q('persist').checked,true);h.edit('private draft');await tick(450);
    assert.equal(store.files.get('main.tex').text,'private draft');assert.equal(store.meta.main,'main.tex');assert.equal(h.q('save-status').textContent,'Saved');
    h.ui.project.mkdir('figures');h.ui.project.write('notes/a.tex','A');h.ui.project.rename('notes/a.tex','notes/b.tex');await tick(450);assert.deepEqual([...store.files.keys()].sort(),['main.tex','notes/b.tex']);
    assert.deepEqual(store.meta.folders,['figures'],'saving must not turn inferred directories into explicit folders');
    h.q('persist').checked=false;h.event(h.q('persist'),'change');await tick();assert.equal(store.cleared,1);assert.equal(store.files.size,0);assert.equal(h.q('save-status').textContent,'Not saved');
    h.edit('later');await tick(450);assert.equal(store.files.size,0);}finally{h.cleanup();}
});

test('a stored project, its main file and open tabs are restored',async()=>{
  const store=memoryStore({main:'paper.tex',tabs:['paper.tex','ch/one.tex'],active:'ch/one.tex',files:[{path:'paper.tex',text:'\\documentclass{article}'},{path:'ch/one.tex',text:'One'},{path:'fig.png',data:new Uint8Array([1,2,3])}]});
  const requests=[],h=setup({store,onCompile:async request=>{requests.push(request);return {pdf:bytes(1)};}});
  try {assert.equal(h.q('source'),null,'nothing is editable before the stored project loads');await h.ui.compile();assert.equal(requests.length,0);
    await h.ui.ready;assert.equal(h.q('source').value,'One');assert.equal(h.q('filename').textContent,'one.tex');assert.equal(h.ui.getState().root,'paper.tex');assert.equal(h.q('tabs').children.length,2);
    await h.ui.compile();assert.equal(requests[0].root,'paper.tex');assert.deepEqual(requests[0].files.map(file=>file.path).sort(),['ch/one.tex','fig.png']);}finally{h.cleanup();}
});

test('a draft from the single-file version becomes the first project',()=>{
  const h=setup({storage:{'realtime-tex-web:save-draft:v1':'yes','realtime-tex-web:draft:v1':JSON.stringify({source:'old draft',filename:'main.tex'})}});
  try {assert.equal(h.ui.getSource(),'old draft');assert.equal(localStorage.getItem('realtime-tex-web:draft:v1'),null);}finally{h.cleanup();}
});

test('upload adds text and binary files, replaces with undo, and rejects oversized files unread',async()=>{
  const h=setup();
  try {h.auto(false);const huge=upload('huge.bin','x',21*1024*1024);await h.ui.upload([huge]);assert.match(h.q('toast').textContent,/20 MB/);assert.equal(huge.reads,0);assert.equal(h.ui.project.has('huge.bin'),false);
    await h.ui.upload([upload('refs.bib','@book{a}'),upload('fig.png',new Uint8Array([137,80,78,71,0,1]))],'assets');
    assert.equal(h.ui.project.get('assets/refs.bib').text,'@book{a}');assert.ok(h.ui.project.get('assets/fig.png').data instanceof Uint8Array);assert.equal(h.ui.getState().active,'assets/refs.bib');
    await h.ui.upload([upload('refs.bib','@book{b}')],'assets');assert.equal(h.ui.project.get('assets/refs.bib').text,'@book{b}');
    h.q('toast').querySelector('button').click();assert.equal(h.ui.project.get('assets/refs.bib').text,'@book{a}');
    await h.ui.upload([upload('../escape.tex','x')]);assert.equal(h.ui.project.paths().some(path=>path.includes('escape')),false);}finally{h.cleanup();}
});

test('keyboard Escape leaves the source editor and cancels active compilation',async()=>{
  const waiting=deferred();let cancelled=0;const h=setup({onCompile:()=>waiting.promise,onCancel:()=>cancelled++});
  try {h.q('source').focus();h.event(h.q('source'),'keydown',{key:'Tab'});assert.ok(h.ui.getSource().endsWith('  '));h.event(h.q('source'),'keydown',{key:'Escape'});assert.equal(document.activeElement,h.q('tabs').querySelector('[aria-selected="true"]'));const run=h.ui.compile();h.event(h.root,'keydown',{key:'Escape'});assert.equal(cancelled,1);assert.equal(h.ui.getState().compiling,false);waiting.resolve({pdf:bytes(1)});await run;assert.equal(h.rendered.length,0);}finally{h.cleanup();}
});

test('cancellation during PDF rendering aborts renderer and cannot install cancelled output',async()=>{
  const rendering=deferred(),started=deferred();let signal;
  const h=setup({onCompile:async()=>({pdf:bytes(2)}),renderPdf:async request=>{
    request.container.textContent=`PDF ${request.bytes.at(-1)}`;
    if(request.bytes.at(-1)===2){signal=request.signal;started.resolve();await rendering.promise;}
  }});
  try {h.auto(false);await h.ui.setPdf(bytes(1));const run=h.ui.compile();await started.promise;h.ui.cancel();assert.equal(signal.aborted,true);rendering.resolve();await run;assert.equal(h.q('preview-viewport').textContent,'PDF 1');assert.equal(h.ui.getState().compiling,false);assert.equal(h.q('panel').hidden,true);}finally{h.cleanup();}
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

test('unfinished automatic math keeps PDF and focus without opening the panel; correction recovers',async()=>{
  const h=setup({onCompile:async({source})=>{
    if(source.endsWith('{'))throw Error('Missing closing brace');return {pdf:bytes(2)};
  }});
  try {
    await h.ui.setPdf(bytes(1));h.q('source').focus();h.edit('Equation $x^{');await tick(20);
    assert.equal(h.q('preview-viewport').textContent,'PDF 1');
    assert.equal(h.q('panel').hidden,true);assert.equal(h.q('toast').hidden,true);
    assert.equal(document.activeElement,h.q('source'));assert.match(h.q('logs').textContent,/closing brace/);
    h.edit('Equation $x^{2}$');await tick(20);
    assert.equal(h.q('preview-status-text').textContent,'Up to date');
  }finally{h.cleanup();}
});

test('local Full update replaces only affected pages and preserves PDF revision',async()=>{
 const h=setup({renderPdf:async({container})=>{for(let i=1;i<=2;i++){const canvas=document.createElement('canvas');canvas.dataset.page=String(i);canvas.dataset.base='600';canvas.setAttribute('aria-label',`PDF page ${i}`);container.append(canvas);}}});
 try {
   h.auto(false);await h.ui.setPdf(bytes(1));const second=h.root.querySelector('[data-page="2"]');
   h.edit('local formula edit');const node=document.createElement('canvas'),revision=h.ui.getState().revision;
   assert.equal(h.ui.setLivePages({canvases:new Map([[1,node]]),revision,durationMs:3}),true);
   assert.equal(h.root.querySelector('[data-page="1"]'),node);assert.equal(node.dataset.base,'600');assert.equal(h.root.querySelector('[data-page="2"]'),second);
   assert.equal(h.ui.getState().previewRevision,revision);assert.equal(h.ui.getState().pdfRevision,0);
   assert.equal(h.q('preview-status-text').textContent,'Live');assert.equal(h.q('stat-live').textContent,'Live 3.0 ms');
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

test('compile receives the main file as root and the rest as files; only other files change filesRev',async()=>{
  const requests=[],h=setup({source:'\\input{part}',onCompile:async request=>{requests.push(request);return {pdf:bytes(1)};}});
  try {h.auto(false);h.ui.project.write('part.tex','Part');h.ui.project.write('fig.png',new Uint8Array([1,2]));await h.ui.compile();
    assert.equal(requests[0].root,'main.tex');assert.equal(requests[0].source,'\\input{part}');
    assert.deepEqual(requests[0].files.map(file=>[file.path,typeof file.data==='string'?file.data:[...file.data]]),[['part.tex','Part'],['fig.png',[1,2]]]);
    const before=h.ui.getState().filesRev;h.edit('\\input{part} more');assert.equal(h.ui.getState().filesRev,before,'main text edits stay eligible for local updates');
    h.ui.openFile('part.tex');assert.equal(h.q('source').value,'Part');h.edit('Part two');assert.ok(h.ui.getState().filesRev>before);
    await h.ui.compile();const part=requests[1].files.find(file=>file.path==='part.tex');assert.equal(part.data,'Part two');assert.notEqual(part.rev,requests[0].files[0].rev);assert.equal(requests[1].files.find(file=>file.path==='fig.png').rev,requests[0].files[1].rev);
    h.ui.project.write('paper.tex','\\documentclass{article}');h.ui.project.setMain('paper.tex');await h.ui.compile();assert.equal(requests[2].root,'paper.tex');assert.ok(requests[2].files.some(file=>file.path==='main.tex'));}finally{h.cleanup();}
});

test('deleting a file closes its tab and can be undone; renaming keeps the tab',async()=>{
  const h=setup();
  try {h.auto(false);h.ui.project.write('a.tex','A');h.ui.openFile('a.tex');assert.equal(h.q('filename').textContent,'a.tex');
    h.ui.project.rename('a.tex','sub/b.tex');assert.equal(h.q('filename').textContent,'b.tex');assert.equal(h.q('source').value,'A');
    const row=[...h.q('tree').children].find(item=>item.dataset.path==='sub/b.tex');assert.ok(row);h.event(row,'keydown',{key:'Delete'});
    assert.equal(h.ui.project.has('sub/b.tex'),false);assert.equal(h.ui.getState().active,'main.tex');assert.match(h.q('toast').textContent,/Deleted b\.tex/);
    h.q('toast').querySelector('button').click();assert.equal(h.ui.project.get('sub/b.tex').text,'A');
    h.ui.project.remove('main.tex');assert.equal(h.ui.getState().root,null);assert.equal(h.a('compile').disabled,true);assert.equal(h.q('stat-engine').textContent,'No main file');}finally{h.cleanup();}
});
test('file tree keeps folder-first natural order, depth and collapsed descendants',()=>{
  const h=setup();
  try {
    h.auto(false);h.ui.project.load({folders:['empty','orphan/nested'],files:[
      {path:'z.tex',text:'Z'},{path:'chapters/10.tex',text:'10'},{path:'chapters/deep/a.tex',text:'A'},
      {path:'main.tex',text:''},{path:'chapters/2.tex',text:'2'}]});
    const rows=()=>[...h.q('tree').children].map(row=>[row.dataset.path,Number(row.style.getPropertyValue('--depth'))]);
    const expected=[['chapters',0],['chapters/deep',1],['chapters/deep/a.tex',2],['chapters/2.tex',1],['chapters/10.tex',1],['empty',0],['main.tex',0],['z.tex',0]];
    assert.deepEqual(rows(),expected);
    h.event(h.q('tree').firstChild,'keydown',{key:'ArrowLeft'});
    assert.deepEqual(rows(),[['chapters',0],['empty',0],['main.tex',0],['z.tex',0]]);
    h.ui.openFile('chapters/deep/a.tex');assert.deepEqual(rows(),expected);
  }finally{h.cleanup();}
});
test('tree background menu offers creation actions and restores source focus on Escape',()=>{
  const h=setup();
  try {
    h.q('source').focus();
    h.q('tree').dispatchEvent(new h.dom.window.MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:20,clientY:30}));
    const menu=h.root.querySelector('[role="menu"]');
    assert.deepEqual([...menu.querySelectorAll('.menu-label')].map(label=>label.textContent),['New file','New folder','Upload files']);
    h.event(menu,'keydown',{key:'Escape'});assert.equal(h.root.querySelector('[role="menu"]'),null);assert.equal(document.activeElement,h.q('source'));
  }finally{h.cleanup();}
});
test('indent and comment edits share selection bounds without including the following line',()=>{
  const source='alpha\n\n beta\ngamma',h=setup({source});
  try {
    h.auto(false);const input=h.q('source');input.focus();input.setSelectionRange(1,13);
    h.event(input,'keydown',{key:'Tab'});assert.equal(input.value,'  alpha\n\n   beta\ngamma');assert.deepEqual([input.selectionStart,input.selectionEnd],[3,17]);
    h.event(input,'keydown',{key:'Tab',shiftKey:true});assert.equal(input.value,source);assert.deepEqual([input.selectionStart,input.selectionEnd],[1,13]);
    h.event(input,'keydown',{key:'/',ctrlKey:true});assert.equal(input.value,'% alpha\n\n % beta\ngamma');assert.deepEqual([input.selectionStart,input.selectionEnd],[3,17]);
    h.event(input,'keydown',{key:'/',ctrlKey:true});assert.equal(input.value,source);assert.deepEqual([input.selectionStart,input.selectionEnd],[1,13]);
  }finally{h.cleanup();}
});

test('typed brackets pair, closers are typed over, and a closing dollar is not doubled',()=>{
  const h=setup();
  try {h.auto(false);h.edit('');h.q('source').focus();
    for(const key of ['$','x','^','{','2','}','$',' ','(','a',')'])h.type(key);
    assert.equal(h.q('source').value,'$x^{2}$ (a)');
    h.edit('$a');h.q('source').setSelectionRange(2,2);h.type('$');assert.equal(h.q('source').value,'$a$');
    h.edit('\\');h.q('source').setSelectionRange(1,1);h.type('{');assert.equal(h.q('source').value,'\\{','an escaped brace is a literal');
    h.edit('{}');h.q('source').setSelectionRange(1,1);h.event(h.q('source'),'keydown',{key:'Backspace'});assert.equal(h.q('source').value,'');
    h.edit('\\begin{align}');h.q('source').setSelectionRange(13,13);h.event(h.q('source'),'keydown',{key:'Enter'});assert.equal(h.q('source').value,'\\begin{align}\n  \n\\end{align}');assert.equal(h.q('source').selectionStart,16);}finally{h.cleanup();}
});

test('problems list jumps to the file and line; gutter marks follow the file',()=>{
  const h=setup({source:'one\ntwo\nthree'});
  try {h.auto(false);h.ui.project.write('part.tex','a\nb');
    h.ui.setProblems([{severity:'error',message:'Undefined control sequence \\x',file:'part.tex',line:2},{severity:'warning',message:'Reference undefined',file:'main.tex',line:3},{severity:'info',message:'System file',file:null,line:9}]);
    assert.equal(h.q('stat-problems').textContent,'11');assert.equal(h.q('problem-count').textContent,'3');
    const marked=()=>[...h.root.querySelectorAll('.view:not([hidden]) .cl')].map(line=>line.className.replace('cl','').replace('active','').trim());
    assert.deepEqual(marked(),['','','mark-warning']);
    const rows=h.q('problems').querySelectorAll('.problem');assert.equal(rows[2].disabled,true);rows[0].click();
    assert.equal(h.ui.getState().active,'part.tex');assert.equal(h.q('source').selectionStart,2);assert.deepEqual(marked(),['','mark-error flash']);
    h.ui.setProblems([]);assert.equal(h.q('problems').textContent,'No problems');assert.deepEqual(marked(),['','flash']);}finally{h.cleanup();}
});
test('gutter marks retain the worst severity per file and clear every open editor',()=>{
  const h=setup({source:'one\ntwo'});
  try {
    h.auto(false);h.ui.project.write('part.tex','part');h.ui.openFile('part.tex');h.ui.openFile('main.tex');
    h.ui.setProblems([
      {file:'main.tex',line:1,severity:'warning',message:'warning'},
      {file:'main.tex',line:1,severity:'error',message:'error'},
      {file:'main.tex',line:1,severity:'info',message:'info'},
      {file:'main.tex',line:0,severity:'error',message:'no line'},
      {file:'part.tex',line:1,severity:'info',message:'part info'},
      {file:'part.tex',line:1,severity:'warning',message:'part warning'}]);
    const shown=()=>[...h.root.querySelectorAll('.view:not([hidden]) .cl')].map(line=>[...line.classList].filter(name=>name.startsWith('mark-')));
    assert.deepEqual(shown(),[['mark-error'],[]]);h.ui.openFile('part.tex');assert.deepEqual(shown(),[['mark-warning']]);
    h.ui.setProblems([]);assert.equal(h.root.querySelectorAll('.mark-error,.mark-warning,.mark-info').length,0);
  }finally{h.cleanup();}
});

test('settings apply at once, persist, and reject corrupt stored values',()=>{
  const h=setup({storage:{'lightningtex:settings:v1':JSON.stringify({theme:'<b>',fontSize:900,lang:'zh',wrap:'yes',zoom:1.5})}});
  try {const app=h.root.firstElementChild,settings=()=>JSON.parse(localStorage.getItem('lightningtex:settings:v1'));
    assert.equal(app.dataset.theme,'light');assert.equal(h.ui.getSettings().fontSize,20);assert.equal(h.ui.getSettings().wrap,true);assert.equal(h.q('zoom-label').textContent,'150%');
    assert.equal(h.a('compile').textContent,'编译');assert.equal(h.q('preview-status-text').textContent,'未编译');
    const pick=(key,value)=>h.q('settings').querySelector(`[data-setting="${key}"] [data-value="${value}"]`).click();
    pick('lang','en');assert.equal(h.a('compile').textContent,'Compile');assert.equal(h.root.querySelector('.side-title').textContent,'Files');
    pick('theme','dark');pick('accent','teal');assert.equal(app.dataset.theme,'dark');assert.equal(document.documentElement.dataset.accent,'teal');assert.equal(settings().theme,'dark');
    const wrap=h.q('settings').querySelector('[data-setting="wrap"] input');wrap.checked=false;h.event(wrap,'change');assert.equal(h.root.querySelector('.code').dataset.wrap,'false');
    h.auto(false);assert.equal(settings().autoCompile,false);assert.equal(h.q('settings').querySelector('[data-setting="autoCompile"] input').checked,false);
    h.event(h.a('zoom-fit'),'click');assert.equal(h.q('zoom-label').textContent,'Fit');h.event(h.a('zoom-fit'),'click');assert.equal(h.q('zoom-label').textContent,'100%');
    h.event(h.a('zoom-in'),'click');assert.equal(settings().zoom,1.1);}finally{h.cleanup();}
});

test('a document without pages shows an empty page instead of a failure; a new project clears the old preview',async()=>{
  let empty=true;const pdf=new Uint8Array(2048);pdf[pdf.length-1]=1;
  const h=setup({onCompile:async()=>empty?{empty:true}:{pdf}});
  try {h.auto(false);await h.ui.compile();
    assert.equal(h.q('sheet').dataset.state,'empty');assert.equal(h.q('preview-status-text').textContent,'Up to date');assert.equal(h.q('panel').hidden,true);assert.equal(h.q('toast').hidden,true);assert.equal(h.a('download-pdf').disabled,true);assert.equal(h.q('stat-doc').textContent,'');
    h.edit('text');assert.equal(h.q('preview-status-text').textContent,'Out of date');empty=false;await h.ui.compile();
    assert.equal(h.q('preview-viewport').textContent,'PDF 1');assert.equal(h.q('sheet'),null);assert.equal(h.a('download-pdf').disabled,false);assert.match(h.q('stat-doc').textContent,/2\.0 KB/);
    h.ui.project.load({files:[{path:'main.tex',text:'other project'}]});
    assert.ok(h.q('sheet'),'the previous project\'s pages are gone');assert.equal(h.q('preview-status-text').textContent,'Not compiled');assert.equal(h.a('download-pdf').disabled,true);assert.equal(h.ui.getState().pdfRevision,-1);assert.equal(h.q('stat-doc').textContent,'');
    empty=true;await h.ui.compile();assert.equal(h.q('sheet').dataset.state,'empty');
    h.ui.setError(new Error('boom'));assert.equal(h.q('sheet').dataset.state,'failed');h.q('sheet').querySelector('[data-action="show-problems"]').click();assert.equal(h.q('panel').hidden,false);}finally{h.cleanup();}
});
