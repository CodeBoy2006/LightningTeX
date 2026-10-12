// Project persistence in IndexedDB. Every failure degrades to "not saved"; the editor keeps working.
const request=operation=>new Promise((resolve,reject)=>{operation.onsuccess=()=>resolve(operation.result);operation.onerror=()=>reject(operation.error);});

/** Resolves to a store, or null where IndexedDB is missing or blocked. */
export async function openStore(name='lightningtex'){
  if(!globalThis.indexedDB)return null;
  let database;
  try{
    const opening=indexedDB.open(name,1);
    opening.onupgradeneeded=()=>{opening.result.createObjectStore('files');opening.result.createObjectStore('meta');};
    database=await request(opening);
  }catch{return null;}
  const transact=(mode,work)=>new Promise((resolve,reject)=>{
    const transaction=database.transaction(['files','meta'],mode);let result;
    transaction.oncomplete=()=>resolve(result);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('Storage transaction failed'));
    result=work(transaction.objectStore('files'),transaction.objectStore('meta'));
  });
  return {
    /** {files:[{path,text|data}], ...meta} or null when nothing was saved. */
    async load(){
      const pending=await transact('readonly',(files,meta)=>[request(files.getAll()),request(meta.get('project'))]);
      const [files,meta]=await Promise.all(pending);
      return meta?{...meta,files}:null;
    },
    /** put: [{path,text|data}], remove: [path], meta: plain object, reset: drop every stored file first. */
    save:({put=[],remove=[],meta,reset=false})=>transact('readwrite',(files,store)=>{
      if(reset)files.clear();
      for(const path of remove)files.delete(path);
      for(const file of put)files.put(file,file.path);
      if(meta)store.put(meta,'project');
    }),
    clear:()=>transact('readwrite',(files,meta)=>{files.clear();meta.clear();}),
    close:()=>database.close(),
  };
}
