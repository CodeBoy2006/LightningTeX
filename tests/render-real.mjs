import fs from 'node:fs/promises';import {createCanvas} from '@napi-rs/canvas';import {createDisplayListRenderer,decodeDisplayList} from '../render/index.mjs';
const source=JSON.parse(await fs.readFile(new URL('../qa/baseline.json',import.meta.url),'utf8'));
const renderer=createDisplayListRenderer({resolveFont:async name=>new Uint8Array(source.fonts[name])});
const canvas=createCanvas(1,1);const result=await renderer.render(canvas,source.pages[0],{zoom:1.2,devicePixelRatio:1,padding:10});
await fs.writeFile(new URL('../qa/real-page-outline.png',import.meta.url),canvas.toBuffer('image/png'));
console.log(result);
