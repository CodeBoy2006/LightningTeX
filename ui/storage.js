// Project persistence in IndexedDB. Every failure degrades to "not saved"; the editor keeps working.
// Version 3 keeps any number of projects: a record per project and its files keyed by [projectId, path].
// History rows carry the project's history id, so history moves with a project and is deleted with it.
import {documentTitle} from '../core/outline.js';
const request=operation=>new Promise((resolve,reject)=>{operation.onsuccess=()=>resolve(operation.result);operation.onerror=()=>reject(operation.error);});
const STORES=['files','meta','history','projects','project-files'];
const MAX_SNAPSHOTS=30,newId=()=>globalThis.crypto.randomUUID();

// A project saved by the single-project versions (files keyed by path, metadata under meta/project) becomes a
// project of its own. This runs on every open, in one transaction, so an interrupted upgrade cannot strand it.
function adoptLegacy(database){
  return new Promise((resolve,reject)=>{
    const transaction=database.transaction(['files','meta','projects','project-files'],'readwrite'),meta=transaction.objectStore('meta'),files=transaction.objectStore('files');
    transaction.oncomplete=resolve;transaction.onerror=transaction.onabort=()=>reject(transaction.error);
    const saved=meta.get('project'),all=files.getAll();
    // Requests complete in order: when the files arrive, the metadata is ready too.
    all.onsuccess=()=>{
      if(!saved.result)return;
      const id=newId(),now=Date.now();
      const title=documentTitle(all.result.find(file=>file.path===saved.result.main)?.text||'');
      transaction.objectStore('projects').put({...saved.result,id,title,created:now,updated:now},id);
      for(const file of all.result)transaction.objectStore('project-files').put({...file,projectId:id},[id,file.path]);
      files.clear();meta.delete('project');meta.put(id,'last');
    };
  });
}
/** Resolves to a store, or null where IndexedDB is missing or blocked. */
export async function openStore(name='lightningtex'){
  if(!globalThis.indexedDB)return null;
  let database;
  try{
    const opening=indexedDB.open(name,3);
    opening.onupgradeneeded=()=>{
      const db=opening.result;
      for(const store of ['files','meta','history','projects'])if(!db.objectStoreNames.contains(store))db.createObjectStore(store);
      if(!db.objectStoreNames.contains('project-files'))db.createObjectStore('project-files').createIndex('project','projectId');
    };
    database=await new Promise((resolve,reject)=>{let blocked=false;opening.onblocked=()=>{blocked=true;resolve(null);};opening.onerror=()=>reject(opening.error);opening.onsuccess=()=>{if(blocked)opening.result.close();else resolve(opening.result);};});
    if(!database)return null;
    database.onversionchange=()=>database.close();
    await adoptLegacy(database);
  }catch{return null;}
  const transact=(mode,work)=>new Promise((resolve,reject)=>{
    const transaction=database.transaction(STORES,mode),get=name=>transaction.objectStore(name);let result;
    transaction.oncomplete=()=>resolve(result);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('Storage transaction failed'));
    result=work(get);
  });
  const filesOf=(get,id)=>request(get('project-files').index('project').getAll(id));
  const keysOf=(get,id)=>request(get('project-files').index('project').getAllKeys(id));
  const historyOf=async(get,historyId)=>historyId?(await request(get('history').getAll())).filter(row=>row.projectId===historyId):[];
  async function settle(work,mode='readonly'){
    // IndexedDB requests resolve within the transaction; collect their promise and wait for both.
    let inner;const done=transact(mode,get=>{inner=work(get);});await done;return inner;
  }

  const store={
    /** Projects, most recently changed first: {id, title, main, updated, created, pages, thumb}. */
    listProjects:async()=>(await settle(get=>request(get('projects').getAll()))).sort((a,b)=>(b.updated||0)-(a.updated||0)),
    /** The project this browser opened last (shared across tabs), or null. */
    lastProject:()=>settle(get=>request(get('meta').get('last'))),
    remember:id=>transact('readwrite',get=>{get('meta').put(id,'last');}),
    /** data: {files, main, folders, title, historyId?} -> id */
    async createProject(data={}){
      const id=newId(),now=Date.now();
      await transact('readwrite',get=>{
        get('projects').put({id,title:data.title||'',main:data.main??null,folders:data.folders||[],tabs:data.tabs||[],active:data.active??null,historyId:data.historyId||newId(),created:now,updated:now},id);
        for(const file of data.files||[])get('project-files').put({...file,projectId:id},[id,file.path]);
      });
      return id;
    },
    /** A copy with its own id and history. */
    async duplicateProject(id,{title}={}){
      const source=await store.project(id).load();if(!source)return null;
      return store.createProject({...source,title:title||source.title,historyId:newId(),files:source.files.map(({path,text,data})=>text!=null?{path,text}:{path,data})});
    },
    /** Removes a project, its files and its history. Resolves to a record restoreProject can put back. */
    async deleteProject(id){
      return settle(async get=>{
        const project=await request(get('projects').get(id));if(!project)return null;
        const [files,keys,history]=await Promise.all([filesOf(get,id),keysOf(get,id),historyOf(get,project.historyId)]);
        for(const key of keys)get('project-files').delete(key);
        for(const row of history)get('history').delete(row.id);
        get('projects').delete(id);
        return {project,files,history};
      },'readwrite');
    },
    restoreProject:record=>transact('readwrite',get=>{
      get('projects').put(record.project,record.project.id);
      for(const file of record.files)get('project-files').put(file,[record.project.id,file.path]);
      for(const row of record.history)get('history').put(row,row.id);
    }),
    /** Display details for the project page; does not count as a change. */
    describe:(id,details)=>transact('readwrite',get=>{
      const projects=get('projects'),current=projects.get(id);
      current.onsuccess=()=>{if(current.result)projects.put({...current.result,...details},id);};
    }),
    /** A store scoped to one project, with the single-project interface the workspace uses. */
    project(id){
      return {
        id,
        /** {files:[{path,text|data}], ...meta} or null when the project does not exist. */
        load:()=>settle(async get=>{
          const [meta,files]=await Promise.all([request(get('projects').get(id)),filesOf(get,id)]);
          return meta?{...meta,files:files.map(({projectId,...file})=>file)}:null;
        }),
        /** put: [{path,text|data}], remove: [path], meta: plain object, reset: drop every stored file first. */
        save:({put=[],remove=[],meta,reset=false})=>settle(async get=>{
          const projects=get('projects'),files=get('project-files');
          if(reset)for(const key of await keysOf(get,id))files.delete(key);
          for(const path of remove)files.delete([id,path]);
          for(const file of put)files.put({...file,projectId:id},[id,file.path]);
          const current=await request(projects.get(id)),changed=reset||put.length||remove.length;
          projects.put({...current,...meta,id,created:current?.created??Date.now(),updated:changed||!current?Date.now():current.updated},id);
        },'readwrite'),
        listSnapshots:store.listSnapshots,addSnapshot:store.addSnapshot,clear:()=>store.clear(),
      };
    },
    listSnapshots:async projectId=>{
      const rows=await settle(get=>request(get('history').getAll()));
      return rows.filter(row=>row.projectId===projectId).sort((a,b)=>b.time-a.time);
    },
    /** Spacing and retention are decided in the same write transaction as the insert, per project. */
    addSnapshot:snapshot=>new Promise((resolve,reject)=>{
      const transaction=database.transaction('history','readwrite'),history=transaction.objectStore('history'),all=history.getAll();let saved=false;
      transaction.oncomplete=()=>resolve(saved);transaction.onerror=transaction.onabort=()=>reject(transaction.error||Error('History transaction failed'));
      all.onsuccess=()=>{
        const rows=all.result.filter(row=>row.projectId===snapshot.projectId).sort((a,b)=>b.time-a.time),latest=rows[0];
        if(!snapshot.force&&latest&&snapshot.time-latest.time<300000)return;
        const row={...snapshot};delete row.force;history.put(row,row.id);saved=true;
        for(const old of rows.slice(MAX_SNAPSHOTS-1))history.delete(old.id);
      };
    }),
    /** Turning persistence off forgets every project and all history. */
    clear:()=>transact('readwrite',get=>{for(const name of STORES)get(name).clear();}),
    close:()=>database.close(),
  };
  return store;
}
