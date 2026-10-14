# Use after the pinned upstream Makefile: make -f Makefile -f /project/engine/build/luahbtex.mk luahbtex-wasm
LIGHTNINGTEX ?= /project
CFLAGS_LUAHBTEX := -Dmain=luahbtex_main -D_GNU_SOURCE -DSOCKET_SELECT
LUA_DEPS = texlive/libs/zlib/libz.a texlive/libs/libpng/libpng.a texlive/libs/pplib/libpplib.a \
 texlive/libs/zziplib/libzzip.a texlive/libs/lua53/.libs/libtexlua53.a \
 texlive/libs/graphite2/libgraphite2.a texlive/libs/harfbuzz/libharfbuzz.a texlive/texk/kpathsea/.libs/libkpathsea.a
LUA_SUPPORT = libff.a libluamisc.a libluasocket.a libluaffi.a libmplibcore.a libmputil.a libunilib.a libmd5.a lib/lib.a

.PHONY: luahbtex-wasm
luahbtex-wasm: build/wasm/texlive.configured
	for lib in $(LUA_DEPS); do $(MAKE) build/wasm/$$lib || exit; done
	@if grep -q _texlyre_busytexwasm build/wasm/texlive/texk/web2c/w2c/c-auto.h; then sed -i 's/_texlyre_busytexwasm/_lightningtex_luahbtex/' build/wasm/texlive/texk/web2c/w2c/c-auto.h; fi
	$(MAKE) -f Makefile -f $(LIGHTNINGTEX)/engine/build/luahbtex.mk build/wasm/texlive/texk/web2c/busytex_libluahbtex.a
	$(MAKE_wasm) -C build/wasm/texlive/texk/web2c $(LUA_SUPPORT) $(OPTS_LUAHBTEX_wasm)
	$(CC_wasm) -Oz -c $(LIGHTNINGTEX)/engine/build/luahbtex.c -o build/wasm/luahbtex-main.o
	$(CXX_wasm) -Oz -o build/wasm/luahbtex.js build/wasm/luahbtex-main.o \
	 $(addprefix build/wasm/texlive/texk/web2c/,$(OBJ_LUAHBTEX)) $(addprefix build/wasm/,$(LUA_DEPS)) \
	 -Wl,--wrap=kpse_find_file -Wl,-Map=build/wasm/luahbtex.map \
	 -sINITIAL_MEMORY=67108864 -sMAXIMUM_MEMORY=603979776 -sSTACK_SIZE=5242880 -sALLOW_MEMORY_GROWTH=1 \
	 -sEXIT_RUNTIME=0 -sINVOKE_RUN=0 -sASSERTIONS=0 -sERROR_ON_UNDEFINED_SYMBOLS=1 \
	 -sFORCE_FILESYSTEM=1 -sLZ4=1 -sMODULARIZE=1 -sEXPORT_NAME=luahbtex \
	 -sEXPORTED_FUNCTIONS='["_main","_flush_streams"]' \
	 -sEXPORTED_RUNTIME_METHODS='["callMain","FS","ENV","LZ4","HEAPU8","addRunDependency","removeRunDependency","FS_createPath","FS_createDataFile"]' \
	 --js-library $(LIGHTNINGTEX)/engine/build/kpse-remote.js \
	 --embed-file $(LIGHTNINGTEX)/engine/tex@/rtex
