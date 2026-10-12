// Host orchestration tests with mocked Workers/SAB, not real-browser or TeX tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import {BackgroundEngine,LiveEngine} from '../core/engine-client.js';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const frame=header=>{const data=new TextEncoder().encode(JSON.stringify(header)),out=new Uint8Array(data.length+5);new DataView(out.buffer).setUint32(0,data.length+1,true);out[4]=0;out.set(data,5);return out};
class MockWorker {
 static all=[];
 constructor(){this.sent=[];MockWorker.all.push(this)}
 postMessage(message){this.sent.push(message)}
 terminate(){this.terminated=true}
 emit(data){this.onmessage?.({data})}
}
const options={base:'https://local.test/',files:{}};
async function withWorkers(fn){const before=globalThis.Worker;globalThis.Worker=MockWorker;MockWorker.all=[];try{await fn()}finally{globalThis.Worker=before}}
async function liveStarted(){const live=new LiveEngine(options),starting=live.start('preamble');const worker=MockWorker.all.at(-1);worker.emit({bytes:frame({op:'ready'})});await starting;return {live,worker}}

test('background cancellation during startup rejects instead of hanging',()=>withWorkers(async()=>{
 const engine=new BackgroundEngine(options);const starting=engine.start();engine.stop();await assert.rejects(starting,/cancelled/);assert.equal(engine.pending.size,0);assert.equal(engine.ready,null);
}));
test('background repeat starts ignore old worker errors and messages',()=>withWorkers(async()=>{
 const engine=new BackgroundEngine(options);const one=engine.start(),old=MockWorker.all.at(-1);engine.stop();await assert.rejects(one);const two=engine.start(),current=MockWorker.all.at(-1);old.emit({type:'ready'});old.onerror({message:'stale error'});assert.equal(current.terminated,undefined);current.emit({type:'ready'});await two;const compilation=engine.compile('source');await tick();const req=current.sent.find(x=>x.type==='compile');old.emit({type:'result',id:req.id,pdf:new Uint8Array([0])});current.emit({type:'result',id:req.id,pdf:new Uint8Array([1])});assert.equal((await compilation).pdf[0],1);engine.stop();
}));
test('background stop rejects all pending jobs and supports retry',()=>withWorkers(async()=>{
 const engine=new BackgroundEngine(options),ready=engine.start();MockWorker.all.at(-1).emit({type:'ready'});await ready;const a=engine.compile('A'),b=engine.compile('B');await tick();engine.stop();await Promise.all([assert.rejects(a,/cancelled/),assert.rejects(b,/cancelled/)]);assert.equal(engine.pending.size,0);const retry=engine.start();MockWorker.all.at(-1).emit({type:'ready'});await retry;engine.stop();
}));
test('background worker crash rejects initialization and clears state',()=>withWorkers(async()=>{
 const engine=new BackgroundEngine(options),ready=engine.start();MockWorker.all.at(-1).onerror({message:'crash'});await assert.rejects(ready,/crash/);assert.equal(engine.worker,null);assert.equal(engine.ready,null);
}));
test('live context and compile are queued atomically',()=>withWorkers(async()=>{
 const {live}=await liveStarted(),events=[];let last;
 live.send=async object=>{events.push(object);last=object};live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:last.req,ctx:1,status:'ok'}});
 await Promise.all([live.compile({label:'A'},'A'),live.compile({label:'B'},'B')]);assert.deepEqual(events.map(x=>x.op),['context','compile','context','compile']);assert.equal(events[0].ctx.label,'A');assert.equal(events[1].source,'A');assert.equal(events[2].ctx.label,'B');live.stop();
}));
test('live restart rejects old queued work without sending to new worker',()=>withWorkers(async()=>{
 const {live}=await liveStarted();const queued=live.transact({op:'ping'});const restarted=live.start('new preamble'),worker=MockWorker.all.at(-1);worker.emit({bytes:frame({op:'ready'})});await restarted;await assert.rejects(queued,/restarted/);assert.equal(Atomics.load(live.ctl,0),0);assert.equal(live.readers.length,0);live.stop();
}));
test('live restart rejects old waiting readers; stale events cannot kill replacement',()=>withWorkers(async()=>{
 const {live,worker:old}=await liveStarted();const pending=live.read();const restarted=live.start('new preamble'),current=MockWorker.all.at(-1);await assert.rejects(pending,/restarted/);old.emit({error:'old failure'});old.onerror({message:'old crash'});assert.equal(current.terminated,undefined);current.emit({bytes:frame({op:'ready'})});await restarted;assert.equal(live.worker,current);live.stop();
}));
test('live timeout rejects every reader, closes worker and future reads reject promptly',()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();const a=live.read(5),b=live.read(1000);await Promise.all([assert.rejects(a,/timed out/),assert.rejects(b,/timed out/)]);assert.equal(worker.terminated,true);assert.equal(live.readers.length,0);await assert.rejects(live.read(),/timed out/);
}));
test('live response correlation rejects wrong request ID',()=>withWorkers(async()=>{
 const {live}=await liveStarted();let last;live.send=async object=>{last=object};live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:999,ctx:1,status:'ok'}});await assert.rejects(live.compile({},'A'),/Mismatched/);assert.equal(live.worker,null);
}));
test('live frame validation rejects truncated binary headers and clears pending readers',()=>withWorkers(async()=>{
 const {live}=await liveStarted();const pending=live.read();const corrupt=new Uint8Array([1,0,0,0,1]);live.feed(corrupt);await assert.rejects(pending,/Truncated/);assert.equal(live.worker,null);assert.equal(live.readers.length,0);
}));
test('fonts are delivered before corresponding frame is resolved',()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();const order=[];live.onFonts=()=>order.push('fonts');const read=live.read().then(()=>order.push('frame'));worker.emit({fonts:{a:new Uint8Array()},bytes:frame({op:'ok',id:1})});await read;assert.deepEqual(order,['fonts','frame']);live.stop();
}));

