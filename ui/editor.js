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
import {openMenu,openDialog,openPopover,confirmDialog,createToast} from './overlays.js';
import {createInspector} from './inspector.js';
import {createThumbnails} from './thumbnails.js';
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
import {openSymbols,SYMBOLS} from './symbols.js';
import {openHistory} from './history.js';
import {createLabels} from './labels.js';
import {watchEdges} from './edges.js';
import {explainReason} from '../core/live-reasons.js';
import {referenceCounts,targetAt,findLabels,findReferences,findDefinition,nearest} from '../core/references.js';
import {environmentAt} from '../core/brackets.js';
import {parseBib,byline,plainField} from '../core/bib.js';
import {createBreadcrumbs} from './breadcrumbs.js';
import {createHoverCard} from './hovercard.js';
import {quickFixes,packageEdit} from '../core/quick-fix.js';
import {openTablePicker} from './table-picker.js';
import {createPdfFind} from './pdf-find.js';

const LEGACY_DRAFT='realtime-tex-web:draft:v1',LEGACY_CONSENT='realtime-tex-web:save-draft:v1',TAB_PROJECT='lightningtex:project';
const MAX_UPLOAD=20*1024*1024,ZOOMS=[0.5,0.67,0.8,0.9,1,1.1,1.25,1.5,1.75,2,2.5,3];
const ACCENTS={bolt:'#f5b800',indigo:'#6366f1',teal:'#0d9488',rose:'#e5487d'};
const mac=/Mac|iPhone|iPad/.test(globalThis.navigator?.platform||globalThis.navigator?.userAgent||'');
const keys=combo=>mac?combo.replace('Mod+','⌘').replace('Alt+','⌥').replace('Shift+','⇧').replace('Enter','↵').replace(/\bUp\b/,'↑').replace(/\bDown\b/,'↓'):combo.replace('Mod+','Ctrl+');
const clamp=(value,low,high)=>Math.min(high,Math.max(low,value));

// Stand-in page shown until there is a PDF: skeleton while working, blank for an empty document.
const SHEET='<div class="preview-content"><div class="sheet" data-id="sheet" data-state="loading"><div class="sheet-lines"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="load-steps" data-id="load-steps"></div><div class="sheet-note" data-id="sheet-note"></div><button type="button" class="btn" data-action="show-problems" data-i18n="preview.show" hidden></button></div></div>';
const shell=()=>`<div class="app">
  <div class="load-bar" data-id="load-bar"><i></i></div>
  <header class="appbar">
    <div class="appbar-side">
      <button type="button" class="icon-btn" data-action="toggle-sidebar" data-i18n-title="sidebar.toggle" data-keys="${keys('Mod+B')}">${icon('sidebar')}</button>
      <span class="brand"><span class="brand-mark" aria-hidden="true"></span><b>Lightning<span class="tex">T<i>E</i>X</span></b></span>
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
      <button type="button" class="btn export-btn" data-action="export-menu" data-i18n-title="export.open" aria-haspopup="menu"><span class="export-icon">${icon('download')}${icon('check')}</span><span data-i18n="export.open"></span>${icon('chevronDown',12)}</button>
      <button type="button" class="icon-btn" data-action="settings" data-i18n-title="settings.open" data-keys="${keys('Mod+,')}">${icon('settings')}</button>
    </div>
  </header>
  <div class="main" data-id="main">
    <aside class="sidebar" data-id="sidebar"><div class="sidebar-in">
      <div class="side-switch" data-id="side-switch" role="tablist"><i class="seg-thumb"></i>${['files','outline','labels'].map(view=>`<button type="button" role="tab" data-side="${view}" data-i18n="side.${view}"></button>`).join('')}</div>
      <div class="side-view" data-view="files" role="tabpanel">
        <div class="side-head"><span class="spacer"></span>
          <button type="button" class="icon-btn" data-action="new-file" data-i18n-title="file.new">${icon('fileAdd')}</button>
          <button type="button" class="icon-btn" data-action="new-folder" data-i18n-title="folder.new">${icon('folderAdd')}</button>
          <button type="button" class="icon-btn" data-action="upload" data-i18n-title="file.upload">${icon('upload')}</button>
        </div>
        <div class="side-scroll"><div class="tree" data-id="tree" role="tree"></div></div>
        <div class="tree-empty" data-id="tree-empty" hidden><strong data-i18n="empty.files"></strong><p data-i18n="empty.hint"></p><button class="btn" data-action="empty-new" data-i18n="file.new"></button><button class="btn" data-action="new-project" data-i18n="project.template"></button><button class="text-btn" data-action="empty-import" data-i18n="project.import"></button></div>
        <div class="side-now" data-id="side-now" hidden></div>
      </div>
      <div class="side-view" data-view="outline" role="tabpanel" hidden><div class="side-scroll"><nav class="outline" data-id="outline" data-i18n-title="outline.title"></nav></div></div>
      <div class="side-view" data-view="labels" role="tabpanel" hidden><div class="side-scroll"><div class="labels" data-id="labels"></div></div></div>
      <div class="side-foot"><button class="text-btn" data-action="history" data-i18n-title="history.open">${icon('history',14)}<span data-i18n="history.open"></span></button></div>
      <input data-id="file-input" type="file" multiple hidden><input data-id="zip-input" type="file" accept=".zip,application/zip" hidden>
    </div></aside>
    <div class="splitter" data-split="sidebar" role="separator" aria-orientation="vertical" tabindex="0" data-i18n-title="splitter.help"></div>
    <section class="editor-pane">
      <header class="pane-head"><div class="tabs" data-id="tabs" role="tablist"></div></header>
      <nav class="crumbs" data-id="crumbs" hidden></nav>
      <span class="sr-only" id="editor-keyboard-help" data-i18n="editor.help"></span>
      <div class="editor-host" data-id="editor-host"><div class="editor-empty" data-id="editor-empty" hidden>${icon('file',28)}<span data-i18n="editor.empty"></span><button class="btn" data-action="editor-new" data-i18n="file.new"></button><button class="text-btn" data-action="editor-palette"><span data-i18n="palette.open"></span><kbd>${keys('Mod+K')}</kbd></button></div></div>
      <section class="panel" data-id="panel" hidden>
        <header class="panel-head">
          <button type="button" class="panel-tab" data-panel="problems"><span data-i18n="panel.problems"></span><span class="count" data-id="problem-count"></span></button>
          <button type="button" class="panel-tab" data-panel="log" data-i18n="panel.log"></button>
          <button type="button" class="panel-tab" data-panel="refs" data-id="refs-tab" hidden><span data-i18n="panel.refs"></span><span class="count" data-id="refs-count"></span></button>
          <span class="spacer"></span>
          <button type="button" class="icon-btn" data-action="problem-filter" data-i18n-title="panel.filter">${icon('filter')}</button>
          <button type="button" class="icon-btn" data-action="copy-log" data-i18n-title="panel.copy">${icon('copy')}</button>
          <button type="button" class="icon-btn" data-action="clear-log" data-i18n-title="common.clear">${icon('trash')}</button>
          <button type="button" class="icon-btn" data-action="close-panel" data-i18n-title="common.close">${icon('close')}</button>
        </header>
        <div class="panel-body"><div class="problems" data-id="problems"></div>
        <pre class="logs" data-id="logs" tabindex="0" hidden></pre><div class="problems refs" data-id="refs" hidden></div></div>
      </section>
    </section>
    <div class="splitter" data-split="preview" role="separator" aria-orientation="vertical" tabindex="0" data-i18n-title="splitter.help"></div>
    <section class="preview-pane">
      <button type="button" class="preview-error" data-id="preview-error" hidden></button>
      <div class="preview-body"><nav class="thumbs" data-id="thumbs" data-i18n-title="thumbs.title" hidden></nav><div class="preview" data-id="preview-viewport" tabindex="0" data-i18n-title="preview.locate">${SHEET}</div></div>
      <button type="button" class="marker-chip" data-id="marker-chip" hidden></button>
      <span class="page-tag" data-id="page-tag" aria-hidden="true" hidden></span>
      <div class="zoombar" data-id="zoombar">
        <button type="button" class="icon-btn" data-action="zoom-out" data-i18n-title="zoom.out">${icon('minus')}</button>
        <button type="button" class="zoom-label" data-action="zoom-menu" data-id="zoom-label" data-i18n-title="zoom.menu" aria-haspopup="menu"></button><span class="zoom-note" data-id="zoom-note" hidden></span>
        <button type="button" class="icon-btn" data-action="zoom-in" data-i18n-title="zoom.in">${icon('plus')}</button>
        <button type="button" class="icon-btn" data-action="zoom-fit" data-i18n-title="zoom.fit">${icon('fit')}</button>
        <button type="button" class="icon-btn" data-action="toggle-thumbs" data-i18n-title="thumbs.toggle" data-keys="${keys('Mod+Alt+T')}">${icon('pages')}</button>
        <button type="button" class="icon-btn" data-action="pdf-find" data-i18n-title="pdfFind.open" data-keys="${keys('Mod+F')}">${icon('search')}</button>
        <label class="page-nav" data-id="page-nav" hidden><input class="page-input" data-id="page-input" type="text" inputmode="numeric" autocomplete="off" data-i18n-title="page.jump"><span data-id="page-indicator"></span></label>
      </div>
    </section>
  </div>
  <footer class="statusbar">
    <button type="button" class="stat" data-action="toggle-panel" data-id="stat-problems" data-i18n-title="panel.toggle" data-keys="${keys('Mod+J')}"></button>
    <span class="stat" data-id="stat-engine"></span>
    <button type="button" class="stat pdf-sync" data-action="pdf-sync" data-id="pdf-sync" hidden></button>
    <span class="spacer"></span>
    <button type="button" class="stat" data-action="word-count" data-id="word-count" data-i18n-title="words.title"></button><span class="stat" data-id="stat-doc"></span><span class="stat" data-id="cursor-status"></span><span class="stat" data-id="save-status"></span>
  </footer>
  <div class="settings" data-id="settings" role="dialog" hidden></div>
  <div class="toasts" data-id="toast" hidden></div>
  <div class="drop-veil" data-id="drop-veil" hidden>${icon('upload',28)}</div>
</div>`;

// [label key, combo]; "Mod" is Command or Control.
const EDITOR_SHORTCUTS=[['keys.comment','Mod+/'],['keys.indent','Tab / Shift+Tab'],['keys.snippets','Tab'],['keys.stops','Tab / Shift+Tab'],
  ['keys.moveLine','Alt+Up / Alt+Down'],['keys.dupLine','Shift+Alt+Down'],['keys.deleteLine','Mod+Shift+K'],['keys.selectLine','Mod+L'],['keys.selectNext','Mod+D'],
  ['keys.follow','F12'],['keys.rename','F2'],['keys.refs','Shift+F12'],['keys.escape','Esc']];

// [category, section title, [key, kind, values?]…] — every row edits one setting, applies at once and says what it does.
const SETTINGS=[
  ['appearance','set.appearance',[['theme','choice',['system','light','dark']],['accent','swatch',Object.keys(ACCENTS)],['lang','choice',['auto','en','zh']],['darkPages','toggle']]],
  ['editor','set.editor',[['fontSize','step',[11,20]],['wrap','toggle'],['autoClose','toggle'],['tabSize','choice',[2,4]],['spellcheck','toggle']]],
  ['preview','set.preview',[['autoCompile','toggle'],['mathPreview','toggle'],['mathScale','choice',['s','m','l']],['follow','toggle'],['thumbs','toggle'],['spread','choice',['single','double','cover']]]],
  ['storage','set.storage',[['persist','toggle']]],
];
const SETTING_GROUPS=[...SETTINGS.map(([id,title])=>[id,title]),['shortcuts','keys.title']];
const choiceLabel={lang:{en:'English',zh:'中文',auto:'set.lang.auto'},theme:value=>'set.theme.'+value,mathScale:value=>'size.'+value,spread:value=>'spread.short.'+value};

