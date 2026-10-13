/** Dependency-free workspace UI. Source, file names, logs and engine messages are inserted as text. */
import {icon} from './icons.js';
import {createI18n} from './i18n.js';
import {DEFAULT_SETTINGS,loadSettings,saveSettings} from './settings.js';
import {createProject,basename,dirname,joinPath,isImagePath,decodeText,fileBytes} from './project.js';
import {openStore} from './storage.js';
import {TEMPLATES,templateProject} from './templates.js';
import {createCodeEditor} from './code-editor.js';
import {createMathPopover} from './math-popover.js';
import {createFileTree} from './file-tree.js';
import {openMenu,confirmDialog,createToast} from './overlays.js';
import {mathAt} from '../core/math-preview.js';
import {zip,unzip} from '../core/zip.js';

const LEGACY_DRAFT='realtime-tex-web:draft:v1',LEGACY_CONSENT='realtime-tex-web:save-draft:v1';
const MAX_UPLOAD=20*1024*1024,ZOOMS=[0.5,0.67,0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.5,3];
const ACCENTS={bolt:'#f5b800',indigo:'#6366f1',teal:'#0d9488',rose:'#e5487d'};
const mac=/Mac|iPhone|iPad/.test(globalThis.navigator?.platform||globalThis.navigator?.userAgent||'');
const keys=combo=>mac?combo.replace('Mod+','⌘').replace('Enter','↵'):combo.replace('Mod+','Ctrl+');
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));

// Stand-in page shown until there is a PDF: skeleton while working, blank for an empty document.
const SHEET='<div class="preview-content"><div class="sheet" data-id="sheet" data-state="loading"><div class="sheet-lines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="sheet-note" data-id="sheet-note"></div><button type="button" class="btn" data-action="show-problems" data-i18n="preview.show" hidden></button></div></div>';
const shell=()=>`<div class="app">
  <div class="load-bar" data-id="load-bar"><i></i></div>
  <div class="main" data-id="main">
    <aside class="sidebar" data-id="sidebar">
      <header class="pane-head"><span class="brand"><span class="brand-mark">${icon('bolt',14)}</span><b>LightningTeX</b></span></header>
      <div class="side-head"><span class="side-title" data-i18n="app.files"></span>
        <button type="button" class="icon-btn" data-action="new-file" data-i18n-title="file.new">${icon('fileAdd')}</button>
        <button type="button" class="icon-btn" data-action="new-folder" data-i18n-title="folder.new">${icon('folderAdd')}</button>
        <button type="button" class="icon-btn" data-action="upload" data-i18n-title="file.upload">${icon('upload')}</button>
        <button type="button" class="icon-btn" data-action="project-menu" data-i18n-title="file.more">${icon('more')}</button>
      </div>
      <div class="tree" data-id="tree" role="tree"></div>
      <input data-id="file-input" type="file" multiple hidden><input data-id="zip-input" type="file" accept=".zip,application/zip" hidden>
    </aside>
    <div class="splitter" data-split="sidebar" role="separator" aria-orientation="vertical"></div>
    <section class="editor-pane">
      <header class="pane-head">
        <button type="button" class="icon-btn" data-action="toggle-sidebar" data-i18n-title="sidebar.toggle" data-keys="${keys('Mod+B')}">${icon('sidebar')}</button>
        <div class="tabs" data-id="tabs" role="tablist"></div>
        <button type="button" class="btn narrow-only" data-action="view-preview" data-i18n="view.preview"></button>
      </header>
      <span class="sr-only" id="editor-keyboard-help" data-i18n="editor.help"></span>
      <div class="editor-host" data-id="editor-host"><div class="editor-empty" data-id="editor-empty" hidden>${icon('file',28)}<span data-i18n="editor.empty"></span></div></div>
      <section class="panel" data-id="panel" hidden>
        <header class="panel-head">
          <button type="button" class="panel-tab" data-panel="problems"><span data-i18n="panel.problems"></span><span class="count" data-id="problem-count"></span></button>
          <button type="button" class="panel-tab" data-panel="log" data-i18n="panel.log"></button>
          <span class="spacer"></span>
          <button type="button" class="icon-btn" data-action="clear-log" data-i18n-title="common.clear">${icon('trash')}</button>
          <button type="button" class="icon-btn" data-action="close-panel" data-i18n-title="common.close">${icon('close')}</button>
        </header>
        <div class="problems" data-id="problems"></div>
        <pre class="logs" data-id="logs" tabindex="0" hidden></pre>
      </section>
    </section>
    <div class="splitter" data-split="preview" role="separator" aria-orientation="vertical"></div>
    <section class="preview-pane">
      <header class="pane-head">
        <button type="button" class="btn narrow-only" data-action="view-source" data-i18n="view.source"></button>
        <div class="zoom">
          <button type="button" class="icon-btn" data-action="zoom-out" data-i18n-title="zoom.out">${icon('minus')}</button>
          <button type="button" class="zoom-label" data-action="zoom-fit" data-id="zoom-label" data-i18n-title="zoom.fit"></button>
          <button type="button" class="icon-btn" data-action="zoom-in" data-i18n-title="zoom.in">${icon('plus')}</button>
        </div>
        <span class="page-indicator" data-id="page-indicator"></span>
        <span class="spacer"></span>
        <span class="status" data-id="preview-status"><i class="dot"></i><span data-id="preview-status-text"></span></span>
        <label class="auto-toggle" data-i18n-title="compile.auto"><input type="checkbox" data-id="auto-compile"><span>${icon('bolt')}</span></label>
        <button type="button" class="btn primary" data-action="compile" disabled data-i18n-title="compile.run" data-keys="${keys('Mod+Enter')}">${icon('play')}<span data-i18n="compile.run"></span></button>
        <button type="button" class="btn" data-action="cancel" hidden>${icon('stop')}<span data-i18n="compile.stop"></span></button>
        <button type="button" class="icon-btn" data-action="download-pdf" disabled data-i18n-title="pdf.download">${icon('download')}</button>
        <button type="button" class="icon-btn" data-action="settings" data-i18n-title="settings.open" data-keys="${keys('Mod+,')}">${icon('settings')}</button>
      </header>
      <div class="preview" data-id="preview-viewport">${SHEET}</div>
    </section>
  </div>
  <footer class="statusbar">
    <button type="button" class="stat" data-action="toggle-panel" data-id="stat-problems" data-i18n-title="panel.toggle" data-keys="${keys('Mod+J')}"></button>
    <span class="stat" data-id="stat-engine"></span><span class="stat live" data-id="stat-live"></span>
    <span class="spacer"></span>
    <span class="stat" data-id="stat-doc"></span><span class="stat" data-id="cursor-status"></span><span class="stat" data-id="save-status"></span>
  </footer>
  <div class="settings" data-id="settings" role="dialog" hidden></div>
  <div class="toast" data-id="toast" role="status" hidden></div>
  <div class="drop-veil" data-id="drop-veil" hidden>${icon('upload',28)}</div>
</div>`;

