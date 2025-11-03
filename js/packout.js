/js/packout.js
```javascript
// js/packout.js
// Firestore-backed packout page (folders + items) with:
// - Lock/Unlock view (default LOCKED)
// - Three item types: quantity | status | length(ft)
// - Status drop-down with explicit '—' label for None
// - Add Item chooser, Add Folder, Delete with confirms
// - Reorder items via 0.25s long-press on right hamburger
// - Mobile-friendly numeric keypads
// - Works with multiple pages using <body data-packout="...">

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* 1) Firebase config (public web config – rules protect your data) */
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.appspot.com"
};
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* 2) Page + collection name */
const PAGE_KEY = document.body?.dataset?.packout
  || document.title.toLowerCase().trim().replace(/\s+/g,'-'); // e.g. "Packout 1" -> "packout-1"
const foldersCol = collection(db, PAGE_KEY);

/* 3) Status constants (explicit None = empty string) */
const STATUS_LABELS = {
  '': '—',          // em dash for None
  empty: 'Empty',
  refill: 'Refill',
  good: 'Good',
  filled: 'Filled'
};
const STATUS_CLASS = {
  '': 'status-none',
  empty: 'status-empty',
  refill: 'status-refill',
  good: 'status-good',
  filled: 'status-filled'
};
function applyStatusUI(el, value) {
  const v = (value === 'none' || value == null) ? '' : String(value);
  el.dataset.status = v;
  el.textContent = STATUS_LABELS[v];            // no fallback to "Filled"
  el.classList.remove('status-none','status-empty','status-refill','status-good','status-filled');
  el.classList.add(STATUS_CLASS[v]);
}

/* 4) State */
let uiLocked = true;  // default locked on load

/* 5) DOM refs (these IDs must exist in each HTML page) */
const container    = document.getElementById('packout-container');
const btnAddFolder = document.getElementById('add-folder');
const btnDownload  = document.getElementById('download-json');
const btnToggle    = document.getElementById('toggle-lock');

/* 6) Helpers */
const delay = (ms) => new Promise(r => setTimeout(r, ms));
function el(tag, props={}, ...children){
  const n = document.createElement(tag);
  Object.assign(n, props);
  for (const c of children){
    if (typeof c === 'string') n.appendChild(document.createTextNode(c));
    else if (c) n.appendChild(c);
  }
  return n;
}
function deepClone(v){ return JSON.parse(JSON.stringify(v)); }

/* Debounce saves to limit writes */
const saveQueue = new Map(); // key: folderId -> timeout
function scheduleSave(folderId, data, wait=200){
  if (saveQueue.has(folderId)) clearTimeout(saveQueue.get(folderId));
  const to = setTimeout(async ()=>{
    await updateDoc(doc(foldersCol, folderId), data);
    saveQueue.delete(folderId);
  }, wait);
  saveQueue.set(folderId, to);
}

/* 7) Firestore read/write */
async function loadAll(){
  const snap = await getDocs(foldersCol);
  const rows = [];
  snap.forEach(d=>{
    rows.push({ id: d.id, ...d.data() });
  });
  // sort by 'order' (fallback name)
  rows.sort((a,b)=>{
    const ao = a.order ?? Number.MAX_SAFE_INTEGER;
    const bo = b.order ?? Number.MAX_SAFE_INTEGER;
    if (ao !== bo) return ao - bo;
    return (a.name || '').localeCompare(b.name || '');
  });
  return rows;
}

async function createFolder(name){
  const id = crypto.randomUUID();
  const existing = await getDocs(foldersCol);
  let maxOrder = -1;
  existing.forEach(d=>{
    const o = d.data().order ?? -1;
    if (o > maxOrder) maxOrder = o;
  });
  const data = { name, order: maxOrder+1, items: [], collapsed: false };
  await setDoc(doc(foldersCol, id), data);
  return id;
}
async function deleteFolder(folderId){
  await deleteDoc(doc(foldersCol, folderId));
}

/* 8) Render */
function render(folders){
  // top-level lock/hide
  if (btnToggle){
    btnToggle.textContent = uiLocked ? 'Unlock' : 'Lock';
    btnToggle.setAttribute('aria-pressed', String(!uiLocked));
  }
  if (btnAddFolder) btnAddFolder.style.display = uiLocked ? 'none' : '';
  if (btnDownload)  btnDownload.style.display  = uiLocked ? 'none' : '';

  container.innerHTML = '';
  folders.forEach(folder => container.appendChild(renderFolder(folder)));
}

function renderFolder(folder){
  const wrap = el('section', { className: 'folder' });

  /* header */
  const header = el('div', { className: 'folder-header' });

  const caret = el('button', {
    className: 'caret',
    title: folder.collapsed ? 'Expand' : 'Collapse'
  }, folder.collapsed ? '▸' : '▾');
  caret.addEventListener('click', async ()=>{
    folder.collapsed = !folder.collapsed;
    caret.textContent = folder.collapsed ? '▸' : '▾';
    caret.title = folder.collapsed ? 'Expand' : 'Collapse';
    scheduleSave(folder.id, { collapsed: folder.collapsed }, 50);
    body.style.display = folder.collapsed ? 'none' : '';
  });
  header.appendChild(caret);

  const title = el('h2', { className: 'folder-title' }, folder.name || '(no name)');
  if (!uiLocked){
    title.contentEditable = 'true';
    title.setAttribute('role','textbox');
    title.setAttribute('aria-label','Folder name');
    title.addEventListener('blur', async ()=>{
      const newName = title.textContent.trim() || '(no name)';
      if (newName !== folder.name){
        // Check duplicate among current DOM (simple check)
        const names = Array.from(document.querySelectorAll('.folder-title')).map(n=>n.textContent.trim());
        const dupCount = names.filter(n => n === newName).length;
        if (dupCount > 1){
          title.textContent = folder.name || '(no name)';
          alert('A folder with that name already exists.');
          return;
        }
        folder.name = newName;
        scheduleSave(folder.id, { name: newName });
      }
    });
  }
  header.appendChild(title);

  // Right-side actions
  const right = el('div', { className: 'folder-actions' });

  const addItemBtn = el('button', { className: 'add-item-btn', title: 'Add an item' }, '+ Add Item');
  addItemBtn.addEventListener('click', (e)=> showAddItemMenu(e.currentTarget, folder));
  right.appendChild(addItemBtn);

  const delBtn = el('button', { className: 'delete-btn', title: 'Delete this folder' }, 'Delete');
  delBtn.addEventListener('click', async ()=>{
    if (confirm(`Delete folder "${folder.name || '(no name)'}" and all its items?`)){
      await deleteFolder(folder.id);
      await init(); // reload all
    }
  });
  right.appendChild(delBtn);

  header.appendChild(right);

  // hide actions in locked mode
  if (uiLocked){
    addItemBtn.style.display = 'none';
    delBtn.style.display = 'none';
  }

  wrap.appendChild(header);

  /* body (items) */
  const body = el('div', { className: 'folder-body' });
  if (folder.collapsed) body.style.display = 'none';

  (folder.items || []).forEach((item, idx) => {
    body.appendChild(renderItemRow(folder, item, idx));
  });

  wrap.appendChild(body);
  return wrap;
}

function renderItemRow(folder, item, index){
  const row = el('div', { className: 'item-row', draggable: false });

  // Normalize item
  item.type = item.type || (item.hasOwnProperty('qty') ? 'qty' :
               item.hasOwnProperty('status') ? 'status' :
               item.hasOwnProperty('len') ? 'length' : 'qty');
  if (item.type === 'status' && (item.status === 'none' || item.status == null)) item.status = '';

  // Trash (hidden when locked)
  const trash = el('button', { className: 'trash-btn', title: 'Delete item' }, '🗑');
  trash.addEventListener('click', async ()=>{
    const nm = item.name?.trim() || '(no name)';
    if (!confirm(`Delete item "${nm}"?`)) return;
    const items = deepClone(folder.items || []);
    items.splice(index,1);
    await updateDoc(doc(foldersCol, folder.id), { items });
    await init();
  });

  // Name input / or label when locked
  const nameBox = el('input', {
    className: 'item-name',
    type: 'text',
    placeholder: 'Item name',
    value: item.name || ''
  });
  nameBox.addEventListener('input', ()=>{
    const items = deepClone(folder.items || []);
    items[index].name = nameBox.value;
    scheduleSave(folder.id, { items });
  });

  // Right controls container
  const right = el('div', { className: 'item-controls' });

  if (item.type === 'qty'){
    // quantity controls
    const minus = el('button', { className: 'qty-btn', type: 'button' }, '–');
    const qtyInput = el('input', {
      className: 'qty-input',
      type: 'text', inputMode: 'numeric', pattern: '[0-9]*',
      value: String(item.qty ?? 0)
    });
    const plus  = el('button', { className: 'qty-btn', type: 'button' }, '+');

    function commit(val){
      const n = Math.max(0, Number(val) || 0);
      qtyInput.value = String(n);
      const items = deepClone(folder.items || []);
      items[index].qty = n;
      scheduleSave(folder.id, { items });
    }
    minus.addEventListener('click', ()=> commit((Number(qtyInput.value)||0) - 1));
    plus .addEventListener('click', ()=> commit((Number(qtyInput.value)||0) + 1));
    qtyInput.addEventListener('input', ()=> {
      const raw = qtyInput.value.replace(/[^\d]/g,'');
      if (raw !== qtyInput.value) qtyInput.value = raw;
      commit(raw);
    });

    right.append(minus, qtyInput, plus);
  }
  else if (item.type === 'status'){
    // status button + menu
    const btn = el('button', { className: 'status-btn', type:'button' });
    applyStatusUI(btn, item.status);

    btn.addEventListener('click', (e)=>{
      showStatusMenu(btn, folder, index);
    });

    right.appendChild(btn);
  }
  else {
    // length(ft)
    const lenInput = el('input', {
      className: 'len-input',
      type: 'text', inputMode: 'decimal', pattern: '[0-9]*[.,]?[0-9]*',
      value: item.len != null ? String(item.len) : ''
    });
    // make visibly ~5 characters wide (JS fallback in case CSS not applied)
    lenInput.style.width = '5.8ch';

    const ft = el('span', { className: 'len-unit' }, 'ft');

    function commitLen(v){
      // allow empty for unset
      let s = String(v).trim();
      if (s === '') {
        const items = deepClone(folder.items || []);
        delete items[index].len;
        scheduleSave(folder.id, { items });
        return;
      }
      s = s.replace(',', '.');
      const n = Number(s);
      const out = Number.isFinite(n) ? n : 0;
      lenInput.value = String(out);
      const items = deepClone(folder.items || []);
      items[index].len = out;
      scheduleSave(folder.id, { items });
    }
    lenInput.addEventListener('input', ()=> {
      // keep only digits and a single decimal point/comma
      let s = lenInput.value.replace(/[^\d.,]/g,'');
      const firstComma = s.indexOf(',');
      const firstDot   = s.indexOf('.');
      // if both exist, keep the first and remove later ones
      if (firstComma !== -1 && firstDot !== -1){
        if (firstComma < firstDot){
          s = s.replace(/\./g,''); // remove dots
        } else {
          s = s.replace(/,/g,'');  // remove commas
        }
      }
      lenInput.value = s;
      commitLen(s);
    });

    right.append(lenInput, ft);
  }

  // Drag handle (right side)
  const handle = el('button', { className: 'drag-handle', title: 'Hold to reorder', type:'button' }, '≡');
  right.appendChild(handle);

  // Long press -> enable drag
  let pressTimer = null;
  handle.addEventListener('pointerdown', (e)=>{
    e.preventDefault();
    pressTimer = setTimeout(()=> {
      row.draggable = true;
      row.classList.add('dragging');
      row.dispatchEvent(new DragEvent('dragstart', { bubbles:true, cancelable:true }));
    }, 250);
  });
  ['pointerup','pointerleave','pointercancel'].forEach(ev=>{
    handle.addEventListener(ev, ()=>{
      clearTimeout(pressTimer);
    });
  });

  // Drag + drop logic
  row.addEventListener('dragstart', (e)=>{
    row.classList.add('dragging');
    e.dataTransfer.setData('text/plain', String(index));
    e.dataTransfer.effectAllowed = 'move';
  });
  row.addEventListener('dragend', ()=>{
    row.classList.remove('dragging');
    row.draggable = false;
  });

  row.addEventListener('dragover', (e)=>{
    e.preventDefault();
    const after = getDragAfterElement(row.parentElement, e.clientY);
    if (after == null) {
      row.parentElement.appendChild(row);
    } else {
      row.parentElement.insertBefore(row, after);
    }
  });
  row.addEventListener('drop', async (e)=>{
    e.preventDefault();
    const from = Number(e.dataTransfer.getData('text/plain'));
    const children = Array.from(row.parentElement.children);
    const to = children.indexOf(row);
    if (from === -1 || to === -1 || from === to) return;

    const items = deepClone(folder.items || []);
    const [moved] = items.splice(from,1);
    items.splice(to,0,moved);
    await updateDoc(doc(foldersCol, folder.id), { items });
    await init();
  });

  // Assemble left & right columns
  const leftCol = el('div', { className: 'item-left' }, trash, nameBox);
  const rightCol = right;

  row.append(leftCol, rightCol);

  // Lock mode adjustments
  if (uiLocked){
    trash.style.display = 'none';
    nameBox.replaceWith(el('div', { className: 'item-name-locked' }, item.name || '(no name)'));

    if (item.type === 'qty'){
      right.replaceChildren(el('div', { className: 'qty-locked' }, String(item.qty ?? 0)));
    } else if (item.type === 'status'){
      const chip = el('span', { className: 'status-chip' });
      applyStatusUI(chip, item.status);
      right.replaceChildren(chip);
    } else {
      const val = (item.len != null && item.len !== '') ? String(item.len) : '0';
      right.replaceChildren(el('div', { className: 'len-locked' }, `${val} ft`));
    }
    handle.style.display = 'none';
  }

  return row;
}

function getDragAfterElement(container, y){
  const els = [...container.querySelectorAll('.item-row:not(.dragging)')];
  return els.reduce((closest, child)=>{
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height/2;
    if (offset < 0 && offset > closest.offset) {
      return { offset, element: child };
    } else {
      return closest;
    }
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* Add Item menu (simple native prompt-style selection) */
function showAddItemMenu(btn, folder){
  if (uiLocked) return;
  const choice = window.prompt('Add item type: qty, status, length', 'qty');
  if (!choice) return;
  const type = choice.trim().toLowerCase();
  const items = deepClone(folder.items || []);
  if (type === 'status'){
    items.push({ type:'status', name:'', status:'' });
  } else if (type === 'length'){
    items.push({ type:'length', name:'', len:0 });
  } else {
    items.push({ type:'qty', name:'', qty:0 });
  }
  updateDoc(doc(foldersCol, folder.id), { items })
    .then(init);
}

/* Status selection UI */
function showStatusMenu(anchorBtn, folder, index){
  if (uiLocked) return;

  const menu = el('div', { className: 'menu status-menu', role:'menu' });
  const opts = [
    {v:'',      label:'—'},
    {v:'empty', label:'Empty'},
    {v:'refill',label:'Refill'},
    {v:'good',  label:'Good'},
    {v:'filled',label:'Filled'}
  ];
  opts.forEach(opt=>{
    const o = el('button', { type:'button', className:'menu-item' }, opt.label);
    o.addEventListener('click', ()=>{
      const items = deepClone(folder.items || []);
      items[index].status = opt.v;
      scheduleSave(folder.id, { items }, 10);
      applyStatusUI(anchorBtn, opt.v);
      document.body.removeChild(menu);
    });
    menu.appendChild(o);
  });

  // position near the button
  const r = anchorBtn.getBoundingClientRect();
  menu.style.position = 'absolute';
  menu.style.top  = `${window.scrollY + r.bottom + 6}px`;
  menu.style.left = `${window.scrollX + r.left}px`;
  menu.style.zIndex = '9999';
  document.body.appendChild(menu);

  const onDoc = (ev)=>{
    if (!menu.contains(ev.target)) {
      document.body.removeChild(menu);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
    }
  };
  document.addEventListener('mousedown', onDoc);
  document.addEventListener('touchstart', onDoc);
}

/* 9) Toolbar actions */
if (btnToggle){
  btnToggle.addEventListener('click', async ()=>{
    uiLocked = !uiLocked;           // toggle
    const data = await loadAll();   // reload view fresh
    render(data);
  });
}
if (btnAddFolder){
  btnAddFolder.addEventListener('click', async ()=>{
    const name = prompt('Folder name?', 'New Folder');
    if (!name) return;
    await createFolder(name.trim());
    await init();
  });
}
if (btnDownload){
  btnDownload.addEventListener('click', async ()=>{
    const data = await loadAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = PAGE_KEY + '.json';
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(a.href);
    document.body.removeChild(a);
  });
}

/* 10) Boot */
async function init(){
  const data = await loadAll();
  render(data);
}
init();
