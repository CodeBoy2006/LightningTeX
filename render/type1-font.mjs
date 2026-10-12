// PDF.js already converts Type 1 charstrings to OpenType. A font-only PDF lets us
// reuse that conversion once per font, including glyphs absent from the initial PDF.
export function type1FontPdf(bytes,psname,encoding) {
  if(!/^[A-Za-z0-9_.+-]+$/.test(psname))throw Error('Invalid Type 1 PostScript name');
  const names=encoding?.split(' ');
  if(names&&(names.length!==256||names.some(name=>!/^[-A-Za-z0-9_.+]+$/.test(name))))throw Error('Invalid Type 1 encoding');
  const vector=names?` /Encoding << /Type /Encoding /Differences [0 ${names.map(name=>'/'+name).join(' ')}] >>`:'';
  const parts=[],lengths=[0,0,0];let offset=0,phase=0;
  while(offset<bytes.length){
    if(bytes[offset++]!==128)throw Error('Invalid PFB segment');
    const type=bytes[offset++];if(type===3)break;
    if(![1,2].includes(type)||offset+4>bytes.length)throw Error('Invalid PFB header');
    const length=new DataView(bytes.buffer,bytes.byteOffset+offset,4).getUint32(0,true);offset+=4;
    if(offset+length>bytes.length)throw Error('Truncated PFB font');
    if(type===2)phase=1;else if(phase===1)phase=2;
    lengths[phase]+=length;parts.push(bytes.subarray(offset,offset+length));offset+=length;
  }
  if(!lengths[0]||!lengths[1])throw Error('PFB font has no charstrings');
  const encode=value=>new TextEncoder().encode(value),join=items=>{
    const out=new Uint8Array(items.reduce((sum,item)=>sum+item.length,0));let at=0;
    for(const item of items){out.set(item,at);at+=item.length;}return out;
  };
  const font=join(parts),stream=encode('BT /F1 10 Tf <'+Array.from({length:256},(_,i)=>i.toString(16).padStart(2,'0')).join('')+'> Tj ET');
  const objects=[
    encode('<< /Type /Catalog /Pages 2 0 R >>'),
    encode('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),
    encode('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 7 0 R >>'),
    encode(`<< /Type /Font /Subtype /Type1 /BaseFont /${psname}${vector} /FirstChar 0 /LastChar 255 /Widths [${Array(256).fill(0).join(' ')}] /FontDescriptor 5 0 R >>`),
    encode(`<< /Type /FontDescriptor /FontName /${psname} /Flags 4 /FontBBox [-1000 -1000 3000 3000] /ItalicAngle 0 /Ascent 1000 /Descent -1000 /CapHeight 700 /StemV 80 /FontFile 6 0 R >>`),
    join([encode(`<< /Length ${font.length} /Length1 ${lengths[0]} /Length2 ${lengths[1]} /Length3 ${lengths[2]} >>\nstream\n`),font,encode('\nendstream')]),
    join([encode(`<< /Length ${stream.length} >>\nstream\n`),stream,encode('\nendstream')]),
  ];
  const chunks=[encode('%PDF-1.4\n')],offsets=[0];let size=chunks[0].length;
  objects.forEach((object,i)=>{offsets.push(size);const chunk=join([encode(`${i+1} 0 obj\n`),object,encode('\nendobj\n')]);chunks.push(chunk);size+=chunk.length;});
  chunks.push(encode(`xref\n0 8\n0000000000 65535 f \n${offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`));
  return join(chunks);
}

export async function parseEngineFont(buffer,descriptor,pdfjs,worker) {
  const module=await import('opentype.js'),parse=module.parse||module.default?.parse;
  if(descriptor.format!=='type1')return parse(buffer);
  const task=pdfjs.getDocument({data:type1FontPdf(new Uint8Array(buffer),descriptor.psname,descriptor.encoding),worker,
    isEvalSupported:false,useSystemFonts:false,disableFontFace:true,fontExtraProperties:true});
  try {
    const pdf=await task.promise,page=await pdf.getPage(1),ops=await page.getOperatorList();
    const fontId=ops.argsArray[ops.fnArray.indexOf(pdfjs.OPS.setFont)]?.[0];
    const converted=page.commonObjs.get(fontId);
    if(converted.missingFile||!converted.data)throw Error('Type 1 font conversion failed');
    const font=parse(converted.data.buffer.slice(converted.data.byteOffset,converted.data.byteOffset+converted.data.byteLength));
    font.codeToGlyph=new Map();
    // Pinned PDF.js exposes the exact original-code -> converted-font-code mapping.
    ops.fnArray.forEach((op,i)=>{if(op===pdfjs.OPS.showText)for(const glyph of ops.argsArray[i][0]){
      if(glyph?.isInFont){const index=font.charToGlyphIndex(glyph.fontChar);if(index)font.codeToGlyph.set(glyph.originalCharCode,index);}
    }});
    if(!font.codeToGlyph.size)throw Error('Type 1 encoding is unavailable');
    return font;
  }finally{await task.destroy();}
}
