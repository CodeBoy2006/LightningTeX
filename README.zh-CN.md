# Realtime TeX Web

将 realtime-tex 的 Lua 端增量排版搬进浏览器：复用 TeXlyre / BusyTeX 的 LuaHBTeX WebAssembly，保留原项目的捕获器、上下文回放、持久段落服务和二进制显示列表。浏览器宿主用 JavaScript 实现；没有把依赖原生进程的 Rust Session 直接宣称为已经编译成 WASM。

## 直接使用

下载「运行包」并解压，在解压目录运行：

```sh
node server.mjs
```

然后打开 http://127.0.0.1:4173 。建议 Node.js 22.12 或更新版本。运行包已经包含编译好的网页、WASM、TeX 基础包和字体，不需要 npm install，也不需要安装 TeX Live。

不能直接双击 index.html：Web Worker、WASM 资源加载和增量通道需要 HTTP 安全上下文。附带的服务器只监听本机，并设置 COOP / COEP。远程自托管时需要 HTTPS 和相同响应头；其他服务器配置见 docs/DEPLOYMENT.md。

首次加载约 76 MiB 压缩引擎数据，解压后约 119.5 MiB，另外还有网页与加载脚本。只预装 TeX Live basic；microtype、booktabs 等额外宏包及其依赖在文档实际使用时下载，并复用浏览器缓存，不再整包加载 recommended。建议在桌面浏览器使用；本次未验收手机浏览器。

## 怎么试

1. 打开页面后自动编译默认文档，右侧显示真实 PDF
2. 保持 Auto 开启，编辑文字、公式、列表、标题或子文件；通过原文校验后，只排版受影响的局部内容，并直接更新页面
3. 输入后约 60 ms 开始处理；处理期间的输入合并为最新版本。改变行数或结构时先即时重排预览，停顿约 500 ms 后启动全文校准；校准期间仍能继续即时编辑
4. 行内公式、独立公式、equation 和 align 均使用真实 LuaLaTeX 和原始字体。括号或公式定界符未闭合时保留上一张成功预览，补全后自动恢复
5. `Live · PDF pending` 表示预览已更新、PDF 文件尚未更新；`pagination pending`（分页待校准）表示页高、分页或编号暂为预览值，随后由全文编译校准。下载始终生成包含最新修改的完整 PDF
6. 尝试交叉引用、列表和表格示例；下载 PDF 或 .tex

Ctrl / Command + Enter 完整编译；编译时再次点击顶栏状态胶囊可停止。文件默认保存在当前浏览器，可在设置中关闭；关闭时会清除已保存的项目和本地快照。

## 编辑工作区

顶栏集中提供项目、布局、实时状态、导出和设置。源码／分栏／预览三种布局可随时切换；实时胶囊显示最近的局部更新耗时，箭头菜单控制自动编译。黄色侧边条标记光标对应的纸面位置；预览中的临时分页会标为「分页待校准」。

- **命令面板：** `Ctrl / Command + K` 搜文件与操作；`@` 搜章节和标签，`>` 只搜命令，`:行号` 跳转。设置底部提供快捷键总览。
- **查找替换：** `Ctrl / Command + F` 查找，`Ctrl / Command + Shift + H` 替换；支持大小写、全词和正则。替换、补全、图片引用和符号插入都进入编辑器的原生撤销栈。
- **补全与导航：** 输入命令、环境、引用标签或文件路径后，用方向键选择，Tab / Enter 插入，Esc 关闭。侧栏大纲随光标定位，点击章节或预览段落可跳到源码。大纲编号与字数是源码估算，不展开自定义宏或自定义章节编号。
- **文件与模板：** 项目菜单打开模板画廊，也可拖入 ZIP。标签可拖动排序，右键关闭其他／右侧标签或定位文件；分隔条支持方向键调整和 Home 复位。
- **图片与符号：** 图片拖入或粘贴到源码会存入 `figures/` 并插入引用；重名自动加序号。GIF、WebP、BMP 转为 PNG，动画取第一帧。文件树中的 TeX 文件可拖入源码插入 `\input`。文档需加载 `graphicx`；缺少时界面会提示。数学符号面板位于命令面板，支持名称、符号和 `->` 等搜索。
- **本地历史：** 完整编译成功后，距同项目上一份快照至少 5 分钟时保存文本快照；浏览器内最多保留最近 30 份。侧栏「本地历史」可预览与还原，还原前强制保存当前文本作为恢复快照，现有图片保持不变。快照依赖浏览器存储，不是项目 ZIP 的一部分；新建／导入项目的历史独立显示。
- **预览与导出：** Ctrl / Command + 滚轮以指针为锚点缩放；浮动工具条提供缩放预设、适应宽度／整页和页码跳转。预览获得焦点时可用 Page Up / Page Down 翻页。「导出」集中提供 PDF、项目 ZIP 和当前文件；PDF 有待更新时先完整编译。

