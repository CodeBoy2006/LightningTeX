# Persistent LuaLaTeX WASM runtime probe

Historical probe notes follow. The current standalone package is documented in `engine/README.md`: it requires the packed manifest (the raw-asset fallback has been removed), shares compiled WASM between workers, and sends each font once per live worker. These notes preserve the original probe evidence, not the current public API.

## Verified

Official `texlyre-busytex@1.4.0` release assets run **LuaHBTeX 1.24.0 / TeX Live 2026** WebAssembly. Node worker tests execute the same WASM and JS worker implementation intended for the browser; no native TeX binary is used.

- `node node-test.mjs`: real LuaLaTeX PDF, 26,177 bytes, `%PDF-1.7`, exit 0
- `node capture-test.mjs`: upstream rtex capture, two paragraphs/two units, page display-list JSON, metadata, PDF (5,199 bytes), aux; exit 0
- `node live-test.mjs`: unmodified upstream Lua server, ready/ping/context, two different successful genuine binary DL compiles, recoverable undefined-command error, successful compile after the error, stats and shutdown
- Exact OTF font bytes accompany live results (LM Roman Regular: 111,536 bytes)

Browser execution remains **unverified in this execution environment**: installed Chromium aborts at process_singleton socket creation with EPERM, including the permitted escalated attempt. `node server.mjs` serves the browser probe at http://127.0.0.1:8124/runtime-probe/ with the required cross-origin-isolation headers. `node test.mjs` automates Chromium where local sockets are permitted.

## Reusable interfaces

Classic Worker `importScripts('./raw-loader.js')`, then:

    const m = await loadRtexEngine({base:'./busytex/',env:{...},print,printErr});

The result exports `FS`, `ENV`, `callMain`, `HEAPU8`, `_flush_streams`, etc. FS cwd is `/project`. Environment overrides **must be passed before initialization**, since generated libc caches the environment. `rtexLuaArgs(file)` supplies matching format and disables shell escape. Use a fresh module/worker per full compile; no claim is made about repeated main invocations on an unchanged runtime. Live runtime calls main exactly once and remains in the upstream TeX loop.

`live-worker.js` starts with a single message:

    {base, files: {'rtex-serve.lua':content,'latex/rtex-serve-patches.tex':content,...},
     preamble, mailbox: SharedArrayBuffer}

Include all upstream `tex/*.lua` and `tex/latex/*`. The 16-byte mailbox header is an Int32Array: index 0 = available byte count, index 1 = EOF, indices 2–3 reserved. Payload begins at byte offset 16. Only write when index 0 is zero, fill payload then atomically store byte length at index 0 and notify. Reader consumes a chunk, stores zero and notifies. Serialize queued requests in coordinator; do not overwrite an occupied mailbox. JSON requests end in newline; upstream compact C frames also work.

Both workers use `writeEngineFile(fs, absolutePath, contents)` from `raw-loader.js` to create parent directories and install support/project files. Callers retain their existing path validation and choose the `/rtex`, `/project`, or `/live` destination; text and binary contents are passed unchanged to the engine filesystem.

Messages are `{log}`, `{bytes,fonts}`, `{fontError,message}`, `{done,exit}`, or `{error,stack}`. `bytes` contains a COMPLETE frame: u32LE length, u8 kind, payload. Kind 0 is JSON; kind 1 payload contains u32LE JSON length + result JSON + RTDL bytes. `fonts` is a map of exact font filenames to Uint8Array font contents, attached to each result. Response buffering rejects frames over 64MiB. No second worker message is handled while Lua is synchronously running; requests must use the shared mailbox. To cancel hung code, terminate the worker.

The response write callback extracts filenames from real RTDL FONT records and reads FS while the runtime is still executing. This avoids trying to query FS after the runtime blocks waiting for the next request.

**Do not enable `--halt-on-error` for live sessions.** It kills the engine before recoverable errors can be reported. The worker explicitly removes it. Background compiles retain it. An orderly shutdown after an earlier recovered TeX error may have exit status 1; per-request result statuses are the authoritative live responses.

## Why this works without Asyncify

The generated engine has no Asyncify references. Emscripten `FS.registerDevice` exposes synchronous read/write. The dedicated worker blocks in `Atomics.wait` for request data, preserving Lua/TeX stacks and memory; a different agent (main thread/coordinator) writes the SharedArrayBuffer. `postMessage` responses remain deliverable to that agent while the worker is blocked. Browser usage requires COOP `same-origin` and COEP `require-corp` (or an equivalent valid isolation setup).

## Assets and provenance

Downloaded by normal official release URL documented in the npm package:
https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz

Necessary files for the probe: `busytex.js`, `busytex.wasm` (~32MiB), `texlive-basic.js`, `texlive-basic.data` (~89MiB). The large archive also contains unused extra/recommended/Biber assets; no need to ship those for this fixture. `versions.txt` records Emscripten 5.0.4 and TeX Live 2026 source. Do not conflate package-wrapper and engine-build version numbers.

Original upstream source is read from `../upstream` and is not modified. Captured outputs and binary live response payloads live in `output/`. Logs are the `*-result.jsonl` files. Node harness emits an expected IndexedDB-unavailable warning before the official data loader falls back to filesystem bytes.

## Chunked deploy packaging (app integration)

`../scripts/pack-assets.mjs` streams gzip of the app's original WASM and basic data into parts capped at 16MiB. It writes `asset-manifest.json` with encoding, decodedSize, encodedSize and ordered parts. Recorded SHA-256 values support offline validation; runtime validates lengths and gzip integrity. It also adds one explicit, idempotent `getPreloadedPackage` compatibility hook to the app's vendor data-loader copy because the vendor's custom IndexedDB loader did not implement this standard hook.

App `public/runtime/raw-loader.js` supports the manifest (sequential reads/decompression into preallocated decoded arrays), sets wasmBinary/getPreloadedPackage before importing the data script, and retains the original no-manifest loading path. Node file URLs are supported. Assets are read once; no redundant original data fetch. After initialization the WASM buffer reference and preload hook are released; LZ4 correctly retains its own data-package storage.

Verification:
- App `tests/runtime-smoke.mjs`: text PDF 5053B / math PDF 42773B / expected undefined-command error / recovery PDF 3885B. Successful compile times: 2.49s, 1.91s, 1.83s in this Node harness.
- `node chunked-live-test.mjs`: persistent ready/ping/context/two compiles/error/recovery/stats/bye; runtime loading 1.756s.
- `RTEX_ASSET_DIR=./busytex node chunked-live-test.mjs`: unchunked fallback also passes all requests; runtime loading 1.714s.
- App live worker writes provided aux bytes to `/live/serve.aux` and changes cwd to `/live`; logs confirm the aux file is read during startup.

Packed WASM: 13,104,205 bytes, one part. Packed basic data: 66,583,309 bytes, four parts. Combined encoded transfer: 79,687,514 bytes (~76MiB). Original .wasm/.data remain present until parent approves removal; therefore the directory is not yet under the per-file hosting limit until they are excluded/removed. Browser throughput/performance is not implied by local Node measurements.
