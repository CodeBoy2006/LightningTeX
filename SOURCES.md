# Source and licenses for this distribution

LightningTeX is licensed under [AGPL-3.0-or-later](LICENSE). Third-party components keep their own licenses; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) and [TeX resource notices](licenses/TEX-LIVE.md).

## Get the matching LightningTeX source

Both the web build and standalone engine package include `source.zip` beside this file. Download it from the same directory as this document. It contains the application, runtime, tests, build scripts, local engine modifications, embedded Lua/TeX service, dependency lockfile, and license notices from the checkout used to build the distribution. It does not depend on a GitHub commit having been pushed.

The development repository is <https://github.com/CodeBoy2006/LightningTeX>. For the exact local code of a distributed build, use its accompanying `source.zip`, not a later repository revision.

## Rebuild the browser application or engine package

1. Extract `source.zip` into a fresh directory.
2. Copy the distribution's `luahbtex/` directory into `public/luahbtex/` in that directory to reuse its engine binaries, or rebuild them from the pinned upstream inputs using `engine/build/README.md`.
3. Use Node.js **22.22.2+ within 22.x**, **24.15.0+ within 24.x**, or **26+**. Run `npm ci`, then `npm run build` for the web application or `npm run build:engine` for the standalone engine.

The archive omits generated WASM/data chunks, demo media, local credentials, and Git metadata. The upstream C/C++ engine sources and toolchain are obtained separately as described below.

## Upstream source inputs

- **LuaHBTeX 1.24.0 and linked TeX Live libraries:** [TeX Live 2026 release source](https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/Source/texlive-20260301-source.tar.xz).
- **Upstream Emscripten build rules:** [TeXlyre build commit `f544a51a99e7d3978bb70608e927a9a23f96d4a7`](https://github.com/TeXlyre/texlyre-busytex-build/tree/f544a51a99e7d3978bb70608e927a9a23f96d4a7). LightningTeX's replacement entry point, remote-file hook, Makefile rules, pruning scripts and embedded service are included in `source.zip` under `engine/`.
- **Emscripten 5.0.4:** [upstream source](https://github.com/emscripten-core/emscripten/tree/5.0.4). The build recipe records the SDK input and 16 KiB LZ4 configuration.
- **TeX resource input:** [TeXlyre `assets-v1.4.0`](https://github.com/TeXlyre/texlyre-busytex/releases/tag/assets-v1.4.0). For complete macro/font works and their source distributions, follow [licenses/TEX-LIVE.md](licenses/TEX-LIVE.md).
- **JavaScript dependencies:** `package-lock.json` records exact package versions and registry archives. PDF.js and OpenType.js are identified in the third-party notices.

Engine input versions and existing provenance records are in `luahbtex/build-info.json` in a distribution and `public/luahbtex/build-info.json` in the source checkout. The full engine build recipe is `engine/build/README.md` inside the source archive, also supplied as `BUILDING.md` in the standalone package.

## Redistribute a build

Keep `LICENSE`, `THIRD-PARTY-NOTICES.md`, `SOURCES.md`, `licenses/`, and `source.zip` alongside the runtime files. Keep the upstream corresponding sources available as required by their licenses. After modifying code, rebuild the distribution so its source archive matches it. Do not replace the accompanying archive with a link to a different or unpublished revision.