首次加载提供分阶段进度，可以边加载边编辑。编译错误保留上次成功预览，并在源码行、问题列表和预览提示条中呈现；日志可复制，问题可按级别筛选。界面支持中英文、浅深主题和系统减少动效偏好。本次不扩展窄屏／触控方案（X7）。

## 本版的准确范围

- 真正增量：首次完整编译捕获布局；首次编辑某个单元时校验原文字形与坐标，之后只向常驻引擎发送修改的单元。几何不变时沿用精确行替换；换行、公式增高、段落拆分/删除、相邻普通段落合并时，使用真实 TeX 字形即时重排受影响页面
- 局部路径还支持已捕获的 itemize/enumerate/description、quote/quotation、section 等标题，以及 proof、abstract、theorem/lemma/proposition/corollary/remark、行内/独立公式、equation、align、gather、multline。定理环境保留标题、共享编号和内部列表。主文件和被引用的文本子文件按各自源位置跟踪。标题、标签/引用、编号变化会标记待校准；不完整输入保留上一张成功预览
- 即时重排暂时伸缩页面并移动下方的 PDF 底图，保留正文、插图和页脚；跨页单元暂沿用已捕获的分页位置。停顿后由原有全文引擎恢复精确分页、页码、引用和辅助文件。没有新增分页引擎，也不把临时预览作为导出的 PDF
- 常驻 LuaTeX 和 PDF.js Worker 复用。完整排版复用同一前言下上次成功的 aux；稳定时执行一遍，引用变化或目录等辅助文件需要时执行两遍
- 绘制使用真实字体与整数 scaled-point 坐标。OpenType/TrueType 使用引擎 glyph index；Type 1 字体使用已安装的 PDF.js 转换原 PFB 轮廓，支持直接映射和静态 256 字符重编码（包括 Latin Modern 的 T1 与数学字体），按字体文件及编码缓存，没有新增依赖或另一套公式排版器
- 已编译 PDF 作为页面底图，只清除并重绘通过边界校验的区域；缩放重放最新局部结果。前言/宏定义、文件结构、不能隔离的跨文件段落、复杂绘图、并列栏相交区域或不受支持的字体/色彩仍走完整编译。预览与 PDF 分别记录版本，迟到的全文结果不能覆盖更新的预览
- 不含原项目所有 Rust Session 功能；没有承诺与原生版所有包和环境完全等价
- 支持多文件项目、图片/PDF 上传和项目 ZIP 导入/导出；尚未接入 BibTeX/Biber
- 缺失的宏包、文档类和字体由 BusyTeX 自动向 TeX Live 2026 文件服务获取。完整编译后将下载文件保存在浏览器 Cache Storage 中，后续完整编译和增量引擎共用；缓存不可用时仍可联网编译。首次使用未缓存文件需要网络，仍不保证所有宏包兼容
- 外部 shell 命令关闭。编译发生在客户端，不提交文档内容；默认文件服务 texlive2026.texlyre.org 会收到所查询的文件名。需要 Python、图形转换器等外部程序的功能仍需单独支持
- 对需要三遍以上才能收敛的特殊引用，日志会提示；不声称完整文档已经通用收敛

## 验证结果

真实 WebAssembly、原项目 Lua 文件和浏览器 Worker 脚本已经在 Node worker_threads 中运行：

- 三个完整样例均产生有效 PDF
- 连续 26 次文字/公式编辑只发生初始化的一次全文编译，常驻引擎重启次数为零；最终所有字形与坐标逐项等于重新完整编译的结果
- 上述测试包括行内公式、分式求和、编号公式、align、跨段落修改、proof/abstract、小标题正文、T1 字体与初始 PDF 中不存在的数学字形。Node 回归测试数据见 `qa/incremental-math.json`，不含浏览器输入调度
- Codex 内置浏览器实测：公式补全到 Full 更新约 131 ms；预热后的局部处理约 6–8 ms，首次数学字体转换约 125–156 ms。这些是本机单次观测，不是延迟保证
- 未完成公式保留画面且不触发编译；PDF 下载触发完整编译，并通过实际下载文件的文本提取确认包含最新文字
- 用户完整 13 页论文（含两张 PDF 插图）的六次正文/公式交替编辑全部走 Live，处理为 22–187 ms，全文编译计数不变；插图所在页另有两次 Live 更新。缩放保留最新公式，实际下载 PDF 经文本提取确认包含最新修改，测试后恢复原稿。细节见 QA.md
- 122 项单元/DOM/渲染器测试、真实 WASM 增量与多文件项目回归、生产构建通过

2026-10-13 的扩展验收通过 145 项测试，另覆盖 11 类真实 WASM 即时编辑，局部阶段只有一次初始全文编译、没有引擎重启；每种结果的字形、字号、进宽和规则都与独立完整编译核对（临时位置和分页不要求一致）。浏览器实测段落拆分、合并、列表增项、公式增高、子文件连续编辑与未完成公式恢复、缩放和最新 PDF 导出。运行 `npm run test:reflow` 可复现引擎检查，完整记录见 QA.md。

