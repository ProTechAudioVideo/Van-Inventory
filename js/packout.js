// js/packout.js
// Firestore-backed packout page (no auth, no expiry)

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* ──────────────────────────────────────────────────────────────────
   1) Firebase config  (PROJECT: protech-van-inventory-2025)
   ────────────────────────────────────────────────────────────────── */
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.firebasestorage.app",
  messagingSenderId: "86651643634",
  appId: "1:86651643634:web:6891641e14e8214a34526b",
  measurementId: "G-Z7XRSJ486Q"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ──────────────────────────────────────────────────────────────────
   2) Page wiring
   ────────────────────────────────────────────────────────────────── */
const addFolderBtn   = document.getElementById('add-folder');
const downloadBtn    = document.getElementById('download-json');
const container      = document.getElementById('packout-container'); // required
const pageKey        = (document.title || 'packout')
  .toLowerCase().replace(/\s+/g, '-');   // "Packout 1" -> "packout-1"

const colRef = collection(db, pageKey);  // one collection per page

function slugify(s) {
  const base = (s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return base || ('folder-' + Date.now());
}

/* ──────────────────────────────────────────────────────────────────
   3) Firestore helpers
   ────────────────────────────────────────────────────────────────── */
async function loadAll() {
  const out = {}; // { id: {name, items:[{name, qty}] } }
  const snap = await getDocs(colRef);
  snap.forEach(d => { out[d.id] = d.data(); });
  return out;
}

async function createFolder(displayName) {
  const id = slugify(displayName);
  await setDoc(doc(colRef, id), { name: displayName, items: [] }, { merge: false });
  return id;
}

async function saveItems(folderId, items) {
  await updateDoc(doc(colRef, folderId), { items });
}

async function removeFolder(folderId) {
  await deleteDoc(doc(colRef, folderId));
}

/* ──────────────────────────────────────────────────────────────────
   4) UI rendering
   ────────────────────────────────────────────────────────────────── */
function render(data) {
  container.innerHTML = '';

  Object.entries(data).forEach(([folderId, folder]) => {
    // Folder header
    const header = document.createElement('div');
    header.className = 'folder';

    const title = document.createElement('span');
    title.className = 'folder-title';
    title.textContent = folder.name || '(untitled)';
    header.appendChild(title);

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = '+';
    addItemBtn.title = 'Add item';
    addItemBtn.className = 'folder-add';
    header.appendChild(addItemBtn);

    const delFolderBtn = document.createElement('button');
    delFolderBtn.textContent = '🗑️';
    delFolderBtn.className = 'folder-remove';
    header.appendChild(delFolderBtn);

    container.appendChild(header);

    // Items list
    const list = document.createElement('div');
    list.className = 'folder-items';
    container.appendChild(list);

    const items = Array.isArray(folder.items) ? folder.items.slice() : [];

    function pushRow(item, index) {
      const row = document.createElement('div');
      row.className = 'row';

      // delete item
      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        items.splice(index, 1);
        await saveItems(folderId, items);
        init(); // re-render
      });
      row.appendChild(delBtn);

      // name
      const nameI = document.createElement('input');
      nameI.type = 'text';
      nameI.placeholder = 'Item name';
      nameI.value = item.name || '';
      nameI.onchange = async () => {
        items[index].name = nameI.value;
        await saveItems(folderId, items);
      };
      row.appendChild(nameI);

      // minus
      const minus = document.createElement('button');
      minus.textContent = '–';
      minus.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        const v = Math.max(0, (items[index].qty || 0) - 1);
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });
      row.appendChild(minus);

      // qty
      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = 0;
      qty.value = item.qty || 0;
      qty.onchange = async () => {
        items[index].qty = parseInt(qty.value, 10) || 0;
        await saveItems(folderId, items);
      };
      row.appendChild(qty);

      // plus
      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.addEventListener('pointerdown', async (e) => {
        e.preventDefault();
        const v = (items[index].qty || 0) + 1;
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });
      row.appendChild(plus);

      list.appendChild(row);
    }

    items.forEach((it, idx) => pushRow(it, idx));

    // add new item
    addItemBtn.onclick = async () => {
      items.push({ name: '', qty: 0 });
      await saveItems(folderId, items);
      init();
    };

    // delete folder
    delFolderBtn.onclick = async () => {
      const ok = confirm(`Delete folder “${folder.name}” and all its items?`);
      if (!ok) return;
      try {
        await removeFolder(folderId);
        init();
      } catch (err) {
        console.error('Delete folder failed:', err);
        alert('Could not delete folder (see console for details).');
      }
    };
  });
}

/* ──────────────────────────────────────────────────────────────────
   5) Buttons
   ────────────────────────────────────────────────────────────────── */
addFolderBtn.onclick = async () => {
  const name = prompt('New folder name:');
  if (!name) return;
  try {
    await createFolder(name);
    init();
  } catch (err) {
    console.error('Create folder failed:', err);
    alert('Could not create folder (see console for details).');
  }
};

if (downloadBtn) {
  downloadBtn.onclick = async () => {
    const data = await loadAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${pageKey}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
}

/* ──────────────────────────────────────────────────────────────────
   6) Boot
   ────────────────────────────────────────────────────────────────── */
async function init() {
  try {
    const data = await loadAll();
    render(data);
  } catch (err) {
    console.error('Firestore load error:', err);
    // Keep the UI usable; just show a friendly message instead of a blocking alert
    container.innerHTML = '<p style="color:#900">Could not load data. Check Firestore config/rules (see console).</p>';
  }
}

init();
