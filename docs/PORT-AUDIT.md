# realtime-tex browser WASM port audit

Inspected upstream commit `1f681835cfcbeeabcca340b7784316a0ef186d81` (workspace version 0.0.3). Source-only audit: no downloaded software executed, no compile or browser proof performed, no upstream files changed. No AGENTS.md found under /workspace/shared. All references below are relative to upstream.

## Finding

This is feasible in principle, but is **two ports**, not a Rust WASM target switch:

1. Reuse/extract the Rust incremental document and layout model and supply a browser scheduler/host.
2. Supply an actual LuaTeX/LuaLaTeX WASM runtime with the LuaTeX node, token, font, callback, kpse and PDF facilities used by the bundled Lua scripts. The repository does not vendor/build LuaTeX and contains no such runtime.

The decisive capability is maintaining a loaded LuaLaTeX instance across paragraph requests. A WASM TeX package that only exposes `compile(file) -> PDF` and exits cannot preserve rtex's millisecond path without changing its runtime. A non-LuaTeX engine cannot execute the existing capture and live-server machinery. A browser UI doing full recompiles or plain-text approximation is not an incremental port of this implementation.

## Dependency graph

- `rtex-cli` -> `rtex-core`, `rtex-dl`, `rtex-verify`; native command-line hosts/benchmarks, not required in browser.
- `rtex-core` -> `rtex-dl`, serde/JSON, regex, hashing, errors/logging; also crossbeam-channel, parking_lot, lopdf, clap, OS-specific nix/libc or windows-sys.
  - `session/mod.rs` -> document, policy, layout, LiveUnits, FastServer, background/capture, PicCache, TexLive; two host threads and channels.
  - `session/route.rs` -> eligibility + captured layout + live history -> FastRequest.
  - `session/engine_loop.rs` -> FastServer/transport -> external `lualatex` -> `tex/rtex-serve.lua` + LaTeX patches -> node traversal/binary DL.
  - `session/passes.rs` -> background/capture -> external `lualatex`, optional biber/bibtex/index tools -> capture metadata, page DLs, PDF, aux files.
- `rtex-dl` -> serde, serde_json, thiserror only; display model and binary codec.
- `rtex-verify` -> rtex-dl, lopdf, flate2, ttf-parser, tiny-skia, png, serde; useful differential-test tooling, not the TeX implementation.
- Lua support: serve/capture -> `rtex-json.lua`, `rtex-dl.lua`, `rtex-dl-bin.lua`, `rtex-pic.lua`; those execute inside LuaTeX and depend on its specialized APIs, not merely ordinary Lua.

## Reusable Rust and extraction seams

| Source | Reuse | Adaptation |
|---|---|---|
| `crates/rtex-dl/src/lib.rs`; `binary.rs:112 decode`, `:524 encode` | Entire display-list model and codecs are in-memory; strongest first WASM crate | Add browser binding/serialization, confirm target build and numeric representation |
| `document.rs:689 impl FileBuf`, `FileBuf::with_block_envs`, `FileBuf::apply` (`:757`), segmentation and stable ParaId logic | Actual incremental resegmentation, UTF-8 byte spans, input expansion | Isolate `load_project_files` (`:247`) from pure code; give it an in-memory project map; browser editor offsets must be converted from UTF-16 to UTF-8 bytes |
| `eligibility.rs:1172 Policy`, `:1743 classify_source_with`, `:2616 check_engine_unit` | Conservative routing policy, parsing, allowed vocabulary | Keep policy; do not silently bless unsupported units |
| `capture.rs:13–242` | Capture/NFSS/context/placement/paragraph/unit types, CaptureJson finalization | Split types from process/file collector. `CaptureResult::page` (`:254`) reads files and must accept page data/bytes |
| `layout.rs:105 EngineUnit::context_json`, `:126 snapshot_spans_of`, `:423 probe_check`, `:511–619` fragments/comparison | Captured-context replay input, unit/span association, glyph comparisons, overlay placement | `LayoutStore::install` (`:178`) calls file-reading `cap.page(n)` (`:348`); introduce in-memory capture pages. Paths for PDF/capture directory become virtual assets. `offline` (`:465`) remains native or gains files-map input |
| `session/live.rs` | Live-unit cache and expiry rules, probe/budget/leak records | Largely plain state; move out of thread-based Shared |
| `session/mod.rs:149–268` | Versions, convergence/status, event shapes, edit results | Keep contract; asset paths become IDs/URLs; expose nonblocking operations |
| `session/diag.rs` | Log parser | Supply log bytes rather than filesystem paths where required |
| `piccache.rs` scan/hash/uncacheable helpers (`:578`, `:596`, `:629`) | Picture dependency policy | Persistent cache/index, PDF page extraction and disk writes must be separated; disable picture cache in first MVP |

