# Building LuaHBTeX WebAssembly from Source

This directory contains the direct C entry point (`luahbtex.c`), Emscripten remote Kpathsea lookup library (`kpse-remote.js`), Makefile rules (`luahbtex.mk`), and TeX Live resource pruning scripts used to build the `public/luahbtex/` runtime assets.

The build replaces the multi-engine Web2C binary with a dedicated **LuaHBTeX 1.24.0** executable, links only required libraries (LuaHBTeX, HarfBuzz/Graphite, Lua, Kpathsea, and PDF/font/image support), and embeds `engine/tex` directly at `/rtex` in the WASM filesystem.

---

## Pinned Inputs

| Input | Version / SHA-256 |
| :--- | :--- |
| [TeXlyre Web2C build rules](https://github.com/TeXlyre/texlyre-busytex-build/tree/f544a51a99e7d3978bb70608e927a9a23f96d4a7) | `f544a51a99e7d3978bb70608e927a9a23f96d4a7` |
| [TeX Live 2026 release source](https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/Source/texlive-20260301-source.tar.xz) | `32ea827edd3fb80a682ffbdf95d7ba6139ff074516e660c8923260fc82f5e0f0` |
| [Emscripten 5.0.4 Linux ARM64 SDK](https://storage.googleapis.com/webassembly/emscripten-releases-builds/linux/54d45123d7ad4aa96ce57e74a1f3f9d1c54e6402/wasm-binaries-arm64.tar.xz) | `0c632bf6a185906036edea8b39bc4658193674a27221c0f07d8c9b10ce5b3b9c` |
| Baseline `texlive-basic.data` (`assets-v1.4.0`) | `ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993` |

### Host Prerequisites

- Linux (tested on Ubuntu 24.04 ARM64)
- Clang 18, GNU Make, `gperf`, Perl, Python 3, and Node.js 22.12+
- Emscripten 5.0.4 (`62e22652509fbe7a00609ce48a653d0d66f27ba5`)

---

## 1. Prepare the Build Environment

Mount a working directory at `/work` and this repository checkout at `/project`. Clone the pinned `texlyre-busytex-build` repository into `/work`, extract the Emscripten SDK under `/work/sdk/install/{bin,emscripten,lib}`, and place `texlive-20260301-source.tar.xz` and `emscripten-5.0.4-linux-arm64.tar.xz` in `/work`:

```sh
cd /work
mkdir -p source/texlive
tar -xf texlive-20260301-source.tar.xz -C source/texlive --strip-components=1
touch source/texlive.txt source/texlive.patched

cat > emscripten-config.py <<'EOF'
LLVM_ROOT = '/work/sdk/install/bin'
BINARYEN_ROOT = '/work/sdk/install'
NODE_JS = '/usr/bin/node'
EOF

export PATH=/work/sdk/install/emscripten:/work/sdk/install/bin:$PATH
export EM_CONFIG=/work/emscripten-config.py
```

### Configure 16 KiB LZ4 Chunks

In `/work/sdk/install/emscripten/third_party/mini-lz4.js`, update `CHUNK_SIZE` from `2048` to `16384` before compiling or packaging. Both the compiled WASM runtime and `file_packager.py` read this constant, improving compression ratio while keeping the built-in synchronous LZ4 VFS codec.

---

## 2. Compile `luahbtex.wasm`

Build the native Web2C code generators first, then compile and link the WASM target:

```sh
make -j8 CC=clang CXX=clang++ LDFLAGS_TEXLIVE_native= build/native/texlive.configured
make -j8 -C build/native/texlive/texk/kpathsea
make -j8 -C build/native/texlive/texk/web2c tangleboot ctangle otangle tangle tie
make -j8 -C build/native/texlive/texk/web2c/web2c fixwrites makecpool splitup web2c
make -j8 CC_native=clang CXX_native=clang++ \
  -f Makefile -f /project/engine/build/luahbtex.mk luahbtex-wasm
```

This produces `build/wasm/luahbtex.{js,wasm,map}`.

---

## 3. Prune & Package TeX Live Resources

Extract the baseline `texlive-basic.data` tree on the host:

```sh
mkdir /tmp/lightningtex-resource-input
git archive 17b307c public | tar -x -C /tmp/lightningtex-resource-input
node engine/build/extract-data.cjs /tmp/lightningtex-resource-input/public /path/to/work/data
```

Inside the Linux build environment, run `prune-data.mjs` to strip non-LuaHBTeX formats, ICU/fontconfig tables, unused CLI tool resources, Metafont sources, logs, and optional AFM files (retaining **5,597 files / 96.8 MiB** and removing **1,587 files / 60.0 MiB**), rebuild `ls-R` databases, and pack the LZ4 + gzip chunks:

```sh
node /project/engine/build/prune-data.mjs /work/data /work/data-luahbtex-final
mkdir -p /work/candidate
python3 /work/sdk/install/emscripten/tools/file_packager.py \
  /work/candidate/texlive-luahbtex.data \
  --js-output=/work/candidate/texlive-luahbtex.js \
  --export-name=TeXData --lz4 \
  --preload /work/data-luahbtex-final/texlive@/texlive \
  --preload /work/data-luahbtex-final/etc@/etc

cp build/wasm/luahbtex.js build/wasm/luahbtex.wasm /work/candidate/
node /project/scripts/pack-assets.mjs /work/candidate
node /project/engine/build/record-build.mjs /work /work/candidate
```

Copy `luahbtex.js`, `texlive-luahbtex.js`, `*.gz.part*`, `asset-manifest.json`, `build-info.json`, and `versions.txt` from `/work/candidate` into `public/luahbtex/` alongside `LICENSE` and `RTEX-LICENSE`.

---

## 4. Verification

```sh
npm test
npm run test:runtime
npm run test:incremental
npm run test:reflow
npm run test:sequence
npm run test:project
npm run test:engine
npm run build
node tests/engine-benchmark.mjs /tmp/luahbtex-result.json qa/luahbtex-before.json
```
