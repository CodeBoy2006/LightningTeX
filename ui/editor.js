/** Dependency-free UI. All source, logs, and engine messages are inserted as text. */
export const DEFAULT_SOURCE = String.raw`\documentclass[11pt]{article}
\usepackage{amsmath}
\usepackage[margin=1in]{geometry}

\title{A little space to think}
\author{Realtime TeX Web}
\date{}

\begin{document}
\maketitle

\section{From an idea to a page}
Great writing starts with a little room to experiment.
Edit this document, compile it locally, and see your
ideas take shape. Your source stays in this browser.

\section{Something beautiful}
The simplest ideas often have the most elegant forms:
\[
  e^{i\pi} + 1 = 0.
\]
And sometimes a small sum tells a bigger story:
\begin{equation}
  \sum_{k=1}^{n} k = \frac{n(n+1)}{2}.
\end{equation}

\subsection{Make it yours}
\begin{itemize}
  \item Start with a thought.
  \item Give it a little structure.
  \item Let the details fall into place.
\end{itemize}

\end{document}
`;
const STORAGE_KEY = 'realtime-tex-web:draft:v1';
const CONSENT_KEY = 'realtime-tex-web:save-draft:v1';
const DEFAULT_SAMPLES = [{name:'A little space to think',source:DEFAULT_SOURCE},{name:'Minimal document',source:String.raw`\documentclass{article}
\begin{document}
Hello, world!
\end{document}
`},{name:'Mathematics',source:String.raw`\documentclass{article}
\usepackage{amsmath}
\begin{document}
\section{A mathematical note}
For a smooth function $f$, the fundamental theorem of calculus gives
\[
\int_a^b f'(x)\,dx = f(b)-f(a).
\]
\end{document}
`}];

/**
 * mountEditor({ root, source?, samples?, onCompile, onCancel?, onSourceChange?,
 *   renderPdf?, previewIntervalMs? })
 * onCompile({source, revision, reason}) may return {pdf:Uint8Array, revision?, durationMs?}.
 * Or call api.setPdf(bytes, metadata) asynchronously. Never return a fake PDF.
 * renderPdf({bytes, container, signal}) renders into an offscreen container, resolves
 * with optional {pages:number}. Only successful rendering replaces the old preview.
 */
