import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../public/runtime/tex-packages.js',import.meta.url),'utf8');
const bytes=new TextEncoder().encode('package contents');
const root='https://app.test/runtime/texlive-cache/';
function runtime(entries=new Map(),failure){
 const files=new Map(),warnings=[],writes=[];
 const cache={keys:async()=>[...entries.keys()].map(url=>({url})),match:async request=>entries.get(request.url)?.clone(),put:async(url,response)=>{if(failure==='write')throw Error('quota');entries.set(url,response);writes.push(url)}};
 const context={URL,Response,Uint8Array,Set,location:{href:'https://app.test/runtime/background-worker.js'},caches:{open:async name=>{context.cacheName=name;if(failure==='open')throw Error('denied');return cache}}};
 context.self=context;vm.runInNewContext(script,context);
 const engine={ENV:{TEXLIVE_REMOTE_ENDPOINT:'https://packages.test/2026'},FS:{mkdirTree(){},writeFile:(path,data)=>files.set(path,data),readFile:path=>files.get(path),readdir:()=>['.','..',...Array.from(files.keys(),path=>path.split('/').pop())]}};
 return {context,engine,files,warnings,writes,restore:()=>context.restoreTexPackages(engine,message=>warnings.push(message))};
}

test('remote files persist across workers, while misses and unsafe cache entries do not',async()=>{
 const entries=new Map([[root+'26_cached.sty',new Response(bytes)],['https://other.test/26_bad.sty',new Response(bytes)],[root+'.misses.json',new Response('[]')],[root+'51_empty.lua',new Response('')]]);
 const first=runtime(entries);await first.restore();
 assert.deepEqual([...first.files.keys()],['/tmp/texlive_remote/26_cached.sty']);
 first.files.set('/tmp/texlive_remote/26_new.sty',bytes);
 first.files.set('/tmp/texlive_remote/.misses.json',new TextEncoder().encode('["26/missing.sty"]'));
 await first.engine.saveTexPackages();await first.engine.saveTexPackages();
 assert.deepEqual(first.writes,[root+'26_new.sty']);
 const next=runtime(entries);next.context.location.href='https://app.test/runtime/live-worker.js';await next.restore();
 assert.deepEqual([...next.files.keys()],['/tmp/texlive_remote/26_cached.sty','/tmp/texlive_remote/26_new.sty']);
 assert.match(next.context.cacheName,/2026-assets-v1\.4\.0:https:\/\/packages.test\/2026$/);
 assert.deepEqual(next.warnings,[]);
});
test('unavailable or full cache warns without preventing compilation',async()=>{
 for(const failure of ['open','write']){
  const run=runtime(new Map(),failure);await run.restore();
  run.files.set('/tmp/texlive_remote/26_new.sty',bytes);
  await run.engine.saveTexPackages();
  assert.equal(run.warnings.length,1);assert.match(run.warnings[0],/cache/);
 }
});
test('disabled remote lookup does not restore files from a previous online session',async()=>{
 const run=runtime(new Map([[root+'26_cached.sty',new Response(bytes)]]));
 run.engine.ENV.TEXLIVE_REMOTE_ENDPOINT='';await run.restore();await run.engine.saveTexPackages();
 assert.equal(run.files.size,0);assert.equal(run.context.cacheName,undefined);
});
test('bundled fonts skip absent companion formats without suppressing existing or unbundled fonts',()=>{
 const run=runtime(),directory='/texlive/texmf-dist/fonts',tree=new Map([
  [directory,['.','..','tfm','opentype','vf']],
  [directory+'/tfm',['cmr10.tfm','virtual.tfm','virtual.ofm','virtual.ovf']],
  [directory+'/opentype',['lmroman10-regular.otf']],
  [directory+'/vf',['virtual.vf']]
 ]);
 let misses;
 Object.assign(run.engine.FS,{readdir:path=>tree.get(path),stat:path=>({mode:tree.has(path)?1:0}),isDir:mode=>mode===1});
 run.engine.kpse_remote_register_misses=keys=>{misses=Array.from(keys)};
 run.context.registerBundledFontMisses(run.engine);
 assert.deepEqual(misses.sort(),['20/cmr10','20/cmr10.ofm','23/cmr10','23/cmr10.ovf','33/cmr10','33/cmr10.vf','3/lmroman10-regular','3/lmroman10-regular.tfm','20/lmroman10-regular','20/lmroman10-regular.ofm','39/lmroman10-regular'].sort());
 assert.ok(!misses.some(key=>key.includes('virtual')||key.includes('unbundled')));
});
