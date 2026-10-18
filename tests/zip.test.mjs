import test from 'node:test';import assert from 'node:assert/strict';import zlib from 'node:zlib';
import {zip,unzip,crc32} from '../core/zip.js';
const text=value=>new TextEncoder().encode(value);
// A one-entry deflated archive, as other tools write them.
function deflated(name,plain,declared=plain.length){
  const path=text(name),packed=zlib.deflateRawSync(plain),local=new Uint8Array(30+path.length),entry=new Uint8Array(46+path.length),end=new Uint8Array(22);
  let view=new DataView(local.buffer);view.setUint32(0,0x04034b50,true);view.setUint16(8,8,true);view.setUint32(14,crc32(plain),true);view.setUint32(18,packed.length,true);view.setUint32(22,declared,true);view.setUint16(26,path.length,true);local.set(path,30);
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
test('stored entries cannot exceed their declared size or bypass the output budget',async()=>{
  const archive=zip([{path:'a',data:text('12345678')}]),view=new DataView(archive.buffer),central=view.getUint32(archive.length-6,true);
  view.setUint32(central+24,1,true);
  await assert.rejects(unzip(archive,{maxBytes:1}),/size mismatch/);
});
test('entry signatures, directory bounds and CRCs are checked',async()=>{
  const archive=zip([{path:'a',data:text('hello')}]),badHeader=archive.slice(),badData=archive.slice(),badName=archive.slice();
  badHeader[0]=0;badData[31]^=1;
  const view=new DataView(badName.buffer);view.setUint16(view.getUint32(badName.length-6,true)+28,0xffff,true);
  await assert.rejects(unzip(badHeader),/Corrupt ZIP entry/);
  await assert.rejects(unzip(badData),/checksum mismatch/);
  await assert.rejects(unzip(badName),/Corrupt ZIP directory/);
  const compressed=deflated('a',text('hello')),header=new DataView(compressed.buffer);
  header.setUint32(header.getUint32(compressed.length-6,true)+16,0,true);
  await assert.rejects(unzip(compressed),/checksum mismatch/);
});
test('data descriptors may supply CRC and sizes after the local header',async()=>{
  const archive=deflated('a',text('hello')),view=new DataView(archive.buffer),central=view.getUint32(archive.length-6,true),descriptor=new Uint8Array(16),fields=new DataView(descriptor.buffer);
  fields.setUint32(0,0x08074b50,true);
  for(const [at,from] of [[4,16],[8,20],[12,24]])fields.setUint32(at,view.getUint32(central+from,true),true);
  view.setUint16(6,8,true);archive.fill(0,14,26);view.setUint16(central+8,8,true);view.setUint32(archive.length-6,central+16,true);
  const withDescriptor=new Uint8Array(Buffer.concat([archive.subarray(0,central),descriptor,archive.subarray(central)]));
  assert.equal(new TextDecoder().decode((await unzip(withDescriptor))[0].data),'hello');
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
