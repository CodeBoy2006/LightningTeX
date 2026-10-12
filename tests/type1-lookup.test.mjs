import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {Worker as NodeWorker} from 'node:worker_threads';
import {fileURLToPath} from 'node:url';
import {BackgroundEngine} from '../core/engine-client.js';

test('Type 1 descriptors resolve only requested fonts and cache hits and misses', {timeout:60000}, async()=>{
 const base=new URL('../public/',import.meta.url),files={};
 for(const name of ['rtex-json.lua','rtex-dl.lua','rtex-dl-bin.lua','rtex-capture.lua','rtex-serve.lua','rtex-pic.lua','latex/rtex-capture.sty','latex/rtex-pic.tex','latex/rtex-serve-patches.tex'])
  files[name]=await fs.readFile(new URL('rtex/'+name,base),'utf8');
 const priorWorker=globalThis.Worker;
 globalThis.Worker=class {
  constructor(url){this.worker=new NodeWorker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url)}});this.worker.on('message',data=>this.onmessage?.({data}));this.worker.on('error',error=>this.onerror?.(error));}
  postMessage(data){this.worker.postMessage(data);}
  terminate(){void this.worker.terminate();}
 };
 const engine=new BackgroundEngine({base,files});
 try {
  const result=await engine.compile(String.raw`\documentclass{article}
\begin{document}
\directlua{
 local dl=dofile('/rtex/rtex-dl.lua')
 local find,getfont=kpse.find_file,font.getfont
 local calls={}
 kpse.find_file=function(name,format,...)
  if format=='type1 fonts' then
   assert(name=='cmr10.pfb' or name=='cmsy10.pfb','Unrelated font lookup: '..name)
   calls[name]=(calls[name] or 0)+1
   if name=='cmr10.pfb' then return '/test/cmr10.pfb' end
   return nil
  end
  return find(name,format,...)
 end
 font.getfont=function(id) return {name=id<1002 and 'cmr10' or 'cmsy10',type='real'} end
 local state=dl._new_state_bin()
 for id=1000,1003 do state:usefont(id) end
 assert(calls['cmr10.pfb']==1 and calls['cmsy10.pfb']==1,'Font lookup was repeated')
 assert(state.fonts[1000].filename=='/test/cmr10.pfb')
 assert(state.fonts[1001].format=='type1' and state.fonts[1001].psname=='CMR10')
 assert(state.fonts[1002].filename==nil and state.fonts[1003].filename==nil)
 kpse.find_file,font.getfont=find,getfont
}
Verified lazy font lookup.
\end{document}`);
  assert.ok(result.pdf.length>1000);
 } finally {engine.stop();globalThis.Worker=priorWorker;}
});
