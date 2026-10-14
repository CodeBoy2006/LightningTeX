import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export function exclusion(file){
  if(file==='texlive/icudt78l.dat'||file==='texlive/fonts.conf'||file.startsWith('etc/fonts/')||file.includes('/fonts/conf/'))return 'XeTeX ICU/fontconfig';
  if(/\/texmf-var\/web2c\/(?!luahbtex\/)/.test(file))return 'other engine formats/cache';
  if(/\/tex\/(?:xetex|xelatex|pdftex|plain)\//.test(file))return 'other engine macros';
  if(/^texlive\/texmf-dist\/(?:bibtex|dvipdfmx|dvips|makeindex|metafont|mft|psutils|texconfig|ttf2pk|xdvi)\//.test(file))return 'unused tool resources';
  if(file.includes('/fonts/misc/xetex/'))return 'XeTeX font mappings';
  if(file.includes('/fonts/source/'))return 'Metafont sources';
  if(file.includes('/fonts/afm/'))return 'optional AFM metrics (remote on demand)';
  if(/\.(?:log|fls)$/.test(file))return 'build logs';
  return null;
}

if(process.argv[1]===fileURLToPath(import.meta.url)){
  const [input,output]=process.argv.slice(2);
  if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Usage: node prune-data.mjs extracted-data fresh-output');
  await fs.mkdir(output,{recursive:false});
  const report={keptFiles:0,keptBytes:0,removed:[]},indexes=[];
  for(const file of await fs.readdir(input,{recursive:true})){
    const full=path.join(input,file),stat=await fs.stat(full);if(!stat.isFile())continue;
    const reason=exclusion(file);
    if(reason){report.removed.push({file,bytes:stat.size,reason});continue;}
    await fs.mkdir(path.dirname(path.join(output,file)),{recursive:true});await fs.copyFile(full,path.join(output,file));
    if(path.basename(file)==='ls-R')indexes.push(file);
    report.keptFiles++;report.keptBytes+=stat.size;
  }
  // Kpathsea must not resolve deleted entries from the old filename databases.
  for(const file of indexes){
    const target=path.join(output,file),root=path.dirname(target),lines=['% ls-R -- filename database for kpathsea; do not change this line.'];
    async function visit(relative){
      const entries=(await fs.readdir(path.join(root,relative),{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0);
      lines.push((relative?'./'+relative:'./')+':',...entries.map(entry=>entry.name),'');
      for(const entry of entries)if(entry.isDirectory())await visit(path.posix.join(relative,entry.name));
    }
    await visit('');const bytes=Buffer.from(lines.join('\n'));
    report.keptBytes+=bytes.length-(await fs.stat(target)).size;await fs.writeFile(target,bytes);
  }
  await fs.writeFile(output+'.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({keptFiles:report.keptFiles,keptBytes:report.keptBytes,removedFiles:report.removed.length,removedBytes:report.removed.reduce((n,f)=>n+f.bytes,0)}));
}