`document` imports picture environment constants from piccache, and eligibility/layout/capture cross-reference one another. A browser feature that only hides `engine.rs` is insufficient; disentangle type/model modules as well. Preserve native modules behind a `native` feature and make browser host additive, rather than fork all algorithms into JavaScript.

## Exact behavior that must survive

- Initial background capture establishes per-unit contexts and real page placements. No captured context means no exact fast overlay.
- Edit routing retains source revision, context revision, engine generation and layout version (`session/mod.rs:149`). Queued work is latest-per-unit, and obsolete results must not be painted.
- A persistent engine uses the project's loaded preamble, begins document hooks, receives contexts and labels, then typesets only the edited unit in a vbox. It must return to the normal TeX outer loop between requests.
- Probes compare the *old captured source* against captured rows before permitting unknown vocabulary (`EngineLoop::prove`, `engine_loop.rs:560`). Checking only current source syntax loses this guarantee.
- Fingerprints, counter restoration and macro leak checks must remain. A polluted/hung runtime is terminated and replaced; affected source is demoted/quarantined, not endlessly retried.
- Row count or counter changes invalidate global assumptions. Emit pagination/context staleness and schedule a full capture pass. New/borrowed contexts remain approximate until a pass.
- Full passes converge aux state and preserve honest Converging/Stale/PassLimitReached/Converged status. Do not label a single arbitrary pass converged.
- Source diagnostics, internal Lua errors, degraded display lists and fatal engine-state errors remain distinct.

## Engine wire and Lua boundary

`docs/engine-protocol.md` describes the exact request/response contract; implementation is `engine.rs` and `tex/rtex-serve.lua`.

- Compile request: `C <req> <ctx> <len> [<plen>]\n`, followed by source bytes and optional picture JSON bytes. Context/labels/ping/stats/shutdown use JSON lines.
- Response: little-endian u32 length, u8 kind, payload. Kind 0 is JSON. Kind 1 is u32 JSON length + result JSON + binary DL.
- `FastServer::spawn_with` (`engine.rs:177`) writes preamble and a driver, copies aux/bbl, spawns lualatex and opens transport. Generated driver ends in `\loop\rtexstep\ifnum\rtexcontinue>0 \repeat`.
- `rtex-serve.lua:703 S.init` opens request/response pipes, registers callbacks and Lua function slots, sets replay macros and sends ready.
- `:818 S.step` blocks on a request; `:381 S.begin_compile` prints tokens; TeX runs them; `:467 S.finish` checks/restores state and serializes actual nodes using `rtex-dl.lua:793 paragraph_binary`.
- `:673 S.dispatch` already supports JSON compile requests and control operations, but directly calling it does not itself execute TeX's queued tokens.
- `:481` and `:524` fatal state paths use `os.exit(3)`; the browser runtime wrapper must map this to a generation failure.
- Do not replace the loop with repeated nested `tex.runtoks`; the upstream protocol docs explain why that leaks an input level per request. The diagnostic profile path deliberately uses it but is unsuitable as a production engine loop.

### Minimal bridge choices

Preferred minimal-change proof: run the LuaTeX module in a dedicated Web Worker, bridge request/response channels to custom in-memory runtime devices, and preserve the existing byte protocol and TeX loop. Blocking reads need an actual suspension mechanism. Possibilities are an Asyncify/JSPI-enabled runtime that can suspend on imported reads, or a SharedArrayBuffer mailbox with Atomics.wait on the worker plus a separately running coordinator. **A plain worker `postMessage` callback cannot wake JavaScript while that same worker is synchronously stuck inside a blocking WASM read.** Runtime feasibility must be verified before selecting either implementation. SharedArrayBuffer has cross-origin-isolation/deployment requirements; Asyncify/JSPI availability/build cost is a separate gate.

