import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../public/runtime/background-worker.js',import.meta.url),'utf8');
test('auxiliary convergence compares every file and byte, independent of directory order',()=>{
  const context=vm.createContext({TextDecoder,Uint8Array,importScripts(){}});
  vm.runInContext(script,context);
  const files=new Map([['main.aux',new Uint8Array([65])],['chapters/one.aux',new Uint8Array([255])]]);
  assert.equal(context.sameAux(undefined,files),false);
  assert.equal(context.sameAux(files,new Map([...files].reverse())),true);
  assert.equal(context.sameAux(files,new Map([['main.aux',new Uint8Array([65])]])),false);
  assert.equal(context.sameAux(files,new Map([...files,['main.toc',new Uint8Array()]])),false);
  assert.equal(context.sameAux(files,new Map([...files,['chapters/one.aux',new Uint8Array([254])]])),false);
});
test('full jobs wait for package persistence before the next job mutates the filesystem',async()=>{
  const events=[],sent=[];let finishSave;
  const context=vm.createContext({TextDecoder,Uint8Array,Set,importScripts(){},postMessage:(message,transfer)=>sent.push({message,transfer})});
  vm.runInContext(script,context);
  context.save=()=>{events.push('save');return new Promise(resolve=>{finishSave=resolve;});};
  context.compile=id=>{events.push(id);if(id===2)throw Error('TeX error');return {id,pdf:new Uint8Array([1]),fonts:{font:new Uint8Array([2])},aux:new Uint8Array([3])};};
  vm.runInContext('engine={saveTexPackages:save};run=(source,id)=>compile(id)',context);
  context.onmessage({data:{type:'compile',id:1}});context.onmessage({data:{type:'compile',id:2}});
  await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,[1,'save']);assert.equal(sent.length,0);
  finishSave();await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(events,[1,'save',2,'save']);
  assert.equal(sent[0].message.id,1);assert.ok(sent[0].transfer.includes(sent[0].message.pdf.buffer));
  assert.ok(!sent[0].transfer.includes(sent[0].message.aux.buffer),'saved aux remains owned by the worker');
  finishSave();await new Promise(resolve=>setImmediate(resolve));assert.equal(sent[1].message.type,'error');
  context.onmessage({data:{type:'compile',id:3}});await new Promise(resolve=>setImmediate(resolve));finishSave();
  await new Promise(resolve=>setImmediate(resolve));assert.equal(sent[2].message.id,3);
});
