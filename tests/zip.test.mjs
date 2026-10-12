import test from 'node:test';import assert from 'node:assert/strict';import zlib from 'node:zlib';
import {zip,unzip,crc32} from '../core/zip.js';
const text=value=>new TextEncoder().encode(value);
// A one-entry deflated archive, as other tools write them.
function deflated(name,plain,declared=plain.length){
  const path=text(name),packed=zlib.deflateRawSync(plain),local=new Uint8Array(30+path.length),entry=new Uint8Array(46+path.length),end=new Uint8Array(22);
  let view=new DataView(local.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(8,8,true);view.setUint32(18,packed.length,true);view.setUint32(22,declared,true);view.setUint16(26,path.length,true);local.set(path,30);
  view=new DataView(entry.buffer);view.setUint32(0,0x02014b50,true);view.setUint16(10,8,true);view.setUint32(16,crc32(plain),true);view.setUint32(20,packed.length,true);view.setUint32(24,declared,true);view.setUint16(28,path.length,true);entry.set(path,46);
  view=new DataView(end.buffer);view.setUint32(0,0x06054b50,true);view.setUint16(8,1,true);view.setUint16(10,1,true);view.setUint32(12,entry.length,true);view.setUint32(16,local.length+packed.length,true);
  return new Uint8Array(Buffer.concat([local,packed,entry,end]));
}
test('crc32 matches the reference check value',()=>assert.equal(crc32(text('123456789')),0xcbf43926));
test('stored archives round-trip, including UTF-8 names, empty and binary files',async()=>{
  const files=[{path:'main.tex',data:text('\\documentclass{article}')},{path:'图/α.txt',data:text('x'.repeat(5000))},{path:'empty.bin',data:new Uint8Array()},{path:'b.bin',data:Uint8Array.from({length:300},(_,i)=>i%256)}];
  const back=await unzip(zip(files));
  assert.deepEqual(back.map(file=>file.path),files.map(file=>file.path));
  for(const [i,file] of files.entries())assert.deepEqual([...back[i].data],[...file.data]);
});
test('deflated entries are inflated; directory entries are skipped',async()=>{
  const plain=text('y'.repeat(4000)),back=await unzip(deflated('folder/d.txt',plain));
  assert.equal(back.length,1);assert.equal(back[0].path,'folder/d.txt');assert.equal(back[0].data.length,4000);
  assert.deepEqual(await unzip(zip([{path:'dir/',data:new Uint8Array()}])),[]);
});
test('hostile or damaged archives are refused',async()=>{
  await assert.rejects(unzip(text('not a zip at all, just text')),/Not a ZIP/);
  await assert.rejects(unzip(deflated('bomb.txt',text('z'.repeat(100000)),10)),/larger than declared/);
  await assert.rejects(unzip(zip([{path:'a',data:new Uint8Array(100)},{path:'b',data:new Uint8Array(100)}]),{maxBytes:150}),/too large/);
  await assert.rejects(unzip(zip([{path:'a',data:new Uint8Array(1)},{path:'b',data:new Uint8Array(1)}]),{maxFiles:1}),/too large/);
  const cut=zip([{path:'a.txt',data:text('hello')}]);cut[0]=0;new DataView(cut.buffer).setUint32(cut.length-22+16,cut.length,true);
  await assert.rejects(unzip(cut),/Corrupt/);
});
