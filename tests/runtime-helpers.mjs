import {Worker as NodeWorker} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {TEX_FILES} from '../engine/client.js';

// The real worker harness with the browser callbacks used by the engine clients.
export class BrowserWorker {
  constructor(url){
    this.worker=new NodeWorker(new URL('worker-harness.cjs',import.meta.url),{workerData:{script:fileURLToPath(url)}});
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',error=>this.onerror?.(error));
  }
  postMessage(data){this.worker.postMessage(data);}
  terminate(){void this.worker.terminate();}
}

export async function loadSupportFiles(base){
  const files={};
  for(const name of TEX_FILES)files[name]=await readFile(new URL('rtex/'+name,base),'utf8');
  return files;
}
