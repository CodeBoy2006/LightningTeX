# Self-hosting

The ready-to-run package contains `dist/`, `server.mjs`, README and notices. No database or compilation backend is required.

- Local: Node.js 22.12+, run `node server.mjs`, open http://127.0.0.1:4173
- Choose another local port with `PORT=8080 node server.mjs`
- Production: serve the contents of `dist` over HTTPS; route `/` to `ui/index.html`
- Required headers for persistent incremental mode:
  - `Cross-Origin-Opener-Policy: same-origin`
  - `Cross-Origin-Embedder-Policy: require-corp`
  - `Cross-Origin-Resource-Policy: same-origin`
- Serve `.js` as JavaScript and `.mjs` as JavaScript. `.partNNN` is binary; do not transparently decompress the gzip chunks at the server
- Preserve paths; chunks are assembled and decompressed in the worker. Every chunk is at most 16 MiB
- The static host must support Workers and these isolation headers. An unsupported isolation environment offers full-PDF mode, with an explicit notice
- Keep bundled assets same-origin. Only the basic TeX Live data is preloaded (~76 MiB compressed including WASM). Additional packages and dependencies download per file when used; recommended is neither shipped nor loaded
- Missing TeX files are fetched by the existing BusyTeX worker hook from `https://texlive2026.texlyre.org`. This sends requested filenames, not document contents. The service must allow your origin through CORS under the existing isolation headers
- To use your own service, pass `endpoint` to `createEngine` (in `main.js` for the application). Use the upstream `texlyre-busytex-build/texlive-server` with a matching TeX Live 2026 tree and its `GET /<format_id>/<filename>` protocol. An empty endpoint disables remote lookup and cache restoration. A plain CTAN mirror URL is not compatible
- The public endpoint selects TeX Live 2026 but is operated upstream. For an immutable deployment, serve a frozen matching tree yourself and change the endpoint when upgrading it
- Downloaded files are persisted in browser Cache Storage, keyed by the engine release, endpoint and BusyTeX's format/filename. Full jobs finish saving before live workers start. Both workers restore the cache; unavailable/full storage degrades to online loading. Failed lookups are not persisted. Clearing site data removes the cache
- Switching from recommended to basic keeps the same engine and remote-file cache namespace, so existing downloaded packages remain reusable. First use of an uncached package still needs the service; cached compilation does not by itself make the website available offline
- Update the engine and data as a matching pair. Clear old static caches when changing the pinned engine release
- Full compilation, including package downloads, has a 120-second timeout; cancel terminates workers. TeX documents run inside the browser's WASM virtual filesystem, not the host filesystem

This delivery does not create or change any GitHub repository, production deployment, or third-party site.

## Standalone engine

`npm run build:engine` creates `dist-engine/`, independently of the UI build. Deploy that complete directory under any same-origin prefix and import its `index.js`; resources resolve beside the module. The same isolation headers apply. This package contains no editor or PDF renderer. See `engine/README.md` for the API, relocation test and binary size/build limitations.
