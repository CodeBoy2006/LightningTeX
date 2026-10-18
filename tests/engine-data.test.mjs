import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {exclusion} from '../engine/build/prune-data.mjs';

test('resource pruning removes other engines but retains LuaHBTeX formats and shared TeX fonts/maps',()=>{
  for(const file of ['texlive/icudt78l.dat','etc/fonts/fonts.conf','texlive/texmf-dist/texmf-var/web2c/xetex/xelatex.fmt','texlive/texmf-dist/tex/xelatex/xunicode/xunicode.sty','texlive/texmf-dist/fonts/source/public/cm/cmr10.mf'])assert.ok(exclusion(file),file);
  for(const file of ['texlive/texmf-dist/texmf-var/web2c/luahbtex/luahblatex.fmt','texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map','texlive/texmf-dist/fonts/type1/public/amsfonts/cm/cmr10.pfb','texlive/texmf-dist/fonts/tfm/public/cm/cmr10.tfm','texlive/texmf-dist/tex/latex/fontspec/fontspec-luatex.sty','texlive/texmf-dist/tex/luatex/luaotfload/luaotfload-main.lua'])assert.equal(exclusion(file),null,file);
});

test('resource extraction rejects the wrong snapshot before loading code or writing output',async()=>{
  const input=await fs.mkdtemp(path.join(tmpdir(),'lightningtex-resources-')),output=path.join(input,'output');
  try{
    await fs.writeFile(path.join(input,'texlive-basic.data'),'not the pinned release');
    assert.throws(()=>execFileSync(process.execPath,[fileURLToPath(new URL('../engine/build/extract-data.cjs',import.meta.url)),input,output],{stdio:'pipe'}),error=>/Unexpected resource snapshot/.test(error.stderr.toString()));
    await assert.rejects(fs.stat(output),{code:'ENOENT'});
  }finally{await fs.rm(input,{recursive:true,force:true});}
});
