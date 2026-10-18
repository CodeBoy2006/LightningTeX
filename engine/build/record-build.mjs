import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const [work,output]=process.argv.slice(2),root=fileURLToPath(new URL('../../',import.meta.url));
if(!work||!output)throw Error('Usage: node record-build.mjs upstream-build output-assets');
async function sha(file){const hash=createHash('sha256');for await(const bytes of createReadStream(file))hash.update(bytes);return hash.digest('hex');}
const map=await fs.readFile(path.join(work,'build/wasm/luahbtex.map'),'utf8');
if(!map.includes('luahbtex_main')||/pdftexdir\/|xetexdir\/|lib(?:pdftex|xetex|icu[^.]*)\.a|busytex_(?:bibtex|makeindex|xdvipdfmx)|fontconfig\/|libTECkit\.a|libfreetype\.a/.test(map))throw Error('Unexpected engine/dependency in link map');
const support=[];
for(const file of (await fs.readdir(path.join(root,'engine/tex'),{recursive:true})).sort()){
  const full=path.join(root,'engine/tex',file);if((await fs.stat(full)).isFile())support.push({file,sha256:await sha(full)});
}
const resources=JSON.parse(await fs.readFile(path.join(work,'data-luahbtex-final.json'),'utf8'));
const info={engine:'LuaHBTeX 1.24.0',texlive:'2026',emscripten:'5.0.4',optimization:'-Oz',lz4ChunkSize:16384,
  buildRepository:'https://github.com/TeXlyre/texlyre-busytex-build',buildCommit:execFileSync('git',['-C',work,'rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  sourceArchive:'texlive-20260301-source.tar.xz',sourceSha256:await sha(path.join(work,'texlive-20260301-source.tar.xz')),
  sdkSha256:await sha(path.join(work,'emscripten-5.0.4-linux-arm64.tar.xz')),
  inputDataSha256:'ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993',
  wasmSha256:await sha(path.join(work,'build/wasm/luahbtex.wasm')),dataSha256:await sha(path.join(work,'candidate/texlive-luahbtex.data')),
  linkMapSha256:await sha(path.join(work,'build/wasm/luahbtex.map')),
  linkedArchives:[...new Set([...map.matchAll(/([\w.+-]+\.a)\(/g)].map(match=>match[1]))].sort(),embeddedSupport:support,
  resources:{keptFiles:resources.keptFiles,keptBytes:resources.keptBytes,removedFiles:resources.removed.length,removedBytes:resources.removed.reduce((sum,file)=>sum+file.bytes,0)}};
await fs.writeFile(path.join(output,'build-info.json'),JSON.stringify(info,null,2)+'\n');
await fs.writeFile(path.join(output,'versions.txt'),`LuaHBTeX 1.24.0 / TeX Live 2026; source-built, no other engine applets.\nEmscripten 5.0.4; -Oz; LZ4 chunks 16384 bytes.\nIncremental Lua/TeX service embedded at /rtex.\nFull provenance and hashes: build-info.json\nBuild recipe: engine/build/README.md in the companion source.\nDistributed source: ../source.zip; upstream inputs and rebuild instructions: ../SOURCES.md.\nDevelopment repository: https://github.com/CodeBoy2006/LightningTeX\n`);
console.log(JSON.stringify(info.resources));
