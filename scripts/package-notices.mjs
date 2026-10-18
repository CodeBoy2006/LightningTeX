import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {zip} from '../core/zip.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const notices=['LICENSE','THIRD-PARTY-NOTICES.md','SOURCES.md','licenses'];

/** Ship notices and the actual build inputs, without depending on Git or a published commit. */
export async function packageNotices(output){
  await fs.mkdir(output,{recursive:true});
  for(const name of notices)await fs.cp(path.join(root,name),path.join(output,name),{recursive:true});
  const files=['LICENSE','THIRD-PARTY-NOTICES.md','SOURCES.md','package.json','package-lock.json','vite.config.js','vercel.json','.vercelignore','main.js','server.mjs','README.md','README.zh-CN.md','QA.md'];
  for(const directory of ['core','engine','render','ui','scripts','tests','licenses','public','docs']){
    for(const entry of await fs.readdir(path.join(root,directory),{recursive:true,withFileTypes:true})){
      if(!entry.isFile())continue;
      const name=path.relative(root,path.join(entry.parentPath,entry.name)).split(path.sep).join('/');
      // Omit generated engine chunks and demo media.
      if(entry.name==='.DS_Store'||/\.gz\.part\d+$/.test(name)||name.startsWith('docs/media/'))continue;
      files.push(name);
    }
  }
  const entries=[];
  for(const name of files.sort())entries.push({path:name,data:await fs.readFile(path.join(root,name))});
  await fs.writeFile(path.join(output,'source.zip'),zip(entries));
}
