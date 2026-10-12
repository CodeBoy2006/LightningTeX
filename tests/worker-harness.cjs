// Executes the identical browser worker script against actual WASM in Node.
// This is not a browser DOM or browser security policy test.
const {parentPort,workerData}=require('node:worker_threads');const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');const {fileURLToPath,pathToFileURL}=require('node:url');
const entry=workerData.script;global.require=require;global.__dirname=path.dirname(entry);global.self=global;global.location={href:pathToFileURL(entry).href};
global.importScripts=(...urls)=>{for(let u of urls){const p=u.startsWith('file:')?fileURLToPath(u):path.resolve(path.dirname(entry),u);vm.runInThisContext(fs.readFileSync(p,'utf8'),{filename:p})}};
global.postMessage=v=>parentPort.postMessage(v);importScripts(entry);parentPort.on('message',data=>global.onmessage({data}));
