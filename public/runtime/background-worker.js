/* Browser-only TeX job worker; native shell execution disabled. */
importScripts('./raw-loader.js','./bibtex.js');
let engine,snapshot,lastPreamble,lastRoot,lastAuxFiles,lastBbl;const decoder=new TextDecoder(),latin1=new TextDecoder('latin1'),styles=new Map();
function removeTree(fs,path){if(!fs.analyzePath(path).exists)return;for(const name of fs.readdir(path)){if(name==='.'||name==='..')continue;const p=path+'/'+name;fs.isDir(fs.stat(p).mode)?removeTree(fs,p):fs.unlink(p)}if(path!=='/project'&&path!=='/out')fs.rmdir(path)}
async function init(data){
 engine=await loadRtexEngine({base:data.base,module:data.module,endpoint:data.endpoint,env:{TEXINPUTS:'/rtex/latex//:',LUAINPUTS:'/rtex//:',RTEX_CAPTURE_DIR:'/out',RTEX_UNIT_ENVS:'equation,equation*,align,align*,gather,gather*,multline,multline*,displaymath,theorem,lemma,proposition,corollary,remark',openout_any:'a',max_print_line:'100000',shell_escape:'f'},print:t=>postMessage({type:'log',text:t}),printErr:t=>postMessage({type:'log',text:t})});
 const fs=engine.FS;fs.mkdirTree('/out');
 const cut=2**26;const tail=engine.HEAPU8.subarray(cut);snapshot=engine.HEAPU8.slice(0,tail.some(x=>x)?engine.HEAPU8.length:cut);
 postMessage({type:'ready',module:engine.compiledModule});
}
function listFiles(fs,path,prefix=''){const out=[];for(const name of fs.readdir(path)){if(name==='.'||name==='..')continue;const p=path+'/'+name;if(fs.isDir(fs.stat(p).mode))out.push(...listFiles(fs,p,prefix+name+'/'));else out.push(prefix+name)}return out}
const isAux=name=>/\.(?:aux|toc|out|lof|lot)$/.test(name);
function sameAux(before,after){return before?.size===after.size&&[...after].every(([name,bytes])=>{const old=before.get(name);return old?.length===bytes.length&&bytes.every((byte,i)=>byte===old[i])})}
function mirrorDirs(fs,from,to){for(const name of fs.readdir(from)){if(name==='.'||name==='..')continue;const p=from+'/'+name;if(fs.isDir(fs.stat(p).mode)){fs.mkdirTree(to+'/'+name);mirrorDirs(fs,p,to+'/'+name)}}}
function syncProject(fs,project){
 if(!project||project.reset)removeTree(fs,'/project');
 for(const path of project?.remove||[])if(fs.analyzePath('/project/'+path).exists)fs.unlink('/project/'+path);
 for(const {path,data} of project?.write||[])writeEngineFile(fs,'/project/'+path,data);
}
const readText=(fs,path,text=decoder)=>fs.analyzePath(path).exists&&!fs.isDir(fs.stat(path).mode)?text.decode(fs.readFile(path)):null;
// A .bst style: the project's own, else TeX Live's through the same remote lookup (and cache) TeX uses (kpathsea format 7).
function bibStyle(fs,name){
 const own=readText(fs,'/project/'+name+'.bst',latin1);if(own!=null)return own;
 if(styles.has(name))return styles.get(name);
 const file=name+'.bst',cached=readText(fs,'/tmp/texlive_remote/7_'+file.replace(/[^a-zA-Z0-9._-]/g,'_'),latin1);
 let text=cached;
 const endpoint=engine.ENV?.TEXLIVE_REMOTE_ENDPOINT;
 if(text==null&&endpoint&&typeof XMLHttpRequest!=='undefined'&&/^[A-Za-z0-9._-]+$/.test(name)){
  try{const xhr=new XMLHttpRequest();xhr.open('GET',endpoint.replace(/\/?$/,'/')+'7/'+encodeURIComponent(file),false);xhr.responseType='arraybuffer';xhr.send();
   if(xhr.status===200&&xhr.response?.byteLength){const bytes=new Uint8Array(xhr.response);engine.kpse_remote_register?.(file,7,bytes);text=latin1.decode(bytes);}}catch{/* offline: no style */}
 }
 if(text!=null)styles.set(name,text);
 return text;
}
// BibTeX between passes: the citations in aux, the project's .bib files and the style give main.bbl.
function bibliography(fs,aux){
 const text=decoder.decode(aux);if(!/\\bibdata\{/.test(text))return null;
 return runBibtex({aux:text,readAux:name=>readText(fs,'/out/'+name),
  readBib:name=>{for(const file of [name+'.bib',name])for(const dir of ['/project/','/out/']){const found=readText(fs,dir+file);if(found!=null)return {text:found,file:dir==='/project/'?file:null};}return null;},
  readStyle:name=>bibStyle(fs,name)});
}
function run(source,id,preamble,root='main.tex',project){
 const began=performance.now(),fs=engine.FS;syncProject(fs,project);removeTree(fs,'/out');fs.chdir('/project');writeEngineFile(fs,'/project/'+root,source);
 // \include writes its aux beside the output of the same relative path.
 mirrorDirs(fs,'/project','/out');
 const input=String.raw`\input{`+root+'}';
 // Reuse only successful output from the same root/preamble; failed edits cannot poison it.
 if(project?.reset||project?.remove?.length||root!==lastRoot){lastAuxFiles=undefined;lastBbl=undefined;}
 let priorFiles=preamble!=null&&preamble===lastPreamble?lastAuxFiles:undefined,bbl=preamble!=null&&preamble===lastPreamble?lastBbl:undefined;
 for(const [name,bytes] of priorFiles||[])writeEngineFile(fs,'/out/'+name,bytes);
 if(bbl!==undefined)fs.writeFile('/out/main.bbl',bbl);
 // A bibliography needs a third pass the first time: citations, then the .bbl, then its labels.
 const logs=[];let exit=0,passes=0,aux,auxFiles,bib=null,limit=2;
 for(let pass=0;pass<limit;pass++){
  fs.chdir('/project');
  // The cold first pass must rerun; only its page traversal and JSON would be discarded.
  const prepare=pass===0&&priorFiles===undefined
   ?String.raw`\RemoveFromHook{enddocument/afterlastpage}[rtex-capture]`+String.raw`\AddToHookNext{begindocument/end}{\directlua{luatexbase.remove_from_callback("pre_shipout_filter","rtex-capture")}}`:'';
  const job=String.raw`\RequirePackage{rtex-capture}`+prepare+input;
  const args=[...rtexLuaArgs(job).slice(0,-1),'--jobname=main','--output-directory=/out',job];
  try{exit=engine.callMain(args);engine._flush_streams()}catch(e){exit=typeof e.status==='number'?e.status:1;logs.push(String(e))}
  if(fs.analyzePath('/out/main.log').exists)logs.push(decoder.decode(fs.readFile('/out/main.log')));
  // Match the upstream BusyTeX full-job memory reset. Never used by live worker.
  engine.HEAPU8.fill(0);engine.HEAPU8.set(snapshot);
  passes++;
  if(exit)break;
  aux=fs.analyzePath('/out/main.aux').exists?fs.readFile('/out/main.aux'):new Uint8Array();
  let bibChanged=false;
  try{bib=bibliography(fs,aux)??bib;}catch(error){bib={bbl:null,log:'BibTeX failed: '+error.message,warnings:[],errors:[String(error.message)]};}
  if(bib?.bbl!=null&&bib.bbl!==bbl){fs.writeFile('/out/main.bbl',bib.bbl);bbl=bib.bbl;bibChanged=true;limit=3;}
  const files=listFiles(fs,'/out');auxFiles=new Map(files.filter(isAux).map(name=>[name,fs.readFile('/out/'+name)]));
  // shortcut: unknown package outputs still require two passes; extend only with verified reuse rules.
  const otherAux=files.some(name=>!isAux(name)&&!/^main(?:\.(?:log|pdf|bbl|blg|run\.xml|rtex(?:-page\d+)?\.json)|-blx\.bib)$/.test(name));
  // Aux comparison also catches removed labels, which need not emit a rerun warning.
  if(!bibChanged&&sameAux(priorFiles,auxFiles)&&!otherAux&&!/Rerun to get|Label\(s\) may have changed/i.test(logs.at(-1)||''))break;
  priorFiles=auxFiles;
 }
 // A document without content ends normally but ships no page.
 if(exit||!fs.analyzePath('/out/main.pdf').exists)throw Object.assign(Error(exit?logs.join('\n').slice(-12000)||'TeX produced no PDF':'No pages of output'),{log:logs.at(-1),empty:!exit});
 const capture=JSON.parse(decoder.decode(fs.readFile('/out/main.rtex.json'))),pages=[],fonts={};
 for(let p=1;p<=capture.pages;p++){
  const page=JSON.parse(decoder.decode(fs.readFile(`/out/main.rtex-page${p}.json`)));pages.push(page);
  for(const font of Object.values(page.fonts||{}))if(font.filename&&!fonts[font.filename]&&fs.analyzePath(font.filename).exists)fonts[font.filename]=fs.readFile(font.filename);
 }
 const pdf=fs.readFile('/out/main.pdf');
 const packageMisses=JSON.parse(decoder.decode(fs.readFile('/tmp/texlive_remote/.misses.json')));
 const bibtex=bib&&{log:bib.log,warnings:bib.warnings,errors:bib.errors,style:bib.style};
 lastPreamble=preamble;lastRoot=root;lastAuxFiles=auxFiles;lastBbl=bbl;
 return {type:'result',id,pdf,capture,pages,fonts,aux,passes,packageMisses,bibtex,log:logs.at(-1)||'',durationMs:performance.now()-began};
}
let jobs=Promise.resolve();
onmessage=({data})=>{jobs=jobs.then(async()=>{try{if(data.type==='init')await init(data);else if(data.type==='compile'){
 if(!engine)throw Error('Engine is not ready');
 let result;
 try{result=run(data.source,data.id,data.preamble,data.root,data.project)}
 finally{await engine.saveTexPackages()}
 // Finish caching before the host starts the live worker with the same packages.
 // FS.readFile returns owned copies; transfer large outputs, retaining aux for the next pass.
 postMessage(result,[result.pdf.buffer,...new Set(Object.values(result.fonts).map(bytes=>bytes.buffer))]);
}}catch(e){postMessage({type:'error',id:data.id,message:String(e),log:e.log,empty:e.empty,stack:e.stack})}})};
