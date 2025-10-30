// js/packout.js
// Firestore-backed “Packout” pages (no framework). One collection per page.
// Robust to either #packout-container or #page-container IDs and to either
// <body data-packout="packout-1"> or <title>Packout 1</title>.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

/* 1) Firebase config (project: protech-van-inventory-2025)
   NOTE: Web config is not a secret. Security is enforced by Firestore rules.
*/
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  // Storage isn't used here, but this is the canonical bucket format:
  storageBucket: "protech-van-inventory-2025.appspot.com",
  appId: "1:818777808639:web:demo"
};

/* 2) Page wiring & collection selection */
const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

const addFolderBtn = document.getElementById('add-folder');
const downloadBtn  = document.getElementById('download-json');

// Accept either id to avoid null errors
const container =
  document.getElementById('packout-container') ||
  document.getElementById('page-container');

if (!container) {
  throw new Error('Missing container: add <div id="packout-container"></div> (or id="page-container").');
}

// derive a collection key: prefer data-packout, fall back to the title
const pageKey = (document.body?.dataset?.packout) ||
  (document.title || 'packout').toLowerCase().replace(/\s+/g, '-');

// one collection per page, e.g., “packout-1”
const colRef = collection(db, pageKey);

// helpers
const slugify = (s) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || ('folder-' + Date.now());

/* 3) Firestore helpers */
async function loadAll() {
  const out = {};
  const snap = await getDocs(colRef);
  snap.forEach(d => (out[d.id] = d.data()));
  return out;
}

async function ensureFolder(id, data) {
  await setDoc(doc(colRef, id), data, { merge: true });
}

async function saveItems(folderId, items) {
  await updateDoc(doc(colRef, folderId), { items });
}

async function deleteFolder(folderId) {
  await deleteDoc(doc(colRef, folderId));
}

/* 4) UI render */
function render(data) {
  container.innerHTML = '';

  Object.entries(data).forEach(([folderId, folder]) => {
    // header
    const header = document.createElement('div');
    header.className = 'folder';

    const title = document.createElement('span');
    title.className = 'folder-title';
    title.textContent = folder.name || '(untitled)';
    header.appendChild(title);

    const addItemBtn = document.createElement('button');
    addItemBtn.textContent = '+';
    addItemBtn.title = 'Add item';
    addItemBtn.addEventListener('click', async () => {
      const items = Array.isArray(folder.items) ? folder.items.slice() : [];
      items.push({ name: '', qty: 0 });
      await saveItems(folderId, items);
      await init();
    });
    header.appendChild(addItemBtn);

    const delFolderBtn = document.createElement('button');
    delFolderBtn.textContent = 'Delete';
    delFolderBtn.className = 'delete-btn';
    delFolderBtn.addEventListener('click', async () => {
      if (confirm('Delete this folder and all its items?')) {
        await deleteFolder(folderId);
        await init();
      }
    });
    header.appendChild(delFolderBtn);

    container.appendChild(header);

    // items list
    const list = document.createElement('div');
    list.className = 'folder-items';
    container.appendChild(list);

    const items = Array.isArray(folder.items) ? folder.items.slice() : [];

    const pushRow = (item, index) => {
      const row = document.createElement('div');
      row.className = 'row';

      const delBtn = document.createElement('button');
      delBtn.textContent = '🗑️';
      delBtn.className = 'delete-btn';
      delBtn.addEventListener('click', async () => {
        items.splice(index, 1);
        await saveItems(folderId, items);
        await init();
      });
      row.appendChild(delBtn);

      const nameI = document.createElement('input');
      nameI.type = 'text';
      nameI.placeholder = 'Item name';
      nameI.value = item.name || '';
      nameI.addEventListener('change', async () => {
        items[index].name = nameI.value;
        await saveItems(folderId, items);
      });
      row.appendChild(nameI);

      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.addEventListener('click', async (e) => {
        e.preventDefault();
        const v = Math.max(0, (items[index].qty || 0) - 1);
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });
      row.appendChild(minus);

      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '0';
      qty.value = item.qty || 0;
      qty.addEventListener('change', async () => {
        items[index].qty = Math.max(0, parseInt(qty.value || '0', 10));
        qty.value = items[index].qty;
        await saveItems(folderId, items);
      });
      row.appendChild(qty);

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.addEventListener('click', async (e) => {
        e.preventDefault();
        const v = (items[index].qty || 0) + 1;
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });
      row.appendChild(plus);

      list.appendChild(row);
    };

    items.forEach(pushRow);
  });
}

/* 5) Controls */
addFolderBtn?.addEventListener('click', async () => {
  const name = prompt('Folder name?');
  if (!name) return;
  const id = slugify(name);
  await ensureFolder(id, { name, items: [] });
  await init();
});

downloadBtn?.addEventListener('click', async () => {
  const data = await loadAll();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${pageKey}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

/* 6) Boot */
async function init() {
  try {
    const data = await loadAll();
    render(data);
  } catch (err) {
    console.error('Firestore load error:', err);
    container.innerHTML = '<p style="color:#900">Could not load data. Verify Firebase config and Firestore rules.</p>';
  }
}
init();
