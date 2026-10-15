import {comps,compSnapshot} from './comp-data.js?v=comp-flow-3';
import {validateBoard,encodeBoard,decodeBoard} from './board-files.mjs?v=comp-flow-3';
export function setupBoardControls({model,root,render,hideTip,status,clearSelection}){
  const key='tft-saved-boards-v1';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentName='My practice board',previous=null,pending=null;
  try{const name=sessionStorage.getItem('tft-board-name');if(name&&name.length<=60)currentName=name;}catch{}
  const toolbar=document.createElement('div');toolbar.className='board-toolbar';
  toolbar.innerHTML='<div><small>YOUR WORKSPACE</small><strong id="boardContext">Free play</strong></div><button id="boardUndo" hidden>Undo load</button><button id="boardSave">Save board</button><button id="boardLibrary">My boards</button><button id="boardShare">Share</button>';
  root.prepend(toolbar);
  toolbar.querySelector('#boardContext').textContent=currentName;
  function setName(name){currentName=name;toolbar.querySelector('#boardContext').textContent=name;try{sessionStorage.setItem('tft-board-name',name);}catch{}}
  root.addEventListener('click',e=>{if(e.target.closest('button')?.id==='arenaReset'){setName('My practice board');previous=null;toolbar.querySelector('#boardUndo').hidden=true;}});
  const modal=document.createElement('dialog');modal.className='board-dialog';modal.setAttribute('aria-labelledby','boardDialogTitle');
  modal.innerHTML='<div class="board-dialog-head"><h2 id="boardDialogTitle">Your boards</h2><button id="boardDialogClose" aria-label="Close board dialog">×</button></div><div id="boardDialogBody"></div><p id="boardDialogStatus" role="status" aria-live="polite"></p>';
  document.body.append(modal);
  const body=modal.querySelector('#boardDialogBody'),feedback=modal.querySelector('#boardDialogStatus');
  modal.querySelector('#boardDialogClose').onclick=()=>modal.close();
  function open(title,content){hideTip();feedback.textContent='';modal.querySelector('h2').textContent=title;body.innerHTML=content;if(!modal.open)modal.showModal();}
  function readLibrary(){const raw=localStorage.getItem(key);if(!raw)return [];const saved=JSON.parse(raw);if(!Array.isArray(saved))throw new Error('Your saved library could not be read. No saves were changed.');return saved.map(validateBoard);}
  function load(record){
    const clean=validateBoard(record);
    previous={version:1,name:currentName,state:model.snapshot()};
    model.restore(clean.state);setName(clean.name);clearSelection();hideTip();render();
    toolbar.querySelector('#boardContext').textContent=currentName;toolbar.querySelector('#boardUndo').hidden=false;
    modal.close();location.hash='playground';requestAnimationFrame(()=>{root.scrollIntoView({block:'start',behavior:'instant'});root.focus({preventScroll:true});});status(`${currentName} loaded. Your previous board is available with Undo load.`);
  }
  function library(){
    let saved;try{saved=readLibrary();}catch{open('Your boards','<p>Saved boards could not be read. Browser storage may be unavailable or damaged. Nothing has been overwritten.</p>');return;}
    open('Your boards',`<p class="board-dialog-intro">Saved in this browser. Load a board to keep working on it.</p><div class="saved-board-list">${saved.length?saved.map((b,i)=>`<button data-open-saved="${i}"><strong>${escape(b.name)}</strong><span>${b.state.board.filter(Boolean).length} champions · Level ${b.state.level} · ${b.state.gold} gold</span><b>Load ↗</b></button>`).join(''):'<p class="saved-empty">No saved boards yet. Adjust the playground, then choose Save board.</p>'}</div><form id="importBoardForm"><label for="importBoardCode">Import a board code or link</label><textarea id="importBoardCode" required maxlength="20000" placeholder="Paste a board code or shared link"></textarea><button class="guide-load" type="submit">Preview import</button></form>`);
  }
  function preview(record){pending=record;open('Load shared board',`<p class="board-dialog-intro"><strong>${escape(record.name)}</strong><br>${record.state.board.filter(Boolean).length} champions · Level ${record.state.level} · ${record.state.gold} gold</p><p>This replaces the playground. You can restore your current setup with Undo load.</p><button class="guide-load" id="confirmBoardImport">Load this board ↗</button>`);}
  document.addEventListener('arena:load-comp',e=>{try{const c=comps.find(c=>c.id===e.detail.id);load({version:1,name:`${c.name} · ${c.phases[e.detail.phase].label}`,state:compSnapshot(c.id,e.detail.phase)});}catch(error){status(error.message,true);}});
  toolbar.addEventListener('click',async e=>{
    const id=e.target.closest('button')?.id;
    if(id==='boardUndo'&&previous){const restore=previous;previous=null;model.restore(restore.state);setName(restore.name);clearSelection();hideTip();render();toolbar.querySelector('#boardUndo').hidden=true;status('Previous board restored.');}
    if(id==='boardSave')open('Save your board',`<form id="saveBoardForm"><label for="savedBoardName">Board name</label><input id="savedBoardName" maxlength="60" required value="${escape(currentName)}"><p>Includes positions, stars, items, bench, shop, gold and XP.</p><button type="submit" class="guide-load">Save to my boards</button></form>`);
    if(id==='boardLibrary')library();
    if(id==='boardShare'){
      const code=encodeBoard({version:1,name:currentName,state:model.snapshot()}),link=location.origin+location.pathname+'#board='+code;
      open('Share your board',`<p class="board-dialog-intro">Anyone with the code can import this exact setup.</p><label for="sharedBoardLink">Board link</label><textarea id="sharedBoardLink" readonly>${escape(link)}</textarea><button class="guide-load" id="copyBoardLink">Copy link</button><label for="sharedBoardCode">Portable board code</label><textarea id="sharedBoardCode" readonly>${escape(code)}</textarea><button id="copyBoardCode" class="guide-load">Copy board code</button><p>This local preview link works on this computer. Use the board code with My boards → Import on another copy of the site.</p>`);
    }
  });
  modal.addEventListener('submit',e=>{
    e.preventDefault();
    if(e.target.id==='saveBoardForm'){
      const name=modal.querySelector('#savedBoardName').value.trim();
      try{const record=validateBoard({version:1,name,state:model.snapshot()}),saved=readLibrary();if(saved.some(b=>b.name.toLowerCase()===name.toLowerCase())){feedback.textContent='That name is already saved. Choose a different name to keep both versions.';return;}localStorage.setItem(key,JSON.stringify([...saved,record]));setName(name);modal.close();status(`Saved “${name}” to My boards.`);}
      catch{feedback.textContent='Could not save. Use a name of 1–60 characters and allow browser storage, or copy a board code as a backup.';}
    }
    if(e.target.id==='importBoardForm'){try{preview(decodeBoard(modal.querySelector('#importBoardCode').value));}catch(error){feedback.textContent=error.message;}}
  });
  modal.addEventListener('click',async e=>{
    const saved=e.target.closest('[data-open-saved]');if(saved){try{load(readLibrary()[Number(saved.dataset.openSaved)]);}catch{feedback.textContent='Could not load this saved board. Your current board is unchanged.';}}
    const id=e.target.closest('button')?.id;
    if(id==='confirmBoardImport'&&pending){try{load(pending);pending=null;}catch(error){feedback.textContent=error.message;}}
    if(id==='copyBoardLink'||id==='copyBoardCode'){const field=modal.querySelector(id==='copyBoardLink'?'#sharedBoardLink':'#sharedBoardCode');try{await navigator.clipboard.writeText(field.value);feedback.textContent=id==='copyBoardLink'?'Board link copied.':'Board code copied.';}catch{field.focus();field.select();feedback.textContent='Copy the selected text to share this board.';}}
  });
  function sharedHash(){if(!location.hash.startsWith('#board='))return;try{preview(decodeBoard(location.hash));}catch(error){open('Unable to import board',`<p>${escape(error.message)}</p>`);}}
  window.addEventListener('hashchange',sharedHash);sharedHash();
}