Alternative: modify the LuaTeX runtime to expose a safe resume-until-idle entry point and host callbacks. Refactor S.init/step/send to a host table with read/write/clock/environment hooks. This is architecturally clean but requires real TeX runtime control, not merely adding wasm-bindgen to Rust or replacing Lua io.open.

Keep live and background LuaTeX instances in distinct workers. Worker termination supplies a real watchdog even for a synchronous infinite TeX loop; a timeout running on the blocked engine worker would not fire.

## Native assumptions to remove

- `transport.rs:83–88`: Transport is only exported for cfg(unix) and cfg(windows); wasm32-unknown-unknown has neither. Native path uses mkfifo, poll, File descriptors, Windows named pipes and a dedicated blocking reader thread.
- `engine.rs`: Child/Command/Stdio, generation-specific disk files, env configuration, sleep/yield, Instant, kill/wait. `texlive.rs` discovers binaries via PATH/current_exe and builds process env.
- `Session::open` (`session/mod.rs:392`) does filesystem discovery/cleanup and spawns engine/background threads (`:474`, `:482`). `EngineLoop` uses another startup thread for replacement servers, mutexes/channels and timeouts. `Session::poll/wait_for` are blocking host APIs.
- `background.rs:43 write_snapshot`, copy/mirror tree and aux signatures use host filesystem metadata. `run_pass_with_runner` (`:382`) has a useful runner seam but still owns filesystem and external bibliography/index execution, so it is not already a browser abstraction.
- `capture.rs:311 capture_command` builds lualatex process; `collect_capture` (`:342`) reads output JSON/PDF/log files.
- `background.rs:758 WarmEngine::spawn` is another process waiting on stdin; `tex/rtex-bg.lua` waits for GO and exits on QUIT/EOF. Warm standby is optional performance work and can be omitted from MVP without removing paragraph incrementality.
- `session/passes.rs` copies stable PDFs and hard-links them; browser should return immutable byte buffers/Blob asset IDs.
- `piccache.rs:95–305`: persistent index, timestamps, atomic rename, PDF extraction and cleanup; optional early omission.
- Lua uses kpse.find_file, io.*, os.getenv/os.gettimeofday/os.exit, LuaTeX font/token/node/tex/status APIs, Lua 5.3+ string.pack and bit operators. Runtime must support real TeX Live data lookup and writable aux/log/cache areas.

## Realistic minimal viable port

1. **Runtime gate first.** Get a LuaTeX WASM instance that can compile a tiny document with the actual rtex-capture package, producing capture metadata, page DL and PDF. Confirm required callbacks/APIs against upstream's targeted LuaHBTeX 1.24 behavior, rather than assuming any older LuaTeX build matches.
2. **Persistent gate.** Load generated server driver once, receive ready, install a captured context, send two different paragraph compiles, decode both genuine binary DLs, verify same engine generation and unchanged fingerprint. Keep this as a small browser test independent of polished UI.
3. **Reuse Rust.** Extract/build rtex-dl plus document/policy/capture model/layout/live state as WASM. Implement an event-driven BrowserSession. Inputs: project file byte map, UTF-8 edit ranges, captured pass data, engine replies and clock ticks. Outputs: engine actions/background actions/events. Replace locking with ownership in one coordinator worker.
4. **Full capture worker.** Snapshot sources into isolated virtual FS, run full LuaLaTeX using rtex-capture, return metadata/page JSON/PDF/aux files. Re-run until unchanged relevant aux signature and no rerun/error condition. Initially disable standby and picture caching; explicitly unsupported bibliography/index programs must prevent misleading convergence.
5. **Editor and display.** Keep document editor in main thread. Render background pages and replace unit rows using real DL fragments, clearing overlays when a new layout arrives. Bundle/access the actual font bytes identified by FontDesc; browser text shaping alone is not a faithful glyph-ID renderer. Support PDF fallback for degraded page content. Preserve scaled-point coordinates and glyph expansion/matrices; expose source errors.
6. **Packaging.** Ship versioned TeX distribution subset, Lua modules, LaTeX support files, format/fonts and engine build together. Runtime-created font caches and aux state live in virtual FS. Persistent browser cache is optional. Audit TeX/runtime/font licenses separately from repository MIT. No shell escape or arbitrary native programs in the browser; treat project content as untrusted and bound memory/time/files.

