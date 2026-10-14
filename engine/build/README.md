# Source-built LuaHBTeX

The shipped executable is built from TeX Live source, using the pinned TeXlyre build rules for Web2C and its libraries. `luahbtex.mk` replaces the multicall link with a direct LuaHBTeX entry and embeds `engine/tex` at `/rtex`. It links HarfBuzz/Graphite, Lua, Kpathsea, PDF/font/image support and their required libraries. Other engine applets and their dependencies never enter this link. No binary string editing or post-link export renaming is used.

The web application and standalone package use the same generated files in `public/luahbtex`. `npm run build:engine` packages those files; it does not compile C. Changing `engine/tex`, the C entry or the JS lookup hook requires rebuilding the WASM.

## Pinned inputs

| Input | Version / SHA-256 |
| --- | --- |
| [TeXlyre build rules](https://github.com/TeXlyre/texlyre-busytex-build/tree/f544a51a99e7d3978bb70608e927a9a23f96d4a7) | `f544a51a99e7d3978bb70608e927a9a23f96d4a7` |
| [TeX Live release source](https://mirrors.tuna.tsinghua.edu.cn/CTAN/systems/texlive/Source/texlive-20260301-source.tar.xz) | `32ea827edd3fb80a682ffbdf95d7ba6139ff074516e660c8923260fc82f5e0f0` |
| [Emscripten 5.0.4 Linux ARM64 SDK](https://storage.googleapis.com/webassembly/emscripten-releases-builds/linux/54d45123d7ad4aa96ce57e74a1f3f9d1c54e6402/wasm-binaries-arm64.tar.xz) | `0c632bf6a185906036edea8b39bc4658193674a27221c0f07d8c9b10ce5b3b9c` |
| Original decoded `texlive-basic.data`, assets-v1.4.0 | `ccb35d98d77cbaf988e1481f8538709f72166196785cf6b8785eabe6c8fb2993` |

The tested build used Ubuntu 24.04 ARM64, Clang 18, GNU Make, gperf, Perl, Python 3 and Node. The SDK's `emcc --version` reported 5.0.4-git (`62e22652509fbe7a00609ce48a653d0d66f27ba5`). Download and check these inputs before running the recipe. Keep a dedicated SDK: the LZ4 change below must apply to both compiler and packager.

## Compile

Use a Linux build directory mounted at `/work` and this source checkout at `/project` (read-only is sufficient until installation). Install the native tools listed above. In `/work`, clone the pinned build repository and extract the SDK tarball under `sdk/`, producing `sdk/install/{bin,emscripten,lib}`. Place the two input archives at `/work/texlive-20260301-source.tar.xz` and `/work/emscripten-5.0.4-linux-arm64.tar.xz` for provenance recording. Run:

```sh
cd /work
mkdir -p source/texlive
tar -xf texlive-20260301-source.tar.xz -C source/texlive --strip-components=1
# The upstream patch target only changes XeTeX; it is not needed here.
touch source/texlive.txt source/texlive.patched
cat > emscripten-config.py <<'EOF'
LLVM_ROOT = '/work/sdk/install/bin'
BINARYEN_ROOT = '/work/sdk/install'
NODE_JS = '/usr/bin/node'
EOF
export PATH=/work/sdk/install/emscripten:/work/sdk/install/bin:$PATH
export EM_CONFIG=/work/emscripten-config.py
```

In `sdk/install/emscripten/third_party/mini-lz4.js`, change the single `CHUNK_SIZE` constant from `2048` to `16384` before compiling or packing. Do not change just the data package: the WASM runtime must use the same chunk size. This retains the existing LZ4 codec and improves compression without a new runtime dependency.

Build native source generators, then the selected WASM objects:

```sh
make -j8 CC=clang CXX=clang++ LDFLAGS_TEXLIVE_native= build/native/texlive.configured
make -j8 -C build/native/texlive/texk/kpathsea
make -j8 -C build/native/texlive/texk/web2c tangleboot ctangle otangle tangle tie
make -j8 -C build/native/texlive/texk/web2c/web2c fixwrites makecpool splitup web2c
make -j8 CC_native=clang CXX_native=clang++ \
  -f Makefile -f /project/engine/build/luahbtex.mk luahbtex-wasm
```

Do not pass global `CC=clang` to the WASM make: it leaks into recursive library builds. The final linker treats undefined symbols as errors. Outputs are `build/wasm/luahbtex.{js,wasm,map}`. The map is build evidence, not a runtime asset. Archive it with the build logs when producing a release.

## Trim and package resources

The format and resources come from the pinned assets-v1.4.0 data snapshot, not from the host's TeX installation. The existing LuaHBLaTeX 1.24.0 format is reused, not regenerated. To recover the exact original packed snapshot and its build-only reader from this repository, run on the host:

```sh
mkdir /tmp/lightningtex-resource-input
git archive 17b307c public | tar -x -C /tmp/lightningtex-resource-input
node engine/build/extract-data.cjs /tmp/lightningtex-resource-input/public /path/to/work/data
```

The extractor verifies the decoded source hash and exact file inventory, then copies `/texlive` and `/etc` without running a TeX job. It deliberately excludes the old `/bin/busytex` placeholder. New outputs must not already exist. Inside the Linux build environment:

```sh
node /project/engine/build/prune-data.mjs /work/data /work/data-luahbtex-final
mkdir -p /work/candidate
python3 /work/sdk/install/emscripten/tools/file_packager.py \
  /work/candidate/texlive-luahbtex.data \
  --js-output=/work/candidate/texlive-luahbtex.js \
  --export-name=TeXData --lz4 \
  --preload /work/data-luahbtex-final/texlive@/texlive \
  --preload /work/data-luahbtex-final/etc@/etc
cp build/wasm/luahbtex.js build/wasm/luahbtex.wasm candidate/
node /project/scripts/pack-assets.mjs /work/candidate
node /project/engine/build/record-build.mjs /work /work/candidate
```

The filter removes other formats, engine-specific macros, ICU/fontconfig, unused tool resources, Metafont sources, logs and optional AFM metrics; it rebuilds every retained `ls-R`. It retains shared `pdftex.map` despite its name, plus OTF/TFM/PFB fonts, LuaTeX packages and generic initialization files. AFM-only workflows may now need remote files. The recorded inventory is 5,597 retained files / 96,831,353 bytes and 1,587 removed files / 60,013,094 bytes. LZ4 plus gzip further reduces transfer size.

Copy only `luahbtex.js`, `texlive-luahbtex.js`, `*.gz.part*`, `asset-manifest.json`, `build-info.json` and `versions.txt` from `candidate` into `public/luahbtex`; retain its `LICENSE` and `RTEX-LICENSE`. Do not ship raw `.wasm`/`.data`, maps, build caches or the original engines. Remove stale old chunk files when replacing an existing release. Preserve the companion source and third-party notices.

## Verify

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

The binary test starts the real WASM, checks embedded source hashes and the retained filesystem without downloaded fixtures, and confirms the paired LZ4 size. The relocated package test checks full/incremental output and recovery. The benchmark compares exact font/glyph/rule/coordinate signatures for OpenType, Type 1 with microtype, a six-page document and 30 alternating live requests per round. Timing covers WASM and IPC only; browser rendering and input scheduling need separate checks. Do not infer universal package compatibility, memory reduction or a latency guarantee from these fixtures.
