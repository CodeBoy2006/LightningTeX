import {openDialog} from './overlays.js';
export const SYMBOLS=Object.entries({
  greek:'alpha α,beta β,gamma γ,delta δ,epsilon ε,varepsilon ϵ,zeta ζ,eta η,theta θ,vartheta ϑ,iota ι,kappa κ,lambda λ,mu μ,nu ν,xi ξ,pi π,rho ρ,sigma σ,tau τ,upsilon υ,phi φ,varphi ϕ,chi χ,psi ψ,omega ω,Gamma Γ,Delta Δ,Theta Θ,Lambda Λ,Xi Ξ,Pi Π,Sigma Σ,Phi Φ,Psi Ψ,Omega Ω',
  operators:'sum ∑,prod ∏,int ∫,iint ∬,oint ∮,partial ∂,nabla ∇,infty ∞,pm ±,mp ∓,times ×,div ÷,cdot ⋅,sqrt √,cup ∪,cap ∩,setminus ∖,land ∧,lor ∨',
  relations:'leq ≤,geq ≥,neq ≠,approx ≈,equiv ≡,sim ∼,simeq ≃,propto ∝,in ∈,notin ∉,subset ⊂,subseteq ⊆,supset ⊃,supseteq ⊇,perp ⊥,parallel ∥,forall ∀,exists ∃',
  arrows:'rightarrow →,leftarrow ←,leftrightarrow ↔,Rightarrow ⇒,Leftarrow ⇐,Leftrightarrow ⇔,mapsto ↦,uparrow ↑,downarrow ↓,to →',
  delimiters:'langle ⟨,rangle ⟩,lbrace {,rbrace },lvert |,rvert |,lVert ‖,rVert ‖,lfloor ⌊,rfloor ⌋,lceil ⌈,rceil ⌉',
}).flatMap(([group,items])=>items.split(',').map(item=>{const [name,glyph]=item.split(' ');return {group,name,glyph};}));
let recent=[];
export function openSymbols({host,t,insert}){
  try{recent=JSON.parse(localStorage.getItem('lightningtex:symbols')||'[]').filter(name=>SYMBOLS.some(s=>s.name===name)).slice(0,12);}catch{recent=[];}
  const body=document.createElement('div');body.className='symbols-body';body.innerHTML='<input class="tool-search" type="search"><div class="symbol-groups"></div>';
  const input=body.firstChild,list=body.lastChild;input.placeholder=input.ariaLabel=t('symbols.search');
  const dialog=openDialog(host,{title:t('symbols.open'),content:body,className:'symbols-dialog'});
  function render(){
    const aliases={'->':'rightarrow','<-':'leftarrow','<->':'leftrightarrow','=>':'Rightarrow','<=':'leq','>=':'geq','!=':'neq'},q=(aliases[input.value.trim()]||input.value.trim()).toLowerCase();list.replaceChildren();
    const groups=q?['all']:['recent','greek','operators','relations','arrows','delimiters'];let total=0;
    for(const group of groups){
      const rows=group==='recent'?recent.map(name=>SYMBOLS.find(s=>s.name===name)):SYMBOLS.filter(s=>(group==='all'||s.group===group)&&(!q||s.name.toLowerCase().includes(q)||s.glyph.includes(q)));
      if(!rows.length)continue;total+=rows.length;
      if(group!=='all')list.append(Object.assign(document.createElement('h3'),{textContent:t('symbols.'+group)}));
      const grid=document.createElement('div');grid.className='symbol-grid';
      for(const symbol of rows){const button=document.createElement('button');button.type='button';button.textContent=symbol.glyph;button.dataset.tip='\\'+symbol.name;button.setAttribute('aria-label',symbol.name);button.onclick=()=>{
        recent=[symbol.name,...recent.filter(name=>name!==symbol.name)].slice(0,12);try{localStorage.setItem('lightningtex:symbols',JSON.stringify(recent));}catch{/* Session recents still work. */}
        dialog.close();insert('\\'+symbol.name+(symbol.name==='sqrt'?'{}':' '));
      };grid.append(button);}list.append(grid);
    }
    if(!total)list.append(Object.assign(document.createElement('p'),{className:'panel-empty',textContent:t('palette.none')}));
  }
  input.oninput=render;render();input.focus();return dialog;
}
