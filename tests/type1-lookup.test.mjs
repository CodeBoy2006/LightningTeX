import test from 'node:test';
import assert from 'node:assert/strict';
import {BrowserWorker} from './runtime-helpers.mjs';
import {BackgroundEngine} from '../engine/client.js';

test('Type 1 descriptors resolve only requested fonts and cache hits and misses', {timeout:60000}, async()=>{
 const base=new URL('../public/',import.meta.url);
 const priorWorker=globalThis.Worker;
 globalThis.Worker=BrowserWorker;
 const engine=new BackgroundEngine({base});
 try {
  const result=await engine.compile(String.raw`\documentclass{article}
\begin{document}
\directlua{
 local dl=dofile('/rtex/rtex-dl.lua')
 local find,getfont=kpse.find_file,font.getfont
 local calls={}
 kpse.find_file=function(name,format,...)
  if format=='type1 fonts' then
   assert(name=='cmr10.pfb' or name=='cmsy10.pfb' or name=='lmr10.pfb','Unrelated font lookup: '..name)
   calls[name]=(calls[name] or 0)+1
   if name=='cmr10.pfb' then return '/test/cmr10.pfb' end
   if name=='lmr10.pfb' then return '/test/lmr10.pfb' end
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
 font.getfont=function(id) return {name='ec-lmr10',type='real'} end
 for id=2000,2001 do state:usefont(id) end
 assert(calls['lmr10.pfb']==1)
 assert(state.fonts[2000].encoding_file=='lm-ec.enc')
 assert(state.fonts[2000].encoding:find('grave acute circumflex',1,true)==1)
 local mapfile=io.open('/tmp/dynamic.map','w')
 mapfile:write('dynamic-lmr10 LMRoman10-Regular " encDynamic ReEncodeFont " <dynamic.enc <lmr10.pfb',string.char(10)) mapfile:close()
 local encfile=io.open('/tmp/dynamic.enc','w')
 encfile:write('/encDynamic[',string.rep('/a ',256),'] def encDynamic 0 /b put',string.char(10)) encfile:close()
 kpse.find_file=function(name,format,...)
  if name=='pdftex.map' then return '/tmp/dynamic.map' end
  if name=='dynamic.enc' then return '/tmp/dynamic.enc' end
  if name=='lmr10.pfb' then return '/test/lmr10.pfb' end
  return find(name,format,...)
 end
 font.getfont=function(id) return {name='dynamic-lmr10',type='real'} end
 local dynamic=dofile('/rtex/rtex-dl.lua')._new_state_bin() dynamic:usefont(3000)
 assert(dynamic.fonts[3000].filename==nil,'Dynamic encoding was silently accepted')
 local color=node.new('whatsit','pdf_colorstack')
 color.command=1 color.stack=0 color.data='0 g 0 G'
 local box=node.hpack(color)
 local output=dl.paragraph(box)
 assert(output.other[1][3]==1,'Color command was lost')
 node.flush_node(box)
 kpse.find_file,font.getfont=find,getfont
}
Verified lazy font lookup.
\end{document}`);
  assert.ok(result.pdf.length>1000);
 } finally {engine.stop();globalThis.Worker=priorWorker;}
});