for(const [label,state] of Object.entries({
 'array leaks':{leaks:['globalMacro']},
 'object leaks':{leaks:{globalMacro:true}},
 'counter mutation':{counters:{section:1}},
 'internal error':{internal:'finish failed',status:'error',errors:[{message:'internal error'}]}
}))test(`live ${label} discards polluted worker and rejects queued work`,()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();let last;let sent=0;
 live.send=async object=>{last=object;sent++};
 live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:last.req,ctx:1,status:'ok',...state}});
 const first=live.compile({},'A'),queued=live.compile({},'B');
 await Promise.all([assert.rejects(first),assert.rejects(queued)]);
 assert.equal(worker.terminated,true);assert.equal(live.worker,null);assert.equal(sent,2);assert.equal(live.readers.length,0);
 await assert.rejects(live.compile({},'C'));assert.equal(sent,2);
}));

test('empty live state maps are accepted and ordinary TeX error leaves reusable worker',()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();let last,result={leaks:{},counters:[],internal:null};
 live.send=async object=>{last=object};live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:last.req,ctx:1,status:'ok',...result}});
 await live.compile({},'A');result={status:'error',errors:[{message:'Undefined control sequence'}]};await assert.rejects(live.compile({},'B'),/Undefined/);assert.equal(live.worker,worker);assert.equal(worker.terminated,undefined);live.stop();
}));

test('unchanged preamble and aux reuse the warming and ready live worker',()=>withWorkers(async()=>{
 const live=new LiveEngine(options),aux=new TextEncoder().encode('labels');
 const first=live.start('preamble',aux),worker=MockWorker.all.at(-1),generation=live.generation;
 const second=live.start('preamble',aux.slice());assert.equal(MockWorker.all.length,1);
 worker.emit({bytes:frame({op:'ready'})});await Promise.all([first,second]);
 await live.start('preamble',aux.slice());assert.equal(live.generation,generation);assert.equal(live.worker,worker);
 const changed=live.start('preamble',new TextEncoder().encode('new labels'));
 assert.equal(worker.terminated,true);assert.equal(MockWorker.all.length,2);
 MockWorker.all.at(-1).emit({bytes:frame({op:'ready'})});await changed;live.stop();
}));

test('known equation counter advancement is accepted; changed numbering discards the worker',()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();let last,counters={equation:3};
 live.send=async object=>{last=object;};
 live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:last.req,ctx:1,status:'ok',counters}});
 await live.compile({},'equation',{equation:3});assert.equal(live.worker,worker);
 counters={equation:4};await assert.rejects(live.compile({},'changed equation',{equation:3}),/state changed/);
 assert.equal(worker.terminated,true);
}));

