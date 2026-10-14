import {BackgroundEngine,LiveEngine} from './client.js';

// In the distribution, index.js and the runtime/data directories live together.
export async function createEngine({base='./',endpoint,onLog=()=>{},onLiveLog=onLog,onFonts=()=>{}}={}){
  base=new URL(base,import.meta.url);
  const runtime={};
  const background=new BackgroundEngine({base,runtime,endpoint,onLog});
  const live=new LiveEngine({base,runtime,endpoint,onLog:onLiveLog,onFonts});
  return {background,live,dispose(){background.stop();live.stop();runtime.module=null;}};
}

export {splitPreamble,captureSpans,findLiveEdit,acceptLiveEdit} from '../core/document.js';
export {unitContext,liveUnitEligibility,compareUnitBaseline} from '../core/capture.js';
export {replaceUnitRows} from '../core/live-layout.js';
export {parseMacros} from '../core/math-preview.js';
export {parseTexLog} from '../core/tex-log.js';
export {decodeDisplayList} from '../render/display-list.mjs';
