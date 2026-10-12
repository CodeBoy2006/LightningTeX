# Source reuse and licensing

This is a JavaScript browser host port around existing engines, not a newly implemented TeX typesetter.

## realtime-tex
MIT. Upstream https://github.com/HenryXiaoYang/realtime-tex , commit 1f681835cfcbeeabcca340b7784316a0ef186d81. Original license retained at public/rtex/LICENSE (or dist/rtex/LICENSE in the runtime package). Original Lua/TeX support files are retained without modifications. The browser context helper derives from capture.rs/layout.rs semantics; the decoder follows the upstream binary encoder.

## TeXlyre BusyTeX
Official binary asset archive https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz . Wrapper source https://github.com/TeXlyre/texlyre-busytex/tree/v1.4.0 and corresponding engine build project https://github.com/TeXlyre/texlyre-busytex-build . This archive's versions.txt records TeX Live 2026 and Emscripten 5.0.4. Preserve public/busytex/LICENSE and versions.txt. Build/source materials are upstream; this application does not claim to have rebuilt the compiler. The runtime package retains the AGPL text and this source pointer; distribute the companion source package with the runtime.

Only the original `texlive-basic` data and loader are shipped. The decoded data SHA-256 is `ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993`. Additional TeX files are fetched on demand; the recommended collection is not bundled.

The data loader has an explicit getPreloadedPackage hook in texlive-basic.js. scripts/pack-assets.mjs reproduces it while gzip-chunking the unchanged original WASM and data. The BusyTeX JavaScript also records 404 misses for reuse within a session. No LuaTeX engine binary was patched. The application enables the existing remote file lookup against the upstream TeX Live 2026 service and adds browser-side persistence.

TeX Live packages and fonts have individual licenses (including LPPL, GPL and font-specific licenses); the enclosing application license does not replace them. Refer to the original TeX Live distribution and its contained metadata for each package.

`tests/fixtures/tex-packages.json.gz` contains unmodified microtype and booktabs files from that TeX Live 2026 service for offline regression tests. Their embedded copyright/license headers are retained; this fixture is not included in the browser build. See `tests/fixtures/README.md` for provenance and format.

## Browser libraries
Exact package versions are pinned in package-lock.json:
- PDF.js / pdfjs-dist 6.4.299: Apache-2.0, https://github.com/mozilla/pdf.js
- OpenType.js 2.0.0: MIT, https://github.com/opentypejs/opentype.js
- Vite: MIT (build tool)
- jsdom: MIT (DOM tests only)
- @napi-rs/canvas: MIT (Node verification only, not shipped browser code)

Copies of shipped JavaScript library licenses are in licenses/. The application's source and modification details are provided in the source package. No proprietary font or paid TeX package was added.