test('background sends only changed project files, removes dropped ones and resets when the root or worker changes',()=>withWorkers(async()=>{
 const engine=new BackgroundEngine(options),ready=engine.start(),worker=MockWorker.all.at(-1);worker.emit({type:'ready'});await ready;
 const jobs=()=>worker.sent.filter(message=>message.type==='compile'),finish=async job=>{await tick();const sent=jobs().at(-1);worker.emit({type:'result',id:sent.id,pdf:new Uint8Array([1])});await job;return sent;};
 const a={path:'a.tex',data:'A',rev:1},fig={path:'img/fig.png',data:new Uint8Array([1]),rev:2};
 let sent=await finish(engine.compile('main',{root:'paper.tex',files:[a,fig]}));
 assert.equal(sent.root,'paper.tex');assert.equal(sent.project.reset,true);assert.deepEqual(sent.project.write.map(file=>file.path),['a.tex','img/fig.png']);assert.deepEqual(sent.project.remove,[]);
 sent=await finish(engine.compile('main',{root:'paper.tex',files:[{...a,data:'A2',rev:3},fig]}));
 assert.equal(sent.project.reset,false);assert.deepEqual(sent.project.write,[{path:'a.tex',data:'A2'}]);
 sent=await finish(engine.compile('main',{root:'paper.tex',files:[fig]}));
 assert.deepEqual(sent.project.write,[]);assert.deepEqual(sent.project.remove,['a.tex']);
 sent=await finish(engine.compile('main',{root:'other.tex',files:[fig]}));
 assert.equal(sent.project.reset,true);assert.deepEqual(sent.project.write.map(file=>file.path),['img/fig.png']);
 await assert.rejects(engine.compile('main',{files:[{path:'../texlive/x',data:'',rev:1}]}),/Unsafe/);
 await assert.rejects(engine.compile('main',{root:'/etc/x.tex'}),/Unsafe/);
 sent=await finish(engine.compile('legacy'));assert.equal(sent.root,'main.tex');assert.equal(sent.project.reset,true);
 engine.stop();const again=engine.start(),next=MockWorker.all.at(-1);next.emit({type:'ready'});await again;
 const job=engine.compile('main',{files:[fig]});await tick();const first=next.sent.find(message=>message.type==='compile');
 assert.equal(first.project.reset,true);assert.deepEqual(first.project.write.map(file=>file.path),['img/fig.png'],'a new worker starts with an empty project');
 next.emit({type:'error',id:first.id,message:'! Undefined control sequence.',log:'full log'});
 await assert.rejects(job,error=>error.log==='full log'&&/Undefined/.test(error.message));engine.stop();
}));
test('live start passes preamble files and restarts only when they change',()=>withWorkers(async()=>{
 const live=new LiveEngine(options),file={path:'macros.tex',data:'\\newcommand{\\R}{}',rev:1};
 const starting=live.start('preamble',undefined,[file]),worker=MockWorker.all.at(-1);worker.emit({bytes:frame({op:'ready'})});await starting;
 assert.deepEqual(worker.sent[0].project,[{path:'macros.tex',data:file.data}]);
 await live.start('preamble',undefined,[{...file}]);assert.equal(MockWorker.all.at(-1),worker,'same revisions reuse the engine');
 const restarted=live.start('preamble',undefined,[{...file,rev:2}]),next=MockWorker.all.at(-1);assert.notEqual(next,worker);assert.equal(worker.terminated,true);next.emit({bytes:frame({op:'ready'})});await restarted;
 await assert.rejects(live.start('preamble',undefined,[{path:'../x',data:'',rev:1}]),/Unsafe/);assert.equal(live.worker,next,'a refused start leaves the running engine alone');live.stop();
}));
test('preview typesetting tolerates counters but still discards a polluted worker',()=>withWorkers(async()=>{
 const {live,worker}=await liveStarted();let last,state={counters:{equation:4}};
 live.send=async object=>{last=object};live.read=async()=>({header:last.op==='context'?{op:'ok',id:1}:{op:'result',req:last.req,ctx:1,status:'ok',...state}});
 assert.equal((await live.typeset({},'$x$')).header.counters.equation,4);assert.equal(live.worker,worker);
 state={status:'error',errors:[{message:'Undefined control sequence'}]};await assert.rejects(live.typeset({},'$\\x$'),/Undefined control sequence/);assert.equal(live.worker,worker,'an ordinary TeX error keeps the engine');
 state={leaks:['R']};await assert.rejects(live.typeset({},'$\\R$'));assert.equal(live.worker,null);assert.equal(worker.terminated,true);
}));
