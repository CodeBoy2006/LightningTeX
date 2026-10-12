import http from 'node:http';
import {createReadStream,statSync,existsSync} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
const root=resolve(process.argv[2]||'dist');
const port=Number(process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.pdf':'application/pdf','.data':'application/octet-stream','.otf':'font/otf','.ttf':'font/ttf'};
http.createServer((req,res)=>{
  res.setHeader('Cross-Origin-Opener-Policy','same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy','require-corp');
  res.setHeader('Cross-Origin-Resource-Policy','same-origin');
  res.setHeader('X-Content-Type-Options','nosniff');
  let pathname;try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname)}catch{res.writeHead(400).end();return}
  if(pathname==='/')pathname='/ui/index.html';
  const path=resolve(root,'.'+pathname);
  if(path!==root&&!path.startsWith(root+sep)){res.writeHead(403).end();return}
  if(!existsSync(path)||!statSync(path).isFile()){res.writeHead(404).end('Not found');return}
  res.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');
  res.setHeader('Content-Length',statSync(path).size);
  res.setHeader('Cache-Control',/\.(wasm|data)$|\.part\d+$/.test(path)?'public,max-age=86400':'no-cache');
  if(req.method==='HEAD'){res.end();return}createReadStream(path).pipe(res);
}).listen(port,'127.0.0.1',()=>console.log(`Realtime TeX Web: http://127.0.0.1:${port}/`));
