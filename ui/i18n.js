// Interface strings. Elements carry data-i18n / data-i18n-title keys so a language switch needs no remount.
const en={
  'app.files':'Files','file.new':'New file','folder.new':'New folder','file.upload':'Upload files','file.more':'More',
  'file.rename':'Rename','file.delete':'Delete','file.download':'Download','file.setMain':'Set as main file','file.main':'Main file',
  'file.newHere':'New file here','folder.newHere':'New folder here',
  'project.template':'New from template','project.import':'Import .zip…','project.export':'Export .zip',
  'project.replaceTitle':'Replace all files?','project.replaceBody':'The current files will be removed from this browser.','project.replace':'Replace',
  'common.cancel':'Cancel','common.undo':'Undo','common.close':'Close','common.clear':'Clear',
  'sidebar.toggle':'Toggle sidebar','tab.close':'Close tab','editor.empty':'No file open','editor.label':'LaTeX source',
  'editor.help':'Tab indents. Escape leaves the editor. Control or Command Enter compiles.',
  'view.source':'Source','view.preview':'Preview','binary.note':'Binary file',
  'compile.run':'Compile','compile.stop':'Stop','compile.auto':'Auto compile','pdf.download':'Download PDF','settings.open':'Settings',
  'zoom.in':'Zoom in','zoom.out':'Zoom out','zoom.fit':'Fit width','zoom.fitLabel':'Fit',
  'status.none':'Not compiled','status.busy':'Compiling…','status.stale':'Out of date','status.live':'Live','status.ok':'Up to date',
  'engine.loading':'Loading TeX engine','engine.error':'Engine failed to start','engine.nomain':'No main file',
  'live.ms':'Live {ms} ms','live.reflow':'Live {ms} ms · pagination pending','live.full':'Full pass','live.wait':'Waiting for input','live.off':'Live off',
  'save.saved':'Saved','save.saving':'Saving…','save.off':'Not saved','save.failed':'Save failed',
  'cursor':'Ln {line}, Col {col}','pages':'{n} pages','page':'1 page',
  'panel.problems':'Problems','panel.log':'Log','panel.none':'No problems','panel.toggle':'Toggle problems',
  'preview.failed':'Compilation failed','preview.show':'Show problems',
  'toast.failed':'Compilation failed','toast.kept':'Compilation failed. Showing the last successful PDF.','toast.deleted':'Deleted {name}',
  'toast.uploaded':'Added {n} file(s)','toast.tooBig':'{name} is larger than 20 MB','toast.exists':'{name} already exists','toast.badName':'That name cannot be used',
  'toast.wait':'Wait for the current update, then download.','toast.stale':'The PDF is not current. Fix the source first.','toast.storage':'This browser could not save the files.',
  'toast.zip':'Could not read the archive: {message}','toast.imported':'Imported {n} file(s)',
  'math.error':'TeX error','math.unsupported':'{what} needs a full compile',
  'set.appearance':'Appearance','set.theme':'Theme','set.theme.system':'System','set.theme.light':'Light','set.theme.dark':'Dark','set.accent':'Accent','set.lang':'Language','set.lang.auto':'Auto',
  'set.darkPages':'Dark pages','set.editor':'Editor','set.fontSize':'Font size','set.wrap':'Word wrap','set.autoClose':'Auto-close brackets','set.tabSize':'Indent width','set.spellcheck':'Spell check',
  'set.preview':'Compile & preview','set.autoCompile':'Auto compile','set.mathPreview':'Formula preview at cursor','set.mathScale':'Formula size','set.follow':'Preview follows cursor',
  'set.storage':'Storage','set.persist':'Keep files in this browser','set.reset':'Reset settings',
  'size.s':'S','size.m':'M','size.l':'L',
};
const zh={
  'app.files':'文件','file.new':'新建文件','folder.new':'新建文件夹','file.upload':'上传文件','file.more':'更多',
  'file.rename':'重命名','file.delete':'删除','file.download':'下载','file.setMain':'设为主文件','file.main':'主文件',
  'file.newHere':'在此新建文件','folder.newHere':'在此新建文件夹',
  'project.template':'从模板新建','project.import':'导入 .zip…','project.export':'导出 .zip',
  'project.replaceTitle':'替换全部文件？','project.replaceBody':'当前文件将从此浏览器中移除。','project.replace':'替换',
  'common.cancel':'取消','common.undo':'撤销','common.close':'关闭','common.clear':'清空',
  'sidebar.toggle':'切换侧栏','tab.close':'关闭标签','editor.empty':'未打开文件','editor.label':'LaTeX 源码',
  'editor.help':'Tab 缩进，Esc 离开编辑器，Ctrl 或 Command + Enter 编译。',
  'view.source':'源码','view.preview':'预览','binary.note':'二进制文件',
  'compile.run':'编译','compile.stop':'停止','compile.auto':'自动编译','pdf.download':'下载 PDF','settings.open':'设置',
  'zoom.in':'放大','zoom.out':'缩小','zoom.fit':'适应宽度','zoom.fitLabel':'适应',
  'status.none':'未编译','status.busy':'编译中…','status.stale':'待更新','status.live':'实时','status.ok':'已是最新',
  'engine.loading':'正在加载 TeX 引擎','engine.error':'引擎启动失败','engine.nomain':'没有主文件',
  'live.ms':'实时 {ms} ms','live.reflow':'实时 {ms} ms · 分页待校准','live.full':'完整排版','live.wait':'等待输入完成','live.off':'实时已关闭',
  'save.saved':'已保存','save.saving':'保存中…','save.off':'未保存','save.failed':'保存失败',
  'cursor':'行 {line}，列 {col}','pages':'{n} 页','page':'1 页',
  'panel.problems':'问题','panel.log':'日志','panel.none':'没有问题','panel.toggle':'切换问题面板',
  'preview.failed':'编译失败','preview.show':'查看问题',
  'toast.failed':'编译失败','toast.kept':'编译失败，仍显示上一次成功的 PDF。','toast.deleted':'已删除 {name}',
  'toast.uploaded':'已添加 {n} 个文件','toast.tooBig':'{name} 超过 20 MB','toast.exists':'{name} 已存在','toast.badName':'不能使用这个名称',
  'toast.wait':'请等待当前更新完成后再下载。','toast.stale':'PDF 不是最新的，请先修正源码。','toast.storage':'此浏览器无法保存文件。',
  'toast.zip':'无法读取压缩包：{message}','toast.imported':'已导入 {n} 个文件',
  'math.error':'TeX 错误','math.unsupported':'{what} 需要完整编译',
  'set.appearance':'外观','set.theme':'主题','set.theme.system':'跟随系统','set.theme.light':'浅色','set.theme.dark':'深色','set.accent':'强调色','set.lang':'语言','set.lang.auto':'自动',
  'set.darkPages':'深色页面','set.editor':'编辑器','set.fontSize':'字号','set.wrap':'自动换行','set.autoClose':'自动补全括号','set.tabSize':'缩进宽度','set.spellcheck':'拼写检查',
  'set.preview':'编译与预览','set.autoCompile':'自动编译','set.mathPreview':'光标处公式预览','set.mathScale':'公式大小','set.follow':'预览跟随光标',
  'set.storage':'存储','set.persist':'在此浏览器中保留文件','set.reset':'恢复默认设置',
  'size.s':'小','size.m':'中','size.l':'大',
};
const languages={en,zh};
export function createI18n(preference='auto'){
  let lang='en';
  const set=value=>{lang=languages[value]?value:/^zh/i.test(globalThis.navigator?.language||'')?'zh':'en';};
  set(preference);
  const t=(key,values)=>{
    const text=languages[lang][key]??en[key]??key;
    return values?text.replace(/\{(\w+)\}/g,(_,name)=>String(values[name]??'')):text;
  };
  /** Refresh every tagged element below root. */
  const apply=root=>{
    for(const node of root.querySelectorAll('[data-i18n]'))node.textContent=t(node.dataset.i18n);
    for(const node of root.querySelectorAll('[data-i18n-title]')){const text=t(node.dataset.i18nTitle);node.title=text+(node.dataset.keys?` (${node.dataset.keys})`:'');node.setAttribute('aria-label',text);}
  };
  return {t,set,apply,get lang(){return lang;}};
}
