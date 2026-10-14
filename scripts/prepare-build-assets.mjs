import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const dir=new URL('../public/luahbtex/',import.meta.url);
export const manifest=JSON.parse(await fs.readFile(new URL('asset-manifest.json',dir),'utf8'));
for(const asset of Object.values(manifest.assets))for(const part of asset.parts){
 const {file}=part,bytes=await fs.readFile(new URL(file,dir));
 if(bytes.length!==part.size||createHash('sha256').update(bytes).digest('hex')!==part.sha256)throw Error('Invalid engine asset: '+file);
}
