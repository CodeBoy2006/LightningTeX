/* Raw persistent BusyTeX runtime. Classic Worker script, no pipeline resets. */
importScripts('./tex-packages.js');
self.loadRtexEngine = async function ({base = '../busytex/', module, endpoint, print = console.log, printErr = console.error, env = {}} = {}) {
  base = new URL(base, self.location.href).href;
  const started=performance.now();
  async function read(url) {
    if(url.startsWith('file:')){
      const b=await require('node:fs/promises').readFile(new URL(url));return new Uint8Array(b.buffer,b.byteOffset,b.byteLength);
    }
    const r=await fetch(url);
    if(!r.ok)throw Error('Asset fetch failed '+r.status+' '+url);
    return new Uint8Array(await r.arrayBuffer());
  }
  const manifest=JSON.parse(new TextDecoder().decode(await read(base+'asset-manifest.json')));
  if(manifest.version!==1||!manifest.assets)throw Error('Invalid asset manifest');
  async function unpack(name){
    const entry=manifest.assets[name];
    if(!entry||entry.encoding!=='gzip'||!Number.isSafeInteger(entry.decodedSize)||entry.decodedSize<=0||entry.decodedSize>256*1024*1024||!Array.isArray(entry.parts)||!entry.parts.length)throw Error('Invalid asset manifest: '+name);
    const output=new Uint8Array(entry.decodedSize);let index=0,offset=0;
    const compressed=new ReadableStream({async pull(controller){
      if(index===entry.parts.length){controller.close();return;}
      const part=entry.parts[index++];if(!/^[a-zA-Z0-9._-]+$/.test(part.file))throw Error('Invalid asset part name');
      print('Loading '+name+' part '+index+'/'+entry.parts.length);
      const bytes=await read(base+part.file);if(bytes.length!==part.size)throw Error('Truncated asset part '+part.file);
      print('Loaded '+name+' part '+index+'/'+entry.parts.length);
      controller.enqueue(bytes);
    }});
    const reader=compressed.pipeThrough(new DecompressionStream('gzip')).getReader();
    try {while(true){const {done,value}=await reader.read();if(done)break;if(offset+value.length>output.length)throw Error('Oversized asset '+name);output.set(value,offset);offset+=value.length;}}
    catch(e){await reader.cancel(e).catch(()=>{});throw e;}
    finally{reader.releaseLock();}
    if(offset!==output.length)throw Error('Truncated decoded asset '+name);
    return output.buffer;
  }
  // Sequential assembly bounds peak memory to decoded assets plus one 16MiB part.
  if(!module)module=await WebAssembly.compile(await unpack('busytex.wasm'));
  let dataBytes=await unpack('texlive-basic.data');
  importScripts(base + 'busytex.js');
  const cfg = { noInitialRun: true, thisProgram: '/bin/busytex', print, printErr,
    instantiateWasm(imports,receive){receive(new WebAssembly.Instance(module,imports),module);},
    locateFile: p => base.startsWith('file:') ? decodeURIComponent(new URL(p, base).pathname) : base + p,
    preRun: [m => { self.LZ4=m.LZ4; Object.assign(m.ENV, {
      TEXMFDIST:'/texlive/texmf-dist', TEXMFVAR:'/texlive/texmf-dist/texmf-var',
      TEXMFCACHE:'/texlive/texmf-dist/texmf-var', TEXMFCNF:'/texlive/texmf-dist/web2c',
      FONTCONFIG_PATH:'/texlive', FONTCONFIG_FILE:'/texlive/fonts.conf', ICU_DATA:'/texlive/',
      TEXLIVE_REMOTE_ENDPOINT:endpoint??'https://texlive2026.texlyre.org', ...env
    }); }]
  };
  cfg.getPreloadedPackage=(name,size)=>{
      if(!name.endsWith('texlive-basic.data')||!dataBytes||dataBytes.byteLength!==size)throw Error('Unexpected data package '+name);
      const bytes=dataBytes;dataBytes=null;return bytes;
  };
  // The official data loader captures this object and installs a preRun hook.
  self.BusytexPipeline = cfg;
  importScripts(base + 'texlive-basic.js');
  const m = await busytex(cfg);
  delete m.instantiateWasm;delete m.getPreloadedPackage;m.compiledModule=module;
  print('Runtime loaded in '+Math.round(performance.now()-started)+' ms');
  m.FS.mkdirTree('/project'); m.FS.chdir('/project');
  await restoreTexPackages(m,printErr);
  registerBundledFontMisses(m);
  return m;
};
self.rtexLuaArgs = file => ['luahblatex', '--no-shell-escape', '--interaction=nonstopmode', '--halt-on-error', '--fmt', '/texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt', '--nosocket', file];
self.writeEngineFile = (fs, path, data) => {
  fs.mkdirTree(path.slice(0, path.lastIndexOf('/')));
  fs.writeFile(path, data);
};
