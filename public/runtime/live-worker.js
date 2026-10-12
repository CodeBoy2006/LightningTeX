importScripts('./raw-loader.js');
// Shared mailbox: control[0]=available bytes, control[1]=EOF, payload starts at 16.
// Host writes only when available=0; worker notifies after fully consuming.
onmessage=async ({data})=>{try{
 const m=await loadRtexEngine({base:data.base||'./busytex/',env:{TEXINPUTS:'/rtex/latex//:',LUAINPUTS:'/rtex//:',openout_any:'a',max_print_line:'100000',RTEX_REQ:'/dev/rtex-req',RTEX_RESP:'/dev/rtex-resp'},print:text=>postMessage({log:text}),printErr:text=>postMessage({log:text})});
 const fs=m.FS;fs.mkdirTree('/rtex/latex');fs.mkdirTree('/live');
 m.kpse_remote_register_misses(data.packageMisses||[]);
 if(data.aux)fs.writeFile('/live/serve.aux',data.aux);
 fs.chdir('/live');
 for(const [name,contents] of Object.entries(data.files||{})){const path='/rtex/'+name;fs.mkdirTree(path.slice(0,path.lastIndexOf('/')));fs.writeFile(path,contents)}
 for(const file of data.project||[]){const path='/live/'+file.path;fs.mkdirTree(path.slice(0,path.lastIndexOf('/')));fs.writeFile(path,file.data)}
 Object.assign(m.ENV,{TEXINPUTS:'/rtex/latex//:',LUAINPUTS:'/rtex//:',openout_any:'a',max_print_line:'100000',RTEX_REQ:'/dev/rtex-req',RTEX_RESP:'/dev/rtex-resp'});
 const ctl=new Int32Array(data.mailbox,0,4),bytes=new Uint8Array(data.mailbox,16);let offset=0;
 let responseBuffer=new Uint8Array(0);
 function emitResponse(chunk){
   const joined=new Uint8Array(responseBuffer.length+chunk.length);joined.set(responseBuffer);joined.set(chunk,responseBuffer.length);responseBuffer=joined;
   while(responseBuffer.length>=4){const view=new DataView(responseBuffer.buffer,responseBuffer.byteOffset,responseBuffer.byteLength);const length=view.getUint32(0,true);if(length>64*1024*1024)throw Error('Response too large');if(responseBuffer.length<length+4)return;
     const frame=responseBuffer.slice(0,length+4);responseBuffer=responseBuffer.slice(length+4);const fonts={};
     if(frame[4]===1){const v=new DataView(frame.buffer);const jsonLength=v.getUint32(5,true);let i=9+jsonLength;const dlEnd=frame.length;
       if(i+16<=dlEnd&&new TextDecoder().decode(frame.subarray(i,i+4))==='RTDL'){i+=16;while(i+5<=dlEnd){const tag=frame[i],size=v.getUint32(i+1,true),p=i+5;if(p+size>dlEnd)throw Error('Truncated display-list record');if(tag===2&&size>=30){const n=v.getUint16(p+28,true);if(30+n>size)throw Error('Truncated font name');const filename=new TextDecoder().decode(frame.subarray(p+30,p+30+n));if(filename){try{fonts[filename]=fs.readFile(filename)}catch(e){postMessage({fontError:filename,message:String(e)})}}}i=p+size;}}
     }
     postMessage({bytes:frame,fonts});
   }
 }
 const req=fs.makedev(64,0),resp=fs.makedev(64,1);
 fs.registerDevice(req,{open:s=>{s.seekable=false},read(s,b,o,n){while(!Atomics.load(ctl,0)){if(Atomics.load(ctl,1))return 0;Atomics.wait(ctl,0,0)}let take=Math.min(n,Atomics.load(ctl,0)-offset);b.set(bytes.subarray(offset,offset+take),o);offset+=take;if(offset===Atomics.load(ctl,0)){offset=0;Atomics.store(ctl,0,0);Atomics.notify(ctl,0)}return take}});
 fs.registerDevice(resp,{open:s=>{s.seekable=false},write(s,b,o,n){emitResponse(b.slice(o,o+n));return n}});
 fs.mkdev('/dev/rtex-req',0o666,req);fs.mkdev('/dev/rtex-resp',0o666,resp);
 fs.writeFile('/live/rtex-preamble.tex',data.preamble||String.raw`\documentclass{article}\usepackage{luatexbase}`);
 fs.writeFile('/live/serve.tex',String.raw`\input{/live/rtex-preamble.tex}
\newbox\rtexbox\newcount\rtexcontinue\rtexcontinue=1
\edef\rtexcountnum{\number\allocationnumber}\newcatcodetable\rtexcct{\makeatletter\savecatcodetable\rtexcct}
\begin{document}\input{rtex-serve-patches}
\directlua{rtex_serve = dofile(kpse.find_file("rtex-serve.lua", "lua") or "rtex-serve.lua") rtex_serve.init(\number\rtexbox, \rtexcountnum, \number\rtexcct)}
\loop\rtexstep\ifnum\rtexcontinue>0 \repeat\end{document}`);
 const exit=m.callMain(rtexLuaArgs('/live/serve.tex').filter(a=>a!=='--halt-on-error'));m._flush_streams();postMessage({done:true,exit});
}catch(e){postMessage({error:String(e),stack:e.stack})}};
