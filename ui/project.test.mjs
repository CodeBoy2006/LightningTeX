import test from 'node:test';import assert from 'node:assert/strict';
import {createProject,normalizePath,canBeMain,decodeText,fileBytes} from './project.js';
import {tokenizeLine} from './highlight.js';
import {sanitizeSettings,DEFAULT_SETTINGS} from './settings.js';

test('paths are normalized and unsafe ones refused',()=>{
  assert.equal(normalizePath(' ./chapters\\one.tex '),'chapters/one.tex');assert.equal(normalizePath('dir/'),'dir');
  for(const path of ['','/abs','a/../b','..','a//b','a/ b.tex','C:x','a\u0000b','x'.repeat(130)])assert.throws(()=>normalizePath(path),path);
  assert.ok(canBeMain('thesis.tex'));for(const path of ['sub/main.tex','my paper.tex','100%.tex','notes.txt','a{b}.tex'])assert.ok(!canBeMain(path),path);
});
test('the main file is chosen, follows a rename, and is replaced when deleted',()=>{
  const project=createProject(),events=[];project.on(change=>events.push(change.type));
  project.write('notes.tex','just notes');assert.equal(project.main,'notes.tex');
  project.load({files:[{path:'b.tex',text:'plain'},{path:'a.tex',text:'\\documentclass{article}'},{path:'sub/c.tex',text:'\\documentclass{book}'},{path:'../evil',text:'x'}]});
  assert.equal(project.main,'a.tex','prefers a top-level file with \\documentclass');assert.deepEqual(project.paths(),['a.tex','b.tex','sub/c.tex']);
  project.rename('a.tex','paper.tex');assert.equal(project.main,'paper.tex');
  project.setMain('sub/c.tex');assert.equal(project.main,'paper.tex','only top-level files can be main');
  const restore=project.remove('paper.tex');assert.equal(project.main,'b.tex');restore();assert.equal(project.main,'paper.tex');assert.equal(project.get('paper.tex').text,'\\documentclass{article}');
  assert.deepEqual(events,['create','load','rename','remove','create']);
});
test('folders can be empty, renamed with their contents, and removed as a whole',()=>{
  const project=createProject();project.write('main.tex','');project.mkdir('figures');project.write('chapters/one.tex','1');project.write('chapters/deep/two.tex','2');
  assert.deepEqual(project.folders(),['chapters','chapters/deep','figures']);
  project.rename('chapters','parts');assert.deepEqual(project.paths(),['main.tex','parts/deep/two.tex','parts/one.tex']);assert.ok(project.isFolder('parts/deep'));
  assert.throws(()=>project.rename('parts','parts/inner'),/Unsafe/);assert.throws(()=>project.rename('main.tex','parts'),/exists/);assert.throws(()=>project.write('figures','x'),/exists/);assert.throws(()=>project.mkdir('main.tex'),/exists/);
  const restore=project.remove('parts');assert.deepEqual(project.paths(),['main.tex']);restore();assert.equal(project.get('parts/deep/two.tex').text,'2');
  assert.equal(project.unique('parts','one.tex'),'parts/one-2.tex');assert.equal(project.unique('','figures'),'figures-2');assert.equal(project.unique('','new.tex'),'new.tex');
});
test('every write gets a new revision; text and bytes are told apart',()=>{
  const project=createProject();project.write('a.tex','x');const first=project.get('a.tex').rev;project.write('a.tex','y');assert.ok(project.get('a.tex').rev>first);
  assert.equal(decodeText(new TextEncoder().encode('héllo 中文')),'héllo 中文');assert.equal(decodeText(new Uint8Array([137,80,78,71,0])),null);assert.equal(decodeText(new Uint8Array([0xff,0xfe])),null);
  project.write('f.png',new Uint8Array([1,2]));assert.deepEqual([...fileBytes(project.get('f.png'))],[1,2]);assert.deepEqual([...fileBytes(project.get('a.tex'))],[121]);
});

const classes=(text,state)=>{const result=tokenizeLine(text,state);return [result.tokens.map(([name,part])=>name?`${name}:${part}`:part),result.state];};
test('tokens rebuild the line exactly and classify commands, math and comments',()=>{
  for(const line of ['\\section{Intro} text $a+b$ % note','  \\begin{align} x &= 1 \\\\','\\[ \\frac{1}{2} \\] after','plain','','100\\% sure $','\\'])
    assert.equal(tokenizeLine(line).tokens.map(token=>token[1]).join(''),line,line);
  assert.deepEqual(classes('\\emph{x} $a_\\alpha$ % c'),[['cmd:\\emph','br:{','x','br:}',' ','mdel:$','math:a_','mcmd:\\alpha','mdel:$',' ','com:% c'],'']);
  assert.deepEqual(classes('\\section{A}'),[['sec:\\section','br:{','A','br:}'],'']);
  assert.deepEqual(classes('cost 100\\% off')[0],['cost 100','cmd:\\%',' off']);
});
test('math and verbatim state carries across lines and ends where it should',()=>{
  assert.equal(classes('\\begin{align}')[1],'e:align');assert.deepEqual(classes('a &= b','e:align'),[['math:a ','op:&','math:= b'],'e:align']);
  assert.equal(classes('\\end{align} done','e:align')[1],'');assert.equal(classes('\\end{aligned}','e:align')[1],'e:align');
  assert.equal(classes('\\[ x')[1],'[');assert.equal(classes('y \\]','[')[1],'');
  assert.equal(classes('open $x')[1],'$');assert.equal(classes('','$')[1],'','a blank line ends inline math');assert.equal(classes('','[')[1],'[');
  assert.deepEqual(classes('\\begin{verbatim} $x'),[['kw:\\begin','br:{','env:verbatim','br:}','verb: $x'],'v:verbatim']);
  assert.deepEqual(classes('\\frac $ %','v:verbatim'),[['verb:\\frac $ %'],'v:verbatim']);
  assert.equal(classes('\\end{verbatim} $y$','v:verbatim')[1],'');
});
test('stored settings are sanitized field by field',()=>{
  assert.deepEqual(sanitizeSettings(null),{...DEFAULT_SETTINGS});assert.deepEqual(sanitizeSettings('nonsense'),{...DEFAULT_SETTINGS});
  const settings=sanitizeSettings({theme:'dark',accent:'<x>',fontSize:'14',tabSize:4,split:9,zoom:'huge',wrap:false,persist:0,extra:true});
  assert.equal(settings.theme,'dark');assert.equal(settings.accent,'bolt');assert.equal(settings.fontSize,13);assert.equal(settings.tabSize,4);assert.equal(settings.split,0.8);assert.equal(settings.zoom,'fit');assert.equal(settings.wrap,false);assert.equal(settings.persist,true);assert.ok(!('extra' in settings));
});
