import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {explainReason,REASON_CODES} from '../core/live-reasons.js';
import {createI18n} from '../ui/i18n.js';

// Every reason the engine and host can produce, collected from the sources so a new one cannot slip through unmapped.
const sources=await Promise.all(['core/document.js','core/capture.js','core/live-layout.js','main.js'].map(file=>fs.readFile(new URL('../'+file,import.meta.url),'utf8')));
const literals=sources.flatMap(text=>[...text.matchAll(/(?:reason:|fail\(|Error\()'([^'\n]+)'/g)].map(match=>match[1]));

test('every literal fallback reason maps to a phrased code',()=>{
  assert.ok(literals.length>40);
  // Prefixes completed at run time are checked with their arguments below; the rest are not fallback reasons.
  const unmapped=literals.filter(text=>!text.endsWith(': ')&&!/^(?:Capture unit|unchanged$|Unsafe project path$|PDF rendering cancelled$)/.test(text)&&!explainReason(text)?.code);
  assert.deepEqual(unmapped,[]);
});
test('reasons keep their parameters and tone',()=>{
  assert.deepEqual(explainReason('Environment needs full layout: tikzpicture'),{code:'full.environment',tone:'full',values:{name:'tikzpicture'},raw:'Environment needs full layout: tikzpicture'});
  assert.equal(explainReason('Command needs full layout: norm').values.name,'\\norm');
  assert.equal(explainReason('Waiting for an argument').tone,'wait');
  assert.equal(explainReason('Baseline verification: Row 2 box or glue differs').code,'check.layout');
  assert.equal(explainReason('Missing live font: lmroman10-regular.otf').code,'check.layout');
  assert.equal(explainReason('Something new').code,null);assert.equal(explainReason('Something new').raw,'Something new');
  assert.equal(explainReason(''),null);
});
test('both languages phrase every reason code and tone',()=>{
  for(const lang of ['en','zh']){
    const {t}=createI18n(lang);
    for(const code of REASON_CODES)assert.notEqual(t('reason.'+code),'reason.'+code,lang+' '+code);
    for(const tone of ['wait','full','rebuild','check','off'])assert.notEqual(t('reason.why.'+tone),'reason.why.'+tone);
  }
  assert.match(createI18n('zh').t('reason.full.environment',{name:'tikzpicture'}),/环境 tikzpicture 需要完整排版/);
});