// [section, [key, kind, values?]…] — every row edits one setting and applies at once.
const SETTINGS=[
  ['set.appearance',[['theme','choice',['system','light','dark']],['accent','swatch',Object.keys(ACCENTS)],['lang','choice',['auto','en','zh']],['darkPages','toggle']]],
  ['set.editor',[['fontSize','step',[11,20]],['wrap','toggle'],['autoClose','toggle'],['tabSize','choice',[2,4]],['spellcheck','toggle']]],
  ['set.preview',[['autoCompile','toggle'],['mathPreview','toggle'],['mathScale','choice',['s','m','l']],['follow','toggle']]],
  ['set.storage',[['persist','toggle']]],
];
const choiceLabel={lang:{en:'English',zh:'中文',auto:'set.lang.auto'},theme:value=>'set.theme.'+value,mathScale:value=>'size.'+value};

/**
 * mountEditor({ root, source?, project?, store?, onCompile, onCancel?, onSourceChange?, renderPdf?,
 *   typesetMath?, onCursor?, onPreviewPick?, previewIntervalMs? })
 * onCompile({source, root, files, filesRev, revision, reason}) may return {pdf:Uint8Array, revision?, durationMs?},
 *   or {empty:true} for a document without pages; files are the project's other files as {path, data, rev}.
 *   Never return a fake PDF.
 * renderPdf({bytes, container, signal, zoom, viewport}) renders into an offscreen container; only a
 *   successful render replaces the old preview. Page canvases carry data-page and data-base (CSS px at 100%).
 * typesetMath({found, source, scale, maxWidth}) resolves {canvas} or {state, message} for the formula popover.
 * store: {load, save, clear} persistence (default IndexedDB), or null to keep everything in memory.
 */
