/* Browser-only TeX job worker; native shell execution disabled. */
importScripts('./raw-loader.js');
let engine,snapshot,files,lastPreamble,lastAux;const decoder=new TextDecoder();
function removeTree(fs,path){if(!fs.analyzePath(path).exists)return;for(const name of fs.readdir(path)){if(name==='.'||name==='..')continue;const p=path+'/'+name;fs.isDir(fs.stat(p).mode)?removeTree(fs,p):fs.unlink(p)}if(path!=='/project'&&path!=='/out')fs.rmdir(path)}
async function init(data){
 files=data.files;
 engine=await loadRtexEngine({base:data.base||'../busytex/',env:{TEXINPUTS:'/rtex/latex//:',LUAINPUTS:'/rtex//:',RTEX_CAPTURE_DIR:'/out',RTEX_UNIT_ENVS:'equation,equation*,align,align*,gather,gather*,multline,multline*,displaymath',openout_any:'a',max_print_line:'100000',shell_escape:'f'},print:t=>postMessage({type:'log',text:t}),printErr:t=>postMessage({type:'log',text:t})});
 const fs=engine.FS;fs.mkdirTree('/rtex/latex');fs.mkdirTree('/out');
 for(const [name,contents] of Object.entries(files)){const p='/rtex/'+name;fs.mkdirTree(p.slice(0,p.lastIndexOf('/')));fs.writeFile(p,contents)}
 const cut=2**26;const tail=engine.HEAPU8.subarray(cut);snapshot=engine.HEAPU8.slice(0,tail.some(x=>x)?engine.HEAPU8.length:cut);
 postMessage({type:'ready'});
}
function listFiles(fs,path,prefix=''){const out=[];for(const name of fs.readdir(path)){if(name==='.'||name==='..')continue;const p=path+'/'+name;if(fs.isDir(fs.stat(p).mode))out.push(...listFiles(fs,p,prefix+name+'/'));else out.push(prefix+name)}return out}
function mirrorDirs(fs,from,to){for(const name of fs.readdir(from)){if(name==='.'||name==='..')continue;const p=from+'/'+name;if(fs.isDir(fs.stat(p).mode)){fs.mkdirTree(to+'/'+name);mirrorDirs(fs,p,to+'/'+name)}}}
function syncProject(fs,project){
 if(!project||project.reset)removeTree(fs,'/project');
 for(const path of project?.remove||[])if(fs.analyzePath('/project/'+path).exists)fs.unlink('/project/'+path);
 for(const {path,data} of project?.write||[]){const p='/project/'+path;fs.mkdirTree(p.slice(0,p.lastIndexOf('/')));fs.writeFile(p,data)}
}
function run(source,id,preamble,root='main.tex',project){
 const began=performance.now(),fs=engine.FS;syncProject(fs,project);removeTree(fs,'/out');fs.chdir('/project');fs.writeFile(root,source);
 // \include writes its aux beside the output of the same relative path.
 mirrorDirs(fs,'/project','/out');
 const job=String.raw`\RequirePackage{rtex-capture}\input{`+root+'}';
 // Reuse only the last successful job's aux; a failed edit must not poison references.
 let priorAux=preamble!=null&&preamble===lastPreamble?lastAux:undefined;
 if(priorAux!==undefined)fs.writeFile('/out/main.aux',priorAux);
 const logs=[];let exit=0,passes=0,aux;
 for(let pass=0;pass<2;pass++){
  fs.chdir('/project');
  const args=[...rtexLuaArgs(job).slice(0,-1),'--no-shell-escape','--jobname=main','--output-directory=/out',job];
  try{exit=engine.callMain(args);engine._flush_streams()}catch(e){exit=typeof e.status==='number'?e.status:1;logs.push(String(e))}
  if(fs.analyzePath('/out/main.log').exists)logs.push(decoder.decode(fs.readFile('/out/main.log')));
  // Match the upstream BusyTeX full-job memory reset. Never used by live worker.
  engine.HEAPU8.fill(0);engine.HEAPU8.set(snapshot);
  passes++;
  if(exit)break;
  aux=fs.analyzePath('/out/main.aux').exists?fs.readFile('/out/main.aux'):new Uint8Array();
  const unchanged=priorAux!==undefined&&decoder.decode(aux)===decoder.decode(priorAux);
  // TOCs, outlines and other package files are rebuilt from scratch and still need two passes.
  const otherAux=listFiles(fs,'/out').some(name=>!/^main\.(?:aux|log|pdf|rtex(?:-page\d+)?\.json)$/.test(name));
  // Aux comparison also catches removed labels, which need not emit a rerun warning.
  if(unchanged&&!otherAux&&!/Rerun to get|Label\(s\) may have changed/i.test(logs.at(-1)||''))break;
  priorAux=aux;
 }
 // A document without content ends normally but ships no page.
 if(exit||!fs.analyzePath('/out/main.pdf').exists)throw Object.assign(Error(exit?logs.join('\n').slice(-12000)||'TeX produced no PDF':'No pages of output'),{log:logs.at(-1),empty:!exit});
 const capture=JSON.parse(decoder.decode(fs.readFile('/out/main.rtex.json'))),pages=[],fonts={};
 for(let p=1;p<=capture.pages;p++){
  const page=JSON.parse(decoder.decode(fs.readFile(`/out/main.rtex-page${p}.json`)));pages.push(page);
  for(const font of Object.values(page.fonts||{}))if(font.filename&&!fonts[font.filename]&&fs.analyzePath(font.filename).exists)fonts[font.filename]=fs.readFile(font.filename);
 }
 const pdf=fs.readFile('/out/main.pdf');lastPreamble=preamble;lastAux=aux;
 return {type:'result',id,pdf,capture,pages,fonts,aux,passes,log:logs.at(-1)||'',durationMs:performance.now()-began};
}
onmessage=async({data})=>{try{if(data.type==='init')await init(data);else if(data.type==='compile'){
 if(!engine)throw Error('Engine is not ready');
 let result;
 try{result=run(data.source,data.id,data.preamble,data.root,data.project)}
 finally{await engine.saveTexPackages()}
 // Finish caching before the host starts the live worker with the same packages.
 postMessage(result);
}}catch(e){postMessage({type:'error',id:data.id,message:String(e),log:e.log,empty:e.empty,stack:e.stack})}};
