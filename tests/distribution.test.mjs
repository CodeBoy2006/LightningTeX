import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {packageNotices} from '../scripts/package-notices.mjs';
import {unzip} from '../core/zip.js';

test('distributions contain license copies and matching local source, not private files or binary outputs',async()=>{
  const output=await fs.mkdtemp(path.join(tmpdir(),'lightningtex-notices-'));
  try{
    await packageNotices(output);
    for(const name of ['LICENSE','THIRD-PARTY-NOTICES.md','SOURCES.md',...(await fs.readdir(new URL('../licenses/',import.meta.url))).map(name=>'licenses/'+name)]){
      assert.deepEqual(await fs.readFile(path.join(output,name)),await fs.readFile(new URL('../'+name,import.meta.url)),name);
    }
    const source=new Map((await unzip(new Uint8Array(await fs.readFile(path.join(output,'source.zip'))))).map(file=>[file.path,file.data]));
    for(const name of ['main.js','core/zip.js','ui/editor.js','ui/pdf-find.js','engine/build/luahbtex.c','engine/build/luahbtex.mk','engine/tex/rtex-serve.lua','public/runtime/raw-loader.js','package-lock.json','scripts/package-notices.mjs']){
      assert.deepEqual(Buffer.from(source.get(name)),await fs.readFile(new URL('../'+name,import.meta.url)),name);
    }
    assert.ok(![...source.keys()].some(name=>/^(?:\.git\/|\.env|statusquo\.md|media\/|docs\/media\/)|\.gz\.part\d+$/.test(name)));
  }finally{await fs.rm(output,{recursive:true,force:true});}
});
