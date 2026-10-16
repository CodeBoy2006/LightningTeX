# Persistent LuaHBTeX WASM Runtime & IPC Architecture

This document describes the low-level WebAssembly runtime loader, virtual filesystem layout, `SharedArrayBuffer` device bridge, and chunked asset pipeline implemented in [`public/runtime/`](../public/runtime/).

---

## 1. Chunked Gzip + LZ4 Asset Loader (`raw-loader.js`)

[`public/runtime/raw-loader.js`](../public/runtime/raw-loader.js) initializes the **LuaHBTeX 1.24.0 / TeX Live 2026** WebAssembly runtime inside classic Web Workers:

1. **Manifest Verification & Streaming Decompression**: Reads `public/luahbtex/asset-manifest.json` and streams each $\le 16\text{ MiB}$ `.gz.partNNN` file through `DecompressionStream('gzip')` into a preallocated `Uint8Array(decodedSize)`, bounding peak memory overhead to a single 16 MiB part.
2. **`WebAssembly.Module` Sharing**: `BackgroundEngine` compiles `luahbtex.wasm` via `WebAssembly.compile()` and returns the compiled `WebAssembly.Module` to the host coordinator. When `LiveEngine` starts, it receives that `WebAssembly.Module` and instantiates it directly via `new WebAssembly.Instance(module, imports)`, skipping duplicate network fetches, decompression, and WASM compilation.
3. **16 KiB LZ4 Virtual Filesystem**: `texlive-luahbtex.data` is mounted via Emscripten's `getPreloadedPackage` hook as a read-only LZ4-compressed virtual filesystem (`/texlive` and `/etc`) using 16 KiB LZ4 blocks, decompressing individual TeX macro and font files on demand in memory.

### Virtual Filesystem Layout

| VFS Path | Purpose |
| :--- | :--- |
| `/rtex` | Embedded Lua/TeX incremental service (`rtex-serve.lua`, `rtex-capture.lua`, `rtex-dl.lua`, `rtex-dl-bin.lua`, `rtex-json.lua`, `rtex-pic.lua`, `latex/*`) |
| `/texlive/texmf-dist` | Pruned TeX Live 2026 distribution (`luahblatex.fmt`, `pdftex.map`, OTF/TFM/PFB fonts, core LaTeX/LuaTeX packages) |
| `/tmp/texlive_remote` | On-demand packages and fonts fetched via `kpse-remote.js` and persisted in browser `Cache Storage`, plus `.misses.json` |
| `/project` | Working directory for full compilation jobs (`main.tex` and multi-file project tree) |
| `/out` | Output directory for full compilation jobs (`main.pdf`, `main.log`, `main.aux`, `main.bbl`, `main.rtex.json`, `main.rtex-page<N>.json`) |
| `/live` | Working directory for the persistent live service (`rtex-preamble.tex`, `serve.tex`, `serve.aux`, preamble support files) |
| `/dev/rtex-req`, `/dev/rtex-resp` | Custom character devices bridging Lua I/O to the `SharedArrayBuffer` mailbox |

---

## 2. Synchronous Worker Suspension without Asyncify (`live-worker.js`)

While `rtex-serve.lua` runs inside LuaHBTeX's `\loop\rtexstep\ifnum\rtexcontinue>0 \repeat`, the Web Worker thread is inside a synchronous WASM call (`callMain`) and cannot return to the JavaScript event loop to receive `postMessage` events.

[`public/runtime/live-worker.js`](../public/runtime/live-worker.js) solves this without Emscripten Asyncify by registering two POSIX character devices via `FS.registerDevice`:

### Request Device (`/dev/rtex-req`, major 64, minor 0)

Backed by a `SharedArrayBuffer(1024 * 1024 + 16)`:
- **Control Header (`Int32Array(mailbox, 0, 4)`)**:
  - `ctl[0]`: Available request payload bytes (`0` when empty).
  - `ctl[1]`: EOF flag.
- **Payload Buffer (`Uint8Array(mailbox, 16)`)**: Up to 1 MiB of UTF-8 JSON or binary request data.
- **Blocking Read**: When `rtex-serve.lua` reads from `/dev/rtex-req` and `ctl[0] === 0`, the device's `read()` hook calls `Atomics.wait(ctl, 0, 0)`, putting the Worker thread to sleep with zero CPU usage while keeping Lua and TeX stacks intact. When the main thread writes a request into the payload buffer, it executes `Atomics.store(ctl, 0, byteLength)` and `Atomics.notify(ctl, 0)`, waking the Worker immediately. Once all bytes are consumed, the Worker resets `ctl[0]` to `0` and notifies the host.

### Response Device (`/dev/rtex-resp`, major 64, minor 1)

- **Streaming Write & Font Extraction**: When `rtex-serve.lua` writes a framed response (`[u32LE length][u8 kind][payload]`) to `/dev/rtex-resp`, `emitResponse()` reassembles complete frames while the WASM runtime is still synchronously active.
- For `kind === 1` (`RTDL` binary display-list frames), `emitResponse()` scans all `FONT` records (`tag === 2`) in the binary payload, reads any newly referenced font files from `m.FS` (`sentFonts` tracks already-transferred filenames), and transfers the frame buffer and new font `ArrayBuffer`s to the main thread via zero-copy `postMessage(msg, transferList)`.

---

## 3. Heap Snapshot Reset & Pass Reuse (`background-worker.js`)

In [`public/runtime/background-worker.js`](../public/runtime/background-worker.js), full-document compilation runs up to 2 passes (or 3 passes when `.bbl` bibliography output changes):

1. **Linear-Memory Snapshot Reset**: Immediately after `loadRtexEngine()` finishes initializing `/out` and restoring cached packages, the worker snapshots the active prefix of `engine.HEAPU8`. After each `engine.callMain(args)` pass, `engine.HEAPU8.fill(0); engine.HEAPU8.set(snapshot)` restores the C/Lua heap to its clean pre-run state in ~2 ms while preserving the virtual filesystem (`engine.FS`).
2. **Cold First-Pass Hook Suppression**: When no prior `.aux` state is available (`priorFiles === undefined`), pass 1 is guaranteed to be followed by pass 2. On pass 1, the job prepends:
   ```tex
   \RemoveFromHook{enddocument/afterlastpage}[rtex-capture]
   \AddToHookNext{begindocument/end}{\directlua{luatexbase.remove_from_callback("pre_shipout_filter","rtex-capture")}}
   ```
   This skips `rtex-capture`'s shipout node traversal and JSON export during pass 1 while running normal TeX typesetting, PDF generation, and package hooks. The heap snapshot reset automatically restores full capture on pass 2.
3. **Byte-for-Byte Auxiliary Reuse**: Across edits to the same root file and preamble, the worker retains byte maps of all `.aux`, `.toc`, `.out`, `.lof`, `.lot`, and `.bbl` files. If pass 1 produces identical auxiliary bytes and no LaTeX rerun warning, compilation completes in a single pass.
