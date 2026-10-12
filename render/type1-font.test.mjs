import test from 'node:test';
import assert from 'node:assert/strict';
import {type1FontPdf} from './type1-font.mjs';
test('Type 1 carrier rejects unsafe names and malformed PFB framing',()=>{
 assert.throws(()=>type1FontPdf(new Uint8Array(),'bad/name'),/PostScript name/);
 assert.throws(()=>type1FontPdf(new Uint8Array(),'LMRoman10-Regular','A B'),/encoding/);
 assert.throws(()=>type1FontPdf(new Uint8Array(),'LMRoman10-Regular',Array(256).fill('A /bad').join(' ')),/encoding/);
 for(const bytes of [[],[0],[128,1],[128,1,100,0,0,0],[128,3]])assert.throws(()=>type1FontPdf(new Uint8Array(bytes),'CMR10'),/PFB/);
});
