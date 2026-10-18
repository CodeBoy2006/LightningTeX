// Minimal ZIP: write stored entries, read stored or deflated ones. No ZIP64, no encryption.
const table=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=table[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}

/** entries: [{path, data:Uint8Array}] -> Uint8Array */
export function zip(entries,now=new Date()){
  const encoder=new TextEncoder(),parts=[],central=[];let offset=0;
  const time=(now.getHours()<<11)|(now.getMinutes()<<5)|(now.getSeconds()>>1),date=(Math.max(0,now.getFullYear()-1980)<<9)|((now.getMonth()+1)<<5)|now.getDate();
  for(const {path,data} of entries){
    const name=encoder.encode(path),crc=crc32(data);
    // Shared fields of the local and central headers; bit 11 marks UTF-8 names.
    const fields=view=>{view.setUint16(0,20,true);view.setUint16(2,0x0800,true);view.setUint16(4,0,true);view.setUint16(6,time,true);view.setUint16(8,date,true);
      view.setUint32(10,crc,true);view.setUint32(14,data.length,true);view.setUint32(18,data.length,true);view.setUint16(22,name.length,true);};
    const local=new Uint8Array(30+name.length),entry=new Uint8Array(46+name.length);
    new DataView(local.buffer).setUint32(0,0x04034b50,true);fields(new DataView(local.buffer,4));local.set(name,30);
    const view=new DataView(entry.buffer);view.setUint32(0,0x02014b50,true);view.setUint16(4,20,true);fields(new DataView(entry.buffer,6));view.setUint32(42,offset,true);entry.set(name,46);
    parts.push(local,data);central.push(entry);offset+=local.length+data.length;
  }
  const size=central.reduce((sum,entry)=>sum+entry.length,0),end=new Uint8Array(22),view=new DataView(end.buffer);
  view.setUint32(0,0x06054b50,true);view.setUint16(8,entries.length,true);view.setUint16(10,entries.length,true);view.setUint32(12,size,true);view.setUint32(16,offset,true);
  const out=new Uint8Array(offset+size+22);let at=0;
  for(const part of [...parts,...central,end]){out.set(part,at);at+=part.length;}
  return out;
}

async function inflate(raw,size){
  const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),out=new Uint8Array(size);let at=0;
  for(;;){
    const {done,value}=await reader.read();
    if(done)break;
    // The declared size bounds the allocation; a larger stream is a corrupt or hostile archive.
    if(at+value.length>size){await reader.cancel().catch(()=>{});throw Error('Archive entry is larger than declared');}
    out.set(value,at);at+=value.length;
  }
  if(at!==size)throw Error('Archive entry is truncated');
  return out;
}

/** bytes -> [{path, data:Uint8Array}], directories omitted. */
export async function unzip(bytes,{maxFiles=2000,maxBytes=64*1024*1024}={}){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
  for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
  if(end<0)throw Error('Not a ZIP archive');
  const count=view.getUint16(end+10,true),decoder=new TextDecoder(),out=[];let at=view.getUint32(end+16,true),total=0;
  for(let n=0;n<count;n++){
    if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('Corrupt ZIP directory');
    const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),packed=view.getUint32(at+20,true),size=view.getUint32(at+24,true);
    const nameLength=view.getUint16(at+28,true),local=view.getUint32(at+42,true),path=decoder.decode(bytes.subarray(at+46,at+46+nameLength));
    at+=46+nameLength+view.getUint16(at+30,true)+view.getUint16(at+32,true);
    if(at>end)throw Error('Corrupt ZIP directory');
    if(path.endsWith('/'))continue;
    if(flags&1)throw Error('Encrypted archives are not supported');
    if(packed===0xffffffff||size===0xffffffff||local===0xffffffff)throw Error('ZIP64 archives are not supported');
    total+=size;
    if(out.length>=maxFiles||total>maxBytes)throw Error('Archive is too large');
    if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw Error('Corrupt ZIP entry');
    const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),raw=bytes.subarray(start,start+packed);
    if(raw.length!==packed)throw Error('Corrupt ZIP entry');
    let data;
    if(method===0){if(packed!==size)throw Error('Archive entry size mismatch');data=raw.slice();}
    else if(method===8)data=await inflate(raw,size);
    else throw Error('Unsupported ZIP compression method '+method);
    if(crc32(data)!==crc)throw Error('Archive entry checksum mismatch');
    out.push({path,data});
  }
  return out;
}
