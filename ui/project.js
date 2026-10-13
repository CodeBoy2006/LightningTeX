// In-memory project: text and binary files by path, explicit empty folders, and the main file.
import {safeProjectPath} from '../core/document.js';
const collator=new Intl.Collator(undefined,{numeric:true,sensitivity:'base'});
export const basename=path=>path.slice(path.lastIndexOf('/')+1);
export const dirname=path=>path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
export const joinPath=(dir,name)=>dir?dir+'/'+name:name;
export const isImagePath=path=>/\.(png|jpe?g|gif|webp|bmp)$/i.test(path);
export function normalizePath(path){
  const clean=safeProjectPath(String(path).trim().replaceAll('\\','/').replace(/^(\.\/)+/,'').replace(/\/+$/,''));
  if(clean.length>240||clean.split('/').some(part=>part!==part.trim()||part.length>120))throw Error('Unsafe project path');
  return clean;
}
// \input{name} is written into the job line, so the name must survive TeX tokenization.
export const canBeMain=path=>/^[^\s\/#$%&{}~^\\]+\.tex$/i.test(path);
/** Text if the bytes are UTF-8 without NULs and small enough to edit, else null. */
export function decodeText(bytes){
  if(bytes.length>4*1024*1024||bytes.includes(0))return null;
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{return null;}
}
export const fileBytes=file=>typeof file.text==='string'?new TextEncoder().encode(file.text):file.data;

export function createProject(){
  const files=new Map(),folders=new Set(),listeners=new Set();let main=null,revision=0;
  const emit=change=>{for(const listener of [...listeners])listener(change);};
  const under=(path,root)=>path===root||path.startsWith(root+'/');
  const record=(path,content)=>({path,rev:++revision,...(typeof content==='string'?{text:content}:{data:content instanceof Uint8Array?content:new Uint8Array(content)})});
  const allFolders=()=>{
    const all=new Set(folders);
    for(const path of files.keys())for(let dir=dirname(path);dir;dir=dirname(dir))all.add(dir);
    return all;
  };
  function isFolder(path){
    if(folders.has(path))return true;
    if(typeof path==='string')for(const file of files.keys())if(file.startsWith(path+'/'))return true;
    return false;
  }
  const pickMain=()=>{
    const candidates=[...files.keys()].filter(canBeMain).sort(collator.compare);
    return candidates.find(path=>/\\documentclass/.test(files.get(path).text||''))??candidates[0]??null;
  };
  const api={
    get main(){return main;},
    on(listener){listeners.add(listener);return ()=>listeners.delete(listener);},
    has:path=>files.has(path),get:path=>files.get(path),
    isFolder,
    paths:()=>[...files.keys()].sort(collator.compare),
    folders:()=>[...allFolders()].sort(collator.compare),
    explicitFolders:()=>[...folders],
    files:()=>[...files.values()],
    write(path,content,origin){
      const target=normalizePath(path),existed=files.has(target);
      if(isFolder(target))throw Error('exists');
      files.set(target,record(target,content));
      if(!main)main=pickMain();
      emit({type:existed?'write':'create',path:target,origin});
      return target;
    },
    /** Removes a file or a whole folder. Returns a function that puts everything back. */
    remove(path){
      const gone=[...files.values()].filter(file=>under(file.path,path)),dirs=[...folders].filter(dir=>under(dir,path)),previous=main;
      if(!gone.length&&!dirs.length)return null;
      for(const file of gone)files.delete(file.path);
      for(const dir of dirs)folders.delete(dir);
      if(main&&!files.has(main))main=pickMain();
      emit({type:'remove',paths:gone.map(file=>file.path)});
      return ()=>{
        for(const file of gone)if(!files.has(file.path))files.set(file.path,{...file,rev:++revision});
        for(const dir of dirs)folders.add(dir);
        if(files.has(previous))main=previous;
        emit({type:'create',paths:gone.map(file=>file.path)});
      };
    },
    rename(from,to){
      const target=normalizePath(to);
      if(target===from)return target;
      if(files.has(target)||isFolder(target))throw Error('exists');
      if(under(target,from))throw Error('Unsafe project path');
      const moved=[];
      for(const file of [...files.values()])if(under(file.path,from)){
        const next=target+file.path.slice(from.length);
        files.delete(file.path);files.set(next,{...file,path:next,rev:++revision});moved.push([file.path,next]);
      }
      for(const dir of [...folders])if(under(dir,from)){folders.delete(dir);folders.add(target+dir.slice(from.length));}
      const mainMove=moved.find(([old])=>old===main);
      if(mainMove)main=canBeMain(mainMove[1])?mainMove[1]:pickMain();
      else if(!main)main=pickMain();
      emit({type:'rename',moved});
      return target;
    },
    mkdir(path){
      const target=normalizePath(path);
      if(files.has(target))throw Error('exists');
      folders.add(target);emit({type:'mkdir',path:target});return target;
    },
    setMain(path){if(files.has(path)&&canBeMain(path)&&main!==path){main=path;emit({type:'main',path});}},
    /** A free path in dir derived from name: notes.tex, notes-2.tex, … */
    unique(dir,name){
      const dot=name.lastIndexOf('.'),stem=dot>0?name.slice(0,dot):name,ext=dot>0?name.slice(dot):'',taken=allFolders();
      let candidate=joinPath(dir,name);
      for(let n=2;files.has(candidate)||taken.has(candidate);n++)candidate=joinPath(dir,`${stem}-${n}${ext}`);
      return candidate;
    },
    /** Replaces everything. Entries with unusable paths are skipped rather than failing the load. */
    load(data){
      files.clear();folders.clear();
      for(const file of data.files||[])try{const path=normalizePath(file.path);files.set(path,record(path,typeof file.text==='string'?file.text:file.data));}catch{/* skip */}
      for(const dir of data.folders||[])try{folders.add(normalizePath(dir));}catch{/* skip */}
      main=files.has(data.main)&&canBeMain(data.main)?data.main:pickMain();
      emit({type:'load'});
    },
  };
  return api;
}
