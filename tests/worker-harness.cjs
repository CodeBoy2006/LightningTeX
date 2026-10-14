// Executes the identical browser worker script against actual WASM in Node.
// This is not a browser DOM or browser security policy test.
const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {fileURLToPath,pathToFileURL}=require('node:url');
const entry=workerData.script;global.require=require;global.__dirname=path.dirname(entry);global.self=global;global.location={href:pathToFileURL(entry).href};
global.importScripts=(...urls)=>{for(let u of urls){const p=u.startsWith('file:')?fileURLToPath(u):path.resolve(path.dirname(entry),u);vm.runInThisContext(fs.readFileSync(p,'utf8'),{filename:p})}};
global.postMessage=(v,transfer)=>parentPort.postMessage(v,transfer);importScripts(entry);
// Node regression tests stay offline; browser tests exercise the synchronous remote lookup.
const loadEngine=global.loadRtexEngine;
const packages=workerData.offlinePackages===false?[]:JSON.parse(require('node:zlib').gunzipSync(fs.readFileSync(path.join(__dirname,'fixtures/tex-packages.json.gz'))));
global.loadRtexEngine=async options=>{
 const engine=await loadEngine({...options,env:{...options.env,TEXLIVE_REMOTE_ENDPOINT:''}});
 if(workerData.audit){
  const files=[];function walk(directory){for(const name of engine.FS.readdir(directory)){if(name==='.'||name==='..')continue;const file=directory+'/'+name;engine.FS.isDir(engine.FS.stat(file).mode)?walk(file):files.push(file);}}
  walk('/texlive');walk('/rtex');
  const support=Object.fromEntries(workerData.audit.map(file=>[file,require('node:crypto').createHash('sha256').update(engine.FS.readFile('/rtex/'+file)).digest('hex')]));
  parentPort.postMessage({type:'audit',files,support,chunkSize:engine.LZ4.CHUNK_SIZE});
 }
 // Captured downloads keep offline regressions on the same small basic runtime.
 for(const [key,data] of packages){const split=key.indexOf('_');engine.kpse_remote_register(key.slice(split+1),Number(key.slice(0,split)),Buffer.from(data,'base64'))}
 return engine;
};
parentPort.on('message',data=>global.onmessage({data}));
