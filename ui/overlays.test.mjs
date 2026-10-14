import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {openMenu} from './overlays.js';

test('menus use the bottom of a DOMRect anchor and flip within the host',()=>{
  const dom=new JSDOM('<div id="host"></div>'),previous=globalThis.document;
  globalThis.document=dom.window.document;
  try{
    const host=document.querySelector('#host');host.getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
    openMenu(host,{x:100,y:10,left:100,top:10,bottom:38},[{label:'Action'}]);
    assert.equal(host.querySelector('[role="menu"]').style.top,'42px');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    openMenu(host,{x:50,y:598},[{label:'Action'}]);
    assert.equal(host.querySelector('[role="menu"]').style.top,'594px');
    document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  }finally{globalThis.document=previous;dom.window.close();}
});
