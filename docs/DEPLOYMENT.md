# Deployment & Self-Hosting Guide

LightningTeX runs entirely in the client browser and requires only a static file server—no compilation backend or database is needed.

---

## 1. Local Server

Using **Node.js 22.12+**, start the bundled zero-dependency server:

```sh
node server.mjs
```

- Opens on **http://127.0.0.1:4173** by default.
- Set `PORT=8080 node server.mjs` to listen on a custom port.
- Pass a custom root directory as the first argument (defaults to `dist/`): `node server.mjs dist`.

---

## 2. Production Static Hosting

To host the compiled `dist/` directory behind Nginx, Caddy, Cloudflare Pages, or any static file server:

1. **HTTPS & Routing**: Serve over HTTPS and route `/` to `/ui/index.html`.
2. **Cross-Origin Isolation Headers**: Incremental typesetting relies on `SharedArrayBuffer` to communicate with the persistent LuaHBTeX Worker. Configure the following HTTP response headers:

```http
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Resource-Policy: same-origin
X-Content-Type-Options: nosniff
```

*(A ready-to-use `public/_headers` file is included and copied into `dist/_headers` during build.)*

3. **MIME Types & Binary Chunk Serving**:
   - Serve `.js` and `.mjs` with `text/javascript`.
   - Serve `.wasm` with `application/wasm`.
   - Serve `.partNNN` chunks (`luahbtex.wasm.gz.part000`, `texlive-luahbtex.data.gz.part000`…`part002`) as raw `application/octet-stream` **without** automatic server-side gzip decompression. Each chunk is capped at $\le 16\text{ MiB}$, verified against `asset-manifest.json`, and decompressed inside the Worker using `DecompressionStream`.

4. **Licenses & Source**: Deploy the complete build, including `LICENSE`, `THIRD-PARTY-NOTICES.md`, `SOURCES.md`, `licenses/`, and `source.zip`. The source archive is generated from the build checkout; keep it available at `/source.zip` beside the application. See [source and redistribution instructions](../SOURCES.md).

### Deploy to Vercel

From the repository root:

```sh
npm install --global vercel
vercel login
vercel --prod
```

Choose your Vercel account and create or link the `lightningtex` project. Later deployments use the same `vercel --prod` command.

The root `vercel.json` runs `npm run build`, publishes `dist/`, routes `/` to `/ui/index.html`, and applies the cross-origin isolation headers to pages and Worker scripts. Vercel does not use `public/_headers`. `.vercelignore` uploads only the build inputs, excluding local logs, test outputs, and demo media; `.vercel/` stores the local project link and stays out of Git. No backend or environment variables are required.

After deployment, open the production URL and check that a document compiles and an edit updates the preview. In the browser console, `crossOriginIsolated` must be `true` for live typesetting.

---

## 3. On-Demand TeX Live Package Service & Caching

LightningTeX preloads a pruned TeX Live 2026 basic dataset (~40.6 MiB compressed; ~42.4 MiB including WASM). When a document loads additional packages, classes, fonts, or `.bst` bibliography styles:

- **Remote Lookup Protocol**: The engine's Kpathsea hook queries `GET <endpoint>/<format_id>/<filename>` (defaulting to `https://texlive2026.texlyre.org`). Only the requested filename and Kpathsea format ID are sent; document contents never leave the browser.
- **Browser Cache Storage**: After each full job, the background Worker persists its downloaded files under `lightningtex-texlive-2026-assets-v1.4.0:<endpoint>`. Both Workers restore these files when starting. Files fetched only by the live Worker remain in its in-memory filesystem.
- **Self-Hosted Package Mirror**: To host your own immutable TeX Live 2026 file server, deploy [`texlyre-busytex-build/texlive-server`](https://github.com/TeXlyre/texlyre-busytex-build) against a matching TeX Live 2026 tree with CORS enabled, and pass its URL to `createEngine({ endpoint: 'https://your-texlive-mirror.example.com' })`.
- **Offline-Only Mode**: Pass `endpoint: ''` to `createEngine()` to disable all network package lookups.

---

## 4. Deploying the Standalone Engine (`@lightningtex/engine`)

Run `npm run build:engine` to produce `dist-engine/`. Deploy the complete `dist-engine/` directory under any same-origin path with the Cross-Origin Isolation headers above and import `index.js`:

```js
import { createEngine } from '/path/to/dist-engine/index.js';
```

All Worker scripts and WASM/data chunks resolve relative to `index.js` (or via an explicit `base` URL passed to `createEngine({ base })`). See [`engine/README.md`](../engine/README.md) for API details.
