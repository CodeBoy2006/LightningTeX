import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createGzip } from 'node:zlib';
import { createHash } from 'node:crypto';
const dir=path.resolve(process.argv[2]||new URL('../public/busytex/',import.meta.url).pathname);
const max=16*1024*1024,manifest={version:1,assets:{}};
for(const name of ['busytex.wasm','texlive-basic.data']){
 const input=path.join(dir,name),decodedSize=(await fsp.stat(input)).size;
 const gzip=fs.createReadStream(input).pipe(createGzip({level:9}));
 const parts=[];let current=Buffer.allocUnsafe(max),used=0,total=0;
 async function flush(){const bytes=current.subarray(0,used),file=`${name}.gz.part${String(parts.length).padStart(3,'0')}`;await fsp.writeFile(path.join(dir,file),bytes);parts.push({file,size:used,sha256:createHash('sha256').update(bytes).digest('hex')});total+=used;used=0;}
 for await(const chunk of gzip){let offset=0;while(offset<chunk.length){const n=Math.min(max-used,chunk.length-offset);chunk.copy(current,used,offset,offset+n);used+=n;offset+=n;if(used===max)await flush()}}
 if(used)await flush();
 manifest.assets[name]={encoding:'gzip',decodedSize,encodedSize:total,parts};console.log(`${name}: ${decodedSize} -> ${total} bytes (${parts.length} parts)`);
}
// The vendor loader predates Emscripten's getPreloadedPackage hook. Add it
// reproducibly, without modifying the package metadata or LZ4 decoding.
const script=path.join(dir,'texlive-basic.js');let code=await fsp.readFile(script,'utf8');
const marker="      Module['addRunDependency']('datafile_build/wasm/texlive-basic.data');";
if(!code.includes('RTEX_PRELOADED_PACKAGE')){
 if(code.split(marker).length!==2)throw Error('Vendor loader changed: expected unique preload insertion point');
 code=code.replace(marker,marker+`\n      // RTEX_PRELOADED_PACKAGE: consume reassembled static-host assets.\n      if (Module['getPreloadedPackage']) {\n        var preloaded = Module['getPreloadedPackage'](REMOTE_PACKAGE_NAME, REMOTE_PACKAGE_SIZE);\n        if (preloaded) { await processPackageData(preloaded); return; }\n      }`);
 await fsp.writeFile(script,code);
}
await fsp.writeFile(path.join(dir,'asset-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log('Original .wasm and .data retained until verification and approval to remove them.');
