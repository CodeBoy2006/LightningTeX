// Build-only reader for the pinned assets-v1.4.0 snapshot; no TeX job is executed.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {createHash}=require('node:crypto');
const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Usage: node extract-data.cjs release-busytex fresh-output');
const root=path.resolve(input),target=path.resolve(output);
const data=fs.readFileSync(path.join(root,'texlive-basic.data'));
if(createHash('sha256').update(data).digest('hex')!=='ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993')throw Error('Unexpected resource snapshot');
// Use the pinned loader's JSON tables and its own LZ4 codec, without browser cache setup.
const loader=fs.readFileSync(path.join(root,'texlive-basic.js'),'utf8');
const metadata=loader.match(/loadPackage\((\{[^\n]+\})\);/),compressed=loader.match(/var compressedData = (\{[^\n]+\})/);
if(!metadata||!compressed)throw Error('Unexpected resource loader');
global.require=require;global.__dirname=root;
const runtime=path.join(root,'busytex.js');vm.runInThisContext(fs.readFileSync(runtime,'utf8'),{filename:runtime});
(async()=>{
 const engine=await busytex({noInitialRun:true,locateFile:file=>path.join(root,file),print:()=>{},printErr:()=>{}});
 engine.LZ4.loadPackage({metadata:JSON.parse(metadata[1]),compressedData:{...JSON.parse(compressed[1]),data}},false);
 fs.mkdirSync(target);
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
