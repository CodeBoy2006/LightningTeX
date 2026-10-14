import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Worker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {exclusion} from '../engine/build/prune-data.mjs';

const base=new URL('../public/luahbtex/',import.meta.url);
test('source-built WASM embeds the exact incremental service and excludes removed resources',async()=>{
  const info=JSON.parse(await fs.readFile(new URL('build-info.json',base),'utf8'));
  const manifest=JSON.parse(await fs.readFile(new URL('asset-manifest.json',base),'utf8'));
  const wasm=gunzipSync(Buffer.concat(await Promise.all(manifest.assets['luahbtex.wasm'].parts.map(part=>fs.readFile(new URL(part.file,base))))));
  assert.equal(createHash('sha256').update(wasm).digest('hex'),info.wasmSha256);
  assert.ok(wasm.byteLength<8*1024*1024);
  assert.ok(!/This is (?:XeTeX|pdfTeX)/.test(wasm.toString('latin1')));
  assert.ok(!info.linkedArchives.some(name=>/icu|fontconfig|xetex|pdftex|TECkit|freetype/.test(name)));
  const worker=new Worker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(new URL('../public/runtime/background-worker.js',import.meta.url)),offlinePackages:false,audit:info.embeddedSupport.map(file=>file.file)}});
  try{
    const result=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',data=>{if(data.type==='audit')resolve(data);if(data.type==='error')reject(Error(data.message));});});
    worker.postMessage({type:'init',base:base.href,endpoint:''});
    const audit=await result;assert.equal(audit.chunkSize,16384);
    for(const {file,sha256} of info.embeddedSupport){assert.equal(audit.support[file],sha256,file);assert.equal(createHash('sha256').update(await fs.readFile(new URL('../engine/tex/'+file,import.meta.url))).digest('hex'),sha256,file);}
    for(const file of audit.files)assert.equal(exclusion(file.slice(1)),null,file);
    assert.ok(audit.files.includes('/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt'));
    assert.ok(audit.files.includes('/texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map'));
    assert.equal(audit.files.filter(file=>file.endsWith('.fmt')).length,1);
  }finally{await worker.terminate();}
});
