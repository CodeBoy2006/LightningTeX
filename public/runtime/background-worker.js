/* Browser-only TeX job worker; native shell execution and remote package fetching disabled. */
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
function run(source,id,preamble){
 const began=performance.now(),fs=engine.FS;removeTree(fs,'/project');removeTree(fs,'/out');fs.chdir('/project');fs.writeFile('main.tex',source);
 // Reuse only the last successful job's aux; a failed edit must not poison references.
 let priorAux=preamble!=null&&preamble===lastPreamble?lastAux:undefined;
 if(priorAux!==undefined)fs.writeFile('/out/main.aux',priorAux);
 const logs=[];let exit=0,passes=0,aux;
 for(let pass=0;pass<2;pass++){
  fs.chdir('/project');
  const args=[...rtexLuaArgs(String.raw`\RequirePackage{rtex-capture}\input{main.tex}`).slice(0,-1),'--no-shell-escape','--jobname=main','--output-directory=/out',String.raw`\RequirePackage{rtex-capture}\input{main.tex}`];
  try{exit=engine.callMain(args);engine._flush_streams()}catch(e){exit=typeof e.status==='number'?e.status:1;logs.push(String(e))}
  if(fs.analyzePath('/out/main.log').exists)logs.push(decoder.decode(fs.readFile('/out/main.log')));
  // Match the upstream BusyTeX full-job memory reset. Never used by live worker.
  engine.HEAPU8.fill(0);engine.HEAPU8.set(snapshot);
  passes++;
  if(exit)break;
  aux=fs.analyzePath('/out/main.aux').exists?fs.readFile('/out/main.aux'):new Uint8Array();
  const unchanged=priorAux!==undefined&&decoder.decode(aux)===decoder.decode(priorAux);
  // TOCs, outlines and other package files are rebuilt from scratch and still need two passes.
  const otherAux=fs.readdir('/out').some(name=>name!=='.'&&name!=='..'&&!/^main\.(?:aux|log|pdf|rtex(?:-page\d+)?\.json)$/.test(name));
  // Aux comparison also catches removed labels, which need not emit a rerun warning.
  if(unchanged&&!otherAux&&!/Rerun to get|Label\(s\) may have changed/i.test(logs.at(-1)||''))break;
  priorAux=aux;
 }
 if(exit||!fs.analyzePath('/out/main.pdf').exists)throw Error(logs.join('\n').slice(-12000)||'TeX produced no PDF');
 const capture=JSON.parse(decoder.decode(fs.readFile('/out/main.rtex.json'))),pages=[],fonts={};
 for(let p=1;p<=capture.pages;p++){
  const page=JSON.parse(decoder.decode(fs.readFile(`/out/main.rtex-page${p}.json`)));pages.push(page);
  for(const font of Object.values(page.fonts||{}))if(font.filename&&!fonts[font.filename]&&fs.analyzePath(font.filename).exists)fonts[font.filename]=fs.readFile(font.filename);
 }
 const pdf=fs.readFile('/out/main.pdf');lastPreamble=preamble;lastAux=aux;
 postMessage({type:'result',id,pdf,capture,pages,fonts,aux,passes,log:logs.at(-1)||'',durationMs:performance.now()-began});
}
onmessage=async({data})=>{try{if(data.type==='init')await init(data);else if(data.type==='compile'){if(!engine)throw Error('Engine is not ready');run(data.source,data.id,data.preamble)}}catch(e){postMessage({type:'error',id:data.id,message:String(e),stack:e.stack})}};
