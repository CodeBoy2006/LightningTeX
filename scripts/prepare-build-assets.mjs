import fs from 'node:fs/promises';
import path from 'node:path';
const dir='public/busytex';for(const n of await fs.readdir('dist/busytex').catch(()=>[]))if(/\.part\d+$/.test(n))await fs.copyFile(path.join('dist/busytex',n),path.join(dir,n));
