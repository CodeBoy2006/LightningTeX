// Snippet templates with tab stops. ${1:text} is a stop with default text, ${1} an empty one, $0 the final caret.
// A number used twice is a mirror: it takes the first one's text when the caret leaves that stop.
// Lines after the first take the indentation of the line the snippet starts on; a tab is one indent unit.

/** Words that expand with Tab at the start of a line or after a space. */
export const SNIPPETS={
  beg:'\\begin{${1:environment}}\n\t$0\n\\end{${1}}',
  fig:'\\begin{figure}[t]\n\t\\centering\n\t\\includegraphics[width=0.8\\linewidth]{figures/${1}}\n\t\\caption{${2}}\\label{fig:${3}}\n\\end{figure}\n$0',
  tab:'\\begin{table}[t]\n\t\\centering\n\t\\caption{${1}}\\label{tab:${2}}\n\t\\begin{tabular}{${3:lcc}}\n\t\t\\hline\n\t\t${4} & ${5} & ${6} \\\\\n\t\t\\hline\n\t\t${7} & ${8} & ${9} \\\\\n\t\t\\hline\n\t\\end{tabular}\n\\end{table}\n$0',
  mat:'\\begin{pmatrix}\n\t${1:a} & ${2:b} \\\\\n\t${3:c} & ${4:d}\n\\end{pmatrix}$0',
  eq:'\\begin{equation}\n\t${1}\n\t\\label{eq:${2}}\n\\end{equation}\n$0',
};

/** -> {text, stops:[{n, start, end}]} with offsets into text. Stops are ordered 1, 2, …, then 0. */
export function expandSnippet(template,{indent='',unit='  '}={}){
  let text='';const stops=[];
  const source=template.replace(/\t/g,unit).replace(/\n/g,'\n'+indent);
  for(let i=0;i<source.length;){
    const match=source[i]==='$'&&/^\$(?:\{(\d+)(?::([^}]*))?\}|(\d+))/.exec(source.slice(i));
    if(match){
      const n=Number(match[1]??match[3]),fill=match[2]??'',start=text.length;text+=fill;stops.push({n,start,end:text.length});i+=match[0].length;continue;
    }
    text+=source[i++];
  }
  // Mirrors start with their source's text.
  for(const stop of stops){
    const first=stops.find(other=>other.n===stop.n);
    if(first!==stop&&stop.start===stop.end&&first.end>first.start){
      const fill=text.slice(first.start,first.end),shift=fill.length;text=text.slice(0,stop.start)+fill+text.slice(stop.end);
      for(const other of stops)if(other!==stop&&other.start>=stop.end){other.start+=shift;other.end+=shift;}
      stop.end+=shift;
    }
  }
  if(!stops.some(stop=>stop.n===0))stops.push({n:0,start:text.length,end:text.length});
  return {text,stops};
}

/** The order stops are visited in: each number's first occurrence, ascending, then 0. */
export function stopOrder(stops){
  const seen=new Set(),order=[];
  for(const stop of [...stops].sort((a,b)=>(a.n||1e9)-(b.n||1e9)||a.start-b.start))if(!seen.has(stop.n)){seen.add(stop.n);order.push(stop.n);}
  return order;
}

/** Keep stop offsets in step with one edit that replaced [at, at+removed) by `added` characters.
 *  Returns false when the edit is not inside a stop (the session should end). */
export function shiftStops(stops,at,removed,added,prefer){
  const end=at+removed,inside=stop=>stop.start<=at&&end<=stop.end;
  const owner=stops.find(stop=>stop===prefer&&inside(stop))||stops.find(inside);
  if(!owner)return false;
  const delta=added-removed;
  for(const stop of stops){
    if(stop===owner)stop.end+=delta;
    else if(stop.start>=end){stop.start+=delta;stop.end+=delta;}
  }
  return true;
}
