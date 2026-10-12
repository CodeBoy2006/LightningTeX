# Realtime TeX Web

将 realtime-tex 的 Lua 端增量排版搬进浏览器：复用 TeXlyre / BusyTeX 的 LuaHBTeX WebAssembly，保留原项目的捕获器、上下文回放、持久段落服务和二进制显示列表。浏览器宿主用 JavaScript 实现；没有把依赖原生进程的 Rust Session 直接宣称为已经编译成 WASM。

## 直接使用

下载「运行包」并解压，在解压目录运行：

```sh
node server.mjs
```

然后打开 http://127.0.0.1:4173 。建议 Node.js 22.12 或更新版本。运行包已经包含编译好的网页、WASM、TeX 基础包和字体，不需要 npm install，也不需要安装 TeX Live。

不能直接双击 index.html：Web Worker、WASM 资源加载和增量通道需要 HTTP 安全上下文。附带的服务器只监听本机，并设置 COOP / COEP。远程自托管时需要 HTTPS 和相同响应头；其他服务器配置见 docs/DEPLOYMENT.md。

首次加载约 168 MiB 压缩引擎数据，解压后约 223 MiB，另外还有网页与加载脚本。包含 TeX Live recommended 集合（已涵盖 basic），可直接使用 microtype、booktabs、TikZ 等常用包。建议在桌面浏览器使用；本次未验收手机浏览器。

## 怎么试

1. 打开页面后自动编译默认文档，右侧显示真实 PDF
2. 保持 Auto 开启，编辑文字或公式；满足局部校验的修改只排版当前段落或公式，并直接更新 Full 中的页面
3. 输入后约 60 ms 开始处理；处理期间的输入合并为最新版本，不积压旧版本
4. 行内公式、独立公式、equation 和 align 均使用真实 LuaLaTeX 和原始字体。括号或公式定界符未闭合时保留上一张成功预览，补全后自动恢复
5. Full 显示 `Live · PDF pending` 表示当前预览已更新；下载 PDF 时才生成包含最新修改的完整 PDF。Live status 和 Engine console 可查看局部更新或完整排版的原因
6. 尝试交叉引用、列表和表格示例；下载 PDF 或 .tex

Ctrl / Command + Enter 完整编译。可以取消正在进行的编译。草稿保存在浏览器是明确的可选项，默认不保存。

## 本版的准确范围

- 真正增量：首次完整编译捕获布局；首次编辑某个单元时校验原文字形与坐标，之后只向常驻引擎发送修改的单元，替换其页面行。其他段落、页眉页脚及页码保持原布局
- 局部路径支持已捕获的顶层文字、行内/独立公式、equation、align、gather、multline 等数学单元和明确列出的常用命令。行数、行高、行基线改变，或修改前言、标签/引用、换行分页规则时，退回完整排版
- 常驻 LuaTeX 和 PDF.js Worker 复用。完整排版复用同一前言下上次成功的 aux；稳定时执行一遍，引用变化或目录等辅助文件需要时执行两遍
- 绘制使用真实字体与整数 scaled-point 坐标。OpenType/TrueType 使用引擎 glyph index；直接映射的 Type 1 数学字体使用已安装的 PDF.js 转换原 PFB 轮廓并缓存精确字符编码映射，没有新增依赖或另一套公式排版器
- 字体重编码、字体集合、图片、特殊图形/色彩等不能可靠局部绘制时，使用完整 PDF。预览与 PDF 文件分别记录版本，导出不会悄悄返回旧 PDF
- 不含原项目所有 Rust Session 功能；没有承诺与原生版所有包和环境完全等价
- 单文件 .tex 导入/导出；本版 UI 尚不支持多文件项目、上传图片、BibTeX/Biber
- 缺失的宏包、文档类和字体由 BusyTeX 自动向 TeX Live 2026 文件服务获取。完整编译后将下载文件保存在浏览器 Cache Storage 中，后续完整编译和增量引擎共用；缓存不可用时仍可联网编译。首次使用未缓存文件需要网络，仍不保证所有宏包兼容
- 外部 shell 命令关闭。编译发生在客户端，不提交文档内容；默认文件服务 texlive2026.texlyre.org 会收到所查询的文件名。需要 Python、图形转换器等外部程序的功能仍需单独支持
- 对需要三遍以上才能收敛的特殊引用，日志会提示；不声称完整文档已经通用收敛

## 验证结果

真实 WebAssembly、原项目 Lua 文件和浏览器 Worker 脚本已经在 Node worker_threads 中运行：

- 三个完整样例均产生有效 PDF
- 连续 26 次文字/公式编辑只发生初始化的一次全文编译，常驻引擎重启次数为零；最终所有字形与坐标逐项等于重新完整编译的结果
- 上述测试包括行内公式、分式求和、编号公式、align、跨段落修改，以及初始 PDF 中不存在的数学字形。预热后局部排版和绘制中位数约 2.05 ms（Node 环境，不含浏览器输入调度）
- Codex 内置浏览器实测：公式补全到 Full 更新约 131 ms；预热后的局部处理约 6–8 ms，首次数学字体转换约 125–156 ms。这些是本机单次观测，不是延迟保证
- 未完成公式保留画面且不触发编译；PDF 下载触发完整编译，并通过实际下载文件的文本提取确认包含最新文字
- 70 项单元/DOM/渲染器测试、真实 WASM 增量与完整排版回归、生产构建通过；细节见 QA.md

本次浏览器验证限定桌面 Codex 内置浏览器；Safari、Firefox、移动端及长文档性能尚未验收。当前交付是可以自行启动的应用与源码包，没有部署在线服务。

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
```

npm run preview 使用本机静态服务器提供 dist。Worker 位于 public/runtime，原项目 Lua/TeX 文件在 public/rtex，压缩 WASM/数据在 public/busytex。Vite 只负责前端构建，不运行原生 TeX。

包服务地址在 `public/runtime/raw-loader.js` 的 `TEXLIVE_REMOTE_ENDPOINT` 中设置；设为空字符串可关闭远程查找及远程文件缓存恢复。自托管服务必须实现 BusyTeX 的 `GET /<format_id>/<filename>` 接口并使用配套的 TeX Live 2026 文件树，不能直接填写 CTAN 地址。完整编译（包括下载）最多 120 秒，可随时取消。浏览器清理网站数据会删除宏包缓存；只缓存成功下载的文件，不持久化缺失结果。

## 来源与许可证

- realtime-tex，MIT，固定提交 1f681835cfcbeeabcca340b7784316a0ef186d81：https://github.com/HenryXiaoYang/realtime-tex
- TeXlyre BusyTeX 的官方 assets-v1.4.0 分发（内含 TeX Live 2026、LuaHBTeX 1.24）：https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.0
- 引擎构建工程：https://github.com/TeXlyre/texlyre-busytex-build
- PDF.js：https://github.com/mozilla/pdf.js
- OpenType.js：https://github.com/opentypejs/opentype.js

本项目按 AGPL-3.0 分发；TeX 引擎、宏包与字体保留各自许可证。见 THIRD-PARTY-NOTICES.md。生成的用户 PDF 不因为使用本应用而自动改为 AGPL。
