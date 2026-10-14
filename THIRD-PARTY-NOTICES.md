# Source reuse and licensing

This is a JavaScript browser host port around existing engines, not a newly implemented TeX typesetter.

## realtime-tex
MIT. Upstream https://github.com/HenryXiaoYang/realtime-tex , commit 1f681835cfcbeeabcca340b7784316a0ef186d81. Original license is retained at engine/tex/LICENSE and public/luahbtex/RTEX-LICENSE (luahbtex/RTEX-LICENSE in the standalone package). The Lua/TeX service, including the browser port's capture, font-encoding and replay changes, is embedded in the WASM at /rtex. Its source is in engine/tex; build-info.json records each embedded file's hash. The browser context helper derives from capture.rs/layout.rs semantics; the decoder follows the upstream binary encoder.

## LuaHBTeX and TeXlyre build/data sources
The executable is now built from TeX Live 2026 release source (LuaHBTeX 1.24.0), with Emscripten 5.0.4. It is no longer the multicall BusyTeX binary. The build reuses https://github.com/TeXlyre/texlyre-busytex-build at f544a51a99e7d3978bb70608e927a9a23f96d4a7. This project's engine/build contains the direct C entry point, derived remote-file lookup, selected library link, resource pruning and build recipe. The AGPL text is retained at public/luahbtex/LICENSE. Source/toolchain hashes, final binary/data hashes and embedded file hashes are in public/luahbtex/build-info.json. Distribute the companion source, this recipe and these source pointers with the runtime.

The original resource input is the official https://github.com/TeXlyre/texlyre-busytex/releases/download/assets-v1.4.0/busytex-assets.tar.gz data snapshot, decoded texlive-basic.data SHA-256 ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993. The retained LuaHBLaTeX format is from that matching 1.24.0 snapshot. Other engine formats/resources, ICU/fontconfig data, unused tools, Metafont sources, logs and optional AFM metrics were removed; filename databases were regenerated. The remaining tree was repacked with the same Emscripten version, changing LZ4 chunks from 2 KiB to 16 KiB in both runtime and packager. The standard generated data loader uses getPreloadedPackage; no custom vendor-loader patch is needed. Additional files are fetched on demand. The recommended collection and Biber are not bundled.

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
