import {build} from 'vite';
import fs from 'node:fs/promises';
import {manifest} from './prepare-build-assets.mjs';

const root=new URL('../',import.meta.url),output=new URL('dist-engine/',root);
await build({configFile:false,publicDir:false,build:{target:'es2022',outDir:output.pathname,emptyOutDir:true,minify:false,
  lib:{entry:new URL('engine/index.js',root).pathname,formats:['es'],fileName:()=> 'index.js'}}});
async function copy(from,to=from){
  const target=new URL(to,output);await fs.mkdir(new URL('./',target),{recursive:true});await fs.copyFile(new URL(from,root),target);
}
for(const file of ['raw-loader.js','background-worker.js','live-worker.js','tex-packages.js'])await copy('public/runtime/'+file,'runtime/'+file);
for(const file of ['luahbtex.js','texlive-luahbtex.js','asset-manifest.json','build-info.json','LICENSE','RTEX-LICENSE','versions.txt',...Object.values(manifest.assets).flatMap(asset=>asset.parts.map(part=>part.file))])await copy('public/luahbtex/'+file,'luahbtex/'+file);
await copy('engine/README.md','README.md');
await copy('engine/build/README.md','BUILDING.md');
await copy('LICENSE');await copy('THIRD-PARTY-NOTICES.md');await copy('public/_headers','_headers');
const {version,license}=JSON.parse(await fs.readFile(new URL('package.json',root),'utf8'));
await fs.writeFile(new URL('package.json',output),JSON.stringify({name:'@lightningtex/engine',version,type:'module',license,exports:'./index.js'},null,2)+'\n');
console.log('Standalone engine: '+output.pathname);