/**
 * mountEditor({ root, source?, project?, store?, onCompile, onPreview?, onCancel?, onSourceChange?, renderPdf?,
 *   typesetMath?, onCursor?, onPreviewPick?, previewIntervalMs? })
 * onCompile({source, root, files, filesRev, revision, reason}) may return {pdf:Uint8Array, revision?, durationMs?},
 *   or {empty:true} for a document without pages; files are the project's other files as {path, data, rev}.
 *   Never return a fake PDF.
 * onPreview(request) uses the same input, returning true, 'reflow' (settle after idle), or false (full pass).
 * renderPdf({bytes, container, signal, zoom, viewport, width, dark}) renders into an offscreen container; only a
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
    compiling:false,previewing:false,busy:false,pdf:null,meta:null,run:0,logs:[],problems:[],problemFilter:'all',failed:false,live:null,latency:[],marker:null,dirty:false,save:'off',destroyed:false,
    timeline:[],timelineId:0,livePages:[],engineInfo:{live:'off',restarts:0},lastFullMs:null};
  const views=new Map(),removers=[];
  let structure={headings:[],labels:[],paths:[]},wordTotal=0,wordSections=[],historyId=globalThis.crypto.randomUUID();
  let tabs=[],active=null,compileTimer,settleTimer,busyTimer,zoomTimer,saveTimer,metaTimer,barTimer,hoverFrame,hoverPoint,rendererAbort,pdfSequence=0,previewRun=0,store=null,saving=false,restoring=false,storageWarned=false;
  let pending=emptyPending(),panelAuto=false,lastPulse=0,panelMotion=null,inkTimer;const inks=new Map();
  // Projects: `store` holds every project (or is a single-project store); `scoped` is the open project's view of it.
  let scoped=null,currentId=null,switching=false;
  const multi=()=>!!store?.listProjects,saver=()=>multi()?scoped:store;
  root.innerHTML=shell();
  const app=root.firstElementChild;
  const $=id=>root.querySelector(`[data-id="${id}"]`);
  const action=name=>root.querySelector(`[data-action="${name}"]`);
  const listen=(element,type,handler,config)=>{element.addEventListener(type,handler,config);removers.push(()=>element.removeEventListener(type,handler,config));};
  const viewport=$('preview-viewport'),marker=Object.assign(document.createElement('div'),{className:'sync-marker'});
  const thumbs=createThumbnails($('thumbs'),{t,pages:()=>[...viewport.querySelectorAll('canvas[data-page]')],goTo:number=>goToPage(number)});
  const toaster=createToast($('toast')),toast=(text,undo,group)=>toaster.show(text,undo,group),tips=createTooltips(app);
  const notify=(key,values)=>toast(t(key,values));
  const download=(data,name,type)=>{const url=URL.createObjectURL(new Blob([data],{type})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
  const mainText=()=>project.get(project.main)?.text??'';
  const outline=createOutline($('outline'),t,reveal),labelsView=createLabels($('labels'),t,reveal);
  const motion=()=>!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches&&app.classList.contains('ready');
  for(const id of ['tree','outline','labels','problems','logs'])removers.push(watchEdges($(id),$(id).parentElement).destroy);
  const activeEditor=()=>views.get(active)?.editor;
  const focusEditor=()=>activeEditor()?.focus();
  function commands(){return [
    {label:'palette.open',key:'Mod+K',icon:'search',run:palette},
    {label:'find.open',key:'Mod+F',icon:'search',run:()=>previewFocused()?openPdfFind():views.get(active)?.find?.open(),disabled:!activeEditor()&&!state.pdf},
    {label:'pdfFind.open',icon:'search',run:()=>openPdfFind(),disabled:!state.pdf},
    {label:'find.replaceOpen',key:'Mod+Shift+H',icon:'edit',run:()=>views.get(active)?.find?.open(true),disabled:!activeEditor()},
    {label:'compile.run',key:'Mod+Enter',icon:'play',run:()=>compile(),disabled:state.engine!=='ready'},
    {label:'keys.save',key:'Mod+S',icon:'check',run:()=>void flush()},
    {label:'sidebar.toggle',key:'Mod+B',icon:'sidebar',run:()=>toggleSidebar()},
    {label:'panel.toggle',key:'Mod+J',icon:'warning',run:()=>set('panel',!settings.panel)},
    {label:'layout.label',key:'Mod+\\',icon:'sidebar',run:()=>{const order=['split','source','preview'];setLayout(order[(order.indexOf(shownLayout())+1)%3]);}},
    {label:'settings.open',key:'Mod+,',icon:'settings',run:()=>toggleSettings()},
    {label:'projects.open',key:'Mod+O',icon:'projects',run:()=>void openProjects()},
    {label:'project.new',icon:'template',run:()=>templateGallery()},
    {label:'project.import',icon:'upload',run:()=>$('zip-input').click()},
    {label:'export.open',icon:'download',run:exportMenu},
    {label:'compile.auto',icon:'bolt',run:()=>set('autoCompile',!settings.autoCompile)},
    {label:'outline.title',icon:'outline',run:()=>showSide('outline',true)},
    {label:'labels.title',icon:'hash',run:()=>showSide('labels',true)},
    {label:'words.title',icon:'hash',run:wordDetails},
    {label:'symbols.open',icon:'sigma',run:symbols,disabled:!activeEditor()},
    {label:'table.title',icon:'table',run:()=>insertTable('table'),disabled:!activeEditor()||!isTex(active)},
    {label:'matrix.title',icon:'table',run:()=>insertTable('matrix'),disabled:!activeEditor()||!isTex(active)},
    {label:'fix.open',key:'Mod+.',icon:'bulb',run:()=>openFixes(),disabled:!activeEditor()},
    {label:'rename.title',icon:'rename',run:()=>renameAt(active),disabled:!activeEditor()||!isTex(active)},
    {label:'refs.find',icon:'hash',run:()=>referencesAt(active),disabled:!activeEditor()||!isTex(active)},
    {label:'history.open',icon:'history',run:history},
    {label:'insp.title',icon:'bolt',run:openInspector},
    {label:'thumbs.toggle',key:'Mod+Alt+T',icon:'pages',run:()=>set('thumbs',!settings.thumbs)},
    {label:'keys.title',icon:'keyboard',run:shortcutSheet},
    ...['source','split','preview'].map(value=>({label:'view.'+value,icon:'sidebar',run:()=>setLayout(value)})),
    ...['system','light','dark'].map(value=>({label:'set.theme.'+value,icon:'settings',run:()=>set('theme',value)})),
  ];}
  function palette(){
    popover?.hide();updateProject();
    const lines=(text,from,count)=>text.split('\n').slice(from,from+count).join('\n');
    openPalette({host:app,t,onClose:focusEditor,sources:{
      files:()=>project.paths().map(path=>({id:'file:'+path,label:path,icon:isImagePath(path)?'image':'file',run:()=>openFile(path,{focus:true}),
        preview:()=>{const file=project.get(path);return {title:path,text:typeof file?.text==='string'?lines(file.text,0,40):`${t('binary.note')} · ${(file.data.length/1024).toFixed(1)} KB`};}})),
      sections:()=>[
        ...structure.headings.map(h=>({id:`section:${h.file}:${h.title}`,label:[h.number,h.title].filter(Boolean).join(' '),detail:`${h.file}:${h.line}`,icon:'outline',run:()=>reveal({path:h.file,line:h.line}),
          preview:()=>({title:`${h.file}:${h.line}`,text:lines(project.get(h.file)?.text||'',h.line-1,30)})})),
        ...structure.labels.map(l=>({id:'label:'+l.name,label:l.name,detail:`${l.file}:${l.line}`,icon:'hash',keywords:l.text,run:()=>reveal({path:l.file,line:l.line}),
          preview:()=>({title:`${l.file}:${l.line}`,text:lines(project.get(l.file)?.text||'',Math.max(0,l.line-4),24)})}))],
      commands:()=>commands().filter(c=>c.label!=='palette.open').map(c=>({...c,id:'cmd:'+c.label,label:t(c.label),hint:c.key?keys(c.key):''})),
      symbols:()=>activeEditor()?SYMBOLS.map(symbol=>({id:'sym:'+symbol.name,label:'\\'+symbol.name,glyph:symbol.glyph,detail:t('symbols.'+symbol.group),run:()=>{const editor=activeEditor();if(!editor)return;const at=editor.input.selectionStart;editor.edit(at,editor.input.selectionEnd,'\\'+symbol.name+(symbol.name==='sqrt'?'{}':' '),symbol.name==='sqrt'?at+6:undefined);}})):[],
      line:n=>active&&views.get(active)?.editor?{label:t('palette.line',{n}),icon:'hash',run:()=>reveal({path:active,line:n})}:null,
    }});
  }

  // ---- settings ---------------------------------------------------------------------------------
  const darkQuery=globalThis.matchMedia?.('(prefers-color-scheme: dark)'),narrowQuery=globalThis.matchMedia?.('(max-width: 780px)');
  // On a narrow screen the file list is a drawer over the editor: closed by default, never persisted.
  let drawer=false;
  const sidebarOpen=()=>narrowQuery?.matches?drawer:settings.sidebarOpen;
  function toggleSidebar(open=!sidebarOpen()){
    if(narrowQuery?.matches){drawer=open;applyLayout();return;}
    if(open===settings.sidebarOpen)return;
    settings.sidebarOpen=open;saveSettings(settings);slideSidebar(open);
  }
  // The panes take their new widths once, at the start; then only transforms move until the sidebar is in place.
  let sidebarMotion=[];
  function slideSidebar(open){
    for(const animation of sidebarMotion)animation.cancel();sidebarMotion=[];
    const side=$('sidebar'),width=settings.sidebar;
    if(!motion()||!side.animate){applyLayout();return;}
    app.dataset.sidebar=open?'open':'closing';applyLayout();
    const rest=[...$('main').children].filter(node=>node!==side&&node.getClientRects().length),timing={duration:open?200:150,easing:open?'cubic-bezier(.2,0,0,1)':'cubic-bezier(.4,0,1,1)'};
    const from=open?`translateX(${-width}px)`:`translateX(${width}px)`;
    sidebarMotion=[side.animate(open?[{transform:from},{transform:'none'}]:[{transform:'none'},{transform:`translateX(${-width}px)`}],timing),...rest.map(node=>node.animate([{transform:from},{transform:'none'}],timing))];
    if(!open)sidebarMotion[0].finished.then(()=>{if(app.dataset.sidebar==='closing'){app.dataset.sidebar='closed';}},()=>{});
  }
  function showSide(view,focus=false){
    toggleSidebar(true);set('sideView',view);
    if(focus)$(view==='files'?'tree':view).querySelector('[aria-current="true"],[aria-selected="true"],button,[tabindex="0"]')?.focus();
  }
  function applySide(){
    const switcher=$('side-switch');
    for(const button of switcher.querySelectorAll('button')){const on=button.dataset.side===settings.sideView;button.setAttribute('aria-selected',String(on));button.tabIndex=on?0:-1;}
    for(const view of root.querySelectorAll('.side-view'))view.hidden=view.dataset.view!==settings.sideView;
    placeThumb(switcher);
  }
  const darkPages=()=>settings.darkPages&&app.dataset.theme==='dark';
  let pagesDark=false;
  function applyAppearance(){
    const theme=settings.theme==='system'?(darkQuery?.matches?'dark':'light'):settings.theme;
    for(const target of [app,document.documentElement]){target.dataset.theme=theme;target.dataset.accent=settings.accent;}
    app.dataset.darkPages=String(settings.darkPages);document.documentElement.lang=i18n.lang==='zh'?'zh-CN':'en';
    // Dark pages are drawn into the page bitmaps, so a change redraws the pages.
    if(darkPages()!==pagesDark){pagesDark=darkPages();if(state.pdf){clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,0);}}
  }
  const placeThumb=control=>{
    const thumb=control.querySelector('.seg-thumb'),on=control.querySelector('[aria-checked="true"],[aria-selected="true"]');
    if(thumb){thumb.style.width=(on?.offsetWidth||0)+'px';thumb.style.transform=`translateX(${on?.offsetLeft||0}px)`;}
  };
  const shownLayout=()=>narrowQuery?.matches?(app.dataset.view==='preview'?'preview':'source'):settings.layout;
  function applyLayout(){
    app.style.setProperty('--sidebar-w',settings.sidebar+'px');app.style.setProperty('--split',String(settings.split));
    const side=sidebarOpen()?'open':'closed';if(!(side==='closed'&&app.dataset.sidebar==='closing'))app.dataset.sidebar=side;app.dataset.layout=settings.layout;
    for(const button of $('layout').querySelectorAll('button'))button.setAttribute('aria-checked',String(button.dataset.value===shownLayout()));
    placeThumb($('layout'));
  }
  /** 'source' | 'split' | 'preview'. A narrow screen shows one pane at a time and does not keep the choice. */
  function setLayout(value){
    if(narrowQuery?.matches){app.dataset.view=value==='preview'?'preview':'source';applyLayout();}else transitionLayout(()=>set('layout',value));
    layoutPages();popover?.place();placeTabs();
  }
  // Switching layouts lays the panes out once, then moves them from where they were with transforms.
  // A pane that is going away stays drawn above nothing but the background while it slides out.
  let layoutMotion=[];
  function transitionLayout(change){
    const panes=[root.querySelector('.editor-pane'),root.querySelector('.preview-pane')];
    for(const animation of layoutMotion)animation.finish();layoutMotion=[];
    if(!motion()||!panes[0].animate){change();return;}
    const box=$('main').getBoundingClientRect(),before=panes.map(pane=>pane.getClientRects().length?pane.getBoundingClientRect():null);
    change();
    const after=panes.map(pane=>pane.getClientRects().length?pane.getBoundingClientRect():null),timing={duration:300,easing:'cubic-bezier(.2,0,0,1)'};
    panes.forEach((pane,index)=>{
      const from=before[index],to=after[index],side=index?1:-1;
      if(from&&to){
        const dx=from.left-to.left;
        if(Math.abs(dx)>.5)layoutMotion.push(pane.animate([{transform:`translateX(${dx}px)`},{transform:'none'}],timing));
        else if(to.width-from.width>.5)layoutMotion.push(pane.animate([{clipPath:`inset(0 ${to.width-from.width}px 0 0)`},{clipPath:'inset(0)'}],timing));
      }else if(to)layoutMotion.push(pane.animate([{transform:`translateX(${side*to.width}px)`},{transform:'none'}],timing));
      else if(from){
        pane.dataset.leaving='';Object.assign(pane.style,{left:from.left-box.left+'px',top:'0px',width:from.width+'px',height:from.height+'px'});
        const animation=pane.animate([{transform:'none',opacity:1},{transform:`translateX(${side*from.width*.35}px)`,opacity:0}],{...timing,duration:240});
        const done=()=>{delete pane.dataset.leaving;for(const key of ['left','top','width','height'])pane.style[key]='';};
        animation.finished.then(done,done);layoutMotion.push(animation);
      }
    });
  }
  function set(key,value){
    if(settings[key]===value)return;
    settings[key]=value;saveSettings(settings);
    if(key==='theme'||key==='accent'||key==='darkPages')applyAppearance();
    else if(key==='lang'){i18n.set(value);applyAppearance();refreshText();}
    else if(key==='sidebar'||key==='split'||key==='sidebarOpen'||key==='layout')applyLayout();
    else if(key==='sideView')applySide();
    else if(key==='thumbs'){applyThumbs();action('toggle-thumbs').setAttribute('aria-pressed',String(value));}
    else if(['fontSize','wrap','autoClose','tabSize','spellcheck'].includes(key)){for(const view of views.values())view.editor?.configure(settings);popover?.place();}
    else if(key==='autoCompile'){$('auto-compile').checked=value;$('preview-status').dataset.auto=String(value);clearTimeout(compileTimer);clearTimeout(settleTimer);compileTimer=null;if(value&&state.pdfRevision!==state.revision)scheduleCompile();}
    else if(key==='mathPreview'||key==='mathScale'){popover?.hide();if(value)updateMath();}
    else if(key==='persist')void persistChanged();
    else if(key==='panel'||key==='panelTab')renderPanel();
    else if(key==='follow')placeMarker(true);
    syncSettings();
  }
  // Settings: a dialog with categories on the left and a search across every row; changes apply at once.
  let settingsGroup='appearance',settingsQuery='',settingsReturn=null;
  function renderSettings(){
    const panel=$('settings');panel.replaceChildren();panel.setAttribute('aria-modal','true');panel.setAttribute('aria-labelledby','settings-title');
    const card=make('div','settings-card'),head=make('header','settings-head'),body=make('div','settings-body'),nav=make('nav','settings-nav'),pane=make('div','settings-pane');
    const title=make('h2','',t('settings.open'));title.id='settings-title';
    const search=make('label','settings-search');search.innerHTML=icon('search',14);
    const query=make('input');query.type='search';query.placeholder=t('set.search');query.setAttribute('aria-label',t('set.search'));query.value=settingsQuery;search.append(query);
    const close=make('button','icon-btn');close.type='button';close.innerHTML=icon('close');close.setAttribute('aria-label',t('common.close'));close.dataset.tip=t('common.close');close.onclick=()=>toggleSettings(false);
    head.append(title,search,close);nav.setAttribute('role','tablist');nav.setAttribute('aria-orientation','vertical');
    for(const [id,key] of SETTING_GROUPS){
      const tab=make('button','settings-tab',t(key));tab.type='button';tab.setAttribute('role','tab');tab.dataset.group=id;
      tab.onclick=()=>{settingsGroup=id;settingsQuery='';query.value='';filterSettings();};nav.append(tab);
    }
    nav.addEventListener('keydown',event=>{
      if(event.key!=='ArrowDown'&&event.key!=='ArrowUp')return;event.preventDefault();
      const ids=SETTING_GROUPS.map(([id])=>id),next=ids[(ids.indexOf(settingsGroup)+(event.key==='ArrowDown'?1:ids.length-1))%ids.length];
      settingsGroup=next;settingsQuery='';query.value='';filterSettings();nav.querySelector(`[data-group="${next}"]`).focus();
    });
    const reset=make('button','text-btn settings-reset');reset.type='button';reset.innerHTML=icon('history',14);reset.append(t('set.reset'));
    reset.addEventListener('click',()=>{for(const key of Object.keys(DEFAULT_SETTINGS))if(!['sidebarOpen','panel','panelTab','persist'].includes(key))set(key,DEFAULT_SETTINGS[key]);layoutPages();});
    nav.append(make('span','spacer'),reset);
    for(const [id,heading,rows] of SETTINGS){
      const section=make('section');section.dataset.group=id;section.append(make('h3','',t(heading)));
      for(const [key,kind,values] of rows){
        const row=make('div','setting'),text=make('div','setting-text');text.append(make('span','setting-label',t('set.'+key)),make('span','setting-desc',t('set.'+key+'.desc')));row.append(text);
        row.dataset.search=(t('set.'+key)+' '+t('set.'+key+'.desc')+' '+key).toLowerCase();
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
          button.addEventListener('click',()=>key==='spread'?setSpread(value):set(key,value));control.append(button);
        }
        row.append(control);section.append(row);
      }
      pane.append(section);
    }
    // Keyboard shortcuts are a category of their own, searchable like the rest.
    const keysSection=make('section');keysSection.dataset.group='shortcuts';keysSection.append(make('h3','',t('keys.title')));
    const list=make('dl','keys');
    for(const [label,combo] of [...commands().filter(c=>c.key).map(c=>[c.label,c.key]),...EDITOR_SHORTCUTS]){
      const term=make('dt','',t(label)),cell=make('dd');term.dataset.search=cell.dataset.search=t(label).toLowerCase()+' '+combo.toLowerCase();
      for(const part of combo.split(' / '))cell.append(Object.assign(document.createElement('kbd'),{textContent:keys(part)}));
      list.append(term,cell);
    }
    keysSection.append(list);pane.append(keysSection,make('p','settings-empty',t('set.none')));
    body.append(nav,pane);card.append(head,body);panel.append(card);
    query.addEventListener('input',()=>{settingsQuery=query.value;filterSettings();});
    query.addEventListener('keydown',event=>{if(event.key==='Escape'&&query.value){event.preventDefault();event.stopPropagation();query.value=settingsQuery='';filterSettings();}});
    syncSettings();filterSettings();
  }
  // One category at a time; a search shows matching rows from every category under their headings.
  function filterSettings(){
    const panel=$('settings'),needle=settingsQuery.trim().toLowerCase();let any=false;
    for(const tab of panel.querySelectorAll('.settings-tab')){const on=!needle&&tab.dataset.group===settingsGroup;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;}
    for(const section of panel.querySelectorAll('.settings-pane section')){
      let shown=0;
      for(const row of section.querySelectorAll('[data-search]')){const match=!needle||row.dataset.search.includes(needle);row.hidden=!match;if(match)shown++;}
      section.hidden=needle?!shown:section.dataset.group!==settingsGroup;if(!section.hidden)any=true;
    }
    panel.querySelector('.settings-empty').hidden=any;
    if(!panel.hidden)for(const control of panel.querySelectorAll('.segmented'))placeThumb(control);
  }
  function syncSettings(){
    for(const control of $('settings').querySelectorAll('[data-setting]')){
      const value=settings[control.dataset.setting],box=control.querySelector('input'),output=control.querySelector('output');
      if(box)box.checked=!!value;else if(output)output.textContent=String(value);
      else{for(const button of control.querySelectorAll('button'))button.setAttribute('aria-checked',String(button.dataset.value===String(value)));placeThumb(control);}
    }
  }
  function toggleSettings(show=$('settings').hidden,group){
    const panel=$('settings');if(group){settingsGroup=group;settingsQuery='';const input=panel.querySelector('.settings-search input');if(input)input.value='';}
    if(show===!panel.hidden){if(group)filterSettings();return;}
    if(show)settingsReturn=document.activeElement;
    panel.hidden=!show;action('settings').setAttribute('aria-expanded',String(show));
    // Modal while open: the rest of the workspace is inert.
    for(const node of app.children)if(node!==panel&&!node.classList.contains('toasts'))node.inert=show;
    if(show){filterSettings();panel.querySelector('.settings-search input')?.focus({preventScroll:true});}
    else settingsReturn?.focus?.({preventScroll:true});
  }
  const shortcutSheet=()=>toggleSettings(true,'shortcuts');


  // ---- status -----------------------------------------------------------------------------------
  // ---- live inspector and PDF sync -------------------------------------------------------------
  function record(kind,ms){
    const last=state.timeline.at(-1);
    if(kind==='waiting'&&last?.kind==='waiting'){last.at=Date.now();return;}
    state.timeline.push({id:++state.timelineId,kind,ms,at:Date.now()});if(state.timeline.length>48)state.timeline.shift();
  }
  let inspector=null;
  const lag=()=>state.pdf&&state.pdfRevision>=0?Math.max(0,state.revision-state.pdfRevision):0;
  function inspectorData(){
    const explain=reason=>{const found=explainReason(reason);return found&&{...found,text:describeReason(reason)};};
    return {timeline:state.timeline,live:state.live,explain,pages:state.livePages,engine:state.engineInfo,lag:lag(),settling:!!settleTimer||!!viewport.querySelector('canvas.provisional'),compiling:state.compiling};
  }
  function openInspector(){
    if(inspector){inspector.surface.close();return;}
    const view=createInspector({t});view.render(inspectorData());
    const anchor=$('preview-status');anchor.dataset.popoverAnchor='';
    inspector={view,surface:openPopover(app,anchor.getBoundingClientRect(),view.el,{className:'inspector-pop',label:t('insp.title'),onClose:()=>{inspector=null;delete anchor.dataset.popoverAnchor;}})};
  }
  const renderInspector=()=>inspector?.view.render(inspectorData());
  function updatePdfSync(){
    const badge=$('pdf-sync'),behind=lag();badge.hidden=!state.pdf;
    badge.textContent=state.compiling&&behind?t('pdf.updating'):behind?t('pdf.behind',{n:behind}):t('pdf.synced');
    badge.dataset.state=state.compiling&&behind?'busy':behind?'lag':'ok';badge.dataset.tip=t(behind?'pdf.syncNow':'pdf.syncedTip');
  }
  function updateStatus(){
    const shown=state.previewRevision>=0,stale=shown&&state.previewRevision!==state.revision,name=state.busy?'busy':!shown?'none':stale?'stale':state.previewRevision!==state.pdfRevision?'live':'ok';
    const capsule=$('preview-status');capsule.dataset.state=name;capsule.dataset.failed=String(state.failed);$('preview-status-text').textContent=t('status.'+name);
    updatePdfSync();renderInspector();
    const error=state.problems.find(problem=>problem.severity==='error'),banner=$('preview-error');banner.hidden=!state.failed;
    banner.textContent=t(state.pdf?'toast.kept':'toast.failed')+(error?' '+[error.file,error.line].filter(Boolean).join(':')+' · '+error.message:'');
  }
  function updateControls(){
    const run=action('compile'),stop=action('cancel'),idle=state.engine!=='ready'||!state.loaded||!project.main;
    run.disabled=idle||state.compiling;run.hidden=state.busy;stop.hidden=!state.busy;action('capsule').disabled=idle;
    paintCapsuleTip();updateStatus();
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
  /** A fallback reason in the reader's language; reasons this build does not know are shown as written. */
  function describeReason(reason){const found=explainReason(reason);return !found?'':found.code?t('reason.'+found.code,found.values):found.raw;}
  // The capsule's tooltip has one source: stopping while compiling, else why the last update was not local, else compiling now.
  function capsuleTip(){
    if(state.compiling)return t('compile.stop');
    const live=state.live,why=live?.reason&&describeReason(live.reason);
    if(!why)return t('compile.now');
    const head=live.state==='full'?t('live.full')+(Number.isFinite(state.meta?.durationMs)&&state.pdfRevision===state.revision?` · ${(state.meta.durationMs/1000).toFixed(2)} s`:''):live.state==='waiting'?t('live.wait'):live.state==='off'?t('live.off'):t('status.'+(live.state==='reflow'?'live':'ok'));
    return head+'\n'+why;
  }
  function paintCapsuleTip(){const button=action('capsule');button.dataset.tip=capsuleTip();button.setAttribute('aria-label',t(state.compiling?'compile.stop':'compile.now'));}
  function updateLive(){
    const live=state.live,el=$('stat-live');
    el.textContent=!live?'':live.state==='live'||live.state==='reflow'?t(live.state==='reflow'?'live.reflow':'live.ms',{ms:live.ms<10?live.ms.toFixed(1):Math.round(live.ms)}):live.state==='full'?t('live.full'):live.state==='waiting'?t('live.wait'):live.state==='off'?t('live.off'):'';
    el.dataset.state=live?.state||'';$('preview-status').dataset.live=live?.state||'';
    paintCapsuleTip();
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
    const files=textFiles();structure=parseOutline(files,project.main);
    wordTotal=structure.paths.reduce((n,path)=>n+wordCount(files.get(path)||''),0);
    wordSections=structure.headings.map((h,i)=>({heading:h,n:wordCount((files.get(h.file)||'').slice(h.offset,structure.headings.slice(i+1).find(next=>next.file===h.file)?.offset))}));
    structure.references=referenceCounts(files);nowKey=null;
    outline.update(structure.headings,state.problems,wordSections);labelsView.update(structure.labels,structure.references);syncCursorViews();markBroken();crumbs.reset();queueCrumbs();
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
    const panel=$('panel'),shown=panel.dataset.motion?panel.dataset.motion==='in':!panel.hidden;
    if(settings.panel!==shown)slidePanel(settings.panel);
    for(const tab of panel.querySelectorAll('.panel-tab'))tab.setAttribute('aria-selected',String(tab.dataset.panel===settings.panelTab));
    $('problems').hidden=settings.panelTab!=='problems';$('logs').hidden=settings.panelTab!=='log';$('refs').hidden=settings.panelTab!=='refs';action('clear-log').hidden=settings.panelTab!=='log';
    action('copy-log').hidden=settings.panelTab!=='log';action('problem-filter').hidden=settings.panelTab!=='problems';panel.inert=!settings.panel;
  }
  // The panel slides over the editor and takes its height once it is in place; leaving, it gives the height back first.
  function slidePanel(open){
    const panel=$('panel');panelMotion?.cancel();panelMotion=null;delete panel.dataset.motion;
    if(!motion()||!panel.animate){panel.hidden=!open;return;}
    panel.hidden=false;panel.dataset.motion=open?'in':'out';
    const height=panel.offsetHeight,timing={duration:open?200:150,easing:open?'cubic-bezier(.2,0,0,1)':'cubic-bezier(.4,0,1,1)'};
    const animation=panelMotion=panel.animate(open?[{transform:`translateY(${height}px)`},{transform:'none'}]:[{transform:'none'},{transform:`translateY(${height}px)`}],timing);
    animation.finished.then(()=>{if(panelMotion!==animation)return;panelMotion=null;delete panel.dataset.motion;panel.hidden=!open;},()=>{});
  }
  function openPanel(tab=settings.panelTab){set('panelTab',tab);set('panel',true);}
  /** Every place that refers to a label, listed in the panel's References tab. */
  function findAllReferences(name){
    const files=textFiles(),found=findReferences(files).filter(ref=>ref.name===name),definition=findLabels(files).find(label=>label.name===name),list=$('refs');list.replaceChildren();
    const head=make('div','refs-head');head.append(make('b','',name),make('span','',found.length?t('labels.refs',{n:found.length}):t('labels.unused')));list.append(head);
    for(const item of [...(definition?[{...definition,command:'label'}]:[]),...found]){
      const source=files.get(item.file),from=source.lastIndexOf('\n',item.start-1)+1,to=source.indexOf('\n',item.start),line=source.slice(from,to<0?source.length:to);
      const row=make('button','problem ref-row');row.type='button';row.innerHTML=icon(item.command==='label'?'target':'hash',14)+'<span class="problem-text"></span><span class="problem-where"></span>';
      const textNode=row.children[1],before=line.slice(0,item.start-from).trimStart(),after=line.slice(item.end-from);
      textNode.append(make('span','',before.length>48?'…'+before.slice(-48):before),make('mark','',item.name),make('span','',after.length>64?after.slice(0,64)+'…':after));
      row.children[2].textContent=`${item.file}:${item.line}`;row.onclick=()=>reveal({path:item.file,offset:item.start});list.append(row);
    }
    $('refs-tab').hidden=false;$('refs-count').textContent=String(found.length);openPanel('refs');
  }
  function renderProblems(){
    const list=$('problems'),counts={error:0,warning:0,info:0},marksByFile=new Map(),rank={error:3,warning:2,info:1},context=fixContext();list.replaceChildren();
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
      view.editor.setDiagnostics(state.problems.filter(problem=>problem.file===path).map(problem=>({...problem,fixable:isTex(path)&&quickFixes(problem,context).length>0})));
    }
    outline.update(structure.headings,state.problems,wordSections);nowKey=null;syncCursorViews();
  }
  // The outline, labels and the files view's "this section" summary all follow the caret.
  let nowKey=null;
  function syncCursorViews(){
    const line=views.get(active)?.position?.line||1,heading=outline.cursor(active,line);labelsView.cursor(active,line);
    const list=structure.headings,index=list.indexOf(heading),start=Math.max(0,Math.min(index-1,list.length-2)),pair=list.slice(start,start+2),key=pair.map(item=>item.offset+item.file).join()+index;
    if(key===nowKey)return;nowKey=key;
    const box=$('side-now');box.hidden=!pair.length;box.replaceChildren(Object.assign(document.createElement('span'),{className:'side-now-title',textContent:t('side.now')}));
    for(const item of pair){
      const row=document.createElement('button');row.type='button';row.setAttribute('aria-current',String(item===heading));row.innerHTML='<b></b><span></span><small></small>';
      row.firstChild.textContent=item.number;row.children[1].textContent=item.title;row.lastChild.textContent=(wordSections.find(entry=>entry.heading===item)?.n??0).toLocaleString();
      row.dataset.tip=`${item.file}:${item.line}`;row.onclick=()=>reveal({path:item.file,line:item.line});box.append(row);
    }
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
      view.editor=createCodeEditor({value:file.text,settings,label:t('editor.label'),describedBy:'editor-keyboard-help',structure:isTex(path),
        onChange:value=>project.write(path,value,'editor'),
        onCursor:position=>{
          view.position=position;
          if(active!==path)return;
          $('cursor-status').textContent=t('cursor',position);updateMath();syncCursorViews();updateWords();queueCrumbs();
          options.onCursor?.({path,offset:position.offset,line:position.line,main:path===project.main});
        },
        onQuickFix:(line,at)=>openFixes(path,line,at),
        onEscape:()=>{
          if(popover?.dismiss())return;
          if(state.compiling){cancel();return;}
          $('tabs').querySelector('[aria-selected="true"]')?.focus();
        }});
      view.editor.input.addEventListener('blur',()=>popover?.hide());
      view.find=createFindBar(view.editor,t);
      if(isTex(path))view.complete=createCompletion(view.editor,{t,context:()=>({files:new Map(project.files().map(f=>[f.path,f.text])),labels:structure.labels,
        bib:bibEntries().map(entry=>({key:entry.key,byline:byline(entry),title:plainField(entry.fields.title)}))}),onVisible:visible=>{if(visible)popover?.hide();}});
      wireInsertion(view.editor,path);view.edges=watchEdges(view.editor.scroller,view.editor.el);
      if(isTex(path)){
        view.card=createHoverCard(view.editor,{describe:(offset,config)=>describeTarget(path,offset,config)});
        // Command/Control-click or F12 follows what the source points to.
        view.editor.input.addEventListener('click',event=>{if((event.metaKey||event.ctrlKey)&&!event.altKey&&follow(path,view.editor.caret))event.preventDefault();});
        view.editor.input.addEventListener('keydown',event=>{
          if(event.metaKey||event.ctrlKey||event.altKey)return;
          if(event.key==='F12'&&event.shiftKey){event.preventDefault();referencesAt(path);}
          else if(event.key==='F12'){event.preventDefault();if(!follow(path,view.editor.caret))notify('follow.none');}
          else if(event.key==='F2'&&!event.shiftKey){event.preventDefault();renameAt(path);}
        });
      }
      view.editor.scroller.addEventListener('scroll',()=>{if(active===path)queueCrumbs();},{passive:true});
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
  function dropView(path){const view=views.get(path);if(!view)return;view.edges?.destroy();view.card?.destroy();view.complete?.destroy();view.find?.destroy();view.editor?.destroy();if(view.url)URL.revokeObjectURL(view.url);view.el.remove();views.delete(path);}
  // Tabs are kept by path: only an opened or closed tab enters or leaves, and its neighbours slide to make room.
  const tabNodes=new Map();
  function renderTabs(){
    const bar=$('tabs'),fresh=[];
    for(const [path,tab] of tabNodes)if(!tabs.includes(path)){tabNodes.delete(path);leaveTab(tab);}
    tabs.forEach((path,index)=>{
      let tab=tabNodes.get(path);
      if(!tab){tab=document.createElement('div');tab.className='tab';tab.draggable=true;tab.setAttribute('role','tab');tab.dataset.path=path;tabNodes.set(path,tab);fresh.push(tab);}
      tab.tabIndex=0;tab.setAttribute('aria-selected',String(path===active));tab.dataset.tip=path;
      // Same-named files in different folders show their folder.
      const twin=tabs.some(other=>other!==path&&basename(other)===basename(path))&&dirname(path);
      tab.innerHTML=(path===project.main?`<span class="tab-main">${icon('target',12)}</span>`:'')+'<span class="tab-name"></span>'+(twin?'<span class="tab-dir"></span>':'')+`<button type="button" class="icon-btn tab-close" tabindex="-1">${icon('close',12)}</button>`;
      const name=tab.querySelector('.tab-name');name.textContent=basename(path);if(path===active)name.dataset.id='filename';
      if(twin)tab.querySelector('.tab-dir').textContent=twin;
      tab.lastChild.setAttribute('aria-label',t('tab.close'));
      const placed=[...bar.children].filter(node=>!node.classList.contains('leaving'));
      if(placed[index]!==tab)bar.insertBefore(tab,placed[index]||null);
    });
    if(motion())for(const tab of fresh){const width=tab.offsetWidth;tab.animate?.([{maxWidth:'0px',opacity:0,paddingLeft:'0px',paddingRight:'0px'},{maxWidth:width+'px',opacity:1}],{duration:200,easing:'cubic-bezier(.2,0,0,1)'})?.finished.then(placeTabs,()=>{});}
    $('editor-empty').hidden=!!active;placeTabs();
  }
  function leaveTab(tab){
    if(!motion()||!tab.animate||!tab.isConnected){tab.remove();return;}
    tab.classList.add('leaving');tab.removeAttribute('role');tab.removeAttribute('aria-selected');tab.inert=true;
    tab.animate([{maxWidth:tab.offsetWidth+'px',opacity:1},{maxWidth:'0px',opacity:0,paddingLeft:'0px',paddingRight:'0px'}],{duration:150,easing:'cubic-bezier(.4,0,1,1)'}).finished.then(()=>{tab.remove();placeTabs();},()=>tab.remove());
  }
  // The active tab's indicator is one bar that slides; the tab list itself holds nothing but tabs.
  function placeTabs(){const bar=$('tabs'),on=bar.querySelector('.tab:not(.leaving)[aria-selected="true"]');bar.style.setProperty('--ind-x',(on?.offsetLeft||0)+'px');bar.style.setProperty('--ind-w',(on?.offsetWidth||0)+'px');bar.dataset.left=String(bar.scrollLeft>2);bar.dataset.right=String(bar.scrollLeft+bar.clientWidth<bar.scrollWidth-2);}
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
    renderTabs();tree.setActive(path);updateWords();syncCursorViews();markBroken(path);queueCrumbs();if(state.loaded)queueSave();
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

  // ---- where the source points: jumps, hover cards, breadcrumbs ---------------------------------
  const textFiles=()=>new Map(project.files().filter(file=>typeof file.text==='string').map(file=>[file.path,file.text]));
  /** A project file for \input, \includegraphics or \bibliography arguments, as TeX would look it up. */
  function resolveFile(name,kind){
    const clean=String(name).trim().replace(/^\.\//,''),extensions=kind==='graphics'?['','.pdf','.png','.jpg','.jpeg']:kind==='bib'?['.bib','']:['','.tex'];
    for(const dir of [...new Set(['',dirname(project.main||'')])])for(const extension of extensions){
      try{const path=normalizePath(joinPath(dir,clean+extension));if(project.has(path))return path;}catch{/* not a project path */}
    }
    return null;
  }
  const bibEntries=()=>project.files().filter(file=>/\.bib$/i.test(file.path)&&typeof file.text==='string').flatMap(file=>parseBib(file.text,file.path));
  /** Follow what the source at offset points to. Returns false when there is nothing to follow. */
  function follow(path,offset){
    const text=project.get(path)?.text;if(typeof text!=='string')return false;
    const target=targetAt(text,offset);if(!target)return false;
    const go=place=>{if(!place)return false;reveal(place);return true;};
    if(target.kind==='ref'){const label=findLabels(textFiles()).find(label=>label.name===target.name);return go(label&&{path:label.file,offset:label.start});}
    if(target.kind==='label'){findAllReferences(target.name);return true;}
    if(target.kind==='input'||target.kind==='graphics'||target.kind==='bib'){const file=resolveFile(target.name,target.kind);if(!file)return false;openFile(file,{focus:true});return true;}
    if(target.kind==='macro'){const definition=findDefinition(textFiles(),target.name);return go(definition&&{path:definition.file,offset:definition.start});}
    if(target.kind==='cite'){const entry=bibEntries().find(entry=>entry.key===target.name);return go(entry&&{path:entry.file,offset:entry.start});}
    return false;
  }
  const make=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=null)node.textContent=text;return node;};
  function cardMeta(...parts){
    const meta=make('div','card-meta');
    for(const part of parts.filter(Boolean)){if(meta.childNodes.length)meta.append(make('span','',' · '));meta.append(typeof part==='string'?make('span','',part):part);}
    return meta;
  }
  function suggestions(title,options,replace){
    const box=make('div');box.append(make('div','card-title'));box.firstChild.innerHTML=icon('warning',14);box.firstChild.append(title);
    if(options.length){const chips=make('div','card-chips');for(const option of options){const button=make('button','',option);button.type='button';button.dataset.tip=t('follow.replace',{name:option});button.onclick=()=>replace(option);chips.append(button);}box.append(chips);}
    return box;
  }
  const followHint=()=>{const meta=make('div','card-meta');meta.append(Object.assign(make('kbd'),{textContent:mac?'⌘':'Ctrl'}),make('span','',t('follow.hint')));return meta;};
  /** The hover card for offset in path: {start, end, go, content, ready}, or null. peek skips building content. */
  function describeTarget(path,offset,{peek=false}={}){
    const text=project.get(path)?.text;if(typeof text!=='string')return null;
    const target=targetAt(text,offset);if(!target||target.kind==='label'&&peek)return null;
    const base={start:target.start,end:target.end,ready:null};
    const replace=value=>{const editor=views.get(path)?.editor;if(editor&&editor.getValue().slice(target.start,target.end)===target.name){editor.edit(target.start,target.end,value);views.get(path)?.card?.hide();}};
    if(target.kind==='ref'||target.kind==='label'){
      const files=textFiles(),labels=findLabels(files),definition=labels.find(label=>label.name===target.name);
      if(peek)return {...base,go:!!definition};
      const content=make('div');
      if(!definition){content.append(suggestions(t('follow.noLabel',{name:target.name}),nearest(target.name,labels.map(label=>label.name)),replace));return {...base,go:false,content};}
      const info=structure.labels.find(label=>label.name===definition.name&&label.file===definition.file),count=structure.references?.get(definition.name)||0,source=files.get(definition.file);
      const found=info&&/^(?:equation|align|gather|multline|flalign|alignat|eqnarray|displaymath|math)\*?$/.test(info.kind)&&mathAt(source,definition.start);
      if(found&&options.typesetMath){
        const formula=make('div','card-formula');content.append(formula);
        base.ready=options.typesetMath({found,source,scale:'s',maxWidth:400}).then(result=>{if(result?.canvas)formula.replaceChildren(result.canvas);else formula.replaceWith(make('pre','card-code',source.slice(found.start,found.end).trim()));}).catch(()=>formula.remove());
      }else if(info?.text)content.append(make('div','card-text',info.text));
      content.append(cardMeta(make('b','',definition.name),info?.kind,`${definition.file}:${definition.line}`,count?t('labels.refs',{n:count}):t('labels.unused')));
      if(target.kind==='ref')content.append(followHint());
      return {...base,go:target.kind==='ref',content};
    }
    if(target.kind==='input'||target.kind==='graphics'||target.kind==='bib'){
      const file=resolveFile(target.name,target.kind);if(peek)return {...base,go:!!file};
      const content=make('div');
      if(!file){
        const wanted=target.kind==='graphics'?/\.(png|jpe?g|pdf)$/i:target.kind==='bib'?/\.bib$/i:/\.(tex|ltx)$/i,paths=project.paths().filter(path=>wanted.test(path)),stems=new Map(paths.map(path=>[path.replace(/\.[^./]+$/,''),path]));
        content.append(suggestions(t('follow.noFile',{name:target.name}),nearest(target.name.replace(/\.[^./]+$/,''),[...stems.keys()],{limit:6}),replace));return {...base,go:false,content};
      }
      const data=project.get(file);
      if(isImagePath(file)){
        const image=make('img','card-image'),url=URL.createObjectURL(new Blob([data.data]));image.alt=basename(file);image.src=url;content.append(image);
        const size=cardMeta(make('b','',file),`${(data.data.length/1024).toFixed(1)} KB`);content.append(size);
        base.ready=new Promise(resolve=>{image.onload=()=>{size.append(make('span','',' · '),make('span','',`${image.naturalWidth} × ${image.naturalHeight} px`));URL.revokeObjectURL(url);resolve();};image.onerror=()=>{URL.revokeObjectURL(url);resolve();};});
      }else if(typeof data.text==='string'){
        const lines=data.text.split('\n');content.append(make('pre','card-code',lines.slice(0,4).join('\n')),cardMeta(make('b','',file),t('follow.lines',{n:lines.length})));
      }else content.append(cardMeta(make('b','',file),`${(data.data.length/1024).toFixed(1)} KB`));
      content.append(followHint());return {...base,go:true,content};
    }
    if(target.kind==='macro'){
      const definition=findDefinition(textFiles(),target.name);if(!definition||definition.file===path&&definition.start<=target.start&&target.start<=definition.end)return null;
      if(peek)return {...base,go:true};
      const content=make('div');content.append(make('pre','card-code',definition.text.trim()),cardMeta(`${definition.file}:${definition.line}`),followHint());
      return {...base,go:true,content};
    }
    if(target.kind==='cite'){
      const entries=bibEntries(),entry=entries.find(entry=>entry.key===target.name);if(peek)return {...base,go:!!entry};
      const content=make('div');
      if(!entry){content.append(suggestions(t('follow.noCite',{name:target.name}),nearest(target.name,entries.map(entry=>entry.key),{limit:5}),replace));return {...base,go:false,content};}
      content.append(make('div','card-title',plainField(entry.fields.title)||entry.key),make('div','card-text',byline(entry)),cardMeta(make('b','',entry.key),entry.type,`${entry.file}:${entry.line}`),followHint());
      return {...base,go:true,content};
    }
    return null;
  }
  // References to labels, files or citations that do not exist get a dashed underline after a pause.
  function markBroken(path=active){
    const editor=views.get(path)?.editor;if(!editor||!isTex(path))return;
    const text=editor.getValue(),files=textFiles(),names=new Set(findLabels(files).map(label=>label.name)),keys=bibEntries().map(entry=>entry.key),known=new Set(keys),list=[];
    for(const ref of findReferences(new Map([[path,text]])))if(!names.has(ref.name))list.push({start:ref.start,end:ref.end,className:'deco-broken'});
    for(const match of text.matchAll(/\\(includegraphics|input|include)\s*(?:\[[^\]]*\])?\s*\{([^{}\n]+)\}/g)){
      if(/^\s*%/.test(text.slice(text.lastIndexOf('\n',match.index)+1,match.index)))continue;
      if(!resolveFile(match[2],match[1]==='includegraphics'?'graphics':'input')){const start=match.index+match[0].lastIndexOf('{')+1;list.push({start,end:start+match[2].length,className:'deco-broken'});}
    }
    if(keys.length)for(const cite of text.matchAll(/\\(?:[a-zA-Z]*cite[a-zA-Z]*|nocite)\*?\s*(?:\[[^\]]*\]\s*){0,2}\{([^{}]*)\}/g)){
      let at=cite.index+cite[0].lastIndexOf('{')+1;
      for(const part of cite[1].split(',')){const key=part.trim(),start=at+part.indexOf(key);if(key&&key!=='*'&&!known.has(key))list.push({start,end:start+key.length,className:'deco-broken'});at+=part.length+1;}
    }
    editor.setDecorations('broken',list);
  }
  // Breadcrumbs follow the caret; while the caret is scrolled out of view they follow the top of the view.
  const crumbs=createBreadcrumbs($('crumbs'),{t,
    onPath:path=>{toggleSidebar(true);set('sideView','files');tree.reveal(path);},
    onSection:(heading,at)=>{
      const list=structure.headings,index=list.indexOf(heading);if(index<0)return;
      let first=index;while(first>0&&list[first-1].level>=heading.level)first--;
      let last=index;while(last<list.length-1&&list[last+1].level>=heading.level)last++;
      const items=list.slice(first,last+1).filter(item=>item.level===heading.level||item.level===heading.level+1&&list.indexOf(item)>index&&list.slice(index+1,list.indexOf(item)+1).every(other=>other.level>heading.level));
      openMenu(app,at,items.map(item=>({label:(item.level>heading.level?'    ':'')+[item.number,item.title].filter(Boolean).join('  '),checked:item===heading,run:()=>reveal({path:item.file,line:item.line})})));
    },
    onEnvironment:environment=>{const editor=activeEditor();if(editor)editor.select(environment.from,environment.to,{center:false});}});
  let crumbFrame=0;
  const queueCrumbs=()=>{if(!crumbFrame)crumbFrame=(globalThis.requestAnimationFrame||setTimeout)(updateCrumbs);};
  function headingAt(path,line){
    const list=structure.headings,own=list.findLast(heading=>heading.file===path&&heading.line<=line);if(own)return own;
    const first=list.findIndex(heading=>heading.file===path);return first>0?list[first-1]:null;
  }
  function updateCrumbs(){
    crumbFrame=0;
    const view=views.get(active);if(!view?.editor){crumbs.update(active?{path:active}:null);return;}
    const editor=view.editor,scroller=editor.scroller,line=view.position?.line||1,top=editor.lineAtY(scroller.scrollTop+12),bottom=editor.lineAtY(scroller.scrollTop+scroller.clientHeight-12);
    const away=line<top||line>bottom,at=away?top:line,heading=isTex(active)?headingAt(active,at):null;
    let environment=null;
    if(!away&&isTex(active)){
      const text=editor.getValue(),caret=editor.caret,found=environmentAt(text,caret);
      if(found&&found.name!=='document')environment=found;
      else{const math=mathAt(text,caret);if(math&&!math.env)environment={name:math.kind,display:math.kind==='display'?'\\[ … \\]':'$ … $',from:math.start,to:math.end};}
    }
    crumbs.update({path:active,heading,environment,stuck:away&&!!heading&&heading.file===active&&heading.line<top});
  }

  // ---- edits across files, rename and quick fixes -----------------------------------------------
  /** Apply [{file, start, end, text}] as one edit per file. Open editors take theirs natively (one Mod+Z);
   *  returns a function that restores every file that still holds what was written. */
  function applyEdits(edits){
    const byFile=new Map(),undo=[];
    for(const edit of edits){const list=byFile.get(edit.file)||[];list.push(edit);byFile.set(edit.file,list);}
    for(const [file,list] of byFile){
      const source=project.get(file)?.text;if(typeof source!=='string')continue;
      list.sort((a,b)=>a.start-b.start);
      const from=list[0].start,to=Math.max(...list.map(edit=>edit.end));let written='',at=from;
      for(const edit of list){if(edit.start<at)continue;written+=source.slice(at,edit.start)+edit.text;at=edit.end;}
      written+=source.slice(at,to);
      const before=source.slice(from,to);write(file,from,to,written);
      undo.push(()=>{const now=project.get(file)?.text;if(typeof now==='string'&&now.slice(from,from+written.length)===written)write(file,from,from+written.length,before);});
    }
    return ()=>{for(const step of undo.reverse())step();};
  }
  function write(file,from,to,text){
    const editor=views.get(file)?.editor;
    // A file open in a background tab takes the edit on its own undo stack; the focus stays where it was.
    if(editor&&editor.getValue()===project.get(file).text){const focused=document.activeElement;editor.edit(from,to,text);if(file!==active)focused?.focus?.({preventScroll:true});}
    else{const source=project.get(file).text;project.write(file,source.slice(0,from)+text+source.slice(to));}
  }
  /** F2 on a \label or a reference: type the new name, see every affected line, Enter renames them all. */
  function renameAt(path){
    const editor=views.get(path)?.editor;if(!editor||!isTex(path))return;
    const target=targetAt(editor.getValue(),editor.caret);
    if(!target||target.kind!=='label'&&target.kind!=='ref'){notify('rename.none');return;}
    const old=target.name,files=textFiles(),labels=findLabels(files);
    const sites=[...labels.filter(label=>label.name===old).map(label=>({...label,command:'label'})),...findReferences(files).filter(ref=>ref.name===old)].sort((a,b)=>a.file.localeCompare(b.file)||a.start-b.start);
    const box=make('div','rename'),head=make('div','rename-head'),input=make('input','field rename-input'),list=make('div','rename-list'),foot=make('div','rename-foot');
    head.append(make('span','',t('rename.title')),make('code','',old));input.type='text';input.value=old;input.spellcheck=false;input.setAttribute('aria-label',t('rename.title'));
    box.append(head,input,list,foot);
    const count=new Set(sites.map(site=>site.file)).size;
    function check(){
      const next=input.value.trim();
      if(!next)return t('rename.empty');
      if(/[{}\\%#,]/.test(next))return t('rename.invalid');
      if(next!==old&&labels.some(label=>label.name===next))return t('rename.taken',{name:next});
      return '';
    }
    function paint(){
      const next=input.value.trim()||old,problem=check();list.replaceChildren();
      for(const site of sites.slice(0,60)){
        const source=files.get(site.file),from=source.lastIndexOf('\n',site.start-1)+1,end=source.indexOf('\n',site.start),line=source.slice(from,end<0?source.length:end);
        const row=make('div','rename-row'),code=make('code'),before=line.slice(0,site.start-from).trimStart(),after=line.slice(site.end-from);
        code.append(make('span','',before.length>36?'…'+before.slice(-36):before),make('mark','',next),make('span','',after.length>40?after.slice(0,40)+'…':after));
        row.append(make('span','rename-where',`${site.file}:${site.line}`),code);list.append(row);
      }
      foot.dataset.state=problem?'error':'';foot.textContent=problem||t('rename.hint',{n:sites.length,files:count});
    }
    const rect=editor.rectAt(target.start),origin=editor.body.getBoundingClientRect();
    const at={left:origin.left+(rect?.x??0),top:origin.top+(rect?.top??0),bottom:origin.top+(rect?.bottom??0)};
    const surface=openPopover(app,at,box,{className:'rename-pop',label:t('rename.title')});
    input.addEventListener('input',paint);
    input.addEventListener('keydown',event=>{
      if(event.key!=='Enter'||event.isComposing)return;event.preventDefault();
      const next=input.value.trim();if(check())return;
      surface.close(false);editor.focus();
      if(next===old)return;
      const before=sites.filter(site=>site.file===path&&site.start<target.start).length,undo=applyEdits(sites.map(site=>({file:site.file,start:site.start,end:site.end,text:next})));
      const at=target.start+before*(next.length-old.length);views.get(path)?.editor?.select(at,at+next.length,{center:false});
      toast(t('rename.done',{from:old,to:next,n:sites.length}),{label:t('rename.undo'),run:undo});
    });
    paint();input.focus();input.select();
  }
  /** W3: a grid picker; the table or matrix goes in at the caret with its cells as tab stops. */
  function insertTable(mode){
    const editor=activeEditor(),path=active;if(!editor)return;
    const start=editor.input.selectionStart,end=editor.input.selectionEnd,inMath=!!mathAt(editor.getValue(),start);
    openTablePicker({host:app,t,mode,inMath,insert:(template,packages)=>{
      let from=start,to=end;const added=[];
      for(const pkg of packages){
        const source=project.get(project.main)?.text,edit=typeof source==='string'&&packageEdit(project.main,source,pkg);if(!edit)continue;
        applyEdits([edit]);added.push(pkg);if(project.main===path&&edit.start<=from){from+=edit.text.length;to+=edit.text.length;}
      }
      views.get(path)?.editor?.insertSnippet(from,to,template);
      if(added.length)notify('table.added',{name:added.join(', ')});
    }});
  }
  function referencesAt(path){
    const editor=views.get(path)?.editor;if(!editor)return;
    const target=targetAt(editor.getValue(),editor.caret);
    if(target&&(target.kind==='label'||target.kind==='ref'))findAllReferences(target.name);else notify('rename.none');
  }
  function fixContext(){
    const files=textFiles();
    return {files,main:project.main,labels:findLabels(files).map(label=>label.name),bibKeys:bibEntries().map(entry=>entry.key),paths:project.paths(),
      macros:[...files.values()].flatMap(text=>[...text.matchAll(/\\(?:re)?newcommand\*?\s*\{?\\([A-Za-z]+)|\\DeclareMathOperator\*?\s*\{?\\([A-Za-z]+)|\\def\s*\\([A-Za-z]+)/g)].map(match=>match[1]||match[2]||match[3]))};
  }
  /** Mod+. or the gutter bulb: the fixes for the problems on a line (default: the caret's), as a menu. */
  function openFixes(path=active,line,at){
    const editor=views.get(path)?.editor;if(!editor)return;
    line??=views.get(path)?.position?.line||1;
    const problems=editor.diagnosticsAt(line),context=fixContext(),items=[];
    for(const problem of problems){
      const fixes=quickFixes({...problem,file:path},context);if(!fixes.length)continue;
      if(items.length)items.push('separator');
      items.push({note:problem.message,noteIcon:problem.severity==='error'?'error':problem.severity==='warning'?'warning':'info',tone:problem.severity});
      for(const fix of fixes)items.push({label:fixLabel(fix),icon:fix.kind==='package'?'plus':fix.kind==='unbalanced'?'target':fix.kind==='replace'?'edit':'bulb',
        run:()=>{if(fix.go){reveal({path:fix.go.file,offset:fix.go.offset});return;}const undo=applyEdits(fix.edits);if(fix.edits.some(edit=>edit.file!==path))toast(t('fix.applied',{name:fixLabel(fix)}),{label:t('common.undo'),run:undo});}});
    }
    if(!items.length){notify(problems.length?'fix.unknown':'fix.none');return;}
    const first=items.find(item=>item.run);if(first)first.hint='↵';
    items.push('separator',{label:t('fix.panel'),icon:'warning',run:()=>openPanel('problems')});
    let anchor=at;
    if(!anchor){const rect=editor.rectAt(editor.offsetOf(line)),origin=editor.body.getBoundingClientRect();anchor={left:origin.left+(rect?.x??0),top:origin.top+(rect?.top??0),bottom:origin.top+(rect?.bottom??0)};}
    openMenu(app,anchor,items);
  }
  function fixLabel(fix){
    if(fix.kind==='package')return t('fix.package',{name:fix.label});
    if(fix.kind==='replace')return t('fix.replace',{name:fix.label});
    if(fix.kind==='math')return t('fix.math',{text:fix.label.length>24?fix.label.slice(0,24)+'…':fix.label});
    if(fix.kind==='theorem')return t('fix.theorem',{name:/\{([^}]+)\}\{/.exec(fix.label)?.[1]||fix.label});
    if(fix.kind==='unbalanced')return t('fix.unbalanced');
    return fix.label;
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
  const finishRun=()=>{state.compiling=false;clearTimeout(busyTimer);state.busy=false;if(state.calibrating){state.calibrating=false;placePagination();}updateControls();updateEngine();};
  async function compile(reason='manual'){
    clearTimeout(compileTimer);compileTimer=null;
    if(state.engine!=='ready'||!state.loaded||state.destroyed||!project.main)return;
    if(reason==='auto'&&options.onPreview)return preview();
    if(state.compiling)return;
    clearTimeout(settleTimer);settleTimer=null;
    const run=++state.run,revision=state.revision,began=performance.now();
    state.compiling=true;state.calibrating=!!viewport.querySelector('canvas.provisional');if(state.calibrating)placePagination();
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
      else if(result?.pdf){const durationMs=result.durationMs??performance.now()-began;await setPdf(result.pdf,{...result,revision:result.revision??revision,durationMs});if(state.pdfRevision===revision){state.lastFullMs=durationMs;record('full',durationMs);}}
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
    marker.remove();applyThumbs();updateDoc();updateStatus();updateEngine();updatePage();
  }
  const pages=()=>[...viewport.querySelectorAll('canvas[data-page]')];
  // A region of a page: top/bottom (and optionally left/right) as fractions of it.
  function placeRegion(node,canvas,region,pad=4){
    const left=Number.isFinite(region.left)?canvas.offsetLeft+region.left*canvas.offsetWidth-pad:canvas.offsetLeft+8,right=Number.isFinite(region.right)?canvas.offsetLeft+region.right*canvas.offsetWidth+pad:canvas.offsetLeft+canvas.offsetWidth-8;
    node.style.left=left+'px';node.style.width=Math.max(8,right-left)+'px';
    node.style.top=canvas.offsetTop+region.top*canvas.offsetHeight-pad/2+'px';node.style.height=Math.max(8,(region.bottom-region.top)*canvas.offsetHeight+pad)+'px';
  }
  function paintRegion(region,className){
    const canvas=pages().find(canvas=>Number(canvas.dataset.page)===region.page);if(!canvas)return;
    const overlay=document.createElement('div');overlay.className=className;placeRegion(overlay,canvas,region);canvas.parentNode.append(overlay);
  }
  // Local updates leave a thin accent edge. Typing on in the same paragraph keeps the same edge lit and only
  // moves it as the paragraph grows; it fades once the typing stops or moves elsewhere. Nothing restarts per keystroke.
  function paintInk(regions){
    const lit=new Set(),list=pages();
    for(const region of regions){
      const canvas=list.find(canvas=>Number(canvas.dataset.page)===region.page);if(!canvas)continue;
      const key=region.page+':'+(region.uid??Math.round(region.top*1e3));lit.add(key);
      let ink=inks.get(key);
      if(!ink||ink.parentNode!==canvas.parentNode){ink?.remove();ink=document.createElement('div');ink.className='ink-region';inks.set(key,ink);placeRegion(ink,canvas,region);canvas.parentNode.append(ink);void ink.offsetWidth;}
      else placeRegion(ink,canvas,region);
      ink.dataset.on='';
    }
    for(const [key,ink] of inks)if(!lit.has(key))fadeInk(key,ink);
    clearTimeout(inkTimer);inkTimer=setTimeout(()=>{for(const [key,ink] of inks)fadeInk(key,ink);},700);
  }
  function fadeInk(key,ink){inks.delete(key);delete ink.dataset.on;setTimeout(()=>{if(!('on' in ink.dataset))ink.remove();},320);}
  function clearInk(){clearTimeout(inkTimer);for(const ink of inks.values())ink.remove();inks.clear();}
  const fitWidth=()=>Math.max(240,viewport.clientWidth-48);
  // Two-page spreads: pages share the width when fitting; too narrow for two at the chosen zoom falls back to one.
  let spreadShown='single';
  function spread(base=parseFloat(pages()[0]?.dataset.base)){
    if(settings.spread==='single'||(pages().length||state.meta?.pages||0)<2)return {mode:'single',narrow:false};
    const fits=settings.zoom==='fit'?(fitWidth()-16)/2>=260:!base||2*base*settings.zoom+16<=fitWidth();
    return fits?{mode:settings.spread,narrow:false}:{mode:'single',narrow:true};
  }
  const pageWidth=base=>{const columns=spread(base).mode==='single'?1:2;return settings.zoom==='fit'?Math.min((fitWidth()-16*(columns-1))/columns,base*2.5):base*settings.zoom;};
  const currentZoom=()=>{const base=parseFloat(pages()[0]?.dataset.base);return settings.zoom==='fit'?(base?pageWidth(base)/base:1):settings.zoom;};
  function applySpread(){
    const {mode,narrow}=spread();spreadShown=mode;
    if(mode==='single')delete viewport.dataset.spread;else viewport.dataset.spread=mode;
    const note=$('zoom-note');note.hidden=!narrow;note.textContent=t('spread.narrow');
  }
  // The zoom percentage rolls to its new value: up when growing, down when shrinking.
  let zoomShown='';
  function updateZoomLabel(value){
    const label=$('zoom-label'),text=value!=null?Math.round(value*100)+'%':settings.zoom==='fit'?t('zoom.fitLabel'):Math.round(settings.zoom*100)+'%';
    if(text===zoomShown&&label.textContent===text)return;
    const up=(parseFloat(text)||0)>=(parseFloat(zoomShown)||0);zoomShown=text;
    const span=Object.assign(document.createElement('span'),{textContent:text});label.replaceChildren(span);
    if(motion())span.animate?.([{transform:`translateY(${up?60:-60}%)`,opacity:0},{transform:'none',opacity:1}],{duration:180,easing:'cubic-bezier(.2,0,0,1)'});
  }
  /** The rail shows for documents of two pages or more while the setting is on. */
  function applyThumbs(){const rail=$('thumbs'),show=settings.thumbs&&pages().length>1;if(rail.hidden===!show){if(show)thumbs.sync();return;}rail.hidden=!show;if(show)thumbs.sync();}
  function updatePage(){
    const list=pages(),middle=viewport.scrollTop+viewport.clientHeight/3,input=$('page-input');let current=0;
    for(const [index,canvas] of list.entries())if(canvas.offsetTop<=middle)current=index;
    thumbs.setCurrent(current+1);
    $('page-nav').hidden=list.length<2;$('page-indicator').textContent=list.length>1?`/ ${list.length}`:'';
    if(document.activeElement!==input){input.value=String(current+1);input.style.width=String(list.length).length+1.4+'ch';}
  }
  function goToPage(number){
    const list=pages(),canvas=list[clamp(number,1,list.length)-1];
    if(canvas)viewport.scrollTo?.({top:Math.max(0,canvas.offsetTop-12),behavior:'smooth'});
  }
  // The zoom bar rests out of sight; scrolling or zooming brings it back for a moment.
  function showZoombar(){$('zoombar').dataset.show='true';clearTimeout(barTimer);barTimer=setTimeout(()=>{if(!state.destroyed)delete $('zoombar').dataset.show;},1600);}
  // The caret's place in the preview: a bar in the page margin. Moving into another paragraph lights that
  // paragraph for a moment before it settles into the bar; typing within one paragraph never does.
  let markerKey=null;
  function placeMarker(scroll=false){
    const canvas=state.marker&&viewport.querySelector(`canvas[data-page="${state.marker.page}"]`);
    if(!canvas||!canvas.offsetHeight){marker.remove();markerChip();return;}
    if(marker.parentNode!==canvas.parentNode)canvas.parentNode.append(marker);
    const top=canvas.offsetTop+canvas.offsetHeight*state.marker.top,height=Math.max(8,canvas.offsetHeight*(state.marker.bottom-state.marker.top));
    marker.style.top=top+'px';marker.style.height=height+'px';marker.style.left=canvas.offsetLeft-8+'px';
    const key=state.marker.uid!=null?state.marker.page+':'+state.marker.uid:null;
    if(key&&markerKey&&key!==markerKey&&motion())flashSync(canvas);
    markerKey=key;
    if(scroll&&settings.follow&&(top<viewport.scrollTop+12||top+height>viewport.scrollTop+viewport.clientHeight-12))
      viewport.scrollTo?.({top:Math.max(0,top-viewport.clientHeight/3),behavior:'smooth'});
    markerChip();
  }
  function flashSync(canvas){
    viewport.querySelector('.sync-flash')?.remove();
    const node=document.createElement('div');node.className='sync-flash';placeRegion(node,canvas,state.marker,6);canvas.parentNode.append(node);
    const animation=node.animate?.([{opacity:0},{opacity:1,offset:.1},{opacity:1,transform:'scaleX(1)',offset:.62},{opacity:0,transform:'scaleX(.01)'}],{duration:780,easing:'cubic-bezier(.2,0,0,1)'});
    if(animation)animation.finished.then(()=>node.remove(),()=>node.remove());else setTimeout(()=>node.remove(),780);
  }
  // When the caret's place is scrolled out of the preview, a chip at that edge says where it is.
  function markerChip(){
    const chip=$('marker-chip');
    if(!marker.isConnected||!state.marker){chip.hidden=true;return;}
    const top=marker.offsetTop,bottom=top+marker.offsetHeight,edge=bottom<viewport.scrollTop+4?'top':top>viewport.scrollTop+viewport.clientHeight-4?'bottom':'';
    chip.hidden=!edge;if(!edge)return;
    chip.dataset.edge=edge;chip.textContent=t(edge==='top'?'marker.up':'marker.down',{n:state.marker.page});
  }
  /** Resize pages with CSS at once; refreshPages then redraws them sharp. */
  function layoutPages(){
    applySpread();
    for(const canvas of pages()){const base=parseFloat(canvas.dataset.base);if(base)canvas.style.width=pageWidth(base)+'px';}
    viewport.querySelectorAll('.hover-region').forEach(node=>node.remove());clearInk();placePagination();updateZoomLabel();updatePage();placeMarker();placeTextLayers();
  }
  // Text layers sit over their pages and scale with them; under a page redrawn by a live update they wait for the PDF.
  function placeTextLayers(){
    for(const layer of viewport.querySelectorAll('.preview-content:not(.page-leave) .text-layer')){
      const canvas=viewport.querySelector(`canvas[data-page="${layer.dataset.textPage}"]`);
      if(!canvas){layer.hidden=true;continue;}
      layer.hidden=false;layer.toggleAttribute('data-stale','live' in canvas.dataset);
      if(!canvas.offsetWidth)continue;
      layer.style.left=canvas.offsetLeft+'px';layer.style.top=canvas.offsetTop+'px';
      layer.style.setProperty('--total-scale-factor',String(canvas.offsetWidth/parseFloat(layer.dataset.pageWidth)));
    }
  }
  const previewFocused=()=>{const pane=root.querySelector('.preview-pane'),selection=document.getSelection?.();return pane.contains(document.activeElement)||!!selection&&!selection.isCollapsed&&viewport.contains(selection.anchorNode);};
  const pdfFind=createPdfFind(root.querySelector('.preview-pane'),{t,
    layers:()=>[...viewport.querySelectorAll('.preview-content:not(.page-leave) .text-layer:not([data-stale]):not([hidden])')],
    reveal:mark=>{const box=mark.getBoundingClientRect(),view=viewport.getBoundingClientRect();if(box.top<view.top+48||box.bottom>view.bottom-64)viewport.scrollTo?.({top:viewport.scrollTop+box.top-view.top-viewport.clientHeight/3,behavior:'smooth'});}});
  function openPdfFind(){
    const selection=document.getSelection?.(),text=selection&&viewport.contains(selection.anchorNode)?selection.toString().trim():'';
    pdfFind.open(text&&!text.includes('\n')?text:'');
  }
  // Provisional pages carry a corner pill and a dashed lower edge until a full pass settles them. Both persist
  // across live updates (moved, not rebuilt), show progress while that pass runs, and resolve with a check.
  function placePagination(){
    const provisional=new Map(pages().filter(canvas=>canvas.classList.contains('provisional')).map(canvas=>[canvas.dataset.page,canvas]));
    for(const node of viewport.querySelectorAll('.pagination-note:not([data-state=done]),.flex-edge:not([data-gone])'))if(provisional.get(node.dataset.page)?.parentNode!==node.parentNode)node.remove();
    const estimate=Math.round(clamp(state.meta?.durationMs||1500,400,20000));
    for(const [page,canvas] of provisional){
      let note=canvas.parentNode.querySelector(`.pagination-note[data-page="${page}"]:not([data-state=done])`),edge=canvas.parentNode.querySelector(`.flex-edge[data-page="${page}"]:not([data-gone])`);
      if(!note){note=document.createElement('span');note.className='pagination-note';note.dataset.page=page;note.textContent='≈ '+t('preview.pagination');canvas.parentNode.append(note);}
      if(!edge){edge=document.createElement('i');edge.className='flex-edge';edge.dataset.page=page;canvas.parentNode.append(edge);}
      note.dataset.state=state.calibrating?'calibrating':'pending';note.style.setProperty('--calibrate',estimate+'ms');
      note.style.top=canvas.offsetTop+10+'px';note.style.left=canvas.offsetLeft+canvas.offsetWidth-10+'px';
      edge.style.top=canvas.offsetTop+canvas.offsetHeight+'px';edge.style.left=canvas.offsetLeft+'px';edge.style.width=canvas.offsetWidth+'px';
    }
  }
  /** After a full pass replaced provisional pages: a check where each pill was, and the dashed edge drawn back in. */
  function settlePagination(numbers){
    for(const page of numbers){
      const canvas=viewport.querySelector(`canvas[data-page="${page}"]`);if(!canvas)continue;
      const note=document.createElement('span');note.className='pagination-note';note.dataset.page=page;note.dataset.state='done';note.innerHTML=icon('check',12);note.append(t('preview.paginated'));
      note.style.top=canvas.offsetTop+10+'px';note.style.left=canvas.offsetLeft+canvas.offsetWidth-10+'px';
      const edge=document.createElement('i');edge.className='flex-edge';edge.dataset.page=page;edge.style.cssText=`top:${canvas.offsetTop+canvas.offsetHeight}px;left:${canvas.offsetLeft}px;width:${canvas.offsetWidth}px`;
      canvas.parentNode.append(note,edge);
      (globalThis.requestAnimationFrame||setTimeout)(()=>{edge.dataset.gone='';});
      setTimeout(()=>{note.remove();edge.remove();},1100);
    }
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
    // The page under the point: the last row starting above it, and in a spread the page it is over.
    for(const canvas of pages())if(!target||canvas.offsetTop<=y&&(canvas.offsetTop>target.offsetTop||x>=canvas.offsetLeft))target=canvas;
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
      ...[0.5,0.75,1,1.25,1.5,2,3].map(value=>({label:Math.round(value*100)+'%',checked:settings.zoom!=='fit'&&Math.abs(current-value)<0.005,run:()=>setZoom(value)})),'separator',
      ...['single','double','cover'].map(value=>({label:t('spread.'+value),icon:value==='single'?'file':'twoPages',checked:settings.spread===value,run:()=>setSpread(value)}))]);
  }
  function setSpread(value){
    set('spread',value);
    // Keep the page at the top of the view in place across the change of layout.
    const top=pages().find(canvas=>canvas.offsetTop+canvas.offsetHeight>viewport.scrollTop+8);
    layoutPages();if(top)viewport.scrollTop=Math.max(0,top.offsetTop-12);
    clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,220);
  }
  // Pinch: the page container scales with a transform while the gesture lasts (no layout per event);
  // when it ends the zoom is committed once, anchored at the same point, and the pages are redrawn sharp.
  let pinch=null,pinchTimer;
  function pinchZoom(factor,point){
    const content=viewport.querySelector('.preview-content:not(.page-leave)');
    if(!content||!pages().length){setZoom(clamp(currentZoom()*factor,0.25,4),point);return;}
    if(!pinch){
      const box=content.getBoundingClientRect();
      pinch={content,base:currentZoom(),scale:1,point,origin:{x:point.x-box.left,y:point.y-box.top}};
      content.style.transformOrigin=`${pinch.origin.x}px ${pinch.origin.y}px`;content.style.willChange='transform';
      viewport.querySelector('.hover-region')?.remove();$('page-tag').hidden=true;
    }
    pinch.scale=clamp(pinch.base*pinch.scale*factor,0.25,4)/pinch.base;
    pinch.content.style.transform=`scale(${pinch.scale})`;
    updateZoomLabel(pinch.base*pinch.scale);showZoombar();
    clearTimeout(pinchTimer);pinchTimer=setTimeout(endPinch,180);
  }
  function endPinch(){
    clearTimeout(pinchTimer);if(!pinch)return;
    const {content,base,scale,point}=pinch;pinch=null;
    content.style.transform=content.style.transformOrigin=content.style.willChange='';
    setZoom(base*scale,point);
  }
  // Hovering a page shows its number at its foot, above the zoom bar.
  function pageTag(point){
    const tag=$('page-tag'),list=pages();
    if(!point||list.length<2||pinch){tag.hidden=true;return;}
    const canvas=list.find(item=>Number(item.dataset.page)===point.page);if(!canvas){tag.hidden=true;return;}
    const pane=root.querySelector('.preview-pane').getBoundingClientRect(),box=canvas.getBoundingClientRect(),limit=pane.bottom-62;
    tag.textContent=`${point.page} / ${list.length}`;tag.hidden=false;
    tag.style.left=box.left+box.width/2-pane.left+'px';tag.style.top=Math.min(box.bottom-12,limit)-pane.top+'px';
  }
  const stepZoom=direction=>{const zoom=currentZoom();setZoom(direction>0?ZOOMS.find(value=>value>zoom+0.01)??ZOOMS.at(-1):[...ZOOMS].reverse().find(value=>value<zoom-0.01)??ZOOMS[0]);};
  async function setPdf(bytes,metadata={}){
    const sequence=++pdfSequence;
    rendererAbort?.abort();rendererAbort=new AbortController();
    const container=document.createElement('div');container.className='preview-content';
    const data=bytes instanceof Uint8Array?bytes.slice():new Uint8Array(bytes);
    let newUrl,rendered;
    try{
      if(options.renderPdf)rendered=await options.renderPdf({bytes:data.slice(),container,signal:rendererAbort.signal,zoom:settings.zoom,viewport,width:natural=>pageWidth(natural),dark:darkPages()});
      else{newUrl=URL.createObjectURL(new Blob([data],{type:'application/pdf'}));const frame=document.createElement('iframe');frame.title='Compiled PDF document';frame.src=newUrl;container.append(frame);}
      if(state.destroyed||sequence!==pdfSequence||metadata.revision!==undefined&&metadata.revision!==state.revision){if(newUrl)URL.revokeObjectURL(newUrl);return;}
      if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);state.pdfUrl=newUrl;
      const scroll=viewport.scrollTop,across=viewport.scrollLeft,previous=viewport.firstElementChild,settled=[...viewport.querySelectorAll('canvas.provisional[data-page]')].map(canvas=>canvas.dataset.page);
      clearInk();viewport.replaceChildren(container);container.classList.add('page-arrive');
      if(previous?.querySelector('canvas')&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
        // Keep the old pixels briefly, but exclude them from page navigation and live hit testing.
        previous.classList.add('page-leave');previous.setAttribute('aria-hidden','true');previous.inert=true;
        previous.querySelectorAll('[data-page]').forEach(canvas=>canvas.removeAttribute('data-page'));
        previous.querySelectorAll('.ink-region,.hover-region,.pagination-note,.flex-edge').forEach(node=>node.remove());
        viewport.append(previous);setTimeout(()=>previous.remove(),140);
      }
      viewport.scrollTop=scroll;viewport.scrollLeft=across;
      state.pdf=data;state.pdfRevision=metadata.revision??state.revision;state.previewRevision=state.pdfRevision;
      state.meta={pages:metadata.pages??rendered?.pages,durationMs:metadata.durationMs};
      applyThumbs();applySpread();
      // The first render of a spread could not know the page count; give the pages their spread widths now.
      if(pages().some(canvas=>Math.abs(parseFloat(canvas.style.width)-pageWidth(parseFloat(canvas.dataset.base)))>1)){layoutPages();clearTimeout(zoomTimer);zoomTimer=setTimeout(refreshPages,60);}
      updateDoc();updateStatus();updatePage();updateZoomLabel();placeMarker();placeTextLayers();pdfFind.refresh();describeProject();
      if(settled.length&&!state.failed)settlePagination(settled);
    }catch(error){if(newUrl)URL.revokeObjectURL(newUrl);if(sequence===pdfSequence&&!state.destroyed)api.setError(new Error(`PDF preview could not be rendered: ${error.message||error}`));}
  }

  // ---- files ------------------------------------------------------------------------------------
  function emptyPending(){return {put:new Set(),remove:new Set(),reset:false};}
  function queueSave(change){
    if(!saver()||!settings.persist||restoring||switching||state.destroyed)return;
    if(change?.type==='load'){pending=emptyPending();pending.reset=true;for(const path of project.paths())pending.put.add(path);}
    else if(change?.type==='remove')for(const path of change.paths){pending.put.delete(path);pending.remove.add(path);}
    else if(change?.type==='rename')for(const [from,to] of change.moved){pending.put.delete(from);pending.remove.add(from);pending.remove.delete(to);pending.put.add(to);}
    else for(const path of change?.paths||(change?.path&&project.has(change.path)?[change.path]:[])){pending.remove.delete(path);pending.put.add(path);}
    state.save='saving';updateSave();clearTimeout(saveTimer);saveTimer=setTimeout(flush,400);
  }
  async function flush(){
    clearTimeout(saveTimer);saveTimer=null;
    const target=saver();if(!target||!settings.persist||state.destroyed)return;
    if(saving){saveTimer=setTimeout(flush,200);return;}
    const job=pending;pending=emptyPending();saving=true;
    try{
      await target.save({reset:job.reset,remove:[...job.remove],put:[...job.put].map(path=>project.get(path)).filter(Boolean).map(file=>typeof file.text==='string'?{path:file.path,text:file.text}:{path:file.path,data:file.data}),
        meta:{main:project.main,folders:project.explicitFolders(),tabs,active,historyId,title:documentTitle(mainText())||(project.main?basename(project.main):'')}});
      if(!saveTimer){state.save='saved';state.dirty=false;}
    }catch{
      state.save='failed';if(!storageWarned){storageWarned=true;notify('toast.storage');}
    }finally{saving=false;updateSave();}
  }
  async function persistChanged(){
    if(!store){state.save='off';updateSave();return;}
    if(multi()&&!scoped){currentId=globalThis.crypto.randomUUID();scoped=store.project(currentId);remember(currentId);}
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
      const data=await readArchive(file);
      // With projects kept in this browser an archive becomes a project of its own.
      if(multi()&&settings.persist?await newProject(data):await replaceProject(data))notify('toast.imported',{n:project.files().length});
    }catch(error){notify('toast.zip',{message:error.message||error});}
  }
  function remove(path){
    const restore=project.remove(path);
    if(restore)toast(t('toast.deleted',{name:basename(path)}),{label:t('common.undo'),run:restore},{key:'deleted',merged:n=>t('toast.deletedMany',{n})});
  }
  function symbols(){const editor=activeEditor();if(!editor)return;const start=editor.input.selectionStart,end=editor.input.selectionEnd;openSymbols({host:app,t,insert:text=>{editor.edit(start,end,text,text.endsWith('{}')?start+text.length-1:start+text.length);views.get(active)?.complete?.hide();}});}
  function takeSnapshot(force=false){
    if(!settings.persist||!store?.addSnapshot)return Promise.resolve(false);
    return store.addSnapshot({id:globalThis.crypto.randomUUID(),projectId:historyId,time:Date.now(),main:project.main,folders:project.explicitFolders(),files:project.files().filter(file=>typeof file.text==='string').map(({path,text})=>({path,text})),force});
  }
  function history(){
    return openHistory({host:app,t,lang:i18n.lang,store,projectId:historyId,persist:settings.persist,notify,
      current:()=>project.files().filter(file=>typeof file.text==='string').map(({path,text})=>({path,text})),
      restoreFile:async(snapshot,path)=>{
        const saved=snapshot.files.find(file=>file.path===path),now=project.get(path);
        if(snapshot.projectId!==historyId||typeof saved?.text!=='string'||normalizePath(path)!==path||now&&typeof now.text!=='string')throw Error('Invalid snapshot file');
        // The project as it is goes into history first, so restoring one file can be undone from there too.
        const revision=state.revision;if(!await takeSnapshot(true)||state.revision!==revision)throw Error('Cannot safely restore a changed project');
        if(now)write(path,0,now.text.length,saved.text);else project.write(path,saved.text);
        openFile(path,{focus:true});await flush();return true;
      },
      restore:async snapshot=>{
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
  async function projectMenu(){
    const at=action('project-menu').getBoundingClientRect(),items=[];
    if(multi()&&settings.persist){
      const recent=(await store.listProjects().catch(()=>[])).slice(0,5);
      if(recent.length>1||recent[0]?.id!==currentId){
        items.push({heading:t('projects.recent')});
        for(const item of recent)items.push({label:item.title||t('project.untitled'),checked:item.id===currentId,hint:when(item.updated),run:()=>void openProject(item.id)});
        items.push('separator');
      }
      items.push({label:t('projects.all'),icon:'projects',hint:keys('Mod+O'),run:()=>void openProjects()});
    }
    items.push({label:t('project.new'),icon:'template',run:templateGallery},{label:t('project.import'),icon:'upload',run:()=>$('zip-input').click()},
      {label:t('project.export'),icon:'archive',disabled:!project.files().length,run:exportZip});
    openMenu(app,at,items);
  }
  // ---- projects ---------------------------------------------------------------------------------
  const remember=id=>{try{sessionStorage.setItem(TAB_PROJECT,id);}catch{/* private mode */}void store?.remember?.(id).catch(()=>{});};
  function when(time){
    if(!time)return '';
    const date=new Date(time),now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()).getTime(),locale=i18n.lang==='zh'?'zh-CN':'en';
    if(time>=today)return t('time.today',{time:new Intl.DateTimeFormat(locale,{timeStyle:'short'}).format(date)});
    if(time>=today-86400000)return t('time.yesterday');
    return new Intl.DateTimeFormat(locale,{dateStyle:'medium'}).format(date);
  }
  /** Open another stored project: pending edits are saved first, then the workspace loads it as it was left. */
  async function openProject(id,{force=false}={}){
    if(!multi()||id===currentId&&!force)return false;
    await flush();
    const target=store.project(id),saved=await target.load().catch(()=>null);
    if(!saved||state.destroyed){notify('projects.missing');return false;}
    cancel();popover?.hide();toggleSettings(false);
    currentId=id;scoped=target;remember(id);historyId=saved.historyId||globalThis.crypto.randomUUID();
    switching=true;try{project.load(saved);}finally{switching=false;}
    const wanted=(saved.tabs||[]).filter(path=>project.has(path));
    tabs=wanted.length?wanted:project.main?[project.main]:project.paths().slice(0,1);
    activate(tabs.includes(saved.active)?saved.active:tabs[0]??null);
    state.dirty=false;state.save=settings.persist?'saved':'off';updateSave();
    if(!saved.historyId)queueSave();
    return true;
  }
  /** A new project from a template or an archive, opened at once. */
  async function newProject(data){
    await flush();
    const main=data.main||data.files.find(file=>/\.tex$/i.test(file.path)&&/\\documentclass/.test(file.text||''))?.path;
    const id=await store.createProject({...data,main,title:documentTitle(data.files.find(file=>file.path===main)?.text||'')}).catch(()=>null);
    if(!id){notify('toast.storage');return false;}
    return openProject(id);
  }
  async function deleteProject(id,refresh){
    const deleting=id===currentId;
    if(deleting){clearTimeout(saveTimer);saveTimer=null;pending=emptyPending();scoped=null;}
    const record=await store.deleteProject(id).catch(()=>null);
    if(!record){if(deleting)scoped=store.project(id);notify('toast.storage');return;}
    if(deleting){
      const next=(await store.listProjects()).find(item=>item.id!==id);
      if(next)await openProject(next.id,{force:true});else await newProject(templateProject(TEMPLATES[0]));
    }
    refresh?.();
    toast(t('projects.deleted',{name:record.project.title||t('project.untitled')}),{label:t('common.undo'),run:()=>void store.restoreProject(record).then(()=>refresh?.(),()=>notify('toast.storage'))},{key:'project-deleted',merged:n=>t('projects.deletedMany',{n})});
  }
  async function exportProject(id){
    const saved=id===currentId?{files:project.files(),main:project.main}:await store.project(id).load().catch(()=>null);if(!saved)return;
    download(zip(saved.files.map(file=>({path:file.path,data:fileBytes(file)}))),(saved.main?basename(saved.main).replace(/\.tex$/i,''):'project')+'.zip','application/zip');
  }
  // The project page: one card per project with its first page, title, last change and page count.
  async function openProjects(){
    if(!multi()||!settings.persist){
      const body=make('div','dialog-body');body.append(make('p','',t(store?'projects.off':'projects.unavailable')));
      const actions=make('div','dialog-actions'),ok=make('button','btn primary',t('common.close'));ok.type='button';actions.append(ok);body.append(actions);
      const dialog=openDialog(app,{title:t('projects.title'),content:body});ok.onclick=dialog.close;return;
    }
    await flush();
    const body=make('div','projects'),bar=make('div','projects-bar'),grid=make('div','projects-grid');grid.setAttribute('role','list');
    const add=make('button','btn primary');add.type='button';add.innerHTML=icon('plus',14);add.append(t('project.new'));
    const upload=make('button','btn');upload.type='button';upload.innerHTML=icon('upload',14);upload.append(t('project.import'));
    bar.append(make('span','projects-count'),make('span','spacer'),upload,add);body.append(bar,grid);
    const dialog=openDialog(app,{title:t('projects.title'),content:body,className:'projects-dialog'});
    add.onclick=()=>{dialog.close();templateGallery();};upload.onclick=()=>{dialog.close();$('zip-input').click();};
    async function paint(){
      const list=await store.listProjects().catch(()=>[]);if(!dialog.el.isConnected)return;
      grid.replaceChildren();bar.firstChild.textContent=t('projects.count',{n:list.length});
      for(const item of list){
        const card=make('div','project-card');card.setAttribute('role','listitem');if(item.id===currentId)card.dataset.current='';
        const open=make('button','project-open');open.type='button';
        const thumb=make('span','project-thumb');
        if(item.thumb){const image=make('img');image.alt='';image.src=item.thumb;thumb.append(image);}else thumb.append(make('i','project-sheet'));
        const name=make('b','',item.title||t('project.untitled')),meta=make('small','',[when(item.updated),item.pages?(item.pages===1?t('page'):t('pages',{n:item.pages})):null].filter(Boolean).join(' · '));
        open.append(thumb,name,meta);if(item.id===currentId)open.append(make('span','project-badge',t('projects.current')));
        open.onclick=()=>{dialog.close();void openProject(item.id);};
        const more=make('button','icon-btn project-more');more.type='button';more.innerHTML=icon('more');more.setAttribute('aria-label',t('file.more'));
        more.onclick=()=>openMenu(app,more.getBoundingClientRect(),[
          {label:t('projects.openIt'),icon:'file',disabled:item.id===currentId,run:()=>{dialog.close();void openProject(item.id);}},
          {label:t('projects.duplicate'),icon:'copyFile',run:async()=>{await flush();await store.duplicateProject(item.id,{title:t('projects.copyOf',{name:item.title||t('project.untitled')})}).catch(()=>notify('toast.storage'));void paint();}},
          {label:t('project.export'),icon:'archive',run:()=>void exportProject(item.id)},'separator',
          {label:t('file.delete'),icon:'trash',danger:true,run:()=>void deleteProject(item.id,paint)}]);
        card.append(open,more);grid.append(card);
      }
      const blank=make('button','project-card project-new');blank.type='button';blank.innerHTML=icon('plus',18);blank.append(t('project.new'));blank.onclick=add.onclick;grid.append(blank);
      grid.querySelector('[data-current] .project-open,.project-open')?.focus({preventScroll:true});
    }
    await paint();
  }
  // After a full render the project page gets the first page as its thumbnail, with the title and page count.
  function describeProject(){
    if(!multi()||!currentId||!settings.persist||!state.meta)return;
    const details={pages:state.meta.pages,title:documentTitle(mainText())||(project.main?basename(project.main):'')},canvas=pages()[0];
    try{
      if(canvas?.width&&!canvas.dataset.dark&&!('live' in canvas.dataset)){
        const thumb=document.createElement('canvas');thumb.width=180;thumb.height=Math.round(180*canvas.height/canvas.width);
        const context=thumb.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,thumb.width,thumb.height);context.drawImage(canvas,0,0,thumb.width,thumb.height);details.thumb=thumb.toDataURL('image/jpeg',0.82);
      }
    }catch{/* no 2D canvas here */}
    void store.describe(currentId,details).catch(()=>{});
  }
  function templateGallery(){
    const separate=multi()&&settings.persist;
    return openTemplateGallery({host:app,t,lang:i18n.lang,hasFiles:!separate&&!!project.paths().length,readArchive,create:data=>void(separate?newProject(data):replaceProject(data,true)),notify});
  }
  function exportZip(){void exportProject(currentId);}
  // Export shows its own progress: a line under the button while the full pass runs, a check when the file is handed over.
  let exportTimer;
  function exportState(value){const button=action('export-menu');clearTimeout(exportTimer);if(value)button.dataset.state=value;else delete button.dataset.state;if(value==='done')exportTimer=setTimeout(()=>exportState(null),1400);}
  async function downloadPdf(){
    if(state.compiling){notify('toast.wait');return;}
    if(state.pdfRevision!==state.revision){action('export-menu').style.setProperty('--eta',Math.round(clamp(state.lastFullMs||2000,400,30000))+'ms');exportState('working');await compile('download');}
    if(state.pdfRevision!==state.revision){exportState(null);notify('toast.stale');return;}
    if(state.pdf){download(state.pdf,basename(project.main||'main.tex').replace(/\.tex$/i,'')+'.pdf','application/pdf');exportState('done');}
  }
  function exportMenu(){
    const pages=state.meta?.pages,size=state.pdf&&[pages&&(pages===1?t('page'):t('pages',{n:pages})),`${(state.pdf.byteLength/1024).toFixed(1)} KB`].filter(Boolean).join(' · ');
    openMenu(app,action('export-menu').getBoundingClientRect(),[
      {label:t('export.pdf'),icon:'download',hint:!state.pdf?'':state.pdfRevision!==state.revision?(Number.isFinite(state.lastFullMs)?t('export.compileEta',{s:Math.max(.5,Math.round(state.lastFullMs/500)/2)}):t('export.compileFirst')):size,disabled:!state.pdf||state.compiling,run:downloadPdf},
      {label:t('project.export'),icon:'archive',disabled:!project.files().length,run:exportZip},
      {label:t('export.file',{name:active?basename(active):''}),icon:'file',disabled:!active,run:()=>downloadFile(active)}]);
  }
  function capsuleMenu(){
    openMenu(app,action('capsule-menu').getBoundingClientRect(),[
      {label:t('compile.auto'),checked:settings.autoCompile,run:()=>set('autoCompile',!settings.autoCompile)},
      {label:t('set.mathPreview'),checked:settings.mathPreview,run:()=>set('mathPreview',!settings.mathPreview)},
      {label:t('set.follow'),checked:settings.follow,run:()=>set('follow',!settings.follow)},
      {label:t('compile.now'),icon:'play',hint:keys('Mod+Enter'),disabled:action('compile').disabled,run:()=>compile()},'separator',
      {label:t('insp.title'),icon:'bolt',run:openInspector},
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
  listen(action('capsule'),'click',event=>{if(event.target.closest?.('.cap-live,.cap-bars')&&state.live){openInspector();return;}state.compiling?cancel():compile();});listen(action('capsule-menu'),'click',capsuleMenu);
  listen(action('pdf-sync'),'click',()=>{if(lag()&&!state.compiling)void compile();});
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
  listen($('side-switch'),'click',event=>{const button=event.target.closest('[data-side]');if(button)set('sideView',button.dataset.side);});
  listen($('side-switch'),'keydown',event=>{
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;event.preventDefault();
    const order=['files','outline','labels'],next=order[(order.indexOf(settings.sideView)+(event.key==='ArrowRight'?1:2))%3];
    set('sideView',next);$('side-switch').querySelector(`[data-side="${next}"]`).focus();
  });
  listen(action('toggle-panel'),'click',()=>{panelAuto=false;set('panel',!settings.panel);});listen(action('close-panel'),'click',()=>set('panel',false));
  listen(viewport,'click',event=>{if(event.target.closest?.('[data-action="show-problems"]'))openPanel(state.problems.length?'problems':'log');});
  listen(action('clear-log'),'click',()=>api.clearLogs());
  listen(action('copy-log'),'click',async()=>{try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(state.logs.join('\n'));notify('panel.copied');}catch{notify('panel.copyFailed');}});
  listen(action('problem-filter'),'click',()=>openMenu(app,action('problem-filter').getBoundingClientRect(),['all','error','warning','info'].map(value=>({label:t('panel.'+value),checked:state.problemFilter===value,run:()=>{state.problemFilter=value;renderProblems();}}))));
  listen($('preview-error'),'click',()=>{const problem=state.problems.find(problem=>problem.severity==='error'&&project.has(problem.file));if(problem)reveal({path:problem.file,line:problem.line});else openPanel('log');});
  for(const tab of $('panel').querySelectorAll('.panel-tab'))listen(tab,'click',()=>set('panelTab',tab.dataset.panel));
  listen(action('zoom-in'),'click',()=>stepZoom(1));listen(action('zoom-out'),'click',()=>stepZoom(-1));
  listen(action('zoom-fit'),'click',()=>setZoom(settings.zoom==='fit'?1:'fit'));listen(action('zoom-menu'),'click',zoomMenu);
  listen(action('toggle-thumbs'),'click',()=>set('thumbs',!settings.thumbs));listen(action('pdf-find'),'click',openPdfFind);
  listen(root.querySelector('.preview-pane'),'pdf-find-close',()=>viewport.focus({preventScroll:true}));
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
    event.preventDefault();pinchZoom(Math.exp(-event.deltaY*0.01),{x:event.clientX,y:event.clientY});
  },{passive:false});
  // Safari reports trackpad pinches as gesture events rather than ctrl+wheel.
  let gestureScale=1;
  listen(viewport,'gesturestart',event=>{event.preventDefault();gestureScale=1;});
  listen(viewport,'gesturechange',event=>{event.preventDefault();pinchZoom(event.scale/gestureScale,{x:event.clientX,y:event.clientY});gestureScale=event.scale;});
  listen(viewport,'gestureend',event=>{event.preventDefault();endPinch();});
  listen(viewport,'scroll',()=>{updatePage();showZoombar();markerChip();},{passive:true});
  listen($('marker-chip'),'click',()=>{if(marker.isConnected)viewport.scrollTo?.({top:Math.max(0,marker.offsetTop-viewport.clientHeight/3),behavior:'smooth'});});
  const previewPoint=event=>{
    const layer=event.target.closest?.('.text-layer'),canvas=layer?viewport.querySelector(`canvas[data-page="${layer.dataset.textPage}"]`):event.target.closest?.('canvas[data-page]');if(!canvas)return;
    const box=canvas.getBoundingClientRect();
    return {page:Number(canvas.dataset.page),x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height};
  };
  // A click jumps to the source; a drag over the text selects it instead (and then the click is not a jump).
  for(const type of ['click','dblclick'])listen(viewport,type,event=>{
    const selection=document.getSelection?.();if(selection&&!selection.isCollapsed&&viewport.contains(selection.anchorNode))return;
    const point=previewPoint(event);if(point)options.onPreviewPick?.(point);
  });
  let drag=null;
  listen(viewport,'pointerdown',event=>{
    const point=event.button===0&&previewPoint(event);drag=point?{x:event.clientX,y:event.clientY,page:point.page,noted:false}:null;
    event.target.closest?.('.text-layer')?.classList.add('selecting');
  });
  listen(viewport,'pointermove',event=>{
    if(!drag||!event.buttons||drag.noted||Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<6)return;
    // Pages redrawn by a live update have no text yet; say so where the drag started.
    const canvas=viewport.querySelector(`canvas[data-page="${drag.page}"]`);if(!canvas||!('live' in canvas.dataset))return;
    drag.noted=true;viewport.querySelector('.text-note')?.remove();
    const note=document.createElement('span');note.className='text-note';note.textContent=t('pdfFind.stale');
    note.style.top=canvas.offsetTop+10+'px';note.style.left=canvas.offsetLeft+canvas.offsetWidth-10+'px';canvas.parentNode.append(note);setTimeout(()=>note.remove(),2200);
  });
  listen(document,'pointerup',()=>{drag=null;for(const layer of viewport.querySelectorAll('.text-layer.selecting'))layer.classList.remove('selecting');});
  listen(viewport,'pointermove',event=>{hoverPoint=previewPoint(event);if(hoverFrame)return;hoverFrame=requestAnimationFrame(()=>{hoverFrame=null;pageTag(hoverPoint);if(pinch||event.buttons)return;const region=hoverPoint&&options.onPreviewHover?.(hoverPoint);viewport.querySelector('.hover-region')?.remove();if(region)paintRegion(region,'hover-region');});});
  listen(viewport,'pointerleave',()=>{hoverPoint=null;viewport.querySelector('.hover-region')?.remove();$('page-tag').hidden=true;});
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
    if(!$('settings').hidden&&event.target===$('settings'))toggleSettings(false);
    if(drawer&&narrowQuery?.matches&&!event.target.closest?.('.sidebar,.menu,.dialog-backdrop,[data-action="toggle-sidebar"]'))toggleSidebar(false);
  },true);
  listen(root,'keydown',event=>{
    if(event.defaultPrevented||event.isComposing)return;
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    // Option/Alt changes event.key on macOS, so Alt combinations are matched by physical key.
    const typed=event.altKey?/^Key([A-Z])$/.exec(event.code)?.[1]?.toLowerCase():key;
    const command=mod&&typed&&commands().find(command=>command.key?.toLowerCase()==='mod+'+(event.altKey?'alt+':'')+(event.shiftKey?'shift+':'')+typed);
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
  const remeasure=()=>{if(state.destroyed)return;applyLayout();applySide();syncSettings();placeTabs();};
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
      active,zoom:settings.zoom,darkPages:darkPages()}),
    getSettings:()=>({...settings}),
    setLoadProgress({step,done,total,assets}={}){
      const list=$('load-steps');if(!list)return;
      if(!list.children.length){for(let i=0;i<4;i++){const row=document.createElement('div');row.append(Object.assign(document.createElement('span'),{textContent:t('load.'+i)}),document.createElement('small'));list.append(row);}list.after(Object.assign(document.createElement('p'),{className:'load-write',textContent:t('load.write')}));}
      for(const [i,row] of [...list.children].entries()){row.dataset.state=i<step?'done':i===step?'active':'pending';if(assets&&i<2){const asset=assets[i===0?'luahbtex.wasm':'texlive-luahbtex.data'];if(asset)row.lastChild.textContent='0 / '+(asset.encodedSize/1048576).toFixed(1)+' MiB';}}
      if(total&&list.children[step])list.children[step].lastChild.textContent=(done/1048576).toFixed(1)+' / '+(total/1048576).toFixed(1)+' MiB';
    },
    setLivePages({canvases,revision,durationMs,reflow=false,regions=[]}){
      if(state.destroyed||revision!==state.revision)return false;
      const targets=[...canvases].map(([page,canvas])=>[viewport.querySelector(`[data-page="${page}"]`),canvas]);
      if(targets.some(([target])=>!target))return false;
      for(const [target,canvas] of targets){for(const key of Object.keys(target.dataset))canvas.dataset[key]=target.dataset[key];canvas.style.cssText=target.style.cssText;canvas.setAttribute('aria-label',target.getAttribute('aria-label'));target.replaceWith(canvas);}
      for(const [,canvas] of targets){canvas.classList.toggle('provisional',reflow);canvas.dataset.live='true';}
      if(regions.length)paintInk(regions);placePagination();placeTextLayers();thumbs.changed([...canvases.keys()]);
      if(state.failed){state.failed=false;state.problems=state.problems.filter(problem=>problem.severity!=='error');renderProblems();}
      state.previewRevision=revision;if(canvases.size)state.livePages=[...canvases.keys()].sort((a,b)=>a-b);
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
      if(mode==='waiting')record('waiting',0);
      if((mode==='live'||mode==='reflow')&&Number.isFinite(ms)){
        state.latency.push(ms);if(state.latency.length>12)state.latency.shift();record(mode,ms);
        // One pulse per burst of typing, not one per keystroke.
        const now=performance.now();if(now-lastPulse>900&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)$('preview-status').querySelector('.dot').animate?.([{boxShadow:'0 0 0 0 var(--select)'},{boxShadow:'0 0 0 7px transparent'}],{duration:500,easing:'ease-out'});lastPulse=now;
      }
      updateLive();renderInspector();
    },
    /** {live:'warming'|'ready'|'off', restarts} from the host's persistent engine. */
    setEngineInfo(info={}){state.engineInfo={...state.engineInfo,...info};renderInspector();},
    /** Where the caret's text sits in the preview: {page, top, bottom} as fractions of the page, or null. */
    setMarker(position,{scroll=true}={}){state.marker=position||null;placeMarker(scroll);},
    refreshMath:updateMath,
    clearLogs(){state.logs=[];$('logs').textContent='';},
    destroy(){
      state.destroyed=true;state.run++;pdfSequence++;previewRun++;
      for(const timer of [compileTimer,settleTimer,busyTimer,zoomTimer,saveTimer,metaTimer,barTimer,inkTimer,exportTimer,pinchTimer])clearTimeout(timer);inspector?.surface.close(false);
      toaster.hide();tips.destroy();rendererAbort?.abort();if(state.pdfUrl)URL.revokeObjectURL(state.pdfUrl);
      if(hoverFrame)cancelAnimationFrame(hoverFrame);
      for(const path of [...views.keys()])dropView(path);
      popover?.destroy();thumbs.destroy();pdfFind.destroy();removers.forEach(remove=>remove());root.replaceChildren();
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
  applyAppearance();applyLayout();applySide();action('toggle-thumbs').setAttribute('aria-pressed',String(settings.thumbs));i18n.apply(root);renderSettings();renderPanel();renderProblems();updateControls();updateEngine();updateZoomLabel();updateSave();
  $('auto-compile').checked=settings.autoCompile;$('preview-status').dataset.auto=String(settings.autoCompile);updateLive();
  // Sliding thumbs need real boxes; measure once laid out and again when web fonts settle.
  (globalThis.requestAnimationFrame||setTimeout)(()=>{remeasure();if(!state.destroyed)app.classList.add('ready');});
  document.fonts?.ready?.then(remeasure);
  if(options.store===undefined&&!globalThis.indexedDB||options.store===null){start(null);api.ready=Promise.resolve();}
  else api.ready=(async()=>{
    try{store=options.store??await openStore();}catch{store=null;}
    let saved=null;
    if(store&&settings.persist)try{saved=multi()?await chooseProject():await store.load();}catch{saved=null;}
    start(saved);
  })();
  // This tab's project if it had one (a reload keeps it), else the one opened last, else the newest; a first visit makes one.
  async function chooseProject(){
    let wanted=null;try{wanted=sessionStorage.getItem(TAB_PROJECT);}catch{/* private mode */}
    const list=await store.listProjects();
    const id=[wanted,await store.lastProject().catch(()=>null),list[0]?.id].find(candidate=>candidate&&list.some(item=>item.id===candidate));
    if(id){const saved=await store.project(id).load();if(saved){currentId=id;scoped=store.project(id);remember(id);return saved;}}
    const first=initialProject();currentId=await store.createProject({...first,title:documentTitle(first.files.find(file=>file.path===first.main)?.text||'')});
    scoped=store.project(currentId);remember(currentId);return await scoped.load();
  }
  return api;
}
