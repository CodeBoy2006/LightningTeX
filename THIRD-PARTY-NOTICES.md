# Source reuse and licensing

This is a JavaScript browser host port around existing engines, not a newly implemented TeX typesetter.

## realtime-tex
MIT. Upstream https://github.com/HenryXiaoYang/realtime-tex , commit 1f681835cfcbeeabcca340b7784316a0ef186d81. Original license retained at public/rtex/LICENSE (or dist/rtex/LICENSE in the runtime package). Original Lua/TeX support files are retained without modifications. The browser context helper derives from capture.rs/layout.rs semantics; the decoder follows the upstream binary encoder.

## TeXlyre BusyTeX
Official binary asset archive https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz . Wrapper source https://github.com/TeXlyre/texlyre-busytex/tree/v1.4.0 and corresponding engine build project https://github.com/TeXlyre/texlyre-busytex-build . This archive's versions.txt records TeX Live 2026 and Emscripten 5.0.4. Preserve public/busytex/LICENSE and versions.txt. Build/source materials are upstream; this application does not claim to have rebuilt the compiler. The runtime package retains the AGPL text and this source pointer; distribute the companion source package with the runtime.

The recommended data and loader are from the matching build release https://github.com/TeXlyre/texlyre-busytex-build/releases/tag/build_wasm_46ebb6216a5c1fe63dd1dc885831d1a8cef2dc86_31802832436_1 . Its data SHA-256 is `7a912aa15f9e534b1948566771bf2510ca704fab3c3fdece7f75bc6558525a92`; the original loader SHA-256 is `4354ad2040462400ca856e595cec970509c95f8d2ac87fb3e06e0e17ffc9033a`. Recommended includes every file previously shipped in basic, which it replaces.

The only vendor JavaScript modification is an explicit getPreloadedPackage hook in texlive-recommended.js. scripts/pack-assets.mjs reproduces it while gzip-chunking the unchanged original WASM and data. No LuaTeX engine code was patched. The application enables the existing remote file lookup against the upstream TeX Live 2026 service and adds browser-side persistence.

TeX Live packages and fonts have individual licenses (including LPPL, GPL and font-specific licenses); the enclosing application license does not replace them. Refer to the original TeX Live distribution and its contained metadata for each package.

## Browser libraries
Exact package versions are pinned in package-lock.json:
- PDF.js / pdfjs-dist 6.4.299: Apache-2.0, https://github.com/mozilla/pdf.js
- OpenType.js 2.0.0: MIT, https://github.com/opentypejs/opentype.js
- Vite: MIT (build tool)
- jsdom: MIT (DOM tests only)
- @napi-rs/canvas: MIT (Node verification only, not shipped browser code)

Copies of shipped JavaScript library licenses are in licenses/. The application's source and modification details are provided in the source package. No proprietary font or paid TeX package was added.