export function mountEditor(options = {}) {
  const root = options.root || document.getElementById('app');
  if (!root) throw new Error('Realtime TeX Web needs a root element');
  const samples = options.samples || DEFAULT_SAMPLES;
  const state = {source: options.source ?? samples[0]?.source ?? DEFAULT_SOURCE, revision:0,
    pdfRevision:-1, previewRevision:-1, ready:false, compiling:false, pdf:null, filename:'main.tex',
    saved:false, dirty:false, run:0, logs:[], destroyed:false};
  let compileTimer, toastTimer, rendererAbort, pdfUrl, persist = false, pdfSequence = 0;
  const removers = [];
  try {
    persist = localStorage.getItem(CONSENT_KEY) === 'yes';
    const saved = persist && localStorage.getItem(STORAGE_KEY);
    if (saved) { const draft=JSON.parse(saved); if(typeof draft.source==='string') {state.source=draft.source;state.filename=typeof draft.filename==='string'?draft.filename:'main.tex';state.saved=true;} }
  } catch { /* Storage may be blocked; the editor remains usable. */ }
  root.innerHTML = `<main class="app-shell">
    <header class="topbar"><div class="brand"><div class="mark" aria-hidden="true">T<span class="sr-only">eX</span></div><div><h1>Realtime TeX Web</h1><p>Ideas, beautifully typeset</p></div></div><div class="private-note"><span class="dot"></span>Local compilation · WebAssembly</div></header>
    <section class="workspace-header" aria-label="Document actions"><div><div class="eyebrow">Your writing workspace</div><h2>A thought. A line. A page.</h2></div><div class="header-actions"><label class="sr-only" for="sample-picker">Open a sample document</label><select id="sample-picker" class="sample-select"><option value="">Explore a sample</option></select><button data-action="upload" title="Open a .tex file">↥ Open .tex</button><button data-action="download-source" title="Download your LaTeX source">↓ Save .tex</button><input data-id="file-input" type="file" accept=".tex,text/x-tex,text/plain" hidden></div></section>
    <div class="engine-banner" data-id="engine-banner" data-loading="true" role="status"><span class="dot"></span><span class="engine-copy" data-id="engine-message">Preparing the local TeX engine…</span><progress data-id="engine-progress" aria-label="TeX engine loading progress"></progress></div>
    <section class="workspace" aria-label="LaTeX editor and PDF preview">
      <section class="source-pane" aria-label="Source editor"><div class="pane-top"><div class="pane-title"><span class="file-icon" aria-hidden="true">{ }</span><span data-id="filename">main.tex</span><span class="pane-detail">LaTeX source</span></div><div class="compile-tools"><label class="toggle"><input data-id="auto-compile" type="checkbox" checked>Auto</label><button data-action="cancel" hidden>Cancel</button><button data-action="compile" class="primary" disabled title="Compile full PDF (Ctrl or Command + Enter)">▶ Compile</button></div></div>
        <span class="sr-only" id="editor-keyboard-help">Tab inserts indentation. Press Escape to leave the source editor. Control or Command Enter compiles your document.</span><div class="source-editor"><pre class="line-numbers" data-id="line-numbers" aria-hidden="true">1</pre><textarea class="source-input" data-id="source" aria-label="LaTeX source" aria-describedby="editor-keyboard-help" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea></div>
        <div class="editor-footer"><span data-id="cursor-status">Ln 1, Col 1</span><label class="toggle"><input data-id="persist" type="checkbox">Keep a draft on this device</label><span data-id="save-status">Draft is not saved</span></div>
        <details class="paragraph-panel" data-id="paragraph-panel"><summary><span>Live status</span><span data-id="paragraph-status">Waiting for engine</span></summary><div class="paragraph-body" data-id="paragraph-body">Text and equations update directly in Full.</div></details>
      </section>
      <section class="preview-pane" aria-label="Full document PDF preview"><div class="pane-top"><div class="pane-title">Full <span class="preview-status" data-id="preview-status"><span class="dot"></span><span data-id="preview-status-text">Not compiled</span></span></div><div class="preview-actions"><button data-action="download-pdf" disabled>↓ PDF</button></div></div><div class="preview-canvas" data-id="preview-viewport"><div class="preview-content" data-id="preview-content"><div class="empty-preview"><div class="empty-preview-inner"><div class="empty-symbol" aria-hidden="true">Aa</div><h3>Your ideas belong here.</h3><p>Compile your source to see a beautifully typeset document.<br><br><span class="key">⌘ / Ctrl + Enter</span> to compile</p></div></div></div></div><div class="preview-footer"><span data-id="preview-meta">No PDF generated yet</span><span>Live preview · PDF on download</span></div></section>
    </section>
    <details class="diagnostics" data-id="diagnostics"><summary>Engine console <span class="log-count" data-id="log-count">No messages</span></summary><pre data-id="logs" tabindex="0" aria-label="Compilation logs">Engine messages will appear here.</pre></details>
    <footer class="bottom-bar"><span>Made for your train of thought. Compiled on your device.</span><span class="keyboard-hint">Ctrl / ⌘ Enter to compile · Tab to indent · Esc to leave editor / cancel</span></footer>
    <div class="toast" data-id="toast" role="status" hidden></div>
  </main>`;
  const $ = id => root.querySelector(`[data-id="${id}"]`);
  const action = name => root.querySelector(`[data-action="${name}"]`);
  const sourceInput = $('source');
  const listen = (element,event,fn) => {element.addEventListener(event,fn);removers.push(()=>element.removeEventListener(event,fn));};
  const toast = text => { $('toast').textContent=text;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4000); };
  const updateCursor = () => {const before=sourceInput.value.slice(0,sourceInput.selectionStart);const lines=before.split('\n');$('cursor-status').textContent=`Ln ${lines.length}, Col ${lines.at(-1).length+1} · ${sourceInput.value.length.toLocaleString()} chars`;};
  const updateLines = () => {$('line-numbers').textContent=Array.from({length:sourceInput.value.split('\n').length},(_,i)=>i+1).join('\n');updateCursor();};
  const saveDraft = () => {
    state.saved=false;
    if (persist) try {localStorage.setItem(CONSENT_KEY,'yes');localStorage.setItem(STORAGE_KEY,JSON.stringify({source:state.source,filename:state.filename}));state.saved=true;} catch {toast('Your browser could not save this draft. Download your .tex file to keep it.');}
    $('save-status').textContent=state.saved?'Draft saved on device':persist?'Draft could not be saved':'Draft is not saved';
  };
  const updatePreviewStatus = () => {
    const stale=!!state.pdf && state.previewRevision!==state.revision;
    $('preview-status').classList.toggle('stale',stale);
    $('preview-status-text').textContent=state.compiling?(state.pdf?'Updating…':'Compiling…'):stale?'Out of date':state.previewRevision!==state.pdfRevision?'Live · PDF pending':state.pdf?'Up to date':'Not compiled';
  };
  const updateControls = () => {action('compile').disabled=!state.ready||state.compiling;action('cancel').hidden=!state.compiling;action('compile').textContent=state.compiling?'Compiling…':'▶ Compile';updatePreviewStatus();};
  const log = (message,level='info') => {state.logs.push(`${level==='error'?'ERROR · ':level==='warning'?'WARNING · ':''}${String(message)}`);if(state.logs.length>500)state.logs.shift();$('logs').textContent=state.logs.join('\n');$('log-count').textContent=`${state.logs.length} message${state.logs.length===1?'':'s'}`;if(level==='error')$('diagnostics').open=true;};
  const scheduleCompile = (delay=options.previewIntervalMs??60) => {
    if(compileTimer||state.compiling||!$('auto-compile').checked||state.destroyed)return;
    // A trailing debounce starves Full while typing. Keep one timer and read the latest source.
    compileTimer=setTimeout(()=>{compileTimer=null;void compile('auto');},delay);
  };
  const changed = () => {state.source=sourceInput.value;state.revision++;state.dirty=true;updateLines();saveDraft();updatePreviewStatus();options.onSourceChange?.({source:state.source,revision:state.revision});scheduleCompile();};
  const download = (data,name,type) => {const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  async function compile(reason='manual') {
    clearTimeout(compileTimer);compileTimer=null;
    if (!state.ready||state.compiling||state.destroyed)return;
    const run=++state.run, revision=state.revision;
    state.compiling=true;updateControls();
    const began=performance.now();
    try {
      if(!options.onCompile)throw new Error('No TeX engine is connected.');
      const result=await options.onCompile({source:state.source,revision,reason});
      if(run!==state.run||state.destroyed)return;
      if(result?.pdf)await setPdf(result.pdf,{...result,revision:result.revision??revision,durationMs:result.durationMs??performance.now()-began});
    }catch(error){if(run===state.run&&revision===state.revision)api.setError(error,{quiet:reason==='auto'});}
    finally {
      if(run===state.run){state.compiling=false;updateControls();if(state.revision!==revision)scheduleCompile(0);}
    }
  }
  async function setPdf(bytes,metadata={}) {
    const sequence=++pdfSequence;
    rendererAbort?.abort();rendererAbort=new AbortController();
    const container=document.createElement('div');container.className='preview-content';
    const data=bytes instanceof Uint8Array?bytes.slice():new Uint8Array(bytes);
    let newUrl, rendered;
    try {
      if(options.renderPdf)rendered=await options.renderPdf({bytes:data.slice(),container,signal:rendererAbort.signal});
      else {newUrl=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));const frame=document.createElement('iframe');frame.title='Compiled PDF document';frame.src=newUrl;container.append(frame);}
      if(state.destroyed||sequence!==pdfSequence){if(newUrl)URL.revokeObjectURL(newUrl);return;}
      if(pdfUrl)URL.revokeObjectURL(pdfUrl);pdfUrl=newUrl;
      $('preview-viewport').replaceChildren(container);
      state.pdf=data;state.pdfRevision=metadata.revision??state.revision;
      state.previewRevision=state.pdfRevision;
      action('download-pdf').disabled=false;
      const pages=metadata.pages??rendered?.pages;
      $('preview-meta').textContent=[pages?`${pages} page${pages===1?'':'s'}`:'PDF ready',Number.isFinite(metadata.durationMs)?`${(metadata.durationMs/1000).toFixed(2)} s`:null,`${(data.byteLength/1024).toFixed(1)} KB`].filter(Boolean).join(' · ');
      updatePreviewStatus();
    } catch(error) {if(newUrl)URL.revokeObjectURL(newUrl);if(sequence===pdfSequence&&!state.destroyed)api.setError(new Error(`PDF preview could not be rendered: ${error.message||error}`));}
  }
  const setSource = (source, {filename=state.filename}={}) => {sourceInput.value=String(source);state.filename=filename;$('filename').textContent=filename;changed();};
  const cancel = () => {if(!state.compiling)return;++state.run;++pdfSequence;rendererAbort?.abort();clearTimeout(compileTimer);compileTimer=null;state.compiling=false;try{Promise.resolve(options.onCancel?.()).catch(error=>log(`Cancellation: ${error.message||error}`,'warning'));}catch(error){log(`Cancellation: ${error.message||error}`,'warning');}log('Compilation cancelled. The previous PDF is retained.');updateControls();};
  sourceInput.value=state.source;$('filename').textContent=state.filename;$('persist').checked=persist;$('save-status').textContent=state.saved?'Draft restored from device':'Draft is not saved';updateLines();
  for(const [i,sample] of samples.entries()){const item=document.createElement('option');item.value=String(i);item.textContent=sample.name;root.querySelector('#sample-picker').append(item);}
  listen(sourceInput,'input',changed);listen(sourceInput,'click',updateCursor);listen(sourceInput,'keyup',updateCursor);listen(sourceInput,'scroll',()=>{$('line-numbers').scrollTop=sourceInput.scrollTop;});
  listen(sourceInput,'keydown',event=>{if(event.key==='Tab'){event.preventDefault();const start=sourceInput.selectionStart,end=sourceInput.selectionEnd;sourceInput.setRangeText('  ',start,end,'end');changed();}});
  listen(root,'keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();compile();}else if(event.key==='Escape'){if(state.compiling){event.preventDefault();cancel();}else if(event.target===sourceInput){event.preventDefault();action('upload').focus();}}});
  listen(action('compile'),'click',()=>compile());listen(action('cancel'),'click',cancel);
  listen($('auto-compile'),'change',()=>{clearTimeout(compileTimer);compileTimer=null;if(state.pdfRevision!==state.revision)scheduleCompile();});
  listen($('persist'),'change',()=>{persist=$('persist').checked;if(!persist)try{localStorage.removeItem(STORAGE_KEY);localStorage.removeItem(CONSENT_KEY);}catch{toast('Your browser could not remove the saved draft. Clear this site’s storage in browser settings.');}saveDraft();});
  listen(action('upload'),'click',()=>$('file-input').click());
  listen($('file-input'),'change',async()=>{const file=$('file-input').files[0];$('file-input').value='';if(!file)return;if(!file.name.toLowerCase().endsWith('.tex')){toast('Choose a .tex source file.');return;}if(file.size>5*1024*1024){toast('Choose a source file smaller than 5 MB.');return;}if(state.dirty&&!confirm('Replace your current source? Download the .tex file first if you want to keep it.'))return;try{setSource(await file.text(),{filename:file.name});toast(`Opened ${file.name}`);}catch(error){log(`Could not open file: ${error.message||error}`,'error');}});
  listen(root.querySelector('#sample-picker'),'change',event=>{const index=event.target.value;event.target.value='';if(index==='')return;if(state.dirty&&!confirm('Replace your current source with this sample? Download the .tex file first if you want to keep it.'))return;setSource(samples[Number(index)].source,{filename:'main.tex'});});
  listen(action('download-source'),'click',()=>{download(state.source,state.filename,'text/x-tex;charset=utf-8');state.dirty=false;toast('Source downloaded');});
  listen(action('download-pdf'),'click',async()=>{
    if(state.compiling){toast('Wait for the current preview update, then download.');return;}
    if(state.pdfRevision!==state.revision)await compile('download');
    if(state.pdfRevision!==state.revision){toast('The PDF is not current. Fix the source before downloading.');return;}
    if(state.pdf)download(state.pdf,state.filename.replace(/\.tex$/i,'')+'.pdf','application/pdf');
  });
  const beforeUnload=event=>{if(state.dirty&&!state.saved){event.preventDefault();event.returnValue='';}};listen(window,'beforeunload',beforeUnload);
  const api = {
    compile,cancel,setSource,setPdf,log,
    getSource:()=>state.source,
    getState:()=>({source:state.source,revision:state.revision,ready:state.ready,compiling:state.compiling,pdfRevision:state.pdfRevision,previewRevision:state.previewRevision,filename:state.filename}),
    setLivePages({canvases,revision,durationMs}){
      if(state.destroyed||revision!==state.revision)return false;
      const targets=[...canvases].map(([page,canvas])=>[$('preview-viewport').querySelector(`[data-page="${page}"]`),canvas]);
      if(targets.some(([target])=>!target))return false;
      for(const [target,canvas] of targets){canvas.dataset.page=target.dataset.page;canvas.style.cssText=target.style.cssText;canvas.setAttribute('aria-label',target.getAttribute('aria-label'));target.replaceWith(canvas);}
      state.previewRevision=revision;
      $('preview-meta').textContent=`Live · ${durationMs.toFixed(1)} ms · PDF generated on download`;
      updatePreviewStatus();return true;
    },
    setEngineStatus({status='loading',message,progress}={}) {
      state.ready=status==='ready';$('engine-banner').classList.toggle('error',status==='error');$('engine-banner').dataset.loading=String(status==='loading');
      $('engine-message').textContent=message??(state.ready?'Local TeX engine ready. Your document is compiled in this browser.':status==='error'?'The engine could not start. See the console below.':'Preparing the local TeX engine…');
      $('engine-progress').hidden=status!=='loading';
      if(Number.isFinite(progress)){$('engine-progress').max=1;$('engine-progress').value=Math.min(1,Math.max(0,progress));}else $('engine-progress').removeAttribute('value');
      updateControls();
    },
    setCompiling(value){state.compiling=Boolean(value);updateControls();},
    setError(error,{quiet=false}={}){log(error?.message??String(error),quiet?'warning':'error');updatePreviewStatus();if(!quiet)toast(state.pdf?'Compilation failed. Your last successful PDF is still here.':'Compilation failed. See the engine console for details.');},
    setLiveStatus({text,status='Ready',revision}={}){if(revision!==undefined&&revision!==state.revision)return;$('paragraph-status').textContent=status;if(text!==undefined)$('paragraph-body').textContent=String(text);},
    clearLogs(){state.logs=[];$('logs').textContent='Engine messages will appear here.';$('log-count').textContent='No messages';},
    destroy(){state.destroyed=true;state.run++;pdfSequence++;clearTimeout(compileTimer);clearTimeout(toastTimer);rendererAbort?.abort();if(pdfUrl)URL.revokeObjectURL(pdfUrl);removers.forEach(remove=>remove());root.replaceChildren();}
  };
  return api;
}
