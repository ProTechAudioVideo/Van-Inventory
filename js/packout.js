// /js/packout.js

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import { getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

/* Replace with your actual project config (safe for client-side) */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  appId: "YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* --- DOM --- */
const addFolderBtn  = document.getElementById('add-folder');
const downloadBtn   = document.getElementById('download-json');
const toggleLockBtn = document.getElementById('toggle-lock');
const container =
  document.getElementById('packout-container') ||
  document.getElementById('page-container') ||
  document.body; // fallback

/* Page key -> Firestore collection */
const pageKey = (document.body?.dataset?.packout) ||
  (document.title || 'packout').toLowerCase().replace(/\s+/g,'-');
const colRef = collection(db, pageKey);

/* Collapse + lock state */
const collapseKey   = (id) => `packout:${pageKey}:collapsed:${id}`;
const getCollapsed  = (id) => localStorage.getItem(collapseKey(id)) === '1';
const setCollapsed  = (id, val) => { if (val) localStorage.setItem(collapseKey(id),'1'); else localStorage.removeItem(collapseKey(id)); };

let locked = true; // default locked

function setLockUI(){
  document.body.classList.toggle('locked', locked);
  if (toggleLockBtn){
    toggleLockBtn.textContent = locked ? 'Unlock' : 'Lock';
    toggleLockBtn.setAttribute('aria-pressed', (!locked).toString());
  }
  if (addFolderBtn) addFolderBtn.style.display = locked ? 'none' : '';
  if (downloadBtn)  downloadBtn.style.display  = locked ? 'none' : '';
}

/* Status labels */
const STATUS_LABEL = { filled:'Filled', good:'Good', refill:'Refill', empty:'Empty' };
const LEGACY_STATUS_MAP = { full:'filled', mid:'good', low:'refill', empty:'empty' };
const canonicalStatus = (s)=> s ? (STATUS_LABEL[s] ? s : LEGACY_STATUS_MAP[s] || null) : null;

/* ID helpers */
const slugify = (s)=>(s||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') || ('folder-'+Date.now());

/* Firestore I/O */
async function loadAll(){ const out={}; (await getDocs(colRef)).forEach(d=>out[d.id]=d.data()); return out; }
async function ensureFolder(id,data){ await setDoc(doc(colRef,id),data,{merge:true}); }
async function saveItems(folderId,items){ await updateDoc(doc(colRef,folderId),{items}); }
async function deleteFolder(folderId){ await deleteDoc(doc(colRef,folderId)); }

/* Popovers */
let openPopover=null;
function attachPopover(pop,anchor,onDocClick){
  document.body.appendChild(pop);
  const r=anchor.getBoundingClientRect();
  pop.style.top  = `${window.scrollY + r.bottom + 6}px`;
  pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`;
  requestAnimationFrame(()=>{ pop.style.left = `${window.scrollX + r.right - pop.offsetWidth}px`; });
  document.addEventListener('click', onDocClick, { capture:true });
  openPopover = { pop, onDocClick };
}
function closePopover(){
  if(!openPopover) return;
  document.removeEventListener('click', openPopover.onDocClick, { capture:true });
  openPopover.pop.remove();
  openPopover=null;
}
function showAddPopover(anchor,onPick){
  closePopover();
  const pop=document.createElement('div'); pop.className='popover'; pop.role='dialog';
  pop.innerHTML=`
    <button class="popover-item" data-kind="qty">➕ Quantity item</button>
    <button class="popover-item" data-kind="status">🏷️ Status item</button>
    <button class="popover-item" data-kind="length">📏 Length item</button>
  `;
  const onDocClick=(e)=>{ if(!pop.contains(e.target) && e.target!==anchor) closePopover(); };
  pop.addEventListener('click',(e)=>{ const b=e.target.closest('.popover-item'); if(!b) return; onPick(b.dataset.kind); closePopover(); });
  attachPopover(pop,anchor,onDocClick);
}
function showStatusPopover(anchor,current,onSelect){
  closePopover();
  const pop=document.createElement('div'); pop.className='popover'; pop.role='listbox';
  pop.innerHTML=`
    <button class="popover-item" data-value="none">— None</button>
    <button class="popover-item" data-value="empty">${STATUS_LABEL.empty}</button>
    <button class="popover-item" data-value="refill">${STATUS_LABEL.refill}</button>
    <button class="popover-item" data-value="good">${STATUS_LABEL.good}</button>
    <button class="popover-item" data-value="filled">${STATUS_LABEL.filled}</button>
  `;
  pop.querySelectorAll('.popover-item').forEach(b=>{
    const v=b.dataset.value; b.classList.toggle('selected', v===current || (v==='none' && !current));
  });
  const onDocClick=(e)=>{ if(!pop.contains(e.target) && e.target!==anchor) closePopover(); };
  pop.addEventListener('click',(e)=>{ const b=e.target.closest('.popover-item'); if(!b) return; const v=b.dataset.value; onSelect(v==='none'?null:v); closePopover(); });
  attachPopover(pop,anchor,onDocClick);
}

/* Drag to reorder (0.25s hold) */
const DRAG_HOLD_MS=250, MOVE_CANCEL_PX=6;
let dragState=null;
function makeGhost(row){ const r=row.getBoundingClientRect(); const g=row.cloneNode(true); g.classList.add('drag-ghost'); g.style.width=`${r.width}px`; g.style.height=`${r.height}px`; g.style.left=`${r.left+window.scrollX}px`; g.style.top=`${r.top+window.scrollY}px`; document.body.appendChild(g); return g; }
function makePlaceholder(row){ const r=row.getBoundingClientRect(); const ph=document.createElement('div'); ph.className='drag-placeholder'; ph.style.height=`${r.height}px`; return ph; }
const docY=(e)=> (e.touches?.[0]?.clientY ?? e.changedTouches?.[0]?.clientY ?? e.clientY) + window.scrollY;
function onMove(e){
  if(!dragState) return; e.preventDefault();
  const y=docY(e)-dragState.offsetY; dragState.ghostEl.style.top=`${y}px`;
  const rows=[...dragState.listEl.querySelectorAll(':scope > .row')].filter(el=>el!==dragState.rowEl);
  let insertBefore=null; const midY=y+dragState.ghostEl.offsetHeight/2;
  for(const cand of rows){ const cr=cand.getBoundingClientRect(), cMid=cr.top+window.scrollY+cr.height/2; if(midY<cMid){insertBefore=cand; break;} }
  if(insertBefore) dragState.listEl.insertBefore(dragState.placeholderEl,insertBefore);
  else dragState.listEl.appendChild(dragState.placeholderEl);
}
async function onUp(e){
  if(!dragState) return; e.preventDefault();
  const ordered=[...dragState.listEl.children].filter(el=>el.classList.contains('row')||el.classList.contains('drag-placeholder'));
  const withoutRow=ordered.filter(el=>el!==dragState.rowEl);
  const newIndex=withoutRow.indexOf(dragState.placeholderEl);
  dragState.ghostEl.remove(); dragState.rowEl.style.visibility=''; dragState.placeholderEl.remove();
  const { folderId, items, startIndex }=dragState; dragState=null;
  if(newIndex===startIndex || newIndex<0) return;
  const copy=items.slice(); const [moved]=copy.splice(startIndex,1); copy.splice(newIndex,0,moved);
  await saveItems(folderId,copy); await init();
}
function attachDragHandle(handle,listEl,row,folderId,items,index){
  let startClientY=0, holdTimer=null;
  const begin=()=>{
    const ghost=makeGhost(row), placeholder=makePlaceholder(row);
    row.style.visibility='hidden'; row.before(placeholder);
    const r=row.getBoundingClientRect();
    dragState={ folderId, items, listEl, rowEl:row, ghostEl:ghost, placeholderEl:placeholder, startIndex:index, startY:startClientY, offsetY:(startClientY+window.scrollY)-(r.top+window.scrollY) };
    const moveEv=('ontouchstart'in window)?'touchmove':'mousemove', upEv=('ontouchstart'in window)?'touchend':'mouseup', cancelEv=('ontouchstart'in window)?'touchcancel':null;
    const _onMove=(e)=>onMove(e);
    const _onUp=async(e)=>{ document.removeEventListener(moveEv,_onMove,{passive:false}); document.removeEventListener(upEv,_onUp,{passive:false}); if(cancelEv) document.removeEventListener(cancelEv,_onUp,{passive:false}); await onUp(e); };
    document.addEventListener(moveEv,_onMove,{passive:false}); document.addEventListener(upEv,_onUp,{passive:false}); if(cancelEv) document.addEventListener(cancelEv,_onUp,{passive:false});
  };
  const onDown=(e)=>{
    if(locked) return; closePopover();
    startClientY=(e.touches?.[0]?.clientY ?? e.clientY);
    const moveEv=('ontouchstart'in window)?'touchmove':'mousemove', upEv=('ontouchstart'in window)?'touchend':'mouseup';
    const cancelIfMoved=(ev)=>{ const y=(ev.touches?.[0]?.clientY ?? ev.clientY); if(Math.abs(y-startClientY)>MOVE_CANCEL_PX && !dragState){ clearTimeout(holdTimer); document.removeEventListener(moveEv,cancelIfMoved,{passive:true}); document.removeEventListener(upEv,cancelPress,{passive:true}); } };
    const cancelPress=(ev)=>{ if(!dragState){ clearTimeout(holdTimer); } document.removeEventListener(moveEv,cancelIfMoved,{passive:true}); document.removeEventListener(upEv,cancelPress,{passive:true}); };
    holdTimer=setTimeout(begin, DRAG_HOLD_MS);
    document.addEventListener(moveEv,cancelIfMoved,{passive:true}); document.addEventListener(upEv,cancelPress,{passive:true});
    e.preventDefault();
  };
  handle.addEventListener('touchstart', onDown, { passive:false });
  handle.addEventListener('mousedown',  onDown);
}

/* Inline rename */
function startRenameFolder(folderId, folderData, titleSpan){
  if(locked) return;
  const input=document.createElement('input'); input.type='text'; input.className='folder-title-input'; input.value=folderData.name||''; input.setAttribute('aria-label','Edit folder name');
  titleSpan.style.display='none'; titleSpan.insertAdjacentElement('afterend', input); input.focus(); input.select();
  const cleanup=()=>{ input.remove(); titleSpan.style.display=''; };
  const commit=async()=>{
    const newName=(input.value||'').trim(), oldName=(folderData.name||'').trim(); if(!newName||newName===oldName){ cleanup(); return; }
    const all=await loadAll();
    const dup=Object.entries(all).some(([id,f])=> id!==folderId && (f?.name||'').trim().toLowerCase()===newName.toLowerCase());
    if(dup){ alert('That folder name is already in use.'); input.focus(); input.select(); return; }
    const newId=slugify(newName);
    try{
      if(newId===folderId) await ensureFolder(folderId,{name:newName});
      else { await setDoc(doc(colRef,newId),{...folderData,name:newName},{merge:false}); await deleteDoc(doc(colRef,folderId)); if(getCollapsed(folderId)) setCollapsed(newId,true); localStorage.removeItem(collapseKey(folderId)); }
    } finally { cleanup(); await init(); }
  };
  input.addEventListener('keydown',(e)=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); } else if(e.key==='Escape'){ e.preventDefault(); cleanup(); }});
  input.addEventListener('blur',commit);
}

/* Render everything */
function render(data){
  setLockUI(); container.innerHTML='';
  Object.entries(data).forEach(([folderId, folder])=>{
    const isCollapsed=getCollapsed(folderId);

    /* Header */
    const header=document.createElement('div'); header.className='folder'+(isCollapsed?' collapsed':'');
    const caret=document.createElement('button'); caret.className='caret'; caret.textContent=isCollapsed?'▸':'▾'; header.appendChild(caret);
    const title=document.createElement('span'); title.className='folder-title'+(!locked?' editable':''); title.textContent=folder.name||'(untitled)'; header.appendChild(title);

    if(!locked){
      title.title='Click to rename'; title.addEventListener('click',(e)=>{ e.stopPropagation(); startRenameFolder(folderId,folder,title); });
      const actions=document.createElement('div'); actions.className='folder-actions';

      const addItemBtn=document.createElement('button'); addItemBtn.textContent='+ Add Item'; addItemBtn.title='Add item';
      addItemBtn.addEventListener('click', async (e)=>{
        e.stopPropagation();
        showAddPopover(addItemBtn, async(kind)=>{
          const items=Array.isArray(folder.items)?folder.items.slice():[];
          if(kind==='status') items.push({kind:'status',name:''});
          else if(kind==='length') items.push({kind:'length',name:''});
          else items.push({kind:'qty',name:'',qty:0});
          await saveItems(folderId,items); await init();
        });
      });
      actions.appendChild(addItemBtn);

      const delFolderBtn=document.createElement('button'); delFolderBtn.textContent='Delete'; delFolderBtn.className='delete-btn';
      delFolderBtn.addEventListener('click', async (e)=>{ e.stopPropagation(); if(confirm('Delete this folder and all its items?')){ await deleteFolder(folderId); await init(); }});
      actions.appendChild(delFolderBtn);

      header.appendChild(actions);
    } else {
      title.addEventListener('click',()=>toggleCollapse());
    }

    container.appendChild(header);

    const list=document.createElement('div'); list.className='folder-items'; list.style.display=isCollapsed?'none':''; container.appendChild(list);
    function toggleCollapse(){
      const newCollapsed=list.style.display!=='none'; list.style.display=newCollapsed?'none':''; header.classList.toggle('collapsed',newCollapsed);
      caret.textContent=newCollapsed?'▸':'▾'; setCollapsed(folderId,newCollapsed); closePopover();
    }
    caret.addEventListener('click',toggleCollapse);

    const items=Array.isArray(folder.items)?folder.items.slice():[];

    const normalizeKind=(it)=>{
      if(canonicalStatus(it.status)) return 'status';
      if(typeof it.lengthFt==='number' || it.kind==='length') return 'length';
      if(it.kind==='status') return 'status';
      return 'qty';
    };

    const pushRow=(item,index)=>{
      const kind=normalizeKind(item), statusActive=canonicalStatus(item.status);
      const row=document.createElement('div'); row.className='row';

      /* Left side */
      const left=document.createElement('div'); left.className='row-left';
      if(!locked){
        const del=document.createElement('button'); del.textContent='🗑️'; del.className='delete-btn item'; del.title='Delete item';
        del.addEventListener('click', async ()=>{
          const nm=(items[index]?.name||'').trim()||'this item';
          if(!confirm(`Delete “${nm}”? This cannot be undone.`)) return;
          items.splice(index,1); await saveItems(folderId,items); await init();
        });
        left.appendChild(del);
      }
      if(locked){
        const t=document.createElement('span'); t.className='name-text'; t.textContent=item.name?.trim()||'(no name)'; t.title=item.name||'';
        left.appendChild(t);
      }else{
        const inp=document.createElement('input'); inp.type='text'; inp.placeholder='Item name'; inp.value=item.name||'';
        inp.addEventListener('change', async ()=>{ items[index].name=inp.value; await saveItems(folderId,items); });
        left.appendChild(inp);
      }

      /* Right side */
      const bay=document.createElement('div'); bay.className='control-bay';
      const controls=document.createElement('div'); controls.className='controls';

      if(kind==='qty'){
        if(locked){
          const q=document.createElement('span'); q.className='qty-text'; q.textContent=String(item.qty??0); controls.appendChild(q);
        }else{
          const minus=document.createElement('button'); minus.textContent='−'; minus.title='Decrement';
          const qty=document.createElement('input'); qty.type='number'; qty.min='0'; qty.value=item.qty||0;
          qty.setAttribute('inputmode','numeric'); qty.setAttribute('pattern','[0-9]*'); qty.enterKeyHint='done';
          const plus=document.createElement('button'); plus.textContent='+'; plus.title='Increment';
          minus.addEventListener('click', async (e)=>{ e.preventDefault(); const v=Math.max(0,(item.qty||0)-1); items[index].qty=v; qty.value=v; await saveItems(folderId,items); });
          qty.addEventListener('change', async ()=>{ items[index].qty=Math.max(0, parseInt(qty.value||'0',10)); qty.value=items[index].qty; await saveItems(folderId,items); });
          plus.addEventListener('click', async (e)=>{ e.preventDefault(); const v=(item.qty||0)+1; items[index].qty=v; qty.value=v; await saveItems(folderId,items); });
          controls.append(minus, qty, plus);
        }
      } else if (kind==='status'){
        if(locked){
          const chip=document.createElement('span'); chip.className=`status-chip ${statusActive||'none'}`; chip.textContent=statusActive?STATUS_LABEL[statusActive]:'—'; controls.appendChild(chip);
        }else{
          const picker=document.createElement('button'); picker.className=`status-picker ${statusActive||'none'}`; picker.textContent=statusActive?STATUS_LABEL[statusActive]:'Filled';
          picker.addEventListener('click',(e)=>{ e.preventDefault(); showStatusPopover(picker, statusActive, async (v)=>{ if(v) items[index].status=v; else delete items[index].status; await saveItems(folderId,items); await init(); }); });
          controls.appendChild(picker);
        }
      } else { // length
        if(locked){
          const span=document.createElement('span');
          span.className='len-value';             // fixed width in locked mode
          span.textContent=(typeof item.lengthFt==='number')?`${item.lengthFt} ft`:'—';
          controls.appendChild(span);
        }else{
          const g=document.createElement('div'); g.className='len-group';
          const inp=document.createElement('input');
          inp.type='number'; inp.step='0.1';
          inp.placeholder='0.0';
          inp.value=(typeof item.lengthFt==='number')?String(item.lengthFt):'';
          inp.classList.add('len-input');         // fixed width in edit mode
          inp.setAttribute('inputmode','decimal');
          inp.enterKeyHint='done';
          const u=document.createElement('span'); u.className='unit'; u.textContent='ft';
          inp.addEventListener('change', async ()=>{ const v=parseFloat(inp.value); if(Number.isFinite(v)) items[index].lengthFt=v; else delete items[index].lengthFt; await saveItems(folderId,items); });
          g.append(inp,u); controls.appendChild(g);
        }
      }

      bay.appendChild(controls);

      /* Drag handle (right) */
      const handle=document.createElement('button'); handle.className='drag-handle'; handle.title='Hold 0.25s to reorder';
      if(!locked){ attachDragHandle(handle, list, row, folderId, items, index); } else { handle.style.display='none'; }
      bay.appendChild(handle);

      row.append(left, bay);
      list.appendChild(row);
    };

    (Array.isArray(folder.items)?folder.items:[]).forEach(pushRow);
  });
}

/* Top controls */
addFolderBtn?.addEventListener('click', async ()=>{
  if(locked) return;
  const name=prompt('Folder name?'); if(!name) return;
  const clean=name.trim(); if(!clean) return;
  const all=await loadAll();
  const dup=Object.values(all).some(f => (f?.name||'').trim().toLowerCase()===clean.toLowerCase());
  if(dup){ alert('That folder name is already in use.'); return; }
  const id=slugify(clean); if(all[id]){ alert('A similar ID exists. Try a different name.'); return; }
  await ensureFolder(id,{name:clean,items:[]}); setCollapsed(id,false); await init();
});
downloadBtn?.addEventListener('click', async ()=>{
  const data=await loadAll(); const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=`${pageKey}.json`; a.click(); URL.revokeObjectURL(a.href);
});
toggleLockBtn?.addEventListener('click', ()=>{ locked=!locked; setLockUI(); init(); closePopover(); });
window.addEventListener('beforeunload', ()=>{ locked=true; setLockUI(); closePopover(); });

/* Boot */
async function init(){
  try{ const data=await loadAll(); render(data); }
  catch(e){ console.error(e); container.innerHTML='<p style="color:#900">Could not load data. Check Firebase config/rules.</p>'; }
}
setLockUI(); init();