First demonstrable scope: one article using bundled fonts, text, inline math and a known paragraph context; real initial pages, genuine incremental paragraph edits and debounced full page reflow. Existing support for other macros may work, but feature claims follow tests. Lists/headings/images/citations are subsequent fidelity fixtures, not guarantees from the Rust build alone.

## Acceptance tests before claiming success

- Engine ready plus repeated edits (including thousands of requests) without engine restart/input-depth growth; record generation, requests, font count, node memory.
- Unchanged source compiled live agrees with capture rows/glyph positions via existing compare_unit_rows/probe_check; preserve integer scaled-point coordinates.
- Paragraph growth/shrink/split, rapid edits with late replies, preamble edits during active work, layout arriving during probe: no stale overlay, honest approximation flags.
- Undefined command, unbalanced braces, macro leak, internal Lua error, infinite macro: UI stays responsive, diagnostics arrive, engine restarts/quarantines correctly.
- References settle across multiple full passes; edits during a pass remain Stale; pass-limit/unavailable bibliography are not Converged.
- Exported PDF against normal LuaLaTeX fixtures, and capture instrumentation against uninstrumented PDF. Existing `crates/rtex-core/tests/{convergence,engine_robustness,internal_error,session,units,capture_groups,export}.rs` provide scenarios to transfer.
- Actual browser loading, font assets, renderer precision, worker transfer cost, startup/memory and steady-state latency measurements. Upstream's native ~1 ms figures are not WASM performance evidence.

## Bottom line

The smallest honest port preserves real LuaLaTeX, capture contexts, the persistent TeX outer loop and incremental Rust policy/layout algorithms. The largest unproven dependency is a browser LuaTeX runtime that can suspend/resume or accept requests while staying alive. Prove that before investing in a full editor. All feasibility statements above are design conclusions from inspected source, not tested runtime compatibility claims.

## Runtime probe handoff: exact minimal files and driver

Mount all `tex/*.lua` at `/rtex/` and all `tex/latex/*` at `/rtex/latex/`. That includes picture modules even with picture cache disabled, because serve/capture unconditionally import them. Prepend `/rtex/latex//:` to TEXINPUTS and `/rtex//:` to LUAINPUTS, retaining runtime defaults. Create project, output and live directories. Set `openout_any=a`, `max_print_line=100000`, `RTEX_REQ=/dev/rtex-req`, `RTEX_RESP=/dev/rtex-resp`; RTEX_REQ works on every platform because Lua tests the variable, not the OS. Ensure environment values exist before Lua initialization. Distinct FS device implementations must retain byte framing and block without treating temporarily empty input as EOF. A response write must not deadlock on a full mailbox while the host waits for completion.

Preamble `/live/rtex-preamble.tex` for first test: `\documentclass{article}\usepackage{luatexbase}`. A project and its live engine must use the same preamble. The minimal driver `/live/rtex-serve-g1.tex`, derived from `engine.rs:215`, is:

```tex
\input{/live/rtex-preamble.tex}
\newbox\rtexbox\newcount\rtexcontinue\rtexcontinue=1
\edef\rtexcountnum{\number\allocationnumber}
\newcatcodetable\rtexcct
{\makeatletter\savecatcodetable\rtexcct}
\begin{document}
\input{rtex-serve-patches}
\directlua{rtex_serve = dofile(kpse.find_file("rtex-serve.lua", "lua") or "rtex-serve.lua") rtex_serve.init(\number\rtexbox, \rtexcountnum, \number\rtexcct)}
\loop\rtexstep\ifnum\rtexcontinue>0 \repeat
\end{document}
```

Run the LuaLaTeX format with `-interaction=batchmode --output-directory=/live /live/rtex-serve-g1.tex`. This omits the graphics mapping hook only because the first test has no images; use the full upstream driver for graphics. Wait for kind-0 `ready`, send `{"op":"ping"}\n`, expect pong. `{"op":"shutdown"}\n` returns bye and stops. This proves lifecycle/transport, not paragraph output.