后续累计 benchmark 通过 147 项测试：112 次有效局部修改和 17 次未完成公式输入，覆盖连续输入/退格、段落增删与恢复、跨页增长/缩短、公式增高和整块删除/撤销；15 个检查点与独立全文编译核对字形和规则。首段前插入、连同空行删除公式现在也能即时更新；恢复已删除内容会复用原单元，避免误用后续段落的公式计数器。运行 `npm run test:sequence` 复现，结果写入 `qa/live-sequence.json`。Node 本机一次运行中位 5.95 ms、P95 102.88 ms（含局部排版、字形绘制和检查，不含浏览器输入计时器）。浏览器另验证连续输入期间 Live 更新、跨页校准及最新 PDF 内容；详见 QA.md。

2026-10-14 重新使用上述完整 13 页论文与两张原始 PDF 插图验收，改为浏览器实际逐键输入（可信 keydown/beforeinput/input 事件）。定理连续输入 20 键产生 11 次 Live 更新（9.9–17 ms）；跨第 5、6 页的证明连续输入 61 键产生 32 次 Live 更新（16–39 ms），输入期间没有全文编译，停下后约 0.5 秒校准。另验证段落增删、未完成公式保留预览、根式与跨页求和分式恢复；下载 PDF 包含最新修改，测试页已恢复原稿。150 项测试和扩展后的 18 类真实 WASM 重排检查通过，记录见 `qa/full-paper-input.json` 与 QA.md。

浏览器验证限定桌面 Codex 内置浏览器。中文输入法按用户要求未测试；Safari、Firefox、移动端、物理键盘及更大文档的性能尚未验收。局部绘制要求白色纸面，不能解释的全页绘制仍回退。不能据这些样例声称任意 LaTeX 操作都即时完成。

## 开发

源码包中：

```sh
npm ci
npm run dev
npm run build
npm test
npm run test:runtime
npm run test:integration
npm run test:preview
npm run test:incremental
npm run test:reflow
npm run test:sequence
```

npm run preview 使用本机静态服务器提供 dist。Worker 位于 public/runtime，原项目 Lua/TeX 文件在 public/rtex，压缩 WASM/数据在 public/busytex。Vite 只负责前端构建，不运行原生 TeX。

Node 回归测试使用 `tests/fixtures/tex-packages.json.gz` 中的少量已下载宏包运行离线检查；这些测试夹具不会打包到网页。浏览器运行时仍按需获取缺失文件，包含 microtype 的 Lua 模块和字体配置。

浏览器输入 benchmark：运行开发服务器后打开 `/tests/browser-input.html`，通过项目 ZIP 导入完整论文及插图；待全文编译完成，展开 `Input benchmark`，点击 `Reset measurements`，再用键盘连续编辑。面板统计真实输入事件、Live 状态、全文请求及 Live Worker 启动次数，`Download trace` 导出记录。恢复基准原稿后可重复同一操作；面板只在该测试页面加载。

`tests/runtime-helpers.mjs` 统一提供 Node 的浏览器 Worker 适配和支持文件读取；支持文件清单复用 `core/engine-client.js` 的 `TEX_FILES`，添加 Lua/TeX 支持文件时只需更新这一处。

包服务地址在 `public/runtime/raw-loader.js` 的 `TEXLIVE_REMOTE_ENDPOINT` 中设置；设为空字符串可关闭远程查找及远程文件缓存恢复。自托管服务必须实现 BusyTeX 的 `GET /<format_id>/<filename>` 接口并使用配套的 TeX Live 2026 文件树，不能直接填写 CTAN 地址。完整编译（包括下载）最多 120 秒，可随时取消。浏览器清理网站数据会删除宏包缓存；只缓存成功下载的文件，不持久化缺失结果。随应用打包的字体不查询不存在的可选替代格式；完整编译遇到的 404 结果在当前会话内传给实时引擎，避免局部编辑重复等待网络。首次完整编译、引擎预热与后续局部更新的耗时不同；修改前言或不支持的内容仍会触发全文排版，局部重排后的精确分页也由全文编译完成。

## 来源与许可证

- realtime-tex，MIT，固定提交 1f681835cfcbeeabcca340b7784316a0ef186d81：https://github.com/HenryXiaoYang/realtime-tex
- TeXlyre BusyTeX 的官方 assets-v1.4.0 分发（内含 TeX Live 2026、LuaHBTeX 1.24）：https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.0
- 引擎构建工程：https://github.com/TeXlyre/texlyre-busytex-build
- PDF.js：https://github.com/mozilla/pdf.js
- OpenType.js：https://github.com/opentypejs/opentype.js

本项目按 AGPL-3.0 分发；TeX 引擎、宏包与字体保留各自许可证。见 THIRD-PARTY-NOTICES.md。生成的用户 PDF 不因为使用本应用而自动改为 AGPL。
