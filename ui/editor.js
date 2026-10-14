/** Dependency-free workspace UI. Source, file names, logs and engine messages are inserted as text. */
import {icon} from './icons.js';
import {createI18n} from './i18n.js';
import {DEFAULT_SETTINGS,loadSettings,saveSettings} from './settings.js';
import {createProject,basename,dirname,joinPath,isImagePath,decodeText,fileBytes,normalizePath} from './project.js';
import {openStore} from './storage.js';
import {TEMPLATES,templateProject} from './templates.js';
import {createCodeEditor} from './code-editor.js';
import {createMathPopover} from './math-popover.js';
import {createFileTree} from './file-tree.js';
import {openMenu,openDialog,confirmDialog,createToast} from './overlays.js';
import {createTooltips} from './tooltip.js';
import {mathAt} from '../core/math-preview.js';
import {zip,unzip} from '../core/zip.js';
import {documentTitle,parseOutline} from '../core/outline.js';
import {wordCount} from '../core/word-count.js';
import {createOutline} from './outline.js';
import {createFindBar} from './find-bar.js';
import {openPalette} from './palette.js';
import {openTemplateGallery} from './template-gallery.js';
import {createCompletion} from './complete.js';
import {openSymbols} from './symbols.js';
import {openHistory} from './history.js';

const LEGACY_DRAFT='realtime-tex-web:draft:v1',LEGACY_CONSENT='realtime-tex-web:save-draft:v1';
const MAX_UPLOAD=20*1024*1024,ZOOMS=[0.5,0.67,0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.5,3];
const ACCENTS={bolt:'#f5b800',indigo:'#6366f1',teal:'#0d9488',rose:'#e5487d'};
const mac=/Mac|iPhone|iPad/.test(globalThis.navigator?.platform||globalThis.navigator?.userAgent||'');
const keys=combo=>mac?combo.replace('Mod+','⌘').replace('Shift+','⇧').replace('Enter','↵'):combo.replace('Mod+','Ctrl+');
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));

// Stand-in page shown until there is a PDF: skeleton while working, blank for an empty document.
const SHEET='<div class="preview-content"><div class="sheet" data-id="sheet" data-state="loading"><div class="sheet-lines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="load-steps" data-id="load-steps"></div><div class="sheet-note" data-id="sheet-note"></div><button type="button" class="btn" data-action="show-problems" data-i18n="preview.show" hidden></button></div></div>';
const shell=()=>`<div class="app">
  <div class="load-bar" data-id="load-bar"><i></i></div>
  <header class="appbar">
    <div class="appbar-side">
      <button type="button" class="icon-btn" data-action="toggle-sidebar" data-i18n-title="sidebar.toggle" data-keys="${keys('Mod+B')}">${icon('sidebar')}</button>
      <span class="brand"><span class="brand-mark">${icon('bolt',14)}</span><b>Lightning<span class="tex">T<i>E</i>X</span></b></span>
      <button type="button" class="project-btn" data-action="project-menu" data-i18n-title="project.menu" aria-haspopup="menu"><span data-id="project-name"></span>${icon('chevronDown',12)}</button>
      <button type="button" class="icon-btn" data-action="palette" data-i18n-title="palette.open" data-keys="${keys('Mod+K')}">${icon('search')}</button>
    </div>
    <div class="segmented layout" data-id="layout" role="radiogroup" data-i18n-title="layout.label" data-keys="${keys('Mod+\\')}"><i class="seg-thumb"></i>${['source','split','preview'].map(value=>`<button type="button" role="radio" data-value="${value}" data-i18n="view.${value}"></button>`).join('')}</div>
    <div class="appbar-side end">
      <div class="capsule" data-id="preview-status" data-state="none">
        <button type="button" class="cap-state" data-action="capsule" disabled data-i18n-title="compile.now" data-keys="${keys('Mod+Enter')}"><i class="dot"></i><span data-id="preview-status-text"></span><span class="cap-live" data-id="stat-live"></span><span class="cap-bars" data-id="cap-bars" aria-hidden="true">${'<i></i>'.repeat(12)}</span></button>
        <button type="button" class="btn primary cap-compile" data-action="compile" disabled data-i18n-title="compile.run" data-keys="${keys('Mod+Enter')}">${icon('play',14)}<span data-i18n="compile.run"></span></button>
        <button type="button" class="icon-btn cap-stop" data-action="cancel" hidden data-i18n-title="compile.stop">${icon('stop',14)}</button>
        <button type="button" class="icon-btn cap-more" data-action="capsule-menu" data-i18n-title="capsule.menu" aria-haspopup="menu">${icon('chevronDown',12)}</button>
        <input type="checkbox" class="sr-only" data-id="auto-compile" tabindex="-1" aria-hidden="true">
      </div>
      <button type="button" class="btn export-btn" data-action="export-menu" data-i18n-title="export.open" aria-haspopup="menu">${icon('download')}<span data-i18n="export.open"></span>${icon('chevronDown',12)}</button>
      <button type="button" class="icon-btn" data-action="settings" data-i18n-title="settings.open" data-keys="${keys('Mod+,')}">${icon('settings')}</button>
    </div>
  </header>
  <div class="main" data-id="main">
    <aside class="sidebar" data-id="sidebar"><div class="sidebar-in">
      <div class="side-head"><span class="side-title" data-i18n="app.files"></span>
        <button type="button" class="icon-btn" data-action="new-file" data-i18n-title="file.new">${icon('fileAdd')}</button>
        <button type="button" class="icon-btn" data-action="new-folder" data-i18n-title="folder.new">${icon('folderAdd')}</button>
        <button type="button" class="icon-btn" data-action="upload" data-i18n-title="file.upload">${icon('upload')}</button>
      </div>
      <div class="tree" data-id="tree" role="tree"></div>
      <div class="tree-empty" data-id="tree-empty" hidden><strong data-i18n="empty.files"></strong><p data-i18n="empty.hint"></p><button class="btn" data-action="empty-new" data-i18n="file.new"></button><button class="btn" data-action="new-project" data-i18n="project.template"></button><button class="text-btn" data-action="empty-import" data-i18n="project.import"></button></div>
      <div class="side-head outline-head"><span class="side-title" data-i18n="outline.title"></span></div><nav class="outline" data-id="outline" data-i18n-title="outline.title"></nav>
      <div class="side-foot"><button class="text-btn" data-action="history" data-i18n-title="history.open">${icon('history',14)}<span data-i18n="history.open"></span></button></div>
      <input data-id="file-input" type="file" multiple hidden><input data-id="zip-input" type="file" accept=".zip,application/zip" hidden>
    </div></aside>
    <div class="splitter" data-split="sidebar" role="separator" aria-orientation="vertical" tabindex="0" data-i18n-title="splitter.help"></div>
    <section class="editor-pane">
      <header class="pane-head"><div class="tabs" data-id="tabs" role="tablist"></div></header>
      <span class="sr-only" id="editor-keyboard-help" data-i18n="editor.help"></span>
      <div class="editor-host" data-id="editor-host"><div class="editor-empty" data-id="editor-empty" hidden>${icon('file',28)}<span data-i18n="editor.empty"></span><button class="btn" data-action="editor-new" data-i18n="file.new"></button><button class="text-btn" data-action="editor-palette"><span data-i18n="palette.open"></span><kbd>${keys('Mod+K')}</kbd></button></div></div>
      <section class="panel" data-id="panel" hidden>
        <header class="panel-head">
          <button type="button" class="panel-tab" data-panel="problems"><span data-i18n="panel.problems"></span><span class="count" data-id="problem-count"></span></button>
          <button type="button" class="panel-tab" data-panel="log" data-i18n="panel.log"></button>
          <span class="spacer"></span>
          <button type="button" class="icon-btn" data-action="problem-filter" data-i18n-title="panel.filter">${icon('filter')}</button>
          <button type="button" class="icon-btn" data-action="copy-log" data-i18n-title="panel.copy">${icon('copy')}</button>
          <button type="button" class="icon-btn" data-action="clear-log" data-i18n-title="common.clear">${icon('trash')}</button>
          <button type="button" class="icon-btn" data-action="close-panel" data-i18n-title="common.close">${icon('close')}</button>
        </header>
        <div class="problems" data-id="problems"></div>
        <pre class="logs" data-id="logs" tabindex="0" hidden></pre>
      </section>
    </section>
    <div class="splitter" data-split="preview" role="separator" aria-orientation="vertical" tabindex="0" data-i18n-title="splitter.help"></div>
    <section class="preview-pane">
      <button type="button" class="preview-error" data-id="preview-error" hidden></button>
      <div class="preview" data-id="preview-viewport" tabindex="0" data-i18n-title="preview.locate">${SHEET}</div>
      <div class="zoombar" data-id="zoombar">
        <button type="button" class="icon-btn" data-action="zoom-out" data-i18n-title="zoom.out">${icon('minus')}</button>
        <button type="button" class="zoom-label" data-action="zoom-menu" data-id="zoom-label" data-i18n-title="zoom.menu" aria-haspopup="menu"></button>
        <button type="button" class="icon-btn" data-action="zoom-in" data-i18n-title="zoom.in">${icon('plus')}</button>
        <button type="button" class="icon-btn" data-action="zoom-fit" data-i18n-title="zoom.fit">${icon('fit')}</button>
        <label class="page-nav" data-id="page-nav" hidden><input class="page-input" data-id="page-input" type="text" inputmode="numeric" autocomplete="off" data-i18n-title="page.jump"><span data-id="page-indicator"></span></label>
      </div>
    </section>
  </div>
  <footer class="statusbar">
    <button type="button" class="stat" data-action="toggle-panel" data-id="stat-problems" data-i18n-title="panel.toggle" data-keys="${keys('Mod+J')}"></button>
    <span class="stat" data-id="stat-engine"></span>
    <span class="spacer"></span>
    <button type="button" class="stat" data-action="word-count" data-id="word-count" data-i18n-title="words.title"></button><span class="stat" data-id="stat-doc"></span><span class="stat" data-id="cursor-status"></span><span class="stat" data-id="save-status"></span>
  </footer>
  <div class="settings" data-id="settings" role="dialog" hidden></div>
  <div class="toast" data-id="toast" role="status" hidden></div>
  <div class="drop-veil" data-id="drop-veil" hidden>${icon('upload',28)}</div>
</div>`;

