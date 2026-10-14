// Project persistence in IndexedDB. Every failure degrades to "not saved"; the editor keeps working.
const request=operation=>new Promise((resolve,reject)=>{operation.onsuccess=()=>resolve(operation.result);operation.onerror=()=>reject(operation.error);});

/** Resolves to a store, or null where IndexedDB is missing or blocked. */
export async function openStore(name='lightningtex'){
  if(!globalThis.indexedDB)return null;
  let database;
  try{
    const opening=indexedDB.open(name,2);
    opening.onupgradeneeded=()=>{for(const store of ['files','meta','history'])if(!opening.result.objectStoreNames.contains(store))opening.result.createObjectStore(store);};
    database=await new Promise((resolve,reject)=>{let blocked=false;opening.onblocked=()=>{blocked=true;resolve(null);};opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{if(blocked)opening.result.close();else resolve(opening.result);};});
    if(!database)return null;
    database.onversionchange=()=>database.close();
  }catch{return null;}
  const transact=(mode,work)=>new Promise((resolve,reject)=>{
    const transaction=database.transaction(['files','meta','history'],mode);let result;
    transaction.oncomplete=()=>resolve(result);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('Storage transaction failed'));
    result=work(transaction.objectStore('files'),transaction.objectStore('meta'),transaction.objectStore('history'));
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
    listSnapshots:async projectId=>{
      const rows=await transact('readonly',(_files,_meta,history)=>request(history.getAll()));
      return rows.filter(row=>row.projectId===projectId).sort((a,b)=>b.time-a.time);
    },
    /** Spacing and retention are decided in the same write transaction as the insert. */
    addSnapshot:snapshot=>new Promise((resolve,reject)=>{
      const transaction=database.transaction('history','readwrite'),history=transaction.objectStore('history'),all=history.getAll();let saved=false;
      transaction.oncomplete=()=>resolve(saved);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('History transaction failed'));
      all.onsuccess=()=>{
        const rows=all.result.sort((a,b)=>b.time-a.time),latest=rows.find(row=>row.projectId===snapshot.projectId);
        if(!snapshot.force&&latest&&snapshot.time-latest.time<300000)return;
        const row={...snapshot};delete row.force;history.put(row,row.id);saved=true;
        for(const old of rows.slice(29))history.delete(old.id);
      };
    }),
    clear:()=>transact('readwrite',(files,meta,history)=>{files.clear();meta.clear();history.clear();}),
    close:()=>database.close(),
  };
}
