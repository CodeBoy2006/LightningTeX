const KEY='lightningtex:settings:v1';
export const DEFAULT_SETTINGS=Object.freeze({
  theme:'system',accent:'bolt',lang:'auto',darkPages:false,
  fontSize:13,wrap:true,autoClose:true,tabSize:2,spellcheck:false,
  autoCompile:true,mathPreview:true,mathScale:'m',follow:true,persist:true,
  sidebar:232,sidebarOpen:true,split:0.5,layout:'split',panel:false,panelTab:'problems',zoom:'fit',
});
const choices={theme:['system','light','dark'],accent:['bolt','indigo','teal','rose'],lang:['auto','en','zh'],mathScale:['s','m','l'],tabSize:[2,4],panelTab:['problems','log'],layout:['source','split','preview']};
const ranges={fontSize:[11,20],sidebar:[160,420],split:[0.2,0.8]};
/** Stored values are untrusted: anything of the wrong type or range falls back to its default. */
export function sanitizeSettings(stored){
  const settings={...DEFAULT_SETTINGS};
  for(const [key,fallback] of Object.entries(DEFAULT_SETTINGS)){
    const value=stored?.[key];
    if(choices[key]){if(choices[key].includes(value))settings[key]=value;}
    else if(ranges[key]){if(Number.isFinite(value))settings[key]=Math.min(ranges[key][1],Math.max(ranges[key][0],value));}
    else if(key==='zoom'){if(value==='fit'||(Number.isFinite(value)&&value>=0.25&&value<=4))settings[key]=value;}
    else if(typeof value===typeof fallback)settings[key]=value;
  }
  return settings;
}
export function loadSettings(){
  try{return sanitizeSettings(JSON.parse(localStorage.getItem(KEY)||'null'));}catch{return {...DEFAULT_SETTINGS};}
}
export function saveSettings(settings){
  try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{/* Private mode: settings last for the session. */}
}
