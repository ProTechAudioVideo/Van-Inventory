// js/packout.js
// Firestore-backed Packout pages with expand/collapse per folder.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-app.js';
import {
  getFirestore, collection, doc, getDocs, setDoc, updateDoc, deleteDoc
} from 'https://www.gstatic.com/firebasejs/10.12.3/firebase-firestore.js';

/* 1) Firebase config — project: protech-van-inventory-2025
   (Web config is not a secret; rules protect your data.) */
const firebaseConfig = {
  apiKey: "AIzaSyDRMRiSsu0icqeWuxqaWXs-Ps2-3jS_DOg",
  authDomain: "protech-van-inventory-2025.firebaseapp.com",
  projectId: "protech-van-inventory-2025",
  storageBucket: "protech-van-inventory-2025.appspot.com",
  appId: "1:818777808639:web:demo" // non-sensitive placeholder
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// DOM
const addFolderBtn = document.getElementById('add-folder');
const downloadBtn  = document.getElementById('download-json');
const container =
  document.getElementById('packout-container') ||
  document.getElementById('page-container');

if (!container) {
  throw new Error('Missing container: include <div id="packout-container"></div> or id="page-container".');
}

// derive a collection key for this page
const pageKey = (document.body?.dataset?.packout) ||
  (document.title || 'packout').toLowerCase().replace(/\s+/g, '-');

const colRef = collection(db, pageKey);

// collapse state (local only)
const collapseKey = (id) => `packout:${pageKey}:collapsed:${id}`;
const getCollapsed = (id) => localStorage.getItem(collapseKey(id)) === '1';
const setCollapsed = (id, val) => {
  if (val) localStorage.setItem(collapseKey(id), '1');
  else localStorage.removeItem(collapseKey(id));
};

// helpers
const slugify = (s) => (s || '')
  .toLowerCase().trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '') || ('folder-' + Date.now());

async function loadAll() {
  const out = {};
  const snap = await getDocs(colRef);
  snap.forEach(d => out[d.id] = d.data());
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

// render
function render(data) {
  container.innerHTML = '';

  Object.entries(data).forEach(([folderId, folder]) => {
    const isCollapsed = getCollapsed(folderId);

    const header = document.createElement('div');
    header.className = 'folder' + (isCollapsed ? ' collapsed' : '');

    const caret = document.createElement('button');
    caret.className = 'caret';
    caret.setAttribute('aria-label', isCollapsed ? 'Expand folder' : 'Collapse folder');
    caret.setAttribute('aria-expanded', (!isCollapsed).toString());
    caret.textContent = isCollapsed ? '▸' : '▾';
    header.appendChild(caret);

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

    const list = document.createElement('div');
    list.className = 'folder-items';
    list.style.display = isCollapsed ? 'none' : '';
    container.appendChild(list);

    // toggle behavior on caret or title click
    function toggle() {
      const newCollapsed = list.style.display !== 'none' ? true : false;
      list.style.display = newCollapsed ? 'none' : '';
      header.classList.toggle('collapsed', newCollapsed);
      caret.textContent = newCollapsed ? '▸' : '▾';
      caret.setAttribute('aria-label', newCollapsed ? 'Expand folder' : 'Collapse folder');
      caret.setAttribute('aria-expanded', (!newCollapsed).toString());
      setCollapsed(folderId, newCollapsed);
    }
    caret.addEventListener('click', toggle);
    title.addEventListener('click', toggle);

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

      const qty = document.createElement('input');
      qty.type = 'number';
      qty.min = '0';
      qty.value = item.qty || 0;
      qty.addEventListener('change', async () => {
        items[index].qty = Math.max(0, parseInt(qty.value || '0', 10));
        qty.value = items[index].qty;
        await saveItems(folderId, items);
      });

      const minus = document.createElement('button');
      minus.textContent = '−';
      minus.addEventListener('click', async (e) => {
        e.preventDefault();
        const v = Math.max(0, (items[index].qty || 0) - 1);
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });

      const plus = document.createElement('button');
      plus.textContent = '+';
      plus.addEventListener('click', async (e) => {
        e.preventDefault();
        const v = (items[index].qty || 0) + 1;
        items[index].qty = v;
        qty.value = v;
        await saveItems(folderId, items);
      });

      row.appendChild(minus);
      row.appendChild(qty);
      row.appendChild(plus);

      list.appendChild(row);
    };

    items.forEach(pushRow);
  });
}

// controls
addFolderBtn?.addEventListener('click', async () => {
  const name = prompt('Folder name?');
  if (!name) return;
  const id = slugify(name);
  await ensureFolder(id, { name, items: [] });
  setCollapsed(id, false); // expanded by default
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

// boot
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
