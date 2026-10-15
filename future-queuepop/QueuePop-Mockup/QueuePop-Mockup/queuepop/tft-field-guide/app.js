import {champions,equipment} from './arena-data.js?v=comp-flow-3';
import {comps} from './comp-data.js?v=comp-flow-3';
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>[...root.querySelectorAll(s)];
const champ=id=>champions.find(c=>c.id===id);
let opened=null,stage=2;
const portrait=id=>`<img src="${champ(id).image}" alt="${champ(id).name}" loading="lazy">`;
const unit=id=>`<span class="hex-unit cost${champ(id).cost}"><span class="inside">${portrait(id)}</span></span>`;
function board(comp,phase=2){const plan=comp.phases[phase];return `<div class="hex-board">${[0,1,2,3].map(r=>`<div class="hex-row">${Array.from({length:7},(_,col)=>{const u=plan.units.find(u=>u[0]===r*7+col);return `<span class="hex-cell ${u?'filled':''}" ${u?`title="${champ(u[1]).name}"`:''}>${u?portrait(u[1]):''}</span>`}).join('')}</div>`).join('')}</div>`;}
function renderHome(){
 $('#spotBoard').innerHTML=board(comps[0]).replace('<div class="hex-board">','').replace(/<\/div>\s*$/,'');
 $('#homeMetaList').innerHTML=comps.map((c,i)=>`<div class="meta-row" data-open-comp="${c.id}" tabindex="0" role="button" aria-label="Explore ${c.name}"><span class="meta-rank">0${i+1}</span><span class="meta-name"><strong>${c.name}</strong><small>${c.style} · ${c.difficulty}</small></span><span class="small-units">${c.phases[2].units.slice(0,5).map(u=>portrait(u[1])).join('')}</span><span class="meta-stat"><b>${c.phases[2].units.length}</b><small>CHAMPIONS</small></span><span class="meta-stat"><b class="text-positive">${c.phases.length}</b><small>STAGES</small></span><span class="meta-action">EXPLORE ↗</span></div>`).join('');
}
function renderFeatured(){ $('#featuredGrid').innerHTML=comps.map(c=>`<button class="featured-card" data-open-comp="${c.id}">${unit(c.carry)}<div><small>${c.difficulty.toUpperCase()} · PRACTICE</small><strong>${c.name}</strong><span>${c.style} · ${c.phases[2].units.length} champions</span></div></button>`).join(''); }
function expanded(c){const plan=c.phases[stage];return `<div class="expanded"><div class="expand-head"><h3>${c.name}</h3><span>SET 13 · PRACTICE GUIDE</span></div><div class="expand-grid"><div class="expand-panel"><div class="expand-label">WHEN TO PLAY</div><p>${c.when}</p><div class="advice-title">BUILD YOUR BOARD</div><p>${c.plan}</p><div class="advice-title">WHEN TO PIVOT</div><p>${c.pivot}</p></div><div class="expand-panel"><div class="expand-label">BOARD POSITIONING</div><div class="expand-board"><div class="board-tabs">${c.phases.map((p,n)=>`<button class="${n===stage?'active':''}" aria-pressed="${n===stage}" data-stage="${n}">${p.label}</button>`).join('')}</div>${board(c,stage)}</div><p class="stage-note">${plan.note}</p><p>${c.positioning}</p><button class="guide-load" data-load-comp="${c.id}" data-phase="${stage}">Play this ${stage===2?'board':plan.label.toLowerCase()} <span>↗</span></button></div><div class="expand-panel"><div class="expand-label">ITEM PLAN</div>${c.items.map(group=>`<div class="guide-holder">${portrait(group.holder)}<strong>${champ(group.holder).name}</strong></div><div class="item-row">${group.ids.map(id=>{const item=equipment.find(i=>i.id===id);return `<img class="item-icon" src="${item.image}" alt="${item.name}" title="${item.name}">`;}).join('')}</div><p>${group.note}</p>`).join('')}</div></div><div class="expand-footer"><small>Teaching board · simplified roster · no match statistics or tier ranking.</small><button data-share="${c.id}">Copy guide link ↗</button></div></div>`;}
function renderComps(){
 const q=$('#compSearch').value.toLowerCase().trim(),style=$('#styleFilter').value,difficulty=$('#tierFilter').value,sort=$('#sortFilter').value;
 const list=comps.filter(c=>(c.name+' '+c.traits.join(' ')+' '+c.phases[2].units.map(u=>champ(u[1]).name).join(' ')).toLowerCase().includes(q)&&(style==='all'||c.style===style)&&(difficulty==='all'||c.difficulty===difficulty));
 if(sort==='name')list.sort((a,b)=>a.name.localeCompare(b.name));
 if(sort==='difficulty')list.sort((a,b)=>['Beginner','Intermediate','Advanced'].indexOf(a.difficulty)-['Beginner','Intermediate','Advanced'].indexOf(b.difficulty));
 $('#visibleCount').innerHTML=String(list.length).padStart(2,'0')+' <span>SHOWN</span>';
 $('#compsList').innerHTML=list.length?list.map(c=>`<div class="comp-row-group"><div class="comp-row ${opened===c.id?'open':''}" role="button" tabindex="0" data-toggle-comp="${c.id}" aria-expanded="${opened===c.id}"><div class="comp-identity">${unit(c.carry)}<div class="identity-copy"><strong>${c.name}</strong><small>${c.descriptor}</small></div></div><div class="lineup">${c.phases[2].units.slice(0,6).map(u=>unit(u[1])).join('')}</div><div class="comp-tags">${c.traits.map(t=>`<span class="trait-bubble">${t}</span>`).join('')}<span class="tag">${c.style}</span></div><div class="performance"><span class="perf-value">${c.phases[2].level}<small>LEVEL</small></span><span class="practice-difficulty">${c.difficulty}<small>PRACTICE</small></span></div><span class="comp-button">${opened===c.id?'CLOSE':'VIEW GUIDE'} ${opened===c.id?'⌃':'↗'}</span></div>${opened===c.id?expanded(c):''}</div>`).join(''):'<div class="empty-state"><strong>NO COMPS FOUND</strong>Try another champion or remove a filter.</div>';
}
function goto(page,id=null){
 const next=page==='comps'?'comps':'home';$('#view-home').hidden=next!=='home';$('#view-comps').hidden=next!=='comps';$$('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav===next));$('.nav-links').classList.remove('open');$('#menuButton').setAttribute('aria-expanded','false');
 if(next==='comps'){if(id!==null){$('#compSearch').value='';$('#styleFilter').value='all';$('#tierFilter').value='all';opened=comps.some(c=>c.id===id)?id:null;stage=2;}renderComps();}
 window.scrollTo({top:0,behavior:'instant'});
 if(id!==null)requestAnimationFrame(()=>$(`[data-toggle-comp="${id}"]`)?.scrollIntoView({block:'start',behavior:'instant'}));
}
function navigateFromHash(){const h=location.hash.slice(1);if(h==='playground'||h.startsWith('board=')){goto('home');$$('[data-nav]').forEach(el=>el.classList.toggle('active',el.dataset.nav==='playground'));requestAnimationFrame(()=>{const arena=$('#arenaSandbox');arena.scrollIntoView({block:'start',behavior:'instant'});arena.focus({preventScroll:true});});return;}if(/^comp-\d+$/.test(h))goto('comps',Number(h.slice(5)));else goto(h==='comps'?'comps':'home');}
let timer;function notice(text){const n=$('#notice');n.textContent=text;n.classList.add('show');clearTimeout(timer);timer=setTimeout(()=>n.classList.remove('show'),4000);}
document.addEventListener('click',e=>{
 const nav=e.target.closest('[data-go]');if(nav){location.hash=nav.dataset.go;return;}
 const msg=e.target.closest('[data-notice]');if(msg){notice(msg.dataset.notice);return;}
 const open=e.target.closest('[data-open-comp]');if(open){const hash='#comp-'+open.dataset.openComp;if(location.hash===hash)navigateFromHash();else location.hash=hash;return;}
 const toggle=e.target.closest('[data-toggle-comp]');if(toggle){const id=Number(toggle.dataset.toggleComp);opened=opened===id?null:id;stage=2;renderComps();return;}
 const level=e.target.closest('[data-stage]');if(level){stage=Number(level.dataset.stage);renderComps();$(`[data-stage="${stage}"]`)?.focus({preventScroll:true});return;}
 const load=e.target.closest('[data-load-comp]');if(load){document.dispatchEvent(new CustomEvent('arena:load-comp',{detail:{id:Number(load.dataset.loadComp),phase:Number(load.dataset.phase)}}));return;}
 const share=e.target.closest('[data-share]');if(share){const url=location.origin+location.pathname+'#comp-'+share.dataset.share;navigator.clipboard.writeText(url).then(()=>notice('Guide link copied. This preview address works on this computer.')).catch(()=>notice('Copy the guide address from your browser.'));}
});
document.addEventListener('keydown',e=>{if(e.key==='/'&&!/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)){e.preventDefault();location.hash='comps';setTimeout(()=>$('#compSearch').focus(),50);}if(['Enter',' '].includes(e.key)&&(document.activeElement.dataset.toggleComp||document.activeElement.dataset.openComp)){e.preventDefault();document.activeElement.click();}});
['compSearch','styleFilter','tierFilter','sortFilter'].forEach(id=>$('#'+id).addEventListener(id==='compSearch'?'input':'change',()=>{opened=null;renderComps();}));
$('#resetFilters').addEventListener('click',()=>{$('#compSearch').value='';$('#styleFilter').value='all';$('#tierFilter').value='all';$('#sortFilter').value='default';opened=null;renderComps();});
$('#searchTop').addEventListener('click',()=>{location.hash='comps';setTimeout(()=>$('#compSearch').focus(),50);});
$('#menuButton').addEventListener('click',()=>{$('.nav-links').classList.toggle('open');$('#menuButton').setAttribute('aria-expanded',$('.nav-links').classList.contains('open'));});
window.addEventListener('hashchange',navigateFromHash);renderHome();renderFeatured();navigateFromHash();
