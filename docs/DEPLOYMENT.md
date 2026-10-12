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
- Keep assets same-origin. No CDN or external API is needed at runtime
- Update the engine and data as a matching pair. Clear old static caches when changing the pinned engine release
- Package compilation has timeouts; cancel terminates workers. TeX documents run inside the browser's WASM virtual filesystem, not the host filesystem

This delivery does not create or change any GitHub repository, production deployment, or third-party site.
