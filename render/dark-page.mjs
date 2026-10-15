// Dark pages that keep figures in colour: near-grey pixels (paper, text, rules, anti-aliasing) are inverted by
// lightness into the range from the dark paper to the light ink; coloured pixels keep their colour, with a short
// blend between the two so edges of coloured marks do not fringe.
export const DARK_PAPER=[28,30,34],LIGHT_INK=[226,226,222];
const GREY=24,COLOUR=64;
// Lightness 0..255 -> the inverted colour, per channel.
const ramp=[0,1,2].map(c=>Uint8ClampedArray.from({length:256},(_,l)=>Math.round(LIGHT_INK[c]+(DARK_PAPER[c]-LIGHT_INK[c])*l/255)));

/** Rewrite RGBA pixel data in place. */
export function darkenPixels(data){
  const [R,G,B]=ramp;
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2],max=r>g?(r>b?r:b):(g>b?g:b),min=r<g?(r<b?r:b):(g<b?g:b),chroma=max-min;
    if(chroma>=COLOUR)continue;
    const l=(r*77+g*150+b*29)>>8;
    if(chroma<=GREY){data[i]=R[l];data[i+1]=G[l];data[i+2]=B[l];continue;}
    const keep=(chroma-GREY)/(COLOUR-GREY);
    data[i]=R[l]+(r-R[l])*keep;data[i+1]=G[l]+(g-G[l])*keep;data[i+2]=B[l]+(b-B[l])*keep;
  }
  return data;
}
/** Darken a canvas, or a rectangle of it in canvas pixels {x, y, w, h}. */
export function darkenCanvas(canvas,rect){
  const x=Math.max(0,Math.floor(rect?.x??0)),y=Math.max(0,Math.floor(rect?.y??0));
  const w=Math.min(canvas.width-x,Math.ceil(rect?.w??canvas.width)),h=Math.min(canvas.height-y,Math.ceil(rect?.h??canvas.height));
  if(w<=0||h<=0)return;
  const context=canvas.getContext('2d',{willReadFrequently:true}),image=context.getImageData(x,y,w,h);
  darkenPixels(image.data);context.putImageData(image,x,y);
}
