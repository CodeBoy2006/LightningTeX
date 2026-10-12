import fs from 'node:fs/promises';
import path from 'node:path';
const dir='public/busytex',manifest=JSON.parse(await fs.readFile(path.join(dir,'asset-manifest.json'),'utf8'));
for(const asset of Object.values(manifest.assets))for(const {file} of asset.parts){
 try{await fs.access(path.join(dir,file))}catch{await fs.copyFile(path.join('dist/busytex',file),path.join(dir,file))}
}