// [label key, combo]; "Mod" is Command or Control.
const EDITOR_SHORTCUTS=[['keys.comment','Mod+/'],['keys.indent','Tab / Shift+Tab'],['keys.escape','Esc']];

// [section, [key, kind, values?]…] — every row edits one setting and applies at once.
const SETTINGS=[
  ['set.appearance',[['theme','choice',['system','light','dark']],['accent','swatch',Object.keys(ACCENTS)],['lang','choice',['auto','en','zh']],['darkPages','toggle']]],
  ['set.editor',[['fontSize','step',[11,20]],['wrap','toggle'],['autoClose','toggle'],['tabSize','choice',[2,4]],['spellcheck','toggle']]],
  ['set.preview',[['autoCompile','toggle'],['mathPreview','toggle'],['mathScale','choice',['s','m','l']],['follow','toggle']]],
  ['set.storage',[['persist','toggle']]],
];
const choiceLabel={lang:{en:'English',zh:'中文',auto:'set.lang.auto'},theme:value=>'set.theme.'+value,mathScale:value=>'size.'+value};

/**
 * mountEditor({ root, source?, project?, store?, onCompile, onPreview?, onCancel?, onSourceChange?, renderPdf?,
 *   typesetMath?, onCursor?, onPreviewPick?, previewIntervalMs? })
 * onCompile({source, root, files, filesRev, revision, reason}) may return {pdf:Uint8Array, revision?, durationMs?},
 *   or {empty:true} for a document without pages; files are the project's other files as {path, data, rev}.
 *   Never return a fake PDF.
 * onPreview(request) uses the same input, returning true, 'reflow' (settle after idle), or false (full pass).
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
    compiling:false,previewing:false,busy:false,pdf:null,meta:null,run:0,logs:[],problems:[],problemFilter:'all',failed:false,live:null,latency:[],marker:null,dirty:false,save:'off',destroyed:false};
  const views=new Map(),removers=[];
  let structure={headings:[],labels:[],paths:[]},wordTotal=0,wordSections=[],historyId=globalThis.crypto.randomUUID();
  let tabs=[],active=null,compileTimer,settleTimer,busyTimer,zoomTimer,saveTimer,metaTimer,barTimer,hoverFrame,hoverPoint,rendererAbort,pdfSequence=0,previewRun=0,store=null,saving=false,restoring=false,storageWarned=false;
  let pending=emptyPending(),panelAuto=false;
  root.innerHTML=shell();
  const app=root.firstElementChild;
  const $=id=>root.querySelector(`[data-id="${id}"]`);
  const action=name=>root.querySelector(`[data-action="${name}"]`);
  const listen=(element,type,handler,config)=>{element.addEventListener(type,handler,config);removers.push(()=>element.removeEventListener(type,handler,config));};
  const viewport=$('preview-viewport'),marker=Object.assign(document.createElement('div'),{className:'sync-marker'});
  const toaster=createToast($('toast')),toast=(text,undo)=>toaster.show(text,undo),tips=createTooltips(app);
  const notify=(key,values)=>toast(t(key,values));
  const download=(data,name,type)=>{const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const mainText=()=>project.get(project.main)?.text??'';
  const outline=createOutline($('outline'),t,reveal);
  const activeEditor=()=>views.get(active)?.editor;
  const focusEditor=()=>activeEditor()?.focus();
  function commands(){return [
    {label:'palette.open',key:'Mod+K',icon:'search',run:palette},
    {label:'find.open',key:'Mod+F',icon:'search',run:()=>views.get(active)?.find?.open(),disabled:!activeEditor()},
    {label:'find.replaceOpen',key:'Mod+Shift+H',icon:'edit',run:()=>views.get(active)?.find?.open(true),disabled:!activeEditor()},
    {label:'compile.run',key:'Mod+Enter',icon:'play',run:()=>compile(),disabled:state.engine!=='ready'},
    {label:'keys.save',key:'Mod+S',icon:'check',run:()=>void flush()},
    {label:'sidebar.toggle',key:'Mod+B',icon:'sidebar',run:()=>toggleSidebar()},
    {label:'panel.toggle',key:'Mod+J',icon:'warning',run:()=>set('panel',!settings.panel)},
    {label:'layout.label',key:'Mod+\\',icon:'sidebar',run:()=>{const order=['split','source','preview'];setLayout(order[(order.indexOf(shownLayout())+1)%3]);}},
    {label:'settings.open',key:'Mod+,',icon:'settings',run:()=>toggleSettings()},
    {label:'project.new',icon:'template',run:()=>templateGallery()},
    {label:'project.import',icon:'upload',run:()=>$('zip-input').click()},
    {label:'export.open',icon:'download',run:exportMenu},
    {label:'compile.auto',icon:'bolt',run:()=>set('autoCompile',!settings.autoCompile)},
    {label:'outline.title',icon:'outline',run:()=>{toggleSidebar(true);$('outline').querySelector('button')?.focus();}},
    {label:'words.title',icon:'hash',run:wordDetails},
    {label:'symbols.open',icon:'sigma',run:symbols,disabled:!activeEditor()},
    {label:'history.open',icon:'history',run:history},
    {label:'keys.title',icon:'keyboard',run:shortcutSheet},
    ...['source','split','preview'].map(value=>({label:'view.'+value,icon:'sidebar',run:()=>setLayout(value)})),
    ...['system','light','dark'].map(value=>({label:'set.theme.'+value,icon:'settings',run:()=>set('theme',value)})),
  ];}
  function palette(){
    popover?.hide();updateProject();
    openPalette({host:app,t,onClose:focusEditor,items:(prefix,term)=>{
      if(prefix===':')return /^\d+$/.test(term)&&active?[{label:t('palette.line',{n:term}),icon:'hash',run:()=>reveal({path:active,line:Number(term)})}]:[];
      if(prefix==='@')return [...structure.headings.map(h=>({label:h.title,detail:`${h.file}:${h.line}`,icon:'outline',run:()=>reveal({path:h.file,line:h.line})})),...structure.labels.map(l=>({label:l.name,detail:`${l.file}:${l.line}`,icon:'hash',run:()=>reveal({path:l.file,line:l.line})}))];
      const actions=commands().filter(c=>c.label!=='palette.open').map(c=>({...c,label:t(c.label),hint:c.key?keys(c.key):''}));
      return prefix==='>'?actions:[...project.paths().map(path=>({label:path,icon:isImagePath(path)?'image':'file',run:()=>openFile(path,{focus:true})})),...actions];
    }});
  }

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
  const placeThumb=control=>{
    const thumb=control.querySelector('.seg-thumb'),on=control.querySelector('[aria-checked="true"]');
    if(thumb){thumb.style.width=(on?.offsetWidth||0)+'px';thumb.style.transform=`translateX(${on?.offsetLeft||0}px)`;}
  };
  const shownLayout=()=>narrowQuery?.matches?(app.dataset.view==='preview'?'preview':'source'):settings.layout;
  function applyLayout(){
    app.style.setProperty('--sidebar-w',settings.sidebar+'px');app.style.setProperty('--split',String(settings.split));
    app.dataset.sidebar=sidebarOpen()?'open':'closed';app.dataset.layout=settings.layout;
    for(const button of $('layout').querySelectorAll('button'))button.setAttribute('aria-checked',String(button.dataset.value===shownLayout()));
    placeThumb($('layout'));
  }
  /** 'source' | 'split' | 'preview'. A narrow screen shows one pane at a time and does not keep the choice. */
  function setLayout(value){
    if(narrowQuery?.matches){app.dataset.view=value==='preview'?'preview':'source';applyLayout();}else set('layout',value);
    layoutPages();popover?.place();placeTabs();
  }
  function set(key,value){
    if(settings[key]===value)return;
    settings[key]=value;saveSettings(settings);
    if(key==='theme'||key==='accent'||key==='darkPages')applyAppearance();
    else if(key==='lang'){i18n.set(value);applyAppearance();refreshText();}
    else if(key==='sidebar'||key==='split'||key==='sidebarOpen'||key==='layout')applyLayout();
    else if(['fontSize','wrap','autoClose','tabSize','spellcheck'].includes(key)){for(const view of views.values())view.editor?.configure(settings);popover?.place();}
    else if(key==='autoCompile'){$('auto-compile').checked=value;$('preview-status').dataset.auto=String(value);clearTimeout(compileTimer);clearTimeout(settleTimer);compileTimer=null;if(value&&state.pdfRevision!==state.revision)scheduleCompile();}
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
        if(kind==='choice'||kind==='swatch'){control.setAttribute('role','radiogroup');control.setAttribute('aria-label',t('set.'+key));control.append(Object.assign(document.createElement('i'),{className:'seg-thumb'}));}
        if(kind==='toggle'){
          const box=Object.assign(document.createElement('input'),{type:'checkbox'});box.setAttribute('aria-label',t('set.'+key));if(key==='persist')box.dataset.id='persist';
          box.addEventListener('change',()=>set(key,box.checked));control.append(box,document.createElement('i'));
        }else if(kind==='step'){
          for(const delta of [-1,1]){
            const button=Object.assign(document.createElement('button'),{type:'button',className:'icon-btn',innerHTML:icon(delta<0?'minus':'plus',14)});
            button.setAttribute('aria-label',t(delta<0?'set.decrease':'set.increase'));
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
    const reset=Object.assign(document.createElement('button'),{type:'button',className:'btn',textContent:t('set.reset')}),shortcuts=Object.assign(document.createElement('button'),{type:'button',className:'btn',innerHTML:icon('keyboard')});
    shortcuts.append(t('keys.title'));shortcuts.addEventListener('click',()=>{toggleSettings(false);shortcutSheet();});
    reset.addEventListener('click',()=>{for(const key of Object.keys(DEFAULT_SETTINGS))if(!['sidebarOpen','panel','panelTab','persist'].includes(key))set(key,DEFAULT_SETTINGS[key]);layoutPages();});
    const foot=Object.assign(document.createElement('div'),{className:'settings-foot'});foot.append(shortcuts,reset);panel.append(foot);syncSettings();
  }
  function syncSettings(){
    for(const control of $('settings').querySelectorAll('[data-setting]')){
      const value=settings[control.dataset.setting],box=control.querySelector('input'),output=control.querySelector('output');
      if(box)box.checked=!!value;else if(output)output.textContent=String(value);
      else{for(const button of control.querySelectorAll('button'))button.setAttribute('aria-checked',String(button.dataset.value===String(value)));placeThumb(control);}
    }
  }
  function toggleSettings(show=$('settings').hidden){
    const panel=$('settings');panel.hidden=!show;action('settings').setAttribute('aria-expanded',String(show));
    if(show)panel.querySelector('button,input')?.focus({preventScroll:true});
  }
  function shortcutSheet(){
    const list=Object.assign(document.createElement('dl'),{className:'keys'});
    for(const [label,combo] of [...commands().filter(c=>c.key).map(c=>[c.label,c.key]),...EDITOR_SHORTCUTS]){
      const cell=document.createElement('dd');
      for(const part of combo.split(' / '))cell.append(Object.assign(document.createElement('kbd'),{textContent:keys(part)}));
      list.append(Object.assign(document.createElement('dt'),{textContent:t(label)}),cell);
    }
    openDialog(app,{title:t('keys.title'),content:list});
  }

  // ---- status -----------------------------------------------------------------------------------
  function updateStatus(){
    const shown=state.previewRevision>=0,stale=shown&&state.previewRevision!==state.revision,name=state.busy?'busy':!shown?'none':stale?'stale':state.previewRevision!==state.pdfRevision?'live':'ok';
    const capsule=$('preview-status');capsule.dataset.state=name;capsule.dataset.failed=String(state.failed);$('preview-status-text').textContent=t('status.'+name);
    const error=state.problems.find(problem=>problem.severity==='error'),banner=$('preview-error');banner.hidden=!state.failed;
    banner.textContent=t(state.pdf?'toast.kept':'toast.failed')+(error?' '+[error.file,error.line].filter(Boolean).join(':')+' · '+error.message:'');
  }
  function updateControls(){
    const run=action('compile'),stop=action('cancel'),idle=state.engine!=='ready'||!state.loaded||!project.main;
    run.disabled=idle||state.compiling;run.hidden=state.busy;stop.hidden=!state.busy;action('capsule').disabled=idle;
    action('capsule').setAttribute('aria-label',t(state.compiling?'compile.stop':'compile.now'));action('capsule').dataset.tip=t(state.compiling?'compile.stop':'compile.now');
    updateStatus();
  }
  function updateEngine(){
    const loading=state.engine==='loading',failed=state.engine==='error',percent=Number.isFinite(state.progress)?Math.round(state.progress*100):null;
    const text=loading?t('engine.loading')+(percent==null?'…':` ${percent}%`):failed?t('engine.error'):!project.main&&state.loaded?t('engine.nomain'):'';
    $('stat-engine').textContent=text;$('stat-engine').dataset.state=failed?'error':'';
    const bar=$('load-bar');bar.hidden=!loading;bar.dataset.mode=percent==null?'indeterminate':'determinate';bar.firstChild.style.width=percent==null?'':percent+'%';
    const sheet=$('sheet');
    if(sheet){
      sheet.dataset.state=loading||state.busy?'loading':state.failed||failed?'failed':!state.pdf&&state.pdfRevision>=0?'empty':'idle';
      $('sheet-note').textContent=text||(state.failed?t('preview.failed'):'');action('show-problems').hidden=!state.failed;
    }
  }
  function updateLive(){
    const live=state.live,el=$('stat-live');
    el.textContent=!live?'':live.state==='live'||live.state==='reflow'?t(live.state==='reflow'?'live.reflow':'live.ms',{ms:live.ms<10?live.ms.toFixed(1):Math.round(live.ms)}):live.state==='full'?t('live.full'):live.state==='waiting'?t('live.wait'):live.state==='off'?t('live.off'):'';
    el.dataset.state=live?.state||'';$('preview-status').dataset.live=live?.state||'';
    // Why a local update fell back says more than the capsule's generic label.
    action('capsule').dataset.tip=live?.reason?String(live.reason):t('compile.now');
    const bars=$('cap-bars').children,offset=bars.length-state.latency.length;
    for(let i=0;i<bars.length;i++)bars[i].style.setProperty('--h',String(i<offset?0.12:clamp(state.latency[i-offset]/24,0.12,1)));
  }
  function updateSave(){$('save-status').textContent=t('save.'+state.save);$('save-status').dataset.state=state.save;}
  function updateDoc(){
    const meta=state.meta;
    $('stat-doc').textContent=!meta?'':[meta.pages?(meta.pages===1?t('page'):t('pages',{n:meta.pages})):null,`${(state.pdf.byteLength/1024).toFixed(1)} KB`,Number.isFinite(meta.durationMs)?`${(meta.durationMs/1000).toFixed(2)} s`:null].filter(Boolean).join(' · ');
  }
  function updateProject(){
    $('project-name').textContent=documentTitle(mainText())||(project.main?basename(project.main):t('project.untitled'));
    const files=new Map(project.files().filter(file=>typeof file.text==='string').map(file=>[file.path,file.text]));structure=parseOutline(files,project.main);
    outline.update(structure.headings,state.problems);outline.cursor(active,views.get(active)?.position?.line||1);
    wordTotal=structure.paths.reduce((n,path)=>n+wordCount(files.get(path)||''),0);
    wordSections=structure.headings.map((h,i)=>({heading:h,n:wordCount((files.get(h.file)||'').slice(h.offset,structure.headings.slice(i+1).find(next=>next.file===h.file)?.offset))}));
    $('tree-empty').hidden=project.paths().length>0;$('tree').hidden=!project.paths().length;updateWords();
  }
  function updateWords(){const editor=activeEditor(),selected=editor&&editor.input.selectionStart!==editor.input.selectionEnd;const n=selected?wordCount(editor.getValue().slice(editor.input.selectionStart,editor.input.selectionEnd)):wordTotal;$('word-count').textContent=t(selected?'words.selection':'words.count',{n:n.toLocaleString()});}
  function wordDetails(){
    const body=document.createElement('div');body.className='word-details';
    body.append(Object.assign(document.createElement('p'),{textContent:t('words.note')}));
    for(const {heading,n} of wordSections){const row=document.createElement('button');row.className='word-row';row.innerHTML='<span></span><b></b>';row.firstChild.textContent=[heading.number,heading.title].filter(Boolean).join(' ');row.lastChild.textContent=String(n);row.onclick=()=>{dialog.close();reveal({path:heading.file,line:heading.line});};body.append(row);}
    if(!wordSections.length)body.append(Object.assign(document.createElement('p'),{textContent:t('words.count',{n:wordTotal})}));
    const dialog=openDialog(app,{title:t('words.title'),content:body});
  }
  function refreshText(){
    i18n.apply(root);renderSettings();renderTabs();tree.render();renderProblems();updateControls();updateEngine();updateLive();updateSave();updateDoc();updateZoomLabel();updateProject();applyLayout();
    $('cursor-status').textContent=views.get(active)?.position?t('cursor',views.get(active).position):'';
    for(const view of views.values())if(view.editor){view.editor.input.setAttribute('aria-label',t('editor.label'));view.find.destroy();view.find=createFindBar(view.editor,t);view.complete?.hide();}
    for(const [i,row] of [...($('load-steps')?.children||[])].entries())row.firstChild.textContent=t('load.'+i);
  }

  // ---- panel: problems and log ------------------------------------------------------------------
  function renderPanel(){
    const panel=$('panel');panel.hidden=!settings.panel;
    for(const tab of panel.querySelectorAll('.panel-tab'))tab.setAttribute('aria-selected',String(tab.dataset.panel===settings.panelTab));
    $('problems').hidden=settings.panelTab!=='problems';$('logs').hidden=settings.panelTab!=='log';action('clear-log').hidden=settings.panelTab!=='log';
    action('copy-log').hidden=settings.panelTab!=='log';action('problem-filter').hidden=settings.panelTab!=='problems';panel.inert=!settings.panel;
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
      if(state.problemFilter!=='all'&&state.problemFilter!==problem.severity)continue;
      const row=Object.assign(document.createElement('button'),{type:'button',className:'problem'});row.dataset.severity=problem.severity;
      row.innerHTML=`${icon(problem.severity==='error'?'error':problem.severity==='warning'?'warning':'info',14)}<span class="problem-text"></span><span class="problem-where"></span>`;
      row.children[1].textContent=problem.message;row.children[2].textContent=[problem.file,problem.line].filter(value=>value!=null).join(':');
      row.disabled=!problem.file||!project.has(problem.file);
      row.addEventListener('click',()=>reveal({path:problem.file,line:problem.line??1}));
      list.append(row);
    }
    if(!list.children.length)list.append(Object.assign(document.createElement('div'),{className:'panel-empty',textContent:t('panel.none')}));
    $('problem-count').textContent=state.problems.length?String(state.problems.length):'';
    const stat=$('stat-problems');stat.innerHTML=`${icon('error',13)}<span></span>${icon('warning',13)}<span></span>`;
    stat.children[1].textContent=String(counts.error);stat.children[3].textContent=String(counts.warning);stat.dataset.state=counts.error?'error':counts.warning?'warning':'';
    for(const [path,view] of views){
      if(!view.editor)continue;
      view.editor.setMarkers(marksByFile.get(path)||new Map());
      view.editor.setDiagnostics(state.problems.filter(problem=>problem.file===path));
    }
    outline.update(structure.headings,state.problems);outline.cursor(active,views.get(active)?.position?.line||1);
  }
  const log=(message,level='info')=>{
    state.logs.push(`${level==='error'?'ERROR · ':level==='warning'?'WARNING · ':''}${String(message)}`);if(state.logs.length>500)state.logs.shift();
    const el=$('logs'),pinned=el.scrollTop+el.clientHeight>=el.scrollHeight-8;el.replaceChildren();
    for(const line of state.logs){const row=document.createElement('span');row.className=/^ERROR/.test(line)?'log-error':/^WARNING/.test(line)?'log-warning':'';row.textContent=line+'\n';el.append(row);}if(pinned)el.scrollTop=el.scrollHeight;
  };

  // ---- editor views and tabs --------------------------------------------------------------------
  const isTex=path=>/\.(tex|ltx|sty|cls)$/i.test(path);
  function updateMath(){
    const view=views.get(active);
    if(!popover||!view?.editor)return;
    const editor=view.editor,input=editor.input;
    if(view.complete?.visible||!settings.mathPreview||!isTex(active)||input.selectionStart!==input.selectionEnd||document.activeElement!==input){popover.hide();return;}
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
          $('cursor-status').textContent=t('cursor',position);updateMath();outline.cursor(path,position.line);updateWords();
          options.onCursor?.({path,offset:position.offset,line:position.line,main:path===project.main});
        },
        onEscape:()=>{
          if(popover?.dismiss())return;
          if(state.compiling){cancel();return;}
          $('tabs').querySelector('[aria-selected="true"]')?.focus();
        }});
      view.editor.input.addEventListener('blur',()=>popover?.hide());
      view.find=createFindBar(view.editor,t);
      if(isTex(path))view.complete=createCompletion(view.editor,{t,context:()=>({files:new Map(project.files().map(f=>[f.path,f.text])),labels:structure.labels}),onVisible:visible=>{if(visible)popover?.hide();}});
      wireInsertion(view.editor,path);
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
  function dropView(path){const view=views.get(path);if(!view)return;view.complete?.destroy();view.find?.destroy();view.editor?.destroy();if(view.url)URL.revokeObjectURL(view.url);view.el.remove();views.delete(path);}
  function renderTabs(){
    const bar=$('tabs');bar.replaceChildren();
    for(const path of tabs){
      const tab=document.createElement('div');tab.className='tab';tab.draggable=true;tab.setAttribute('role','tab');tab.tabIndex=0;tab.dataset.path=path;tab.setAttribute('aria-selected',String(path===active));tab.dataset.tip=path;
      // Same-named files in different folders show their folder.
      const twin=tabs.some(other=>other!==path&&basename(other)===basename(path))&&dirname(path);
      tab.innerHTML=(path===project.main?`<span class="tab-main">${icon('target',12)}</span>`:'')+'<span class="tab-name"></span>'+(twin?'<span class="tab-dir"></span>':'')+`<button type="button" class="icon-btn tab-close" tabindex="-1">${icon('close',12)}</button>`;
      const name=tab.querySelector('.tab-name');name.textContent=basename(path);if(path===active)name.dataset.id='filename';
      if(twin)tab.querySelector('.tab-dir').textContent=twin;
      tab.lastChild.setAttribute('aria-label',t('tab.close'));
      bar.append(tab);
    }
    $('editor-empty').hidden=!!active;placeTabs();
  }
  // The active tab's indicator is one bar that slides; the tab list itself holds nothing but tabs.
  function placeTabs(){const bar=$('tabs'),on=bar.querySelector('[aria-selected="true"]');bar.style.setProperty('--ind-x',(on?.offsetLeft||0)+'px');bar.style.setProperty('--ind-w',(on?.offsetWidth||0)+'px');bar.dataset.left=String(bar.scrollLeft>2);bar.dataset.right=String(bar.scrollLeft+bar.clientWidth<bar.scrollWidth-2);}
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
    renderTabs();tree.setActive(path);updateWords();outline.cursor(path,views.get(path)?.position?.line||1);if(state.loaded)queueSave();
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
    if(settings.layout==='preview'&&!narrowQuery?.matches)set('layout','split');else applyLayout();
    const editor=views.get(path)?.editor;if(!editor)return;
    const at=offset??editor.offsetOf(line??1);editor.select(at);
    if(flash)editor.flash(editor.getValue().slice(0,at).split('\n').length);
  }

  // ---- compile and preview ----------------------------------------------------------------------
  const scheduleCompile=(delay=options.previewIntervalMs??60)=>{
    if(compileTimer||state.previewing||state.compiling&&!options.onPreview||!settings.autoCompile||state.destroyed)return;
    // A trailing debounce starves Full while typing. Keep one timer and read the latest source.
    compileTimer=setTimeout(()=>{compileTimer=null;void compile('auto');},delay);
  };
  const request=reason=>({source:mainText(),root:project.main,files:project.files().filter(file=>file.path!==project.main).map(file=>({path:file.path,data:file.text??file.data,rev:file.rev})),filesRev:state.filesRev,revision:state.revision,reason});
  async function preview(){
    if(state.previewing)return;
    clearTimeout(settleTimer);settleTimer=null;
    const run=++previewRun,job=request('auto');state.previewing=true;
    try{
      const result=await options.onPreview(job);
      if(run!==previewRun||state.destroyed||job.revision!==state.revision||!settings.autoCompile)return;
      if(result==='reflow')settleTimer=setTimeout(()=>{settleTimer=null;void compile('settle');},500);
      else if(!result)void compile('settle');
    }catch(error){if(run===previewRun&&job.revision===state.revision)api.setError(error,{quiet:true});}
    finally{if(run===previewRun){state.previewing=false;if(job.revision!==state.revision)scheduleCompile(0);}}
  }
  const finishRun=()=>{state.compiling=false;clearTimeout(busyTimer);state.busy=false;updateControls();updateEngine();};
  async function compile(reason='manual'){
    clearTimeout(compileTimer);compileTimer=null;
    if(state.engine!=='ready'||!state.loaded||state.destroyed||!project.main)return;
    if(reason==='auto'&&options.onPreview)return preview();
    if(state.compiling)return;
    clearTimeout(settleTimer);settleTimer=null;
    const run=++state.run,revision=state.revision,began=performance.now();
    state.compiling=true;
    // Local updates finish within a frame or two; only a real wait shows the busy state.
    busyTimer=setTimeout(()=>{state.busy=true;updateControls();updateEngine();},250);
    updateControls();
    try{
      if(!options.onCompile)throw new Error('No TeX engine is connected.');
      const result=await options.onCompile(request(reason));
      if(run!==state.run||state.destroyed||revision!==state.revision)return;
      state.failed=false;
      // A panel that opened for an error steps aside once the document compiles again.
      if(panelAuto){panelAuto=false;set('panel',false);}
      if(result?.empty)showSheet(revision);
      else if(result?.pdf)await setPdf(result.pdf,{...result,revision:result.revision??revision,durationMs:result.durationMs??performance.now()-began});
      if(run===state.run&&revision===state.revision&&!state.failed&&(result?.empty||state.pdfRevision===revision))void takeSnapshot().catch(()=>notify('history.failed'));
    }catch(error){if(run===state.run&&revision===state.revision)api.setError(error,{quiet:reason==='auto'});}
    finally{
      if(run===state.run){finishRun();if(state.revision!==revision)scheduleCompile(0);}
    }
  }
  const cancel=()=>{
    if(!state.compiling&&!state.previewing&&!settleTimer)return;
    ++state.run;++pdfSequence;++previewRun;state.previewing=false;rendererAbort?.abort();clearTimeout(compileTimer);clearTimeout(settleTimer);compileTimer=settleTimer=null;
    try{Promise.resolve(options.onCancel?.()).catch(error=>log(`Cancellation: ${error.message||error}`,'warning'));}catch(error){log(`Cancellation: ${error.message||error}`,'warning');}
    log('Compilation cancelled. The previous PDF is retained.');finishRun();
  };
  /** Drop the PDF and show the stand-in page; revision >= 0 marks an empty document as current. */
  function showSheet(revision=-1){
    ++pdfSequence;rendererAbort?.abort();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
    state.pdf=state.pdfUrl=state.meta=null;state.pdfRevision=state.previewRevision=revision;
    if(!$('sheet')){viewport.innerHTML=SHEET;i18n.apply(viewport);}
    marker.remove();updateDoc();updateStatus();updateEngine();updatePage();
  }
  const pages=()=>[...viewport.querySelectorAll('canvas[data-page]')];
  function paintRegion(region,className){
    const canvas=pages().find(canvas=>Number(canvas.dataset.page)===region.page);if(!canvas)return;
    const overlay=document.createElement('div');overlay.className=className;overlay.style.cssText=`left:${canvas.offsetLeft+8}px;top:${canvas.offsetTop+region.top*canvas.offsetHeight}px;width:${canvas.offsetWidth-16}px;height:${Math.max(8,(region.bottom-region.top)*canvas.offsetHeight)}px`;
    canvas.parentNode.append(overlay);if(className==='ink-region'){overlay.addEventListener('animationend',()=>overlay.remove(),{once:true});setTimeout(()=>overlay.remove(),500);}
  }
  const fitWidth=()=>Math.max(240,viewport.clientWidth-48);
  const pageWidth=base=>settings.zoom==='fit'?Math.min(fitWidth(),base*2.5):base*settings.zoom;
  const currentZoom=()=>{const base=parseFloat(pages()[0]?.dataset.base);return settings.zoom==='fit'?(base?pageWidth(base)/base:1):settings.zoom;};
  function updateZoomLabel(){$('zoom-label').textContent=settings.zoom==='fit'?t('zoom.fitLabel'):Math.round(settings.zoom*100)+'%';}
  function updatePage(){
    const list=pages(),middle=viewport.scrollTop+viewport.clientHeight/3,input=$('page-input');let current=0;
    for(const [index,canvas] of list.entries())if(canvas.offsetTop<=middle)current=index;
    $('page-nav').hidden=list.length<2;$('page-indicator').textContent=list.length>1?`/ ${list.length}`:'';
    if(document.activeElement!==input){input.value=String(current+1);input.style.width=String(list.length).length+1.4+'ch';}
  }
  function goToPage(number){
    const list=pages(),canvas=list[clamp(number,1,list.length)-1];
    if(canvas)viewport.scrollTo?.({top:Math.max(0,canvas.offsetTop-12),behavior:'smooth'});
  }
  // The zoom bar rests out of sight; scrolling or zooming brings it back for a moment.
  function showZoombar(){$('zoombar').dataset.show='true';clearTimeout(barTimer);barTimer=setTimeout(()=>{if(!state.destroyed)delete $('zoombar').dataset.show;},1600);}
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
    viewport.querySelectorAll('.hover-region,.ink-region').forEach(node=>node.remove());placePagination();updateZoomLabel();updatePage();placeMarker();
  }
  function placePagination(){
    viewport.querySelectorAll('.pagination-note').forEach(node=>node.remove());
    for(const canvas of pages().filter(canvas=>canvas.classList.contains('provisional'))){const note=document.createElement('span');note.className='pagination-note';note.textContent='≈ '+t('preview.pagination');note.style.top=canvas.offsetTop+8+'px';note.style.left=canvas.offsetLeft+Math.max(0,canvas.offsetWidth-160)+'px';canvas.parentNode.append(note);}
  }
  function refreshPages(){
    if(!state.pdf||state.compiling||state.destroyed)return;
    // The host redraws current live display lists, or compiles if those cannot render.
    if(state.previewRevision===state.pdfRevision)void setPdf(state.pdf,{...state.meta,revision:state.pdfRevision});else void compile('zoom');
  }
  /** point: {x, y} in client coordinates. The spot of the page under it (default: the viewport centre) stays put. */
  function setZoom(zoom,point){
    const box=viewport.getBoundingClientRect(),px=point?point.x-box.left:viewport.clientWidth/2,py=point?point.y-box.top:viewport.clientHeight/2,x=viewport.scrollLeft+px,y=viewport.scrollTop+py;
    let target=null;
    for(const canvas of pages())if(!target||canvas.offsetTop<=y)target=canvas;
    const fx=target?.offsetWidth?(x-target.offsetLeft)/target.offsetWidth:0,fy=target?.offsetHeight?(y-target.offsetTop)/target.offsetHeight:0;
    set('zoom',zoom==='fit'?'fit':clamp(Math.round(zoom*100)/100,0.25,4));layoutPages();
    if(target?.offsetHeight){viewport.scrollTop=target.offsetTop+fy*target.offsetHeight-py;viewport.scrollLeft=target.offsetLeft+fx*target.offsetWidth-px;}
    showZoombar();clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,220);
  }
  function fitPage(){
    const canvas=pages()[0],base=parseFloat(canvas?.dataset.base);
    if(base&&canvas.width)setZoom(Math.min(fitWidth()/base,(viewport.clientHeight-48)/(base*canvas.height/canvas.width)));
  }
  function zoomMenu(){
    const current=currentZoom();
    openMenu(app,$('zoom-label').getBoundingClientRect(),[{label:t('zoom.fit'),checked:settings.zoom==='fit',run:()=>setZoom('fit')},{label:t('zoom.fitPage'),checked:false,run:fitPage},'separator',
      ...[0.5,0.75,1,1.25,1.5,2,3].map(value=>({label:Math.round(value*100)+'%',checked:settings.zoom!=='fit'&&Math.abs(current-value)<0.005,run:()=>setZoom(value)}))]);
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
      if(state.destroyed||sequence!==pdfSequence||metadata.revision!==undefined&&metadata.revision!==state.revision){if(newUrl)URL.revokeObjectURL(newUrl);return;}
      if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=newUrl;
      const scroll=viewport.scrollTop,across=viewport.scrollLeft,previous=viewport.firstElementChild;
      viewport.replaceChildren(container);container.classList.add('page-arrive');
      if(previous?.querySelector('canvas')&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        // Keep the old pixels briefly, but exclude them from page navigation and live hit testing.
        previous.classList.add('page-leave');previous.setAttribute('aria-hidden','true');previous.inert=true;
        previous.querySelectorAll('[data-page]').forEach(canvas=>canvas.removeAttribute('data-page'));
        previous.querySelectorAll('.ink-region,.hover-region,.pagination-note').forEach(node=>node.remove());
        viewport.append(previous);setTimeout(()=>previous.remove(),140);
      }
      viewport.scrollTop=scroll;viewport.scrollLeft=across;
      state.pdf=data;state.pdfRevision=metadata.revision??state.revision;state.previewRevision=state.pdfRevision;
      state.meta={pages:metadata.pages??rendered?.pages,durationMs:metadata.durationMs};
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
        meta:{main:project.main,folders:project.explicitFolders(),tabs,active,historyId}});
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
  async function replaceProject(data,confirmed=false){
    if(!confirmed&&project.files().length&&!await confirmDialog(app,{title:t('project.replaceTitle'),message:t('project.replaceBody'),confirm:t('project.replace'),cancel:t('common.cancel'),danger:true}))return false;
    cancel();historyId=globalThis.crypto.randomUUID();project.load(data);if(project.main)openFile(project.main);
    return true;
  }
  async function readArchive(file){
      if(file.size>64*1024*1024)throw new Error('ZIP exceeds 64 MiB');
      let entries=(await unzip(new Uint8Array(await file.arrayBuffer()))).filter(entry=>!/(^|\/)(__MACOSX\/|\.DS_Store$|Thumbs\.db$)/.test(entry.path));
      // Archives usually wrap everything in one folder; open it.
      const top=entries[0]?.path.split('/')[0];
      if(entries.length&&entries.every(entry=>entry.path.startsWith(top+'/')))entries=entries.map(entry=>({...entry,path:entry.path.slice(top.length+1)}));
      return {files:entries.map(entry=>{const text=decodeText(entry.data);return text==null?entry:{path:entry.path,text};})};
  }
  async function importArchive(file){
    try{
      if(await replaceProject(await readArchive(file)))notify('toast.imported',{n:project.files().length});
    }catch(error){notify('toast.zip',{message:error.message||error});}
  }
  function remove(path){
    const restore=project.remove(path);
    if(restore)toast(t('toast.deleted',{name:basename(path)}),{label:t('common.undo'),run:restore});
  }
  function symbols(){const editor=activeEditor();if(!editor)return;const start=editor.input.selectionStart,end=editor.input.selectionEnd;openSymbols({host:app,t,insert:text=>{editor.edit(start,end,text,text.endsWith('{}')?start+text.length-1:start+text.length);views.get(active)?.complete?.hide();}});}
  function takeSnapshot(force=false){
    if(!settings.persist||!store?.addSnapshot)return Promise.resolve(false);
    return store.addSnapshot({id:globalThis.crypto.randomUUID(),projectId:historyId,time:Date.now(),main:project.main,folders:project.explicitFolders(),files:project.files().filter(file=>typeof file.text==='string').map(({path,text})=>({path,text})),force});
  }
  function history(){
    return openHistory({host:app,t,lang:i18n.lang,store,projectId:historyId,persist:settings.persist,notify,restore:async snapshot=>{
      if(snapshot.projectId!==historyId||!Array.isArray(snapshot.files)||!snapshot.files.length||snapshot.files.some(file=>typeof file.text!=='string'||normalizePath(file.path)!==file.path)||new Set(snapshot.files.map(file=>file.path)).size!==snapshot.files.length)throw Error('Invalid snapshot');
      const revision=state.revision;if(!await takeSnapshot(true)||state.revision!==revision)throw Error('Cannot safely restore a changed project');
      const binary=project.files().filter(file=>typeof file.text!=='string'),occupied=new Set(binary.map(file=>file.path));
      if(snapshot.files.some(file=>occupied.has(file.path)))throw Error('A binary file occupies a snapshot path');
      cancel();project.load({main:snapshot.main,folders:[...new Set([...project.explicitFolders(),...(snapshot.folders||[])])],files:[...binary,...snapshot.files]});if(project.main)openFile(project.main,{focus:true});await flush();return true;
    }});
  }
  function wireInsertion(editor,path){
    const asset=event=>event.dataTransfer?.getData('text/x-lightningtex'),images=transfer=>[...(transfer?.files||[])].filter(file=>/^image\/(png|jpeg|gif|webp|bmp)$/.test(file.type)||isImagePath(file.name));
    const insert=(target,start,end=start)=>{
      if(/[#$%&{}~^\\\r\n]/.test(target)){notify('image.unsafe');return;}
      const image=/\.(png|jpe?g|pdf)$/i.test(target),text=image?`\\includegraphics[width=\\linewidth]{${target}}`:`\\input{${target.replace(/\.tex$/i,'')}}`;
      editor.edit(start,end,text);views.get(path)?.complete?.hide();
      if(image&&!/\\usepackage(?:\[[^\]]*\])?\{[^}]*graphicx/.test(mainText()))notify('image.package');
    };
    async function add(files,start,end=start){
      let first=true;
      for(const file of files){
        if(file.size>MAX_UPLOAD){notify('toast.tooBig',{name:file.name});continue;}
        const source=editor.getValue();
        try{
          let data=file,name=(file.name||'image.png').replace(/[^\p{L}\p{N}._-]/gu,'-');
          if(/\.(gif|webp|bmp)$/i.test(name)||/^image\/(gif|webp|bmp)$/.test(file.type)){
            // TeX accepts PNG/JPEG; animated inputs intentionally use their first frame.
            const bitmap=await createImageBitmap(file);try{if(bitmap.width*bitmap.height>24e6)throw Error('Image too large');const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);data=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!data)throw Error('Image conversion failed');name=name.replace(/\.[^.]+$/,'')+'.png';}finally{bitmap.close();}
          }
          const bytes=new Uint8Array(await data.arrayBuffer());if(state.destroyed||views.get(path)?.editor!==editor)return;
          const target=project.unique('figures',name);
          project.write(target,bytes);
          if(editor.getValue()!==source){start=end=editor.caret;}
          insert(target,first?start:editor.caret,first?end:editor.caret);first=false;
        }catch{notify('image.failed');}
      }
    }
    editor.input.addEventListener('dragover',event=>{if(asset(event)||images(event.dataTransfer).length||[...event.dataTransfer.types].includes('text/x-lightningtex')){event.preventDefault();event.dataTransfer.dropEffect='copy';}});
    editor.input.addEventListener('drop',event=>{
      const target=asset(event),files=images(event.dataTransfer);if(!files.length&&(!target||!project.has(target)||!(isImagePath(target)||/\.(tex|ltx|pdf)$/i.test(target))))return;
      event.preventDefault();event.stopPropagation();$('drop-veil').hidden=true;const start=editor.offsetAtPoint(event.clientX,event.clientY);
      if(target&&/\.(gif|webp|bmp)$/i.test(target))void add([new File([fileBytes(project.get(target))],basename(target))],start);
      else if(target)insert(target,start);else void add(files,start);
    });
    editor.input.addEventListener('paste',event=>{const files=images(event.clipboardData);if(!files.length)return;event.preventDefault();event.stopPropagation();void add(files,editor.input.selectionStart,editor.input.selectionEnd);});
  }
  const downloadFile=path=>{const file=project.get(path);if(file)download(fileBytes(file),basename(path),typeof file.text==='string'?'text/plain;charset=utf-8':'application/octet-stream');};
  function projectMenu(){
    openMenu(app,action('project-menu').getBoundingClientRect(),[{label:t('project.new'),icon:'template',run:templateGallery},
      {label:t('project.import'),icon:'upload',run:()=>$('zip-input').click()},
      {label:t('project.export'),icon:'archive',disabled:!project.files().length,run:exportZip}]);
  }
  function templateGallery(){return openTemplateGallery({host:app,t,lang:i18n.lang,hasFiles:!!project.paths().length,readArchive,create:data=>void replaceProject(data,true),notify});}
  function exportZip(){download(zip(project.files().map(file=>({path:file.path,data:fileBytes(file)}))),(project.main?basename(project.main).replace(/\.tex$/i,''):'project')+'.zip','application/zip');}
  async function downloadPdf(){
    if(state.compiling){notify('toast.wait');return;}
    if(state.pdfRevision!==state.revision)await compile('download');
    if(state.pdfRevision!==state.revision){notify('toast.stale');return;}
    if(state.pdf)download(state.pdf,basename(project.main||'main.tex').replace(/\.tex$/i,'')+'.pdf','application/pdf');
  }
  function exportMenu(){
    const pages=state.meta?.pages,size=state.pdf&&[pages&&(pages===1?t('page'):t('pages',{n:pages})),`${(state.pdf.byteLength/1024).toFixed(1)} KB`].filter(Boolean).join(' · ');
    openMenu(app,action('export-menu').getBoundingClientRect(),[
      {label:t('export.pdf'),icon:'download',hint:!state.pdf?'':state.pdfRevision!==state.revision?t('export.compileFirst'):size,disabled:!state.pdf||state.compiling,run:downloadPdf},
      {label:t('project.export'),icon:'archive',disabled:!project.files().length,run:exportZip},
      {label:t('export.file',{name:active?basename(active):''}),icon:'file',disabled:!active,run:()=>downloadFile(active)}]);
  }
  function capsuleMenu(){
    openMenu(app,action('capsule-menu').getBoundingClientRect(),[
      {label:t('compile.auto'),checked:settings.autoCompile,run:()=>set('autoCompile',!settings.autoCompile)},
      {label:t('compile.now'),icon:'play',hint:keys('Mod+Enter'),disabled:action('compile').disabled,run:()=>compile()},'separator',
      {label:t('panel.problems'),icon:'warning',hint:keys('Mod+J'),run:()=>openPanel('problems')},{label:t('panel.log'),icon:'file',run:()=>openPanel('log')}]);
  }
  const tree=createFileTree({el:$('tree'),host:app,project,t,actions:{open:path=>{openFile(path,{focus:true});if(narrowQuery?.matches)toggleSidebar(false);},remove,download:downloadFile,upload:(files,dir)=>void upload(files,dir),notify,
    pick:dir=>{state.uploadDir=dir;$('file-input').click();}}});
  const popover=options.typesetMath?createMathPopover({t,typeset:request=>options.typesetMath({...request,scale:settings.mathScale})}):null;

  project.on(change=>{
    if(state.destroyed||restoring)return;
    const typed=change.origin==='editor';
    state.revision++;state.dirty=true;
    clearTimeout(settleTimer);settleTimer=null;
    // Track project dependencies separately; the host decides which file edits can be replayed.
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
    clearTimeout(metaTimer);if(typed)metaTimer=setTimeout(()=>{if(!state.destroyed)updateProject();},300);else updateProject();
    options.onSourceChange?.({source:mainText(),revision:state.revision});
    scheduleCompile();
  });

  // ---- events -----------------------------------------------------------------------------------
  listen(action('compile'),'click',()=>compile());listen(action('cancel'),'click',cancel);
  listen($('auto-compile'),'change',event=>set('autoCompile',event.target.checked));
  listen(action('capsule'),'click',()=>state.compiling?cancel():compile());listen(action('capsule-menu'),'click',capsuleMenu);
  listen(action('export-menu'),'click',exportMenu);
  listen($('layout'),'click',event=>{const button=event.target.closest('button');if(button)setLayout(button.dataset.value);});
  listen(action('settings'),'click',()=>toggleSettings());
  listen(action('new-file'),'click',()=>tree.create(false,tree.directory));listen(action('new-folder'),'click',()=>tree.create(true,tree.directory));
  listen(action('upload'),'click',()=>{state.uploadDir=tree.directory;$('file-input').click();});
  listen(action('project-menu'),'click',projectMenu);
  for(const name of ['palette','editor-palette'])listen(action(name),'click',palette);
  for(const name of ['empty-new','editor-new'])listen(action(name),'click',()=>tree.create(false));
  listen(action('empty-import'),'click',()=>$('zip-input').click());listen(action('new-project'),'click',templateGallery);listen(action('word-count'),'click',wordDetails);
  listen(action('history'),'click',()=>void history());
  listen($('file-input'),'change',()=>{const files=[...$('file-input').files];$('file-input').value='';if(files.length)void upload(files,state.uploadDir||'');});
  listen($('zip-input'),'change',()=>{const file=$('zip-input').files[0];$('zip-input').value='';if(file)void importArchive(file);});
  listen($('tabs'),'click',event=>{const tab=event.target.closest('.tab');if(!tab)return;if(event.target.closest('.tab-close'))closeTab(tab.dataset.path,true);else openFile(tab.dataset.path,{focus:true});});
  listen($('tabs'),'auxclick',event=>{const tab=event.target.closest('.tab');if(tab&&event.button===1){event.preventDefault();closeTab(tab.dataset.path);}});
  listen($('tabs'),'keydown',event=>{
    const tab=event.target.closest('.tab');if(!tab)return;
    if(event.key==='Enter'||event.key===' '){event.preventDefault();openFile(tab.dataset.path,{focus:true});}
    else if(event.key==='ArrowRight'||event.key==='ArrowLeft'){event.preventDefault();(event.key==='ArrowRight'?tab.nextElementSibling:tab.previousElementSibling)?.focus();}
  });
  listen($('tabs'),'wheel',event=>{if(!event.deltaX&&event.deltaY){$('tabs').scrollLeft+=event.deltaY;}},{passive:true});
  listen($('tabs'),'scroll',placeTabs,{passive:true});
  listen($('tabs'),'contextmenu',event=>{const path=event.target.closest('.tab')?.dataset.path;if(!path)return;event.preventDefault();openMenu(app,{x:event.clientX,y:event.clientY},[
    {label:t('tab.close'),icon:'close',run:()=>closeTab(path)},
    {label:t('tab.others'),run:()=>{for(const other of [...tabs])if(other!==path)closeTab(other);}},
    {label:t('tab.right'),run:()=>{for(const other of tabs.slice(tabs.indexOf(path)+1))closeTab(other);}},'separator',
    {label:t('outline.reveal'),icon:'folder',run:()=>{toggleSidebar(true);tree.setActive(path);$('tree').querySelector('[aria-selected="true"]')?.focus();}},
  ]);});
  listen($('tabs'),'dragstart',event=>{const path=event.target.closest('.tab')?.dataset.path;if(path){event.dataTransfer.setData('text/x-lightningtex-tab',path);event.dataTransfer.effectAllowed='move';}});
  listen($('tabs'),'dragover',event=>{if([...event.dataTransfer.types].includes('text/x-lightningtex-tab'))event.preventDefault();});
  listen($('tabs'),'drop',event=>{const from=event.dataTransfer.getData('text/x-lightningtex-tab'),to=event.target.closest('.tab')?.dataset.path;if(!tabs.includes(from)||!to||from===to)return;event.preventDefault();const index=tabs.indexOf(to);tabs.splice(tabs.indexOf(from),1);tabs.splice(index,0,from);renderTabs();queueSave();});
  listen(action('toggle-sidebar'),'click',()=>toggleSidebar());
  listen(action('toggle-panel'),'click',()=>{panelAuto=false;set('panel',!settings.panel);});listen(action('close-panel'),'click',()=>set('panel',false));
  listen(viewport,'click',event=>{if(event.target.closest?.('[data-action="show-problems"]'))openPanel(state.problems.length?'problems':'log');});
  listen(action('clear-log'),'click',()=>api.clearLogs());
  listen(action('copy-log'),'click',async()=>{try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(state.logs.join('\n'));notify('panel.copied');}catch{notify('panel.copyFailed');}});
  listen(action('problem-filter'),'click',()=>openMenu(app,action('problem-filter').getBoundingClientRect(),['all','error','warning','info'].map(value=>({label:t('panel.'+value),checked:state.problemFilter===value,run:()=>{state.problemFilter=value;renderProblems();}}))));
  listen($('preview-error'),'click',()=>{const problem=state.problems.find(problem=>problem.severity==='error'&&project.has(problem.file));if(problem)reveal({path:problem.file,line:problem.line});else openPanel('log');});
  for(const tab of $('panel').querySelectorAll('.panel-tab'))listen(tab,'click',()=>set('panelTab',tab.dataset.panel));
  listen(action('zoom-in'),'click',()=>stepZoom(1));listen(action('zoom-out'),'click',()=>stepZoom(-1));
  listen(action('zoom-fit'),'click',()=>setZoom(settings.zoom==='fit'?1:'fit'));listen(action('zoom-menu'),'click',zoomMenu);
  listen($('page-input'),'focus',()=>$('page-input').select());listen($('page-input'),'blur',updatePage);
  listen($('page-input'),'keydown',event=>{
    if(event.key!=='Enter'&&event.key!=='Escape')return;
    event.preventDefault();event.stopPropagation();if(event.key==='Enter')goToPage(parseInt($('page-input').value,10)||1);$('page-input').blur();
  });
  listen(viewport,'keydown',event=>{
    if(event.target!==viewport||event.key!=='PageDown'&&event.key!=='PageUp')return;
    event.preventDefault();goToPage((parseInt($('page-input').value,10)||1)+(event.key==='PageDown'?1:-1));
  });
  listen(viewport,'wheel',event=>{
    if(!event.ctrlKey&&!event.metaKey)return;
    event.preventDefault();setZoom(clamp(currentZoom()*Math.exp(-event.deltaY*0.01),0.25,4),{x:event.clientX,y:event.clientY});
  },{passive:false});
  listen(viewport,'scroll',()=>{updatePage();showZoombar();},{passive:true});
  const previewPoint=event=>{
    const canvas=event.target.closest?.('canvas[data-page]');if(!canvas)return;
    const box=canvas.getBoundingClientRect();
    return {page:Number(canvas.dataset.page),x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};
  };
  for(const type of ['click','dblclick'])listen(viewport,type,event=>{const point=previewPoint(event);if(point)options.onPreviewPick?.(point);});
  listen(viewport,'pointermove',event=>{hoverPoint=previewPoint(event);if(hoverFrame)return;hoverFrame=requestAnimationFrame(()=>{hoverFrame=null;const region=hoverPoint&&options.onPreviewHover?.(hoverPoint);viewport.querySelector('.hover-region')?.remove();if(region)paintRegion(region,'hover-region');});});
  listen(viewport,'pointerleave',()=>{hoverPoint=null;viewport.querySelector('.hover-region')?.remove();});
  for(const splitter of root.querySelectorAll('.splitter')){
    listen(splitter,'keydown',event=>{
      if(!['ArrowLeft','ArrowRight','Home'].includes(event.key))return;event.preventDefault();
      const sidebar=splitter.dataset.split==='sidebar',key=sidebar?'sidebar':'split',width=root.querySelector('.editor-pane').clientWidth+root.querySelector('.preview-pane').clientWidth;
      set(key,event.key==='Home'?DEFAULT_SETTINGS[key]:sidebar?clamp(settings.sidebar+(event.key==='ArrowLeft'?-16:16),160,420):clamp(settings.split+(event.key==='ArrowLeft'?-16:16)/Math.max(1,width),.2,.8));layoutPages();
    });
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
    if(event.defaultPrevented||event.isComposing)return;
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    const command=mod&&!event.altKey&&commands().find(command=>command.key?.toLowerCase()==='mod+'+(event.shiftKey?'shift+':'')+key);
    if(command){event.preventDefault();if(!command.disabled)command.run();}
    else if(key==='escape'){
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
  const remeasure=()=>{if(state.destroyed)return;applyLayout();syncSettings();placeTabs();};
  listen(window,'resize',remeasure);
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
      active,zoom:settings.zoom}),
    getSettings:()=>({...settings}),
    setLoadProgress({step,done,total,assets}={}){
      const list=$('load-steps');if(!list)return;
      if(!list.children.length){for(let i=0;i<4;i++){const row=document.createElement('div');row.append(Object.assign(document.createElement('span'),{textContent:t('load.'+i)}),document.createElement('small'));list.append(row);}list.after(Object.assign(document.createElement('p'),{className:'load-write',textContent:t('load.write')}));}
      for(const [i,row] of [...list.children].entries()){row.dataset.state=i<step?'done':i===step?'active':'pending';if(assets&&i<2){const asset=assets[i===0?'busytex.wasm':'texlive-basic.data'];if(asset)row.lastChild.textContent='0 / '+(asset.encodedSize/1048576).toFixed(1)+' MiB';}}
      if(total&&list.children[step])list.children[step].lastChild.textContent=(done/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MiB';
    },
    setLivePages({canvases,revision,durationMs,reflow=false,regions=[]}){
      if(state.destroyed||revision!==state.revision)return false;
      const targets=[...canvases].map(([page,canvas])=>[viewport.querySelector(`[data-page="${page}"]`),canvas]);
      if(targets.some(([target])=>!target))return false;
      for(const [target,canvas] of targets){for(const key of Object.keys(target.dataset))canvas.dataset[key]=target.dataset[key];canvas.style.cssText=target.style.cssText;canvas.setAttribute('aria-label',target.getAttribute('aria-label'));target.replaceWith(canvas);}
      viewport.querySelectorAll('.ink-region,.hover-region,.pagination-note').forEach(node=>node.remove());
      for(const region of regions)paintRegion(region,'ink-region');
      for(const [,canvas] of targets)canvas.classList.toggle('provisional',reflow);placePagination();
      if(state.failed){state.failed=false;state.problems=state.problems.filter(problem=>problem.severity!=='error');renderProblems();}
      state.previewRevision=revision;
      if(Number.isFinite(durationMs)&&canvases.size)api.setLiveStatus({state:reflow?'reflow':'live',ms:durationMs,revision});
      updateStatus();updatePage();placeMarker();return true;
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
    setLiveStatus({state:mode='ready',ms,reason,revision}={}){
      if(revision!==undefined&&revision!==state.revision)return;
      state.live={state:mode,ms,reason};
      if((mode==='live'||mode==='reflow')&&Number.isFinite(ms)){
        state.latency.push(ms);if(state.latency.length>12)state.latency.shift();
        if(!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)$('preview-status').querySelector('.dot').animate?.([{boxShadow:'0 0 0 0 var(--select)'},{boxShadow:'0 0 0 7px transparent'}],{duration:500,easing:'ease-out'});
      }
      updateLive();
    },
    /** Where the caret's text sits in the preview: {page, top, bottom} as fractions of the page, or null. */
    setMarker(position,{scroll=true}={}){state.marker=position||null;placeMarker(scroll);},
    refreshMath:updateMath,
    clearLogs(){state.logs=[];$('logs').textContent='';},
    destroy(){
      state.destroyed=true;state.run++;pdfSequence++;previewRun++;
      for(const timer of [compileTimer,settleTimer,busyTimer,zoomTimer,saveTimer,metaTimer,barTimer])clearTimeout(timer);
      toaster.hide();tips.destroy();rendererAbort?.abort();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
      if(hoverFrame)cancelAnimationFrame(hoverFrame);
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
    restoring=true;if(typeof saved?.historyId==='string')historyId=saved.historyId;
    project.load(saved?.files?.length?saved:initialProject());
    const wanted=(saved?.tabs||[]).filter(path=>project.has(path));
    tabs=wanted.length?wanted:project.main?[project.main]:project.paths().slice(0,1);
    restoring=false;
    activate(tabs.includes(saved?.active)?saved.active:tabs[0]??null);
    state.loaded=true;state.save=store&&settings.persist?'saved':'off';
    if(!saved?.files?.length)queueSave({type:'load'});else if(!saved.historyId)queueSave();
    updateControls();updateEngine();updateSave();updateProject();
  }
  applyAppearance();applyLayout();i18n.apply(root);renderSettings();renderPanel();renderProblems();updateControls();updateEngine();updateZoomLabel();updateSave();
  $('auto-compile').checked=settings.autoCompile;$('preview-status').dataset.auto=String(settings.autoCompile);updateLive();
  // Sliding thumbs need real boxes; measure once laid out and again when web fonts settle.
  (globalThis.requestAnimationFrame||setTimeout)(()=>{remeasure();if(!state.destroyed)app.classList.add('ready');});
  document.fonts?.ready?.then(remeasure);
  if(options.store===undefined&&!globalThis.indexedDB||options.store===null){start(null);api.ready=Promise.resolve();}
  else api.ready=(async()=>{
    try{store=options.store??await openStore();}catch{store=null;}
    let saved=null;
    if(store&&settings.persist)try{saved=await store.load();}catch{saved=null;}
    start(saved);
  })();
  return api;
}
