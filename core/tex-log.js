// Problems worth showing from a LuaLaTeX log. Relies on max_print_line being large (no wrapped lines).
const projectPath=name=>name.startsWith('./')?name.slice(2):name;
const systemFile=name=>name.startsWith('/');

/** [{severity:'error'|'warning'|'info', message, file, line}] — file is a project path or null. */
export function parseTexLog(log,{root='main.tex'}={}){
  const problems=[],lines=String(log||'').split('\n'),stack=[root],seen=new Set();
  const current=()=>{for(let i=stack.length-1;i>=0;i--)if(stack[i])return systemFile(stack[i])?null:stack[i];return root;};
  const add=(severity,message,line,file=current())=>{
    const text=message.replace(/\s+/g,' ').trim(),key=[severity,text,file,line].join('|');
    if(text&&!seen.has(key)){seen.add(key);problems.push({severity,message:text,file,line:line??null});}
  };
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(line.startsWith('! ')){
      if(/^!\s+==>|^! Emergency stop/.test(line))continue;
      let message=line.slice(2).replace(/^LaTeX Error: /,'').replace(/\.$/,''),number=null;
      for(let j=i+1;j<Math.min(lines.length,i+14);j++){
        const where=/^l\.(\d+) ?(.*)$/.exec(lines[j]);
        if(!where)continue;
        number=Number(where[1]);
        // The offending token ends the echoed line.
        const token=/(\\[A-Za-z@]+)\s*$/.exec(where[2]);
        if(token&&/^Undefined control sequence/.test(message))message+=' '+token[1];
        i=j;break;
      }
      add('error',message,number);
      continue;
    }
    const warning=/^(?:LaTeX|(?:Package|Class) (\S+)) Warning: (.*)$/.exec(line);
    if(warning){
      let message=warning[2];
      // Continuation lines repeat the package name in parentheses.
      while(i+1<lines.length&&/^\(\S+\)\s+/.test(lines[i+1]))message+=' '+lines[++i].replace(/^\(\S+\)\s+/,'');
      const where=/ on input line (\d+)\.?/.exec(message);
      if(!/^There were undefined references|^Label\(s\) may have changed/.test(message))
        add('warning',(warning[1]?warning[1]+': ':'')+message.replace(/ on input line \d+\.?/,'').replace(/\.$/,''),where?Number(where[1]):null);
      continue;
    }
    const box=/^(Overfull|Underfull) \\([hv])box \(([^)]*)\).* at lines? (\d+)/.exec(line);
    if(box){add('info',`${box[1]} \\${box[2]}box (${box[3]})`,Number(box[4]));continue;}
    // Track the file being read: "(" opens (a path follows for a file), ")" closes.
    for(let k=0;k<line.length;k++){
      if(line[k]==='('){const path=/^(?:\.{0,2}\/)[^\s()]+|^[^\s()\/]+\.[A-Za-z0-9]{2,5}(?=[\s)]|$)/.exec(line.slice(k+1));stack.push(path?projectPath(path[0]):null);}
      else if(line[k]===')'&&stack.length>1)stack.pop();
    }
  }
  return problems;
}