export function mountEditor(options={}){
  const root=options.root||document.getElementById('app');
  if(!root)throw new Error('LightningTeX needs a root element');
  const settings=loadSettings(),i18n=createI18n(settings.lang),t=i18n.t,project=createProject();
  settings.panel=false; // The problems panel opens on demand; it never starts open.
  const state={revision:0,filesRev:0,pdfRevision:-1,previewRevision:-1,engine:'loading',progress:null,loaded:false,
    compiling:false,busy:false,pdf:null,meta:null,empty:false,run:0,logs:[],problems:[],failed:false,live:null,marker:null,dirty:false,save:'off',destroyed:false};
  const views=new Map(),removers=[];
  let tabs=[],active=null,compileTimer,busyTimer,zoomTimer,saveTimer,rendererAbort,pdfSequence=0,store=null,saving=false,restoring=false,storageWarned=false;
  let pending=emptyPending(),panelAuto=false;
  root.innerHTML=shell();
  const app=root.firstElementChild;
  const $=id=>root.querySelector(`[data-id="${id}"]`);
  const action=name=>root.querySelector(`[data-action="${name}"]`);
  const listen=(element,type,handler,config)=>{element.addEventListener(type,handler,config);removers.push(()=>element.removeEventListener(type,handler,config));};
  const viewport=$('preview-viewport'),marker=Object.assign(document.createElement('div'),{className:'sync-marker'});
  const toaster=createToast($('toast')),toast=(text,undo)=>toaster.show(text,undo);
  const notify=(key,values)=>toast(t(key,values));
  const download=(data,name,type)=>{const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const mainText=()=>project.get(project.main)?.text??'';

  // ---- settings ---------------------------------------------------------------------------------
  const darkQuery=globalThis.matchMedia?.('(prefers-color-scheme: dark)'),narrowQuery=globalThis.matchMedia?.('(max-width: 780px)');
  // On a narrow screen the file list is a drawer over the editor: closed by default, never persisted.
  let drawer=false;
  const sidebarOpen=()=>narrowQuery?.matches?drawer:settings.sidebarOpen;
  function toggleSidebar(open=!sidebarOpen()){if(narrowQuery?.matches){drawer=open;applyLayout();}else set('sidebarOpen',open);}
  function applyAppearance(){
    const theme=settings.theme==='system'?(darkQuery?.matches?'dark':'light'):settings.theme;
    for(const target of [app,document.documentElement]){target.dataset.theme=theme;target.dataset.accent=settings.accent;}
    app.dataset.darkPages=String(settings.darkPages);document.documentElement.lang=i18n.lang==='zh'?'zh-CN':'en';
  }
  function applyLayout(){
    app.style.setProperty('--sidebar-w',settings.sidebar+'px');app.style.setProperty('--split',String(settings.split));
    app.dataset.sidebar=sidebarOpen()?'open':'closed';
  }
  function set(key,value){
    if(settings[key]===value)return;
    settings[key]=value;saveSettings(settings);
    if(key==='theme'||key==='accent'||key==='darkPages')applyAppearance();
    else if(key==='lang'){i18n.set(value);applyAppearance();refreshText();}
    else if(key==='sidebar'||key==='split'||key==='sidebarOpen')applyLayout();
    else if(['fontSize','wrap','autoClose','tabSize','spellcheck'].includes(key)){for(const view of views.values())view.editor?.configure(settings);popover?.place();}
    else if(key==='autoCompile'){$('auto-compile').checked=value;clearTimeout(compileTimer);compileTimer=null;if(value&&state.pdfRevision!==state.revision)scheduleCompile();}
    else if(key==='mathPreview'||key==='mathScale'){popover?.hide();if(value)updateMath();}
    else if(key==='persist')void persistChanged();
    else if(key==='panel'||key==='panelTab')renderPanel();
    else if(key==='follow')placeMarker(true);
    syncSettings();
  }
  function renderSettings(){
    const panel=$('settings');panel.replaceChildren();panel.setAttribute('aria-label',t('settings.open'));
    for(const [title,rows] of SETTINGS){
      const section=document.createElement('section');section.append(Object.assign(document.createElement('h3'),{textContent:t(title)}));
      for(const [key,kind,values] of rows){
        const row=document.createElement('div');row.className='setting';row.append(Object.assign(document.createElement('span'),{className:'setting-label',textContent:t('set.'+key)}));
        const control=document.createElement(kind==='toggle'?'label':'div');control.dataset.setting=key;control.className=kind==='toggle'?'switch':kind==='step'?'stepper':'segmented';
        if(kind==='toggle'){
          const box=Object.assign(document.createElement('input'),{type:'checkbox'});box.setAttribute('aria-label',t('set.'+key));if(key==='persist')box.dataset.id='persist';
          box.addEventListener('change',()=>set(key,box.checked));control.append(box,document.createElement('i'));
        }else if(kind==='step'){
          for(const delta of [-1,1]){
            const button=Object.assign(document.createElement('button'),{type:'button',className:'icon-btn',innerHTML:icon(delta<0?'minus':'plus',14)});
            button.addEventListener('click',()=>set(key,clamp(settings[key]+delta,values[0],values[1])));control.append(button);
          }
          control.firstChild.after(document.createElement('output'));
        }else for(const value of values){
          const button=Object.assign(document.createElement('button'),{type:'button'});button.dataset.value=String(value);button.setAttribute('role','radio');
          if(kind==='swatch'){button.className='swatch';button.style.setProperty('--swatch',ACCENTS[value]);button.setAttribute('aria-label',value);}
          else{const label=choiceLabel[key];button.textContent=!label?String(value):typeof label==='function'?t(label(value)):label[value].includes('.')?t(label[value]):label[value];}
          button.addEventListener('click',()=>set(key,value));control.append(button);
        }
        row.append(control);section.append(row);
      }
      panel.append(section);
    }
    const reset=Object.assign(document.createElement('button'),{type:'button',className:'btn reset',textContent:t('set.reset')});
    reset.addEventListener('click',()=>{for(const key of Object.keys(DEFAULT_SETTINGS))if(!['sidebarOpen','panel','panelTab','persist'].includes(key))set(key,DEFAULT_SETTINGS[key]);layoutPages();});
    panel.append(reset);syncSettings();
  }
  function syncSettings(){
    for(const control of $('settings').querySelectorAll('[data-setting]')){
      const value=settings[control.dataset.setting],box=control.querySelector('input'),output=control.querySelector('output');
      if(box)box.checked=!!value;else if(output)output.textContent=String(value);
      else for(const button of control.children)button.setAttribute('aria-checked',String(button.dataset.value===String(value)));
    }
  }
  function toggleSettings(show=$('settings').hidden){
    const panel=$('settings');panel.hidden=!show;action('settings').setAttribute('aria-expanded',String(show));
    if(show)panel.querySelector('button,input')?.focus({preventScroll:true});
  }

  // ---- status -----------------------------------------------------------------------------------
  function updateStatus(){
    const shown=state.previewRevision>=0,stale=shown&&state.previewRevision!==state.revision,name=state.busy?'busy':!shown?'none':stale?'stale':state.previewRevision!==state.pdfRevision?'live':'ok';
    $('preview-status').dataset.state=name;$('preview-status-text').textContent=t('status.'+name);
  }
  function updateControls(){
    const run=action('compile'),stop=action('cancel');
    run.disabled=state.engine!=='ready'||!state.loaded||state.compiling||!project.main;run.hidden=state.busy;stop.hidden=!state.busy;
    updateStatus();
  }
  function updateEngine(){
    const loading=state.engine==='loading',failed=state.engine==='error',percent=Number.isFinite(state.progress)?Math.round(state.progress*100):null;
    const text=loading?t('engine.loading')+(percent==null?'…':` ${percent}%`):failed?t('engine.error'):!project.main&&state.loaded?t('engine.nomain'):'';
    $('stat-engine').textContent=text;$('stat-engine').dataset.state=failed?'error':'';
    const bar=$('load-bar');bar.hidden=!loading;bar.dataset.mode=percent==null?'indeterminate':'determinate';bar.firstChild.style.width=percent==null?'':percent+'%';
    const sheet=$('sheet');
    if(sheet){
      sheet.dataset.state=loading||state.busy?'loading':state.failed||failed?'failed':state.empty?'empty':'idle';
      $('sheet-note').textContent=text||(state.failed?t('preview.failed'):'');action('show-problems').hidden=!state.failed;
    }
  }
  function updateLive(){
    const live=state.live,el=$('stat-live');
    el.textContent=!live?'':live.state==='live'?t('live.ms',{ms:live.ms<10?live.ms.toFixed(1):Math.round(live.ms)}):live.state==='full'?t('live.full'):live.state==='waiting'?t('live.wait'):live.state==='off'?t('live.off'):'';
    el.title=live?.reason?String(live.reason):'';el.dataset.state=live?.state||'';
  }
  function updateSave(){$('save-status').textContent=t('save.'+state.save);$('save-status').dataset.state=state.save;}
  function updateDoc(){
    const meta=state.meta;
    $('stat-doc').textContent=!meta?'':[meta.pages?(meta.pages===1?t('page'):t('pages',{n:meta.pages})):null,Number.isFinite(meta.bytes)?`${(meta.bytes/1024).toFixed(1)} KB`:null,Number.isFinite(meta.durationMs)?`${(meta.durationMs/1000).toFixed(2)} s`:null].filter(Boolean).join(' · ');
  }
  function refreshText(){
    i18n.apply(root);renderSettings();renderTabs();tree.render();renderProblems();updateControls();updateEngine();updateLive();updateSave();updateDoc();updateZoomLabel();
    $('cursor-status').textContent=views.get(active)?.position?t('cursor',views.get(active).position):'';
  }

  // ---- panel: problems and log ------------------------------------------------------------------
  function renderPanel(){
    const panel=$('panel');panel.hidden=!settings.panel;
    for(const tab of panel.querySelectorAll('.panel-tab'))tab.setAttribute('aria-selected',String(tab.dataset.panel===settings.panelTab));
    $('problems').hidden=settings.panelTab!=='problems';$('logs').hidden=settings.panelTab!=='log';action('clear-log').hidden=settings.panelTab!=='log';
  }
  function openPanel(tab=settings.panelTab){set('panelTab',tab);set('panel',true);}
  function renderProblems(){
    const list=$('problems'),counts={error:0,warning:0,info:0},marksByFile=new Map(),rank={error:3,warning:2,info:1};list.replaceChildren();
    for(const problem of state.problems){
      counts[problem.severity]=(counts[problem.severity]||0)+1;
      if(problem.line){
        let marks=marksByFile.get(problem.file);
        if(!marks)marksByFile.set(problem.file,marks=new Map());
        // The worst problem on a line decides its gutter mark.
        if((rank[marks.get(problem.line)]||0)<rank[problem.severity])marks.set(problem.line,problem.severity);
      }
      const row=Object.assign(document.createElement('button'),{type:'button',className:'problem'});row.dataset.severity=problem.severity;
      row.innerHTML=`${icon(problem.severity==='error'?'error':problem.severity==='warning'?'warning':'info',14)}<span class="problem-text"></span><span class="problem-where"></span>`;
      row.children[1].textContent=problem.message;row.children[2].textContent=[problem.file,problem.line].filter(value=>value!=null).join(':');
      row.disabled=!problem.file||!project.has(problem.file);
      row.addEventListener('click',()=>reveal({path:problem.file,line:problem.line??1}));
      list.append(row);
    }
    if(!state.problems.length)list.append(Object.assign(document.createElement('div'),{className:'panel-empty',textContent:t('panel.none')}));
    $('problem-count').textContent=state.problems.length?String(state.problems.length):'';
    const stat=$('stat-problems');stat.innerHTML=`${icon('error',13)}<span></span>${icon('warning',13)}<span></span>`;
    stat.children[1].textContent=String(counts.error);stat.children[3].textContent=String(counts.warning);stat.dataset.state=counts.error?'error':counts.warning?'warning':'';
    for(const [path,view] of views){
      if(!view.editor)continue;
      view.editor.setMarkers(marksByFile.get(path)||new Map());
    }
  }
  const log=(message,level='info')=>{
    state.logs.push(`${level==='error'?'ERROR · ':level==='warning'?'WARNING · ':''}${String(message)}`);if(state.logs.length>500)state.logs.shift();
    const el=$('logs'),pinned=el.scrollTop+el.clientHeight>=el.scrollHeight-8;el.textContent=state.logs.join('\n');if(pinned)el.scrollTop=el.scrollHeight;
  };

  // ---- editor views and tabs --------------------------------------------------------------------
  const isTex=path=>/\.(tex|ltx|sty|cls)$/i.test(path);
  function updateMath(){
    const view=views.get(active);
    if(!popover||!view?.editor)return;
    const editor=view.editor,input=editor.input;
    if(!settings.mathPreview||!isTex(active)||input.selectionStart!==input.selectionEnd||document.activeElement!==input){popover.hide();return;}
    const source=editor.getValue();void popover.update(editor,mathAt(source,editor.caret),source,active);
  }
  function createView(path){
    const file=project.get(path),el=document.createElement('div'),view={el,position:null};el.className='view';el.hidden=true;
    if(typeof file.text==='string'){
      view.editor=createCodeEditor({value:file.text,settings,label:t('editor.label'),describedBy:'editor-keyboard-help',
        onChange:value=>project.write(path,value,'editor'),
        onCursor:position=>{
          view.position=position;
          if(active!==path)return;
          $('cursor-status').textContent=t('cursor',position);updateMath();
          options.onCursor?.({path,offset:position.offset,line:position.line,main:path===project.main});
        },
        onEscape:()=>{
          if(popover?.dismiss())return;
          if(state.compiling){cancel();return;}
          $('tabs').querySelector('[aria-selected="true"]')?.focus();
        }});
      view.editor.input.addEventListener('blur',()=>popover?.hide());
      el.append(view.editor.el);return view;
    }
    el.classList.add('viewer');
    const size=`${(file.data.length/1024).toFixed(1)} KB`;
    if(isImagePath(path)){
      const kind=/\.([a-z]+)$/i.exec(path)[1].toLowerCase().replace('jpg','jpeg');
      view.url=URL.createObjectURL(new Blob([file.data],{type:'image/'+kind}));
      el.append(Object.assign(document.createElement('img'),{alt:basename(path),src:view.url}),Object.assign(document.createElement('span'),{textContent:size}));return view;
    }
    el.innerHTML=icon('file',28);el.append(Object.assign(document.createElement('span'),{textContent:`${t('binary.note')} · ${size}`}));return view;
  }
  function dropView(path){const view=views.get(path);if(!view)return;view.editor?.destroy();if(view.url)URL.revokeObjectURL(view.url);view.el.remove();views.delete(path);}
  function renderTabs(){
    const bar=$('tabs');bar.replaceChildren();
    for(const path of tabs){
      const tab=document.createElement('div');tab.className='tab';tab.setAttribute('role','tab');tab.tabIndex=0;tab.dataset.path=path;tab.setAttribute('aria-selected',String(path===active));tab.title=path;
      // Same-named files in different folders show their folder.
      const twin=tabs.some(other=>other!==path&&basename(other)===basename(path))&&dirname(path);
      tab.innerHTML=(path===project.main?`<span class="tab-main">${icon('bolt',12)}</span>`:'')+'<span class="tab-name"></span>'+(twin?'<span class="tab-dir"></span>':'')+`<button type="button" class="icon-btn tab-close" tabindex="-1">${icon('close',12)}</button>`;
      const name=tab.querySelector('.tab-name');name.textContent=basename(path);if(path===active)name.dataset.id='filename';
      if(twin)tab.querySelector('.tab-dir').textContent=twin;
      tab.lastChild.setAttribute('aria-label',t('tab.close'));
      bar.append(tab);
    }
    $('editor-empty').hidden=!!active;
  }
  function activate(path,{focus=false}={}){
    const previous=views.get(active);
    if(previous&&active!==path){previous.el.hidden=true;previous.editor?.input.removeAttribute('data-id');}
    popover?.hide();active=path;
    if(path){
      let view=views.get(path);
      if(!view){view=createView(path);views.set(path,view);$('editor-host').append(view.el);renderProblems();}
      view.el.hidden=false;view.editor?.input.setAttribute('data-id','source');
      if(focus)view.editor?.focus();
    }
    $('cursor-status').textContent=views.get(path)?.position?t('cursor',views.get(path).position):'';
    renderTabs();tree.setActive(path);if(state.loaded)queueSave();
  }
  function openFile(path,config){
    if(!project.has(path))return;
    if(!tabs.includes(path))tabs.push(path);
    activate(path,config);
    $('tabs').querySelector('[aria-selected="true"]')?.scrollIntoView?.({block:'nearest',inline:'nearest'});
  }
  function closeTab(path,focus=false){
    const index=tabs.indexOf(path);if(index<0)return;
    tabs.splice(index,1);dropView(path);
    if(active===path)activate(tabs[Math.min(index,tabs.length-1)]??null,{focus});else renderTabs();
    queueSave();
  }
  /** Show a place in a project file: {path, line} or {path, offset}. */
  function reveal({path,line,offset,flash=true}){
    if(!path||!project.has(path))return;
    openFile(path,{focus:true});app.dataset.view='source';
    const editor=views.get(path)?.editor;if(!editor)return;
    const at=offset??editor.offsetOf(line??1);editor.select(at);
    if(flash)editor.flash(editor.getValue().slice(0,at).split('\n').length);
  }

  // ---- compile and preview ----------------------------------------------------------------------
  const scheduleCompile=(delay=options.previewIntervalMs??60)=>{
    if(compileTimer||state.compiling||!settings.autoCompile||state.destroyed)return;
    // A trailing debounce starves Full while typing. Keep one timer and read the latest source.
    compileTimer=setTimeout(()=>{compileTimer=null;void compile('auto');},delay);
  };
  const finishRun=()=>{state.compiling=false;clearTimeout(busyTimer);state.busy=false;updateControls();updateEngine();};
  async function compile(reason='manual'){
    clearTimeout(compileTimer);compileTimer=null;
    if(state.engine!=='ready'||!state.loaded||state.compiling||state.destroyed||!project.main)return;
    const run=++state.run,revision=state.revision,main=project.main,began=performance.now();
    state.compiling=true;
    // Local updates finish within a frame or two; only a real wait shows the busy state.
    busyTimer=setTimeout(()=>{state.busy=true;updateControls();updateEngine();},250);
    updateControls();
    try{
      if(!options.onCompile)throw new Error('No TeX engine is connected.');
      const files=project.files().filter(file=>file.path!==main).map(file=>({path:file.path,data:file.text??file.data,rev:file.rev}));
      const result=await options.onCompile({source:mainText(),root:main,files,filesRev:state.filesRev,revision,reason});
      if(run!==state.run||state.destroyed)return;
      state.failed=false;
      // A panel that opened for an error steps aside once the document compiles again.
      if(panelAuto){panelAuto=false;set('panel',false);}
      if(result?.empty)showSheet(revision);
      else if(result?.pdf)await setPdf(result.pdf,{...result,revision:result.revision??revision,durationMs:result.durationMs??performance.now()-began});
    }catch(error){if(run===state.run&&revision===state.revision)api.setError(error,{quiet:reason==='auto'});}
    finally{
      if(run===state.run){finishRun();if(state.revision!==revision)scheduleCompile(0);}
    }
  }
  const cancel=()=>{
    if(!state.compiling)return;
    ++state.run;++pdfSequence;rendererAbort?.abort();clearTimeout(compileTimer);compileTimer=null;
    try{Promise.resolve(options.onCancel?.()).catch(error=>log(`Cancellation: ${error.message||error}`,'warning'));}catch(error){log(`Cancellation: ${error.message||error}`,'warning');}
    log('Compilation cancelled. The previous PDF is retained.');finishRun();
  };
  /** Drop the PDF and show the stand-in page; revision >= 0 marks an empty document as current. */
  function showSheet(revision=-1){
    ++pdfSequence;rendererAbort?.abort();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
    state.pdf=state.pdfUrl=state.meta=null;state.pdfRevision=state.previewRevision=revision;state.empty=revision>=0;
    if(!$('sheet')){viewport.innerHTML=SHEET;i18n.apply(viewport);}
    action('download-pdf').disabled=true;marker.remove();updateDoc();updateStatus();updateEngine();updatePage();
  }
  const pages=()=>[...viewport.querySelectorAll('canvas[data-page]')];
  const fitWidth=()=>Math.max(240,viewport.clientWidth-48);
  const pageWidth=base=>settings.zoom==='fit'?Math.min(fitWidth(),base*2.5):base*settings.zoom;
  const currentZoom=()=>{const base=parseFloat(pages()[0]?.dataset.base);return settings.zoom==='fit'?(base?pageWidth(base)/base:1):settings.zoom;};
  function updateZoomLabel(){$('zoom-label').textContent=settings.zoom==='fit'?t('zoom.fitLabel'):Math.round(settings.zoom*100)+'%';}
  function updatePage(){
    const list=pages(),middle=viewport.scrollTop+viewport.clientHeight/3;let current=0;
    for(const [index,canvas] of list.entries())if(canvas.offsetTop<=middle)current=index;
    $('page-indicator').textContent=list.length>1?`${current+1} / ${list.length}`:'';
  }
  function placeMarker(scroll=false){
    const canvas=state.marker&&viewport.querySelector(`canvas[data-page="${state.marker.page}"]`);
    if(!canvas||!canvas.offsetHeight){marker.remove();return;}
    if(marker.parentNode!==canvas.parentNode)canvas.parentNode.append(marker);
    const top=canvas.offsetTop+canvas.offsetHeight*state.marker.top,height=Math.max(8,canvas.offsetHeight*(state.marker.bottom-state.marker.top));
    marker.style.top=top+'px';marker.style.height=height+'px';marker.style.left=canvas.offsetLeft-8+'px';
    if(scroll&&settings.follow&&(top<viewport.scrollTop+12||top+height>viewport.scrollTop+viewport.clientHeight-12))
      viewport.scrollTo?.({top:Math.max(0,top-viewport.clientHeight/3),behavior:'smooth'});
  }
  /** Resize pages with CSS at once; refreshPages then redraws them sharp. */
  function layoutPages(){
    for(const canvas of pages()){const base=parseFloat(canvas.dataset.base);if(base)canvas.style.width=pageWidth(base)+'px';}
    updateZoomLabel();updatePage();placeMarker();
  }
  function refreshPages(){
    if(!state.pdf||state.compiling||state.destroyed)return;
    // The host redraws current live display lists, or compiles if those cannot render.
    if(state.previewRevision===state.pdfRevision)void setPdf(state.pdf,{...state.meta,revision:state.pdfRevision});else void compile('zoom');
  }
  function setZoom(zoom){
    const anchor=viewport.scrollHeight?viewport.scrollTop/viewport.scrollHeight:0;
    set('zoom',zoom==='fit'?'fit':clamp(Math.round(zoom*100)/100,0.25,4));layoutPages();viewport.scrollTop=anchor*viewport.scrollHeight;
    clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,220);
  }
  const stepZoom=direction=>{const zoom=currentZoom();setZoom(direction>0?ZOOMS.find(value=>value>zoom+0.01)??ZOOMS.at(-1):[...ZOOMS].reverse().find(value=>value<zoom-0.01)??ZOOMS[0]);};
  async function setPdf(bytes,metadata={}){
    const sequence=++pdfSequence;
    rendererAbort?.abort();rendererAbort=new AbortController();
    const container=document.createElement('div');container.className='preview-content';
    const data=bytes instanceof Uint8Array?bytes.slice():new Uint8Array(bytes);
    let newUrl,rendered;
    try{
      if(options.renderPdf)rendered=await options.renderPdf({bytes:data.slice(),container,signal:rendererAbort.signal,zoom:settings.zoom,viewport});
      else{newUrl=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));const frame=document.createElement('iframe');frame.title='Compiled PDF document';frame.src=newUrl;container.append(frame);}
      if(state.destroyed||sequence!==pdfSequence){if(newUrl)URL.revokeObjectURL(newUrl);return;}
      if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=newUrl;
      const scroll=viewport.scrollTop;
      viewport.replaceChildren(container);viewport.scrollTop=scroll;
      state.pdf=data;state.empty=false;state.pdfRevision=metadata.revision??state.revision;state.previewRevision=state.pdfRevision;
      state.meta={pages:metadata.pages??rendered?.pages,durationMs:metadata.durationMs,bytes:data.byteLength};
      action('download-pdf').disabled=false;
      updateDoc();updateStatus();updatePage();updateZoomLabel();placeMarker();
    }catch(error){if(newUrl)URL.revokeObjectURL(newUrl);if(sequence===pdfSequence&&!state.destroyed)api.setError(new Error(`PDF preview could not be rendered: ${error.message||error}`));}
  }

  // ---- files ------------------------------------------------------------------------------------
  function emptyPending(){return {put:new Set(),remove:new Set(),reset:false};}
  function queueSave(change){
    if(!store||!settings.persist||restoring||state.destroyed)return;
    if(change?.type==='load'){pending=emptyPending();pending.reset=true;for(const path of project.paths())pending.put.add(path);}
    else if(change?.type==='remove')for(const path of change.paths){pending.put.delete(path);pending.remove.add(path);}
    else if(change?.type==='rename')for(const [from,to] of change.moved){pending.put.delete(from);pending.remove.add(from);pending.remove.delete(to);pending.put.add(to);}
    else for(const path of change?.paths||(change?.path&&project.has(change.path)?[change.path]:[])){pending.remove.delete(path);pending.put.add(path);}
    state.save='saving';updateSave();clearTimeout(saveTimer);saveTimer=setTimeout(flush,400);
  }
  async function flush(){
    clearTimeout(saveTimer);saveTimer=null;
    if(!store||!settings.persist||state.destroyed)return;
    if(saving){saveTimer=setTimeout(flush,200);return;}
    const job=pending;pending=emptyPending();saving=true;
    try{
      await store.save({reset:job.reset,remove:[...job.remove],put:[...job.put].map(path=>project.get(path)).filter(Boolean).map(file=>typeof file.text==='string'?{path:file.path,text:file.text}:{path:file.path,data:file.data}),
        meta:{main:project.main,folders:project.explicitFolders(),tabs,active}});
      if(!saveTimer){state.save='saved';state.dirty=false;}
    }catch{
      state.save='failed';if(!storageWarned){storageWarned=true;notify('toast.storage');}
    }finally{saving=false;updateSave();}
  }
  async function persistChanged(){
    if(!store){state.save='off';updateSave();return;}
    if(settings.persist){queueSave({type:'load'});return;}
    clearTimeout(saveTimer);saveTimer=null;pending=emptyPending();state.save='off';updateSave();
    try{await store.clear();}catch{notify('toast.storage');}
  }
  async function upload(list,dir=''){
    const files=[...list];
    if(files.length===1&&/\.zip$/i.test(files[0].name)){await importArchive(files[0]);return;}
    const undo=[];let added=0,first=null;
    for(const file of files){
      if(file.size>MAX_UPLOAD){notify('toast.tooBig',{name:file.name});continue;}
      try{
        const bytes=new Uint8Array(await file.arrayBuffer()),path=joinPath(dir,file.name),old=project.get(path);
        const written=project.write(path,decodeText(bytes)??bytes);
        undo.push(old?()=>project.write(old.path,old.text??old.data):()=>project.remove(written));added++;first??=written;
      }catch(error){
        if(/Unsafe|exists/.test(error.message))notify(error.message==='exists'?'toast.exists':'toast.badName',{name:file.name});
        else log(`Could not add ${file.name}: ${error.message||error}`,'error');
      }
    }
    if(!added)return;
    if(first&&typeof project.get(first).text==='string')openFile(first);
    toast(t('toast.uploaded',{n:added}),{label:t('common.undo'),run:()=>{for(const step of undo.reverse())step();}});
  }
  async function replaceProject(data){
    if(project.files().length&&!await confirmDialog(app,{title:t('project.replaceTitle'),message:t('project.replaceBody'),confirm:t('project.replace'),cancel:t('common.cancel'),danger:true}))return false;
    project.load(data);if(project.main)openFile(project.main);
    return true;
  }
  async function importArchive(file){
    if(file.size>64*1024*1024){notify('toast.tooBig',{name:file.name});return;}
    try{
      let entries=(await unzip(new Uint8Array(await file.arrayBuffer()))).filter(entry=>!/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(entry.path));
      // Archives usually wrap everything in one folder; open it.
      const top=entries[0]?.path.split('/')[0];
      if(entries.length&&entries.every(entry=>entry.path.startsWith(top+'/')))entries=entries.map(entry=>({...entry,path:entry.path.slice(top.length+1)}));
      if(await replaceProject({files:entries.map(entry=>{const text=decodeText(entry.data);return text==null?entry:{path:entry.path,text};})}))notify('toast.imported',{n:project.files().length});
    }catch(error){notify('toast.zip',{message:error.message||error});}
  }
  function remove(path){
    const restore=project.remove(path);
    if(restore)toast(t('toast.deleted',{name:basename(path)}),{label:t('common.undo'),run:restore});
  }
  const downloadFile=path=>{const file=project.get(path);if(file)download(fileBytes(file),basename(path),typeof file.text==='string'?'text/plain;charset=utf-8':'application/octet-stream');};
  function projectMenu(){
    openMenu(app,action('project-menu').getBoundingClientRect(),[{heading:t('project.template')},
      ...TEMPLATES.map(template=>({label:template.name[i18n.lang]||template.name.en,icon:'template',run:()=>void replaceProject(templateProject(template))})),'separator',
      {label:t('project.import'),icon:'archive',run:()=>$('zip-input').click()},
      {label:t('project.export'),icon:'download',disabled:!project.files().length,run:()=>download(zip(project.files().map(file=>({path:file.path,data:fileBytes(file)}))),(project.main?basename(project.main).replace(/\.tex$/i,''):'project')+'.zip','application/zip')}]);
  }
  const tree=createFileTree({el:$('tree'),host:app,project,t,actions:{open:path=>{openFile(path,{focus:true});if(narrowQuery?.matches)toggleSidebar(false);},remove,download:downloadFile,upload:(files,dir)=>void upload(files,dir),notify,
    pick:dir=>{state.uploadDir=dir;$('file-input').click();}}});
  const popover=options.typesetMath?createMathPopover({t,typeset:request=>options.typesetMath({...request,scale:settings.mathScale})}):null;

  project.on(change=>{
    if(state.destroyed||restoring)return;
    const typed=change.origin==='editor';
    state.revision++;state.dirty=true;
    // Only edits to the main file's text can be typeset locally; everything else needs a full pass.
    if(change.path!==project.main||change.type==='create'||change.type==='main')state.filesRev++;
    if(change.type==='load'){for(const path of [...views.keys()])dropView(path);tabs=[];active=null;state.problems=[];state.failed=false;renderProblems();showSheet();}
    else if(change.type==='remove')for(const path of change.paths)closeTab(path);
    else if(change.type==='rename')for(const [from,to] of change.moved){
      if(!tabs.includes(from))continue;
      tabs[tabs.indexOf(from)]=to;dropView(from);if(active===from)activate(to);
    }else if(change.type==='write'&&!typed){
      const view=views.get(change.path),file=project.get(change.path);
      if(view?.editor&&typeof file.text==='string'){if(view.editor.getValue()!==file.text)view.editor.setValue(file.text);}
      else if(view){const shown=active===change.path;dropView(change.path);if(shown)activate(change.path);}
    }
    if(!typed){tree.render();renderTabs();updateEngine();}
    queueSave(change);updateControls();
    options.onSourceChange?.({source:mainText(),revision:state.revision});
    scheduleCompile();
  });

  // ---- events -----------------------------------------------------------------------------------
  listen(action('compile'),'click',()=>compile());listen(action('cancel'),'click',cancel);
  listen($('auto-compile'),'change',event=>set('autoCompile',event.target.checked));
  listen(action('download-pdf'),'click',async()=>{
    if(state.compiling){notify('toast.wait');return;}
    if(state.pdfRevision!==state.revision)await compile('download');
    if(state.pdfRevision!==state.revision){notify('toast.stale');return;}
    if(state.pdf)download(state.pdf,basename(project.main||'main.tex').replace(/\.tex$/i,'')+'.pdf','application/pdf');
  });
  listen(action('settings'),'click',()=>toggleSettings());
  listen(action('new-file'),'click',()=>tree.create(false,tree.directory));listen(action('new-folder'),'click',()=>tree.create(true,tree.directory));
  listen(action('upload'),'click',()=>{state.uploadDir=tree.directory;$('file-input').click();});
  listen(action('project-menu'),'click',projectMenu);
  listen($('file-input'),'change',()=>{const files=[...$('file-input').files];$('file-input').value='';if(files.length)void upload(files,state.uploadDir||'');});
  listen($('zip-input'),'change',()=>{const file=$('zip-input').files[0];$('zip-input').value='';if(file)void importArchive(file);});
  listen($('tree'),'contextmenu',event=>{if(event.target===$('tree')){event.preventDefault();tree.menu(null,{x:event.clientX,y:event.clientY});}});
  listen($('tabs'),'click',event=>{const tab=event.target.closest('.tab');if(!tab)return;if(event.target.closest('.tab-close'))closeTab(tab.dataset.path,true);else openFile(tab.dataset.path,{focus:true});});
  listen($('tabs'),'auxclick',event=>{const tab=event.target.closest('.tab');if(tab&&event.button===1){event.preventDefault();closeTab(tab.dataset.path);}});
  listen($('tabs'),'keydown',event=>{
    const tab=event.target.closest('.tab');if(!tab)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();openFile(tab.dataset.path,{focus:true});}
    else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();(event.key==='ArrowRight'?tab.nextElementSibling:tab.previousElementSibling)?.focus();}
  });
  listen($('tabs'),'wheel',event=>{if(!event.deltaX&&event.deltaY){$('tabs').scrollLeft+=event.deltaY;}},{passive:true});
  listen(action('toggle-sidebar'),'click',()=>toggleSidebar());
  listen(action('toggle-panel'),'click',()=>{panelAuto=false;set('panel',!settings.panel);});listen(action('close-panel'),'click',()=>set('panel',false));
  listen(viewport,'click',event=>{if(event.target.closest?.('[data-action="show-problems"]'))openPanel(state.problems.length?'problems':'log');});
  listen(action('clear-log'),'click',()=>api.clearLogs());
  for(const tab of $('panel').querySelectorAll('.panel-tab'))listen(tab,'click',()=>set('panelTab',tab.dataset.panel));
  listen(action('view-preview'),'click',()=>{app.dataset.view='preview';layoutPages();});listen(action('view-source'),'click',()=>{app.dataset.view='source';});
  listen(action('zoom-in'),'click',()=>stepZoom(1));listen(action('zoom-out'),'click',()=>stepZoom(-1));
  listen(action('zoom-fit'),'click',()=>setZoom(settings.zoom==='fit'?1:'fit'));
  listen(viewport,'wheel',event=>{
    if(!event.ctrlKey&&!event.metaKey)return;
    event.preventDefault();setZoom(clamp(currentZoom()*Math.exp(-event.deltaY*0.01),0.25,4));
  },{passive:false});
  listen(viewport,'scroll',updatePage,{passive:true});
  listen(viewport,'dblclick',event=>{
    const canvas=event.target.closest?.('canvas[data-page]');if(!canvas)return;
    const box=canvas.getBoundingClientRect();
    options.onPreviewPick?.({page:Number(canvas.dataset.page),x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height});
  });
  for(const splitter of root.querySelectorAll('.splitter')){
    listen(splitter,'pointerdown',event=>{
      event.preventDefault();app.classList.add('dragging');
      const bounds=$('main').getBoundingClientRect(),sidebar=splitter.dataset.split==='sidebar';
      const move=moved=>{
        const left=sidebar?bounds.left:root.querySelector('.editor-pane').getBoundingClientRect().left;
        if(sidebar)settings.sidebar=clamp(moved.clientX-left,160,420);else settings.split=clamp((moved.clientX-left)/(bounds.right-left),0.2,0.8);
        applyLayout();if(settings.zoom==='fit')layoutPages();popover?.place();
      };
      const up=()=>{window.removeEventListener('pointermove',move);app.classList.remove('dragging');saveSettings(settings);};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true});
    });
    listen(splitter,'dblclick',()=>{const key=splitter.dataset.split==='sidebar'?'sidebar':'split';set(key,DEFAULT_SETTINGS[key]);layoutPages();});
  }
  listen(document,'pointerdown',event=>{
    if(!$('settings').hidden&&!$('settings').contains(event.target)&&!action('settings').contains(event.target))toggleSettings(false);
    if(drawer&&narrowQuery?.matches&&!event.target.closest?.('.sidebar,.menu,.dialog-backdrop,[data-action="toggle-sidebar"]'))toggleSidebar(false);
  },true);
  listen(root,'keydown',event=>{
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    if(mod&&key==='enter'){event.preventDefault();compile();}
    else if(mod&&key==='s'){event.preventDefault();void flush();}
    else if(mod&&key==='b'&&!event.shiftKey&&!event.altKey){event.preventDefault();toggleSidebar();}
    else if(mod&&key==='j'){event.preventDefault();set('panel',!settings.panel);}
    else if(mod&&key===','){event.preventDefault();toggleSettings();}
    else if(key==='escape'&&!event.defaultPrevented){
      if(!$('settings').hidden){event.preventDefault();toggleSettings(false);action('settings').focus();}
      else if(state.compiling){event.preventDefault();cancel();}
    }
  });
  // Files dragged from the desktop land in the project; the tree handles drops onto a folder itself.
  let dragDepth=0;const external=event=>[...(event.dataTransfer?.types||[])].includes('Files');
  listen(root,'dragenter',event=>{if(external(event)){dragDepth++;$('drop-veil').hidden=!!event.target.closest?.('.tree');}});
  listen(root,'dragover',event=>{if(external(event)){event.preventDefault();$('drop-veil').hidden=!!event.target.closest?.('.tree');}});
  listen(root,'dragleave',event=>{if(external(event)&&--dragDepth<=0){dragDepth=0;$('drop-veil').hidden=true;}});
  listen(root,'drop',event=>{dragDepth=0;$('drop-veil').hidden=true;if(!external(event))return;event.preventDefault();void upload(event.dataTransfer.files,'');});
  listen(window,'beforeunload',event=>{if(state.save==='saving')void flush();else if(state.dirty&&state.save!=='saved'){event.preventDefault();event.returnValue='';}});
  listen(window,'pagehide',()=>{if(saveTimer)void flush();});
  const themeChanged=()=>applyAppearance();darkQuery?.addEventListener?.('change',themeChanged);removers.push(()=>darkQuery?.removeEventListener?.('change',themeChanged));
  narrowQuery?.addEventListener?.('change',applyLayout);removers.push(()=>narrowQuery?.removeEventListener?.('change',applyLayout));
  if(globalThis.ResizeObserver){
    let width=0;const observer=new ResizeObserver(()=>{
      if(Math.abs(viewport.clientWidth-width)<2)return;
      width=viewport.clientWidth;popover?.place();
      if(settings.zoom==='fit'&&pages().length){layoutPages();clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,260);}
    });
    observer.observe(viewport);removers.push(()=>observer.disconnect());
  }

  const api={
    compile,cancel,setPdf,log,reveal,openFile,upload,project,
    /** Resolves once a stored project (if any) is loaded. */
    ready:null,
    /** Replace the main file's text. */
    setSource(source){project.write(project.main||'main.tex',String(source));if(!active&&project.main)openFile(project.main);},
    getSource:mainText,
    getState:()=>({source:mainText(),root:project.main,revision:state.revision,filesRev:state.filesRev,ready:state.engine==='ready',compiling:state.compiling,pdfRevision:state.pdfRevision,previewRevision:state.previewRevision,
      filename:project.main,active,zoom:settings.zoom}),
    getSettings:()=>({...settings}),
    setLivePages({canvases,revision,durationMs}){
      if(state.destroyed||revision!==state.revision)return false;
      const targets=[...canvases].map(([page,canvas])=>[viewport.querySelector(`[data-page="${page}"]`),canvas]);
      if(targets.some(([target])=>!target))return false;
      for(const [target,canvas] of targets){for(const key of Object.keys(target.dataset))canvas.dataset[key]=target.dataset[key];canvas.style.cssText=target.style.cssText;canvas.setAttribute('aria-label',target.getAttribute('aria-label'));target.replaceWith(canvas);}
      state.previewRevision=revision;
      if(Number.isFinite(durationMs)&&canvases.size)api.setLiveStatus({state:'live',ms:durationMs,revision});
      updateStatus();return true;
    },
    setEngineStatus({status='loading',progress}={}){
      state.engine=status;state.progress=Number.isFinite(progress)?clamp(progress,0,1):null;
      updateControls();updateEngine();
    },
    setError(error,{quiet=false}={}){
      log(error?.message??String(error),quiet?'warning':'error');state.failed=true;updateStatus();updateEngine();
      if(quiet)return;
      panelAuto=!settings.panel;openPanel(state.problems.length?'problems':'log');
      toast(t(state.pdf?'toast.kept':'toast.failed'));
    },
    /** [{severity, message, file, line}] from the last compile; replaces the previous list. */
    setProblems(problems){state.problems=Array.isArray(problems)?problems.slice(0,200):[];renderProblems();},
    /** {state:'live'|'full'|'waiting'|'off'|'ready', ms?, reason?, revision?} */
    setLiveStatus({state:mode='ready',ms,reason,revision}={}){if(revision!==undefined&&revision!==state.revision)return;state.live={state:mode,ms,reason};updateLive();},
    /** Where the caret's text sits in the preview: {page, top, bottom} as fractions of the page, or null. */
    setMarker(position,{scroll=true}={}){state.marker=position||null;placeMarker(scroll);},
    refreshMath:updateMath,
    clearLogs(){state.logs=[];$('logs').textContent='';},
    destroy(){
      state.destroyed=true;state.run++;pdfSequence++;
      for(const timer of [compileTimer,busyTimer,zoomTimer,saveTimer])clearTimeout(timer);
      toaster.hide();rendererAbort?.abort();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
      for(const path of [...views.keys()])dropView(path);
      popover?.destroy();removers.forEach(remove=>remove());root.replaceChildren();
    },
  };

  // ---- start ------------------------------------------------------------------------------------
  function initialProject(){
    if(options.project)return options.project;
    if(typeof options.source==='string')return {files:[{path:'main.tex',text:options.source}]};
    // A draft kept by the previous single-file version becomes the first project.
    try{
      const draft=JSON.parse(localStorage.getItem(LEGACY_DRAFT)||'null');
      localStorage.removeItem(LEGACY_DRAFT);localStorage.removeItem(LEGACY_CONSENT);
      if(typeof draft?.source==='string')return {files:[{path:'main.tex',text:draft.source}]};
    }catch{/* no usable draft */}
    return templateProject(TEMPLATES[0]);
  }
  function start(saved){
    if(state.destroyed)return;
    restoring=true;
    project.load(saved?.files?.length?saved:initialProject());
    const wanted=(saved?.tabs||[]).filter(path=>project.has(path));
    tabs=wanted.length?wanted:project.main?[project.main]:project.paths().slice(0,1);
    restoring=false;
    activate(tabs.includes(saved?.active)?saved.active:tabs[0]??null);
    state.loaded=true;state.save=store&&settings.persist?'saved':'off';
    if(!saved?.files?.length)queueSave({type:'load'});
    updateControls();updateEngine();updateSave();
  }
  applyAppearance();applyLayout();i18n.apply(root);renderSettings();renderPanel();renderProblems();updateControls();updateEngine();updateZoomLabel();updateSave();
  $('auto-compile').checked=settings.autoCompile;
  if(options.store===undefined&&!globalThis.indexedDB||options.store===null){start(null);api.ready=Promise.resolve();}
  else api.ready=(async()=>{
    try{store=options.store??await openStore();}catch{store=null;}
    let saved=null;
    if(store&&settings.persist)try{saved=await store.load();}catch{saved=null;}
    start(saved);
  })();
  return api;
}