For the capture gate, `/project/main.tex` contains the exact same preamble and two ordinary blank-line-separated paragraphs. Set `RTEX_CAPTURE_DIR=/out`, empty `RTEX_UNIT_ENVS`, and cwd `/project`. Execute the LuaLaTeX format with:

```
-interaction=nonstopmode -file-line-error --jobname=main --output-directory=/out
\RequirePackage{rtex-capture}\input{main.tex}
```

The final string is one engine argument, not a shell command. Capture outputs are `main.rtex.json`, `main.rtex-page<N>.json`, `main.pdf`, `main.log` plus auxiliaries. The instrumentation command is directly from `capture.rs:281–303`. Copy capture aux/bbl to live generation names before live startup when references/citations matter.

### Building a real context (important delta encoding detail)

Do not use a captured unit directly as a context. `CaptureJson::finalize` (`capture.rs:207`) cumulatively merges **in document order** each unit's `counters`, `thefmt`, `macros` maps and snapshots them into absolute state. Empty Lua maps may serialize as `[]`. Then `layout.rs:105 EngineUnit::context_json` builds:

- kind/name and everypar/nobreak/afterindent/noskipsec from the unit
- counters/thefmt/macros from those absolute cumulative maps
- for kind=par, ints/dims/glues/parshape from the first captured paragraph matching unit.seqs; otherwise from the unit
- begin.nfss and begin.color from the first paragraph's begin when present for kind=par; otherwise unit.nfss/color

Send `{"op":"context","id":<uid>,"ctx":<constructed>}`, wait for ok, then a framed C request or JSON `{"op":"compile","req":1,"ctx":<uid>,"source":"replacement paragraph"}`. JSON form is sufficient for a first no-picture proof. The response's binary DL is actual typeset output. Capture source mapping should use explicit fixture paragraph boundaries plus verified begin_line/end_line initially; do not pretend arbitrary TeX can be regex-segmented safely.

## Smallest conservative browser implementation before a full Rust session port

A tightly scoped real-engine demo may temporarily implement only a documented safe subset in JavaScript while keeping all Lua typesetting/capture unchanged:

1. Fixed simple article preamble, bundled matching fonts, one main file, only known top-level plain-text paragraph spans, no user-defined macros or dynamic assignments. Reject backslash commands and special TeX constructs from the fast path initially (route to full compile), rather than trying to replicate the huge allow-list with a small regex. Preamble/structural changes force fresh full capture and live generation.
2. Require exactly one captured paragraph unit with nonempty placements and first-paragraph context for a span; reject captures with unsupported flags, nonempty custom everypar, ambiguous source mapping, inserts/side effects. Disable borrowing, pictures, bibliography, complex environments and dynamic preambles in the first verified fixture scope.
3. Before first edit for each captured unit/layout, compile that captured source and compare actual rows and glyph positions with capture. A successful baseline probe is an additional check, not permission to accept arbitrary new macro semantics.
4. Sequential engine requests; queue only latest text per paragraph; carry the four revision/generation fields. Do not install a result if its source/context/generation/layout no longer matches. This can initially route concurrent cross-paragraph edits to full background rather than emulate upstream's nuanced stale-context logic.
5. Preserve Lua error/fatal/leak handling. Reject any result with errors, degraded/unsupported items or changed counters; restart after leak/fatal. Only paint edits whose rows fit known capture placement; differing row counts can be marked stale and deferred entirely until full reflow rather than synthesizing approximate placement.
6. Separate full-capture worker after debounce. No warm standby or picture cache required. Rerun supported aux outputs to convergence, then replace full layout, reconstruct contexts and clear overlays. If a richer document compiles successfully in full engine but cannot meet fast-path proof, full compilation remains the safe fallback.

This is genuine incremental compilation **only for its explicitly constrained paragraph subset**, not a full rtex-core port or upstream feature parity. It can prove the runtime and interaction before extracting the full Rust model. Default production strategy should still reuse upstream policy/layout logic to avoid a second correctness implementation.
