// Interface strings. Elements carry data-i18n / data-i18n-title keys so a language switch needs no remount.
// A title becomes data-tip (shown by ui/tooltip.js, with data-keys as a keycap) and the accessible name.
const en={
  'app.repository':'GitHub repository (opens in a new tab)',
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
  'set.storage':'Storage','set.persist':'Keep projects in this browser','set.reset':'Reset settings',
  'size.s':'S','size.m':'M','size.l':'L',
  'view.split':'Split','layout.label':'Layout','project.menu':'Project','project.untitled':'Untitled',
  'compile.now':'Compile now','capsule.menu':'Compile options','export.more':'More export options','export.pdf':'PDF','export.file':'Download {name}','export.compileFirst':'compiles first',
  'zoom.menu':'Zoom','zoom.fitPage':'Fit page','page.jump':'Go to page','keys.title':'Keyboard shortcuts','keys.save':'Save now','keys.comment':'Toggle comment','keys.indent':'Indent, outdent','keys.escape':'Leave the editor, stop compiling',
};
const zh={
  'app.repository':'GitHub 仓库（在新标签页打开）',
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
  'set.storage':'存储','set.persist':'在此浏览器中保存项目','set.reset':'恢复默认设置',
  'size.s':'小','size.m':'中','size.l':'大',
  'view.split':'分栏','layout.label':'布局','project.menu':'项目','project.untitled':'未命名',
  'compile.now':'立即编译','capsule.menu':'编译选项','export.more':'更多导出选项','export.pdf':'PDF','export.file':'下载 {name}','export.compileFirst':'将先完整编译',
  'zoom.menu':'缩放','zoom.fitPage':'适应整页','page.jump':'跳转到页','keys.title':'键盘快捷键','keys.save':'立即保存','keys.comment':'切换注释','keys.indent':'缩进、反缩进','keys.escape':'离开编辑器、停止编译',
};
Object.assign(en,{
  'set.decrease':'Decrease font size','set.increase':'Increase font size','panel.copied':'Log copied','complete.file':'File','complete.label':'Label',
  'load.0':'TeX engine','load.1':'TeX Live base','load.2':'Fonts & packages','load.3':'First typeset','load.write':'You can start writing while this loads.',
  'preview.locate':'Click a paragraph to reveal its source','preview.pagination':'Pagination pending',
  'panel.filter':'Filter problems','panel.copy':'Copy log','panel.copyFailed':'Could not copy the log. Select the text and copy it.','panel.all':'All problems','panel.error':'Errors','panel.warning':'Warnings','panel.info':'Information',
  'palette.open':'Search files & commands','palette.placeholder':'Search files and commands…','palette.hint':'@ sections · > commands · : line','palette.none':'No matching results','palette.line':'Go to line {n}',
  'find.open':'Find','find.replaceOpen':'Find and replace','find.placeholder':'Find in this file','find.replace':'Replace','find.all':'Replace all','find.with':'Replace with','find.case':'Match case','find.word':'Whole word','find.regex':'Regular expression','find.prev':'Previous match','find.next':'Next match','find.none':'No matches','find.invalid':'Invalid regular expression',
  'outline.title':'Outline','outline.empty':'Sections will appear here.','outline.reveal':'Reveal in file tree',
  'tab.others':'Close other tabs','tab.right':'Close tabs to the right','splitter.help':'Resize pane: arrow keys, Home to reset',
  'project.new':'New project','project.drop':'Drop a project ZIP here, or browse','project.create':'Create project','project.replaceHint':'Creating a project replaces the current files. Export them first if needed.',
  'template.article':'An article with equations','template.notes':'Theorems and aligned equations','template.report':'Sections split across files','template.blank':'A minimal document skeleton',
  'empty.files':'Start a document','empty.hint':'Create a file, choose a template, or drop a ZIP.',
  'words.count':'{n} words','words.selection':'{n} selected','words.title':'Words by section','words.note':'Estimate of source prose; commands, comments and math are excluded.','words.file':'Current file',
  'symbols.open':'Math symbols','symbols.search':'Search by name or symbol…','symbols.recent':'Recently used','symbols.greek':'Greek letters','symbols.operators':'Operators','symbols.relations':'Relations','symbols.arrows':'Arrows','symbols.delimiters':'Delimiters',
  'complete.hint':'↑ ↓ choose · Tab insert · Esc dismiss','complete.command':'Command','complete.environment':'Environment','complete.macro':'Project macro',
  'history.open':'Local history','history.empty':'Snapshots appear after a successful full compile.','history.note':'Text files only · at most 30 snapshots · every 5 minutes','history.off':'Turn on “Keep files in this browser” to save history.','history.unavailable':'History is unavailable in this browser.','history.restore':'Restore snapshot','history.confirm':'Restore these text files?','history.body':'Current text files will be replaced. Images stay unchanged. A recovery snapshot will be saved first.','history.restored':'Snapshot restored','history.failed':'Could not save history. Your current files are unchanged.','history.missing':'No text file selected',
  'image.failed':'Could not insert this image.','image.unsafe':'Rename this file without TeX special characters before inserting it.','image.package':'Add \\usepackage{graphicx} to the preamble to use images.',
  'export.open':'Export','keys.nextMatch':'Next / previous match',
});
Object.assign(zh,{
  'set.decrease':'减小字号','set.increase':'增大字号','panel.copied':'已复制日志','complete.file':'文件','complete.label':'标签',
  'load.0':'TeX 引擎','load.1':'TeX Live 基础包','load.2':'字体与宏包','load.3':'首次排版','load.write':'加载期间可以先开始写。',
  'preview.locate':'点击段落，定位到源码','preview.pagination':'分页待校准',
  'panel.filter':'筛选问题','panel.copy':'复制日志','panel.copyFailed':'无法复制日志，请选中文字后复制。','panel.all':'全部问题','panel.error':'错误','panel.warning':'警告','panel.info':'信息',
  'palette.open':'搜索文件与命令','palette.placeholder':'搜索文件与命令…','palette.hint':'@ 章节 · > 命令 · : 行号','palette.none':'没有匹配的结果','palette.line':'跳转到第 {n} 行',
  'find.open':'查找','find.replaceOpen':'查找与替换','find.placeholder':'在当前文件中查找','find.replace':'替换','find.all':'全部替换','find.with':'替换为','find.case':'区分大小写','find.word':'全词匹配','find.regex':'正则表达式','find.prev':'上一个匹配','find.next':'下一个匹配','find.none':'无匹配','find.invalid':'正则表达式无效',
  'outline.title':'大纲','outline.empty':'章节会显示在这里。','outline.reveal':'在文件树中定位',
  'tab.others':'关闭其他标签','tab.right':'关闭右侧标签','splitter.help':'调整窗格：方向键，Home 复位',
  'project.new':'新建项目','project.drop':'拖入项目 ZIP，或点击选择','project.create':'创建项目','project.replaceHint':'创建项目将替换当前文件，如需保留请先导出。',
  'template.article':'含公式的单文件文章','template.notes':'定理环境与对齐公式','template.report':'按章节组织多个文件','template.blank':'最简文档骨架',
  'empty.files':'开始一份文档','empty.hint':'新建文件、选择模板，或拖入 ZIP。',
  'words.count':'{n} 字','words.selection':'选中 {n} 字','words.title':'各章节字数','words.note':'估算源码正文，排除命令、注释和公式。','words.file':'当前文件',
  'symbols.open':'数学符号','symbols.search':'按名称或符号搜索…','symbols.recent':'最近使用','symbols.greek':'希腊字母','symbols.operators':'运算符','symbols.relations':'关系符','symbols.arrows':'箭头','symbols.delimiters':'定界符',
  'complete.hint':'↑ ↓ 选择 · Tab 插入 · Esc 关闭','complete.command':'命令','complete.environment':'环境','complete.macro':'项目宏',
  'history.open':'本地历史','history.empty':'完整编译成功后，会在这里留下快照。','history.note':'仅文本文件 · 最多 30 份 · 间隔 5 分钟','history.off':'开启「在此浏览器中保留文件」后保存历史。','history.unavailable':'此浏览器暂时无法使用历史。','history.restore':'还原快照','history.confirm':'还原这些文本文件？','history.body':'当前文本文件将被替换，图片保持不变。还原前会先保存一份恢复快照。','history.restored':'已还原快照','history.failed':'无法保存历史，当前文件未改动。','history.missing':'未选择文本文件',
  'image.failed':'无法插入这张图片。','image.unsafe':'请先重命名文件，去掉 TeX 特殊字符再插入。','image.package':'使用图片需要在导言区加入 \\usepackage{graphicx}。',
  'export.open':'导出','keys.nextMatch':'下一个／上一个匹配',
});
// Workspace refinements: sidebar views, outline words, toasts, and why a local update fell back.
Object.assign(en,{
  'side.files':'Files','side.outline':'Outline','side.labels':'Labels','side.now':'This section','labels.title':'Labels',
  'labels.empty':'Labels appear here once the document has \\label commands.','labels.refs':'{n}×','labels.unused':'unused',
  'labels.equation':'Equations','labels.figure':'Figures','labels.table':'Tables','labels.section':'Sections','labels.theorem':'Theorems','labels.item':'Items','labels.other':'Other',
  'outline.problems':'{n} problem(s)','toast.deletedMany':'Deleted {n} files','keys.short':'Shortcuts',
  'preview.paginated':'Pagination settled',
  'reason.wait.content':'Waiting for content to type into.','reason.wait.argument':'Waiting for the command’s argument; the preview updates when it is complete.',
  'reason.wait.command':'Waiting for the command name to be finished.','reason.wait.heading':'Waiting for the heading title to be finished.',
  'reason.wait.script':'Waiting for the superscript or subscript.','reason.wait.close':'A bracket or formula is still open; the preview updates once it closes.',
  'reason.wait.environment':'Waiting for the matching \\end.',
  'reason.rebuild.preamble':'The preamble changed, so the typesetting engine is being rebuilt (about 1–2 s).','reason.rebuild.engine':'The live engine restarted; the next pause updates everything.',
  'reason.full.environment':'The {name} environment needs a full pass; it updates after you pause.','reason.full.command':'{name} needs a full pass; it updates after you pause.',
  'reason.full.setup':'Definitions in the document body need a full pass.','reason.full.structure':'This edit spans more than one paragraph, so a full pass took over.',
  'reason.full.nested':'Nested or composite paragraphs need a full pass.','reason.full.runin':'Run-in headings need a full pass.',
  'reason.full.counter':'This paragraph changes numbering; a full pass keeps the numbers right.','reason.full.shortTitle':'This heading’s short title is too complex for a local update.',
  'reason.full.citation':'This citation is too complex for a local update.','reason.full.label':'This label or tag uses characters that need a full pass.',
  'reason.full.drawing':'Graphics near this paragraph need a full pass.','reason.full.color':'Colour settings around this paragraph need a full pass.',
  'reason.full.overlap':'The new text would overlap nearby content, so a full pass took over.','reason.full.size':'The page grew too tall for a quick redraw.',
  'reason.full.characters':'Control characters in the source need a full pass.',
  'reason.off.isolation':'Live updates need cross-origin isolation (COOP/COEP headers).','reason.off.size':'This file is larger than the browser edition handles.',
  'reason.check.layout':'A layout check did not pass, so a full pass took over.',
  'reason.why.wait':'Unfinished input is not an error. The preview keeps its last good state and updates once the expression is complete.',
  'reason.why.full':'Live updates replay a single paragraph in a warmed engine. Anything that changes state beyond it — environments, definitions, numbering, drawings — is typeset by a full pass after you pause.',
  'reason.why.rebuild':'The warmed engine holds the preamble. When the preamble changes, it starts again with the new one.',
  'reason.why.check':'Each local update is checked against the full layout. When a check does not pass, the full pass takes over, so the preview never shows a wrong page.',
  'reason.why.off':'Local updates are unavailable here; every change goes through a full pass.',
});
Object.assign(zh,{
  'side.files':'文件','side.outline':'大纲','side.labels':'标签','side.now':'本节','labels.title':'标签',
  'labels.empty':'文档里有 \\label 之后，标签会列在这里。','labels.refs':'{n} 处引用','labels.unused':'未引用',
  'labels.equation':'公式','labels.figure':'图','labels.table':'表','labels.section':'节','labels.theorem':'定理','labels.item':'条目','labels.other':'其他',
  'outline.problems':'{n} 个问题','toast.deletedMany':'已删除 {n} 个文件','keys.short':'快捷键',
  'preview.paginated':'分页已校准',
  'reason.wait.content':'等待输入内容。','reason.wait.argument':'等待命令参数输完，输完后自动更新。',
  'reason.wait.command':'等待命令名输完。','reason.wait.heading':'等待标题输完。',
  'reason.wait.script':'等待上标或下标输完。','reason.wait.close':'括号或公式还未闭合，闭合后自动更新。',
  'reason.wait.environment':'等待对应的 \\end 输完。',
  'reason.rebuild.preamble':'导言区已修改，正在重建排版引擎，约 1–2 秒。','reason.rebuild.engine':'实时引擎已重启，停顿后会完整更新。',
  'reason.full.environment':'环境 {name} 需要完整排版；停顿后自动更新。','reason.full.command':'{name} 需要完整排版；停顿后自动更新。',
  'reason.full.setup':'正文中的宏定义需要完整排版。','reason.full.structure':'这次修改跨越了多个段落，已改用完整排版。',
  'reason.full.nested':'嵌套或组合段落需要完整排版。','reason.full.runin':'行内标题需要完整排版。',
  'reason.full.counter':'本段改变了编号，完整排版以保证编号正确。','reason.full.shortTitle':'标题的短标题写法较复杂，无法局部更新。',
  'reason.full.citation':'这个引用的写法较复杂，无法局部更新。','reason.full.label':'标签或编号含有需要完整排版的字符。',
  'reason.full.drawing':'本段附近有图形绘制，需要完整排版。','reason.full.color':'本段跨越了颜色设置，需要完整排版。',
  'reason.full.overlap':'新内容会与相邻内容重叠，已改用完整排版。','reason.full.size':'页面过长，无法快速重绘。',
  'reason.full.characters':'源码含有控制字符，需要完整排版。',
  'reason.off.isolation':'实时更新需要跨源隔离（COOP/COEP 响应头）。','reason.off.size':'文件超出浏览器版的大小上限。',
  'reason.check.layout':'版面校验未通过，已改用完整排版。',
  'reason.why.wait':'未输完不是错误。预览保留上一次正确的状态，表达式完整后自动更新。',
  'reason.why.full':'实时更新只在常驻引擎里重放一个段落。会影响段落之外状态的结构——环境、宏定义、编号、绘图——在停顿后由完整排版处理。',
  'reason.why.rebuild':'常驻引擎保存着导言区。导言区改变时，引擎会用新的导言区重新启动。',
  'reason.why.check':'每次局部更新都会与完整版面核对。核对不通过时由完整排版接手，预览不会显示错误的页面。',
  'reason.why.off':'这里无法局部更新，所有修改都走完整排版。',
});
// Navigating the source: jumps, hover cards, breadcrumbs and the references list.
Object.assign(en,{
  'follow.hint':'click to go there','follow.none':'Nothing to go to here','follow.replace':'Use {name}','follow.lines':'{n} lines',
  'follow.noLabel':'No label named {name}','follow.noFile':'No project file named {name}','follow.noCite':'No bibliography entry {name}',
  'crumbs.sections':'Sections at this level','crumbs.stuck':'Section at the top of the view','crumbs.select':'Select this environment',
  'panel.refs':'References',
});
Object.assign(zh,{
  'follow.hint':'点击跳转','follow.none':'这里没有可以跳转的目标','follow.replace':'改为 {name}','follow.lines':'{n} 行',
  'follow.noLabel':'没有名为 {name} 的标签','follow.noFile':'项目里没有文件 {name}','follow.noCite':'参考文献里没有条目 {name}',
  'crumbs.sections':'同级章节','crumbs.stuck':'视图顶部所在的章节','crumbs.select':'选中整个环境',
  'panel.refs':'引用',
});
Object.assign(en,{
  'palette.group.recent':'Recently used','palette.group.files':'Files','palette.group.sections':'Sections & labels','palette.group.commands':'Commands','palette.group.symbols':'Symbols','palette.group.line':'Line',
  'palette.scope.sections':'sections','palette.scope.commands':'commands','palette.scope.line':'line','palette.scope.symbols':'symbols','palette.clearScope':'Search everything',
  'palette.keys':'Tab next group · ↵ open','palette.lineHint':'Type a line number','palette.placeholder':'Search files, sections and commands…',
});
Object.assign(zh,{
  'palette.group.recent':'最近使用','palette.group.files':'文件','palette.group.sections':'章节与标签','palette.group.commands':'命令','palette.group.symbols':'符号','palette.group.line':'行号',
  'palette.scope.sections':'章节','palette.scope.commands':'命令','palette.scope.line':'行号','palette.scope.symbols':'符号','palette.clearScope':'搜索全部',
  'palette.keys':'Tab 下一组 · ↵ 打开','palette.lineHint':'输入行号','palette.placeholder':'搜索文件、章节与命令…',
});
Object.assign(en,{
  'insp.title':'Live inspector','insp.kind.live':'Live','insp.kind.reflow':'Reflow, pagination pending','insp.kind.full':'Full pass','insp.kind.waiting':'Waiting for input','insp.kind.none':'Idle',
  'insp.timeline':'Last {n} updates','insp.live':'Only the edited paragraph was redrawn (page {pages}), in {ms}.','insp.reflow':'Page {pages} was reflowed locally in {ms}; pagination settles after a pause.',
  'insp.full':'This update went through a full pass ({time}).','insp.idle':'No local update yet.','insp.raw':'Details','insp.engine':'Warmed engine',
  'insp.engine.ready':'ready','insp.engine.warming':'warming up','insp.engine.off':'off','insp.restarts':'{n} restart(s)','insp.settle':'settles after a 0.5 s pause',
  'insp.median':'Typical update','insp.count':'{n} updates',
  'pdf.synced':'PDF in sync','pdf.behind':'PDF behind by {n} edit(s)','pdf.updating':'Updating PDF…','pdf.syncNow':'Compile the PDF now','pdf.syncedTip':'The downloadable PDF matches the preview',
  'export.compileEta':'compiles first, about {s} s',
});
Object.assign(zh,{
  'insp.title':'实时检查器','insp.kind.live':'实时','insp.kind.reflow':'重排待校准','insp.kind.full':'完整排版','insp.kind.waiting':'等待输入','insp.kind.none':'空闲',
  'insp.timeline':'最近 {n} 次更新','insp.live':'只重排了修改的段落（第 {pages} 页），用时 {ms}。','insp.reflow':'局部重排了第 {pages} 页，用时 {ms}；分页在停顿后校准。',
  'insp.full':'这次更新走了完整排版（{time}）。','insp.idle':'还没有局部更新。','insp.raw':'详情','insp.engine':'常驻引擎',
  'insp.engine.ready':'已就绪','insp.engine.warming':'预热中','insp.engine.off':'未启动','insp.restarts':'{n} 次重启','insp.settle':'停顿 0.5 s 后校准',
  'insp.median':'典型耗时','insp.count':'共 {n} 次',
  'pdf.synced':'PDF 已同步','pdf.behind':'PDF 落后 {n} 次修改','pdf.updating':'正在更新 PDF…','pdf.syncNow':'立即完整编译 PDF','pdf.syncedTip':'可下载的 PDF 与预览一致',
  'export.compileEta':'将先完整编译，约 {s} s',
});
Object.assign(en,{'thumbs.toggle':'Page thumbnails','thumbs.title':'Pages','thumbs.page':'Page {n}','marker.up':'↑ Caret · page {n}','marker.down':'↓ Caret · page {n}'});
Object.assign(zh,{'thumbs.toggle':'页面缩略图','thumbs.title':'页面','thumbs.page':'第 {n} 页','marker.up':'↑ 光标位置 · 第 {n} 页','marker.down':'↓ 光标位置 · 第 {n} 页'});
Object.assign(en,{
  'keys.snippets':'Expand fig, tab, mat, eq or beg','keys.stops':'Next / previous placeholder','keys.moveLine':'Move line up / down','keys.dupLine':'Duplicate line',
  'keys.deleteLine':'Delete line','keys.selectLine':'Select line','keys.selectNext':'Select next occurrence','keys.follow':'Go to definition','keys.rename':'Rename label','keys.refs':'Find all references',
  'fix.open':'Quick fix','fix.package':'Add \\usepackage{{name}}','fix.replace':'Change to {name}','fix.math':'Wrap “{text}” in $…$','fix.theorem':'Define {name} with \\newtheorem',
  'fix.unbalanced':'Go to the unclosed brace or environment','fix.panel':'Show in Problems','fix.none':'No problem on this line','fix.unknown':'No quick fix for this problem','fix.applied':'Applied: {name}',
  'rename.title':'Rename label','rename.none':'Put the caret on a \\label or a reference','rename.empty':'Type a name','rename.invalid':'Labels cannot contain { } \\ % # or commas',
  'rename.taken':'“{name}” is already a label','rename.hint':'↵ renames {n} place(s) in {files} file(s) · Esc cancels','rename.done':'Renamed {from} → {to} in {n} place(s)','rename.undo':'Undo rename',
  'refs.find':'Find all references',
  'table.title':'Insert table','matrix.title':'Insert matrix','table.insert':'Insert','table.size':'Rows and columns','table.align':'Columns','table.left':'Left','table.center':'Center','table.right':'Right',
  'table.booktabs':'Three-line rules (booktabs)','table.float':'Table with caption and label','table.mode':'Table','matrix.mode':'Matrix','matrix.kind':'Delimiters','table.added':'Added \\usepackage{{name}}',
  'history.restoreFile':'Restore this file','history.changes':'Changes','history.full':'Snapshot text','history.same':'No changes in this file since the snapshot.','history.tooBig':'This file is too large to compare.',
  'history.direction':'Snapshot → now','history.unchanged':'… {n} unchanged line(s)','history.newFile':'Added since the snapshot','history.goneFile':'Deleted since the snapshot',
  'history.fileConfirm':'Restore {name}?','history.fileBody':'Only this file goes back to the snapshot. The project as it is now is saved to history first.','history.fileRestored':'Restored {name}',
  'history.delta':'+{added} −{removed} · {files} file(s)','history.identical':'Same as now',
  'complete.cite':'citation',
});
Object.assign(zh,{
  'keys.snippets':'展开 fig、tab、mat、eq、beg 片段','keys.stops':'下一个 / 上一个占位符','keys.moveLine':'上移 / 下移行','keys.dupLine':'复制行',
  'keys.deleteLine':'删除行','keys.selectLine':'选中整行','keys.selectNext':'选中下一处相同文字','keys.follow':'跳到定义','keys.rename':'重命名标签','keys.refs':'查找所有引用',
  'fix.open':'快速修复','fix.package':'添加 \\usepackage{{name}}','fix.replace':'改为 {name}','fix.math':'用 $…$ 包裹「{text}」','fix.theorem':'用 \\newtheorem 定义 {name}',
  'fix.unbalanced':'跳到未闭合的括号或环境','fix.panel':'在问题面板中查看','fix.none':'这一行没有问题','fix.unknown':'这个问题没有可用的快速修复','fix.applied':'已应用：{name}',
  'rename.title':'重命名标签','rename.none':'请把光标放在 \\label 或引用上','rename.empty':'请输入名称','rename.invalid':'标签不能包含 { } \\ % # 或逗号',
  'rename.taken':'已存在名为「{name}」的标签','rename.hint':'↵ 重命名 {files} 个文件中的 {n} 处 · Esc 取消','rename.done':'已将 {from} 重命名为 {to}（{n} 处）','rename.undo':'撤销重命名',
  'refs.find':'查找所有引用',
  'table.title':'插入表格','matrix.title':'插入矩阵','table.insert':'插入','table.size':'行数与列数','table.align':'列对齐','table.left':'左','table.center':'居中','table.right':'右',
  'table.booktabs':'三线表（booktabs）','table.float':'外包 table 环境（含标题与标签）','table.mode':'表格','matrix.mode':'矩阵','matrix.kind':'括号','table.added':'已添加 \\usepackage{{name}}',
  'history.restoreFile':'只还原此文件','history.changes':'改动','history.full':'快照全文','history.same':'自此快照以来，这个文件没有改动。','history.tooBig':'文件太大，无法对比。',
  'history.direction':'快照 → 现在','history.unchanged':'… {n} 行未变','history.newFile':'快照之后新建','history.goneFile':'快照之后已删除',
  'history.fileConfirm':'还原 {name}？','history.fileBody':'只有这个文件会回到快照时的内容；当前项目会先保存为一个快照。','history.fileRestored':'已还原 {name}',
  'history.delta':'+{added} −{removed} · {files} 个文件','history.identical':'与现在相同',
  'complete.cite':'文献',
});
Object.assign(en,{
  'pdfFind.open':'Search in PDF','pdfFind.placeholder':'Search the PDF','pdfFind.count':'Page {page} · {i} / {n}','pdfFind.noText':'No text to search yet','pdfFind.stale':'Text can be selected after the full pass',
  'spread.single':'Single page','spread.double':'Two pages','spread.cover':'Two pages, cover alone','spread.narrow':'One page: too narrow for two',
});
Object.assign(zh,{
  'pdfFind.open':'在 PDF 中搜索','pdfFind.placeholder':'搜索 PDF 文字','pdfFind.count':'第 {page} 页 · {i} / {n}','pdfFind.noText':'暂无可搜索的文字','pdfFind.stale':'完整排版后可选择文字',
  'spread.single':'单页','spread.double':'双页','spread.cover':'双页（封面单独）','spread.narrow':'宽度不足，已改为单页',
});
Object.assign(en,{
  'set.search':'Search settings','set.none':'No setting matches','set.thumbs':'Page thumbnails','set.spread':'Pages side by side',
  'spread.short.single':'One','spread.short.double':'Two','spread.short.cover':'Cover',
  'set.theme.desc':'Follow the system, or always light or dark','set.accent.desc':'The colour of live updates, selection and focus','set.lang.desc':'Interface language',
  'set.darkPages.desc':'In the dark theme, pages go dark too; figures keep their colours','set.fontSize.desc':'Size of the source text','set.wrap.desc':'Wrap long lines at the edge of the editor',
  'set.autoClose.desc':'Type the closing bracket, brace or $ for you','set.tabSize.desc':'Spaces per indent level','set.spellcheck.desc':'Underline misspelt words with the browser’s dictionary',
  'set.autoCompile.desc':'Update the preview and the PDF when you pause typing','set.mathPreview.desc':'Typeset the formula at the caret with real LuaTeX','set.mathScale.desc':'Size of that formula preview',
  'set.follow.desc':'Scroll the preview when the caret moves to another place','set.thumbs.desc':'A strip of page thumbnails beside the preview','set.spread.desc':'Two pages per row, optionally with the cover alone',
  'set.persist.desc':'Keep projects and their history in this browser',
});
Object.assign(zh,{
  'set.search':'搜索设置','set.none':'没有匹配的设置','set.thumbs':'页面缩略图','set.spread':'双页并排',
  'spread.short.single':'单页','spread.short.double':'双页','spread.short.cover':'封面',
  'set.theme.desc':'跟随系统，或固定浅色、深色','set.accent.desc':'实时更新、选中与焦点使用的颜色','set.lang.desc':'界面语言',
  'set.darkPages.desc':'深色主题下页面也变暗，插图保持原色','set.fontSize.desc':'源码文字大小','set.wrap.desc':'长行在编辑器边缘换行',
  'set.autoClose.desc':'自动补上右括号、右花括号与 $','set.tabSize.desc':'每级缩进的空格数','set.spellcheck.desc':'用浏览器词典标出拼写错误',
  'set.autoCompile.desc':'停止输入后自动更新预览与 PDF','set.mathPreview.desc':'用真实 LuaTeX 排版光标所在公式','set.mathScale.desc':'公式预览的大小',
  'set.follow.desc':'光标移到别处时滚动预览','set.thumbs.desc':'在预览旁显示页面缩略栏','set.spread.desc':'每行两页，可让封面单独一页',
  'set.persist.desc':'在此浏览器中保存项目与历史',
});
Object.assign(en,{
  'projects.open':'Projects…','projects.title':'Projects','projects.recent':'Recent projects','projects.all':'All projects…','projects.missing':'That project is no longer in this browser',
  'projects.deleted':'Deleted {name}','projects.deletedMany':'Deleted {n} projects','projects.off':'Turn on “Keep projects in this browser” in Settings to keep more than one project.',
  'projects.unavailable':'This browser cannot store projects, so only the open one is kept, in memory.','projects.count':'{n} project(s) in this browser','projects.current':'Open',
  'projects.openIt':'Open','projects.duplicate':'Duplicate','projects.copyOf':'{name} (copy)','time.today':'Today {time}','time.yesterday':'Yesterday',
});
Object.assign(zh,{
  'projects.open':'项目…','projects.title':'项目','projects.recent':'最近的项目','projects.all':'所有项目…','projects.missing':'这个项目已不在此浏览器中',
  'projects.deleted':'已删除 {name}','projects.deletedMany':'已删除 {n} 个项目','projects.off':'在设置中打开“在此浏览器中保存项目”，即可保存多个项目。',
  'projects.unavailable':'此浏览器无法保存项目，只在内存中保留当前项目。','projects.count':'此浏览器中有 {n} 个项目','projects.current':'当前',
  'projects.openIt':'打开','projects.duplicate':'复制','projects.copyOf':'{name}（副本）','time.today':'今天 {time}','time.yesterday':'昨天',
});
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
    for(const node of root.querySelectorAll('[data-i18n-title]')){const text=t(node.dataset.i18nTitle);node.dataset.tip=text;node.setAttribute('aria-label',text);}
  };
  return {t,set,apply,get lang(){return lang;}};
}
