// Line diff (Myers, O((N+M)·D)) for comparing a snapshot with the current text.

/** -> [{type:'same'|'del'|'add', text, a?, b?}] turning `before` into `after`; a and b are 1-based line numbers. */
export function diffLines(before,after){
  const a=before.split('\n'),b=after.split('\n');
  // Trim the common head and tail first; most comparisons differ in a few places.
  let head=0;while(head<a.length&&head<b.length&&a[head]===b[head])head++;
  let tail=0;while(tail<a.length-head&&tail<b.length-head&&a[a.length-1-tail]===b[b.length-1-tail])tail++;
  const x=a.slice(head,a.length-tail),y=b.slice(head,b.length-tail),ops=[];
  for(let i=0;i<head;i++)ops.push({type:'same',text:a[i],a:i+1,b:i+1});
  for(const op of middle(x,y))ops.push({...op,...(op.a!=null?{a:op.a+head}:{}),...(op.b!=null?{b:op.b+head}:{})});
  for(let i=tail;i>0;i--)ops.push({type:'same',text:a[a.length-i],a:a.length-i+1,b:b.length-i+1});
  return ops;
}
function middle(a,b){
  const n=a.length,m=b.length,max=n+m,offset=max+1,trace=[];
  if(!n)return b.map((text,i)=>({type:'add',text,b:i+1}));
  if(!m)return a.map((text,i)=>({type:'del',text,a:i+1}));
  // Very different texts: report a replacement rather than spend quadratic time.
  const limit=Math.min(max,4000);
  let v=new Int32Array(2*max+3),found=-1;
  for(let d=0;d<=limit&&found<0;d++){
    trace.push(v.slice());
    for(let k=-d;k<=d;k+=2){
      let i=k===-d||k!==d&&v[offset+k-1]<v[offset+k+1]?v[offset+k+1]:v[offset+k-1]+1,j=i-k;
      while(i<n&&j<m&&a[i]===b[j]){i++;j++;}
      v[offset+k]=i;
      if(i>=n&&j>=m){found=d;break;}
    }
  }
  if(found<0)return [...a.map((text,i)=>({type:'del',text,a:i+1})),...b.map((text,i)=>({type:'add',text,b:i+1}))];
  // Walk back through the saved frontiers.
  const ops=[];let i=n,j=m;
  for(let d=found;d>0;d--){
    const frontier=trace[d],k=i-j,down=k===-d||k!==d&&frontier[offset+k-1]<frontier[offset+k+1],previous=down?k+1:k-1;
    const pi=frontier[offset+previous],pj=pi-previous;
    while(i>pi+(down?0:1)&&j>pj+(down?1:0)){ops.push({type:'same',text:a[i-1],a:i,b:j});i--;j--;}
    if(down){ops.push({type:'add',text:b[j-1],b:j});j--;}else{ops.push({type:'del',text:a[i-1],a:i});i--;}
  }
  while(i>0&&j>0){ops.push({type:'same',text:a[i-1],a:i,b:j});i--;j--;}
  return ops.reverse();
}

/** Keep `context` unchanged lines around each change; longer unchanged runs become {type:'fold', count}. */
export function foldDiff(ops,context=2){
  const out=[];let i=0;
  while(i<ops.length){
    if(ops[i].type!=='same'){out.push(ops[i++]);continue;}
    let j=i;while(j<ops.length&&ops[j].type==='same')j++;
    const run=ops.slice(i,j),lead=i===0?0:context,trail=j===ops.length?0:context;
    if(run.length>lead+trail+1){out.push(...run.slice(0,lead),{type:'fold',count:run.length-lead-trail,from:run[lead]},...run.slice(run.length-trail));}
    else out.push(...run);
    i=j;
  }
  return out;
}

/** {added, removed} line counts. */
export function diffStats(ops){
  let added=0,removed=0;for(const op of ops){if(op.type==='add')added++;else if(op.type==='del')removed++;}
  return {added,removed};
}
