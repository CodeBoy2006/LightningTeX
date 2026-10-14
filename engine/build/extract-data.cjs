// Build-only reader for the pinned assets-v1.4.0 snapshot; no TeX job is executed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {pathToFileURL,fileURLToPath}=require('node:url');
const {gunzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node extract-data.cjs old-public fresh-output');
const root=path.resolve(input),target=path.resolve(output),runtime=path.join(root,'runtime');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'busytex/asset-manifest.json')));
const packed=Buffer.concat(manifest.assets['texlive-basic.data'].parts.map(part=>fs.readFileSync(path.join(root,'busytex',part.file))));
if(createHash('sha256').update(gunzipSync(packed)).digest('hex')!=='ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993')throw Error('Unexpected resource snapshot');
fs.mkdirSync(target);
global.require=require;global.__dirname=runtime;global.self=global;
global.location={href:pathToFileURL(path.join(runtime,'raw-loader.js')).href};
global.importScripts=(...urls)=>{for(const url of urls){const file=url.startsWith('file:')?fileURLToPath(url):path.resolve(runtime,url);vm.runInThisContext(fs.readFileSync(file,'utf8'),{filename:file});}};
importScripts('./raw-loader.js');
(async()=>{
 const engine=await loadRtexEngine({base:pathToFileURL(path.join(root,'busytex')+'/').href,endpoint:'',print:()=>{},printErr:()=>{}});
 let files=0,bytes=0;
 function copy(directory){
  fs.mkdirSync(path.join(target,directory),{recursive:true});
  for(const name of engine.FS.readdir(directory)){
   if(name==='.'||name==='..')continue;
   const file=directory+'/'+name;
   if(engine.FS.isDir(engine.FS.stat(file).mode))copy(file);
   else{const data=engine.FS.readFile(file);fs.writeFileSync(path.join(target,file),data);files++;bytes+=data.length;}
  }
 }
 copy('/texlive');copy('/etc');
 if(files!==7184||bytes!==156869916)throw Error('Unexpected extracted resource inventory');
 console.log(JSON.stringify({files,bytes}));
})().catch(error=>{console.error(error);process.exitCode=1;});
