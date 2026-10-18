# Third-Party Notices & Provenance

## 1. `realtime-tex`

- **License**: MIT (`engine/tex/LICENSE` and `public/luahbtex/RTEX-LICENSE`)
- **Upstream**: <https://github.com/HenryXiaoYang/realtime-tex> (commit `1f681835cfcbeeabcca340b7784316a0ef186d81`)
- **Usage**: The Lua/TeX incremental capture, context replay, persistent paragraph service, and binary display-list modules (`engine/tex/*`) are embedded in the WebAssembly image at `/rtex`. SHA-256 hashes of each embedded file are recorded in `public/luahbtex/build-info.json`. The JavaScript context-replay helpers (`core/capture.js`, `core/live-layout.js`) and binary display-list decoder (`render/display-list.mjs`) implement the upstream capture and `RTDL` v1 wire specifications.

---

## 2. LuaHBTeX & TeX Live 2026 Sources

- **Engine License**: GNU Affero General Public License v3.0 or later (`public/luahbtex/LICENSE`)
- **Build Rules**: Derived from <https://github.com/TeXlyre/texlyre-busytex-build> (commit `f544a51a99e7d3978bb70608e927a9a23f96d4a7`)
- **TeX Live Source**: TeX Live 2026 release source (`texlive-20260301-source.tar.xz`, LuaHBTeX 1.24.0, SHA-256 `32ea827edd3fb80a682ffbdf95d7ba6139ff074516e660c8923260fc82f5e0f0`), compiled with Emscripten 5.0.4.
- **Companion Build Sources**: Located in [`engine/build/`](engine/build/README.md) (`luahbtex.c`, `kpse-remote.js`, `luahbtex.mk`, `extract-data.cjs`, `prune-data.mjs`, `record-build.mjs`). `public/luahbtex/build-info.json` records the source and SDK archive hashes, input data hash, WASM/data/link-map output hashes, and embedded support-file hashes. Compressed-part hashes are in `public/luahbtex/asset-manifest.json`.
- **TeX Live Resource Tree**: Pruned from the `texlyre-busytex` `assets-v1.4.0` baseline snapshot (`texlive-basic.data` decoded SHA-256 `ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993`) and repacked with 16 KiB LZ4 chunks. Individual TeX Live macro packages and fonts retain their respective upstream licenses (LPPL, GPL, SIL OFL, and font-specific licenses).

---

## 3. Browser & Build Libraries

Exact versions are pinned in `package-lock.json`. PDF.js, OpenType.js, and Inter license texts are stored in [`licenses/`](licenses/); Vite and jsdom include their license texts in their installed npm packages.

| Package | Version | License | Upstream |
| :--- | :--- | :--- | :--- |
| `pdfjs-dist` (PDF.js) | `6.4.299` | Apache-2.0 (`licenses/PDFJS.txt`) | <https://github.com/mozilla/pdf.js> |
| `opentype.js` | `2.0.0` | MIT (`licenses/OPENTYPE.txt`) | <https://github.com/opentypejs/opentype.js> |
| `vite` | `8.3.4` | MIT | <https://github.com/vitejs/vite> |
| `jsdom` (dev/test) | `30.1.2` | MIT | <https://github.com/jsdom/jsdom> |

---

## 4. Interface Font

- **Inter Variable (Latin subset)**: `public/fonts/inter-latin-wght-normal.woff2`, taken unmodified from `@fontsource-variable/inter` `5.2.5` by Rasmus Andersson and the Inter project authors.
- **License**: SIL Open Font License 1.1 (`licenses/Inter-OFL-1.1.txt`).

---

## 5. Offline Test Fixtures

- `tests/fixtures/tex-packages.json.gz` and `tests/fixtures/plain.bst` contain unmodified `microtype`, `booktabs`, and `plain.bst` files from TeX Live 2026 for offline Node regression suites. See [`tests/fixtures/README.md`](tests/fixtures/README.md) for details.

---

## 6. GitHub Icon

- **Source**: GitHub's [Octicons `mark-github-16`](https://github.com/primer/octicons/blob/main/icons/mark-github-16.svg), used in `ui/icons.js` for the repository link.
- **License**: MIT, copyright 2026 GitHub Inc. The license is included in [`public/licenses/OCTICONS.txt`](public/licenses/OCTICONS.txt) and copied into the web build.
